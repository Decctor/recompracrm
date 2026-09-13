"use client";

import CouponGeneralBlock from "@/components/Modals/Coupons/Blocks/General";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Section } from "@/components/ui/section";
import { useCouponSectionEditor } from "@/state-hooks/use-coupon-section-editor";
import { LayoutGrid } from "lucide-react";
import type { CouponSectionProps } from "./section-props";

export default function CouponGeneralSection({ coupon, callbacks }: CouponSectionProps) {
	const editor = useCouponSectionEditor({ coupon, section: "general", callbacks });

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<LayoutGrid className="h-4 w-4 min-h-4 min-w-4" />
				</Section.Icon>
				<Section.Title>IDENTIFICAÇÃO DO CUPOM</Section.Title>
			</Section.Header>
			<Section.Body>
				<CouponGeneralBlock embedded coupon={editor.state.coupon} updateCoupon={editor.updateCoupon} />
				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />
			</Section.Body>
		</Section.Root>
	);
}
