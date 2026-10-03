import { db, type DBTransaction } from "@/services/drizzle";
import { productOptionValues, productOptions, productVariantOptionValues, productVariants, products } from "@/services/drizzle/schema";
import { buildPrecoVendaUpdate } from "@/lib/products/price-snapshot";
import { and, eq } from "drizzle-orm";
import { fetchAllNuvemshopProducts, mapNuvemshopStructuredCatalog, type TNuvemshopCatalogProduct } from "./index";
import type { TNuvemshopConfig } from "./types";

export async function syncNuvemshopCatalog(organizationId: string, config: TNuvemshopConfig) {
	console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] Fetching catalog from Nuvemshop...`);
	const catalogProducts = await fetchAllNuvemshopProducts(config);
	console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] Nuvemshop catalog fetched successfully`);

	const mappedProducts = mapNuvemshopStructuredCatalog(catalogProducts);
	console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] Extracted ${mappedProducts.length} Nuvemshop products`);

	if (mappedProducts.length === 0) {
		console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] No Nuvemshop products to sync`);
		return;
	}

	let productsCreated = 0;
	let productsUpdated = 0;
	let variantsUpserted = 0;

	await db.transaction(async (tx) => {
		for (const product of mappedProducts) {
			const result = await upsertCatalogProduct({ tx, organizationId, product });
			if (result.created) productsCreated++;
			else productsUpdated++;
			variantsUpserted += result.variantsUpserted;
		}
	});

	console.log(
		`[ORG: ${organizationId}] [CATALOG-SYNC] Nuvemshop products: ${productsCreated} created, ${productsUpdated} updated, ${variantsUpserted} variants upserted`,
	);
	console.log(`[ORG: ${organizationId}] [CATALOG-SYNC] Nuvemshop sync completed successfully`);
}

// Persiste um produto do catálogo como pai + (opcionalmente) eixos/valores/variantes estruturados.
// Produto pai é casado por `codigo` (a tabela products não tem id_externo); variantes por id_externo
// (variant_id), com fallback no código (SKU). Eixos e valores são casados por nome dentro do produto.
async function upsertCatalogProduct({
	tx,
	organizationId,
	product,
}: {
	tx: DBTransaction;
	organizationId: string;
	product: TNuvemshopCatalogProduct;
}): Promise<{ created: boolean; variantsUpserted: number }> {
	const productValues = {
		ativo: product.ativo,
		codigo: product.codigo,
		nome: product.nome,
		descricao: product.descricao,
		imagemCapaUrl: product.imagemCapaUrl,
		precoCusto: product.precoCusto,
		unidade: product.unidade,
		grupo: product.grupo,
		ncm: product.ncm,
		tipo: product.tipo,
		quantidade: product.quantidade,
		rastreamentoEstoqueAtivo: product.controlaEstoque,
		dataUltimaSincronizacao: new Date(),
	};

	const existingProduct = await tx.query.products.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizationId), eq(fields.codigo, product.codigo)),
		columns: { id: true, precoVenda: true, precoVendaAnterior: true, codigoBarras: true },
	});

	let productId: string;
	let created = false;
	if (existingProduct) {
		// A Nuvem Shop já entrega o preço promocional como preço de venda (`variantSalePrice`): com o
		// snapshot, o início de uma promoção vira "De / Por" automaticamente.
		await tx
			.update(products)
			.set({
				...productValues,
				...buildPrecoVendaUpdate({ atual: existingProduct, novoPrecoVenda: product.precoVenda }),
				// GTIN ausente/inválido na loja não apaga o que foi cadastrado no app.
				codigoBarras: product.codigoBarras ?? existingProduct.codigoBarras,
			})
			.where(eq(products.id, existingProduct.id));
		productId = existingProduct.id;
	} else {
		const [insertedProduct] = await tx
			.insert(products)
			.values({ organizacaoId: organizationId, ...productValues, precoVenda: product.precoVenda, codigoBarras: product.codigoBarras })
			.returning({ id: products.id });
		if (!insertedProduct?.id) throw new Error(`Falha ao criar produto do catálogo Nuvem Shop (codigo=${product.codigo}).`);
		productId = insertedProduct.id;
		created = true;
	}

	// Produto simples: sem eixos, nada mais a fazer.
	if (product.options.length === 0) {
		return { created, variantsUpserted: 0 };
	}

	// 1. Upsert dos eixos e valores (casados por nome), construindo mapas nome -> id real.
	const optionNameToId = new Map<string, string>();
	const valueKeyToId = new Map<string, string>(); // chave: `${nomeEixo}|::|${nomeValor}`
	const valueKey = (optionName: string, valueName: string) => `${optionName}|::|${valueName}`;

	const existingOptions = await tx.query.productOptions.findMany({
		where: (fields, { eq }) => eq(fields.produtoId, productId),
		columns: { id: true, nome: true },
		with: { valores: { columns: { id: true, nome: true } } },
	});
	const existingOptionByName = new Map(existingOptions.map((option) => [option.nome, option]));

	for (const [axisIndex, option] of product.options.entries()) {
		let optionId: string;
		const existingOption = existingOptionByName.get(option.nome);
		if (existingOption) {
			await tx.update(productOptions).set({ ordem: axisIndex, tipo: "TEXTO" }).where(eq(productOptions.id, existingOption.id));
			optionId = existingOption.id;
		} else {
			const [insertedOption] = await tx
				.insert(productOptions)
				.values({ organizacaoId: organizationId, produtoId: productId, nome: option.nome, tipo: "TEXTO", ordem: axisIndex })
				.returning({ id: productOptions.id });
			if (!insertedOption?.id) throw new Error(`Falha ao criar eixo de variação "${option.nome}".`);
			optionId = insertedOption.id;
		}
		optionNameToId.set(option.nome, optionId);

		const existingValueByName = new Map((existingOption?.valores ?? []).map((value) => [value.nome, value.id]));
		for (const [valueIndex, valueName] of option.valores.entries()) {
			let valueId = existingValueByName.get(valueName) ?? null;
			if (valueId) {
				await tx.update(productOptionValues).set({ ordem: valueIndex }).where(eq(productOptionValues.id, valueId));
			} else {
				const [insertedValue] = await tx
					.insert(productOptionValues)
					.values({ organizacaoId: organizationId, opcaoId: optionId, nome: valueName, ordem: valueIndex })
					.returning({ id: productOptionValues.id });
				if (!insertedValue?.id) throw new Error(`Falha ao criar valor de variação "${valueName}".`);
				valueId = insertedValue.id;
			}
			valueKeyToId.set(valueKey(option.nome, valueName), valueId);
		}
	}

	// 2. Upsert das variantes (casadas por id_externo, fallback por código), e suas junções.
	const existingVariants = await tx.query.productVariants.findMany({
		where: (fields, { eq }) => eq(fields.produtoId, productId),
		columns: { id: true, idExterno: true, codigo: true, precoVenda: true, precoVendaAnterior: true, codigoBarras: true },
	});
	const variantByExternal = new Map(existingVariants.filter((v) => v.idExterno).map((v) => [v.idExterno as string, v]));
	const variantByCode = new Map(existingVariants.filter((v) => v.codigo).map((v) => [v.codigo as string, v]));

	let variantsUpserted = 0;
	for (const variant of product.variants) {
		const variantValues = {
			idExterno: variant.idExterno,
			nome: variant.nome,
			codigo: variant.codigo,
			imagemCapaUrl: variant.imagemCapaUrl,
			precoCusto: variant.precoCusto,
			quantidade: variant.quantidade,
			ativo: variant.ativo,
			rastreamentoEstoqueAtivo: variant.controlaEstoque,
		};

		const existingVariant = variantByExternal.get(variant.idExterno) ?? variantByCode.get(variant.codigo) ?? null;
		let variantId: string;
		if (existingVariant) {
			variantId = existingVariant.id;
			await tx
				.update(productVariants)
				.set({
					...variantValues,
					...buildPrecoVendaUpdate({ atual: existingVariant, novoPrecoVenda: variant.precoVenda }),
					codigoBarras: variant.codigoBarras ?? existingVariant.codigoBarras,
				})
				.where(eq(productVariants.id, existingVariant.id));
		} else {
			const [insertedVariant] = await tx
				.insert(productVariants)
				.values({
					organizacaoId: organizationId,
					produtoId: productId,
					...variantValues,
					precoVenda: variant.precoVenda,
					codigoBarras: variant.codigoBarras,
				})
				.returning({ id: productVariants.id });
			if (!insertedVariant?.id) throw new Error(`Falha ao criar variante (codigo=${variant.codigo}).`);
			variantId = insertedVariant.id;
		}
		variantsUpserted++;

		// Junções: substitui o conjunto pela combinação atual da variante.
		await tx
			.delete(productVariantOptionValues)
			.where(and(eq(productVariantOptionValues.produtoVarianteId, variantId), eq(productVariantOptionValues.organizacaoId, organizationId)));
		for (const valor of variant.valores) {
			const opcaoId = optionNameToId.get(valor.opcao);
			const opcaoValorId = valueKeyToId.get(valueKey(valor.opcao, valor.valor));
			if (!opcaoId || !opcaoValorId) continue;
			await tx.insert(productVariantOptionValues).values({ organizacaoId: organizationId, produtoVarianteId: variantId, opcaoId, opcaoValorId });
		}
	}

	return { created, variantsUpserted };
}
