import { normalizeCouponGiftItem } from "@/lib/coupons/gift-pricing";
import type { TCouponGiftSelection } from "@/schemas/coupons";
import type { TShopCatalogProduct } from "@/lib/shop/catalog";
import type { TShopCartItem } from "@/schemas/shop";

export type TShopCartLineModifier = {
	nome: string;
	quantidade: number;
	precoDelta: number;
};

export type TShopCartLine = {
	tempId: string | null;
	produtoId: string;
	produtoVarianteId: string | null;
	quantidade: number;
	product: TShopCatalogProduct;
	variant: TShopCatalogProduct["variantes"][number] | null;
	unitPrice: number;
	modifiersPrice: number;
	modifiersDetails: TShopCartLineModifier[];
	unitFinal: number;
	lineTotal: number;
	displayName: string;
	imageUrl: string | null;
};

export function buildShopCartLines(items: TShopCartItem[], products: TShopCatalogProduct[], brinde?: TCouponGiftSelection | null): TShopCartLine[] {
	const productsById = new Map(products.map((product) => [product.id, product]));
	const lines: TShopCartLine[] = [];

	for (const item of items) {
		const product = productsById.get(item.produtoId);
		if (!product) continue;

		const variant = item.produtoVarianteId ? (product.variantes.find((candidate) => candidate.id === item.produtoVarianteId) ?? null) : null;
		const unitPrice = variant?.precoVenda ?? product.precoVenda ?? 0;

		const optionsById = new Map<string, { nome: string; precoDelta: number }>();
		for (const reference of [...product.addOnsReferencias, ...(variant?.addOnsReferencias ?? [])]) {
			for (const option of reference.grupo.opcoes) {
				if (!optionsById.has(option.id)) optionsById.set(option.id, { nome: option.nome, precoDelta: option.precoDelta });
			}
		}

		const modifiersDetails: TShopCartLineModifier[] = [];
		let modifiersPrice = 0;
		for (const modifier of item.modificadores) {
			const option = optionsById.get(modifier.opcaoId);
			if (!option) continue;
			modifiersDetails.push({ nome: option.nome, quantidade: modifier.quantidade, precoDelta: option.precoDelta });
			modifiersPrice += option.precoDelta * modifier.quantidade;
		}

		const unitFinal = unitPrice + modifiersPrice;

		lines.push({
			tempId: item.tempId ?? null,
			produtoId: item.produtoId,
			produtoVarianteId: item.produtoVarianteId ?? null,
			quantidade: item.quantidade,
			product,
			variant,
			unitPrice,
			modifiersPrice,
			modifiersDetails,
			unitFinal,
			lineTotal: normalizeCouponGiftItem({ chave: item.tempId, valorTotalBruto: unitFinal * item.quantidade, valorTotalLiquido: unitFinal * item.quantidade }, brinde).valorTotalBruto,
			displayName: variant ? `${product.nome} - ${variant.nome}` : product.nome,
			imageUrl: variant?.imagemCapaUrl ?? product.imagemCapaUrl ?? null,
		});
	}

	return lines;
}

export function getShopCartSubtotal(items: TShopCartItem[], products: TShopCatalogProduct[], brinde?: TCouponGiftSelection | null) {
	return buildShopCartLines(items, products, brinde).reduce((sum, line) => sum + line.lineTotal, 0);
}
