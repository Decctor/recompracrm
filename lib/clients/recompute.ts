import { getRFMLabel } from "@/utils/rfm";
import { type DBTransaction, db } from "@/services/drizzle";
import { clientSellerReferences, clients, productClientReferences, products, saleItems, sales, utils } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

/**
 * Versões POR CLIENTE dos agregados que os crons noturnos calculam em lote por
 * organização (enrich-clients, rfm-analysis, client-seller-references,
 * product-client-references). Existem para o merge de clientes duplicados: o
 * keeper absorve o histórico da origem e não pode esperar a janela noturna com
 * metadados errados — são eles que disparam campanhas.
 *
 * As constantes e fórmulas espelham as dos crons; qualquer mudança lá precisa
 * refletir aqui (e vice-versa). Deliberadamente NÃO disparam campanhas de
 * segmentação: merge é operação de dados, não comportamento do cliente.
 */

const VALID_SALE_STATUS = "CONFIRMADA";

// = app/api/cron/client-seller-references/route.ts
const SELLER_RECENCY_HALF_LIFE_DAYS = 180;
const SELLER_LOOKBACK_MONTHS = 24;

// = app/api/cron/product-client-references/route.ts
const PRODUCT_REFERENCE_WINDOWS = [
	{ label: "GERAL" as const, days: null },
	{ label: "30_DIAS" as const, days: 30 },
	{ label: "90_DIAS" as const, days: 90 },
];

/**
 * primeira/última compra + metadados de recompra (contagem, valor total,
 * produto/grupo mais comprado) a partir das vendas CONFIRMADAS do cliente.
 * `metadataProdutoSugeridoId` fica de fora: o cross-sell é um cálculo
 * org-wide (matriz item-item) — o cron noturno o reequilibra.
 */
export async function recomputeClientPurchaseMetadata({
	tx,
	organizacaoId,
	clienteId,
}: {
	tx: DBTransaction;
	organizacaoId: string;
	clienteId: string;
}) {
	const [totals] = await tx
		.select({
			totalValue: sql<number>`coalesce(sum(${sales.valorTotal}), 0)`,
			totalCount: sql<number>`coalesce(count(${sales.id}), 0)::int`,
		})
		.from(sales)
		.where(and(eq(sales.organizacaoId, organizacaoId), eq(sales.clienteId, clienteId), eq(sales.statusVenda, VALID_SALE_STATUS)));

	const [firstSale] = await tx
		.select({ id: sales.id, dataVenda: sales.dataVenda })
		.from(sales)
		.where(and(eq(sales.organizacaoId, organizacaoId), eq(sales.clienteId, clienteId), eq(sales.statusVenda, VALID_SALE_STATUS)))
		.orderBy(sql`${sales.dataVenda} asc nulls last`)
		.limit(1);
	const [lastSale] = await tx
		.select({ id: sales.id, dataVenda: sales.dataVenda })
		.from(sales)
		.where(and(eq(sales.organizacaoId, organizacaoId), eq(sales.clienteId, clienteId), eq(sales.statusVenda, VALID_SALE_STATUS)))
		.orderBy(sql`${sales.dataVenda} desc nulls last`)
		.limit(1);

	const [mostPurchased] = await tx
		.select({
			produtoId: saleItems.produtoId,
			produtoGrupo: products.grupo,
			totalQuantity: sql<number>`sum(${saleItems.quantidade})`,
		})
		.from(saleItems)
		.innerJoin(products, eq(products.id, saleItems.produtoId))
		.innerJoin(sales, and(eq(sales.id, saleItems.vendaId), eq(sales.statusVenda, VALID_SALE_STATUS)))
		.where(and(eq(saleItems.organizacaoId, organizacaoId), eq(saleItems.clienteId, clienteId)))
		.groupBy(saleItems.produtoId, products.grupo)
		.orderBy(sql`sum(${saleItems.quantidade}) desc`)
		.limit(1);

	await tx
		.update(clients)
		.set({
			metadataTotalCompras: totals?.totalCount ?? 0,
			metadataValorTotalCompras: totals?.totalValue ?? 0,
			metadataProdutoMaisCompradoId: mostPurchased?.produtoId ?? null,
			metadataGrupoProdutoMaisComprado: mostPurchased?.produtoGrupo ?? null,
			metadataUltimaAtualizacao: new Date(),
			primeiraCompraData: firstSale?.dataVenda ?? null,
			primeiraCompraId: firstSale?.id ?? null,
			ultimaCompraData: lastSale?.dataVenda ?? null,
			ultimaCompraId: lastSale?.id ?? null,
		})
		.where(and(eq(clients.id, clienteId), eq(clients.organizacaoId, organizacaoId)));
}

/**
 * Título RFM (12 meses de vendas CONFIRMADAS + CONFIG_RFM da organização),
 * sem disparar as campanhas de entrada/permanência em segmentação que o cron
 * dispara. `analiseRFMUltimaAlteracao` só avança quando o título mudou —
 * mesma semântica do cron.
 */
export async function recomputeClientRFM({ tx, organizacaoId, clienteId }: { tx: DBTransaction; organizacaoId: string; clienteId: string }) {
	const utilsRFMReturn = await tx.query.utils.findFirst({
		where: and(eq(utils.identificador, "CONFIG_RFM"), eq(utils.organizacaoId, organizacaoId)),
	});
	const rfmConfig = utilsRFMReturn?.valor.identificador === "CONFIG_RFM" ? utilsRFMReturn.valor : null;
	if (!rfmConfig) return;

	const client = await tx.query.clients.findFirst({
		columns: { analiseRFMTitulo: true },
		where: and(eq(clients.id, clienteId), eq(clients.organizacaoId, organizacaoId)),
	});
	if (!client) return;

	const intervalStart = dayjs().subtract(12, "month").startOf("day").toDate();
	const intervalEnd = dayjs().endOf("day").toDate();
	const [accumulated] = await tx
		.select({
			totalPurchases: sql<number>`coalesce(sum(${sales.valorTotal}), 0)`,
			purchaseCount: sql<number>`count(${sales.id})::int`,
			lastPurchaseDate: sql<Date | null>`max(${sales.dataVenda})`,
		})
		.from(sales)
		.where(
			and(
				eq(sales.organizacaoId, organizacaoId),
				eq(sales.clienteId, clienteId),
				gte(sales.dataVenda, intervalStart),
				lte(sales.dataVenda, intervalEnd),
				eq(sales.statusVenda, VALID_SALE_STATUS),
			),
		);

	const calculatedRecency = accumulated?.lastPurchaseDate ? dayjs().diff(dayjs(accumulated.lastPurchaseDate), "days") : null;
	const calculatedFrequency = accumulated?.purchaseCount ?? 0;
	const calculatedMonetary = accumulated?.totalPurchases ?? 0;

	const configRecency = Object.entries(rfmConfig.recencia).find(
		([, value]) => calculatedRecency !== null && calculatedRecency >= value.min && calculatedRecency <= value.max,
	);
	const configFrequency = Object.entries(rfmConfig.frequencia).find(
		([, value]) => calculatedFrequency >= value.min && calculatedFrequency <= value.max,
	);
	const configMonetary = Object.entries(rfmConfig.monetario).find(([, value]) => calculatedMonetary >= value.min && calculatedMonetary <= value.max);

	const recencyScore = configRecency ? Number(configRecency[0]) : 1;
	const frequencyScore = configFrequency ? Number(configFrequency[0]) : 1;
	const monetaryScore = configMonetary ? Number(configMonetary[0]) : 1;

	const newRFMLabel = getRFMLabel({ monetary: monetaryScore, frequency: frequencyScore, recency: recencyScore });
	const labelChanged = client.analiseRFMTitulo !== newRFMLabel;

	await tx
		.update(clients)
		.set({
			analiseRFMTitulo: newRFMLabel,
			analiseRFMNotasRecencia: String(recencyScore),
			analiseRFMNotasFrequencia: String(frequencyScore),
			analiseRFMNotasMonetario: String(monetaryScore),
			analiseRFMUltimaAtualizacao: new Date(),
			...(labelChanged ? { analiseRFMUltimaAlteracao: new Date() } : {}),
		})
		.where(and(eq(clients.id, clienteId), eq(clients.organizacaoId, organizacaoId)));
}

/**
 * Vínculos vendedor × cliente do cliente: delete + rebuild a partir das vendas
 * (score com decay de recência, mesma fórmula do cron). O ranking é
 * particionado POR CLIENTE, então a recomputação é auto-contida.
 */
export async function recomputeClientSellerReferences({
	tx,
	organizacaoId,
	clienteId,
}: {
	tx: DBTransaction;
	organizacaoId: string;
	clienteId: string;
}) {
	const lookbackStartIso = dayjs().subtract(SELLER_LOOKBACK_MONTHS, "month").startOf("day").toDate().toISOString();

	await tx
		.delete(clientSellerReferences)
		.where(and(eq(clientSellerReferences.organizacaoId, organizacaoId), eq(clientSellerReferences.clienteId, clienteId)));

	await tx.execute(sql`
		insert into ${clientSellerReferences} (
			id, organizacao_id, cliente_id, vendedor_id, total_vendas, valor_total_vendas,
			score_vinculo, ranking_vinculo, primeira_venda_data, ultima_venda_data, data_ultima_atualizacao
		)
		select
			gen_random_uuid()::varchar,
			${organizacaoId}::varchar,
			${sales.clienteId},
			${sales.vendedorId},
			count(*)::integer,
			coalesce(sum(${sales.valorTotal}), 0)::double precision,
			coalesce(sum(power(0.5, extract(epoch from (now() - ${sales.dataVenda})) / 86400.0 / ${SELLER_RECENCY_HALF_LIFE_DAYS})), 0)::double precision,
			0::integer,
			min(${sales.dataVenda}),
			max(${sales.dataVenda}),
			now()::timestamp
		from ${sales}
		where ${sales.organizacaoId} = ${organizacaoId}
			and ${sales.clienteId} = ${clienteId}
			and ${sales.vendedorId} is not null
			and ${sales.statusVenda} = ${VALID_SALE_STATUS}
			and ${sales.dataVenda} >= ${lookbackStartIso}::timestamp
		group by ${sales.clienteId}, ${sales.vendedorId}
	`);

	await tx.execute(sql`
		update ${clientSellerReferences} as refs
		set ranking_vinculo = ranked.ranking_vinculo
		from (
			select
				${clientSellerReferences.id} as id,
				row_number() over (
					order by
						${clientSellerReferences.scoreVinculo} desc,
						${clientSellerReferences.totalVendas} desc,
						${clientSellerReferences.ultimaVendaData} desc nulls last,
						${clientSellerReferences.vendedorId} asc
				)::integer as ranking_vinculo
			from ${clientSellerReferences}
			where ${clientSellerReferences.organizacaoId} = ${organizacaoId}
				and ${clientSellerReferences.clienteId} = ${clienteId}
		) as ranked
		where refs.id = ranked.id
	`);
}

/**
 * Afinidade produto × cliente do cliente nas três janelas: delete + rebuild.
 * O ranking_valor é particionado por PRODUTO, então depois do rebuild
 * re-rankeamos as partições dos produtos que o cliente toca (bounded); o
 * cross-sell (`metadataProdutoSugeridoId`) fica para o cron noturno.
 */
export async function recomputeClientProductReferences({
	tx,
	organizacaoId,
	clienteId,
	rerank = true,
}: {
	tx: DBTransaction;
	organizacaoId: string;
	clienteId: string;
	/** `false` em lote: o chamador re-rankeia os produtos tocados uma vez no fim (`rerankProductClientReferences`). */
	rerank?: boolean;
}) {
	await tx
		.delete(productClientReferences)
		.where(and(eq(productClientReferences.organizacaoId, organizacaoId), eq(productClientReferences.clienteId, clienteId)));

	for (const window of PRODUCT_REFERENCE_WINDOWS) {
		const startDateIso = window.days === null ? null : dayjs().subtract(window.days, "day").startOf("day").toDate().toISOString();
		const dateFilter = startDateIso ? sql`and ${sales.dataVenda} >= ${startDateIso}::timestamp` : sql``;

		await tx.execute(sql`
			insert into ${productClientReferences} (
				id, organizacao_id, produto_id, produto_variante_id, cliente_id,
				total_compras_quantidade, total_compras_valor, ranking_valor, janela,
				primeira_compra_data, ultima_compra_data, data_ultima_atualizacao
			)
			select
				gen_random_uuid()::varchar,
				${organizacaoId}::varchar,
				${saleItems.produtoId},
				null::varchar,
				${saleItems.clienteId},
				cast(round(coalesce(sum(${saleItems.quantidade}), 0)) as integer),
				coalesce(sum(${saleItems.valorVendaTotalLiquido}), 0)::double precision,
				0::integer,
				${window.label}::product_client_reference_window,
				min(${sales.dataVenda}),
				max(${sales.dataVenda}),
				now()::timestamp
			from ${saleItems}
			inner join ${sales} on ${saleItems.vendaId} = ${sales.id}
			where ${saleItems.organizacaoId} = ${organizacaoId}
				and ${sales.organizacaoId} = ${organizacaoId}
				and ${saleItems.clienteId} = ${clienteId}
				and ${sales.statusVenda} = ${VALID_SALE_STATUS}
				${dateFilter}
			group by ${saleItems.produtoId}, ${saleItems.clienteId}
			having coalesce(sum(${saleItems.quantidade}), 0) > 0
				or coalesce(sum(${saleItems.valorVendaTotalLiquido}), 0) > 0
		`);
	}

	const touchedProducts = await tx
		.selectDistinct({ produtoId: productClientReferences.produtoId })
		.from(productClientReferences)
		.where(and(eq(productClientReferences.organizacaoId, organizacaoId), eq(productClientReferences.clienteId, clienteId)));
	const touchedProductIds = touchedProducts.map((row) => row.produtoId);
	if (rerank) await rerankProductClientReferences({ tx, organizacaoId, productIds: touchedProductIds });
	return touchedProductIds;
}

/** Re-rankeia (por produto e janela) as afinidades produto × cliente dos produtos dados. */
export async function rerankProductClientReferences({
	tx,
	organizacaoId,
	productIds,
}: {
	tx: DBTransaction;
	organizacaoId: string;
	productIds: string[];
}) {
	if (productIds.length === 0) return;
	await tx.execute(sql`
		update ${productClientReferences} as refs
		set ranking_valor = ranked.ranking_valor
		from (
			select
				${productClientReferences.id} as id,
				row_number() over (
					partition by ${productClientReferences.organizacaoId}, ${productClientReferences.produtoId}, ${productClientReferences.janela}
					order by
						${productClientReferences.totalComprasValor} desc,
						${productClientReferences.totalComprasQuantidade} desc,
						${productClientReferences.ultimaCompraData} desc nulls last,
						${productClientReferences.clienteId} asc
				)::integer as ranking_valor
			from ${productClientReferences}
			where ${productClientReferences.organizacaoId} = ${organizacaoId}
				and ${inArray(productClientReferences.produtoId, productIds)}
		) as ranked
		where refs.id = ranked.id
	`);
}

/**
 * Recomputa todos os derivados do cliente numa transação própria, best-effort:
 * o chamador (pós-merge) nunca falha por causa disso — o cron noturno é a rede
 * de segurança que reconstrói tudo de qualquer forma.
 */
export async function recomputeClientDerivedDataSafely({ organizacaoId, clienteId }: { organizacaoId: string; clienteId: string }): Promise<void> {
	try {
		await db.transaction(async (tx) => {
			await recomputeClientPurchaseMetadata({ tx, organizacaoId, clienteId });
			await recomputeClientRFM({ tx, organizacaoId, clienteId });
			await recomputeClientSellerReferences({ tx, organizacaoId, clienteId });
			await recomputeClientProductReferences({ tx, organizacaoId, clienteId });
		});
	} catch (error) {
		console.error("[CLIENT_RECOMPUTE] Falha ao recomputar derivados do cliente:", { organizacaoId, clienteId, error });
	}
}
