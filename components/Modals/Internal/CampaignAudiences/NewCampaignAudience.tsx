import type { TCreateCampaignAudienceInput } from "@/app/api/campaign-audiences/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createCampaignAudience } from "@/lib/mutations/campaign-audiences";
import { useCampaignAudienceState } from "@/state-hooks/use-campaign-audience-state";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import CampaignAudienceGeneralBlock from "./Blocks/General";
import FiltersBlock from "./Blocks/Filters";

type NewCampaignAudienceProps = {
	closeModal: () => void;
	callbacks?: {
		onMutate?: (info: TCreateCampaignAudienceInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export function NewCampaignAudience({ closeModal, callbacks }: NewCampaignAudienceProps) {
	const { state, updateAudience, setFilters } = useCampaignAudienceState({ initialState: {} });

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-campaign-audience"],
		mutationFn: createCampaignAudience,
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
			menuTitle="NOVO PÚBLICO"
			menuDescription="Defina os filtros para segmentar seu público-alvo"
			menuActionButtonText="CRIAR PÚBLICO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate(state)}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<CampaignAudienceGeneralBlock audience={state.audience} updateAudience={updateAudience} />
			<FiltersBlock filtros={state.audience.filtros} setFilters={setFilters} />
		</ResponsiveMenu>
	);
}
