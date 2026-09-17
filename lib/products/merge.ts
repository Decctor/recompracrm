import type { DB } from "@/services/drizzle";
import {
	cashbackProgramPrizes,
	catalogLinks,
	couponTargets,
	productAddOnOptions,
	productAddOnReferences,
	productChannelSettings,
	productClientReferences,
	productFiscalProfiles,
	productOptions,
	products,
	productStockLots,
	productStockTransactions,
	productVariants,
	productionInputs,
	productionOutputs,
	productionRecipeInputs,
	productionRecipeOutputs,
	purchaseItems,
	saleItems,
	supplierProductMappings,
} from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

export type TMergeProductsInput = {
	db: DB;
	organizacaoId: string;
	keeperId: string;
	sourceId: string;
};

export type TMergeProductsResult = {
	keeperId: string;
	sourceId: string;
	registrosMovidos: Record<string, number>;
	sourceSnapshot: typeof products.$inferSelect;
};

function scopeKey(produtoId: string, produtoVarianteId: string | null | undefined) {
	return `${produtoId}|${produtoVarianteId ?? ""}`;
}

/**
 * Funde `sourceId` em `keeperId` dentro da organização: re-aponta FKs, resolve colisões
 * de unicidade comuns e remove o produto de origem.
 */
export async function mergeProducts(input: TMergeProductsInput): Promise<TMergeProductsResult> {
	if (input.keeperId === input.sourceId) throw new Error("Sobrevivente e origem precisam ser produtos diferentes.");

	return input.db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT id FROM ampmais_products WHERE organizacao_id = ${input.organizacaoId} AND id IN (${input.keeperId}, ${input.sourceId}) FOR UPDATE`,
		);

		const keeper = await tx.query.products.findFirst({
			where: and(eq(products.id, input.keeperId), eq(products.organizacaoId, input.organizacaoId)),
		});
		const source = await tx.query.products.findFirst({
			where: and(eq(products.id, input.sourceId), eq(products.organizacaoId, input.organizacaoId)),
		});
		if (!keeper || !source) throw new Error("Produto sobrevivente ou de origem não encontrado na organização.");

		const registrosMovidos: Record<string, number> = {};

		async function countAndRepoint(label: string, table: { produtoId: unknown; organizacaoId?: unknown }) {
			const t = table as typeof saleItems;
			const where =
				t.organizacaoId !== undefined ? and(eq(t.organizacaoId, input.organizacaoId), eq(t.produtoId, input.sourceId)) : eq(t.produtoId, input.sourceId);
			const [{ count } = { count: 0 }] = await tx
				.select({ count: sql<number>`count(*)::int` })
				.from(t)
				.where(where);
			if (count > 0) await tx.update(t).set({ produtoId: input.keeperId }).where(where);
			registrosMovidos[label] = count;
		}

		// Variantes passam a pertencer ao sobrevivente (ids de variante preservados no histórico).
		const [{ count: variantCount } = { count: 0 }] = await tx
			.select({ count: sql<number>`count(*)::int` })
			.from(productVariants)
			.where(and(eq(productVariants.organizacaoId, input.organizacaoId), eq(productVariants.produtoId, input.sourceId)));
		if (variantCount > 0) {
			await tx
				.update(productVariants)
				.set({ produtoId: input.keeperId })
				.where(and(eq(productVariants.organizacaoId, input.organizacaoId), eq(productVariants.produtoId, input.sourceId)));
		}
		registrosMovidos.variantes = variantCount;

		await countAndRepoint("saleItems", saleItems);
		await countAndRepoint("productOptions", productOptions);
		await countAndRepoint("productAddOnOptions", productAddOnOptions);
		await countAndRepoint("productStockLots", productStockLots);
		await countAndRepoint("productStockTransactions", productStockTransactions);
		await countAndRepoint("productClientReferences", productClientReferences);
		await countAndRepoint("purchaseItems", purchaseItems);
		await countAndRepoint("productionRecipeInputs", productionRecipeInputs);
		await countAndRepoint("productionRecipeOutputs", productionRecipeOutputs);
		await countAndRepoint("productionInputs", productionInputs);
		await countAndRepoint("productionOutputs", productionOutputs);
		await countAndRepoint("cashbackProgramPrizes", cashbackProgramPrizes);
		await countAndRepoint("couponTargets", couponTargets);

		// Referências de adicionais: escopo (produto, variante, grupo).
		const keeperRefs = await tx.query.productAddOnReferences.findMany({ where: eq(productAddOnReferences.produtoId, input.keeperId) });
		const keeperRefScopes = new Set(keeperRefs.map((ref) => `${ref.produtoAddOnId}|${scopeKey(ref.produtoId, ref.produtoVarianteId)}`));
		const sourceRefs = await tx.query.productAddOnReferences.findMany({ where: eq(productAddOnReferences.produtoId, input.sourceId) });
		let addOnRefsMoved = 0;
		let addOnRefsDeleted = 0;
		for (const ref of sourceRefs) {
			const key = `${ref.produtoAddOnId}|${scopeKey(input.keeperId, ref.produtoVarianteId)}`;
			if (keeperRefScopes.has(key)) {
				await tx.delete(productAddOnReferences).where(eq(productAddOnReferences.id, ref.id));
				addOnRefsDeleted += 1;
			} else {
				await tx.update(productAddOnReferences).set({ produtoId: input.keeperId }).where(eq(productAddOnReferences.id, ref.id));
				keeperRefScopes.add(key);
				addOnRefsMoved += 1;
			}
		}
		registrosMovidos.productAddOnReferences = addOnRefsMoved;
		registrosMovidos.productAddOnReferencesDuplicadasRemovidas = addOnRefsDeleted;

		// Perfil fiscal ativo: um por produto/variante.
		const keeperFiscal = await tx.query.productFiscalProfiles.findMany({
			where: and(
				eq(productFiscalProfiles.organizacaoId, input.organizacaoId),
				eq(productFiscalProfiles.produtoId, input.keeperId),
				eq(productFiscalProfiles.ativo, true),
			),
		});
		const keeperFiscalScopes = new Set(keeperFiscal.map((row) => scopeKey(row.produtoId, row.produtoVarianteId)));
		const sourceFiscal = await tx.query.productFiscalProfiles.findMany({
			where: and(eq(productFiscalProfiles.organizacaoId, input.organizacaoId), eq(productFiscalProfiles.produtoId, input.sourceId)),
		});
		let fiscalMoved = 0;
		let fiscalDeleted = 0;
		for (const row of sourceFiscal) {
			const targetScope = scopeKey(input.keeperId, row.produtoVarianteId);
			if (row.ativo && keeperFiscalScopes.has(targetScope)) {
				await tx.delete(productFiscalProfiles).where(eq(productFiscalProfiles.id, row.id));
				fiscalDeleted += 1;
			} else {
				await tx.update(productFiscalProfiles).set({ produtoId: input.keeperId }).where(eq(productFiscalProfiles.id, row.id));
				if (row.ativo) keeperFiscalScopes.add(targetScope);
				fiscalMoved += 1;
			}
		}
		registrosMovidos.productFiscalProfiles = fiscalMoved;
		registrosMovidos.productFiscalProfilesDuplicadosRemovidos = fiscalDeleted;

		// Canal de venda: único por (canal, produto, variante).
		const keeperChannel = await tx.query.productChannelSettings.findMany({
			where: and(eq(productChannelSettings.organizacaoId, input.organizacaoId), eq(productChannelSettings.produtoId, input.keeperId)),
		});
		const keeperChannelScopes = new Set(keeperChannel.map((row) => `${row.canalVendaId}|${scopeKey(row.produtoId, row.produtoVarianteId)}`));
		const sourceChannel = await tx.query.productChannelSettings.findMany({
			where: and(eq(productChannelSettings.organizacaoId, input.organizacaoId), eq(productChannelSettings.produtoId, input.sourceId)),
		});
		let channelMoved = 0;
		let channelDeleted = 0;
		for (const row of sourceChannel) {
			const key = `${row.canalVendaId}|${scopeKey(input.keeperId, row.produtoVarianteId)}`;
			if (keeperChannelScopes.has(key)) {
				await tx.delete(productChannelSettings).where(eq(productChannelSettings.id, row.id));
				channelDeleted += 1;
			} else {
				await tx.update(productChannelSettings).set({ produtoId: input.keeperId }).where(eq(productChannelSettings.id, row.id));
				keeperChannelScopes.add(key);
				channelMoved += 1;
			}
		}
		registrosMovidos.productChannelSettings = channelMoved;
		registrosMovidos.productChannelSettingsDuplicadosRemovidos = channelDeleted;

		// catalog_links: identidade única por org/provider/merchant/tipo + refs internas.
		const keeperLinks = await tx.query.catalogLinks.findMany({
			where: and(eq(catalogLinks.organizacaoId, input.organizacaoId), eq(catalogLinks.produtoId, input.keeperId)),
		});
		const linkIdentity = (row: typeof catalogLinks.$inferSelect) =>
			[
				row.provider,
				row.merchantId,
				row.tipo,
				row.produtoId ?? "",
				row.produtoVarianteId ?? "",
				row.produtoAddOnId ?? "",
				row.produtoAddOnOpcaoId ?? "",
			].join("|");
		const keeperLinkKeys = new Set(keeperLinks.map(linkIdentity));
		const sourceLinks = await tx.query.catalogLinks.findMany({
			where: and(eq(catalogLinks.organizacaoId, input.organizacaoId), eq(catalogLinks.produtoId, input.sourceId)),
		});
		let linksMoved = 0;
		let linksDeleted = 0;
		for (const link of sourceLinks) {
			const hypothetical = { ...link, produtoId: input.keeperId };
			const key = linkIdentity(hypothetical);
			if (keeperLinkKeys.has(key)) {
				await tx.delete(catalogLinks).where(eq(catalogLinks.id, link.id));
				linksDeleted += 1;
			} else {
				await tx.update(catalogLinks).set({ produtoId: input.keeperId }).where(eq(catalogLinks.id, link.id));
				keeperLinkKeys.add(key);
				linksMoved += 1;
			}
		}
		registrosMovidos.catalogLinks = linksMoved;
		registrosMovidos.catalogLinksDuplicadosRemovidos = linksDeleted;

		// De-para de fornecedor: código/EAN únicos por fornecedor.
		const sourceMappings = await tx.query.supplierProductMappings.findMany({
			where: and(eq(supplierProductMappings.organizacaoId, input.organizacaoId), eq(supplierProductMappings.produtoId, input.sourceId)),
		});
		const keeperMappings = await tx.query.supplierProductMappings.findMany({
			where: and(eq(supplierProductMappings.organizacaoId, input.organizacaoId), eq(supplierProductMappings.produtoId, input.keeperId)),
		});
		const keeperByFornecedorCodigo = new Set(keeperMappings.filter((m) => m.codigoFornecedor).map((m) => `${m.fornecedorId}|${m.codigoFornecedor}`));
		const keeperByFornecedorEan = new Set(keeperMappings.filter((m) => m.ean).map((m) => `${m.fornecedorId}|${m.ean}`));
		let supplierMoved = 0;
		let supplierDeleted = 0;
		for (const mapping of sourceMappings) {
			const codigoConflict = mapping.codigoFornecedor && keeperByFornecedorCodigo.has(`${mapping.fornecedorId}|${mapping.codigoFornecedor}`);
			const eanConflict = mapping.ean && keeperByFornecedorEan.has(`${mapping.fornecedorId}|${mapping.ean}`);
			if (codigoConflict || eanConflict) {
				await tx.delete(supplierProductMappings).where(eq(supplierProductMappings.id, mapping.id));
				supplierDeleted += 1;
			} else {
				await tx.update(supplierProductMappings).set({ produtoId: input.keeperId }).where(eq(supplierProductMappings.id, mapping.id));
				if (mapping.codigoFornecedor) keeperByFornecedorCodigo.add(`${mapping.fornecedorId}|${mapping.codigoFornecedor}`);
				if (mapping.ean) keeperByFornecedorEan.add(`${mapping.fornecedorId}|${mapping.ean}`);
				supplierMoved += 1;
			}
		}
		registrosMovidos.supplierProductMappings = supplierMoved;
		registrosMovidos.supplierProductMappingsDuplicadosRemovidos = supplierDeleted;

		// Estoque agregado no produto (quando rastreado no nível do pai).
		const keeperQty = keeper.quantidade ?? 0;
		const sourceQty = source.quantidade ?? 0;
		const keeperUpdates: Partial<typeof products.$inferInsert> = {};
		if (sourceQty !== 0 && keeper.rastreamentoEstoqueAtivo) {
			keeperUpdates.quantidade = keeperQty + sourceQty;
		}
		if (!keeper.fichaTecnicaReceitaId && source.fichaTecnicaReceitaId) {
			keeperUpdates.fichaTecnicaReceitaId = source.fichaTecnicaReceitaId;
		}
		if (!keeper.imagemCapaUrl && source.imagemCapaUrl) {
			keeperUpdates.imagemCapaUrl = source.imagemCapaUrl;
		}
		if (keeper.precoVenda == null && source.precoVenda != null) {
			keeperUpdates.precoVenda = source.precoVenda;
		}
		if (keeper.precoCusto == null && source.precoCusto != null) {
			keeperUpdates.precoCusto = source.precoCusto;
		}
		if (Object.keys(keeperUpdates).length > 0) {
			await tx.update(products).set(keeperUpdates).where(eq(products.id, input.keeperId));
		}

		await tx.delete(products).where(and(eq(products.id, input.sourceId), eq(products.organizacaoId, input.organizacaoId)));
		registrosMovidos.produtoOrigemRemovido = 1;

		return {
			keeperId: input.keeperId,
			sourceId: input.sourceId,
			registrosMovidos,
			sourceSnapshot: source,
		};
	});
}
