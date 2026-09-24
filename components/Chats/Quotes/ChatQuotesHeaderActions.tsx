"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatToMoney } from "@/lib/formatting";
import { useClientOpenQuotes } from "@/lib/queries/sales";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";
import { ChatQuoteBuilder } from "./ChatQuoteBuilder";
import { ChatQuotesList } from "./ChatQuotesList";
import type { TQuotePermissions } from "./config";
import { buildQuoteMessage } from "./quote-message";

/**
 * Orçamentos no header do atendimento.
 *
 * O header é o único lugar sempre visível da thread, e um orçamento em aberto é pendência comercial:
 * quem entra na conversa precisa notar sem abrir aba nenhuma. A pill fica em azul suave (estrutural),
 * não em âmbar — o âmbar do sistema é reservado a cashback e fidelidade, e o header já o gasta na
 * janela do WhatsApp expirando.
 *
 * O detalhe abre em popover por clique e teclado; o hover só reforça com um resumo. Popover
 * dependente de hover não existe em toque e não é alcançável por teclado.
 */

type ChatQuotesHeaderActionsProps = {
	chatId: string;
	clientId: string | null;
	clientName: string;
	permissions: TQuotePermissions;
	/** Ausente quando a conversa não aceita mensagem agora (sem posse ou fora da janela de 24h). */
	onInsertInConversation?: (texto: string) => void;
};

export function ChatQuotesHeaderActions({ chatId, clientId, clientName, permissions, onInsertInConversation }: ChatQuotesHeaderActionsProps) {
	const [isBuilderOpen, setIsBuilderOpen] = useState(false);
	const { data } = useClientOpenQuotes({ clientId });

	// Sem cliente vinculado não há a quem orçar: o recurso inteiro sai do header em vez de aparecer
	// desabilitado sem explicação.
	if (!clientId) return null;

	const quotes = data?.orcamentos ?? [];
	// `total` conta todos os orçamentos em aberto; `orcamentos` traz só os mais recentes. Contar a
	// lista faria a pill discordar do valor somado logo ao lado.
	const total = data?.total ?? 0;
	const hasQuotes = total > 0;
	const summary = `${total} ${total === 1 ? "orçamento" : "orçamentos"} · ${formatToMoney(data?.valorTotalEmAberto ?? 0)}`;

	return (
		<>
			<div className="flex items-center gap-1">
				{/* Erro e carregamento não renderizam nada: a pill é informação ambiente e não pode
				    piscar um esqueleto a cada troca de conversa nem quebrar o atendimento. */}
				{hasQuotes && (
					<TooltipProvider delay={300}>
						<Tooltip>
							<Popover>
								<TooltipTrigger
									render={
										<PopoverTrigger
											render={
												<button
													type="button"
													aria-label={`${summary} em aberto. Ver detalhes.`}
													className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95"
												>
													<FileText className="size-3 shrink-0" />
													<span className="tabular-nums">{total}</span>
													<span className="hidden sm:inline">
														{total === 1 ? "orçamento" : "orçamentos"} · {formatToMoney(data?.valorTotalEmAberto ?? 0)}
													</span>
												</button>
											}
										/>
									}
								/>

								<TooltipContent side="bottom">{summary}</TooltipContent>

								<PopoverContent align="end" className="w-[min(22rem,92vw)] p-3">
									<div className="mb-2 flex items-baseline justify-between gap-2">
										<h3 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Orçamentos em aberto</h3>
										<span className="text-xs font-bold tabular-nums">{formatToMoney(data?.valorTotalEmAberto ?? 0)}</span>
									</div>

									<div className="max-h-[min(24rem,60vh)] overflow-y-auto">
										<ChatQuotesList
											clientId={clientId}
											quotes={quotes}
											permissions={permissions}
											onInsertInConversation={onInsertInConversation ? (quote) => onInsertInConversation(buildQuoteMessage(quote)) : undefined}
										/>
									</div>

									{permissions.criar && (
										<Button variant="ghost" size="sm" className="mt-2 w-full text-xs" onClick={() => setIsBuilderOpen(true)}>
											<Plus className="size-3.5" />
											NOVO ORÇAMENTO
										</Button>
									)}
								</PopoverContent>
							</Popover>
						</Tooltip>
					</TooltipProvider>
				)}

				{permissions.criar && (
					<TooltipProvider delay={300}>
						<Tooltip>
							<TooltipTrigger
								render={
									<Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Novo orçamento" onClick={() => setIsBuilderOpen(true)}>
										<Plus className="size-4" />
									</Button>
								}
							/>
							<TooltipContent side="bottom">Novo orçamento</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
			</div>

			{permissions.criar && (
				<ChatQuoteBuilder
					open={isBuilderOpen}
					onOpenChange={setIsBuilderOpen}
					clientId={clientId}
					chatId={chatId}
					clientName={clientName}
					onInsertInConversation={onInsertInConversation ? (quote) => onInsertInConversation(buildQuoteMessage(quote)) : undefined}
				/>
			)}
		</>
	);
}
