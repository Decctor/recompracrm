"use client";

import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import type { TResolveAdminPlatformPartnerChangeRequestInput } from "@/app/api/admin/platform-partners/change-requests/route";
import { getErrorMessage } from "@/lib/errors";
import { resolveAdminPlatformPartnerChangeRequest } from "@/lib/mutations/platform-partnerships";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

type RefuseAdminPlatformPartnerChangeRequestProps = {
	partner: { id: string; nome: string };
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TResolveAdminPlatformPartnerChangeRequestInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/** Recusa o pedido de alteração de dados; o motivo aparece em "Meus dados" e no email. */
export function RefuseAdminPlatformPartnerChangeRequest({ partner, closeModal, callbacks }: RefuseAdminPlatformPartnerChangeRequestProps) {
	const [motivo, setMotivo] = useState("");
	const { mutate, isPending } = useMutation({
		mutationKey: ["refuse-admin-platform-partner-change-request", partner.id],
		mutationFn: resolveAdminPlatformPartnerChangeRequest,
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
			menuTitle="RECUSAR ALTERAÇÃO DE DADOS"
			menuDescription={`O motivo aparece para ${partner.nome} em "Meus dados" e no email.`}
			menuActionButtonText="RECUSAR"
			menuActionButtonVariant="destructive"
			menuCancelButtonText="CANCELAR"
			menuActionButtonDisabled={motivo.trim().length < 10}
			actionFunction={() => mutate({ partnerId: partner.id, aprovar: false, motivoRecusa: motivo.trim() })}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<TextareaInput
				label="MOTIVO (VISÍVEL PARA O PARCEIRO)"
				placeholder="Ex.: a nova chave PIX não está no CPF do cadastro."
				value={motivo}
				handleChange={setMotivo}
				rows={4}
				maxLength={1000}
			/>
		</ResponsiveMenu>
	);
}
