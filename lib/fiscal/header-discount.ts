function round2(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toCents(value: number): number {
	return Math.max(0, Math.round((value + Number.EPSILON) * 100));
}

export type TFiscalDiscountableItem = { valorBruto: number; valorDesconto: number };

function sumNetCents(itens: TFiscalDiscountableItem[]): number {
	return itens.reduce((sum, item) => sum + toCents(Math.max(0, item.valorBruto - item.valorDesconto)), 0);
}

/**
 * Desconto de cabecalho da venda (desconto geral do PDV, cupom, resgate de cashback) que NAO esta
 * representado nos itens e por isso nunca chegava ao vDesc — a nota saia pelo bruto enquanto os
 * pagamentos somavam o liquido (rejeicao 865).
 *
 * O valor e derivado como residuo dos proprios totais da venda em vez de lido de um campo:
 * `valorTotal = liquidoItens - descontosCabecalho + acrescimos`, logo o cabecalho e
 * `liquidoItens + acrescimos - valorTotal`. Isso cobre o caso misto (desconto geral + desconto de
 * item), em que `descontosTotal` guarda so a parcela de cabecalho. O residuo e limitado por
 * `descontosTotal` para nunca fabricar desconto a partir de uma venda com totais divergentes
 * (ex.: importada de outro sistema), e pelo liquido dos itens porque vDesc nao pode superar vProd.
 */
export function resolveFiscalHeaderDiscount({
	itens,
	valorTotal,
	acrescimosTotal,
	descontosTotal,
}: {
	itens: TFiscalDiscountableItem[];
	valorTotal: number | null | undefined;
	acrescimosTotal: number | null | undefined;
	descontosTotal: number | null | undefined;
}): number {
	if (typeof valorTotal !== "number" || !Number.isFinite(valorTotal)) return 0;
	const declaredCents = toCents(Math.max(0, descontosTotal ?? 0));
	if (declaredCents === 0) return 0;
	const netCents = sumNetCents(itens);
	const residualCents = netCents + toCents(Math.max(0, acrescimosTotal ?? 0)) - toCents(Math.max(0, valorTotal));
	return round2(Math.min(Math.max(0, residualCents), declaredCents, netCents) / 100);
}

/**
 * Rateia o desconto de cabecalho em centavos entre os itens, proporcional ao liquido de cada um
 * (maiores restos, mesmo metodo de allocateFiscalFreight). Como o desconto e limitado ao liquido
 * total, nenhum item recebe mais desconto do que o proprio valor — vDesc do item nunca passa do
 * vProd do item.
 */
export function allocateFiscalHeaderDiscount({ valorDesconto, itens }: { valorDesconto: number; itens: TFiscalDiscountableItem[] }): number[] {
	if (itens.length === 0) return [];

	const weights = itens.map((item) => toCents(Math.max(0, item.valorBruto - item.valorDesconto)));
	const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
	const discountCents = Math.min(toCents(valorDesconto), weightTotal);
	if (discountCents === 0) return itens.map(() => 0);

	const exactShares = weights.map((weight) => (discountCents * weight) / weightTotal);
	const allocatedCents = exactShares.map(Math.floor);
	let remainingCents = discountCents - allocatedCents.reduce((sum, value) => sum + value, 0);

	const remainderOrder = exactShares
		.map((share, index) => ({ index, remainder: share - Math.floor(share) }))
		.sort((a, b) => b.remainder - a.remainder || a.index - b.index);

	for (let index = 0; index < remainderOrder.length && remainingCents > 0; index += 1) {
		const candidate = remainderOrder[index].index;
		if (allocatedCents[candidate] >= weights[candidate]) continue;
		allocatedCents[candidate] += 1;
		remainingCents -= 1;
	}

	return allocatedCents.map((value) => value / 100);
}
