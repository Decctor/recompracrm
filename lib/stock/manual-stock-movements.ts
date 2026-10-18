import type { TManualStockMovementTypeEnum } from "@/schemas/enums";

// Direção de cada tipo lançável manualmente. A movimentação grava `quantidade` sempre positiva;
// o sinal aplicado ao saldo vem daqui.
export const MANUAL_STOCK_MOVEMENT_DIRECTION: Record<TManualStockMovementTypeEnum, "ENTRADA" | "SAIDA"> = {
	ENTRADA_AQUISICAO: "ENTRADA",
	ENTRADA_PRODUCAO: "ENTRADA",
	ENTRADA_DEVOLUCAO: "ENTRADA",
	SAIDA: "SAIDA",
	SAIDA_PRODUCAO: "SAIDA",
	DESCARTE: "SAIDA",
};

export function isManualStockInflow(type: TManualStockMovementTypeEnum) {
	return MANUAL_STOCK_MOVEMENT_DIRECTION[type] === "ENTRADA";
}

export function getManualStockMovementSignedQuantity({ type, quantity }: { type: TManualStockMovementTypeEnum; quantity: number }) {
	return isManualStockInflow(type) ? Math.abs(quantity) : -Math.abs(quantity);
}
