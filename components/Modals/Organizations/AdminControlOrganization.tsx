"use client";

import AdminOrganizationPreferencesBlock from "@/components/Modals/Organizations/Blocks/Preferences";
import AdminOrganizationManagedServiceBlock from "@/components/Modals/Organizations/Blocks/ManagedService";
import AdminOrganizationPointOfInteractionBlock from "@/components/Modals/Organizations/Blocks/PointOfInteraction";
import AdminOrganizationResourcesBlock from "@/components/Modals/Organizations/Blocks/Resources";
import AdminOrganizationSummaryBlock from "@/components/Modals/Organizations/Blocks/Summary";
import AdminOrganizationTrialPeriodBlock from "@/components/Modals/Organizations/Blocks/TrialPeriod";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { updateOrganization as updateOrganizationMutation } from "@/lib/mutations/admin";
import { useOrganizationById } from "@/lib/queries/admin";
import { useOrganizationBaseState } from "@/state-hooks/use-organization-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

type AdminControlOrganizationProps = {
	organizationId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSettled?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
	};
};

export function AdminControlOrganization({ organizationId, closeModal, callbacks }: AdminControlOrganizationProps) {
	const queryClient = useQueryClient();
	const { data: organization, isLoading, isError, error } = useOrganizationById({ id: organizationId });

	const { state, updateOrganization, updateConfigurationResources, updateConfigurationPreferencias, redefineState } = useOrganizationBaseState();

	const { mutate: handleUpdateOrganizationMutation, isPending } = useMutation({
		mutationKey: ["update-organization", organizationId],
		mutationFn: updateOrganizationMutation,
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			void queryClient.invalidateQueries({ queryKey: ["admin-organization-by-id", organizationId] });
			void queryClient.invalidateQueries({ queryKey: ["admin-organizations"] });
			closeModal();
		},
		onError: (err) => {
			callbacks?.onError?.();
			toast.error(getErrorMessage(err));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	useEffect(() => {
		if (organization) {
			redefineState({ organization });
		}
	}, [organization, redefineState]);

	const stateError = isError ? getErrorMessage(error) : null;
	const hasErpAccess = state.organization.configuracao.recursos.erp.acesso;

	return (
		<ResponsiveMenu
			menuTitle="GERENCIAR ORGANIZAÇÃO"
			menuDescription="Revise os dados da organização e ajuste módulos, recursos e preferências da conta."
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleUpdateOrganizationMutation({ organizationId, organization: state.organization })}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={stateError}
			closeMenu={closeModal}
			dialogVariant="xl"
			drawerVariant="xl"
		>
			{organization && !isLoading && !stateError ? (
				<>
					<AdminOrganizationSummaryBlock organization={state.organization} />
					<AdminOrganizationTrialPeriodBlock
						organization={state.organization}
						updateOrganization={updateOrganization}
						stripeSubscriptionStatus={organization?.stripeSubscriptionStatus}
					/>
					<AdminOrganizationManagedServiceBlock organization={state.organization} updateOrganization={updateOrganization} />
					<AdminOrganizationPointOfInteractionBlock
						poiConfirmacaoValorObrigatoria={state.organization.poiConfirmacaoValorObrigatoria}
						updateOrganization={updateOrganization}
					/>
					<AdminOrganizationResourcesBlock recursos={state.organization.configuracao.recursos} updateResource={updateConfigurationResources} />
					<AdminOrganizationPreferencesBlock
						preferencias={state.organization.configuracao.preferencias}
						hasErpAccess={hasErpAccess}
						updatePreferencias={updateConfigurationPreferencias}
					/>
				</>
			) : null}
		</ResponsiveMenu>
	);
}
