import type { THydratedPOSProduct } from "@/lib/pos/hydrate-pos-products";

// Projeção de um produto do canal (PDV ou comanda) no formato que o terminal consome: a listagem do
// catálogo e a leitura de código de barras devolvem exatamente o mesmo shape, então o app monta o
// item lido pelo mesmo caminho do item tocado na grade.

type TTerminalAddOnReference = THydratedPOSProduct["addOnsReferencias"][number];

function toTerminalAddOnGroups(references: TTerminalAddOnReference[]) {
	return references.map(({ grupo }) => ({
		id: grupo.id,
		nome: grupo.nome,
		minOpcoes: grupo.minOpcoes,
		maxOpcoes: grupo.maxOpcoes,
		regraPreco: grupo.regraPreco,
		opcoes: grupo.opcoes.map((opcao) => ({ id: opcao.id, nome: opcao.nome, precoDelta: opcao.precoDelta, maxQtdePorItem: opcao.maxQtdePorItem })),
	}));
}

export function toTerminalCatalogProduct(product: THydratedPOSProduct) {
	return {
		id: product.id,
		nome: product.nome,
		codigo: product.codigo,
		grupo: product.grupo,
		imagemUrl: product.imagemCapaUrl,
		precoVenda: product.precoVenda,
		gruposAdicionais: toTerminalAddOnGroups(product.addOnsReferencias),
		// Compatibilidade: versões do app anteriores aos grupos bloqueiam o produto com este flag.
		possuiAdicionais: product.addOnsReferencias.length > 0,
		variantes: product.variantes.map((variant) => ({
			id: variant.id,
			nome: variant.nome,
			codigo: variant.codigo,
			// Foto própria da variação (a cor da camiseta); o app cai na foto do produto quando é nula.
			imagemUrl: variant.imagemCapaUrl,
			precoVenda: variant.precoVenda,
			gruposAdicionais: toTerminalAddOnGroups(variant.addOnsReferencias),
			possuiAdicionais: variant.addOnsReferencias.length > 0,
		})),
	};
}
export type TTerminalCatalogProduct = ReturnType<typeof toTerminalCatalogProduct>;
