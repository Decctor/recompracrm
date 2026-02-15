import type { TRedemptionLimit } from "../types";

type ClientSaldo = {
	saldoValorDisponivel: number;
	programa?: {
		resgateLimiteTipo: string | null;
		resgateLimiteValor: number | null;
	} | null;
};

export function getAvailableCashback(saldos: ClientSaldo[] | undefined | null): number {
	return saldos?.[0]?.saldoValorDisponivel ?? 0;
}

export function getRedemptionLimitConfig(saldos: ClientSaldo[] | undefined | null): TRedemptionLimit {
	const programa = saldos?.[0]?.programa;
	return {
		tipo: programa?.resgateLimiteTipo ?? null,
		valor: programa?.resgateLimiteValor ?? null,
	};
}

export function getMaxCashbackToUse(available: number, saleValue: number, limitConfig: TRedemptionLimit): number {
	let maxByLimit = saleValue;
	if (limitConfig.tipo && limitConfig.valor !== null) {
		if (limitConfig.tipo === "FIXO") {
			maxByLimit = limitConfig.valor;
		} else if (limitConfig.tipo === "PERCENTUAL") {
			maxByLimit = (saleValue * limitConfig.valor) / 100;
		}
	}
	return Math.min(available, saleValue, maxByLimit);
}

export function getFinalValue(saleValue: number, cashback: { aplicar: boolean; valor: number }): number {
	return Math.max(0, saleValue - (cashback.aplicar ? cashback.valor : 0));
}
