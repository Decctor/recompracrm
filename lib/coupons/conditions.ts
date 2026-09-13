import { DeliveryModeEnum, type TDeliveryModeEnum } from "@/schemas/enums";

export type TCouponCheckoutConditions = {
	condicaoModalidadesEntrega?: TDeliveryModeEnum[] | null;
	condicaoPrimeiraCompra?: boolean;
};

export type TCouponEvaluationContext = {
	entregaModalidade: TDeliveryModeEnum | null;
	comprasAnterioresConfirmadas: number;
};

/** Regras estruturadas comuns aos descontos automáticos e manuais. */
export function getCouponCheckoutConditionIssue(coupon: TCouponCheckoutConditions, context: TCouponEvaluationContext): string | null {
	if (coupon.condicaoModalidadesEntrega?.length) {
		if (!context.entregaModalidade) return "Selecione a modalidade de atendimento para usar este cupom.";
		if (!coupon.condicaoModalidadesEntrega.includes(context.entregaModalidade)) {
			return "Este cupom não é válido para a modalidade de atendimento selecionada.";
		}
	}
	if (coupon.condicaoPrimeiraCompra && context.comprasAnterioresConfirmadas > 0) {
		return "Este cupom é válido somente na primeira compra.";
	}
	return null;
}

/** Old snapshots predate checkout restrictions and remain unrestricted. */
export function readCouponCheckoutConditions(snapshot: unknown): TCouponCheckoutConditions {
	if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
	const data = snapshot as Record<string, unknown>;
	const modes = DeliveryModeEnum.array().nullable().optional().safeParse(data.condicaoModalidadesEntrega);
	return {
		condicaoModalidadesEntrega: modes.success ? modes.data : null,
		condicaoPrimeiraCompra: data.condicaoPrimeiraCompra === true,
	};
}
