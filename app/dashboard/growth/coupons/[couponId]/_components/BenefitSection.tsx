"use client";

import CouponBenefitBlock from "@/components/Modals/Coupons/Blocks/Benefit";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Section } from "@/components/ui/section";
import { useCouponSectionEditor } from "@/state-hooks/use-coupon-section-editor";
import { BadgePercent } from "lucide-react";
import type { CouponSectionProps } from "./section-props";

export default function CouponBenefitSection({ coupon, callbacks }: CouponSectionProps) {
	const editor = useCouponSectionEditor({ coupon, section: "benefit", callbacks });

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<BadgePercent className="h-4 w-4 min-h-4 min-w-4" />
				</Section.Icon>
				<Section.Title>BENEFÍCIO</Section.Title>
			</Section.Header>
			<Section.Body>
				<CouponBenefitBlock embedded coupon={editor.state.coupon} updateCoupon={editor.updateCoupon} />
				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />
			</Section.Body>
		</Section.Root>
	);
}
