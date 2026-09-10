import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { createPlaygroundChat, sendPlaygroundMessage } from "@/lib/mutations/ai-agents";
import { AI_AGENT_PLAYGROUND_QUERY_KEY, usePlaygroundState } from "@/lib/queries/ai-agents";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Paperclip, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import AgentRunDrawer from "./AgentRunDrawer";

/**
 * Conversa de teste com o agente.
 *
 * Roda o mesmo pipeline de produção — mesmo runtime, mesmas ferramentas, mesmo registro de
 * execução — com um cliente fictício e sem enviar nada para fora. Cada resposta gera uma
 * execução inspecionável, que é como se descobre por que o agente respondeu daquele jeito.
 */
export default function AgentPlayground() {
	const queryClient = useQueryClient();
	const [text, setText] = useState("");
	const [openRunId, setOpenRunId] = useState<string | null>(null);
	const conversationEndRef = useRef<HTMLDivElement>(null);

	const { data, isLoading } = usePlaygroundState();
	const chatId = data?.chatId ?? null;
	const messages = data?.estado?.mensagens ?? [];

	useEffect(() => {
		conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	const { mutate: createChat, isPending: isCreatingChat } = useMutation({
		mutationKey: ["create-playground-chat"],
		mutationFn: createPlaygroundChat,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: AI_AGENT_PLAYGROUND_QUERY_KEY }),
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const { mutate: sendMessage, isPending: isSending } = useMutation({
		mutationKey: ["send-playground-message"],
		mutationFn: sendPlaygroundMessage,
		onMutate: () => setText(""),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: AI_AGENT_PLAYGROUND_QUERY_KEY }),
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function handleSend() {
		const content = text.trim();
		if (!content || !chatId || isSending) return;
		sendMessage({ chatId, texto: content });
	}

	if (isLoading) return <LoadingComponent />;

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<p className="text-xs text-muted-foreground">
					Converse como se fosse um cliente. O agente usa as configurações salvas — salve antes de testar uma alteração. Nada é enviado por WhatsApp e esta
					conversa não aparece no hub de atendimentos.
				</p>
				<Button variant="outline" size="sm" className="flex shrink-0 items-center gap-2" disabled={isCreatingChat} onClick={() => createChat()}>
					<MessageSquarePlus className="h-4 w-4" />
					NOVA CONVERSA
				</Button>
			</div>

			{!chatId ? (
				<div className="flex w-full flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-10 text-center">
					<p className="text-sm font-medium">Nenhuma conversa de teste iniciada</p>
					<p className="text-xs text-muted-foreground">Comece uma conversa para ver como o agente responde antes de liberá-lo aos clientes.</p>
					<Button size="sm" disabled={isCreatingChat} onClick={() => createChat()}>
						{isCreatingChat ? "CRIANDO..." : "INICIAR CONVERSA"}
					</Button>
				</div>
			) : (
				<>
					<div className="flex max-h-[28rem] w-full flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-muted/30 px-4 py-4">
						{messages.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Envie a primeira mensagem para começar.</p> : null}

						{messages.map((message) => {
							const fromClient = message.autorTipo === "CLIENTE";
							const runId = message.metadados?.aiAgente?.runId ?? null;
							return (
								<div key={message.id} className={cn("flex w-full", fromClient ? "justify-end" : "justify-start")}>
									<div className={cn("flex max-w-[80%] flex-col gap-1", fromClient ? "items-end" : "items-start")}>
										<div
											className={cn(
												"rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
												fromClient ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border border-border bg-card",
											)}
										>
											{message.conteudoMidiaUrl ? (
												<a
													href={message.conteudoMidiaUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="mb-1 flex items-center gap-1.5 text-xs font-medium underline-offset-2 hover:underline"
												>
													<Paperclip className="h-3.5 w-3.5 shrink-0" />
													<span className="truncate">{message.conteudoMidiaArquivoNome || "arquivo anexado"}</span>
												</a>
											) : null}
											{message.conteudoTexto}
										</div>
										{runId ? (
											<button type="button" onClick={() => setOpenRunId(runId)} className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">
												ver o que o agente consultou
											</button>
										) : null}
									</div>
								</div>
							);
						})}

						{isSending || data?.estado?.execucaoAtiva ? (
							<div className="flex w-full justify-start">
								<div className="rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2 text-sm text-muted-foreground">digitando...</div>
							</div>
						) : null}

						<div ref={conversationEndRef} />
					</div>

					<div className="flex w-full items-center gap-2">
						<Input
							value={text}
							onChange={(event) => setText(event.target.value)}
							onKeyDown={(event) => {
								if (event.key !== "Enter" || event.shiftKey) return;
								event.preventDefault();
								handleSend();
							}}
							placeholder="Escreva como um cliente escreveria..."
							disabled={isSending}
						/>
						<Button size="icon" disabled={isSending || !text.trim()} onClick={handleSend} aria-label="Enviar mensagem">
							<Send className="h-4 w-4" />
						</Button>
					</div>
				</>
			)}

			{openRunId ? <AgentRunDrawer runId={openRunId} closeModal={() => setOpenRunId(null)} /> : null}
		</div>
	);
}
