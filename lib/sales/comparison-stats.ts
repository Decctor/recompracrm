import { localDayKey } from "@/lib/operation-timezone";
import { buildSalesStatsConditions, withinPeriod, type TSalesStatsFilters } from "@/lib/sales/stats-conditions";
import { db } from "@/services/drizzle";
import { clients, products, saleItems, sales, sellers } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, countDistinct, eq, exists, gte, isNull, lt, lte, sql, sum } from "drizzle-orm";

/**
 * Comparativo de dois períodos de vendas, só com agregações SQL.
 *
 * A versão anterior carregava toda venda dos dois períodos (com itens e produtos) para somar em
 * JavaScript, agrupava produto por nome e só rankeava o que aparecia no primeiro período. Aqui
 * cada número sai de um `count`/`sum` no banco, produto e vendedor são agrupados por id, e um
 * ranking lista quem aparece em qualquer um dos dois lados.
 *
 * `base` é o período que o usuário está olhando; `comparacao` é a referência. Toda métrica vem
 * nos dois, lado a lado, para que o cliente calcule a variação como quiser.
 */

export type TComparisonPeriod = { after: Date; before: Date };

type TPeriodPair<T> = { base: T; comparacao: T };

type TSalesTotals = {
	faturamento: number;
	custo: number;
	qtdeVendas: number;
	qtdeItensVendidos: number;
	dias: number;
	faturamentoClientesRecorrentes: number;
	faturamentoNovosClientes: number;
	faturamentoNaoIdentificados: number;
};

/** Posições são 1-based dentro do próprio período; `null` quando não houve venda nele. */
type TRankingSide = { qtde: number; total: number; posicaoPorValor: number | null; posicaoPorQtde: number | null };

export type TComparisonRankingRow = {
	id: string;
	titulo: string;
	avatarUrl: string | null;
	base: TRankingSide;
	comparacao: TRankingSide;
	/** Posições subidas (positivo) ou descidas (negativo) frente ao período de comparação; `null` quando faltou num dos lados. */
	variacaoPosicaoPorValor: number | null;
	variacaoPosicaoPorQtde: number | null;
};

export type TSalesComparisonStats = {
	periodos: TPeriodPair<{ after: string; before: string; dias: number }>;
	faturamento: TPeriodPair<number>;
	/** Só quando o membro pode ver dados sensíveis; o custo não sai do servidor de outro jeito. */
	margemBruta: TPeriodPair<number> | null;
	qtdeVendas: TPeriodPair<number>;
	ticketMedio: TPeriodPair<number>;
	qtdeItensVendidos: TPeriodPair<number>;
	itensPorVendaMedio: TPeriodPair<number>;
	valorDiarioMedio: TPeriodPair<number>;
	faturamentoClientesRecorrentes: TPeriodPair<number>;
	faturamentoNovosClientes: TPeriodPair<number>;
	faturamentoNaoIdentificados: TPeriodPair<number>;
	/** Um ponto por dia de cada período, alinhado pela posição (1º dia com 1º dia), para sobrepor no gráfico. */
	serie: {
		dia: number;
		base: { data: string; qtde: number; total: number } | null;
		comparacao: { data: string; qtde: number; total: number } | null;
	}[];
	porVendedor: TComparisonRankingRow[];
	porProduto: TComparisonRankingRow[];
	porCanal: TComparisonRankingRow[];
};

const RANKING_LIMIT = 25;
// Literal cru, nunca parâmetro: a expressão precisa render texto idêntico no SELECT e no GROUP BY
// (ver `inOperationTimezone`). O valor é constante do módulo, não entrada de usuário.
const UNNAMED_CHANNEL_LITERAL = sql.raw("'SEM CANAL'");

function toNumber(value: unknown) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function countDays(period: TComparisonPeriod) {
	return Math.max(dayjs(period.before).startOf("day").diff(dayjs(period.after).startOf("day"), "day") + 1, 1);
}

async function getPeriodTotals({
	organizacaoId,
	conditions,
	period,
}: {
	organizacaoId: string;
	conditions: ReturnType<typeof buildSalesStatsConditions>;
	period: TComparisonPeriod;
}) {
	const where = and(...conditions, ...withinPeriod(period));

	const [totalsRow, itemsRow, recurrentRow, newRow, unidentifiedRow] = await Promise.all([
		db
			.select({ qtde: count(sales.id), faturamento: sum(sales.valorTotal), custo: sum(sales.custoTotal) })
			.from(sales)
			.where(where)
			.then((rows) => rows[0]),
		db
			.select({ total: sum(saleItems.quantidade) })
			.from(saleItems)
			.where(
				and(
					eq(saleItems.organizacaoId, organizacaoId),
					exists(
						db
							.select({ id: sales.id })
							.from(sales)
							.where(and(eq(sales.id, saleItems.vendaId), where)),
					),
				),
			)
			.then((rows) => rows[0]),
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.innerJoin(clients, eq(sales.clienteId, clients.id))
			.where(and(where, eq(clients.organizacaoId, organizacaoId), lt(clients.primeiraCompraData, period.after)))
			.then((rows) => rows[0]),
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.innerJoin(clients, eq(sales.clienteId, clients.id))
			.where(
				and(
					where,
					eq(clients.organizacaoId, organizacaoId),
					gte(clients.primeiraCompraData, period.after),
					lte(clients.primeiraCompraData, period.before),
				),
			)
			.then((rows) => rows[0]),
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.leftJoin(clients, eq(sales.clienteId, clients.id))
			.where(and(where, isNull(clients.id)))
			.then((rows) => rows[0]),
	]);

	const totals: TSalesTotals = {
		faturamento: toNumber(totalsRow?.faturamento),
		custo: toNumber(totalsRow?.custo),
		qtdeVendas: toNumber(totalsRow?.qtde),
		qtdeItensVendidos: toNumber(itemsRow?.total),
		dias: countDays(period),
		faturamentoClientesRecorrentes: toNumber(recurrentRow?.total),
		faturamentoNovosClientes: toNumber(newRow?.total),
		faturamentoNaoIdentificados: toNumber(unidentifiedRow?.total),
	};
	return totals;
}

async function getPeriodDailySeries({ conditions, period }: { conditions: ReturnType<typeof buildSalesStatsConditions>; period: TComparisonPeriod }) {
	const dayKey = localDayKey(sales.dataVenda);
	const rows = await db
		.select({ data: dayKey, qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.where(and(...conditions, ...withinPeriod(period)))
		.groupBy(dayKey)
		.orderBy(dayKey);
	const byDay = new Map(rows.map((row) => [row.data, { qtde: toNumber(row.qtde), total: toNumber(row.total) }]));

	// Dias sem venda entram zerados: uma série com buracos desloca o alinhamento com o outro período.
	const days = countDays(period);
	const start = dayjs(period.after).startOf("day");
	return Array.from({ length: days }, (_, index) => {
		const data = start.add(index, "day").format("YYYY-MM-DD");
		const value = byDay.get(data);
		return { data, qtde: value?.qtde ?? 0, total: value?.total ?? 0 };
	});
}

type TGroupedRow = { id: string; titulo: string; avatarUrl: string | null; qtde: number; total: number };

async function getSellersGrouped({
	conditions,
	period,
}: {
	conditions: ReturnType<typeof buildSalesStatsConditions>;
	period: TComparisonPeriod;
}): Promise<TGroupedRow[]> {
	const rows = await db
		.select({ id: sales.vendedorId, nome: sellers.nome, avatarUrl: sellers.avatarUrl, qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.innerJoin(sellers, eq(sales.vendedorId, sellers.id))
		.where(and(...conditions, ...withinPeriod(period)))
		.groupBy(sales.vendedorId, sellers.nome, sellers.avatarUrl);
	return rows
		.filter((row): row is typeof row & { id: string } => Boolean(row.id))
		.map((row) => ({ id: row.id, titulo: row.nome, avatarUrl: row.avatarUrl, qtde: toNumber(row.qtde), total: toNumber(row.total) }));
}

async function getProductsGrouped({
	organizacaoId,
	conditions,
	period,
}: {
	organizacaoId: string;
	conditions: ReturnType<typeof buildSalesStatsConditions>;
	period: TComparisonPeriod;
}): Promise<TGroupedRow[]> {
	const rows = await db
		.select({
			id: products.id,
			nome: products.nome,
			avatarUrl: products.imagemCapaUrl,
			// Vendas distintas, e não itens: um produto que entra duas vezes na mesma venda conta uma venda.
			qtde: countDistinct(saleItems.vendaId),
			total: sum(saleItems.valorVendaTotalLiquido),
		})
		.from(saleItems)
		.innerJoin(products, eq(saleItems.produtoId, products.id))
		.where(
			and(
				eq(saleItems.organizacaoId, organizacaoId),
				exists(
					db
						.select({ id: sales.id })
						.from(sales)
						.where(and(eq(sales.id, saleItems.vendaId), ...conditions, ...withinPeriod(period))),
				),
			),
		)
		.groupBy(products.id, products.nome, products.imagemCapaUrl);
	return rows.map((row) => ({ id: row.id, titulo: row.nome, avatarUrl: row.avatarUrl, qtde: toNumber(row.qtde), total: toNumber(row.total) }));
}

async function getChannelsGrouped({
	conditions,
	period,
}: {
	conditions: ReturnType<typeof buildSalesStatsConditions>;
	period: TComparisonPeriod;
}): Promise<TGroupedRow[]> {
	const channelKey = sql<string>`coalesce(nullif(${sales.canal}, ''), ${UNNAMED_CHANNEL_LITERAL})`;
	const rows = await db
		.select({ canal: channelKey, qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.where(and(...conditions, ...withinPeriod(period)))
		.groupBy(channelKey);
	return rows.map((row) => ({ id: row.canal, titulo: row.canal, avatarUrl: null, qtde: toNumber(row.qtde), total: toNumber(row.total) }));
}

function rankPositions(rows: TGroupedRow[], metric: "total" | "qtde") {
	const secondary = metric === "total" ? "qtde" : "total";
	const sorted = [...rows].sort((a, b) => b[metric] - a[metric] || b[secondary] - a[secondary] || a.titulo.localeCompare(b.titulo));
	return new Map(sorted.map((row, index) => [row.id, index + 1]));
}

function describeSide(rows: TGroupedRow[]) {
	const byValue = rankPositions(rows, "total");
	const byQty = rankPositions(rows, "qtde");
	return new Map(rows.map((row) => [row.id, { ...row, posicaoPorValor: byValue.get(row.id) ?? null, posicaoPorQtde: byQty.get(row.id) ?? null }]));
}

function positionDelta(base: number | null, comparacao: number | null) {
	return base !== null && comparacao !== null ? comparacao - base : null;
}

/**
 * Une os dois lados por id. Quem só aparece num período fica zerado no outro, com posição `null`:
 * zero vendas é um fato, mas "posição zero" não é.
 */
function mergeRankings(base: TGroupedRow[], comparacao: TGroupedRow[]): TComparisonRankingRow[] {
	const baseSide = describeSide(base);
	const comparisonSide = describeSide(comparacao);
	const ids = new Set([...baseSide.keys(), ...comparisonSide.keys()]);
	const emptySide: TRankingSide = { qtde: 0, total: 0, posicaoPorValor: null, posicaoPorQtde: null };

	const rows: TComparisonRankingRow[] = [];
	for (const id of ids) {
		const onBase = baseSide.get(id);
		const onComparison = comparisonSide.get(id);
		const reference = onBase ?? onComparison;
		if (!reference) continue;
		const baseValues: TRankingSide = onBase
			? { qtde: onBase.qtde, total: onBase.total, posicaoPorValor: onBase.posicaoPorValor, posicaoPorQtde: onBase.posicaoPorQtde }
			: emptySide;
		const comparisonValues: TRankingSide = onComparison
			? {
					qtde: onComparison.qtde,
					total: onComparison.total,
					posicaoPorValor: onComparison.posicaoPorValor,
					posicaoPorQtde: onComparison.posicaoPorQtde,
				}
			: emptySide;
		rows.push({
			id,
			titulo: reference.titulo,
			avatarUrl: reference.avatarUrl,
			base: baseValues,
			comparacao: comparisonValues,
			variacaoPosicaoPorValor: positionDelta(baseValues.posicaoPorValor, comparisonValues.posicaoPorValor),
			variacaoPosicaoPorQtde: positionDelta(baseValues.posicaoPorQtde, comparisonValues.posicaoPorQtde),
		});
	}

	return rows
		.sort((a, b) => {
			// Quem vendeu no período base vem primeiro, na ordem de valor do período base; depois quem só vendeu no outro.
			const aPos = a.base.posicaoPorValor;
			const bPos = b.base.posicaoPorValor;
			if (aPos !== null && bPos !== null) return aPos - bPos;
			if (aPos !== null) return -1;
			if (bPos !== null) return 1;
			return (a.comparacao.posicaoPorValor ?? 0) - (b.comparacao.posicaoPorValor ?? 0);
		})
		.slice(0, RANKING_LIMIT);
}

function safeDivide(numerator: number, denominator: number) {
	return denominator > 0 ? numerator / denominator : 0;
}

export async function getSalesComparisonStats({
	organizacaoId,
	filters,
	base,
	comparacao,
	canViewSensitive,
}: {
	organizacaoId: string;
	filters: TSalesStatsFilters;
	base: TComparisonPeriod;
	comparacao: TComparisonPeriod;
	canViewSensitive: boolean;
}): Promise<TSalesComparisonStats> {
	const conditions = buildSalesStatsConditions({ organizacaoId, filters });

	const [
		baseTotals,
		comparisonTotals,
		baseSeries,
		comparisonSeries,
		baseSellers,
		comparisonSellers,
		baseProducts,
		comparisonProducts,
		baseChannels,
		comparisonChannels,
	] = await Promise.all([
		getPeriodTotals({ organizacaoId, conditions, period: base }),
		getPeriodTotals({ organizacaoId, conditions, period: comparacao }),
		getPeriodDailySeries({ conditions, period: base }),
		getPeriodDailySeries({ conditions, period: comparacao }),
		getSellersGrouped({ conditions, period: base }),
		getSellersGrouped({ conditions, period: comparacao }),
		getProductsGrouped({ organizacaoId, conditions, period: base }),
		getProductsGrouped({ organizacaoId, conditions, period: comparacao }),
		getChannelsGrouped({ conditions, period: base }),
		getChannelsGrouped({ conditions, period: comparacao }),
	]);

	const pair = (pick: (totals: TSalesTotals) => number): TPeriodPair<number> => ({ base: pick(baseTotals), comparacao: pick(comparisonTotals) });

	const seriesLength = Math.max(baseSeries.length, comparisonSeries.length);
	const serie = Array.from({ length: seriesLength }, (_, index) => ({
		dia: index + 1,
		base: baseSeries[index] ?? null,
		comparacao: comparisonSeries[index] ?? null,
	}));

	return {
		periodos: {
			base: { after: base.after.toISOString(), before: base.before.toISOString(), dias: baseTotals.dias },
			comparacao: { after: comparacao.after.toISOString(), before: comparacao.before.toISOString(), dias: comparisonTotals.dias },
		},
		faturamento: pair((t) => t.faturamento),
		margemBruta: canViewSensitive ? pair((t) => t.faturamento - t.custo) : null,
		qtdeVendas: pair((t) => t.qtdeVendas),
		ticketMedio: pair((t) => safeDivide(t.faturamento, t.qtdeVendas)),
		qtdeItensVendidos: pair((t) => t.qtdeItensVendidos),
		itensPorVendaMedio: pair((t) => safeDivide(t.qtdeItensVendidos, t.qtdeVendas)),
		valorDiarioMedio: pair((t) => safeDivide(t.faturamento, t.dias)),
		faturamentoClientesRecorrentes: pair((t) => t.faturamentoClientesRecorrentes),
		faturamentoNovosClientes: pair((t) => t.faturamentoNovosClientes),
		faturamentoNaoIdentificados: pair((t) => t.faturamentoNaoIdentificados),
		serie,
		porVendedor: mergeRankings(baseSellers, comparisonSellers),
		porProduto: mergeRankings(baseProducts, comparisonProducts),
		porCanal: mergeRankings(baseChannels, comparisonChannels),
	};
}
