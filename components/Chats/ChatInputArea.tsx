"use client";

import { Button } from "@/components/ui/button";
import { DropdownMenuGroup, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { TQuotedMessageSnapshot } from "@/lib/chats/quoted-message";
import { getWhatsappWindowDisplay } from "@/lib/chats/whatsapp-window-status";
import { cn } from "@/lib/utils";
import { Loader2, Lock, Paperclip, Send, Sparkles, UserPlus, X } from "lucide-react";
import { ChatVoiceRecorder } from "./ChatVoiceRecorder";
import { QuotedMessagePreview } from "./QuotedMessagePreview";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

export type TOutgoingAttachment = { tipo: "IMAGEM" | "VIDEO" | "AUDIO" | "DOCUMENTO"; base64: string; mimeType: string; arquivoNome: string };

/**
 * Comando imperativo para escrever no compositor de fora — hoje o orçamento inserido na conversa.
 *
 * Imperativo em vez de prop controlada de propósito: o rascunho continua sendo estado local do
 * compositor. Espelhá-lo para cima só para permitir uma inserção ocasional duplicaria a fonte da
 * verdade do texto que o atendente está digitando.
 */
export type TChatInputAreaHandle = {
	appendText: (texto: string) => void;
	/** Substitui o rascunho: é o que a sugestão da IA faz — o atendente pediu um texto novo. */
	replaceText: (texto: string) => void;
	getText: () => string;
};

export type TChatAssistAction = "SUGERIR_RESPOSTA" | "RESUMIR" | "REESCREVER";

/** Mensagem escolhida com "Responder": vai no envio como citação e aparece na bolha otimista. */
export type TChatReplyTarget = {
	messageId: string;
	quote: TQuotedMessageSnapshot;
};

type ChatInputAreaProps = {
	userName: string;
	organizationId: string;
	isOwner: boolean;
	janelaExpiracao: Date | string | null;
	conexaoTipo: "META_CLOUD_API" | "INTERNAL_GATEWAY" | null;
	isSending: boolean;
	onSend: (input: { texto: string; assinaturaAtiva: boolean; midia: TOutgoingAttachment | null; replyToMessageId: string | null }) => void;
	/** Nome do cliente, para rotular a citação de uma mensagem dele no painel de resposta. */
	clientName?: string;
	replyTarget?: TChatReplyTarget | null;
	onCancelReply?: () => void;
	onAssume: () => void;
	templates: { id: string; nome: string }[];
	onSendTemplate: (messageTemplateId: string) => void;
	/**
	 * Modo assistência. Ausente quando a organização não tem IA. `SUGERIR_RESPOSTA` usa o rascunho
	 * atual como orientação ("diz que o frete é grátis") e o substitui pela sugestão.
	 */
	assist?: { onRequest: (input: { acao: TChatAssistAction; texto: string }) => void; pendingAction: TChatAssistAction | null };
};

function resolveMediaType(mimeType: string): TOutgoingAttachment["tipo"] {
	if (mimeType.startsWith("image/")) return "IMAGEM";
	if (mimeType.startsWith("video/")) return "VIDEO";
	if (mimeType.startsWith("audio/")) return "AUDIO";
	return "DOCUMENTO";
}

export const ChatInputArea = forwardRef<TChatInputAreaHandle, ChatInputAreaProps>(function ChatInputArea(
	{
		userName,
		organizationId,
		isOwner,
		janelaExpiracao,
		conexaoTipo,
		isSending,
		onSend,
		onAssume,
		templates,
		onSendTemplate,
		assist,
		clientName = "Cliente",
		replyTarget = null,
		onCancelReply,
	},
	ref,
) {
	const [texto, setTexto] = useState("");
	const [attachment, setAttachment] = useState<TOutgoingAttachment | null>(null);
	const [assinaturaAtiva, setAssinaturaAtiva] = useState(false);
	const [isRecordingVoice, setIsRecordingVoice] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const signatureSwitchId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const signatureStorageKey = `chat-signature-${organizationId}`;

	useEffect(() => {
		setAssinaturaAtiva(window.localStorage.getItem(signatureStorageKey) === "true");
	}, [signatureStorageKey]);

	// Auto-resize: a textarea cresce com o conteúdo até 4 linhas.
	const resizeTextarea = useCallback(() => {
		const element = textareaRef.current;
		if (!element) return;
		element.style.height = "auto";
		element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
	}, []);

	useEffect(() => {
		resizeTextarea();
	}, [resizeTextarea]);

	const focusEnd = useCallback(() => {
		// O foco vai para o fim do texto, pronto para revisar e enviar.
		requestAnimationFrame(() => {
			const element = textareaRef.current;
			if (!element) return;
			element.focus();
			element.setSelectionRange(element.value.length, element.value.length);
			resizeTextarea();
		});
	}, [resizeTextarea]);

	useImperativeHandle(
		ref,
		() => ({
			appendText: (novoTexto: string) => {
				// Anexa em vez de sobrescrever: o atendente pode já ter escrito uma introdução.
				setTexto((current) => (current.trim() ? `${current.trimEnd()}\n\n${novoTexto}` : novoTexto));
				focusEnd();
			},
			replaceText: (novoTexto: string) => {
				setTexto(novoTexto);
				focusEnd();
			},
			getText: () => textareaRef.current?.value ?? "",
		}),
		[focusEnd],
	);

	// Escolher "Responder" leva o foco ao compositor, como no WhatsApp.
	useEffect(() => {
		if (replyTarget) focusEnd();
	}, [replyTarget, focusEnd]);

	const janela = getWhatsappWindowDisplay({ expiracao: janelaExpiracao, tipoConexao: conexaoTipo });

	function handleSignatureChange(checked: boolean) {
		setAssinaturaAtiva(checked);
		window.localStorage.setItem(signatureStorageKey, String(checked));
	}

	async function toBase64(blob: Blob) {
		const bytes = new Uint8Array(await blob.arrayBuffer());
		// Em blocos: String.fromCharCode(...array) estoura a pilha em arquivos grandes.
		let binary = "";
		for (let offset = 0; offset < bytes.length; offset += 8192) {
			binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
		}
		return btoa(binary);
	}

	async function handleFileSelected(file: File) {
		setAttachment({
			tipo: resolveMediaType(file.type),
			base64: await toBase64(file),
			mimeType: file.type || "application/octet-stream",
			arquivoNome: file.name,
		});
	}

	async function handleVoiceRecorded({ blob, mimeType }: { blob: Blob; mimeType: string; durationSeconds: number }) {
		setAttachment({ tipo: "AUDIO", base64: await toBase64(blob), mimeType, arquivoNome: `audio-${Date.now()}.ogg` });
	}

	function handleSubmit() {
		if (isSending) return;
		if (!texto.trim() && !attachment) return;
		onSend({ texto: texto.trim(), assinaturaAtiva, midia: attachment, replyToMessageId: replyTarget?.messageId ?? null });
		setTexto("");
		setAttachment(null);
		// A citação some do compositor já no envio: a bolha otimista a carrega dali em diante.
		onCancelReply?.();
	}

	// Sem posse, o envio seria recusado com 403 pela rota. Bloquear aqui transforma um
	// erro em uma ação: o CTA leva direto ao "assumir".
	if (!isOwner) {
		return (
			<div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-3">
				<p className="text-xs text-muted-foreground">Assuma este atendimento para enviar mensagens.</p>
				<Button size="sm" className="shrink-0 gap-1 text-[11px] font-extrabold uppercase tracking-[0.08em]" onClick={onAssume}>
					<UserPlus className="h-3 w-3" />
					ASSUMIR
				</Button>
			</div>
		);
	}

	if (!janela.canSendFreeform) {
		return (
			<div className="flex flex-col gap-2 border-t border-border bg-muted/40 px-4 py-3">
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<Lock className="h-3.5 w-3.5" />
					{janela.label}. Só um template aprovado pode reabrir a conversa — a janela volta a abrir quando o cliente responder.
				</p>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button size="sm" variant="outline" className="self-start text-[11px] font-extrabold uppercase tracking-[0.08em]" disabled={isSending}>
								ENVIAR TEMPLATE
							</Button>
						}
					/>
					<DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
						<DropdownMenuGroup>
							{templates.length === 0 && <DropdownMenuItem disabled>Nenhum template aprovado para este número</DropdownMenuItem>}
							{templates.map((template) => (
								<DropdownMenuItem key={template.id} onClick={() => onSendTemplate(template.id)}>
									{template.nome}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 border-t border-border bg-background px-3 py-2">
			{replyTarget && (
				<div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 py-1 pr-1 pl-1.5">
					<QuotedMessagePreview quote={replyTarget.quote} clientName={clientName} className="min-w-0 flex-1 bg-transparent" />
					<Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="Cancelar resposta" onClick={onCancelReply}>
						<X className="h-3 w-3" />
					</Button>
				</div>
			)}
			{attachment && (
				<div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1.5 text-xs">
					<span className="truncate">{attachment.arquivoNome}</span>
					<Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Remover anexo" onClick={() => setAttachment(null)}>
						<X className="h-3 w-3" />
					</Button>
				</div>
			)}

			<div className="flex items-end gap-2">
				<input
					ref={fileInputRef}
					type="file"
					className="hidden"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) void handleFileSelected(file);
						event.target.value = "";
					}}
				/>
				{!isRecordingVoice && (
					<Button
						variant="ghost"
						size="icon"
						className="shrink-0"
						aria-label="Anexar arquivo"
						onClick={() => fileInputRef.current?.click()}
						disabled={isSending}
					>
						<Paperclip className="h-4 w-4" />
					</Button>
				)}

				<ChatVoiceRecorder disabled={isSending} onRecorded={(input) => void handleVoiceRecorded(input)} onActiveChange={setIsRecordingVoice} />

				{/* Assistência: a IA rascunha, o atendente envia. O rascunho atual vira orientação da
				    sugestão ("diz que o frete é grátis") — é o jeito natural de pedir algo específico. */}
				{assist && !isRecordingVoice && (
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="icon"
									className="shrink-0 text-primary"
									aria-label="Pedir ajuda à IA"
									title="Pedir ajuda à IA"
									disabled={isSending || assist.pendingAction !== null}
								>
									{assist.pendingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
								</Button>
							}
						/>
						<DropdownMenuContent align="start">
							<DropdownMenuGroup>
								<DropdownMenuItem onClick={() => assist.onRequest({ acao: "SUGERIR_RESPOSTA", texto: texto.trim() })}>
									<Sparkles className="h-4 w-4" />
									{texto.trim() ? "Sugerir resposta com esta orientação" : "Sugerir resposta"}
								</DropdownMenuItem>
								<DropdownMenuItem disabled={!texto.trim()} onClick={() => assist.onRequest({ acao: "REESCREVER", texto: texto.trim() })}>
									Reescrever rascunho
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => assist.onRequest({ acao: "RESUMIR", texto: "" })}>Resumir atendimento</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				)}

				{!isRecordingVoice && (
					<Textarea
						ref={textareaRef}
						value={texto}
						onChange={(event) => {
							setTexto(event.target.value);
							event.target.style.height = "auto";
							event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
						}}
						onKeyDown={(event) => {
							// Enter envia, Shift+Enter quebra linha — convenção de chat, não de formulário.
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								handleSubmit();
							}
							if (event.key === "Escape" && replyTarget) {
								event.preventDefault();
								onCancelReply?.();
							}
						}}
						aria-label="Mensagem"
						placeholder="Digite uma mensagem..."
						rows={1}
						className="min-h-9 resize-none py-2 text-sm"
						disabled={isSending}
					/>
				)}

				{!isRecordingVoice && (
					<Button
						size="icon"
						className="shrink-0"
						aria-label="Enviar mensagem"
						onClick={handleSubmit}
						disabled={isSending || (!texto.trim() && !attachment)}
					>
						<Send className="h-4 w-4" />
					</Button>
				)}
			</div>

			<div className={cn("flex items-center gap-2 self-start", isSending && "opacity-60")}>
				<Switch id={signatureSwitchId} checked={assinaturaAtiva} onCheckedChange={handleSignatureChange} disabled={isSending} />
				<label htmlFor={signatureSwitchId} className="cursor-pointer text-[11px] text-muted-foreground">
					Assinar como {userName}
				</label>
			</div>
		</div>
	);
});
