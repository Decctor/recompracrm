"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenuGroup,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { stripCatalogMemory } from "@/lib/ai/agent/run-memory";
import { CHAT_BOARD_STATUSES, canCancelChatBoardAttendance, isValidChatBoardTransition } from "@/lib/chats/board";
import { getChatListMessagePreview } from "@/lib/chats/chat-list-preview";
import { getWhatsappWindowDisplay } from "@/lib/chats/whatsapp-window-status";
import type { TChatBoardCard } from "@/lib/queries/chats-board";
import { cn } from "@/lib/utils";
import { ChatAssignmentPriorityEnum, type TChatAssignmentPriority, type TChatAssignmentStatus } from "@/schemas/enums";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import {
	FileText,
	Flag,
	GripVertical,
	Image as ImageIcon,
	Loader2,
	MapPin,
	Mic,
	MoveRight,
	Smartphone,
	Sparkles,
	Sticker,
	Video,
	XCircle,
} from "lucide-react";
import { forwardRef, type CSSProperties } from "react";
import { CHAT_ASSIGNMENT_STATUS_LABEL, CHAT_PRIORITY_LABEL, CHAT_PRIORITY_PILL_CLASS, CHAT_WINDOW_DOT_CLASS } from "./config";

const MEDIA_ICONS = { IMAGEM: ImageIcon, VIDEO: Video, AUDIO: Mic, DOCUMENTO: FileText, FIGURINHA: Sticker, LOCALIZACAO: MapPin } as const;

function formatRelative(date: Date | string | null | undefined) {
	if (!date) return "";
	const value = new Date(date);
	const minutes = Math.floor((Date.now() - value.getTime()) / 60_000);
	if (minutes < 1) return "agora";
	if (minutes < 60) return `${minutes}min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d`;
	return value.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

type ChatsBoardCardProps = {
	card: TChatBoardCard;
	onOpen?: (chatId: string) => void;
	onMove?: (target: TChatAssignmentStatus) => void;
	onChangePriority?: (prioridade: TChatAssignmentPriority | null) => void;
	isPending?: boolean;
	isDragging?: boolean;
	isOverlay?: boolean;
	awaitingConfirm?: boolean;
	dragAttributes?: DraggableAttributes;
	dragListeners?: DraggableSyntheticListeners;
	style?: CSSProperties;
	className?: string;
};

/**
 * Card do quadro: um retrato do atendimento denso o bastante para varrer uma coluna
 * inteira sem abrir nada.
 *
 * O preview da última mensagem sai do mesmo `getChatListMessagePreview` da inbox — duas
 * telas mostrando a mesma conversa com resumos diferentes seria um jeito barato de perder
 * a confiança de quem atende.
 *
 * Sem `podeGerenciar`, o card não mostra alça de arraste nem menu: a regra de posse é a
 * mesma que `mayManageAssignment` aplica na rota, e oferecer um gesto que a API vai
 * recusar é pior do que não oferecer.
 */
export const ChatsBoardCard = forwardRef<HTMLDivElement, ChatsBoardCardProps>(function ChatsBoardCard(
	{ card, onOpen, onMove, onChangePriority, isPending, isDragging, isOverlay, awaitingConfirm, dragAttributes, dragListeners, style, className },
	ref,
) {
	const preview = getChatListMessagePreview(card.ultimaMensagem);
	const janela = getWhatsappWindowDisplay({ expiracao: card.whatsappJanelaDataExpiracao, tipoConexao: card.conexaoTipo });
	const MediaIcon = preview.contentType && preview.contentType !== "TEXTO" ? MEDIA_ICONS[preview.contentType] : null;
	const prioridadePillClass = card.prioridade ? CHAT_PRIORITY_PILL_CLASS[card.prioridade] : undefined;
	const naoLidas = card.mensagensNaoLidas ?? 0;

	const canDrag = card.podeGerenciar && !!onMove && !awaitingConfirm && !isPending;
	const moveTargets = onMove && card.podeGerenciar ? CHAT_BOARD_STATUSES.filter((target) => isValidChatBoardTransition(card.status, target)) : [];
	const canCancel = card.podeGerenciar && !!onMove && canCancelChatBoardAttendance(card.status);

	return (
		<div
			ref={ref}
			style={style}
			className={cn(
				"group/card relative flex flex-col gap-2 rounded-xl border border-border bg-card px-2.5 py-2 shadow-2xs",
				"transition-shadow hover:shadow-sm motion-reduce:transition-none",
				isOverlay && "rotate-2 cursor-grabbing shadow-md",
				isDragging && "opacity-40",
				isPending && "pointer-events-none opacity-60",
				awaitingConfirm && "ring-2 ring-foreground/20",
				className,
			)}
		>
			{isPending && (
				<div className="absolute right-2 top-2 z-10">
					<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
				</div>
			)}

			<div className="flex items-start gap-1.5">
				{canDrag ? (
					<button
						type="button"
						aria-label="Arrastar atendimento"
						className="mt-0.5 cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground focus-visible:outline-none active:cursor-grabbing"
						{...dragAttributes}
						{...dragListeners}
					>
						<GripVertical className="h-4 w-4" />
					</button>
				) : (
					<span className="mt-0.5 w-4" />
				)}

				<div className="relative shrink-0">
					<Avatar className="h-8 w-8">
						<AvatarFallback className="text-[10px]">{(card.cliente?.nome ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
					</Avatar>
					{/* O ponto sozinho seria informação só por cor (WCAG 1.4.1); o rótulo sr-only
					    entrega o mesmo dado a leitores de tela. Idêntico ao item da inbox. */}
					<span
						className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background", CHAT_WINDOW_DOT_CLASS[janela.variant])}
					/>
					<span className="sr-only">{janela.label}</span>
				</div>

				<button
					type="button"
					onClick={() => onOpen?.(card.chatId)}
					disabled={!onOpen}
					className="flex min-w-0 grow flex-col gap-0.5 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					<span className="truncate text-sm font-medium">{card.cliente?.nome ?? "Cliente sem nome"}</span>
					<span className={cn("flex min-w-0 items-center gap-1 text-xs", preview.isEmpty ? "italic text-muted-foreground" : "text-muted-foreground")}>
						{preview.isOutgoing && !preview.isEmpty && <span className="shrink-0 font-medium">Você:</span>}
						{MediaIcon && <MediaIcon className="h-3 w-3 shrink-0" />}
						<span className="truncate">{preview.body}</span>
					</span>
				</button>

				<div className="flex shrink-0 flex-col items-end gap-0.5">
					<span className="text-[11px] text-muted-foreground">{formatRelative(card.ultimaMensagemData)}</span>
					{(moveTargets.length > 0 || onChangePriority) && card.podeGerenciar && (
						<DropdownMenu>
							<DropdownMenuTrigger
								aria-label="Ações do atendimento"
								onPointerDown={(event) => event.stopPropagation()}
								className="rounded-md p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground focus-visible:outline-none"
							>
								<MoveRight className="h-3.5 w-3.5" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuGroup>
									{moveTargets.length > 0 && (
										<>
											<DropdownMenuLabel className="text-[11px]">Mover para</DropdownMenuLabel>
											<DropdownMenuSeparator />
											{moveTargets.map((target) => (
												<DropdownMenuItem key={target} onClick={() => onMove?.(target)}>
													{CHAT_ASSIGNMENT_STATUS_LABEL[target]}
												</DropdownMenuItem>
											))}
										</>
									)}
									{onChangePriority && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuLabel className="text-[11px]">Prioridade</DropdownMenuLabel>
											{ChatAssignmentPriorityEnum.options.map((prioridade) => (
												<DropdownMenuItem key={prioridade} onClick={() => onChangePriority(prioridade)} className="gap-2">
													<Flag className="h-3.5 w-3.5" />
													{CHAT_PRIORITY_LABEL[prioridade]}
												</DropdownMenuItem>
											))}
											{card.prioridade && (
												<DropdownMenuItem onClick={() => onChangePriority(null)} className="gap-2">
													<Flag className="h-3.5 w-3.5 opacity-40" />
													Sem prioridade
												</DropdownMenuItem>
											)}
										</>
									)}
									{canCancel && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuItem onClick={() => onMove?.("CANCELADO")} className="gap-2 text-destructive focus:text-destructive">
												<XCircle className="h-3.5 w-3.5" />
												Cancelar atendimento
											</DropdownMenuItem>
										</>
									)}
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</div>

			{card.resumo && (
				<p className="line-clamp-2 rounded-lg bg-muted/60 px-2 py-1 text-[11px] leading-snug text-muted-foreground">{stripCatalogMemory(card.resumo)}</p>
			)}

			<div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
				{card.responsavelTipo === "USUARIO" && (
					<span className="flex min-w-0 items-center gap-1">
						<Avatar className="h-3.5 w-3.5">
							{card.responsavelUsuario?.avatarUrl && <AvatarImage src={card.responsavelUsuario.avatarUrl} />}
							<AvatarFallback className="text-[9px]">{(card.responsavelUsuario?.nome ?? "?").slice(0, 1)}</AvatarFallback>
						</Avatar>
						<span className="truncate">{card.responsavelUsuario?.nome ?? "Atribuído"}</span>
					</span>
				)}
				{card.responsavelTipo === "AGENTE" && (
					<span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5">
						<Sparkles className="h-3 w-3" /> Automação
					</span>
				)}
				{card.responsavelTipo === "EXTERNO" && (
					<span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5">
						<Smartphone className="h-3 w-3" /> Telefone
					</span>
				)}
				{card.responsavelTipo === "NAO_ATRIBUIDO" && (
					<span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-bold text-primary">Livre</span>
				)}

				{card.prioridade && prioridadePillClass && (
					<span className={cn("rounded-full px-2 py-0.5 font-bold", prioridadePillClass)}>{CHAT_PRIORITY_LABEL[card.prioridade]}</span>
				)}

				{card.categoria && <span className="truncate rounded-full bg-muted px-2 py-0.5">{card.categoria}</span>}

				<span className="ml-auto flex items-center gap-1.5">
					{card.aguardandoResposta && <span className="font-bold text-destructive">Aguardando resposta</span>}
					{naoLidas > 0 && (
						<span className="rounded-full bg-primary px-1.5 py-0.5 font-bold text-primary-foreground">{naoLidas > 99 ? "99+" : naoLidas}</span>
					)}
				</span>
			</div>
		</div>
	);
});
