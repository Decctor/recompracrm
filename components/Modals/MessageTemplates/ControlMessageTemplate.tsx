"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { useCommunicationPermissions } from "@/components/MessageTemplates/communication-permissions";
import { MessageTemplateComposer } from "@/components/MessageTemplates";
import { getErrorMessage } from "@/lib/errors";
import { updateMessageTemplate } from "@/lib/mutations/message-templates";
import { useMessageTemplateById } from "@/lib/queries/message-templates";
import { useMessageTemplateState } from "@/state-hooks/use-message-template-state";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { validateMessageTemplateForm } from "./NewMessageTemplate";

type ControlMessageTemplateProps = {
	messageTemplateId: string;
	closeModal: () => void;
	organizationId: string;
	organizationName: string;
	organizationLogoUrl: string | null;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

function ControlMessageTemplate({
	messageTemplateId,
	closeModal,
	organizationId,
	organizationName,
	organizationLogoUrl,
	callbacks,
}: ControlMessageTemplateProps) {
	const { data: messageTemplate, isLoading, isError, error } = useMessageTemplateById({ id: messageTemplateId });
	// Sem comunicacao.publicar o template é salvo sem ir para a Meta: a API recusaria o envio.
	const { publicar: canPublish } = useCommunicationPermissions();
	const messageTemplateState = useMessageTemplateState({ organizationName });
	const { state, resetState, redefineState, unknownVariables } = messageTemplateState;

	const { mutate: handleUpdateMessageTemplate, isPending } = useMutation({
		mutationKey: ["update-message-template", messageTemplateId],
		mutationFn: updateMessageTemplate,
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate();
			return;
		},
		onSuccess: async (response) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(response.message);
			resetState();
			closeModal();
		},
		onError: (error) => {
			if (callbacks?.onError) callbacks.onError();
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			return;
		},
	});

	function handleSubmit() {
		if (!validateMessageTemplateForm({ messageTemplate: state.messageTemplate, unknownVariables })) return;

		handleUpdateMessageTemplate({
			messageTemplateId,
			messageTemplate: state.messageTemplate,
			submitWhatsapp: canPublish,
		});
	}

	useEffect(() => {
		if (!messageTemplate) return;
		redefineState({ messageTemplate });
	}, [messageTemplate, redefineState]);

	return (
		<ResponsiveMenu
			menuTitle="EDITAR TEMPLATE"
			menuDescription="Atualize o conteúdo usado no WhatsApp e no e-mail."
			menuActionButtonText="ATUALIZAR TEMPLATE"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="xl"
			drawerVariant="xl"
			lockClose={isPending}
		>
			<MessageTemplateComposer
				messageTemplateState={messageTemplateState}
				organizationId={organizationId}
				organizationName={organizationName}
				organizationLogoUrl={organizationLogoUrl}
				className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(520px,1.5fr)_minmax(340px,1fr)]"
			/>
		</ResponsiveMenu>
	);
}

export default ControlMessageTemplate;
