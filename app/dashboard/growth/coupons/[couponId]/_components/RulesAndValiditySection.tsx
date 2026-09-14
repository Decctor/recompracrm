"use client";

import CouponValidityAndLimitsBlock from "@/components/Modals/Coupons/Blocks/ValidityAndLimits";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Section } from "@/components/ui/section";
import { useCouponSectionEditor } from "@/state-hooks/use-coupon-section-editor";
import { SlidersHorizontal } from "lucide-react";
import type { CouponSectionProps } from "./section-props";

/**
 * Vigência, limites de uso e superfícies de resgate: as regras de *quando* e *onde* o cupom é
 * oferecido. As condições de carrinho ficam com os alvos, junto do bloco que já as desenha.
 */
export default function CouponRulesAndValiditySection({ coupon, callbacks }: CouponSectionProps) {
	const editor = useCouponSectionEditor({ coupon, section: "validity", callbacks });

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<SlidersHorizontal className="h-4 w-4 min-h-4 min-w-4" />
				</Section.Icon>
				<Section.Title>REGRAS, LIMITES E VIGÊNCIA</Section.Title>
			</Section.Header>
			<Section.Body>
				<CouponValidityAndLimitsBlock embedded coupon={editor.state.coupon} updateCoupon={editor.updateCoupon} />
				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />
			</Section.Body>
		</Section.Root>
	);
}
