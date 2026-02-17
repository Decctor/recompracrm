import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { createCampaign } from "@/lib/mutations/campaigns";
import { updateCampaign as updateCampaignMutation } from "@/lib/mutations/campaigns";
import { useCampaignById } from "@/lib/queries/campaigns";
import { useCampaignState } from "@/state-hooks/use-campaign-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import CampaignsActionBlock from "./Blocks/Action";
import CampaignsCashbackGenerationBlock from "./Blocks/CashbackGeneration";
import CampaignsConfigBlock from "./Blocks/Config";
import CampaignsConversionBlock from "./Blocks/Conversion";
import CampaignsExecutionBlock from "./Blocks/Execution";
import CampaignsGeneralBlock from "./Blocks/General";
import CampaignsTriggerBlock from "./Blocks/Trigger";

type ControlCampaignProps = {
	campaignId: string;
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
export default function ControlCampaign({ campaignId, user, organizationId, closeModal, callbacks }: ControlCampaignProps) {
	const queryClient = useQueryClient();
	const { state, updateCampaign, addSegmentation, updateSegmentation, deleteSegmentation, resetState, redefineState } = useCampaignState();

	const { data: campaign, queryKey, isLoading, isError, isSuccess, error } = useCampaignById({ id: campaignId });

	const { mutate: handleUpdateCampaignMutation, isPending } = useMutation({
		mutationKey: ["update-campaign"],
		mutationFn: updateCampaignMutation,
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey });
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
			return queryClient.invalidateQueries({ queryKey });
		},
	});
	useEffect(() => {
		if (campaign) redefineState({ campaign: campaign, segmentations: campaign.segmentacoes });
	}, [campaign, redefineState]);
	return (
		<ResponsiveMenu
			menuTitle="EDITAR CAMPANHA"
			menuDescription="Preencha os campos abaixo para editar a campanha"
			menuActionButtonText="ATUALIZAR CAMPANHA"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleUpdateCampaignMutation({ campaignId: campaignId, campaign: state.campaign, segmentations: state.segmentations })}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeModal}
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
