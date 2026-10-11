import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import type { TBuiltOrderItem } from "@/components/Products/ProductBuilderForm";

// A leitura devolve o row completo do PDV (hidratado pela rota de código de barras), não o
// recorte estrutural da montagem: quem recebe a resolução guarda o produto no mesmo estado da
// grade, que é tipado pelo row.
type TPOSProduct = TGetPOSProductsOutput["data"]["products"][number];

// O que fazer com um produto resolvido por código de barras. A regra espelha o clique na grade
// (variantes ou adicionais abrem o builder), com uma diferença: a variante identificada pelo
// próprio código não tem o que escolher — vai direto ao carrinho, salvo se carregar adicionais,
// caso em que o builder abre já com ela selecionada.

export type TBarcodeScanResolution = { product: TPOSProduct; variantId: string | null };

export type TBarcodeScanAction =
	| { type: "ADD_DIRECT"; item: TBuiltOrderItem; variant: TPOSProduct["variantes"][number] | null }
	| { type: "OPEN_BUILDER"; variantId: string | null };

export function buildScannedOrderItem({
	product,
	variant,
}: {
	product: TPOSProduct;
	variant: TPOSProduct["variantes"][number] | null;
}): TBuiltOrderItem {
	const unitPrice = variant ? variant.precoVenda : (product.precoVenda ?? 0);
	return {
		produtoId: product.id,
		produtoVarianteId: variant?.id ?? null,
		nome: variant ? `${product.nome} - ${variant.nome}` : product.nome,
		codigo: variant?.codigo ?? product.codigo,
		imagemUrl: variant?.imagemCapaUrl ?? product.imagemCapaUrl,
		quantidade: 1,
		valorUnitarioBase: unitPrice,
		valorModificadores: 0,
		valorUnitarioFinal: unitPrice,
		valorTotalBruto: unitPrice,
		valorDesconto: 0,
		valorTotalLiquido: unitPrice,
		observacoes: null,
		modificadores: [],
	};
}

export function resolveBarcodeScanAction({ product, variantId }: TBarcodeScanResolution): TBarcodeScanAction {
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
