/**
 * Leitura de um produto do PDV para exibição na grade e na lista. Os dois componentes
 * (`ProductCard` e `ProductListRow`) mostram o mesmo produto com a mesma gramática; o que decide
 * "qual preço" e "que tipo de produto" vive aqui para que lista e grade nunca divirjam.
 */

type TDisplayPriceProduct = {
	precoVenda: number | null;
	variantes: { precoVenda: number }[];
};

type TProductKindProduct = {
	variantes: unknown[];
	addOnsReferencias: unknown[];
};

export type TPOSDisplayPrice = { type: "starting-from" | "fixed"; value: number };

/** Preço a exibir: "A partir de" (menor preço) quando há variantes, senão o preço base. */
export function getPOSDisplayPrice(product: TDisplayPriceProduct): TPOSDisplayPrice {
	if (product.variantes.length > 0) {
		return { type: "starting-from", value: Math.min(...product.variantes.map((variant) => variant.precoVenda)) };
	}
	return { type: "fixed", value: product.precoVenda ?? 0 };
}

export type TPOSProductKind = "SIMPLES" | "VARIANTES" | "ADICIONAIS" | "VARIANTES_E_ADICIONAIS";

/**
 * Natureza do produto no PDV. Decide o que o toque faz: um produto simples cai direto no carrinho;
 * qualquer outro abre o builder para escolher variante e adicionais.
 */
export function getPOSProductKind(product: TProductKindProduct): TPOSProductKind {
	const hasVariants = product.variantes.length > 0;
	const hasAddOns = product.addOnsReferencias.length > 0;
	if (hasVariants && hasAddOns) return "VARIANTES_E_ADICIONAIS";
	if (hasVariants) return "VARIANTES";
	if (hasAddOns) return "ADICIONAIS";
	return "SIMPLES";
}

export const POS_PRODUCT_KIND_LABELS: Record<Exclude<TPOSProductKind, "SIMPLES">, string> = {
	VARIANTES: "Variantes",
	ADICIONAIS: "Adicionais",
	VARIANTES_E_ADICIONAIS: "Variantes e adicionais",
};

/**
 * Rótulo acessível do botão do produto: diz o que o toque faz, não só o que o produto é. O leitor
 * de tela recebia nome, código, grupo e selo em sequência sem saber que o toque adiciona.
 */
export function getPOSProductActionLabel({ nome, kind, priceLabel }: { nome: string; kind: TPOSProductKind; priceLabel: string }) {
	return kind === "SIMPLES" ? `Adicionar ${nome}, ${priceLabel}` : `Escolher opções de ${nome}, ${priceLabel}`;
}
