import { formatToMoney } from "@/lib/formatting";
import type { TRedemptionLimit } from "../types";

export function getLimitDescription(limit: TRedemptionLimit): string | null {
	if (!limit.tipo || limit.valor === null) return null;
	if (limit.tipo === "FIXO") {
		return `Limite máximo: ${formatToMoney(limit.valor)}`;
	}
	return `Limite máximo: ${limit.valor}% do valor da compra`;
}
