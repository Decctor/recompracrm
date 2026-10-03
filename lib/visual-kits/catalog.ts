import { PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS, resolvePromotion } from "@/lib/products/pricing";
import { buildProductSearch, withProductSearch, type ProductSearchDatabase } from "@/lib/products/search";
import { formatProductContent, resolveUnitPrice, resolveVariantContent } from "@/lib/products/unit-price";
import { db } from "@/services/drizzle";
import { productChannelSettings, products, productVariants, salesChannels } from "@/services/drizzle/schema";
import { and, asc, desc, eq, exists, gte, inArray, isNotNull, or, type SQL } from "drizzle-orm";
import { parseVisualKitItemKey, type TVisualKitCatalogItem, visualKitItemKey } from "./types";

export const VISUAL_KIT_CATALOG_PAGE_SIZE = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

type TLoadVisualKitCatalogParams = {
	organizationId: string;
	salesChannelId: string | null;
	now?: Date;
} & ({ mode: "SEARCH"; search: string[]; promotionsOnly: boolean; limit?: number } | { mode: "KEYS"; keys: string[] });

/**
 * Catálogo para o construtor de kits e para a renderização das peças: preço efetivo do canal do kit
 * (override do nó, senão o base), promoção resolvida contra o anterior do preço base e textos do
 * cadastro (conteúdo, preço por unidade, GTIN). Produtos com variantes ativas entram por variante.
 */
export async function loadVisualKitCatalog(params: TLoadVisualKitCatalogParams): Promise<{ items: TVisualKitCatalogItem[]; truncated: boolean }> {
	const terms = params.mode === "SEARCH" ? params.search : [];
	return withProductSearch(db, terms, (database) => queryCatalog(database, params));
}

async function queryCatalog(database: ProductSearchDatabase, params: TLoadVisualKitCatalogParams) {
	const now = params.now ?? new Date();
	const conditions: SQL[] = [eq(products.organizacaoId, params.organizationId), eq(products.ativo, true), eq(products.vendavel, true)];

	let requestedKeys: Set<string> | null = null;
	let orderBy: SQL[] = [asc(products.nome)];
	let limit: number | undefined;

	if (params.mode === "KEYS") {
		const parsed = params.keys.map(parseVisualKitItemKey).filter((key) => key !== null);
		if (parsed.length === 0) return { items: [], truncated: false };
		requestedKeys = new Set(parsed.map(visualKitItemKey));
		conditions.push(inArray(products.id, [...new Set(parsed.map((key) => key.produtoId))]));
	} else {
		const search = buildProductSearch(params.search, products);
		if (search.condition) {
			conditions.push(search.condition);
			orderBy = [desc(search.relevance), asc(products.nome)];
		}
		if (params.promotionsOnly) {
			// Pré-filtro necessário (não suficiente): só há promoção com anterior registrado dentro da
			// janela. A comparação exata com o preço do canal acontece depois, em `resolvePromotion`.
			const cutoff = new Date(now.getTime() - PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS * DAY_MS);
			const recentPrevious = or(
				and(isNotNull(products.precoVendaAnterior), gte(products.dataAlteracaoPrecoVenda, cutoff)),
				exists(
					database
						.select({ id: productVariants.id })
						.from(productVariants)
						.where(
							and(
								eq(productVariants.produtoId, products.id),
								eq(productVariants.ativo, true),
								isNotNull(productVariants.precoVendaAnterior),
								gte(productVariants.dataAlteracaoPrecoVenda, cutoff),
							),
						),
				),
			);
			if (recentPrevious) conditions.push(recentPrevious);
		}
		limit = (params.limit ?? VISUAL_KIT_CATALOG_PAGE_SIZE) + 1;
	}

	const rows = await database.query.products.findMany({
		where: and(...conditions),
		orderBy,
		limit,
		columns: {
			id: true,
			nome: true,
			codigo: true,
			codigoBarras: true,
			grupo: true,
			unidade: true,
			imagemCapaUrl: true,
			precoVenda: true,
			precoVendaAnterior: true,
			dataAlteracaoPrecoVenda: true,
			conteudoQuantidade: true,
			conteudoUnidade: true,
		},
		with: {
			variantes: {
				where: (variant, { eq: equals }) => equals(variant.ativo, true),
				columns: {
					id: true,
					nome: true,
					codigo: true,
					codigoBarras: true,
					imagemCapaUrl: true,
					precoVenda: true,
					precoVendaAnterior: true,
					dataAlteracaoPrecoVenda: true,
					conteudoQuantidade: true,
				},
			},
		},
	});

	const truncated = limit != null && rows.length >= limit;
	const productRows = truncated ? rows.slice(0, limit! - 1) : rows;

	const channelPrices = await loadChannelPrices(database, {
		organizationId: params.organizationId,
		salesChannelId: params.salesChannelId,
		productIds: productRows.map((row) => row.id),
	});

	const items: TVisualKitCatalogItem[] = [];
	for (const product of productRows) {
		const nodes =
			product.variantes.length > 0
				? product.variantes.map((variant) => ({
						produtoVarianteId: variant.id,
						varianteNome: variant.nome,
						codigo: variant.codigo || product.codigo,
						// GTIN não é herdado: SKU diferente é outro código de barras.
						codigoBarras: variant.codigoBarras,
						imagemUrl: variant.imagemCapaUrl ?? product.imagemCapaUrl,
						precoBase: variant.precoVenda,
						precoVendaAnterior: variant.precoVendaAnterior,
						dataAlteracaoPrecoVenda: variant.dataAlteracaoPrecoVenda,
						conteudo: resolveVariantContent(product, variant),
					}))
				: [
						{
							produtoVarianteId: null,
							varianteNome: null,
							codigo: product.codigo,
							codigoBarras: product.codigoBarras,
							imagemUrl: product.imagemCapaUrl,
							precoBase: product.precoVenda,
							precoVendaAnterior: product.precoVendaAnterior,
							dataAlteracaoPrecoVenda: product.dataAlteracaoPrecoVenda,
							conteudo: { conteudoQuantidade: product.conteudoQuantidade, conteudoUnidade: product.conteudoUnidade },
						},
					];

		for (const node of nodes) {
			const chave = visualKitItemKey({ produtoId: product.id, produtoVarianteId: node.produtoVarianteId });
			if (requestedKeys && !requestedKeys.has(chave)) continue;

			const preco = channelPrices.get(chave) ?? node.precoBase;
			const promocao = resolvePromotion({
				currentPrice: preco,
				precoVendaAnterior: node.precoVendaAnterior,
				dataAlteracaoPrecoVenda: node.dataAlteracaoPrecoVenda,
				now,
			});
			if (params.mode === "SEARCH" && params.promotionsOnly && !promocao.emPromocao) continue;

			items.push({
				chave,
				produtoId: product.id,
				produtoVarianteId: node.produtoVarianteId,
				produtoNome: product.nome,
				varianteNome: node.varianteNome,
				nome: node.varianteNome ? `${product.nome} · ${node.varianteNome}` : product.nome,
				detalhe: formatProductContent(node.conteudo),
				grupo: product.grupo,
				codigo: node.codigo,
				codigoBarras: node.codigoBarras,
				imagemUrl: node.imagemUrl,
				unidade: product.unidade,
				preco,
				precoBase: node.precoBase,
				precoVendaAnterior: node.precoVendaAnterior,
				promocao,
				precoUnidade: resolveUnitPrice({ preco, ...node.conteudo }),
			});
		}
	}

	return { items, truncated };
}

/** Overrides de preço do canal do kit, por chave de item. Canal de outra organização é ignorado. */
async function loadChannelPrices(
	database: ProductSearchDatabase,
	{ organizationId, salesChannelId, productIds }: { organizationId: string; salesChannelId: string | null; productIds: string[] },
) {
	const prices = new Map<string, number>();
	if (!salesChannelId || productIds.length === 0) return prices;

	const rows = await database
		.select({
			produtoId: productChannelSettings.produtoId,
			produtoVarianteId: productChannelSettings.produtoVarianteId,
			precoVenda: productChannelSettings.precoVenda,
		})
		.from(productChannelSettings)
		.innerJoin(salesChannels, eq(salesChannels.id, productChannelSettings.canalVendaId))
		.where(
			and(
				eq(productChannelSettings.canalVendaId, salesChannelId),
				eq(salesChannels.organizacaoId, organizationId),
				inArray(productChannelSettings.produtoId, productIds),
				isNotNull(productChannelSettings.precoVenda),
			),
		);

	for (const row of rows) {
		if (row.precoVenda != null) prices.set(visualKitItemKey(row), row.precoVenda);
	}
	return prices;
}
