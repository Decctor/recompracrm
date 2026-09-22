// Linhas de recompensa de uma transação do ponto de interação — uma por recompensa distinta, com
// quantidade. Client-safe (sem banco): usada pelo servidor, pelos hooks e pela UI do kiosk.
//
// `prizeValue`/`prizeSaleValue` são POR UNIDADE e vêm do cliente apenas para exibição e para o
// resumo da solicitação; o servidor sempre os sobrescreve pelo catálogo.

export type TPoiPrizeLine = {
	prizeId: string;
	prizeValue: number;
	prizeSaleValue: number;
	quantity: number;
};

// Forma como o payload chega (campos por unidade opcionais/nulos: são informativos).
export type TPoiPrizeLineInput = { prizeId: string; prizeValue?: number | null; prizeSaleValue?: number | null; quantity?: number | null };

type TPoiSaleWithPrizes = {
	prizeRedemptions?: TPoiPrizeLineInput[] | null;
	// Formato anterior a múltiplas recompensas (solicitações PENDENTE antigas, app mobile).
	prizeRedemption?: { prizeId: string; prizeValue: number; prizeSaleValue: number } | null;
};

/** Resolve as linhas de recompensa aceitando o formato plural (atual) e o singular (legado). */
export function resolvePoiPrizeLines(sale: TPoiSaleWithPrizes): TPoiPrizeLine[] {
	if (Array.isArray(sale.prizeRedemptions)) {
		return sale.prizeRedemptions.map((line) => ({
			prizeId: line.prizeId,
			prizeValue: line.prizeValue ?? 0,
			prizeSaleValue: line.prizeSaleValue ?? 0,
			quantity: line.quantity && line.quantity >= 1 ? Math.floor(line.quantity) : 1,
		}));
	}
	if (sale.prizeRedemption) return [{ ...sale.prizeRedemption, quantity: 1 }];
	return [];
}

/** Débito total de saldo (moeda cashback) das linhas. */
export function sumPoiPrizeValue(lines: TPoiPrizeLine[]): number {
	return lines.reduce((sum, line) => sum + line.prizeValue * line.quantity, 0);
}

/** Valor comercial total (R$) das linhas. */
export function sumPoiPrizeSaleValue(lines: TPoiPrizeLine[]): number {
	return lines.reduce((sum, line) => sum + line.prizeSaleValue * line.quantity, 0);
}

/** Adiciona uma unidade da recompensa: incrementa a linha existente ou cria uma nova. */
export function addPoiPrizeLine(lines: TPoiPrizeLine[], prize: { id: string; valor: number; valorVenda: number }): TPoiPrizeLine[] {
	const existing = lines.find((line) => line.prizeId === prize.id);
	if (existing) return lines.map((line) => (line.prizeId === prize.id ? { ...line, quantity: line.quantity + 1 } : line));
	return [...lines, { prizeId: prize.id, prizeValue: prize.valor, prizeSaleValue: prize.valorVenda, quantity: 1 }];
}

/** Define a quantidade de uma linha; quantidade < 1 remove a linha. */
export function setPoiPrizeLineQuantity(lines: TPoiPrizeLine[], prizeId: string, quantity: number): TPoiPrizeLine[] {
	if (quantity < 1) return lines.filter((line) => line.prizeId !== prizeId);
	return lines.map((line) => (line.prizeId === prizeId ? { ...line, quantity: Math.floor(quantity) } : line));
}
