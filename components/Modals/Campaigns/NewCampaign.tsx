import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { createCampaign } from "@/lib/mutations/campaigns";
import { useCampaignState } from "@/state-hooks/use-campaign-state";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import CampaignsActionBlock from "./Blocks/Action";
import CampaignsCashbackGenerationBlock from "./Blocks/CashbackGeneration";
import CampaignsConfigBlock from "./Blocks/Config";
import CampaignsConversionBlock from "./Blocks/Conversion";
import CampaignsExecutionBlock from "./Blocks/Execution";
import CampaignsGeneralBlock from "./Blocks/General";
import CampaignsTriggerBlock from "./Blocks/Trigger";

type NewCampaignProps = {
	user: TAuthUserSession["user"];
	organizationId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};
export default function NewCampaign({ user, organizationId, closeModal, callbacks }: NewCampaignProps) {
	const { state, updateCampaign, addSegmentation, updateSegmentation, deleteSegmentation, resetState, redefineState } = useCampaignState();

	const { mutate: handleCreateCampaignMutation, isPending } = useMutation({
		mutationKey: ["create-campaign"],
		mutationFn: createCampaign,
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate();
			return;
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			return toast.success(data.message);
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			return;
		},
	});
	return (
		<ResponsiveMenu
			menuTitle="NOVA CAMPANHA"
			menuDescription="Preencha os campos abaixo para criar uma nova campanha"
			menuActionButtonText="CRIAR CAMPANHA"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleCreateCampaignMutation({ campaign: state.campaign, segmentations: state.segmentations })}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<CampaignsGeneralBlock
				campaign={state.campaign}
				updateCampaign={updateCampaign}
				campaignSegmentations={state.segmentations}
				addSegmentation={addSegmentation}
				deleteSegmentation={deleteSegmentation}
			/>
			<CampaignsTriggerBlock campaign={state.campaign} updateCampaign={updateCampaign} />
			<CampaignsExecutionBlock campaign={state.campaign} updateCampaign={updateCampaign} campaignSegmentations={state.segmentations} />
			<CampaignsActionBlock organizationId={organizationId} campaign={state.campaign} updateCampaign={updateCampaign} />
			<CampaignsConversionBlock campaign={state.campaign} updateCampaign={updateCampaign} />
			<CampaignsConfigBlock campaign={state.campaign} updateCampaign={updateCampaign} />
			<CampaignsCashbackGenerationBlock campaign={state.campaign} updateCampaign={updateCampaign} />
		</ResponsiveMenu>
	);
}
