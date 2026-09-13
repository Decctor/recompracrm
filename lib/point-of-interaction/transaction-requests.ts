import type {
	TCreatePointOfInteractionTransactionOutput,
	TCreatePointOfInteractionTransactionRequestInput,
} from "@/app/api/point-of-interaction/new-transaction/route";
import type { TDeliveryModeEnum, TPoiTransactionRequestStatusEnum } from "@/schemas/enums";

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
	recompensa: {
		prizeId: string;
		prizeValue: number;
		prizeSaleValue: number;
		prizeTitulo?: string | null;
		prizeImageUrl?: string | null;
	} | null;
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

export function buildPoiTransactionRequestSummary(
	input: TCreatePointOfInteractionTransactionRequestInput,
	prizeInfo?: { titulo?: string | null; imagemCapaUrl?: string | null } | null,
	couponInfo?: { titulo?: string | null; codigo?: string | null; validacaoModo?: string | null; condicoesTexto?: string | null } | null,
): TPoiTransactionRequestSummary {
	return {
		cliente: {
			id: input.client.id ?? null,
			nome: input.client.nome,
			telefone: input.client.telefone,
		},
		venda: {
			entregaModalidade: input.sale.entregaModalidade ?? null,
			valorBruto: input.sale.prizeRedemption?.prizeSaleValue ?? input.sale.valor,
			valorResgate: input.sale.prizeRedemption?.prizeValue ?? (input.sale.cashback.aplicar ? input.sale.cashback.valor : 0),
			// Cupons MANUAL podem chegar sem valor definido (o operador informa na aprovação); nesse caso o valorFinal não o inclui.
			valorFinal: Math.max(
				0,
				(input.sale.prizeRedemption?.prizeSaleValue ?? input.sale.valor) -
					(input.sale.prizeRedemption?.prizeValue ?? (input.sale.cashback.aplicar ? input.sale.cashback.valor : 0)) -
					(input.sale.coupon?.valorDesconto ?? 0),
			),
			modo: input.sale.prizeRedemption ? "RECOMPENSA" : "DESCONTO",
			codigoParceiro: input.sale.partnerCode ?? null,
		},
		recompensa: input.sale.prizeRedemption
			? {
					prizeId: input.sale.prizeRedemption.prizeId,
					prizeValue: input.sale.prizeRedemption.prizeValue,
					prizeSaleValue: input.sale.prizeRedemption.prizeSaleValue,
					prizeTitulo: prizeInfo?.titulo ?? null,
					prizeImageUrl: prizeInfo?.imagemCapaUrl ?? null,
				}
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

	return {
		...resumo,
		resultadoProcessamento: resultado,
		statusPublico: status,
	};
}
