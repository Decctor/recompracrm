import type { TCreateCampaignFlowInput } from "@/app/api/campaign-flows/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createCampaignFlow } from "@/lib/mutations/campaign-flows";
import { useCampaignFlowState } from "@/state-hooks/use-campaign-flow-state";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import CampaignFlowGeneralBlock from "./Blocks/General";
import RecurrenceConfigBlock from "./Blocks/RecurrenceConfig";
import AudienceSelectBlock from "./Blocks/AudienceSelect";

type NewCampaignFlowProps = {
	closeModal: () => void;
	callbacks?: {
		onMutate?: (info: TCreateCampaignFlowInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export function NewCampaignFlow({ closeModal, callbacks }: NewCampaignFlowProps) {
	const { state, updateCampaignFlow } = useCampaignFlowState({ initialState: {} });

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-campaign-flow"],
		mutationFn: createCampaignFlow,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => {
			callbacks?.onError?.(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVO FLUXO DE CAMPANHA"
			menuDescription="Configure as informações básicas do fluxo"
			menuActionButtonText="CRIAR FLUXO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate(state)}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<CampaignFlowGeneralBlock campaignFlow={state.campaignFlow} updateCampaignFlow={updateCampaignFlow} />
			<RecurrenceConfigBlock campaignFlow={state.campaignFlow} updateCampaignFlow={updateCampaignFlow} />
			<AudienceSelectBlock campaignFlow={state.campaignFlow} updateCampaignFlow={updateCampaignFlow} />
		</ResponsiveMenu>
	);
}
