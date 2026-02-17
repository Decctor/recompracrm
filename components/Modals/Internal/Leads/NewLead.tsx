"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createInternalLead } from "@/lib/mutations/crm";
import type { TInternalLead } from "@/schemas/internal-leads";
import { useInternalLeadState } from "@/state-hooks/use-internal-lead-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import LeadsContactBlock from "./Blocks/Contact";
import LeadsOpportunityBlock from "./Blocks/Opportunity";
import LeadsOrganizationBlock from "./Blocks/Organization";

type NewLeadProps = {
	closeMenu: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

export default function NewLead({ closeMenu, callbacks }: NewLeadProps) {
	const { state, updateLead } = useInternalLeadState();

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-internal-lead"],
		mutationFn: createInternalLead,
		onMutate: () => {
			if (callbacks?.onMutate) callbacks.onMutate();
		},
		onSuccess: (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(data.message);
			return closeMenu();
		},
		onError: (error) => {
			if (callbacks?.onError) callbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			if (callbacks?.onSettled) callbacks.onSettled();
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVO LEAD"
			menuDescription="Preencha os campos para criar um novo lead no pipeline"
			menuActionButtonText="CRIAR LEAD"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate({ lead: state })}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
			dialogVariant="md"
		>
			<LeadsOrganizationBlock lead={state} updateLead={updateLead} />
			<LeadsContactBlock lead={state} updateLead={updateLead} />
			<LeadsOpportunityBlock lead={state} updateLead={updateLead} />
		</ResponsiveMenu>
	);
}
