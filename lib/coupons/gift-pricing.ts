import type { TCouponGiftSelection } from "@/schemas/coupons";

/** Os preços unitários podem ter mais casas; totais monetários são contabilizados em centavos. */
export function roundCouponGiftCurrency(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Mantém pagáveis as outras unidades e os adicionais, reconciliando o arredondamento da linha. */
export function calculateCouponGiftDiscount(item: { quantidade: number; valorVendaUnitario: number; valorUnitarioBase: number }) {
	const gross = roundCouponGiftCurrency(item.quantidade * item.valorVendaUnitario);
	const payable = roundCouponGiftCurrency(item.quantidade * item.valorVendaUnitario - item.valorUnitarioBase);
	return roundCouponGiftCurrency(gross - payable);
}

export function normalizeCouponGiftItem<
	T extends {
		chave?: string | null;
		valorTotalBruto: number;
		valorTotalLiquido: number;
		quantidade?: number;
		valorUnitarioFinal?: number;
		valorDesconto?: number;
	},
>(item: T, brinde: TCouponGiftSelection | null | undefined, itemChave = item.chave): T {
	if (!brinde || itemChave !== brinde.itemChave) return item;
	const gross = roundCouponGiftCurrency(
		item.quantidade !== undefined && item.valorUnitarioFinal !== undefined ? item.quantidade * item.valorUnitarioFinal : item.valorTotalBruto,
	);
	const discount = item.valorDesconto ?? item.valorTotalBruto - item.valorTotalLiquido;
	return { ...item, valorTotalBruto: gross, valorTotalLiquido: roundCouponGiftCurrency(gross - discount) };
}
