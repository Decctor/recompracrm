"use client";

import type { TUpdateCampaignFlowInput } from "@/app/api/campaign-flows/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { updateCampaignFlow as updateCampaignFlowMutation } from "@/lib/mutations/campaign-flows";
import { useCampaignFlowById } from "@/lib/queries/campaign-flows";
import { useCampaignFlowState } from "@/state-hooks/use-campaign-flow-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import CampaignFlowGeneralBlock from "./Blocks/General";
import RecurrenceConfigBlock from "./Blocks/RecurrenceConfig";
import AudienceSelectBlock from "./Blocks/AudienceSelect";

type ControlCampaignFlowProps = {
	flowId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdateCampaignFlowInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export function ControlCampaignFlow({ flowId, closeModal, callbacks }: ControlCampaignFlowProps) {
	const queryClient = useQueryClient();
	const { data: flow, queryKey, isLoading, error } = useCampaignFlowById({ id: flowId });
	const { state, updateCampaignFlow, redefineState } = useCampaignFlowState({ initialState: {} });

	useEffect(() => {
		if (!flow) return;
		redefineState({
			campaignFlow: {
				titulo: flow.titulo,
				descricao: flow.descricao ?? null,
				status: flow.status,
				tipo: flow.tipo,
				recorrenciaTipo: flow.recorrenciaTipo ?? null,
				recorrenciaIntervalo: flow.recorrenciaIntervalo ?? 1,
				recorrenciaDiasSemana: flow.recorrenciaDiasSemana as number[] | null,
				recorrenciaDiasMes: flow.recorrenciaDiasMes as number[] | null,
				recorrenciaBlocoHorario: flow.recorrenciaBlocoHorario ?? null,
				unicaDataExecucao: flow.unicaDataExecucao ?? null,
				unicaExecutada: flow.unicaExecutada ?? false,
				atribuicaoModelo: flow.atribuicaoModelo ?? "LAST_TOUCH",
				atribuicaoJanelaDias: flow.atribuicaoJanelaDias ?? 14,
				publicoId: flow.publicoId ?? null,
			},
			nos: flow.nos.map((no) => ({
				id: no.id,
				tipo: no.tipo,
				subtipo: no.subtipo,
				rotulo: no.rotulo ?? null,
				configuracao: no.configuracao as Record<string, unknown>,
				posicaoX: no.posicaoX ?? null,
				posicaoY: no.posicaoY ?? null,
			})),
			arestas: flow.arestas.map((aresta) => ({
				id: aresta.id,
				noOrigemId: aresta.noOrigemId,
				noDestinoId: aresta.noDestinoId,
				condicaoLabel: aresta.condicaoLabel ?? null,
				ordem: aresta.ordem ?? 0,
			})),
		});
	}, [flow, redefineState]);

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-campaign-flow", flowId],
		mutationFn: updateCampaignFlowMutation,
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
			menuTitle="EDITAR FLUXO DE CAMPANHA"
			menuDescription="Atualize as informações do fluxo de campanha"
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={() =>
				mutate({
					campaignFlowId: flowId,
					campaignFlow: state.campaignFlow,
					nos: state.nos,
					arestas: state.arestas,
				})
			}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<CampaignFlowGeneralBlock campaignFlow={state.campaignFlow} updateCampaignFlow={updateCampaignFlow} />
			<RecurrenceConfigBlock campaignFlow={state.campaignFlow} updateCampaignFlow={updateCampaignFlow} />
			<AudienceSelectBlock campaignFlow={state.campaignFlow} updateCampaignFlow={updateCampaignFlow} />
		</ResponsiveMenu>
	);
}
