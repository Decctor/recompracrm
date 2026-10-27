import type { TProductAddOnPricingRuleEnum } from "@/schemas/enums";
import { projectAddOnReferencesToChannel } from "@/lib/products/sales-channels";
import { channelNodePrice, channelProductFilter, loadChannelState } from "@/lib/products/sales-channels-store";
import { resolvePOSProductStock } from "@/lib/pos/product-stock-display";
import { db } from "@/services/drizzle";
import { organizations, products } from "@/services/drizzle/schema";
import { and, eq, inArray, notInArray } from "drizzle-orm";

type TLoadedReference = {
	produtoAddOnId: string;
	ordem: number | null;
	minOpcoes: number | null;
	maxOpcoes: number | null;
	grupo: {
		id: string;
		nome: string;
		minOpcoes: number;
		maxOpcoes: number;
		regraPreco: TProductAddOnPricingRuleEnum;
		ativo: boolean | null;
		opcoes: {
			id: string;
			nome: string;
			precoDelta: number;
			maxQtdePorItem: number | null;
			produto: { imagemCapaUrl: string | null } | null;
			produtoVariante: { imagemCapaUrl: string | null } | null;
		}[];
	};
};

// Achata a referência para o shape público: sem `ativo` (já filtrado), sem relações de estoque
// (viraram `imagemUrl`). Grupo inativo ou sem opção sai — um grupo obrigatório vazio travaria a
// montagem, a mesma regra do PDV e da loja.
function toPublicReference(reference: TLoadedReference) {
	return {
		produtoAddOnId: reference.produtoAddOnId,
		ordem: reference.ordem,
		minOpcoes: reference.minOpcoes,
		maxOpcoes: reference.maxOpcoes,
		grupo: {
			id: reference.grupo.id,
			nome: reference.grupo.nome,
			minOpcoes: reference.grupo.minOpcoes,
			maxOpcoes: reference.grupo.maxOpcoes,
			regraPreco: reference.grupo.regraPreco,
			opcoes: reference.grupo.opcoes.map((option) => ({
				id: option.id,
				nome: option.nome,
				precoDelta: option.precoDelta,
				maxQtdePorItem: option.maxQtdePorItem,
				imagemUrl: option.produto?.imagemCapaUrl ?? option.produtoVariante?.imagemCapaUrl ?? null,
			})),
		},
	};
}

function publicReferences(references: TLoadedReference[]) {
	return references.filter((reference) => reference.grupo.ativo !== false && reference.grupo.opcoes.length > 0).map(toPublicReference);
}

/**
 * Cardápio público da comanda (QR do ponto e QR da tab): produtos ativos e vendáveis da
 * organização, respeitando a disponibilidade do canal COMANDA (linhas esparsas da matriz).
 * Canal ausente = org não materializada ainda — comporta-se como TODOS sem overrides.
 *
 * Os grupos de adicionais vêm projetados para o canal (regra do vínculo, exigência de mínimos,
 * preço e presença das opções), então a montagem no celular bloqueia exatamente o que a
 * aprovação vai recusar — é o mesmo contrato do PDV e da loja.
 *
 * `productIds` restringe a leitura aos produtos citados por uma solicitação: a aprovação e a
 * validação do POST público leem este MESMO cardápio para precificar, em vez de uma segunda
 * consulta com regras próprias. Nunca devolve custo: o shape vai para a página pública.
 */
export async function getTabMenuProducts({ orgId, productIds }: { orgId: string; productIds?: string[] }) {
	if (productIds && productIds.length === 0) return [];

	const conditions = [eq(products.organizacaoId, orgId), eq(products.ativo, true), eq(products.vendavel, true)];
	if (productIds) conditions.push(inArray(products.id, productIds));

	const [channelState, organization] = await Promise.all([
		loadChannelState({ orgId, canal: "COMANDA" }),
		db.query.organizations.findFirst({ where: eq(organizations.id, orgId), columns: { configuracao: true } }),
	]);
	// Mesma regra da baixa da venda: só bloqueia quando a organização E o item rastreiam estoque.
	const orgTracksStock = !!organization?.configuracao.preferencias.rastreamentoEstoque;
	const isAvailable = (entity: { quantidade: number | null; rastreamentoEstoqueAtivo: boolean | null }) => {
		const stock = resolvePOSProductStock({ product: entity, orgTracksStock });
		return stock === null || stock > 0;
	};
	if (channelState) {
		const filter = channelProductFilter(channelState);
		if (filter.includeIds) {
			if (filter.includeIds.length === 0) return [];
			conditions.push(inArray(products.id, filter.includeIds));
		}
		if (filter.excludeIds) conditions.push(notInArray(products.id, filter.excludeIds));
	}

	const rows = await db.query.products.findMany({
		where: and(...conditions),
		columns: {
			id: true,
			nome: true,
			codigo: true,
			grupo: true,
			descricao: true,
			precoVenda: true,
			imagemCapaUrl: true,
			quantidade: true,
			rastreamentoEstoqueAtivo: true,
		},
		with: {
			// Eixos da variação: o cardápio agrupa a escolha por eixo, como o PDV.
			opcoes: {
				columns: { id: true, nome: true, ordem: true },
				with: { valores: { columns: { id: true, nome: true, valorAuxiliar: true, ordem: true } } },
			},
			variantes: {
				where: (fields, { eq: eqOp }) => eqOp(fields.ativo, true),
				orderBy: (fields, { asc }) => asc(fields.precoVenda),
				columns: { id: true, nome: true, codigo: true, precoVenda: true, imagemCapaUrl: true, quantidade: true, rastreamentoEstoqueAtivo: true },
				with: {
					valoresOpcoes: { columns: { opcaoId: true, opcaoValorId: true } },
					addOnsReferencias: {
						columns: { produtoAddOnId: true, ordem: true, minOpcoes: true, maxOpcoes: true },
						orderBy: (fields, { asc }) => asc(fields.ordem),
						with: {
							grupo: {
								columns: { id: true, nome: true, minOpcoes: true, maxOpcoes: true, regraPreco: true, ativo: true },
								with: {
									opcoes: {
										where: (fields, { eq: eqOp }) => eqOp(fields.ativo, true),
										orderBy: (fields, { asc }) => asc(fields.nome),
										columns: { id: true, nome: true, precoDelta: true, maxQtdePorItem: true },
										// Imagem da opção = a do produto/variante vinculado para baixa de estoque (mesmo
										// atalho da loja: a opção não tem imagem própria).
										with: {
											produto: { columns: { imagemCapaUrl: true } },
											produtoVariante: { columns: { imagemCapaUrl: true } },
										},
									},
								},
							},
						},
					},
				},
			},
			addOnsReferencias: {
				where: (fields, { isNull }) => isNull(fields.produtoVarianteId),
				columns: { produtoAddOnId: true, ordem: true, minOpcoes: true, maxOpcoes: true },
				orderBy: (fields, { asc }) => asc(fields.ordem),
				with: {
					grupo: {
						columns: { id: true, nome: true, minOpcoes: true, maxOpcoes: true, regraPreco: true, ativo: true },
						with: {
							opcoes: {
								where: (fields, { eq: eqOp }) => eqOp(fields.ativo, true),
								orderBy: (fields, { asc }) => asc(fields.nome),
								columns: { id: true, nome: true, precoDelta: true, maxQtdePorItem: true },
								with: {
									produto: { columns: { imagemCapaUrl: true } },
									produtoVariante: { columns: { imagemCapaUrl: true } },
								},
							},
						},
					},
				},
			},
		},
		orderBy: (fields, { asc }) => asc(fields.nome),
	});

	return rows.map((product) => {
		// Linha de variante só restringe dentro de um produto visível (mesma regra do resolver).
		const variantes = product.variantes
			.filter((variant) => channelState?.variantOverrides.get(variant.id)?.disponivel !== false)
			.map((variant) => ({
				id: variant.id,
				nome: variant.nome,
				codigo: variant.codigo,
				imagemCapaUrl: variant.imagemCapaUrl,
				precoVenda: channelNodePrice(channelState, { produtoId: product.id, produtoVarianteId: variant.id, precoVenda: variant.precoVenda }) ?? 0,
				valoresOpcoes: variant.valoresOpcoes,
				// Página pública: diz só se dá para pedir, nunca o saldo.
				disponivel: isAvailable(variant),
				addOnsReferencias: projectAddOnReferencesToChannel(channelState, publicReferences(variant.addOnsReferencias)),
			}));
		return {
			id: product.id,
			nome: product.nome,
			codigo: product.codigo,
			grupo: product.grupo,
			descricao: product.descricao,
			imagemCapaUrl: product.imagemCapaUrl,
			// Preço resolvido do canal COMANDA — o mesmo que a aprovação/lançamento vai cobrar.
			precoVenda: channelNodePrice(channelState, { produtoId: product.id, precoVenda: product.precoVenda }),
			opcoes: product.opcoes,
			// Com variantes, o produto está disponível enquanto alguma estiver.
			disponivel: variantes.length > 0 ? variantes.some((variant) => variant.disponivel) : isAvailable(product),
			addOnsReferencias: projectAddOnReferencesToChannel(channelState, publicReferences(product.addOnsReferencias)),
			variantes,
		};
	});
}

export type TTabMenuProduct = Awaited<ReturnType<typeof getTabMenuProducts>>[number];
