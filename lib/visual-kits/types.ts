import type { TPromotionResolution } from "@/lib/products/pricing";
import type { TVisualKitConfig } from "@/schemas/visual-kits";

/** Identidade visual aplicada às peças (cores sempre resolvidas, com contraste garantido). */
export type TVisualKitBrand = {
	nome: string;
	logoUrl: string | null;
	corPrimaria: string;
	corPrimariaForeground: string;
	corSecundaria: string;
	corSecundariaForeground: string;
};

/**
 * Um produto (ou variante) pronto para ir para uma peça: preço efetivo do canal, promoção já
 * resolvida e textos derivados do cadastro. Montado no servidor (`lib/visual-kits/catalog.ts`).
 */
export type TVisualKitPieceItem = {
	chave: string; // `${produtoId}:${produtoVarianteId ?? ""}`
	produtoId: string;
	produtoVarianteId: string | null;
	nome: string; // "Shampoo Anticaspa" ou "Camiseta Básica · Preta / G"
	detalhe: string | null; // conteúdo da embalagem ("200 ml"), quando cadastrado
	grupo: string;
	codigo: string;
	codigoBarras: string | null; // GTIN validado; nulo = peça sem código de barras
	imagemUrl: string | null;
	unidade: string; // unidade comercial (UN, CX, KG…) — "por CX"
	preco: number; // preço efetivo onde a peça é exibida (canal do kit, senão base)
	promocao: TPromotionResolution;
	precoUnidade: { valor: number; rotulo: string } | null; // "R$ 0,99 por comprimido"
};

/** Tudo que uma peça precisa para renderizar. */
export type TVisualKitPieceProps = {
	itens: TVisualKitPieceItem[];
	chamada: string; // título da peça ("Ofertas da semana")
	validadeFim: Date | string | null;
	marca: TVisualKitBrand;
	opcoes: TVisualKitConfig;
};

/** Uma página/imagem de uma peça. Folhas A4 agrupam vários itens; posts têm um item cada. */
export type TVisualKitPage = {
	indice: number;
	tipo: "FOLHA" | "PRODUTO" | "CAPA" | "FECHAMENTO" | "LISTA";
	itens: TVisualKitPieceItem[];
	rotulo: string; // "Folha 1 de 2", "Dipirona 1g", "Capa"
};

export function visualKitItemKey(item: { produtoId: string; produtoVarianteId: string | null | undefined }) {
	return `${item.produtoId}:${item.produtoVarianteId ?? ""}`;
}

export function parseVisualKitItemKey(key: string): { produtoId: string; produtoVarianteId: string | null } | null {
	const [produtoId, produtoVarianteId] = key.split(":");
	if (!produtoId) return null;
	return { produtoId, produtoVarianteId: produtoVarianteId || null };
}

/**
 * Item do catálogo do construtor: um produto sem variantes ou uma variante ativa. Igual ao item de
 * peça, mas o preço pode faltar — o construtor mostra o produto e explica por que ele não entra.
 */
export type TVisualKitCatalogItem = Omit<TVisualKitPieceItem, "preco"> & {
	preco: number | null;
	produtoNome: string;
	varianteNome: string | null;
	precoBase: number | null;
	precoVendaAnterior: number | null;
};

/** Item de catálogo → item de peça; nulo quando não há preço (o produto não entra nas peças). */
export function toVisualKitPieceItem(item: TVisualKitCatalogItem): TVisualKitPieceItem | null {
	if (item.preco == null) return null;
	const { produtoNome: _produtoNome, varianteNome: _varianteNome, precoBase: _precoBase, precoVendaAnterior: _anterior, ...pieceItem } = item;
	return { ...pieceItem, preco: item.preco };
}
