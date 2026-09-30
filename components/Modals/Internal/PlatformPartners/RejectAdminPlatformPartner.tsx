"use client";

import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import type { TUpdateAdminPlatformPartnerInput } from "@/app/api/admin/platform-partners/route";
import { getErrorMessage } from "@/lib/errors";
import { updateAdminPlatformPartner } from "@/lib/mutations/platform-partnerships";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

type RejectAdminPlatformPartnerProps = {
	partner: { id: string; nome: string };
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdateAdminPlatformPartnerInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

const SUGGESTIONS = [
	"O documento enviado está ilegível. Envie uma foto nítida ou o PDF.",
	"A chave PIX não está no CPF/CNPJ do cadastro.",
	"O nome no documento não confere com o cadastro.",
];

/** Rejeição com motivo: o parceiro lê este texto na tela de cadastro não aprovado e corrige. */
export function RejectAdminPlatformPartner({ partner, closeModal, callbacks }: RejectAdminPlatformPartnerProps) {
	const [motivo, setMotivo] = useState("");
	const { mutate, isPending } = useMutation({
		mutationKey: ["reject-admin-platform-partner", partner.id],
		mutationFn: updateAdminPlatformPartner,
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
			menuTitle="REJEITAR CADASTRO"
			menuDescription={`O motivo aparece para ${partner.nome} na tela do cadastro, com a opção de corrigir e reenviar.`}
			menuActionButtonText="REJEITAR"
			menuActionButtonVariant="destructive"
			menuCancelButtonText="CANCELAR"
			menuActionButtonDisabled={motivo.trim().length < 10}
			actionFunction={() => mutate({ partnerId: partner.id, partner: { status: "REJEITADO", motivoRejeicao: motivo.trim() } })}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<TextareaInput
				label="MOTIVO (VISÍVEL PARA O PARCEIRO)"
				placeholder="Explique o que precisa ser corrigido..."
				value={motivo}
				handleChange={setMotivo}
				rows={4}
				maxLength={1000}
			/>
			<div className="flex flex-wrap gap-2">
				{SUGGESTIONS.map((suggestion) => (
					<button
						key={suggestion}
						type="button"
						onClick={() => setMotivo(suggestion)}
						className="rounded-full border border-border px-3 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
					>
						{suggestion}
					</button>
				))}
			</div>
		</ResponsiveMenu>
	);
}
