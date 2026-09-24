"use client";

import { Button } from "@/components/ui/button";
import {
	DropdownMenuGroup,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getErrorMessage } from "@/lib/errors";
import { PRIORITY_META, STATUS_META } from "./attendance-meta";
import { cn } from "@/lib/utils";
import { updateChatAssignment } from "@/lib/mutations/chats";
import { useChatTransferTargets, type TChatAttendance, type TChatMessagesPage } from "@/lib/queries/chats";
import type { TChatAssignmentPriority, TChatAssignmentStatus } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, ChevronDown, LogOut, Smartphone, Sparkles, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ChatAssignmentActionsProps = {
	chatId: string;
	atendimento: TChatAttendance;
	atendimentoIa: TChatMessagesPage["chat"]["atendimentoIa"];
	currentUserId: string;
	/**
	 * Header da thread: só posse e roteamento (assumir/liberar/transferir). Status e
	 * prioridade vivem no painel de contexto — são decisões, não reflexos, e no header
	 * competiriam com o nome do cliente por atenção. Quem é o responsável também sai daqui:
	 * a linha de metadados do header já diz, e o rótulo do botão pode ser só o verbo.
	 */
	compact?: boolean;
};

export function ChatAssignmentActions({ chatId, atendimento, atendimentoIa, currentUserId, compact = false }: ChatAssignmentActionsProps) {
	const queryClient = useQueryClient();
	const [transferMenuOpen, setTransferMenuOpen] = useState(false);
	const { data: transferTargets } = useChatTransferTargets({ enabled: transferMenuOpen });

	const isOwner = atendimento?.responsavelTipo === "USUARIO" && atendimento.responsavelUsuarioId === currentUserId;
	const isFree = !atendimento || atendimento.responsavelTipo === "NAO_ATRIBUIDO";

	// O telefone não é um destino: aquele estado só nasce do echo do WhatsApp Business, e a IA
	// não deve responder em paralelo com quem está no celular. Sai do telefone assumindo.
	const agentBlockedByPhone = atendimento?.responsavelTipo === "EXTERNO";
	const agentIsCurrent = atendimento?.responsavelTipo === "AGENTE";
	const agentReason = agentBlockedByPhone
		? "Assuma o atendimento do telefone antes de direcioná-lo ao agente"
		: (atendimentoIa.motivoIndisponivel ?? null);
	const canAssignToAgent = atendimentoIa.disponivel && !agentBlockedByPhone && !agentIsCurrent;

	const { mutate, isPending } = useMutation({
		mutationFn: updateChatAssignment,
		onSuccess: (data) => {
			toast.success(data.message);
			void queryClient.invalidateQueries({ queryKey: ["chat-messages", chatId] });
			void queryClient.invalidateQueries({ queryKey: ["chats"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	// O rótulo diz de quem se está assumindo: "assumir" de uma fila vazia e "tomar da IA"
	// são ações com consequências diferentes para quem clica. No header o verbo basta — o
	// responsável atual está escrito logo abaixo do nome — e o detalhe vai para o title.
	const assumeDetail = isFree
		? "ASSUMIR"
		: atendimento?.responsavelTipo === "AGENTE"
			? "ASSUMIR DA IA"
			: atendimento?.responsavelTipo === "EXTERNO"
				? "ASSUMIR DO TELEFONE"
				: "ASSUMIR";
	const assumeLabel = compact ? "ASSUMIR" : assumeDetail;
	// Uma única escala para tudo que divide a faixa do header: mesma altura, mesmo peso.
	const actionTypography = "text-[11px] font-extrabold uppercase tracking-[0.08em]";

	return (
		<div className={cn(compact ? "flex items-center gap-1.5" : "flex flex-col gap-2")}>
			{!isOwner && (
				<Button
					size="sm"
					className={cn("gap-1 text-[11px] font-extrabold uppercase tracking-[0.08em]", !compact && "col-span-2 w-full")}
					disabled={isPending}
					onClick={() => mutate({ acao: "assumir", chatId })}
				>
					<UserPlus className="h-3 w-3" />
					{assumeLabel}
				</Button>
			)}

			{isOwner && (
				<Button
					size="sm"
					variant="outline"
					className={cn("gap-1 text-[11px]", !compact && "col-span-2 w-full")}
					disabled={isPending}
					onClick={() => mutate({ acao: "liberar", chatId })}
				>
					<LogOut className="h-3 w-3" />
					LIBERAR
				</Button>
			)}

			<DropdownMenu open={transferMenuOpen} onOpenChange={setTransferMenuOpen}>
				<DropdownMenuTrigger
					render={
						<Button
							size="sm"
							variant="outline"
							className={cn("gap-1", actionTypography, !compact && "col-span-2 w-full")}
							disabled={isPending}
							aria-label="Transferir atendimento"
						>
							{compact && <ArrowRightLeft className="h-3 w-3 sm:hidden" />}
							{/* Abaixo de sm o header divide 360px com o nome do cliente: fica o ícone. */}
							<span className={cn(compact && "hidden sm:inline")}>TRANSFERIR</span>
							<ChevronDown className="h-3 w-3 opacity-60" />
						</Button>
					}
				/>
				<DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
					<DropdownMenuGroup>
						{/* O agente vem primeiro e é irmão das pessoas: transferir é escolher um
					    responsável, e a IA é um dos responsáveis possíveis. */}
						<DropdownMenuLabel className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Agente de IA</DropdownMenuLabel>
						<DropdownMenuItem
							className="gap-2"
							disabled={!canAssignToAgent}
							onClick={() => mutate({ acao: "transferir", chatId, destino: { tipo: "AGENTE" } })}
						>
							<Sparkles className="h-3.5 w-3.5 shrink-0" />
							<span className="flex min-w-0 flex-col">
								<span className="truncate">{atendimentoIa.agenteNome ?? "Agente de atendimento"}</span>
								{agentIsCurrent && <span className="text-[10px] text-muted-foreground">Já é o responsável</span>}
								{!agentIsCurrent && agentReason && <span className="text-[10px] text-muted-foreground">{agentReason}</span>}
							</span>
						</DropdownMenuItem>
					</DropdownMenuGroup>

					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuLabel className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Atendentes</DropdownMenuLabel>
						{(transferTargets ?? []).length === 0 && <DropdownMenuItem disabled>Nenhum usuário disponível</DropdownMenuItem>}
						{(transferTargets ?? []).map((target) => (
							<DropdownMenuItem
								key={target.id}
								onClick={() => mutate({ acao: "transferir", chatId, destino: { tipo: "USUARIO", usuarioDestinoId: target.id } })}
							>
								{target.nome}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{!compact && (
				<div className="col-span-2 mt-1 border-t border-border pt-3">
					<span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Detalhes do atendimento</span>
				</div>
			)}

			{!compact && (
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button size="sm" variant="outline" className="w-full justify-between gap-2 px-2.5 text-xs" disabled={isPending}>
								<span className="text-muted-foreground">Status</span>
								<span className="flex min-w-0 items-center gap-1.5">
									{atendimento && <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_META[atendimento.status].dot)} />}
									<span className="truncate">{atendimento ? STATUS_META[atendimento.status].label : "Definir"}</span>
									<ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
								</span>
							</Button>
						}
					/>
					<DropdownMenuContent align="end">
						<DropdownMenuGroup>
							{(Object.keys(STATUS_META) as TChatAssignmentStatus[]).map((status) => {
								const StatusIcon = STATUS_META[status].icon;
								return (
									<DropdownMenuItem key={status} className="gap-2" onClick={() => mutate({ acao: "alterar_status", chatId, status })}>
										<StatusIcon className={cn("h-3.5 w-3.5", STATUS_META[status].dot.replace("bg-", "text-"))} />
										{STATUS_META[status].label}
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			)}

			{!compact && (
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button size="sm" variant="outline" className="w-full justify-between gap-2 px-2.5 text-xs" disabled={isPending}>
								<span className="text-muted-foreground">Prioridade</span>
								<span className="flex min-w-0 items-center gap-1">
									<span className="truncate">{atendimento?.prioridade ? PRIORITY_META[atendimento.prioridade].label : "Nenhuma"}</span>
									<ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
								</span>
							</Button>
						}
					/>
					<DropdownMenuContent align="end">
						<DropdownMenuGroup>
							<DropdownMenuItem onClick={() => mutate({ acao: "alterar_prioridade", chatId, prioridade: null })}>Sem prioridade</DropdownMenuItem>
							{(Object.keys(PRIORITY_META) as TChatAssignmentPriority[]).map((prioridade) => (
								<DropdownMenuItem key={prioridade} onClick={() => mutate({ acao: "alterar_prioridade", chatId, prioridade })}>
									{PRIORITY_META[prioridade].label}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			)}

			{!compact && atendimento?.responsavelTipo === "AGENTE" && (
				<span
					className={cn("flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground", !compact && "col-span-2 w-fit")}
				>
					<Sparkles className="h-3 w-3" /> AUTOMAÇÃO
				</span>
			)}
			{!compact && atendimento?.responsavelTipo === "EXTERNO" && (
				<span
					className={cn("flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground", !compact && "col-span-2 w-fit")}
				>
					<Smartphone className="h-3 w-3" /> TELEFONE
				</span>
			)}
		</div>
	);
}
