import { classifyDrawerMovement, DRAWER_BREAKDOWN_KEY, emptyDrawerBreakdown } from "@/lib/sales-sessions/drawer-movements";
import { db } from "@/services/drizzle";
import { accountingEntries, financialTransactions, salesSessions } from "@/services/drizzle/schema";
import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { TSalesResultsFilters } from "./universe";

/**
 * O que aconteceu na gaveta nos caixas abertos no período, fora das vendas: fundo de troco,
 * suprimentos, sangrias, despesas e estornos. O bloco de recebimentos mostra só vendas — o "Ficou"
 * do Dinheiro —, e sem isto quem compara com o fechamento do caixa vê dois números que não batem.
 *
 * A gaveta não tem vendedor nem canal: com esses filtros ligados o recorte não faz sentido e o
 * bloco não é calculado (null).
 */
export async function getSalesResultsCashDrawer({ filters }: { filters: TSalesResultsFilters }) {
	if (filters.sellersIds.length > 0 || filters.channels.length > 0) return null;

	const sessions = await db
		.select({
			id: salesSessions.id,
			status: salesSessions.status,
			dataAbertura: salesSessions.dataAbertura,
			saldoInicial: salesSessions.saldoInicial,
			diferencaTotal: salesSessions.diferencaTotal,
		})
		.from(salesSessions)
		.where(
			and(
				eq(salesSessions.organizacaoId, filters.organizacaoId),
				ne(salesSessions.status, "CANCELADA"),
				gte(salesSessions.dataAbertura, filters.after),
				lte(salesSessions.dataAbertura, filters.before),
			),
		)
		.orderBy(asc(salesSessions.dataAbertura));
	if (sessions.length === 0) return null;

	const rows = await db
		.select({
			tipo: financialTransactions.tipo,
			origemTipo: accountingEntries.origemTipo,
			origem: sql<string | null>`${financialTransactions.modificadoresMetadata} ->> 'origem'`,
			valor: sql<number>`coalesce(sum(${financialTransactions.valor}), 0)`,
		})
		.from(financialTransactions)
		.leftJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
		.where(
			and(
				eq(financialTransactions.organizacaoId, filters.organizacaoId),
				eq(financialTransactions.metodo, "DINHEIRO"),
				inArray(
					financialTransactions.sessaoVendaId,
					sessions.map((session) => session.id),
				),
			),
		)
		.groupBy(financialTransactions.tipo, accountingEntries.origemTipo, sql`${financialTransactions.modificadoresMetadata} ->> 'origem'`);

	const cents = emptyDrawerBreakdown();
	for (const row of rows) {
		const kind = classifyDrawerMovement({ tipo: row.tipo, origemTipo: row.origemTipo, modificadoresMetadata: { origem: row.origem } });
		cents[DRAWER_BREAKDOWN_KEY[kind]] += Math.round(Number(row.valor) * 100);
	}
	const toMoney = (value: number) => value / 100;

	return {
		sessoes: sessions.map((session) => ({
			id: session.id,
			status: session.status,
			dataAbertura: session.dataAbertura,
			diferencaTotal: session.diferencaTotal,
		})),
		fundoTroco: sessions.reduce((acc, session) => acc + Math.round(session.saldoInicial * 100), 0) / 100,
		suprimentos: toMoney(cents.suprimentos + cents.demaisEntradas),
		sangrias: toMoney(cents.sangrias),
		despesas: toMoney(cents.despesas),
		estornos: toMoney(cents.estornos + cents.demaisSaidas),
	};
}
export type TSalesResultsCashDrawer = Awaited<ReturnType<typeof getSalesResultsCashDrawer>>;
