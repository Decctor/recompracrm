import type { TFiscalDiscountableItem } from "./header-discount";

function round2(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toCents(value: number): number {
	return Math.max(0, Math.round((value + Number.EPSILON) * 100));
}

/**
 * Acrescimo da venda que nao e frete (acrescimo geral do PDV) e por isso nunca chegava ao vNF — a
 * nota saia pelos itens enquanto os pagamentos somavam o total com o acrescimo (rejeicao 866).
 * Na NF-e/NFC-e ele e "outras despesas acessorias" (vOutro).
 *
 * `acrescimosTotal` soma frete e acrescimo geral; o frete ja vai para o vFrete, entao o vOutro e o
 * restante. O valor e limitado pelo residuo `valorTotal - (liquidoItens - descontoCabecalho + frete)`
 * para nunca fabricar despesa a partir de uma venda com totais divergentes (ex.: importada de
 * outro sistema) — mesma salvaguarda de resolveFiscalHeaderDiscount.
 */
export function resolveFiscalOtherCharges({
	itens,
	valorTotal,
	acrescimosTotal,
	valorFrete,
	valorDescontoCabecalho,
}: {
	itens: TFiscalDiscountableItem[];
	valorTotal: number | null | undefined;
	acrescimosTotal: number | null | undefined;
	valorFrete: number;
	valorDescontoCabecalho: number;
}): number {
	if (typeof valorTotal !== "number" || !Number.isFinite(valorTotal)) return 0;
	const surchargeCents = toCents(Math.max(0, acrescimosTotal ?? 0)) - toCents(valorFrete);
	if (surchargeCents <= 0) return 0;
	const netCents = itens.reduce((sum, item) => sum + toCents(Math.max(0, item.valorBruto - item.valorDesconto)), 0);
	const residualCents = toCents(valorTotal) - (netCents - toCents(valorDescontoCabecalho) + toCents(valorFrete));
	return round2(Math.min(Math.max(0, residualCents), surchargeCents) / 100);
}
