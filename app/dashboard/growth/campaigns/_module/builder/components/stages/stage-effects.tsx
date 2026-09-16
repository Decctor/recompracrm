"use client";

import CampaignsCashbackGenerationBlock from "@/app/dashboard/growth/campaigns/_module/shared/form/Blocks/CashbackGeneration";
import { CalendarRange } from "lucide-react";
import type { TStageValidationResult } from "../../helpers/validation";
import { useBuilderCampaign, useBuilderUi } from "../builder-provider";
import BuilderCouponGenerationBlock from "../coupon/coupon-generation-block";
import CouponTemplateVariableNotice from "../coupon/coupon-template-variable-notice";
import { StageShell } from "../stage-shell";

type StageEffectsProps = {
	validation: TStageValidationResult;
};

export default function StageEffects({ validation }: StageEffectsProps) {
	const { back, next } = useBuilderUi();
	const { state, updateCampaign } = useBuilderCampaign();

	return (
		<StageShell>
			<StageShell.Title
				icon={CalendarRange}
				label="Efeitos"
				description="Defina se a campanha gera cashback e/ou atribui cupons, e quais regras serão usadas."
			/>
			<StageShell.Body>
				<CampaignsCashbackGenerationBlock campaign={state.campaign} updateCampaign={updateCampaign} />
				<BuilderCouponGenerationBlock campaign={state.campaign} updateCampaign={updateCampaign} />
				<CouponTemplateVariableNotice campaign={state.campaign} />
			</StageShell.Body>
			<StageShell.Footer onBack={back} onNext={next} nextDisabled={!validation.valid} nextDisabledReason={validation.reason} />
		</StageShell>
	);
}
