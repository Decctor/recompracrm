import { formatToMoney } from "@/lib/formatting";

/** Sem diferença é sucesso; sobra é aviso (dinheiro a mais também é erro); falta é destrutivo. */
export function sessionDifferenceClass(value: number) {
	if (value === 0) return "text-success";
	if (value > 0) return "text-warning-surface-foreground";
	return "text-destructive";
}

/** Diferença sempre assinada, para sobra e falta se distinguirem sem depender só da cor. */
export function formatSessionDifference(value: number) {
	return `${value > 0 ? "+" : ""}${formatToMoney(value)}`;
}
