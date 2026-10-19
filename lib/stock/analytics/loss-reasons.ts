import type { TStockMovementTypeEnum } from "@/schemas/enums";

/**
 * Motivos de perda inferidos da movimentação. O `motivo` do descarte é texto livre, então só se
 * distingue o que a própria movimentação prova:
 * - descarte de um lote cuja validade já tinha passado → validade vencida
 * - ajuste negativo (só a recontagem lança AJUSTE) → ajuste de recontagem
 * - o resto → descarte manual (o texto livre segue disponível para exibição)
 */
export const STOCK_LOSS_REASONS = {
	VALIDADE_VENCIDA: "Validade vencida",
	AJUSTE_RECONTAGEM: "Ajuste de recontagem",
	DESCARTE_MANUAL: "Descarte manual",
} as const;
export type TStockLossReason = keyof typeof STOCK_LOSS_REASONS;

export function inferStockLossReason({
	tipo,
	dataMovimentacao,
	loteDataValidade,
}: {
	tipo: TStockMovementTypeEnum;
	dataMovimentacao: Date;
	loteDataValidade: Date | null;
}): TStockLossReason {
	if (tipo === "AJUSTE") return "AJUSTE_RECONTAGEM";
	if (loteDataValidade && loteDataValidade.getTime() <= dataMovimentacao.getTime()) return "VALIDADE_VENCIDA";
	return "DESCARTE_MANUAL";
}
