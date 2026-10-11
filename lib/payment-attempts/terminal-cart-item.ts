import type { THydratedPOSProduct } from "@/lib/pos/hydrate-pos-products";
import { resolveCatalogOrderItem } from "@/lib/products/resolve-catalog-order-item";
import type { TSaleCheckoutItemInput } from "@/schemas/sale-checkout";
import createHttpError from "http-errors";
import { PaymentTerminalError } from "./errors";

// Item de uma venda nascida no terminal: o aparelho manda referência, quantidade, adicionais
// escolhidos e observação; preço e regras vêm da projeção do canal PDV. Puro, sem banco.

export type TTerminalSaleItemInput = {
	produtoId: string;
	produtoVarianteId?: string | null;
	quantidade: number;
	modificadores?: { opcaoId: string; quantidade: number }[] | null;
	observacoes?: string | null;
};

export function roundCents(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Item do carrinho montado pelo servidor a partir do catálogo do canal PDV, no shape do checkout. */
export function buildTerminalCartItem(product: THydratedPOSProduct | undefined, item: TTerminalSaleItemInput): TSaleCheckoutItemInput {
	if (!product) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "Um produto da venda não está disponível no PDV.");
	if (!item.produtoVarianteId && product.variantes.length === 0 && product.precoVenda == null) {
		throw new PaymentTerminalError(422, "VALIDATION_ERROR", `O produto "${product.nome}" está sem preço de venda.`);
	}
	let resolved: ReturnType<typeof resolveCatalogOrderItem>;
	try {
		resolved = resolveCatalogOrderItem({
			product,
			variantId: item.produtoVarianteId ?? null,
			quantity: item.quantidade,
			modifiers: item.modificadores ?? [],
			observacoes: item.observacoes ?? null,
		});
	} catch (error) {
		// Regra de grupo, variação ou opção indisponível: é validação do pedido, não falha do servidor.
		if (createHttpError.isHttpError(error) && error.statusCode < 500) throw new PaymentTerminalError(422, "VALIDATION_ERROR", error.message);
		throw error;
	}
	return {
		produtoId: resolved.produtoId,
		produtoVarianteId: resolved.produtoVarianteId,
		nome: resolved.nome,
		codigo: resolved.codigo,
		imagemUrl: resolved.imagemUrl,
		quantidade: resolved.quantidade,
		valorUnitarioBase: resolved.valorUnitarioBase,
		valorModificadores: resolved.valorModificadores,
		valorUnitarioFinal: resolved.valorUnitarioFinal,
		valorTotalBruto: resolved.valorTotalBruto,
		valorDesconto: 0,
		valorTotalLiquido: resolved.valorTotalLiquido,
		modificadores: resolved.modificadores,
		observacoes: resolved.observacoes,
	};
}

