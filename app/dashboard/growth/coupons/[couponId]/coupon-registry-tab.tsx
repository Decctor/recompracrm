"use client";

import type { TGetCouponsOutputById } from "@/app/api/coupons/route";
import CouponAudienceAndTargetsSection from "./_components/AudienceAndTargetsSection";
import CouponBenefitSection from "./_components/BenefitSection";
import CouponGeneralSection from "./_components/GeneralSection";
import CouponRulesAndValiditySection from "./_components/RulesAndValiditySection";

type CouponRegistryTabProps = {
	coupon: TGetCouponsOutputById;
	/** Sem `campanhas.editar` o cadastro é só leitura: os campos e as barras de aplicar ficam desabilitados. */
	canEdit: boolean;
	callbacks: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/**
 * Cadastro do cupom editável no lugar, seção por seção — o mesmo idioma do cadastro de produto.
 *
 * Substitui o modal `ControlCoupon`: abrir um formulário de seis blocos por cima da página para
 * corrigir um teto de desconto escondia justamente o número que motivou a correção.
 */
export default function CouponRegistryTab({ coupon, canEdit, callbacks }: CouponRegistryTabProps) {
	return (
		<fieldset disabled={!canEdit} className="flex w-full min-w-0 flex-col gap-6">
			<CouponGeneralSection coupon={coupon} callbacks={callbacks} />
			<CouponBenefitSection coupon={coupon} callbacks={callbacks} />
			<CouponRulesAndValiditySection coupon={coupon} callbacks={callbacks} />
			<CouponAudienceAndTargetsSection coupon={coupon} callbacks={callbacks} />
		</fieldset>
	);
}
