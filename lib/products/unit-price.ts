import type { TProductContentUnitEnum } from "@/schemas/enums";

// Preço por unidade de medida das etiquetas ("R$ 0,22 por 100 ml"). Volume e massa pequenos são
// referenciados a 100 ml / 100 g; os demais, à unidade inteira.
const UNIT_PRICE_BASE: Record<TProductContentUnitEnum, { divisor: number; rotulo: string }> = {
	ML: { divisor: 100, rotulo: "100 ml" },
	G: { divisor: 100, rotulo: "100 g" },
	L: { divisor: 1, rotulo: "litro" },
	KG: { divisor: 1, rotulo: "kg" },
	UN: { divisor: 1, rotulo: "unidade" },
	COMPRIMIDO: { divisor: 1, rotulo: "comprimido" },
	CAPSULA: { divisor: 1, rotulo: "cápsula" },
	METRO: { divisor: 1, rotulo: "metro" },
};

const CONTENT_LABEL: Record<TProductContentUnitEnum, { singular: string; plural: string }> = {
	ML: { singular: "ml", plural: "ml" },
	L: { singular: "l", plural: "l" },
	G: { singular: "g", plural: "g" },
	KG: { singular: "kg", plural: "kg" },
	UN: { singular: "unidade", plural: "unidades" },
	COMPRIMIDO: { singular: "comprimido", plural: "comprimidos" },
	CAPSULA: { singular: "cápsula", plural: "cápsulas" },
	METRO: { singular: "metro", plural: "metros" },
};

type TProductContent = {
	conteudoQuantidade: number | null;
	conteudoUnidade: TProductContentUnitEnum | null;
};

function hasContent(content: TProductContent): content is { conteudoQuantidade: number; conteudoUnidade: TProductContentUnitEnum } {
	return content.conteudoQuantidade != null && content.conteudoQuantidade > 0 && content.conteudoUnidade != null;
}

/** Conteúdo da variante: a quantidade dela sobrescreve a do produto; a unidade é sempre a do produto. */
export function resolveVariantContent(product: TProductContent, variant: { conteudoQuantidade: number | null } | null): TProductContent {
	return {
		conteudoQuantidade: variant?.conteudoQuantidade ?? product.conteudoQuantidade,
		conteudoUnidade: product.conteudoUnidade,
	};
}

/** "200 ml", "10 comprimidos", "1,5 l"; nulo sem conteúdo completo. */
export function formatProductContent(content: TProductContent): string | null {
	if (!hasContent(content)) return null;
	const { singular, plural } = CONTENT_LABEL[content.conteudoUnidade];
	const quantidade = content.conteudoQuantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
	return `${quantidade} ${content.conteudoQuantidade === 1 ? singular : plural}`;
}

/** Preço por unidade de medida; nulo sem preço ou sem conteúdo completo. */
export function resolveUnitPrice({ preco, ...content }: TProductContent & { preco: number | null }): { valor: number; rotulo: string } | null {
	if (preco == null || !hasContent(content)) return null;
	const base = UNIT_PRICE_BASE[content.conteudoUnidade];
	return { valor: (preco / content.conteudoQuantidade) * base.divisor, rotulo: `por ${base.rotulo}` };
}
