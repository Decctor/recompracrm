import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import type { TBuiltOrderItem } from "@/components/Products/ProductBuilderForm";
import { resolveScaleItemQuantity, type TScaleBarcodeReading } from "./scale-barcode";

// A leitura devolve o row completo do PDV (hidratado pela rota de código de barras), não o
// recorte estrutural da montagem: quem recebe a resolução guarda o produto no mesmo estado da
// grade, que é tipado pelo row.
type TPOSProduct = TGetPOSProductsOutput["data"]["products"][number];

// O que fazer com um produto resolvido por código de barras. A regra espelha o clique na grade
// (variantes ou adicionais abrem o builder), com uma diferença: a variante identificada pelo
// próprio código não tem o que escolher — vai direto ao carrinho, salvo se carregar adicionais,
// caso em que o builder abre já com ela selecionada.

export type TBarcodeScanResolution = {
	product: TPOSProduct;
	variantId: string | null;
	/** Etiqueta de balança: a quantidade sai da pesagem, não do clique. */
	scaleReading?: TScaleBarcodeReading | null;
};

export type TBarcodeScanAction =
	| { type: "ADD_DIRECT"; item: TBuiltOrderItem; variant: TPOSProduct["variantes"][number] | null }
	| { type: "OPEN_BUILDER"; variantId: string | null }
	| { type: "REJECT"; message: string };

export function buildScannedOrderItem({
	product,
	variant,
	quantidade = 1,
	valorTotal,
}: {
	product: TPOSProduct;
	variant: TPOSProduct["variantes"][number] | null;
	quantidade?: number;
	/** Total já resolvido (pesagem); sem ele, quantidade × preço. */
	valorTotal?: number;
}): TBuiltOrderItem {
	const unitPrice = variant ? variant.precoVenda : (product.precoVenda ?? 0);
	const total = valorTotal ?? unitPrice * quantidade;
	return {
		produtoId: product.id,
		produtoVarianteId: variant?.id ?? null,
		nome: variant ? `${product.nome} - ${variant.nome}` : product.nome,
		codigo: variant?.codigo ?? product.codigo,
		imagemUrl: variant?.imagemCapaUrl ?? product.imagemCapaUrl,
		quantidade,
		valorUnitarioBase: unitPrice,
		valorModificadores: 0,
		valorUnitarioFinal: unitPrice,
		valorTotalBruto: total,
		valorDesconto: 0,
		valorTotalLiquido: total,
		observacoes: null,
		modificadores: [],
	};
}

/**
 * Etiqueta de balança: o item vai sempre direto ao carrinho, com a quantidade da pesagem. Não há
 * builder porque a pesagem não tem onde entrar nele — produto com variações precisa do PLU na
 * variante, e adicionais não se aplicam a item pesado.
 */
function resolveScaleScanAction({
	product,
	variantId,
	scaleReading,
}: TBarcodeScanResolution & { scaleReading: TScaleBarcodeReading }): TBarcodeScanAction {
	const variant = variantId ? (product.variantes.find((candidate) => candidate.id === variantId) ?? null) : null;
	if (variantId && !variant) return { type: "REJECT", message: `${product.nome}: a variação desta etiqueta não está disponível.` };
	if (!variant && product.variantes.length > 0) {
		return { type: "REJECT", message: `${product.nome} tem variações: cadastre o código da balança (${scaleReading.plu}) na variação.` };
	}
	const unitPrice = variant ? variant.precoVenda : (product.precoVenda ?? 0);
	const resolved = resolveScaleItemQuantity({ reading: scaleReading, precoUnitario: unitPrice });
	if (!resolved) return { type: "REJECT", message: `${product.nome} está sem preço de venda: não dá para calcular a quantidade da etiqueta.` };
	return {
		type: "ADD_DIRECT",
		item: buildScannedOrderItem({ product, variant, quantidade: resolved.quantidade, valorTotal: resolved.valorTotal }),
		variant,
	};
}

export function resolveBarcodeScanAction({ product, variantId, scaleReading }: TBarcodeScanResolution): TBarcodeScanAction {
	if (scaleReading) return resolveScaleScanAction({ product, variantId, scaleReading });
	if (variantId) {
		const variant = product.variantes.find((candidate) => candidate.id === variantId) ?? null;
		if (!variant) return { type: "OPEN_BUILDER", variantId: null };
		const hasAddOns = product.addOnsReferencias.length > 0 || variant.addOnsReferencias.length > 0;
		if (hasAddOns) return { type: "OPEN_BUILDER", variantId };
		return { type: "ADD_DIRECT", item: buildScannedOrderItem({ product, variant }), variant };
	}
	if (product.variantes.length > 0 || product.addOnsReferencias.length > 0) return { type: "OPEN_BUILDER", variantId: null };
	return { type: "ADD_DIRECT", item: buildScannedOrderItem({ product, variant: null }), variant: null };
}
