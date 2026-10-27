import { resolveDeliveryLocationId } from "@/lib/data-collecting-v2/delivery-locations";
import { computeSaleImportSignature } from "@/lib/data-collecting-v2/sale-signature";
import { resolveClientForCanonicalSale, syncAuxiliaryEntities } from "@/lib/data-collecting-v2/sync-auxiliary-entities";
import { buildSaleItemRows, buildSaleValues, getPartner, getSellerId } from "@/lib/data-collecting-v2/sync-sales";
import type { TCanonicalImportBatch, TCanonicalSale } from "@/lib/data-connectors";
import type { TDataSourceIntegration } from "@/lib/integrations/data-sources";
import { db } from "@/services/drizzle";
import { saleItems, sales } from "@/services/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

/** ~35 colunas por venda e ~15 por item: lotes bem abaixo do teto de 65.535 parâmetros do Postgres. */
const SALES_PER_INSERT = 500;
const ITEMS_PER_INSERT = 1000;

export type TBulkPersistHistoricalBatchResult = {
	createdSalesCount: number;
	createdClientsCount: number;
	createdProductsCount: number;
	/** Já existentes ou com modificadores: seguem pelo `persistCanonicalBatch` em modo HISTORICO. */
	fallbackSales: TCanonicalSale[];
};

function chunk<T>(values: T[], size: number) {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
	return chunks;
}

/**
 * Carga histórica de vendas NOVAS em lote: um INSERT para as vendas e um para os itens, em vez de
 * duas idas ao banco por venda. O caminho do data-collecting é desenhado para o sync contínuo
 * (venda a venda, assinatura, transições, efeitos); aqui só se cria o que nunca existiu.
 *
 * Reaproveita os mesmos construtores de linha do sync, inclusive a assinatura: a venda gravada
 * aqui é idêntica à que o sync gravaria, e o primeiro sync contínuo a reconhece como inalterada.
 *
 * Não atualiza métricas de cliente nem dispara efeitos — quem chama roda
 * `recomputeClientMetricsForOrganization` ao fim da carga.
 */
export async function bulkPersistHistoricalBatch({
	integration,
	batch,
}: {
	integration: TDataSourceIntegration;
	batch: TCanonicalImportBatch;
}): Promise<TBulkPersistHistoricalBatchResult> {
	return db.transaction(async (tx) => {
		// Mesmo lock do data-collecting: a carga nunca corre em paralelo com o sync desta conexão.
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`data-collecting:${integration.id}`}))`);
		const context = await syncAuxiliaryEntities({ tx, batch });

		const sourceSaleIds = batch.sales.map((sale) => sale.sourceSaleId);
		const existing =
			sourceSaleIds.length > 0
				? await tx
						.select({ idExterno: sales.idExterno })
						.from(sales)
						.where(and(eq(sales.organizacaoId, batch.organizationId), eq(sales.integracaoId, batch.integrationId), inArray(sales.idExterno, sourceSaleIds)))
				: [];
		const existingSourceIds = new Set(existing.map((sale) => sale.idExterno));

		const fallbackSales: TCanonicalSale[] = [];
		const prepared: Array<{ sale: TCanonicalSale; values: typeof sales.$inferInsert; itemRows: ReturnType<typeof buildSaleItemRows> }> = [];
		for (const sale of batch.sales) {
			const hasModifiers = sale.items.some((item) => (item.modifiers?.length ?? 0) > 0);
			// Canal gerenciado (status de atendimento) tem efeitos de entrega que só o sync aplica.
			if (existingSourceIds.has(sale.sourceSaleId) || hasModifiers || sale.attendanceStatus != null) {
				fallbackSales.push(sale);
				continue;
			}

			const clientId = resolveClientForCanonicalSale(batch, context, sale.client)?.id ?? null;
			const deliveryLocationId = await resolveDeliveryLocationId({
				tx,
				organizationId: batch.organizationId,
				clientId,
				location: sale.deliveryMode === "ENTREGA" ? sale.client?.location : null,
			});
			const saleValues = buildSaleValues({
				batch,
				sale,
				clientId,
				deliveryLocationId,
				sellerId: getSellerId(context, sale),
				partnerId: getPartner(context, sale)?.id ?? null,
			});
			const itemRows = buildSaleItemRows({ batch, context, clientId, items: sale.items });
			const assinaturaExterna = computeSaleImportSignature({
				saleValues,
				resolvedItems: itemRows,
				saleItemRewritePolicy: batch.policies.saleItemRewritePolicy,
			});
			prepared.push({ sale, values: { ...saleValues, assinaturaExterna, statusAtendimentoData: sale.occurredAt }, itemRows });
		}

		const saleIdBySourceId = new Map<string, string>();
		for (const salesChunk of chunk(prepared, SALES_PER_INSERT)) {
			const inserted = await tx
				.insert(sales)
				.values(salesChunk.map((entry) => entry.values))
				.returning({ id: sales.id, idExterno: sales.idExterno });
			for (const row of inserted) if (row.idExterno) saleIdBySourceId.set(row.idExterno, row.id);
		}

		const itemValues = prepared.flatMap((entry) => {
			const vendaId = saleIdBySourceId.get(entry.sale.sourceSaleId);
			if (!vendaId) throw new Error(`Venda ${entry.sale.sourceSaleId} não retornou id na inserção em lote.`);
			return entry.itemRows.map((row) => ({ ...row.values, vendaId }));
		});
		for (const itemsChunk of chunk(itemValues, ITEMS_PER_INSERT)) {
			await tx.insert(saleItems).values(itemsChunk);
		}

		return {
			createdSalesCount: prepared.length,
			createdClientsCount: context.createdClientsCount,
			createdProductsCount: context.createdProductsCount,
			fallbackSales,
		};
	});
}
