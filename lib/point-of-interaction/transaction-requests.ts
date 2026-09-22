import type {
	TCreatePointOfInteractionTransactionOutput,
	TCreatePointOfInteractionTransactionRequestInput,
} from "@/app/api/point-of-interaction/new-transaction/route";
import type { TDeliveryModeEnum, TPoiTransactionRequestStatusEnum } from "@/schemas/enums";
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
};

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
	const valorBruto = hasPrizes ? sumPoiPrizeSaleValue(prizeLines) : input.sale.valor;
	const valorResgate = hasPrizes ? sumPoiPrizeValue(prizeLines) : input.sale.cashback.aplicar ? input.sale.cashback.valor : 0;
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
			modo: hasPrizes ? "RECOMPENSA" : "DESCONTO",
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

	return {
		...resumo,
		resultadoProcessamento: resultado,
		statusPublico: status,
	};
}
