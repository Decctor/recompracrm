"use client";

import type { TCreatePreparationStationInput } from "@/app/api/preparation-stations/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createPreparationStation } from "@/lib/mutations/preparation-stations";
import { PREPARATION_STATIONS_QUERY_KEY, usePreparationStations } from "@/lib/queries/preparation-stations";
import { toPreparationStationPayload, useInternalPreparationStationState } from "@/state-hooks/use-internal-preparation-station-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import PreparationStationGeneralBlock from "./Blocks/General";
import PreparationStationRulesBlock from "./Blocks/Rules";

type NewPreparationStationProps = {
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TCreatePreparationStationInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function NewPreparationStation({ closeModal, callbacks }: NewPreparationStationProps) {
	const queryClient = useQueryClient();
	const { data: stations } = usePreparationStations();
	const { state, updateStation, addRule, removeRule, replaceGroupRules } = useInternalPreparationStationState();

	// A primeira estação ativa nasce padrão (o servidor garante de qualquer forma; aqui é para a tela
	// não mentir). Derivado na renderização: a lista chega depois da montagem do modal.
	const isFirstStation = stations?.length === 0;
	const station = isFirstStation && state.station.ativa ? { ...state.station, padrao: true } : state.station;

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-preparation-station"],
		mutationFn: createPreparationStation,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: async (response) => {
			await queryClient.invalidateQueries({ queryKey: PREPARATION_STATIONS_QUERY_KEY });
			callbacks?.onSuccess?.();
			toast.success(response.message);
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
			menuTitle="NOVA ESTAÇÃO DE PREPARO"
			menuDescription="Defina para onde vão os itens do ticket de preparo — bebidas no balcão, lanches na cozinha."
			menuActionButtonText="CRIAR"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate(toPreparationStationPayload({ ...state, station }))}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<PreparationStationGeneralBlock station={station} updateStation={updateStation} />
			<PreparationStationRulesBlock
				rules={state.rules}
				addRule={addRule}
				removeRule={removeRule}
				replaceGroupRules={replaceGroupRules}
				stations={stations ?? []}
				currentStationId={null}
			/>
		</ResponsiveMenu>
	);
}
