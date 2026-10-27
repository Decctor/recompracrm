import { formatItemQuantity } from "./scale-barcode";

// Saldo disponível para vender agora: o saldo rastreado menos o que o carrinho já reserva.
//
// A regra espelha o servidor: a baixa da venda (process-stock-deduction) recusa saldo insuficiente
// quando a organização tem o módulo de estoque ligado E o produto/variante rastreia estoque — o
// mesmo par que `resolvePOSProductStock` usa para decidir se há saldo a exibir. Sem o par, não há
// número nem bloqueio. Sem descontar o carrinho, bipar a mesma variante duas vezes passaria aqui e
// só falharia ao finalizar.

type TStockKey = { produtoId: string; produtoVarianteId?: string | null };

/** Linha que ocupa saldo: o que ainda falta entregar (na edição, a parte entregue já baixou). */
type TReservingLine = TStockKey & { quantidade: number; quantidadeEntregue?: number | null };

const QUANTITY_TOLERANCE = 1e-9;

const sameStockKey = (line: TStockKey, key: TStockKey) =>
	line.produtoId === key.produtoId && (line.produtoVarianteId ?? null) === (key.produtoVarianteId ?? null);

export function countReservedStock(lines: TReservingLine[], key: TStockKey) {
	return lines.reduce((total, line) => (sameStockKey(line, key) ? total + Math.max(0, line.quantidade - (line.quantidadeEntregue ?? 0)) : total), 0);
}

/** `null` quando não há saldo rastreado: nada a mostrar e nada a bloquear. */
export function resolveAvailableStock({ stock, reserved }: { stock: number | null; reserved: number }) {
	if (stock === null) return null;
	return Math.round((stock - reserved) * 10_000) / 10_000;
}

/** Motivo para recusar `quantity` unidades, ou `null` quando cabe (ou não há rastreamento). */
export function describeStockShortage({ nome, available, quantity }: { nome: string; available: number | null; quantity: number }) {
	if (available === null) return null;
	if (available <= QUANTITY_TOLERANCE) return `Sem estoque: ${nome}.`;
	if (quantity > available + QUANTITY_TOLERANCE) return `${nome}: só ${formatItemQuantity(available)} em estoque.`;
	return null;
}

/**
 * Saldo de uma linha do carrinho, a partir do snapshot que ela trouxe (`saldoEstoque`). Linhas do
 * mesmo produto/variante dividem o saldo; vale o snapshot da linha adicionada por último, o mais
 * recente que a tela viu. Linha sem snapshot (venda hidratada para edição) não restringe.
 */
export function resolveCartLineStock(lines: (TReservingLine & { saldoEstoque?: number | null })[], key: TStockKey) {
	let stock: number | null = null;
	for (const line of lines) {
		if (!sameStockKey(line, key) || line.saldoEstoque === null || line.saldoEstoque === undefined) continue;
		stock = line.saldoEstoque;
	}
	return { stock, available: resolveAvailableStock({ stock, reserved: countReservedStock(lines, key) }) };
}

/** Motivo para não somar mais uma unidade a uma linha do carrinho, ou `null` quando cabe. */
export function describeCartIncrementShortage(lines: (TReservingLine & { saldoEstoque?: number | null })[], line: TStockKey & { nome: string }) {
	const { stock, available } = resolveCartLineStock(lines, line);
	if (stock === null || available === null || available >= 1 - QUANTITY_TOLERANCE) return null;
	return stock <= QUANTITY_TOLERANCE ? `Sem estoque: ${line.nome}.` : `${line.nome}: só ${formatItemQuantity(stock)} em estoque.`;
}
