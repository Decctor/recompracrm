import { db } from "@/services/drizzle";
import { productAddOnOptions, productAddOnReferences, productAddOns, products } from "@/services/drizzle/schema";
import { buildSalePriceUpdate } from "@/lib/products/price-snapshot";
import { withProductUpdateStamp } from "@/lib/products/update-stamp";
import { eq, inArray } from "drizzle-orm";
import { createCardapioWebClient, getCardapioWebCatalog } from "./index";
import { extractAllCatalogData } from "./catalog-mappers";
import type { TCardapioWebConfig } from "./types";

export async function syncCardapioWebCatalog(organizationId: string, config: TCardapioWebConfig) {
	const client = createCardapioWebClient(config);

	console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] Fetching catalog from CardapioWeb...`);
	const catalog = await getCardapioWebCatalog(client);
	console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] Catalog fetched successfully`);

	const {
		products: mappedProducts,
		addOns: mappedAddOns,
		addOnOptions: mappedAddOnOptions,
		productAddOnReferences: mappedReferences,
	} = extractAllCatalogData(catalog);

	console.log(
		`[ORG: ${organizationId}] [CATALOG-SYNC] Extracted ${mappedProducts.length} products, ${mappedAddOns.length} addOns, ${mappedAddOnOptions.length} options, ${mappedReferences.length} references`,
	);

	await db.transaction(async (tx) => {
		const productCodes = [...new Set(mappedProducts.flatMap((product) => [product.codigo, product.idExterno]))];
		const existingProducts = await tx.query.products.findMany({
			where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, organizationId), inArray(fields.codigo, productCodes)),
			columns: { id: true, codigo: true, precoVenda: true, precoVendaAnterior: true },
		});
		const existingProductsByCode = new Map(existingProducts.map((product) => [product.codigo, product]));
		const existingProductsMap = new Map<string, string>();

		let productsCreated = 0;
		let productsUpdated = 0;

		for (const product of mappedProducts) {
			const existingProduct = existingProductsByCode.get(product.codigo) ?? existingProductsByCode.get(product.idExterno);

			if (existingProduct) {
				await tx
					.update(products)
					.set(withProductUpdateStamp({
						ativo: product.ativo,
						codigo: product.codigo,
						nome: product.nome,
						descricao: product.descricao,
						imagemCapaUrl: product.imagemCapaUrl,
						...buildSalePriceUpdate({ current: existingProduct, next: { precoVenda: product.precoVenda } }),
						precoCusto: product.precoCusto,
						unidade: product.unidade,
						grupo: product.grupo,
						tipo: product.tipo,
						quantidade: product.quantidade,
						dataUltimaSincronizacao: new Date(),
					}))
					.where(eq(products.id, existingProduct.id));
				existingProductsMap.set(product.idExterno, existingProduct.id);
				productsUpdated++;
			} else {
				const [inserted] = await tx
					.insert(products)
					.values({
						organizacaoId: organizationId,
						ativo: product.ativo,
						codigo: product.codigo,
						nome: product.nome,
						descricao: product.descricao,
						imagemCapaUrl: product.imagemCapaUrl,
						precoVenda: product.precoVenda,
						precoCusto: product.precoCusto,
						unidade: product.unidade,
						grupo: product.grupo,
						ncm: product.ncm,
						tipo: product.tipo,
						quantidade: product.quantidade,
						dataUltimaSincronizacao: new Date(),
					})
					.returning({ id: products.id });
				existingProductsMap.set(product.idExterno, inserted.id);
				productsCreated++;
			}
		}

		console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] Products: ${productsCreated} created, ${productsUpdated} updated`);

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
				await tx
					.update(productAddOns)
					.set({
						nome: addOn.nome,
						minOpcoes: addOn.minOpcoes,
						maxOpcoes: addOn.maxOpcoes ?? 1,
						ativo: addOn.ativo,
					})
					.where(eq(productAddOns.id, existingId));
				addOnsUpdated++;
			} else {
				const [inserted] = await tx
					.insert(productAddOns)
					.values({
						organizacaoId: organizationId,
						idExterno: addOn.idExterno,
						nome: addOn.nome,
						minOpcoes: addOn.minOpcoes,
						maxOpcoes: addOn.maxOpcoes ?? 1,
						ativo: addOn.ativo,
					})
					.returning({ id: productAddOns.id });
				existingAddOnsMap.set(addOn.idExterno, inserted.id);
				addOnsCreated++;
			}
		}

		console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] AddOns: ${addOnsCreated} created, ${addOnsUpdated} updated`);

		const optionExternalIds = mappedAddOnOptions.flatMap((option) => [option.idExterno, option.idExterno.split(":").at(-1) as string]);
		const existingOptions = await tx.query.productAddOnOptions.findMany({
			where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, organizationId), inArray(fields.idExterno, optionExternalIds)),
			columns: { id: true, idExterno: true, produtoAddOnId: true },
		});
		const addOnExternalIdsById = new Map(Array.from(existingAddOnsMap.entries()).map(([externalId, id]) => [id, externalId]));
		const existingOptionsMap = new Map<string, string>();
		for (const option of existingOptions) {
			if (option.idExterno) existingOptionsMap.set(option.idExterno, option.id);
		}
		const existingLegacyOptionsMap = new Map(
			existingOptions
				.filter((option) => option.idExterno && !option.idExterno.includes(":"))
				.map((option) => [`${addOnExternalIdsById.get(option.produtoAddOnId)}:${option.idExterno}`, option.id]),
		);

		let optionsCreated = 0;
		let optionsUpdated = 0;

		for (const option of mappedAddOnOptions) {
			const addOnId = existingAddOnsMap.get(option.addOnIdExterno);
			if (!addOnId) {
				console.warn(`[ORG: ${organizationId}] [CATALOG-SYNC] AddOn not found for option ${option.idExterno}, skipping`);
				continue;
			}

			const existingId = existingOptionsMap.get(option.idExterno) ?? existingLegacyOptionsMap.get(option.idExterno);
			const productId = option.produtoIdExterno ? existingProductsMap.get(option.produtoIdExterno) : null;

			if (existingId) {
				await tx
					.update(productAddOnOptions)
					.set({
						produtoAddOnId: addOnId,
						idExterno: option.idExterno,
						nome: option.nome,
						codigo: option.codigo,
						precoDelta: option.precoDelta,
						maxQtdePorItem: option.maxQtdePorItem ?? 1,
						produtoId: productId ?? null,
						ativo: option.ativo,
					})
					.where(eq(productAddOnOptions.id, existingId));
				optionsUpdated++;
			} else {
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
						produtoId: productId ?? null,
						ativo: option.ativo,
					})
					.returning({ id: productAddOnOptions.id });
				existingOptionsMap.set(option.idExterno, inserted.id);
				optionsCreated++;
			}
		}

		console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] AddOnOptions: ${optionsCreated} created, ${optionsUpdated} updated`);

		const productIds = Array.from(existingProductsMap.values());

		if (productIds.length > 0) {
			await tx.delete(productAddOnReferences).where(inArray(productAddOnReferences.produtoId, productIds));
		}

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
