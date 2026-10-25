import dayjs from "dayjs";
import { and, count, eq, gt, gte, isNotNull, isNull, lt, lte, ne, or, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { FINANCIAL_TRANSFER_METHOD } from "@/lib/finances";
import { bucketPendingByDueDate, DELAY_WINDOW_DAYS } from "@/lib/finances/analytics/aging";
import { getOrganizationAccountBalances, getOrganizationCashBalancesAt } from "@/lib/finances/analytics/balances";
import { getRecurringMonthlyCommitmentsForOrganization } from "@/lib/finances/analytics/commitments";
import { formatAsNumber } from "@/lib/formatting";
import { canViewFinances } from "@/lib/permissions/finances";
import { db } from "@/services/drizzle";
import { financialAccounts, financialTransactions } from "@/services/drizzle/schema";

/** Semanas (seg–dom) exibidas no calendário de vencimentos. */
const CALENDAR_DAYS = 42;
/** Pontos mensais da série histórica de pendências e capital de giro. */
const HISTORY_MONTHS = 6;

const GetFinancesReceivablesPayablesInputSchema = z.object({
	periodAfter: z
		.string({ required_error: "Período não informado.", invalid_type_error: "Tipo inválido para período." })
		.datetime({ message: "Tipo inválido para período." })
		.transform((val) => new Date(val)),
	periodBefore: z
		.string({ required_error: "Período não informado.", invalid_type_error: "Tipo inválido para período." })
		.datetime({ message: "Tipo inválido para período." })
		.transform((val) => new Date(val)),
});
export type TGetFinancesReceivablesPayablesInput = z.infer<typeof GetFinancesReceivablesPayablesInputSchema>;

async function getFinancesReceivablesPayables({ input, session }: { input: TGetFinancesReceivablesPayablesInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const period = { after: input.periodAfter, before: input.periodBefore };
	const today = dayjs().startOf("day");
	const delayWindowStart = today.subtract(DELAY_WINDOW_DAYS, "day").toDate();
	// Calendário: 6 semanas (seg–dom) a partir da segunda-feira da semana atual.
	const calendarStart = today.subtract((today.day() + 6) % 7, "day");
	const calendarEnd = calendarStart.add(CALENDAR_DAYS - 1, "day").endOf("day");
	// Retratos passados das pendências: há 30 dias e o fim de cada um dos 5 meses anteriores
	// (o 6º ponto da série é o retrato atual).
	const snapshotDates = [
		today.subtract(30, "day").endOf("day"),
		...Array.from({ length: HISTORY_MONTHS - 1 }, (_, index) => today.subtract(HISTORY_MONTHS - 1 - index, "month").endOf("month")),
	].map((date) => date.toDate());
	const earliestSnapshot = new Date(Math.min(...snapshotDates.map((date) => date.getTime())));

	const [balances, pendingRows, delayRows, frictionRows, feesByMethodRows, recurringCommitments, inflowByMethodRows, calendarRows, snapshotRows] =
		await Promise.all([
		getOrganizationAccountBalances({ organizationId }),
		db
			.select({
				tipo: financialTransactions.tipo,
				valor: financialTransactions.valor,
				dataPrevisao: financialTransactions.dataPrevisao,
			})
			.from(financialTransactions)
			.where(and(eq(financialTransactions.organizacaoId, organizationId), isNull(financialTransactions.dataEfetivacao))),
		db
			.select({
				tipo: financialTransactions.tipo,
				avgDelayDays: sql<number>`AVG(EXTRACT(EPOCH FROM (${financialTransactions.dataEfetivacao} - ${financialTransactions.dataPrevisao})) / 86400)`,
				transactionsCount: sql<number>`COUNT(*)`,
			})
			.from(financialTransactions)
			.where(
				and(
					eq(financialTransactions.organizacaoId, organizationId),
					isNotNull(financialTransactions.dataEfetivacao),
					isNotNull(financialTransactions.dataPrevisao),
					// Transferências têm atraso zero por construção e diluiriam a média
					ne(financialTransactions.metodo, FINANCIAL_TRANSFER_METHOD),
					gte(financialTransactions.dataEfetivacao, delayWindowStart),
				),
			)
			.groupBy(financialTransactions.tipo),
		db
			.select({
				tipo: financialTransactions.tipo,
				juros: sum(financialTransactions.valorJuros),
				multas: sum(financialTransactions.valorMulta),
				descontos: sum(financialTransactions.valorDesconto),
				taxas: sum(financialTransactions.valorTaxas),
			})
			.from(financialTransactions)
			.where(
				and(
					eq(financialTransactions.organizacaoId, organizationId),
					isNotNull(financialTransactions.dataEfetivacao),
					gte(financialTransactions.dataEfetivacao, period.after),
					lte(financialTransactions.dataEfetivacao, period.before),
				),
			)
			.groupBy(financialTransactions.tipo),
		db
			.select({
				metodo: financialTransactions.metodo,
				taxas: sum(financialTransactions.valorTaxas),
			})
			.from(financialTransactions)
			.where(
				and(
					eq(financialTransactions.organizacaoId, organizationId),
					isNotNull(financialTransactions.dataEfetivacao),
					gte(financialTransactions.dataEfetivacao, period.after),
					lte(financialTransactions.dataEfetivacao, period.before),
					gt(financialTransactions.valorTaxas, 0),
				),
			)
			.groupBy(financialTransactions.metodo),
		getRecurringMonthlyCommitmentsForOrganization(organizationId),
		db
			.select({
				metodo: financialTransactions.metodo,
				volume: sum(financialTransactions.valor),
				taxas: sum(financialTransactions.valorTaxas),
				quantidade: count(),
			})
			.from(financialTransactions)
			.where(
				and(
					eq(financialTransactions.organizacaoId, organizationId),
					eq(financialTransactions.tipo, "ENTRADA"),
					ne(financialTransactions.metodo, FINANCIAL_TRANSFER_METHOD),
					isNotNull(financialTransactions.dataEfetivacao),
					gte(financialTransactions.dataEfetivacao, period.after),
					lte(financialTransactions.dataEfetivacao, period.before),
				),
			)
			.groupBy(financialTransactions.metodo),
		db
			.select({
				id: financialTransactions.id,
				titulo: financialTransactions.titulo,
				tipo: financialTransactions.tipo,
				valor: financialTransactions.valor,
				dataPrevisao: financialTransactions.dataPrevisao,
				contaFinanceira: financialAccounts.nome,
			})
			.from(financialTransactions)
			.leftJoin(financialAccounts, eq(financialTransactions.contaFinanceiraId, financialAccounts.id))
			.where(
				and(
					eq(financialTransactions.organizacaoId, organizationId),
					isNull(financialTransactions.dataEfetivacao),
					gte(financialTransactions.dataPrevisao, calendarStart.toDate()),
					lte(financialTransactions.dataPrevisao, calendarEnd.toDate()),
				),
			)
			.orderBy(financialTransactions.dataPrevisao),
		// Pendente em D = já lançada até D e não efetivada até D.
		db
			.select(
				Object.fromEntries(
					snapshotDates.flatMap((date, index) => {
						const pendingAt = sql`${financialTransactions.dataInsercao} <= ${date} AND (${financialTransactions.dataEfetivacao} IS NULL OR ${financialTransactions.dataEfetivacao} > ${date})`;
						return [
							[`receber${index}`, sql<number>`COALESCE(SUM(CASE WHEN ${pendingAt} AND ${financialTransactions.tipo} = 'ENTRADA' THEN ${financialTransactions.valor} ELSE 0 END), 0)`],
							[`pagar${index}`, sql<number>`COALESCE(SUM(CASE WHEN ${pendingAt} AND ${financialTransactions.tipo} = 'SAIDA' THEN ${financialTransactions.valor} ELSE 0 END), 0)`],
						];
					}),
				) as Record<string, ReturnType<typeof sql<number>>>,
			)
			.from(financialTransactions)
			.where(
				and(
					eq(financialTransactions.organizacaoId, organizationId),
					lt(financialTransactions.dataInsercao, today.toDate()),
					or(isNull(financialTransactions.dataEfetivacao), gt(financialTransactions.dataEfetivacao, earliestSnapshot)),
				),
			),
	]);

	const aging = bucketPendingByDueDate(
		pendingRows.map((row) => ({ tipo: row.tipo, valor: formatAsNumber(row.valor), dataPrevisao: row.dataPrevisao })),
	);

	// Atraso médio (efetivação − previsão): proxy de DSO/DPO
	const receiptDelayRow = delayRows.find((row) => row.tipo === "ENTRADA");
	const paymentDelayRow = delayRows.find((row) => row.tipo === "SAIDA");

	// Custo de fricção financeira no período
	const inflowFriction = frictionRows.find((row) => row.tipo === "ENTRADA");
	const outflowFriction = frictionRows.find((row) => row.tipo === "SAIDA");
	const jurosMultasPagos = formatAsNumber(outflowFriction?.juros || 0) + formatAsNumber(outflowFriction?.multas || 0);
	const jurosMultasRecebidos = formatAsNumber(inflowFriction?.juros || 0) + formatAsNumber(inflowFriction?.multas || 0);
	const descontosObtidos = formatAsNumber(outflowFriction?.descontos || 0);
	const descontosConcedidos = formatAsNumber(inflowFriction?.descontos || 0);
	const taxasTotal = formatAsNumber(inflowFriction?.taxas || 0) + formatAsNumber(outflowFriction?.taxas || 0);
	const taxasPorMetodo = feesByMethodRows.map((row) => ({ metodo: row.metodo, total: formatAsNumber(row.taxas) })).sort((a, b) => b.total - a.total);

	// Liquidez
	const totalCaixa = balances.totalCaixa;
	const capitalGiro = totalCaixa + aging.totalAReceber - aging.totalAPagar;
	const coberturaMeses = recurringCommitments.saidas > 0 ? totalCaixa / recurringCommitments.saidas : null;

	// Histórico: mesmos totais em cada retrato + o retrato atual no fim da série mensal.
	const snapshotCash = await getOrganizationCashBalancesAt({ organizationId, totalCaixa, dates: snapshotDates });
	const snapshotRow = snapshotRows[0] ?? {};
	const snapshots = snapshotDates.map((date, index) => {
		const aReceber = formatAsNumber(snapshotRow[`receber${index}`] ?? 0);
		const aPagar = formatAsNumber(snapshotRow[`pagar${index}`] ?? 0);
		const caixa = snapshotCash[index]?.saldo ?? 0;
		return { data: dayjs(date).format("YYYY-MM-DD"), aReceber, aPagar, capitalGiro: caixa + aReceber - aPagar };
	});
	const currentSnapshot = { data: today.format("YYYY-MM-DD"), aReceber: aging.totalAReceber, aPagar: aging.totalAPagar, capitalGiro };

	const meiosPagamento = inflowByMethodRows
		.map((row) => ({ metodo: row.metodo, volume: formatAsNumber(row.volume), taxas: formatAsNumber(row.taxas), quantidade: formatAsNumber(row.quantidade) }))
		.sort((a, b) => b.volume - a.volume);

	return {
		data: {
			periodo: { inicio: period.after, fim: period.before },
			vencimentos: aging.vencimentos,
			totalAReceber: aging.totalAReceber,
			totalAPagar: aging.totalAPagar,
			vencidoAReceber: aging.vencidoAReceber,
			vencidoAPagar: aging.vencidoAPagar,
			janelaAtrasoDias: DELAY_WINDOW_DAYS,
			atrasoMedioRecebimentoDias: receiptDelayRow ? formatAsNumber(receiptDelayRow.avgDelayDays) : null,
			atrasoMedioPagamentoDias: paymentDelayRow ? formatAsNumber(paymentDelayRow.avgDelayDays) : null,
			recebimentosNaJanela: formatAsNumber(receiptDelayRow?.transactionsCount || 0),
			pagamentosNaJanela: formatAsNumber(paymentDelayRow?.transactionsCount || 0),
			friccao: {
				jurosMultasPagos,
				jurosMultasRecebidos,
				descontosObtidos,
				descontosConcedidos,
				taxasTotal,
				taxasPorMetodo,
			},
			historico: {
				ha30Dias: snapshots[0] ?? currentSnapshot,
				mensal: [...snapshots.slice(1), currentSnapshot],
			},
			meiosPagamento,
			entradasPeriodo: meiosPagamento.reduce((total, method) => total + method.volume, 0),
			calendario: {
				inicio: calendarStart.format("YYYY-MM-DD"),
				dias: CALENDAR_DAYS,
				itens: calendarRows.map((row) => ({ ...row, valor: formatAsNumber(row.valor) })),
			},
			liquidez: {
				totalCaixa,
				capitalGiro,
				coberturaMeses,
				despesasRecorrentesMensais: recurringCommitments.saidas,
			},
		},
		message: "Recebíveis e pagáveis calculados com sucesso.",
	};
}
export type TGetFinancesReceivablesPayablesOutput = Awaited<ReturnType<typeof getFinancesReceivablesPayables>>;

async function getFinancesReceivablesPayablesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!canViewFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para acessar o módulo financeiro.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetFinancesReceivablesPayablesInputSchema.parse({
		periodAfter: searchParams.get("periodAfter") ?? null,
		periodBefore: searchParams.get("periodBefore") ?? null,
	});
	const result = await getFinancesReceivablesPayables({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getFinancesReceivablesPayablesRoute });
