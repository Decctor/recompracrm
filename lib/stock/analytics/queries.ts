import { localDayKey } from "@/lib/operation-timezone";
import { db } from "@/services/drizzle";
import {
	productStockLots,
	productStockTransactions,
	productVariants,
	products,
	purchaseItems,
	purchases,
	saleItems,
	sales,
	suppliers,
} from "@/services/drizzle/schema";
import { type SQL, sql } from "drizzle-orm";
import { CONSUMPTION_WINDOW_DAYS, resolveConsumption, type TConsumption, type TConsumptionLine } from "./consumption";
import { classifyAbc, type TAbcRankedItem } from "./abc";
import { listLocalDayKeys, getTrailingPeriod } from "./periods";
import { resolveLeadTime, type TLeadTimeSample } from "./replenishment";

// Consultas compartilhadas pelos relatórios de estoque e pela aba Estoque do produto.
//
// Convenções:
// - Datas entram como `timestamp` sem fuso guardando UTC (`naiveUtc`), igual às colunas.
// - Datas saem como epoch em ms (`epochMs`): o driver interpretaria um `timestamp` sem fuso no fuso
//   do processo.
// - Saldo e valor de um produto somam o próprio saldo (quando rastreado) e o das variantes
//   rastreadas, cada uma ao seu custo (a variante sem custo herda o do produto).

const naiveUtc = (date: Date) => sql`${date.toISOString()}::timestamp`;
const epochMs = (column: SQL) => sql`(extract(epoch from ${column}) * 1000)::float8`;
const inList = (ids: string[]) =>
	sql.join(
		ids.map((id) => sql`${id}`),
		sql`, `,
	);

/** Tipos que contam como consumo: venda/baixa e insumo de produção. Estorno de compra (SAIDA com compra) não conta. */
const CONSUMPTION_CONDITION = sql`(t.tipo = 'SAIDA_PRODUCAO' or (t.tipo = 'SAIDA' and t.compra_id is null))`;

/** Variação de saldo de uma movimentação; a quantidade é sempre positiva, a direção vem do saldo. */
const DELTA = sql`(coalesce(t.saldo_posterior, 0) - coalesce(t.saldo_anterior, 0))`;
/** Variação de valor (saldo × custo médio) de uma movimentação. */
const VALUE_DELTA = sql`(coalesce(t.saldo_posterior, 0) * coalesce(t.custo_unitario_posterior, t.custo_unitario_anterior, 0) - coalesce(t.saldo_anterior, 0) * coalesce(t.custo_unitario_anterior, t.custo_unitario_posterior, 0))`;
/** Custo unitário de uma saída: o movimentado ou, na falta dele, o custo médio vigente. */
const OUTFLOW_UNIT_COST = sql`coalesce(t.custo_unitario_movimentado, t.custo_unitario_anterior, t.custo_unitario_posterior, 0)`;

export { naiveUtc, epochMs };

// ---------------------------------------------------------------------------------------------
// Posição atual
// ---------------------------------------------------------------------------------------------

export type TStockPosition = {
	produtoId: string;
	nome: string;
	codigo: string;
	grupo: string;
	unidade: string;
	precoVenda: number | null;
	precoCusto: number | null;
	dataInsercao: number;
	saldo: number;
	valor: number;
};

/** Saldo e valor atuais dos produtos com rastreamento de estoque (no produto ou em alguma variante). */
export async function getStockPositions({ organizationId, productIds }: { organizationId: string; productIds?: string[] }) {
	if (productIds && productIds.length === 0) return [];
	const productFilter = productIds ? sql`and p.id in (${inList(productIds)})` : sql``;
	return db.execute<TStockPosition>(sql`
		select
			p.id as "produtoId",
			p.nome,
			p.codigo,
			p.grupo,
			p.unidade,
			p.preco_venda::float8 as "precoVenda",
			p.preco_custo::float8 as "precoCusto",
			${epochMs(sql`p.data_insercao`)} as "dataInsercao",
			(case when p.rastreamento_estoque_ativo then coalesce(p.quantidade, 0) else 0 end + coalesce(v.saldo, 0))::float8 as "saldo",
			(case when p.rastreamento_estoque_ativo then coalesce(p.quantidade, 0) * coalesce(p.preco_custo, 0) else 0 end + coalesce(v.valor, 0))::float8 as "valor"
		from ${products} p
		left join lateral (
			select
				sum(coalesce(pv.quantidade, 0)) as saldo,
				sum(coalesce(pv.quantidade, 0) * coalesce(pv.preco_custo, p.preco_custo, 0)) as valor,
				count(*) as variantes
			from ${productVariants} pv
			where pv.produto_id = p.id and pv.rastreamento_estoque_ativo = true
		) v on true
		where p.organizacao_id = ${organizationId}
			and (p.rastreamento_estoque_ativo = true or coalesce(v.variantes, 0) > 0)
			${productFilter}
	`);
}

// ---------------------------------------------------------------------------------------------
// Variações do ledger
// ---------------------------------------------------------------------------------------------

/** Variação de unidades e de valor por dia local, para reconstruir séries a partir do valor atual. */
export async function getStockDeltasByDay({
	organizationId,
	after,
	before,
	productId,
}: {
	organizationId: string;
	after: Date;
	before: Date;
	productId?: string;
}) {
	const productFilter = productId ? sql`and t.produto_id = ${productId}` : sql``;
	const rows = await db.execute<{ dia: string; unidades: number; valor: number; entradas: number; saidas: number }>(sql`
		select
			${localDayKey(sql`t.data_insercao`)} as "dia",
			sum(${DELTA})::float8 as "unidades",
			sum(${VALUE_DELTA})::float8 as "valor",
			sum(greatest(${DELTA}, 0))::float8 as "entradas",
			sum(greatest(-${DELTA}, 0))::float8 as "saidas"
		from ${productStockTransactions} t
		where t.organizacao_id = ${organizationId}
			and t.data_insercao > ${naiveUtc(after)}
			and t.data_insercao <= ${naiveUtc(before)}
			${productFilter}
		group by 1
	`);
	return new Map(rows.map((row) => [row.dia, row]));
}

/**
 * Por produto: variação de saldo desde `after` e `Σ δ·índiceDoDia` (para o saldo médio, ver
 * `resolveAverageBalance`) e as saídas de consumo no período.
 */
export async function getProductMovementSummaries({ organizationId, after, before }: { organizationId: string; after: Date; before: Date }) {
	const days = listLocalDayKeys(after, before);
	const firstDay = days[0];
	const rows = await db.execute<{ produtoId: string; variacao: number; variacaoPonderada: number; saidas: number }>(sql`
		select
			t.produto_id as "produtoId",
			sum(${DELTA})::float8 as "variacao",
			sum(${DELTA} * (${localDayKey(sql`t.data_insercao`)}::date - ${firstDay}::date))::float8 as "variacaoPonderada",
			sum(case when ${CONSUMPTION_CONDITION} then t.quantidade else 0 end)::float8 as "saidas"
		from ${productStockTransactions} t
		where t.organizacao_id = ${organizationId}
			and t.data_insercao > ${naiveUtc(after)}
			and t.data_insercao <= ${naiveUtc(before)}
		group by 1
	`);
	return { dayCount: days.length, byProductId: new Map(rows.map((row) => [row.produtoId, row])) };
}

// ---------------------------------------------------------------------------------------------
// Consumo
// ---------------------------------------------------------------------------------------------

/**
 * Linhas de consumo dos últimos 30 dias por produto. Uma linha é um item de venda (as baixas FEFO
 * de um mesmo item, espalhadas por lotes, são somadas) ou uma baixa avulsa.
 */
export async function getConsumptionByProduct({
	organizationId,
	productIds,
	now = new Date(),
}: {
	organizationId: string;
	productIds?: string[];
	now?: Date;
}) {
	const { after, before } = getTrailingPeriod(CONSUMPTION_WINDOW_DAYS, now);
	const days = listLocalDayKeys(after, before).slice(-CONSUMPTION_WINDOW_DAYS);
	const productFilter = productIds ? (productIds.length ? sql`and t.produto_id in (${inList(productIds)})` : sql`and false`) : sql``;
	const rows = await db.execute<{ produtoId: string; dia: string; quantidade: number }>(sql`
		select
			t.produto_id as "produtoId",
			min(${localDayKey(sql`t.data_insercao`)}) as "dia",
			sum(t.quantidade)::float8 as "quantidade"
		from ${productStockTransactions} t
		where t.organizacao_id = ${organizationId}
			and ${CONSUMPTION_CONDITION}
			and t.data_insercao > ${naiveUtc(after)}
			and t.data_insercao <= ${naiveUtc(before)}
			${productFilter}
		group by t.produto_id, coalesce(t.venda_item_id, t.id)
	`);
	const linesByProduct = new Map<string, TConsumptionLine[]>();
	for (const row of rows) {
		const list = linesByProduct.get(row.produtoId) ?? [];
		list.push({ dia: row.dia, quantidade: row.quantidade });
		linesByProduct.set(row.produtoId, list);
	}
	const result = new Map<string, TConsumption>();
	for (const [produtoId, lines] of linesByProduct) result.set(produtoId, resolveConsumption({ lines, days }));
	return { days, byProductId: result, empty: resolveConsumption({ lines: [], days }) };
}

// ---------------------------------------------------------------------------------------------
// Prazo de reposição
// ---------------------------------------------------------------------------------------------

/** Últimas compras recebidas de cada produto, com data do pedido e do recebimento. */
export async function getLeadTimeByProduct({ organizationId, productIds }: { organizationId: string; productIds?: string[] }) {
	const productFilter = productIds ? (productIds.length ? sql`and t.produto_id in (${inList(productIds)})` : sql`and false`) : sql``;
	const rows = await db.execute<{ produtoId: string; pedidoData: number; recebimentoData: number }>(sql`
		select "produtoId", "pedidoData", "recebimentoData" from (
			select
				t.produto_id as "produtoId",
				${epochMs(sql`c.pedido_data`)} as "pedidoData",
				${epochMs(sql`coalesce(c.entrega_data_recebimento_efetivacao, c.data_efetivacao, min(t.data_insercao))`)} as "recebimentoData",
				row_number() over (
					partition by t.produto_id
					order by coalesce(c.entrega_data_recebimento_efetivacao, c.data_efetivacao, min(t.data_insercao)) desc
				) as ordem
			from ${productStockTransactions} t
			join ${purchases} c on c.id = t.compra_id
			where t.organizacao_id = ${organizationId}
				and t.tipo = 'ENTRADA_AQUISICAO'
				and c.pedido_data is not null
				${productFilter}
			group by t.produto_id, c.id
		) amostras
		where ordem <= 6
	`);
	const samplesByProduct = new Map<string, TLeadTimeSample[]>();
	for (const row of rows) {
		const list = samplesByProduct.get(row.produtoId) ?? [];
		list.push({ pedidoData: new Date(row.pedidoData), recebimentoData: new Date(row.recebimentoData) });
		samplesByProduct.set(row.produtoId, list);
	}
	return {
		get: (produtoId: string) => resolveLeadTime(samplesByProduct.get(produtoId) ?? []),
	};
}

// ---------------------------------------------------------------------------------------------
// Curva ABC
// ---------------------------------------------------------------------------------------------

export type TAbcMetric = "FATURAMENTO" | "VOLUME";

/**
 * Curva ABC dos produtos rastreados no período: faturamento líquido ou unidades das vendas
 * confirmadas. Produtos rastreados sem venda entram com zero (classe C).
 */
export async function getAbcRanking({
	organizationId,
	after,
	before,
	metric,
}: {
	organizationId: string;
	after: Date;
	before: Date;
	metric: TAbcMetric;
}) {
	const valueExpression = metric === "VOLUME" ? sql`si.quantidade` : sql`si.valor_venda_total_liquido`;
	const rows = await db.execute<{ produtoId: string; nome: string; valor: number }>(sql`
		select p.id as "produtoId", p.nome, coalesce(vendas.valor, 0)::float8 as "valor"
		from ${products} p
		left join (
			select si.produto_id, sum(${valueExpression}) as valor
			from ${saleItems} si
			join ${sales} s on s.id = si.venda_id
			where s.organizacao_id = ${organizationId}
				and s.status_venda = 'CONFIRMADA'
				and s.data_venda >= ${naiveUtc(after)}
				and s.data_venda <= ${naiveUtc(before)}
			group by si.produto_id
		) vendas on vendas.produto_id = p.id
		where p.organizacao_id = ${organizationId}
			and (
				p.rastreamento_estoque_ativo = true
				or exists (select 1 from ${productVariants} pv where pv.produto_id = p.id and pv.rastreamento_estoque_ativo = true)
			)
	`);
	const names = new Map(rows.map((row) => [row.produtoId, row.nome]));
	const ranked = classifyAbc(rows.map((row) => ({ produtoId: row.produtoId, valor: row.valor })));
	return {
		ranked: ranked.map((item) => ({ ...item, nome: names.get(item.produtoId) ?? "" })),
		byProductId: new Map<string, TAbcRankedItem>(ranked.map((item) => [item.produtoId, item])),
	};
}

// ---------------------------------------------------------------------------------------------
// Perdas
// ---------------------------------------------------------------------------------------------

export type TStockLossRow = {
	id: string;
	produtoId: string;
	produtoNome: string;
	varianteNome: string | null;
	tipo: "DESCARTE" | "AJUSTE";
	data: number;
	dia: string;
	quantidade: number;
	valor: number;
	motivo: string | null;
	loteDataValidade: number | null;
};

/** Descartes e ajustes negativos no período, valorizados ao custo unitário da movimentação. */
export async function getStockLosses({ organizationId, after, before }: { organizationId: string; after: Date; before: Date }) {
	return db.execute<TStockLossRow>(sql`
		select
			t.id,
			t.produto_id as "produtoId",
			p.nome as "produtoNome",
			pv.nome as "varianteNome",
			t.tipo,
			${epochMs(sql`t.data_insercao`)} as "data",
			${localDayKey(sql`t.data_insercao`)} as "dia",
			t.quantidade::float8 as "quantidade",
			(t.quantidade * ${OUTFLOW_UNIT_COST})::float8 as "valor",
			t.motivo,
			${epochMs(sql`l.data_validade`)} as "loteDataValidade"
		from ${productStockTransactions} t
		join ${products} p on p.id = t.produto_id
		left join ${productVariants} pv on pv.id = t.produto_variante_id
		left join ${productStockLots} l on l.id = t.lote_id
		where t.organizacao_id = ${organizationId}
			and (t.tipo = 'DESCARTE' or (t.tipo = 'AJUSTE' and coalesce(t.saldo_posterior, 0) < coalesce(t.saldo_anterior, 0)))
			and t.data_insercao > ${naiveUtc(after)}
			and t.data_insercao <= ${naiveUtc(before)}
	`);
}

// ---------------------------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------------------------

export type TPurchaseEntryRow = {
	compraId: string;
	produtoId: string;
	produtoVarianteId: string | null;
	produtoNome: string;
	varianteNome: string | null;
	compraTitulo: string;
	fornecedor: string | null;
	data: number;
	dia: string;
	quantidade: number;
	custoUnitario: number | null;
};

/**
 * Entradas de compra agrupadas por compra e item de estoque (produto ou variante). O custo é a média
 * ponderada das linhas da compra (uma compra pode entrar em mais de um lote).
 */
export async function getPurchaseEntries({
	organizationId,
	after,
	before,
	productId,
}: {
	organizationId: string;
	after?: Date | null;
	before?: Date | null;
	productId?: string;
}) {
	const afterFilter = after ? sql`and t.data_insercao > ${naiveUtc(after)}` : sql``;
	const beforeFilter = before ? sql`and t.data_insercao <= ${naiveUtc(before)}` : sql``;
	const productFilter = productId ? sql`and t.produto_id = ${productId}` : sql``;
	return db.execute<TPurchaseEntryRow>(sql`
		select
			t.compra_id as "compraId",
			t.produto_id as "produtoId",
			t.produto_variante_id as "produtoVarianteId",
			p.nome as "produtoNome",
			pv.nome as "varianteNome",
			c.titulo as "compraTitulo",
			coalesce(f.nome, c.pedido_fornecedor_nome) as "fornecedor",
			${epochMs(sql`min(t.data_insercao)`)} as "data",
			min(${localDayKey(sql`t.data_insercao`)}) as "dia",
			sum(t.quantidade)::float8 as "quantidade",
			(sum(t.quantidade * t.custo_unitario_movimentado) filter (where t.custo_unitario_movimentado is not null)
				/ nullif(sum(t.quantidade) filter (where t.custo_unitario_movimentado is not null), 0))::float8 as "custoUnitario"
		from ${productStockTransactions} t
		join ${purchases} c on c.id = t.compra_id
		join ${products} p on p.id = t.produto_id
		left join ${productVariants} pv on pv.id = t.produto_variante_id
		left join ${suppliers} f on f.id = c.fornecedor_id
		where t.organizacao_id = ${organizationId}
			and t.tipo = 'ENTRADA_AQUISICAO'
			${afterFilter}
			${beforeFilter}
			${productFilter}
		group by t.compra_id, t.produto_id, t.produto_variante_id, p.nome, pv.nome, c.titulo, f.nome, c.pedido_fornecedor_nome
		order by min(t.data_insercao) asc
	`);
}

// ---------------------------------------------------------------------------------------------
// Lotes
// ---------------------------------------------------------------------------------------------

export type TExpiringLotRow = {
	id: string;
	codigoLote: string | null;
	produtoId: string;
	produtoNome: string;
	varianteNome: string | null;
	quantidadeAtual: number;
	quantidadeInicial: number;
	dataValidade: number;
	custoUnitario: number;
};

/** Lotes ativos com saldo e validade até `until`, inclusive os já vencidos. Custo: o da compra do lote, senão o do item. */
export async function getExpiringLots({ organizationId, until }: { organizationId: string; until: Date }) {
	return db.execute<TExpiringLotRow>(sql`
		select
			l.id,
			l.codigo_lote as "codigoLote",
			l.produto_id as "produtoId",
			p.nome as "produtoNome",
			pv.nome as "varianteNome",
			l.quantidade_atual::float8 as "quantidadeAtual",
			l.quantidade_inicial::float8 as "quantidadeInicial",
			${epochMs(sql`l.data_validade`)} as "dataValidade",
			coalesce(ci.valor_unitario_custo::float8, pv.preco_custo, p.preco_custo, 0)::float8 as "custoUnitario"
		from ${productStockLots} l
		join ${products} p on p.id = l.produto_id
		left join ${productVariants} pv on pv.id = l.produto_variante_id
		left join ${purchaseItems} ci on ci.id = l.compra_item_id
		where l.organizacao_id = ${organizationId}
			and l.status = 'ATIVO'
			and l.quantidade_atual > 0
			and l.data_validade is not null
			and l.data_validade <= ${naiveUtc(until)}
		order by l.data_validade asc
	`);
}

// ---------------------------------------------------------------------------------------------
// Última saída
// ---------------------------------------------------------------------------------------------

/** Data da última saída de consumo de cada produto (qualquer data). */
export async function getLastOutflowByProduct({ organizationId }: { organizationId: string }) {
	const rows = await db.execute<{ produtoId: string; data: number }>(sql`
		select t.produto_id as "produtoId", ${epochMs(sql`max(t.data_insercao)`)} as "data"
		from ${productStockTransactions} t
		where t.organizacao_id = ${organizationId} and ${CONSUMPTION_CONDITION}
		group by t.produto_id
	`);
	return new Map(rows.map((row) => [row.produtoId, row.data]));
}
