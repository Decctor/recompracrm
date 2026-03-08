"use client";

import type { TUpdateCampaignAudienceInput } from "@/app/api/campaign-audiences/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { updateCampaignAudience as updateCampaignAudienceMutation } from "@/lib/mutations/campaign-audiences";
import { useCampaignAudienceById } from "@/lib/queries/campaign-audiences";
import { useCampaignAudienceState } from "@/state-hooks/use-campaign-audience-state";
import type { TFilterTree } from "@/schemas/campaign-audiences";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import CampaignAudienceGeneralBlock from "./Blocks/General";
import FiltersBlock from "./Blocks/Filters";

type ControlCampaignAudienceProps = {
	audienceId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdateCampaignAudienceInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export function ControlCampaignAudience({ audienceId, closeModal, callbacks }: ControlCampaignAudienceProps) {
	const queryClient = useQueryClient();
	const { data: audience, queryKey, isLoading, error } = useCampaignAudienceById({ id: audienceId });
	const { state, updateAudience, setFilters, redefineState } = useCampaignAudienceState({ initialState: {} });

	useEffect(() => {
		if (!audience) return;
		redefineState({
			audience: {
				titulo: audience.titulo,
				descricao: audience.descricao ?? null,
				filtros: audience.filtros as TFilterTree,
			},
		});
	}, [audience, redefineState]);

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-campaign-audience", audienceId],
		mutationFn: updateCampaignAudienceMutation,
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey });
			callbacks?.onMutate?.(variables);
		},
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => {
			callbacks?.onError?.(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			callbacks?.onSettled?.();
			await queryClient.invalidateQueries({ queryKey });
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="EDITAR PÚBLICO"
			menuDescription="Atualize os filtros do público-alvo"
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate({ audienceId, audience: state.audience })}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<CampaignAudienceGeneralBlock audience={state.audience} updateAudience={updateAudience} />
			<FiltersBlock filtros={state.audience.filtros} setFilters={setFilters} />
		</ResponsiveMenu>
	);
}
