"use client";
import { ResponsiveMenuAnimatedBody } from "@/components/Utils/ResponsiveMenuAnimatedBody";
import { LoadingButton } from "@/components/loading-button";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";

import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";
import { createActionApproval, decideActionApproval, decideActionApprovalWithPin } from "@/lib/mutations/action-approvals";
import { useActionApprovalById } from "@/lib/queries/action-approvals";
import type { TActionApprovalPayload } from "@/schemas/action-approvals";
import { useMutation } from "@tanstack/react-query";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { KeyRound, RefreshCcw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const OPERATOR_PASSWORD_LENGTH = 5;

/** Aprovações pedidas no balcão (PDV, checkout, edição, fechamento de conta). */
type TCheckoutApprovalPayload = Extract<TActionApprovalPayload, { tipo: "VENDA_DESCONTO" | "VENDA_FIADO" }>;

export type ActionApprovalPromptProps = {
	payload: TCheckoutApprovalPayload;
	title: string;
	description: string;
	/** Resumo do que está sendo aprovado, acima do fluxo de senha/espera. */
	details: React.ReactNode;
	/** Quem pode aprovar, abaixo do rótulo da senha. */
	pinHint: string;
	/** Texto da UI de espera da solicitação remota. */
	remoteWaitingHint: string;
	/** Toast quando a solicitação remota é aprovada. */
	remoteApprovedMessage: string;
	/** `id` do campo de senha (para o `htmlFor` do rótulo). */
	pinInputId: string;
	closeModal: () => void;
	// Chamado com o ID da aprovação válida — o chamador finaliza a venda com ele.
	onApproved: (approvalRequestId: string) => void;
};

/**
 * Mecânica comum das aprovações de balcão, em dois modos:
 * - SENHA (default): um gestor presente digita a senha de operador (5 dígitos) do seu vendedor
 *   vinculado e a aprovação sai na hora (registrada como SENHA_OPERADOR);
 * - REMOTA: cria uma solicitação PENDENTE na fila de aprovações e a modal vira uma UI de espera,
 *   com a opção de cancelar a solicitação ou voltar ao fluxo de senha (a solicitação remota segue
 *   pendente nesse caso — a primeira aprovação que chegar vale).
 *
 * O tipo da solicitação vem do próprio payload; cada cenário (desconto, fiado) só define textos e
 * o resumo exibido.
 */
export function ActionApprovalPrompt({
	payload,
	title,
	description,
	details,
	pinHint,
	remoteWaitingHint,
	remoteApprovedMessage,
	pinInputId,
	closeModal,
	onApproved,
}: ActionApprovalPromptProps) {
	const [mode, setMode] = useState<"SENHA" | "REMOTA">("SENHA");
	const [senhaOperador, setSenhaOperador] = useState("");
	const [remoteRequestId, setRemoteRequestId] = useState<string | null>(null);
	const approvedHandledRef = useRef(false);

	const { mutate: approveWithPin, isPending: isApprovingWithPin } = useMutation({
		mutationKey: ["decide-action-approval-with-pin"],
		mutationFn: decideActionApprovalWithPin,
		onSuccess: (data) => {
			// A aprovação por senha resolveu: a solicitação remota pendente (se houver) vira ruído na fila.
			if (remoteRequestId) decideActionApproval({ id: remoteRequestId, decisao: "CANCELAR" }).catch(() => null);
			approvedHandledRef.current = true;
			toast.success(data.message);
			onApproved(data.data.request.id);
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	const { mutate: requestRemoteApproval, isPending: isRequestingRemote } = useMutation({
		mutationKey: ["create-action-approval"],
		mutationFn: createActionApproval,
		onSuccess: (data) => {
			toast.success("Solicitação enviada. Aguardando aprovação de um gestor.");
			setRemoteRequestId(data.data.request.id);
			setMode("REMOTA");
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	const { mutate: cancelRemoteRequest, isPending: isCancelling } = useMutation({
		mutationKey: ["cancel-action-approval"],
		mutationFn: (requestId: string) => decideActionApproval({ id: requestId, decisao: "CANCELAR" }),
		onSettled: () => {
			setRemoteRequestId(null);
			closeModal();
		},
	});

	// Acompanha a solicitação remota por polling curto (a decisão pode vir de outro dispositivo),
	// em qualquer modo — quem voltar ao fluxo de senha ainda é destravado por uma aprovação remota.
	const { data: remoteRequest } = useActionApprovalById({ requestId: remoteRequestId, refetchInterval: 4000 });
	useEffect(() => {
		if (!remoteRequest || approvedHandledRef.current) return;
		if (remoteRequest.status === "APROVADA") {
			approvedHandledRef.current = true;
			toast.success(remoteApprovedMessage);
			onApproved(remoteRequest.id);
			return;
		}
		if (remoteRequest.status === "REJEITADA") {
			toast.error(remoteRequest.motivoDecisao ? `Solicitação rejeitada: ${remoteRequest.motivoDecisao}` : "Solicitação rejeitada pelo gestor.");
			setRemoteRequestId(null);
			setMode("SENHA");
			return;
		}
		if (remoteRequest.status === "EXPIRADA") {
			toast.error("A solicitação expirou. Envie uma nova solicitação.");
			setRemoteRequestId(null);
			setMode("SENHA");
		}
	}, [remoteRequest, onApproved, remoteApprovedMessage]);

	const handlePinApproval = () => {
		if (senhaOperador.length !== OPERATOR_PASSWORD_LENGTH) {
			toast.error("Informe os 5 dígitos da senha de operador do gestor aprovador.");
			return;
		}
		approveWithPin({ tipo: payload.tipo, payload, senhaOperador });
	};

	const handleRequestRemote = () => {
		// Já existe uma solicitação pendente: só volta para a UI de espera, sem duplicar na fila.
		if (remoteRequestId) {
			setMode("REMOTA");
			return;
		}
		requestRemoteApproval({ tipo: payload.tipo, payload });
	};

	const isWaitingRemote = mode === "REMOTA";

	return (
		<ResponsiveMenu.Root
			open
			onOpenChange={(open) => {
				if (!open) closeModal();
			}}
		>
			<ResponsiveMenu.Content dialogClassName="min-w-0 overflow-x-hidden sm:max-w-lg" drawerClassName={"max-h-[70dvh]" + " " + "overflow-x-hidden"}>
				<ResponsiveMenu.Header>
					<ResponsiveMenu.Title>{title}</ResponsiveMenu.Title>
					<ResponsiveMenu.Description>{description}</ResponsiveMenu.Description>
				</ResponsiveMenu.Header>
				<ResponsiveMenuAnimatedBody stateKey="content" className="overflow-x-hidden overflow-y-auto">
					<div className="flex w-full min-w-0 flex-col gap-4 overflow-x-hidden py-2">
						{details}

						{isWaitingRemote ? (
							<div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-8 text-center">
								<RefreshCcw className="h-8 w-8 animate-spin text-brand" />
								<div className="flex flex-col gap-1">
									<p className="text-sm font-bold">Aguardando aprovação de um gestor...</p>
									<p className="text-[0.7rem] text-muted-foreground">{remoteWaitingHint}</p>
								</div>
								<div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
									<Button
										type="button"
										variant="outline"
										disabled={isCancelling}
										onClick={() => (remoteRequestId ? cancelRemoteRequest(remoteRequestId) : closeModal())}
									>
										{isCancelling ? "CANCELANDO..." : "CANCELAR"}
									</Button>
									<Button type="button" onClick={() => setMode("SENHA")}>
										<KeyRound className="mr-1.5 h-4 w-4" />
										APROVAR POR SENHA
									</Button>
								</div>
							</div>
						) : (
							<div className="flex w-full min-w-0 flex-col gap-3 overflow-x-hidden">
								<Label htmlFor={pinInputId} className="text-sm font-medium tracking-tight text-foreground/80">
									SENHA DO GESTOR APROVADOR (5 DÍGITOS)<span className="text-red-500">*</span>
								</Label>
								<p className="text-[0.7rem] text-muted-foreground">{pinHint}</p>
								<InputOTP
									id={pinInputId}
									maxLength={OPERATOR_PASSWORD_LENGTH}
									pattern={REGEXP_ONLY_DIGITS}
									inputMode="numeric"
									autoComplete="off"
									pushPasswordManagerStrategy="none"
									value={senhaOperador}
									onChange={(value) => setSenhaOperador(value)}
									containerClassName="mx-auto w-full max-w-full justify-center"
								>
									<InputOTPGroup>
										<InputOTPSlot index={0} />
										<InputOTPSlot index={1} />
										<InputOTPSlot index={2} />
										<InputOTPSlot index={3} />
										<InputOTPSlot index={4} />
									</InputOTPGroup>
								</InputOTP>
								{remoteRequestId ? (
									<p className="flex items-center justify-center gap-1.5 text-center text-[0.7rem] text-muted-foreground">
										<Send className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />A solicitação remota segue pendente — a primeira aprovação que chegar libera a venda.
									</p>
								) : null}
							</div>
						)}
					</div>
				</ResponsiveMenuAnimatedBody>
				{!isWaitingRemote ? (
					<ResponsiveMenu.Footer>
						<ResponsiveMenu.Close variant="outline">CANCELAR</ResponsiveMenu.Close>
						<LoadingButton loading={isApprovingWithPin || isRequestingRemote} onClick={handleRequestRemote}>
							{remoteRequestId ? "VER SOLICITAÇÃO REMOTA" : "SOLICITAR APROVAÇÃO REMOTA"}
						</LoadingButton>
						<LoadingButton loading={isApprovingWithPin || isRequestingRemote} onClick={handlePinApproval}>
							APROVAR COM SENHA
						</LoadingButton>
					</ResponsiveMenu.Footer>
				) : null}
			</ResponsiveMenu.Content>
		</ResponsiveMenu.Root>
	);
}
