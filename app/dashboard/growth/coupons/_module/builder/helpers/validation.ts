import type { TUseInternalCouponState } from "@/state-hooks/use-internal-coupon-state";
import type { TCouponStageId } from "./stages";

type TCoupon = TUseInternalCouponState["state"]["coupon"];
type TTargets = TUseInternalCouponState["state"]["couponTargets"];

export type TStageValidationResult = {
	valid: boolean;
	reason?: string;
};

function activeTargetsCount(targets: TTargets): number {
	return targets.filter((target) => !target.deletar).length;
}

// Mirrors assertCouponCoherence on the server, surfaced per stage so the user
// learns about a problem on the step that owns it instead of at final submit.
function validateBenefitStage(coupon: TCoupon): TStageValidationResult {
	switch (coupon.beneficioTipo) {
		case "BRINDE":
			return { valid: true };
		case "DESCONTO_PERCENTUAL":
			if (!coupon.beneficioValor || coupon.beneficioValor <= 0) return { valid: false, reason: "Informe a porcentagem de desconto." };
			if (coupon.beneficioValor > 100) return { valid: false, reason: "O desconto percentual não pode passar de 100%." };
			return { valid: true };
		case "DESCONTO_FIXO":
			if (!coupon.beneficioValor || coupon.beneficioValor <= 0) return { valid: false, reason: "Informe o valor do desconto em reais." };
			return { valid: true };
		case "PRECO_FIXO":
			if (!coupon.beneficioValor || coupon.beneficioValor <= 0) return { valid: false, reason: "Informe o preço fixo por unidade." };
			return { valid: true };
		case "COMPRE_X_LEVE_Y": {
			const pague = coupon.beneficioCompreQuantidade ?? 0;
			const leve = coupon.beneficioLeveQuantidade ?? 0;
			if (pague < 1) return { valid: false, reason: "A quantidade paga deve ser pelo menos 1." };
			if (leve <= pague) return { valid: false, reason: "A quantidade levada deve ser maior que a quantidade paga." };
			return { valid: true };
		}
		default:
			return { valid: false, reason: "Escolha o tipo de benefício." };
	}
}

function validateRulesStage(coupon: TCoupon, targets: TTargets): TStageValidationResult {
	if (coupon.beneficioTipo === "BRINDE" && !targets.some((target) => !target.deletar && target.papel === "BENEFICIADO"))
		return { valid: false, reason: "Escolha pelo menos um produto ou grupo que ganha o brinde." };
	if (coupon.validacaoModo === "MANUAL") {
		if (!coupon.condicoesTexto?.trim()) return { valid: false, reason: "Descreva as condições de resgate para orientar o operador." };
		return { valid: true };
	}
	if (coupon.beneficioAplicacao === "ITENS_ELEGIVEIS" && activeTargetsCount(targets) === 0) {
		return { valid: false, reason: "Como o desconto vale só para itens específicos, adicione ao menos um produto ou grupo alvo." };
	}
	return { valid: true };
}

function validateAudienceStage(): TStageValidationResult {
	// Optional. GLOBAL without audiences serves everyone; INDIVIDUAL is assigned per client.
	return { valid: true };
}

function validateValidityStage(coupon: TCoupon): TStageValidationResult {
	if (coupon.vigenciaInicio && coupon.vigenciaFim && coupon.vigenciaFim < coupon.vigenciaInicio) {
		return { valid: false, reason: "A data de fim deve ser posterior à data de início." };
	}
	if (coupon.limiteResgatesPorCliente != null && coupon.limiteResgatesPorCliente < 1) {
		return { valid: false, reason: "O limite por cliente deve ser pelo menos 1." };
	}
	if (coupon.limiteResgatesTotal != null && coupon.limiteResgatesTotal < 1) {
		return { valid: false, reason: "O limite total, quando definido, deve ser pelo menos 1." };
	}
	if (!coupon.resgatePermitirViaPos && !coupon.resgatePermitirViaPontoInteracao && !coupon.resgatePermitirViaLojaDigital) {
		return { valid: false, reason: "Ative ao menos um canal de resgate." };
	}
	return { valid: true };
}

function validateReviewStage(coupon: TCoupon): TStageValidationResult {
	if (!coupon.titulo?.trim()) return { valid: false, reason: "Dê um título ao cupom." };
	if (!coupon.codigo?.trim()) return { valid: false, reason: "Defina o código do cupom." };
	return { valid: true };
}

export function validateStage(stage: TCouponStageId, coupon: TCoupon, targets: TTargets): TStageValidationResult {
	switch (stage) {
		case "benefit":
			return validateBenefitStage(coupon);
		case "rules":
			return validateRulesStage(coupon, targets);
		case "audience":
			return validateAudienceStage();
		case "validity":
			return validateValidityStage(coupon);
		case "review":
			return validateReviewStage(coupon);
	}
}
