import type {
	TCreatePointOfInteractionTransactionOutput,
	TCreatePointOfInteractionTransactionRequestInput,
} from "@/app/api/point-of-interaction/new-transaction/route";
import {
	POI_TRANSACTION_REJECTION_REASON_LABELS,
	type TDeliveryModeEnum,
	type TPoiTransactionRejectionReasonEnum,
	type TPoiTransactionRequestStatusEnum,
} from "@/schemas/enums";
import { normalizeFreeFormRewardDescription } from "./free-form-reward";
import { resolvePoiPrizeLines, sumPoiPrizeSaleValue, sumPoiPrizeValue } from "./prize-lines";

export type TPoiTransactionRequestSummaryPrize = {
	prizeId: string;
	// Por unidade.
	prizeValue: number;
	prizeSaleValue: number;
	quantity: number;
	prizeTitulo?: string | null;
	prizeImageUrl?: string | null;
};

export type TPoiTransactionRequestSummary = {
	cliente: {
		id: string | null;
		nome: string;
		telefone: string;
	};
	venda: {
		entregaModalidade?: TDeliveryModeEnum | null;
		valorBruto: number;
		valorResgate: number;
		valorFinal: number;
		modo: "DESCONTO" | "RECOMPENSA";
		codigoParceiro: string | null;
	};
	// Uma entrada por recompensa distinta (formato atual).
	recompensas: TPoiTransactionRequestSummaryPrize[];
	// Formato anterior a múltiplas recompensas: presente só em solicitações persistidas antes da
	// mudança. Novas solicitações gravam `null`. Leitores usam `readPoiSummaryPrizes`.
	recompensa?: Omit<TPoiTransactionRequestSummaryPrize, "quantity"> | null;
	// Recompensa avulsa (modo RECOMPENSA, sem catálogo). `valor` nulo: o operador informa na aprovação.
	// Ausente em solicitações anteriores à recompensa avulsa.
	recompensaAvulsa?: { descricao: string; valor: number | null } | null;
	cupom: {
		cupomId: string;
		valorDesconto: number | null;
		titulo?: string | null;
		codigo?: string | null;
		validacaoModo?: string | null;
		condicoesTexto?: string | null;
	} | null;
	resultadoProcessamento?: TCreatePointOfInteractionTransactionOutput["data"] | null;
	statusPublico?: TPoiTransactionRequestStatusEnum;
	// Motivo escolhido pelo operador ao rejeitar. O cliente o lê na tela de espera do celular.
	// Ausente em rejeições anteriores ao motivo obrigatório.
	rejeicao?: TPoiTransactionRejection | null;
};

export const POI_REJECTION_NOTE_MAX_LENGTH = 200;

export type TPoiTransactionRejection = {
	motivo: TPoiTransactionRejectionReasonEnum;
	observacao: string | null;
};

/** Texto que o cliente lê quando a solicitação é rejeitada. Sem motivo (rejeições antigas), o texto genérico. */
export function getPoiRejectionPublicMessage(rejeicao: TPoiTransactionRejection | null | undefined) {
	if (!rejeicao) return "Sua solicitação não foi aprovada pelo operador. Tente novamente no balcão.";
	const reasonLabel = POI_TRANSACTION_REJECTION_REASON_LABELS[rejeicao.motivo] ?? POI_TRANSACTION_REJECTION_REASON_LABELS.OUTRO;
	const observacao = rejeicao.observacao?.trim();
	return observacao ? `Solicitação não aprovada: ${reasonLabel}. ${observacao}` : `Solicitação não aprovada: ${reasonLabel}.`;
}

export type TPoiPrizeInfoById = Record<string, { titulo?: string | null; imagemCapaUrl?: string | null }>;

/** Lê as recompensas de um resumo persistido, no formato atual ou no legado. */
export function readPoiSummaryPrizes(
	resumo: Pick<TPoiTransactionRequestSummary, "recompensas" | "recompensa"> | null | undefined,
): TPoiTransactionRequestSummaryPrize[] {
	if (!resumo) return [];
	if (Array.isArray(resumo.recompensas) && resumo.recompensas.length > 0) return resumo.recompensas;
	if (resumo.recompensa) return [{ ...resumo.recompensa, quantity: 1 }];
	return [];
}

export function buildPoiTransactionRequestSummary(
	input: TCreatePointOfInteractionTransactionRequestInput,
	prizeInfoById?: TPoiPrizeInfoById | null,
	couponInfo?: { titulo?: string | null; codigo?: string | null; validacaoModo?: string | null; condicoesTexto?: string | null } | null,
): TPoiTransactionRequestSummary {
	const prizeLines = resolvePoiPrizeLines(input.sale);
	const hasPrizes = prizeLines.length > 0;
	const freeFormReward = input.sale.freeFormReward ?? null;
	// Recompensa avulsa não tem venda: bruto e final são zero, o resgate é o débito (quando já definido).
	const valorBruto = freeFormReward ? 0 : hasPrizes ? sumPoiPrizeSaleValue(prizeLines) : input.sale.valor;
	const valorResgate = freeFormReward
		? (freeFormReward.valor ?? 0)
		: hasPrizes
			? sumPoiPrizeValue(prizeLines)
			: input.sale.cashback.aplicar
				? input.sale.cashback.valor
				: 0;
	return {
		cliente: {
			id: input.client.id ?? null,
			nome: input.client.nome,
			telefone: input.client.telefone,
		},
		venda: {
			entregaModalidade: input.sale.entregaModalidade ?? null,
			valorBruto,
			valorResgate,
			// Cupons MANUAL podem chegar sem valor definido (o operador informa na aprovação); nesse caso o valorFinal não o inclui.
			valorFinal: Math.max(0, valorBruto - valorResgate - (input.sale.coupon?.valorDesconto ?? 0)),
			modo: hasPrizes || freeFormReward ? "RECOMPENSA" : "DESCONTO",
			codigoParceiro: input.sale.partnerCode ?? null,
		},
		recompensas: prizeLines.map((line) => ({
			prizeId: line.prizeId,
			prizeValue: line.prizeValue,
			prizeSaleValue: line.prizeSaleValue,
			quantity: line.quantity,
			prizeTitulo: prizeInfoById?.[line.prizeId]?.titulo ?? null,
			prizeImageUrl: prizeInfoById?.[line.prizeId]?.imagemCapaUrl ?? null,
		})),
		recompensa: null,
		recompensaAvulsa: freeFormReward
			? { descricao: normalizeFreeFormRewardDescription(freeFormReward.descricao), valor: freeFormReward.valor ?? null }
			: null,
		cupom: input.sale.coupon
			? {
					cupomId: input.sale.coupon.cupomId,
					valorDesconto: input.sale.coupon.valorDesconto ?? null,
					titulo: couponInfo?.titulo ?? null,
					codigo: couponInfo?.codigo ?? null,
					validacaoModo: couponInfo?.validacaoModo ?? null,
					condicoesTexto: couponInfo?.condicoesTexto ?? null,
				}
			: null,
	};
}

export function withPoiTransactionProcessingResult({
	resumo,
	resultado,
	status,
}: {
	resumo: TPoiTransactionRequestSummary | null | undefined;
	resultado: TCreatePointOfInteractionTransactionOutput["data"] | null;
	status: TPoiTransactionRequestStatusEnum;
}) {
	if (!resumo) {
		throw new Error("Resumo da solicitação POI não informado.");
	}

	// Recompensa avulsa: o débito só existe depois que o operador o informa na aprovação. Gravá-lo no
	// resumo deixa o histórico da solicitação com o valor real, não com o "a definir" do pedido.
	const approvedFreeFormReward = resultado?.freeFormReward ?? null;
	if (approvedFreeFormReward) {
		return {
			...resumo,
			venda: { ...resumo.venda, valorResgate: approvedFreeFormReward.valor },
			recompensaAvulsa: approvedFreeFormReward,
			resultadoProcessamento: resultado,
			statusPublico: status,
		};
	}

	return {
		...resumo,
		resultadoProcessamento: resultado,
		statusPublico: status,
	};
}
