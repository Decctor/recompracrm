import fs from "node:fs";
import { createCardapioWebClient, getCardapioWebCatalog } from "@/lib/data-connectors/cardapio-web";
import { extractAllCatalogData } from "@/lib/data-connectors/cardapio-web/catalog-mappers";
import type { TCardapioWebConfig } from "@/lib/data-connectors/cardapio-web/types";
import { db } from "@/services/drizzle";
import { productAddOnOptions, productAddOnReferences, productAddOns, products, utils } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { eq, inArray } from "drizzle-orm";
import type { NextApiHandler } from "next";
/**
 * Products Syncing Cron Job
 *
 * This cron job synchronizes the product catalog from external integrations.
 * Currently supports: CARDAPIO-WEB
 *
 * Runs once daily to:
 * - Upsert products (by codigo)
 * - Upsert addOns (by idExterno)
 * - Upsert addOnOptions (by idExterno)
 * - Recreate product-addOn references
 */

/**
 * Handler for CARDAPIO-WEB catalog sync.
 */
async function handleCardapioWebCatalogSync(organizationId: string, config: TCardapioWebConfig) {
	const client = createCardapioWebClient(config);

	console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] Fetching catalog from CardapioWeb...`);
	const catalog = await getCardapioWebCatalog(client);

	// Extract all mapped data
	const {
		rawCatalog,
		products: mappedProducts,
		addOns: mappedAddOns,
		addOnOptions: mappedAddOnOptions,
		productAddOnReferences: mappedReferences,
	} = extractAllCatalogData(catalog);

	await fs.writeFileSync("mappedProducts.json", JSON.stringify(mappedProducts, null, 2));

	console.log(
		`[ORG: ${organizationId}] [CATALOG-SYNC] Extracted ${mappedProducts.length} products, ${mappedAddOns.length} addOns, ${mappedAddOnOptions.length} options, ${mappedReferences.length} references`,
	);

	await db.transaction(async (tx) => {
		// ---------------------------------------------------------------------
		// PRODUCTS: Upsert by codigo
		// ---------------------------------------------------------------------
		const productCodes = mappedProducts.map((p) => p.codigo);
		const existingProducts = await tx.query.products.findMany({
			where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, organizationId), inArray(fields.codigo, productCodes)),
			columns: { id: true, codigo: true },
		});
		const existingProductsMap = new Map(existingProducts.map((p) => [p.codigo, p.id]));

		let productsCreated = 0;
		let productsUpdated = 0;

		for (const product of mappedProducts) {
			const existingId = existingProductsMap.get(product.codigo);

			if (existingId) {
				// Update existing product
				await tx
					.update(products)
					.set({
						ativo: product.ativo,
						descricao: product.descricao,
						imagemCapaUrl: product.imagemCapaUrl,
						precoVenda: product.precoVenda,
						unidade: product.unidade,
						grupo: product.grupo,
						tipo: product.tipo,
						quantidade: product.quantidade,
						dataUltimaSincronizacao: new Date(),
					})
					.where(eq(products.id, existingId));
				productsUpdated++;
			} else {
				// Insert new product
				const [inserted] = await tx
					.insert(products)
					.values({
						organizacaoId: organizationId,
						ativo: product.ativo,
						codigo: product.codigo,
						descricao: product.descricao,
						imagemCapaUrl: product.imagemCapaUrl,
						precoVenda: product.precoVenda,
						unidade: product.unidade,
						grupo: product.grupo,
						ncm: product.ncm,
						tipo: product.tipo,
						quantidade: product.quantidade,
						dataUltimaSincronizacao: new Date(),
					})
					.returning({ id: products.id });
				existingProductsMap.set(product.codigo, inserted.id);
				productsCreated++;
			}
		}

		console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] Products: ${productsCreated} created, ${productsUpdated} updated`);

		// ---------------------------------------------------------------------
		// ADDONS: Upsert by idExterno
		// ---------------------------------------------------------------------
		const addOnExternalIds = mappedAddOns.map((a) => a.idExterno);
		const existingAddOns = await tx.query.productAddOns.findMany({
			where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, organizationId), inArray(fields.idExterno, addOnExternalIds)),
			columns: { id: true, idExterno: true },
		});
		const existingAddOnsMap = new Map(existingAddOns.map((a) => [a.idExterno, a.id]));

		let addOnsCreated = 0;
		let addOnsUpdated = 0;

		for (const addOn of mappedAddOns) {
			const existingId = existingAddOnsMap.get(addOn.idExterno);

			if (existingId) {
				// Update existing addOn
				await tx
					.update(productAddOns)
					.set({
						nome: addOn.nome,
						minOpcoes: addOn.minOpcoes,
						maxOpcoes: addOn.maxOpcoes ?? 1,
					})
					.where(eq(productAddOns.id, existingId));
				addOnsUpdated++;
			} else {
				// Insert new addOn
				const [inserted] = await tx
					.insert(productAddOns)
					.values({
						organizacaoId: organizationId,
						idExterno: addOn.idExterno,
						nome: addOn.nome,
						minOpcoes: addOn.minOpcoes,
						maxOpcoes: addOn.maxOpcoes ?? 1,
					})
					.returning({ id: productAddOns.id });
				existingAddOnsMap.set(addOn.idExterno, inserted.id);
				addOnsCreated++;
			}
		}

		console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] AddOns: ${addOnsCreated} created, ${addOnsUpdated} updated`);

		// ---------------------------------------------------------------------
		// ADDON OPTIONS: Upsert by idExterno
		// ---------------------------------------------------------------------
		const optionExternalIds = mappedAddOnOptions.map((o) => o.idExterno);
		const existingOptions = await tx.query.productAddOnOptions.findMany({
			where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, organizationId), inArray(fields.idExterno, optionExternalIds)),
			columns: { id: true, idExterno: true },
		});
		const existingOptionsMap = new Map(existingOptions.map((o) => [o.idExterno, o.id]));

		let optionsCreated = 0;
		let optionsUpdated = 0;

		for (const option of mappedAddOnOptions) {
			const addOnId = existingAddOnsMap.get(option.addOnIdExterno);
			if (!addOnId) {
				console.warn(`[ORG: ${organizationId}] [CATALOG-SYNC] AddOn not found for option ${option.idExterno}, skipping`);
				continue;
			}

			const existingId = existingOptionsMap.get(option.idExterno);

			if (existingId) {
				// Update existing option
				await tx
					.update(productAddOnOptions)
					.set({
						produtoAddOnId: addOnId,
						nome: option.nome,
						codigo: option.codigo,
						precoDelta: option.precoDelta,
						maxQtdePorItem: option.maxQtdePorItem ?? 1,
					})
					.where(eq(productAddOnOptions.id, existingId));
				optionsUpdated++;
			} else {
				// Insert new option
				const [inserted] = await tx
					.insert(productAddOnOptions)
					.values({
						organizacaoId: organizationId,
						produtoAddOnId: addOnId,
						idExterno: option.idExterno,
						nome: option.nome,
						codigo: option.codigo,
						precoDelta: option.precoDelta,
						maxQtdePorItem: option.maxQtdePorItem ?? 1,
					})
					.returning({ id: productAddOnOptions.id });
				existingOptionsMap.set(option.idExterno, inserted.id);
				optionsCreated++;
			}
		}

		console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] AddOnOptions: ${optionsCreated} created, ${optionsUpdated} updated`);

		// ---------------------------------------------------------------------
		// PRODUCT-ADDON REFERENCES: Delete existing and recreate
		// ---------------------------------------------------------------------
		// Get all product IDs for this org
		const productIds = Array.from(existingProductsMap.values());

		if (productIds.length > 0) {
			// Delete existing references for these products
			await tx.delete(productAddOnReferences).where(inArray(productAddOnReferences.produtoId, productIds));
		}

		// Insert new references
		let referencesCreated = 0;
		for (const ref of mappedReferences) {
			const productId = existingProductsMap.get(ref.produtoIdExterno);
			const addOnId = existingAddOnsMap.get(ref.addOnIdExterno);

			if (productId && addOnId) {
				await tx.insert(productAddOnReferences).values({
					produtoId: productId,
					produtoAddOnId: addOnId,
					ordem: ref.ordem,
				});
				referencesCreated++;
			}
		}

		console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] ProductAddOnReferences: ${referencesCreated} created`);
	});

	console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] Completed successfully`);
}

/**
 * Main handler for products syncing cron job.
 */
const handleProductsSyncing: NextApiHandler<string> = async (req, res) => {
	console.log(`[PRODUCTS-SYNCING] Starting products sync at ${dayjs().format("YYYY-MM-DD HH:mm:ss")}`);

	const organizations = await db.query.organizations.findMany({
		columns: {
			id: true,
			integracaoTipo: true,
			integracaoConfiguracao: true,
		},
	});

	let successCount = 0;
	let errorCount = 0;

	for (const organization of organizations) {
		// Handle CARDAPIO-WEB integration
		if (organization.integracaoTipo === "CARDAPIO-WEB") {
			console.log(`[ORG: ${organization.id}] [PRODUCTS-SYNCING] Processing CardapioWeb catalog sync`);
			try {
				await handleCardapioWebCatalogSync(organization.id, organization.integracaoConfiguracao as TCardapioWebConfig);
				successCount++;
			} catch (error) {
				errorCount++;
				console.error(`[ORG: ${organization.id}] [PRODUCTS-SYNCING] Error:`, error);
				// Log error to utils table for debugging
				await db
					.insert(utils)
					.values({
						organizacaoId: organization.id,
						identificador: "CARDAPIO_WEB_IMPORTATION" as const,
						valor: {
							identificador: "CARDAPIO_WEB_IMPORTATION" as const,
							dados: {
								tipo: "CATALOG_SYNC_ERROR",
								organizacaoId: organization.id,
								data: dayjs().format("YYYY-MM-DD"),
								erro: JSON.stringify(error, Object.getOwnPropertyNames(error)),
								descricao: "Erro ao sincronizar catálogo do CardapioWeb.",
							},
						},
					})
					.returning({ id: utils.id });
			}
		}
		// Future integrations can be added here with additional else-if blocks
	}

	console.log(`[PRODUCTS-SYNCING] Completed. Success: ${successCount}, Errors: ${errorCount}`);

	res.status(200).send(`Products syncing completed. Success: ${successCount}, Errors: ${errorCount}`);
};

export default handleProductsSyncing;
