"use client";

import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { PLATFORM_PARTNER_DEFAULT_SHARE_MESSAGE } from "@/lib/platform-partnerships/constants";
import { updatePlatformPartnerMe } from "@/lib/mutations/platform-partnerships";
import type { TUpdatePlatformPartnerMeInput } from "@/app/api/platform-partner/me/route";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

type ControlPlatformPartnerShareMessageProps = {
	mensagemDivulgacao: string | null;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdatePlatformPartnerMeInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/** Edita a mensagem do kit de divulgação. `{link}` marca onde o link de indicação entra. */
export function ControlPlatformPartnerShareMessage({ mensagemDivulgacao, closeModal, callbacks }: ControlPlatformPartnerShareMessageProps) {
	const [mensagem, setMensagem] = useState(mensagemDivulgacao ?? PLATFORM_PARTNER_DEFAULT_SHARE_MESSAGE);

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-platform-partner-share-message"],
		mutationFn: updatePlatformPartnerMe,
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

	const isDefault = mensagem.trim() === PLATFORM_PARTNER_DEFAULT_SHARE_MESSAGE;

	return (
		<ResponsiveMenu
			menuTitle="MENSAGEM DE DIVULGAÇÃO"
			menuDescription="Texto que vai no WhatsApp junto com o seu link."
			menuActionButtonText="SALVAR"
			menuCancelButtonText="CANCELAR"
			menuSecondaryActionButtonText={isDefault ? undefined : "USAR PADRÃO"}
			secondaryActionFunction={() => setMensagem(PLATFORM_PARTNER_DEFAULT_SHARE_MESSAGE)}
			menuActionButtonDisabled={mensagem.trim().length === 0}
			actionFunction={() => mutate({ mensagemDivulgacao: isDefault ? null : mensagem })}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			drawerVariant="md"
		>
			<TextareaInput label="MENSAGEM" placeholder="Escreva sua mensagem..." value={mensagem} handleChange={setMensagem} rows={6} maxLength={1000} />
			<p className="text-xs text-muted-foreground">
				Escreva <b className="font-bold text-foreground">{"{link}"}</b> onde o link deve aparecer. Sem ele, o link vai no final da mensagem.
			</p>
		</ResponsiveMenu>
	);
}
