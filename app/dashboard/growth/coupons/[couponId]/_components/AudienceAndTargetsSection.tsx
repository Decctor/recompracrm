"use client";

import CouponAudienceBlock from "@/components/Modals/Coupons/Blocks/Audience";
import CouponCheckoutConditionsBlock from "@/components/Modals/Coupons/Blocks/CheckoutConditions";
import CouponTargetsBlock from "@/components/Modals/Coupons/Blocks/Targets";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Section } from "@/components/ui/section";
import { useCouponSectionEditor } from "@/state-hooks/use-coupon-section-editor";
import { Users } from "lucide-react";
import type { CouponSectionProps } from "./section-props";

/**
 * Quem o cupom alcança e sobre o que ele incide: audiências (exclusivas de cupons globais, como a
 * rota exige) e os alvos de produto com as condições de carrinho que andam com eles.
 *
 * Em validação manual não há alvos a conferir — o operador lê as condições em texto —, então a
 * seção mostra apenas as condições de carrinho, como o modal fazia.
 */
export default function CouponAudienceAndTargetsSection({ coupon, callbacks }: CouponSectionProps) {
	const editor = useCouponSectionEditor({ coupon, section: "audience", callbacks });
	const { state } = editor;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Users className="h-4 w-4 min-h-4 min-w-4" />
				</Section.Icon>
				<Section.Title>AUDIÊNCIA, ALVOS E CONDIÇÕES</Section.Title>
			</Section.Header>
			<Section.Body>
				{state.coupon.escopo === "GLOBAL" ? (
					<CouponAudienceBlock
						embedded
						couponAudiences={state.couponAudiences}
						addCouponAudience={editor.addCouponAudience}
						removeCouponAudience={editor.removeCouponAudience}
					/>
				) : (
					<p className="text-xs text-muted-foreground">
						Cupom de clientes específicos: o alcance vem das atribuições individuais, não de audiências por tag ou segmento.
					</p>
				)}
				{state.coupon.validacaoModo === "AUTOMATICA" ? (
					<CouponTargetsBlock
						embedded
						coupon={state.coupon}
						couponTargets={state.couponTargets}
						updateCoupon={editor.updateCoupon}
						addCouponTarget={editor.addCouponTarget}
						updateCouponTarget={editor.updateCouponTarget}
						removeCouponTarget={editor.removeCouponTarget}
					/>
				) : (
					<CouponCheckoutConditionsBlock coupon={state.coupon} updateCoupon={editor.updateCoupon} />
				)}
				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />
			</Section.Body>
		</Section.Root>
	);
}
