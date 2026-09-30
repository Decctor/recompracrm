import { projectAddOnReferencesToChannel } from "@/lib/products/sales-channels";
import { channelNodePrice, channelProductFilter, loadChannelState } from "@/lib/products/sales-channels-store";
import { db } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
import { and, eq, inArray, notInArray } from "drizzle-orm";

/**
 * Hidrata produtos no shape exato que a grade do PDV consome (variantes ativas + grupos de
 * adicionais ativos), para que qualquer lista de sugestão (mais pedidos, cross-sell) possa
 * fluir direto para os handlers de carrinho — produtos complexos abrem o builder modal.
 */
export async function hydratePOSProducts({ orgId, productIds, canal = "POS" }: { orgId: string; productIds: string[]; canal?: "POS" | "COMANDA" }) {
	if (productIds.length === 0) return [];

	// Disponibilidade e preço no canal: sugestões respeitam as mesmas linhas esparsas da grade.
	const channelState = await loadChannelState({ orgId, canal });
	const conditions = [eq(products.organizacaoId, orgId), eq(products.ativo, true), eq(products.vendavel, true), inArray(products.id, productIds)];
	if (channelState) {
		const filter = channelProductFilter(channelState);
		if (filter.includeIds) {
			if (filter.includeIds.length === 0) return [];
			conditions.push(inArray(products.id, filter.includeIds));
		}
		if (filter.excludeIds) conditions.push(notInArray(products.id, filter.excludeIds));
	}

	const hydrated = await db.query.products.findMany({
		where: and(...conditions),
		with: {
			variantes: {
				where: (fields, { eq: eqOp }) => eqOp(fields.ativo, true),
				orderBy: (fields, { asc }) => asc(fields.precoVenda),
				with: {
					addOnsReferencias: {
						with: {
							grupo: {
								with: {
									opcoes: {
										where: (fields, { eq: eqOp }) => eqOp(fields.ativo, true),
										orderBy: (fields, { asc }) => asc(fields.nome),
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
								where: (fields, { eq: eqOp }) => eqOp(fields.ativo, true),
								orderBy: (fields, { asc }) => asc(fields.nome),
							},
						},
					},
				},
				orderBy: (fields, { asc }) => asc(fields.ordem),
			},
		},
	});

	return hydrated.map((product) => ({
		...product,
		precoVenda: channelNodePrice(channelState, { produtoId: product.id, precoVenda: product.precoVenda }),
		// Mesma projeção da grade (GET /api/pos/products): uma sugestão não pode exigir o que a
		// grade dispensa, senão o mesmo produto bloqueia por onde foi adicionado.
		addOnsReferencias: projectAddOnReferencesToChannel(
			channelState,
			product.addOnsReferencias.filter((reference) => reference.grupo.ativo && reference.grupo.opcoes.length > 0),
		),
		variantes: product.variantes
			.filter((variant) => channelState?.variantOverrides.get(variant.id)?.disponivel !== false)
			.map((variant) => ({
				...variant,
				precoVenda: channelNodePrice(channelState, { produtoId: product.id, produtoVarianteId: variant.id, precoVenda: variant.precoVenda }) ?? 0,
				addOnsReferencias: projectAddOnReferencesToChannel(
					channelState,
					variant.addOnsReferencias.filter((reference) => reference.grupo.ativo && reference.grupo.opcoes.length > 0),
				),
			})),
	}));
}

export type THydratedPOSProduct = Awaited<ReturnType<typeof hydratePOSProducts>>[number];
