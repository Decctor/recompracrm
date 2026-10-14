"use client";

import type { TUpdatePreparationStationInput } from "@/app/api/preparation-stations/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { updatePreparationStation } from "@/lib/mutations/preparation-stations";
import { PREPARATION_STATIONS_QUERY_KEY, usePreparationStationById, usePreparationStations } from "@/lib/queries/preparation-stations";
import { toPreparationStationPayload, useInternalPreparationStationState } from "@/state-hooks/use-internal-preparation-station-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import PreparationStationGeneralBlock from "./Blocks/General";
import PreparationStationRulesBlock from "./Blocks/Rules";

type ControlPreparationStationProps = {
	stationId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdatePreparationStationInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function ControlPreparationStation({ stationId, closeModal, callbacks }: ControlPreparationStationProps) {
	const queryClient = useQueryClient();
	const { data: station, queryKey, isLoading, isError, error } = usePreparationStationById({ stationId });
	const { data: stations } = usePreparationStations();
	const { state, updateStation, addRule, removeRule, replaceGroupRules, redefineState } = useInternalPreparationStationState();

	useEffect(() => {
		if (!station) return;
		redefineState({
			station: {
				nome: station.nome,
				ordem: station.ordem,
				ativa: station.ativa,
				padrao: station.padrao,
				escopoTicket: station.escopoTicket,
			},
			// Regra PRODUTO cujo produto foi excluído chega com `produto: null`: fica de fora e some
			// no próximo salvamento.
			rules: station.regras.flatMap((regra) =>
				regra.valor.criterio === "PRODUTO" && !regra.produto ? [] : [{ criterio: regra.valor.criterio, valor: regra.valor, produto: regra.produto }],
			),
		});
	}, [station, redefineState]);

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-preparation-station", stationId],
		mutationFn: updatePreparationStation,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: async (response) => {
			await Promise.all([queryClient.invalidateQueries({ queryKey: PREPARATION_STATIONS_QUERY_KEY }), queryClient.invalidateQueries({ queryKey })]);
			callbacks?.onSuccess?.();
			toast.success(response.message);
			closeModal();
		},
		onError: (mutationError) => {
			callbacks?.onError?.(mutationError);
			toast.error(getErrorMessage(mutationError));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	return (
		<ResponsiveMenu
			menuTitle="EDITAR ESTAÇÃO DE PREPARO"
			menuDescription="Ajuste o que esta estação prepara e o que o ticket dela mostra."
			menuActionButtonText="SALVAR"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate({ stationId, ...toPreparationStationPayload(state) })}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<PreparationStationGeneralBlock station={state.station} updateStation={updateStation} />
			<PreparationStationRulesBlock
				rules={state.rules}
				addRule={addRule}
				removeRule={removeRule}
				replaceGroupRules={replaceGroupRules}
				stations={stations ?? []}
				currentStationId={stationId}
			/>
		</ResponsiveMenu>
	);
}
