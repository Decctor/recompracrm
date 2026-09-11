type TStockDisplayProduct = {
	quantidade: number | null;
	rastreamentoEstoqueAtivo: boolean | null;
};

/**
 * Saldo a exibir na grade do PDV, ou `null` quando não há saldo confiável para mostrar.
 *
 * `quantidade` existe mesmo sem rastreamento — conectores de ERP gravam zero para o catálogo
 * inteiro —, então o número sozinho não autoriza a leitura. Só o par de flags autoriza: o módulo
 * de estoque da organização (`preferencias.rastreamentoEstoque`) e o rastreamento do próprio
 * produto (`rastreamentoEstoqueAtivo`), mesmo par que `applyStockMovement` consulta antes de
 * baixar saldo. Sem eles, um "Sem estoque" no PDV é ruído sobre um produto que vende normalmente.
 *
 * Produto com baixa por `COMPOSICAO` (pratos) nunca tem saldo próprio e fica com o rastreamento
 * desativado por design — cai no `null` pela mesma regra.
 */
export function resolvePOSProductStock({ product, orgTracksStock }: { product: TStockDisplayProduct; orgTracksStock: boolean }) {
	if (!orgTracksStock) return null;
	if (!product.rastreamentoEstoqueAtivo) return null;
	if (product.quantidade === null || product.quantidade === undefined) return null;
	return product.quantidade;
}
