"use client";

import type { TGetLeadsOutputById, TUpdateLeadInput } from "@/app/api/admin/crm/leads/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { updateInternalLead } from "@/lib/mutations/crm";
import { useInternalLeadById } from "@/lib/queries/crm";
import type { TInternalLead } from "@/schemas/internal-leads";
import { useInternalLeadState } from "@/state-hooks/use-internal-lead-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import LeadsContactBlock from "./Blocks/Contact";
import LeadsOpportunityBlock from "./Blocks/Opportunity";
import LeadsOrganizationBlock from "./Blocks/Organization";

function mapApiLeadToState(lead: TGetLeadsOutputById): TInternalLead {
	return {
		statusCRM: lead.statusCRM,
		posicaoKanban: lead.posicaoKanban ?? null,
		titulo: lead.titulo ?? null,
		descricao: lead.descricao ?? null,
		valor: lead.valor ?? null,
		probabilidade: lead.probabilidade ?? null,
		origemLead: lead.origemLead ?? null,
		motivoPerda: lead.motivoPerda ?? null,
		organizacaoId: lead.organizacaoId ?? null,
		organizacaoNome: lead.organizacaoNome,
		organizacaoCnpj: lead.organizacaoCnpj,
		organizacaoLogoUrl: lead.organizacaoLogoUrl ?? null,
		organizacaoTelefone: lead.organizacaoTelefone ?? null,
		organizacaoEmail: lead.organizacaoEmail ?? null,
		organizacaoSite: lead.organizacaoSite ?? null,
		contatoNome: lead.contatoNome,
		contatoEmail: lead.contatoEmail,
		contatoTelefone: lead.contatoTelefone ?? null,
		contatoCargo: lead.contatoCargo ?? null,
		contatoUsuarioId: lead.contatoUsuarioId ?? null,
		responsavelId: lead.responsavelId ?? null,
	};
}

type ControlLeadProps = {
	leadId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdateLeadInput) => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

export default function ControlLead({ leadId, closeModal, callbacks }: ControlLeadProps) {
	const queryClient = useQueryClient();
	const { state, updateLead, redefineState } = useInternalLeadState();

	const { data: lead, queryKey, isLoading, isError, error } = useInternalLeadById({ id: leadId });

	const { mutate: handleUpdateLeadMutation, isPending } = useMutation({
		mutationKey: ["update-internal-lead"],
		mutationFn: updateInternalLead,
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey });
			if (callbacks?.onMutate) callbacks.onMutate(variables);
			return;
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(data.message);
			closeModal();
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError();
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			await queryClient.invalidateQueries({ queryKey });
		},
	});

	useEffect(() => {
		if (lead) redefineState(mapApiLeadToState(lead));
	}, [lead, redefineState]);

	return (
		<ResponsiveMenu
			menuTitle="EDITAR LEAD"
			menuDescription="Preencha os campos abaixo para editar o lead"
			menuActionButtonText="ATUALIZAR LEAD"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleUpdateLeadMutation({ leadId, lead: state })}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeModal}
		>
			<LeadsOrganizationBlock lead={state} updateLead={updateLead} />
			<LeadsContactBlock lead={state} updateLead={updateLead} />
			<LeadsOpportunityBlock lead={state} updateLead={updateLead} />
		</ResponsiveMenu>
	);
}
