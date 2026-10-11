import { projectAddOnReferencesToChannel } from "@/lib/products/sales-channels";
import { channelNodePrice, channelProductFilter, loadChannelState } from "@/lib/products/sales-channels-store";
import { db } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
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

	const channelState = await loadChannelState({ orgId, canal: "COMANDA" });
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
		columns: { id: true, nome: true, codigo: true, grupo: true, descricao: true, precoVenda: true, imagemCapaUrl: true },
		with: {
			variantes: {
				where: (fields, { eq: eqOp }) => eqOp(fields.ativo, true),
				orderBy: (fields, { asc }) => asc(fields.precoVenda),
				columns: { id: true, nome: true, codigo: true, precoVenda: true, imagemCapaUrl: true },
				with: {
					addOnsReferencias: {
						columns: { produtoAddOnId: true, ordem: true, minOpcoes: true, maxOpcoes: true },
						orderBy: (fields, { asc }) => asc(fields.ordem),
						with: {
							grupo: {
								columns: { id: true, nome: true, minOpcoes: true, maxOpcoes: true, ativo: true },
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
						columns: { id: true, nome: true, minOpcoes: true, maxOpcoes: true, ativo: true },
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

	return rows.map((product) => ({
		id: product.id,
		nome: product.nome,
		codigo: product.codigo,
		grupo: product.grupo,
		descricao: product.descricao,
		imagemCapaUrl: product.imagemCapaUrl,
		// Preço resolvido do canal COMANDA — o mesmo que a aprovação/lançamento vai cobrar.
		precoVenda: channelNodePrice(channelState, { produtoId: product.id, precoVenda: product.precoVenda }),
		addOnsReferencias: projectAddOnReferencesToChannel(channelState, publicReferences(product.addOnsReferencias)),
		// Linha de variante só restringe dentro de um produto visível (mesma regra do resolver).
		variantes: product.variantes
			.filter((variant) => channelState?.variantOverrides.get(variant.id)?.disponivel !== false)
			.map((variant) => ({
				id: variant.id,
				nome: variant.nome,
				codigo: variant.codigo,
				imagemCapaUrl: variant.imagemCapaUrl,
				precoVenda: channelNodePrice(channelState, { produtoId: product.id, produtoVarianteId: variant.id, precoVenda: variant.precoVenda }) ?? 0,
				addOnsReferencias: projectAddOnReferencesToChannel(channelState, publicReferences(variant.addOnsReferencias)),
			})),
	}));
}

export type TTabMenuProduct = Awaited<ReturnType<typeof getTabMenuProducts>>[number];
