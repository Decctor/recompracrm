"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FORWARD_MAX_TARGETS } from "@/lib/chats/forward-message";
import { buildQuotedMessageSnapshot } from "@/lib/chats/quoted-message";
import { getErrorMessage } from "@/lib/errors";
import { forwardChatMessage } from "@/lib/mutations/chats";
import { getChatMessagesQueryKey, type TChatForwardTarget, type TChatThreadMessage, useChatForwardTargets } from "@/lib/queries/chats";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { QuotedMessagePreview } from "./QuotedMessagePreview";

type ForwardMessageDialogProps = {
	/** Mensagem a encaminhar. */
	message: TChatThreadMessage;
	/** Conversa de origem: fica fora da lista e define o número dos destinos. */
	sourceChatId: string;
	/** Nome do cliente da conversa de origem, para rotular a prévia de uma mensagem dele. */
	clientName: string;
	closeModal: () => void;
	/** Presente = o toast de sucesso para um destino oferece "Abrir" a conversa. */
	onOpenChat?: (chatId: string) => void;
};

type TTargetResult = { ok: boolean; erro?: string };

/** Por que um destino não aceita a mensagem agora; `null` = selecionável. */
function resolveBlockReason(target: TChatForwardTarget) {
	if (target.atendimento.estado === "OUTRO") return `Com ${target.atendimento.responsavelNome ?? "outro atendente"}`;
	if (!target.janelaAberta) return "Janela de 24h fechada";
	return null;
}

function TargetStatus({ target }: { target: TChatForwardTarget }) {
	const blockReason = resolveBlockReason(target);
	if (blockReason) return <span className="shrink-0 text-xs text-muted-foreground">{blockReason}</span>;
	if (target.atendimento.estado === "MINHA") return <span className="shrink-0 text-xs font-medium text-foreground">Minha</span>;
	return <span className="shrink-0 text-xs text-muted-foreground">Livre</span>;
}

/**
 * Encaminha uma mensagem para até cinco conversas do mesmo número.
 *
 * A lista mostra também as conversas que não aceitam a mensagem agora (com colega, com a IA, janela
 * de 24h fechada), desabilitadas e com o motivo: sumir com elas faria o atendente procurar um
 * contato que está ali. Conversas livres são assumidas no envio, e o botão diz isso.
 */
export function ForwardMessageDialog({ message, sourceChatId, clientName, closeModal, onOpenChat }: ForwardMessageDialogProps) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	// Guarda o destino inteiro, não só o id: a seleção sobrevive a uma busca que o tire da lista.
	const [selected, setSelected] = useState<Map<string, TChatForwardTarget>>(() => new Map());
	const [results, setResults] = useState<Record<string, TTargetResult>>({});

	const quote = useMemo(() => buildQuotedMessageSnapshot(message), [message]);
	const { data: targets, isPending, isError, error, isFetching } = useChatForwardTargets({ sourceChatId, search });

	const selectedTargets = [...selected.values()];
	const limitReached = selected.size >= FORWARD_MAX_TARGETS;
	const willAssume = selectedTargets.some((target) => target.atendimento.estado === "LIVRE");

	const toggle = (target: TChatForwardTarget, checked: boolean) => {
		setSelected((current) => {
			const next = new Map(current);
			if (checked) next.set(target.chatId, target);
			else next.delete(target.chatId);
			return next;
		});
	};

	const { mutate, isPending: isForwarding } = useMutation({
		mutationKey: ["forward-chat-message"],
		mutationFn: forwardChatMessage,
		onSuccess: (data) => {
			const resultados = data.data.resultados;
			const delivered = resultados.filter((result) => result.ok);

			if (delivered.length > 0) {
				void queryClient.invalidateQueries({ queryKey: ["chats"] });
				void queryClient.invalidateQueries({ queryKey: ["chat-inbox-counts"] });
				for (const result of delivered) void queryClient.invalidateQueries({ queryKey: getChatMessagesQueryKey(result.chatId) });
			}
			// Destinos assumidos mudaram de estado; a lista precisa refletir isso numa nova tentativa.
			void queryClient.invalidateQueries({ queryKey: ["chat-forward-targets", sourceChatId] });

			if (delivered.length === resultados.length) {
				const [only] = delivered;
				toast.success(data.message, {
					action: resultados.length === 1 && only && onOpenChat ? { label: "Abrir", onClick: () => onOpenChat(only.chatId) } : undefined,
				});
				closeModal();
				return;
			}

			// Parcial ou nenhum: o diálogo fica aberto com o resultado por linha. Os entregues saem
			// da seleção; os que falharam continuam marcados para uma nova tentativa.
			setResults((current) => {
				const next = { ...current };
				for (const result of resultados) next[result.chatId] = { ok: result.ok, erro: result.erro };
				return next;
			});
			setSelected((current) => {
				const next = new Map(current);
				for (const result of delivered) next.delete(result.chatId);
				return next;
			});
			if (delivered.length === 0) toast.error(data.message);
			else toast.warning(data.message);
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	const submit = () => {
		if (selected.size === 0 || isForwarding) return;
		mutate({ sourceMessageId: message.id, targets: [...selected.keys()].map((chatId) => ({ chatId })) });
	};

	return (
		<Dialog open onOpenChange={(open) => !open && !isForwarding && closeModal()}>
			<DialogContent className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-4 sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Encaminhar mensagem</DialogTitle>
				</DialogHeader>

				<QuotedMessagePreview quote={quote} clientName={clientName} />

				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						// Enter na busca não envia: o envio é sempre um gesto explícito no botão.
						onKeyDown={(event) => {
							if (event.key === "Enter") event.preventDefault();
						}}
						placeholder="Buscar conversa por nome ou telefone"
						aria-label="Buscar conversa por nome ou telefone"
						className="pl-9"
					/>
					{isFetching && !isPending && (
						<Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
					)}
				</div>

				<div className="-mx-2 min-h-32 flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-foreground/15">
					{isPending ? (
						<div className="flex h-32 items-center justify-center text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
						</div>
					) : isError ? (
						<p className="px-2 py-6 text-center text-sm text-destructive">{getErrorMessage(error)}</p>
					) : !targets?.length ? (
						<p className="px-2 py-6 text-center text-sm text-muted-foreground">
							{search.trim().length >= 2 ? "Nenhuma conversa encontrada." : "Nenhuma outra conversa neste número."}
						</p>
					) : (
						<ul className="flex flex-col">
							{targets.map((target) => {
								const isSelected = selected.has(target.chatId);
								const result = results[target.chatId];
								const delivered = result?.ok === true;
								const blockReason = resolveBlockReason(target);
								const disabled = isForwarding || delivered || (!isSelected && (!!blockReason || limitReached));
								const inputId = `forward-target-${target.chatId}`;

								return (
									<li key={target.chatId}>
										<label
											htmlFor={inputId}
											className={cn(
												"flex items-center gap-3 rounded-xl px-2 py-2 transition-colors",
												disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-muted/60",
												// O motivo segue legível; só o contato perde peso.
												blockReason && !delivered && "text-muted-foreground",
											)}
										>
											{delivered ? (
												<span className="flex size-4 shrink-0 items-center justify-center text-success" aria-label="Encaminhada">
													<Check className="h-4 w-4" />
												</span>
											) : (
												<Checkbox id={inputId} checked={isSelected} disabled={disabled} onCheckedChange={(checked) => toggle(target, checked === true)} />
											)}
											<span className="flex min-w-0 flex-1 flex-col">
												<span className="truncate text-sm font-medium">{target.clienteNome}</span>
												<span className="truncate text-xs text-muted-foreground text-numeric">{target.clienteTelefone}</span>
												{result && !result.ok && result.erro && <span className="text-xs text-destructive">{result.erro}</span>}
											</span>
											{delivered ? <span className="shrink-0 text-xs text-success">Encaminhada</span> : <TargetStatus target={target} />}
										</label>
									</li>
								);
							})}
						</ul>
					)}
				</div>

				{limitReached && <p className="-mt-2 text-xs text-muted-foreground">Até {FORWARD_MAX_TARGETS} conversas por vez</p>}

				<DialogFooter className="items-center sm:justify-between">
					<span className="text-xs text-muted-foreground">
						<span className="text-numeric">{selected.size}</span> {selected.size === 1 ? "selecionada" : "selecionadas"}
					</span>
					<div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
						<Button type="button" variant="ghost" onClick={closeModal} disabled={isForwarding}>
							Cancelar
						</Button>
						<Button type="button" onClick={submit} disabled={selected.size === 0 || isForwarding}>
							{isForwarding && <Loader2 className="h-4 w-4 animate-spin" />}
							{willAssume ? "Encaminhar e assumir" : "Encaminhar"}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
