export type TSaleItemRepricing = {
	itemId: string;
	valorUnitarioBase: number;
	modificadores: { opcaoId: string; valorUnitario: number }[];
};

export function modifierPricesDiverge(
	modifiers: { opcaoId: string | null; quantidade: number; valorUnitario?: number; valorTotal?: number }[],
	prices: ReadonlyMap<string, number>,
) {
	return modifiers.some((modifier) => {
		const price = modifier.opcaoId ? prices.get(modifier.opcaoId) : undefined;
		return (
			price === undefined ||
			(modifier.valorUnitario !== undefined && Math.abs(modifier.valorUnitario - price) > 0.01 + 1e-9) ||
			(modifier.valorTotal !== undefined && Math.abs(modifier.valorTotal - price * modifier.quantidade) > 0.01 + 1e-9)
		);
	});
}

export function resolveCurrentModifierPrices(modifiers: { opcaoId: string | null }[], prices: ReadonlyMap<string, number>) {
	const current: TSaleItemRepricing["modificadores"] = [];
	for (const modifier of modifiers) {
		const price = modifier.opcaoId ? prices.get(modifier.opcaoId) : undefined;
		if (price === undefined || !modifier.opcaoId) return null;
		current.push({ opcaoId: modifier.opcaoId, valorUnitario: price });
	}
	return current;
}

/** Atualiza os snapshots individuais antes de recompor os totais enviados para validação. */
export function repriceSaleItem<
	T extends {
		recompensaId?: string | null;
		quantidade: number;
		valorDesconto: number;
		modificadores: { opcaoId: string; quantidade: number; valorUnitario: number; valorTotal: number }[];
	},
>(item: T, price: TSaleItemRepricing) {
	if (item.recompensaId) return item;
	const prices = new Map(price.modificadores.map((modifier) => [modifier.opcaoId, modifier.valorUnitario]));
	// Não aplica uma reprecificação parcial a um carrinho cuja escolha já mudou.
	if (item.modificadores.some((modifier) => !prices.has(modifier.opcaoId))) return item;
	const modificadores = item.modificadores.map((modifier) => {
		const valorUnitario = prices.get(modifier.opcaoId) as number;
		return { ...modifier, valorUnitario, valorTotal: valorUnitario * modifier.quantidade };
	});
	const valorModificadores = modificadores.reduce((sum, modifier) => sum + modifier.valorTotal, 0);
	const valorUnitarioFinal = price.valorUnitarioBase + valorModificadores;
	const valorTotalBruto = valorUnitarioFinal * item.quantidade;
	const valorDesconto = Math.min(item.valorDesconto, valorTotalBruto);
	return {
		...item,
		modificadores,
		valorUnitarioBase: price.valorUnitarioBase,
		valorModificadores,
		valorUnitarioFinal,
		valorTotalBruto,
		valorDesconto,
		valorTotalLiquido: valorTotalBruto - valorDesconto,
	};
}
