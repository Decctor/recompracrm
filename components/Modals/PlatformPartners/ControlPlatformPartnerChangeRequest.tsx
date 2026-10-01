"use client";

import type { TCreatePlatformPartnerChangeRequestInput } from "@/app/api/platform-partner/change-requests/route";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Checkbox } from "@/components/ui/checkbox";
import { getErrorMessage } from "@/lib/errors";
import { formatToPhone } from "@/lib/formatting";
import { createPlatformPartnerChangeRequest, createPlatformPartnerDocument } from "@/lib/mutations/platform-partnerships";
import { PLATFORM_PARTNER_DOCUMENT_CONTENT_TYPES, PLATFORM_PARTNER_DOCUMENT_MAX_BYTES } from "@/lib/platform-partnerships/documents";
import { detectPixKeyType } from "@/lib/platform-partnerships/earnings";
import type { TPlatformPartnerPixKeyTypeEnum } from "@/schemas/enums";
import { useMutation } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PIX_KEY_TYPES: { value: TPlatformPartnerPixKeyTypeEnum; label: string }[] = [
	{ value: "CPF", label: "CPF" },
	{ value: "CNPJ", label: "CNPJ" },
	{ value: "EMAIL", label: "Email" },
	{ value: "TELEFONE", label: "Telefone" },
	{ value: "ALEATORIA", label: "Aleatória" },
];

type ControlPlatformPartnerChangeRequestProps = {
	partner: { email: string; telefone: string; chavePix: string; tipoPessoa: "PESSOA_FISICA" | "PESSOA_JURIDICA" | null };
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TCreatePlatformPartnerChangeRequestInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/**
 * Pedido de alteração de dados. Só vai o que mudou; o financeiro aprova antes de valer. Campos em
 * branco mantêm o valor atual.
 */
export function ControlPlatformPartnerChangeRequest({ partner, closeModal, callbacks }: ControlPlatformPartnerChangeRequestProps) {
	const pessoaJuridica = partner.tipoPessoa === "PESSOA_JURIDICA";
	const [email, setEmail] = useState(partner.email);
	const [telefone, setTelefone] = useState(partner.telefone);
	const [chavePix, setChavePix] = useState("");
	const [chavePixTipo, setChavePixTipo] = useState<TPlatformPartnerPixKeyTypeEnum>(pessoaJuridica ? "CNPJ" : "CPF");
	const [titularConfirmado, setTitularConfirmado] = useState(false);
	const [documento, setDocumento] = useState<{ caminho: string; nome: string } | null>(null);
	const [motivo, setMotivo] = useState("");

	const uploadMutation = useMutation({
		mutationKey: ["create-platform-partner-change-document"],
		mutationFn: createPlatformPartnerDocument,
		onSuccess: (data) => setDocumento({ caminho: data.data.caminho, nome: data.data.nomeArquivo }),
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-platform-partner-change-request"],
		mutationFn: createPlatformPartnerChangeRequest,
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

	const newPix = chavePix.trim();
	const changed = email.trim() !== partner.email || telefone.trim() !== partner.telefone || (newPix && newPix !== partner.chavePix) || !!documento;
	const ready = changed && (!newPix || titularConfirmado) && !uploadMutation.isPending;

	return (
		<ResponsiveMenu
			menuTitle="SOLICITAR ALTERAÇÃO DE DADOS"
			menuDescription="O financeiro confere e aprova antes de valer. Você recebe um email com a decisão."
			menuActionButtonText="ENVIAR PEDIDO"
			menuCancelButtonText="CANCELAR"
			menuActionButtonDisabled={!ready}
			actionFunction={() =>
				mutate({
					email: email.trim() !== partner.email ? email.trim() : null,
					telefone: telefone.trim() !== partner.telefone ? telefone.trim() : null,
					chavePix: newPix || null,
					chavePixTipo: newPix ? chavePixTipo : null,
					titularPixConfirmado: newPix ? titularConfirmado : null,
					documento: documento?.caminho ?? null,
					motivo: motivo.trim() || null,
				})
			}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			drawerVariant="lg"
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<TextInput label="EMAIL" placeholder="seu@email.com" value={email} handleChange={setEmail} />
				<TextInput
					label="TELEFONE"
					placeholder="(00) 00000-0000"
					inputType="tel"
					value={telefone}
					handleChange={(value) => setTelefone(formatToPhone(value))}
				/>
			</div>

			<div className="flex flex-col gap-2 rounded-lg border border-border p-3">
				<div className="flex items-end gap-2">
					<div className="flex-1">
						<TextInput
							label="NOVA CHAVE PIX (OPCIONAL)"
							placeholder="Deixe em branco para manter a atual"
							value={chavePix}
							handleChange={(value) => {
								setChavePix(value);
								setTitularConfirmado(false);
								const detected = detectPixKeyType(value);
								if (detected) setChavePixTipo(detected);
							}}
						/>
					</div>
					<select
						aria-label="Tipo da nova chave PIX"
						value={chavePixTipo}
						onChange={(event) => setChavePixTipo(event.target.value as TPlatformPartnerPixKeyTypeEnum)}
						className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
					>
						{PIX_KEY_TYPES.map((type) => (
							<option key={type.value} value={type.value}>
								{type.label}
							</option>
						))}
					</select>
				</div>
				{newPix ? (
					<label className="flex items-start gap-2 text-sm text-muted-foreground">
						<Checkbox checked={titularConfirmado} onCheckedChange={(checked) => setTitularConfirmado(checked === true)} className="mt-0.5" />
						Confirmo que a nova chave está no meu {pessoaJuridica ? "CNPJ" : "CPF"}.
					</label>
				) : null}
			</div>

			<label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border p-3 text-sm transition-colors hover:bg-muted/50">
				{uploadMutation.isPending ? (
					<Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
				) : (
					<FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
				)}
				<span className="flex-1">
					{documento ? documento.nome : pessoaJuridica ? "Novo cartão CNPJ ou contrato social (opcional)" : "Novo documento com CPF (opcional)"}
				</span>
				<input
					type="file"
					accept={Object.keys(PLATFORM_PARTNER_DOCUMENT_CONTENT_TYPES).join(",")}
					className="hidden"
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						if (!file) return;
						if (!PLATFORM_PARTNER_DOCUMENT_CONTENT_TYPES[file.type]) return void toast.error("Envie o documento em PDF ou foto.");
						if (file.size > PLATFORM_PARTNER_DOCUMENT_MAX_BYTES) return void toast.error("O documento pode ter até 10 MB.");
						uploadMutation.mutate({ tipo: pessoaJuridica ? "cnpj" : "cpf", file });
					}}
				/>
			</label>

			<TextareaInput label="MOTIVO (OPCIONAL)" placeholder="Ex.: troquei de banco." value={motivo} handleChange={setMotivo} rows={2} maxLength={500} />
			<p className="text-xs text-muted-foreground">Nome e {pessoaJuridica ? "CNPJ" : "CPF"} não mudam por aqui. Para isso, fale com o financeiro.</p>
		</ResponsiveMenu>
	);
}
