"use client";

import CampaignsExecutionBlock from "@/app/dashboard/growth/campaigns/_module/shared/form/Blocks/Execution";
import { Send } from "lucide-react";
import type { TStageValidationResult } from "../../helpers/validation";
import { useBuilderCampaign, useBuilderUi } from "../builder-provider";
import { StageShell } from "../stage-shell";

type StageSendProps = {
	validation: TStageValidationResult;
};

export default function StageSend({ validation }: StageSendProps) {
	const { back, next } = useBuilderUi();
	const { state, updateCampaign } = useBuilderCampaign();

	return (
		<StageShell>
			<StageShell.Title icon={Send} label="Envio" description="Configure quando a mensagem é enviada depois que o gatilho dispara." />
			<StageShell.Body>
				<CampaignsExecutionBlock
					campaign={state.campaign}
					updateCampaign={updateCampaign}
					campaignSegmentations={state.segmentations}
				/>
			</StageShell.Body>
			<StageShell.Footer
				onBack={back}
				onNext={next}
				nextDisabled={!validation.valid}
				nextDisabledReason={validation.reason}
			/>
		</StageShell>
	);
}
