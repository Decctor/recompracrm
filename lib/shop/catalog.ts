import { db } from "@/services/drizzle";
import { productAddOnReferences, products, saleItems, sales } from "@/services/drizzle/schema";
import { and, desc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { projectAddOnReferencesToChannel } from "@/lib/products/sales-channels";
import { type TChannelState, channelNodePrice, channelProductFilter, loadChannelState } from "@/lib/products/sales-channels-store";
import type { TShopSettingsConfiguration } from "@/schemas/shop";

export const SHOP_MOST_ORDERED_DAYS = 90;

// O gate de preço > 0 NÃO fica no SQL: um override de canal pode tornar vendável um produto com
// preço base zerado, então o gate roda sobre o preço RESOLVIDO, no filtro em JS abaixo.
function getProductEligibilityConditions(orgId: string) {
	return [eq(products.organizacaoId, orgId), eq(products.ativo, true), eq(products.vendavel, true)];
}

export function productIsAvailableForShop(product: { rastreamentoEstoqueAtivo: boolean | null; quantidade: number | null }) {
	return !product.rastreamentoEstoqueAtivo || (product.quantidade ?? 0) > 0;
}

export function variantIsAvailableForShop(variant: { rastreamentoEstoqueAtivo: boolean | null; quantidade: number | null }) {
	return !variant.rastreamentoEstoqueAtivo || (variant.quantidade ?? 0) > 0;
}

export async function getShopCatalogProducts({
	orgId,
	configuracoes,
	channelState: providedChannelState,
}: {
	orgId: string;
	configuracoes: TShopSettingsConfiguration;
	// Quem já leu o estado do canal (a página da loja precisa dele para ordenar os grupos) passa
	// adiante em vez de pagar a mesma consulta duas vezes. Ausente = carrega aqui.
	channelState?: TChannelState | null;
}) {
	const conditions = getProductEligibilityConditions(orgId);
	const channelState = providedChannelState !== undefined ? providedChannelState : await loadChannelState({ orgId, canal: "SHOP" });

	if (channelState) {
		// Fonte nova: modo do canal + linhas esparsas de disponibilidade.
		const filter = channelProductFilter(channelState);
		if (filter.includeIds) {
			if (filter.includeIds.length === 0) return [];
			conditions.push(inArray(products.id, filter.includeIds));
		}
		if (filter.excludeIds) conditions.push(notInArray(products.id, filter.excludeIds));
	} else {
		// Caminho legado (dual-read): o bloco produtos do jsonb ainda é a fonte enquanto a org
		// não tem o canal SHOP materializado. Remover junto com o bloco modo/produtoIds do jsonb.
		const selectedProductIds = configuracoes.produtos.produtoIds;

		if (configuracoes.produtos.modo === "INCLUIR") {
			if (selectedProductIds.length === 0) return [];
			conditions.push(inArray(products.id, selectedProductIds));
		}

		if (configuracoes.produtos.modo === "EXCLUIR" && selectedProductIds.length > 0) {
			conditions.push(notInArray(products.id, selectedProductIds));
		}
	}

	const productsResult = await db.query.products.findMany({
		where: and(...conditions),
		with: {
			variantes: {
				where: (fields, { eq, gt, or, isNull, and }) =>
					and(eq(fields.ativo, true), or(eq(fields.rastreamentoEstoqueAtivo, false), isNull(fields.rastreamentoEstoqueAtivo), gt(fields.quantidade, 0))),
				orderBy: (fields, { asc }) => asc(fields.precoVenda),
				with: {
					addOnsReferencias: {
						with: {
							grupo: {
								with: {
									opcoes: {
										where: (fields, { eq }) => eq(fields.ativo, true),
										orderBy: (fields, { asc }) => asc(fields.nome),
										with: {
											produto: { columns: { imagemCapaUrl: true } },
											produtoVariante: { columns: { imagemCapaUrl: true } },
										},
									},
								},
							},
						},
						orderBy: (fields, { asc }) => asc(fields.ordem),
					},
				},
			},
			addOnsReferencias: {
				where: (fields, { isNull }) => isNull(fields.produtoVarianteId),
				with: {
					grupo: {
						with: {
							opcoes: {
								where: (fields, { eq }) => eq(fields.ativo, true),
								orderBy: (fields, { asc }) => asc(fields.nome),
								with: {
									produto: { columns: { imagemCapaUrl: true } },
									produtoVariante: { columns: { imagemCapaUrl: true } },
								},
							},
						},
					},
				},
				orderBy: (fields, { asc }) => asc(fields.ordem),
			},
		},
		orderBy: (fields, { asc }) => asc(fields.nome),
	});

	return (
		productsResult
			.filter(productIsAvailableForShop)
			.map((product) => ({
				...product,
				// Preço resolvido do canal: exibição e cobrança mudam juntas — o pedido precifica a
				// partir deste mesmo catálogo (catalogProductMap na rota de orders).
				precoVenda: channelNodePrice(channelState, { produtoId: product.id, precoVenda: product.precoVenda }),
				// Grupos sob as regras do canal SHOP (mínimos, preço e disponibilidade das opções). Como a
				// rota de pedidos valida contra ESTE mesmo catálogo, a exigência e o preço que a sacola
				// mostra são os que o servidor cobra — sem segunda leitura.
				addOnsReferencias: projectAddOnReferencesToChannel(
					channelState,
					product.addOnsReferencias.filter((reference) => reference.grupo.ativo && reference.grupo.opcoes.length > 0),
				),
				variantes: product.variantes
					.filter(variantIsAvailableForShop)
					// Linha de variante só restringe dentro de um produto visível (mesma regra do resolver).
					.filter((variant) => channelState?.variantOverrides.get(variant.id)?.disponivel !== false)
					.map((variant) => ({
						...variant,
						precoVenda: channelNodePrice(channelState, { produtoId: product.id, produtoVarianteId: variant.id, precoVenda: variant.precoVenda }) ?? 0,
						addOnsReferencias: projectAddOnReferencesToChannel(
							channelState,
							variant.addOnsReferencias.filter((reference) => reference.grupo.ativo && reference.grupo.opcoes.length > 0),
						),
					}))
					.filter((variant) => variant.precoVenda > 0),
			}))
			// Gate de preço da loja, sobre o preço RESOLVIDO (política do canal SHOP).
			.filter((product) => (product.precoVenda ?? 0) > 0)
	);
}

export type TShopCatalogProduct = Awaited<ReturnType<typeof getShopCatalogProducts>>[number];

export async function getMostOrderedShopProductIds({ orgId, limit = 12 }: { orgId: string; limit?: number }) {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - SHOP_MOST_ORDERED_DAYS);

	const result = await db
		.select({
			produtoId: saleItems.produtoId,
			totalQuantidade: sql<number>`sum(${saleItems.quantidade})`,
		})
		.from(saleItems)
		.innerJoin(sales, eq(saleItems.vendaId, sales.id))
		.where(and(eq(sales.organizacaoId, orgId), eq(sales.statusVenda, "CONFIRMADA"), gt(sales.dataVenda, cutoff)))
		.groupBy(saleItems.produtoId)
		.orderBy(desc(sql`sum(${saleItems.quantidade})`))
		.limit(limit);

	return result.map((item) => item.produtoId);
}

export function orderProductsByIds<T extends { id: string }>(items: T[], ids: string[]) {
	const orderMap = new Map(ids.map((id, index) => [id, index]));
	return items
		.filter((item) => orderMap.has(item.id))
		.toSorted((a, b) => (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

export async function getShopProductReferencesForValidation(productIds: string[], variantIds: string[]) {
	const [productRows, variantRows, referenceRows] = await Promise.all([
		productIds.length
			? db.query.products.findMany({
					where: (fields, { inArray }) => inArray(fields.id, productIds),
					with: {
						addOnsReferencias: {
							where: (fields, { isNull }) => isNull(fields.produtoVarianteId),
							with: {
								grupo: {
									with: {
										opcoes: true,
									},
								},
							},
						},
					},
				})
			: [],
		variantIds.length
			? db.query.productVariants.findMany({
					where: (fields, { inArray }) => inArray(fields.id, variantIds),
					with: {
						addOnsReferencias: {
							with: {
								grupo: {
									with: {
										opcoes: true,
									},
								},
							},
						},
					},
				})
			: [],
		productIds.length || variantIds.length
			? db
					.select()
					.from(productAddOnReferences)
					.where(
						and(
							productIds.length ? inArray(productAddOnReferences.produtoId, productIds) : sql`true`,
							variantIds.length ? inArray(productAddOnReferences.produtoVarianteId, variantIds) : sql`true`,
						),
					)
			: [],
	]);

	return { productRows, variantRows, referenceRows };
}
