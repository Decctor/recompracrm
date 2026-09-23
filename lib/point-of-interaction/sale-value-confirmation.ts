import { type TPoiPrizeLineInput, resolvePoiPrizeLines, sumPoiPrizeSaleValue, sumPoiPrizeValue } from "./prize-lines";

export function saleValuesMatch(confirmedValue: number, saleValue: number) {
	return Math.round(confirmedValue * 100) === Math.round(saleValue * 100);
}

type TPoiSaleForValueConfirmation = {
	valor: number;
	cashback: { aplicar: boolean; valor: number };
	prizeRedemptions?: TPoiPrizeLineInput[] | null;
	prizeRedemption?: { prizeId: string; prizeValue: number; prizeSaleValue: number } | null;
};

/** Fluxo de recompensa não pede confirmação de valor ao operador: o valor é o do catálogo. */
export function poiSaleRequiresValueConfirmation(enabled: boolean, sale: TPoiSaleForValueConfirmation) {
	return enabled && resolvePoiPrizeLines(sale).length === 0;
}

export function getPoiSaleValueForConfirmation(sale: TPoiSaleForValueConfirmation) {
	const prizeLines = resolvePoiPrizeLines(sale);
	const hasPrizes = prizeLines.length > 0;
	const grossValue = hasPrizes ? sumPoiPrizeSaleValue(prizeLines) : sale.valor;
	const discountValue = hasPrizes ? sumPoiPrizeValue(prizeLines) : sale.cashback.aplicar ? sale.cashback.valor : 0;
	return Math.max(0, grossValue - discountValue);
}
