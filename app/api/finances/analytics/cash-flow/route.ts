import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { FINANCIAL_TRANSFER_METHOD } from "@/lib/finances";
import { getOrganizationAccountBalances, getOrganizationCashBalancesAt } from "@/lib/finances/analytics/balances";
import { BURN_WINDOW_MONTHS, buildDailyCashProjection, computeBurnAndRunway, type TProjectedCashFlow } from "@/lib/finances/analytics/cash";
import { getRecurringMonthlyCommitmentsForOrganization } from "@/lib/finances/analytics/commitments";
import { getTransactionForecastDate } from "@/lib/finances/generate-recurring-accounting-entries";
import { getRecurringOccurrencesUntil } from "@/lib/finances/recurrence";
import { formatAsNumber } from "@/lib/formatting";
import { canViewFinances } from "@/lib/permissions/finances";
import { db } from "@/services/drizzle";
import { financialAccounts, financialRecurringRules, financialTransactions } from "@/services/drizzle/schema";
import { inOperationTimezone, OPERATION_TIMEZONE } from "@/lib/operation-timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const GetFinancesCashFlowInputSchema = z.object({
	horizonDays: z
		.string({ invalid_type_error: "Tipo inválido para o horizonte de projeção." })
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : 90))
		.pipe(
			z
				.number({ invalid_type_error: "Tipo inválido para o horizonte de projeção." })
				.int({ message: "O horizonte de projeção deve ser um número inteiro de dias." })
				.min(7, { message: "O horizonte mínimo de projeção é de 7 dias." })
				.max(180, { message: "O horizonte máximo de projeção é de 180 dias." }),
		),
});
export type TGetFinancesCashFlowInput = z.infer<typeof GetFinancesCashFlowInputSchema>;

async function getFinancesCashFlow({ input, session }: { input: TGetFinancesCashFlowInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { horizonDays } = input;
	const today = dayjs().tz(OPERATION_TIMEZONE).startOf("day");
	const horizonEnd = today.add(horizonDays, "day").endOf("day");

	// Janela dobrada: os 3 meses fechados do burn + os 3 anteriores, base de comparação da geração média.
	const burnWindowStart = today
		.subtract(BURN_WINDOW_MONTHS * 2, "month")
		.startOf("month")
		.toDate();
	const currentMonthStart = today.startOf("month").toDate();

	const [balances, monthlyFlowRows, recurringCommitments, pendingTransactions, activeRules] = await Promise.all([
		getOrganizationAccountBalances({ organizationId }),
		db
			.select({
				mes: sql<string>`to_char(date_trunc('month', ${inOperationTimezone(financialTransactions.dataEfetivacao)}), 'YYYY-MM')`,
				entradas: sql<number>`COALESCE(SUM(CASE WHEN ${financialTransactions.tipo} = 'ENTRADA' THEN ${financialTransactions.valor} ELSE 0 END), 0)`,
				saidas: sql<number>`COALESCE(SUM(CASE WHEN ${financialTransactions.tipo} = 'SAIDA' THEN ${financialTransactions.valor} ELSE 0 END), 0)`,
			})
			.from(financialTransactions)
			.where(
				and(
					eq(financialTransactions.organizacaoId, organizationId),
					// Transferências zeram no líquido, mas inflariam entradas/saídas mensais
					ne(financialTransactions.metodo, FINANCIAL_TRANSFER_METHOD),
					gte(financialTransactions.dataEfetivacao, burnWindowStart),
					lt(financialTransactions.dataEfetivacao, currentMonthStart),
				),
			)
			.groupBy(sql`date_trunc('month', ${inOperationTimezone(financialTransactions.dataEfetivacao)})`)
			.orderBy(sql`date_trunc('month', ${inOperationTimezone(financialTransactions.dataEfetivacao)})`),
		getRecurringMonthlyCommitmentsForOrganization(organizationId),
		db
			.select({
				tipo: financialTransactions.tipo,
				titulo: financialTransactions.titulo,
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
					lte(financialTransactions.dataPrevisao, horizonEnd.toDate()),
				),
			),
		db.query.financialRecurringRules.findMany({
			where: and(eq(financialRecurringRules.organizacaoId, organizationId), eq(financialRecurringRules.status, "ATIVA")),
		}),
	]);

	// Meses sem movimento entram zerados: a série precisa de 6 pontos contíguos.
	const flowsByMonth = new Map(monthlyFlowRows.map((row) => [row.mes, row]));
	const fluxosMensaisHistorico = Array.from({ length: BURN_WINDOW_MONTHS * 2 }, (_, index) => {
		const mes = today.subtract(BURN_WINDOW_MONTHS * 2 - index, "month").format("YYYY-MM");
		const row = flowsByMonth.get(mes);
		const entradas = formatAsNumber(row?.entradas ?? 0);
		const saidas = formatAsNumber(row?.saidas ?? 0);
		return { mes, entradas, saidas, liquido: entradas - saidas };
	});
	const fluxosMensais = fluxosMensaisHistorico.slice(BURN_WINDOW_MONTHS);
	const burn = computeBurnAndRunway({ fluxosMensais, totalCaixa: balances.totalCaixa });
	const burnAnterior = computeBurnAndRunway({ fluxosMensais: fluxosMensaisHistorico.slice(0, BURN_WINDOW_MONTHS), totalCaixa: balances.totalCaixa });

	// Saldo consolidado no fim de cada um dos últimos 30 dias e hoje, reconstruído a partir do saldo atual.
	const saldoConsolidadoDiario = await getOrganizationCashBalancesAt({
		organizationId,
		totalCaixa: balances.totalCaixa,
		// 31 pontos: o primeiro é exatamente "há 30 dias", base da comparação do KPI.
		dates: Array.from({ length: 31 }, (_, index) =>
			today
				.subtract(30 - index, "day")
				.endOf("day")
				.toDate(),
		),
	});

	// Fonte 2 da projeção: ocorrências de regras recorrentes ainda não materializadas.
	// proximaGeracaoEm é a primeira ocorrência NÃO gerada; expandir a partir dela não duplica as pendentes.
	const templateAccountIds = [
		...new Set(activeRules.flatMap((rule) => rule.templateTransacoes.map((template) => template.contaFinanceiraId)).filter((id): id is string => !!id)),
	];
	const templateAccounts =
		templateAccountIds.length > 0
			? await db.query.financialAccounts.findMany({
					where: and(eq(financialAccounts.organizacaoId, organizationId), inArray(financialAccounts.id, templateAccountIds)),
					columns: { id: true, tipo: true, configuracao: true },
				})
			: [];
	const templateAccountsMap = new Map(templateAccounts.map((account) => [account.id, account]));

	const projectedRecurringFlows: TProjectedCashFlow[] = [];
	for (const rule of activeRules) {
		const firstNonGenerated = rule.proximaGeracaoEm ?? rule.config.inicio;
		if (!firstNonGenerated || dayjs(firstNonGenerated).isAfter(horizonEnd)) continue;

		const occurrenceDates = getRecurringOccurrencesUntil(rule.config, firstNonGenerated, horizonEnd.toDate());
		for (const occurrenceDate of occurrenceDates) {
			for (const template of rule.templateTransacoes) {
				const account = template.contaFinanceiraId ? templateAccountsMap.get(template.contaFinanceiraId) : undefined;
				const dataPrevisao = getTransactionForecastDate({ occurrenceDate, template, account });
				if (dayjs(dataPrevisao).isAfter(horizonEnd)) continue;
				projectedRecurringFlows.push({ tipo: template.tipo, valor: formatAsNumber(template.valor), dataPrevisao });
			}
		}
	}

	const pendingFlows: TProjectedCashFlow[] = pendingTransactions
		.filter((transaction) => !!transaction.dataPrevisao)
		.map((transaction) => ({ tipo: transaction.tipo, valor: formatAsNumber(transaction.valor), dataPrevisao: transaction.dataPrevisao as Date }));

	// Maiores saídas pendentes no horizonte, em ordem de data. Ocorrências recorrentes ainda não
	// materializadas ficam de fora: sem título/conta próprios, não identificam um compromisso.
	const maioresSaidas = pendingTransactions
		.filter((transaction) => transaction.tipo === "SAIDA" && !!transaction.dataPrevisao && !dayjs(transaction.dataPrevisao).isBefore(today))
		.map((transaction) => ({
			titulo: transaction.titulo,
			valor: formatAsNumber(transaction.valor),
			dataPrevisao: transaction.dataPrevisao as Date,
			contaFinanceira: transaction.contaFinanceira,
		}))
		.sort((a, b) => b.valor - a.valor)
		.slice(0, 6)
		.sort((a, b) => a.dataPrevisao.getTime() - b.dataPrevisao.getTime());

	const projection = buildDailyCashProjection({
		horizonDays,
		saldoInicial: balances.totalCaixa,
		flows: [...pendingFlows, ...projectedRecurringFlows],
	});

	return {
		data: {
			visaoGeral: {
				totalCaixa: balances.totalCaixa,
				totalPassivos: balances.totalPassivos,
				posicaoLiquida: balances.posicaoLiquida,
				contas: balances.contas,
				fluxosMensais,
				fluxosMensaisHistorico,
				saldoConsolidadoDiario,
				mediaLiquidaMensal: burn.mediaLiquidaMensal,
				mediaLiquidaMensalAnterior: burnAnterior.mediaLiquidaMensal,
				queimaMensal: burn.queimaMensal,
				mesesDeCaixa: burn.mesesDeCaixa,
				recorrentesEntradaMensal: recurringCommitments.entradas,
				recorrentesSaidaMensal: recurringCommitments.saidas,
			},
			projecao: {
				horizonteDias: horizonDays,
				...projection,
				maioresSaidas,
			},
		},
		message: "Fluxo de caixa calculado com sucesso.",
	};
}
export type TGetFinancesCashFlowOutput = Awaited<ReturnType<typeof getFinancesCashFlow>>;

async function getFinancesCashFlowRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!canViewFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para acessar o módulo financeiro.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetFinancesCashFlowInputSchema.parse({
		horizonDays: searchParams.get("horizonDays") ?? null,
	});
	const result = await getFinancesCashFlow({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getFinancesCashFlowRoute });
