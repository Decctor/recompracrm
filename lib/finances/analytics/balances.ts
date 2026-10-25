import dayjs from "dayjs";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { calculateFinancialAccountBalance, getFinancialAccountBalanceType } from "@/lib/finances/financial-account-configuration";
import { computeCashBalancesAt } from "@/lib/finances/analytics/cash";
import { formatAsNumber } from "@/lib/formatting";
import { db } from "@/services/drizzle";
import { financialAccounts, financialTransactions } from "@/services/drizzle/schema";
import { localDayKey } from "@/lib/operation-timezone";

/**
 * Saldos atuais das contas financeiras ativas, com a posição consolidada separando caixa e
 * passivos (cartões). `posicaoLiquida = totalCaixa − totalPassivos`. Transferências CONTAM aqui —
 * movem dinheiro real entre contas; só as métricas de fluxo as excluem.
 */
export async function getOrganizationAccountBalances({ organizationId }: { organizationId: string }) {
	const accounts = await db.query.financialAccounts.findMany({
		where: and(eq(financialAccounts.organizacaoId, organizationId), eq(financialAccounts.ativo, true)),
		columns: { id: true, nome: true, tipo: true, saldoInicial: true, dataSaldoInicial: true },
		orderBy: (fields, { asc }) => asc(fields.nome),
	});
	if (accounts.length === 0) return { totalCaixa: 0, totalPassivos: 0, posicaoLiquida: 0, contas: [] };

	const totalsRows = await db
		.select({
			contaFinanceiraId: financialTransactions.contaFinanceiraId,
			totalEntradas: sql<number>`COALESCE(SUM(CASE WHEN ${financialTransactions.tipo} = 'ENTRADA' THEN ${financialTransactions.valor} ELSE 0 END), 0)`,
			totalSaidas: sql<number>`COALESCE(SUM(CASE WHEN ${financialTransactions.tipo} = 'SAIDA' THEN ${financialTransactions.valor} ELSE 0 END), 0)`,
		})
		.from(financialTransactions)
		.innerJoin(financialAccounts, eq(financialTransactions.contaFinanceiraId, financialAccounts.id))
		.where(
			and(
				eq(financialTransactions.organizacaoId, organizationId),
				isNotNull(financialTransactions.dataEfetivacao),
				inArray(
					financialTransactions.contaFinanceiraId,
					accounts.map((account) => account.id),
				),
				// Saldo inicial já cobre o que veio antes da data de referência da conta.
				gte(financialTransactions.dataEfetivacao, financialAccounts.dataSaldoInicial),
			),
		)
		.groupBy(financialTransactions.contaFinanceiraId);

	const totalsByAccount = new Map(totalsRows.map((row) => [row.contaFinanceiraId, row]));

	let totalCaixa = 0;
	let totalPassivos = 0;
	const contas = accounts.map((account) => {
		const totals = totalsByAccount.get(account.id);
		const saldoAtual = calculateFinancialAccountBalance({
			tipo: account.tipo,
			saldoInicial: account.saldoInicial,
			totalEntradas: formatAsNumber(totals?.totalEntradas ?? 0),
			totalSaidas: formatAsNumber(totals?.totalSaidas ?? 0),
		});
		if (getFinancialAccountBalanceType(account.tipo) === "LIABILITY") totalPassivos += saldoAtual;
		else totalCaixa += saldoAtual;
		return { id: account.id, nome: account.nome, tipo: account.tipo, saldoAtual };
	});

	return { totalCaixa, totalPassivos, posicaoLiquida: totalCaixa - totalPassivos, contas };
}

/**
 * Saldo de caixa consolidado (contas ativas que não são passivo) em cada data de `dates`, a partir
 * do saldo atual. Transferências CONTAM, como no saldo: só a que sai para um passivo (pagamento de
 * fatura) muda o consolidado.
 */
export async function getOrganizationCashBalancesAt({
	organizationId,
	totalCaixa,
	dates,
}: {
	organizationId: string;
	totalCaixa: number;
	dates: Date[];
}) {
	if (dates.length === 0) return [];
	const accounts = (
		await db.query.financialAccounts.findMany({
			where: and(eq(financialAccounts.organizacaoId, organizationId), eq(financialAccounts.ativo, true)),
			columns: { id: true, tipo: true, saldoInicial: true, dataSaldoInicial: true },
		})
	).filter((account) => getFinancialAccountBalanceType(account.tipo) !== "LIABILITY");
	if (accounts.length === 0) return computeCashBalancesAt({ totalCaixa: 0, accounts: [], dailyFlows: [], dates });

	const earliest = dayjs(Math.min(...dates.map((date) => date.getTime()))).startOf("day");
	const dailyRows = await db
		.select({
			dia: localDayKey(financialTransactions.dataEfetivacao),
			liquido: sql<number>`COALESCE(SUM(CASE WHEN ${financialTransactions.tipo} = 'ENTRADA' THEN ${financialTransactions.valor} ELSE -${financialTransactions.valor} END), 0)`,
		})
		.from(financialTransactions)
		.innerJoin(financialAccounts, eq(financialTransactions.contaFinanceiraId, financialAccounts.id))
		.where(
			and(
				eq(financialTransactions.organizacaoId, organizationId),
				isNotNull(financialTransactions.dataEfetivacao),
				inArray(
					financialTransactions.contaFinanceiraId,
					accounts.map((account) => account.id),
				),
				// Mesmo recorte do saldo atual: o saldo inicial já cobre o que veio antes da data de referência.
				gte(financialTransactions.dataEfetivacao, financialAccounts.dataSaldoInicial),
				gte(financialTransactions.dataEfetivacao, earliest.toDate()),
			),
		)
		.groupBy(localDayKey(financialTransactions.dataEfetivacao));

	return computeCashBalancesAt({
		totalCaixa,
		accounts,
		dailyFlows: dailyRows.map((row) => ({ dia: row.dia, liquido: formatAsNumber(row.liquido) })),
		dates,
	});
}
