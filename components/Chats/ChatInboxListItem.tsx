"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { chipVariants } from "@/components/ui/chip";
import { getChatListMessagePreview } from "@/lib/chats/chat-list-preview";
import { getWhatsappWindowDisplay } from "@/lib/chats/whatsapp-window-status";
import type { TChatInboxItem } from "@/lib/queries/chats";
import { cn } from "@/lib/utils";
import { CalendarClock, FileText, Image as ImageIcon, MapPin, Mic, Smartphone, Sparkles, Sticker, UserRound, Video } from "lucide-react";
import { formatFollowUpMoment } from "./FollowUpNotice";
import { PRIORITY_META, STATUS_META } from "./attendance-meta";
import { TypingIndicator } from "./TypingIndicator";

type ChatInboxListItemProps = {
	chat: TChatInboxItem;
	isSelected: boolean;
	/** Só faz sentido mostrar o número quando a lista mistura vários. */
	showPhoneBadge: boolean;
	onSelect: (chatId: string) => void;
};

const MEDIA_ICONS = { IMAGEM: ImageIcon, VIDEO: Video, AUDIO: Mic, DOCUMENTO: FileText, FIGURINHA: Sticker, LOCALIZACAO: MapPin } as const;

/**
 * Só os estados acionáveis recebem cor. Numa inbox com dezenas de conversas, colorir
 * também o estado saudável faz quatro sinais competirem e nenhum se destacar — "janela
 * aberta" e "sessão do gateway" são o normal, e normal não pede atenção.
 */
const WINDOW_DOT_CLASS = {
	aberta: "bg-muted-foreground/40",
	gateway: "bg-muted-foreground/40",
	expirando: "bg-brand",
	expirada: "bg-destructive",
} as const;

function formatRelative(date: Date | string | null) {
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

function getInitials(name: string) {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((word) => word[0]?.toUpperCase() ?? "")
		.join("");
}

/**
 * Quem responde por esta conversa, em uma linha com avatar. É a informação que o atendente
 * procura ao varrer a lista — por isso ocupa uma linha própria em vez de disputar espaço com
 * status e prioridade.
 */
function ResponsibleLine({ atendimento, aiRunAtiva }: { atendimento: TChatInboxItem["atendimentoAtivo"]; aiRunAtiva: boolean }) {
	const avatarClass = "flex size-5 shrink-0 items-center justify-center rounded-full";

	if (atendimento?.responsavelTipo === "USUARIO") {
		const nome = atendimento.responsavelUsuario?.nome ?? "Atribuído";
		return (
			<span className="flex min-w-0 items-center gap-1.5">
				<Avatar size="sm" className="size-5">
					{atendimento.responsavelUsuario?.avatarUrl ? <AvatarImage src={atendimento.responsavelUsuario.avatarUrl} alt={nome} /> : null}
					<AvatarFallback className="text-[9px] font-semibold">{getInitials(nome)}</AvatarFallback>
				</Avatar>
				<span className="truncate text-xs text-muted-foreground">{nome}</span>
			</span>
		);
	}
	if (atendimento?.responsavelTipo === "AGENTE") {
		return (
			<span className="flex min-w-0 items-center gap-1.5">
				<span className={cn(avatarClass, "bg-primary/10 text-primary")}>
					<Sparkles className="h-3 w-3" aria-hidden />
				</span>
				<span className="truncate text-xs font-medium text-foreground">Automação</span>
				{/* Run em curso: a IA está escrevendo agora. Quem varre a lista sabe que não precisa entrar. */}
				{aiRunAtiva && (
					<span className="flex items-center gap-1 text-[11px] text-primary">
						<TypingIndicator />
						<span className="sr-only">respondendo</span>
					</span>
				)}
			</span>
		);
	}
	if (atendimento?.responsavelTipo === "EXTERNO") {
		return (
			<span className="flex min-w-0 items-center gap-1.5">
				<span className={cn(avatarClass, "bg-muted text-muted-foreground")}>
					<Smartphone className="h-3 w-3" aria-hidden />
				</span>
				<span className="truncate text-xs text-muted-foreground">Telefone</span>
			</span>
		);
	}
	// "Livre" é disponibilidade, não alerta. O âmbar já significa "janela expirando";
	// duplicar a cor apagaria os dois sentidos.
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			<span className={cn(avatarClass, "border border-dashed border-muted-foreground/40 text-muted-foreground")}>
				<UserRound className="h-3 w-3 opacity-60" aria-hidden />
			</span>
			<span className="truncate text-xs italic text-muted-foreground/80">Sem responsável</span>
		</span>
	);
}

export function ChatInboxListItem({ chat, isSelected, showPhoneBadge, onSelect }: ChatInboxListItemProps) {
	const preview = getChatListMessagePreview(chat.ultimaMensagem);
	const janela = getWhatsappWindowDisplay({ expiracao: chat.whatsappJanelaDataExpiracao, tipoConexao: chat.conexaoTipo });
	const MediaIcon = preview.contentType && preview.contentType !== "TEXTO" ? MEDIA_ICONS[preview.contentType] : null;
	const atendimento = chat.atendimentoAtivo;
	const naoLidas = chat.mensagensNaoLidas ?? 0;
	const numeroConexao = chat.conexaoTelefone?.numero || chat.conexaoTelefone?.nome;
	// Só as prioridades que pedem ação aparecem na lista; baixa/média seriam ruído em toda linha.
	const prioridade = atendimento?.prioridade === "ALTA" || atendimento?.prioridade === "URGENTE" ? atendimento.prioridade : null;
	const PriorityIcon = prioridade ? PRIORITY_META[prioridade].icon : null;

	return (
		<button
			type="button"
			onClick={() => onSelect(chat.id)}
			aria-current={isSelected ? "true" : undefined}
			className={cn(
				"relative flex w-full flex-col gap-1 border-b border-border/60 px-4 py-2.5 text-left transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
				isSelected ? "bg-muted/70" : "hover:bg-muted/40",
			)}
		>
			{isSelected ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden /> : null}

			<div className="flex items-center gap-2">
				<span className={cn("min-w-0 flex-1 truncate text-sm", naoLidas > 0 ? "font-semibold text-foreground" : "font-medium text-foreground")}>
					{chat.cliente?.nome ?? "Cliente sem nome"}
				</span>
				<span className="flex shrink-0 items-center gap-1.5">
					{/* Cor sozinha não passa em 1.4.1, então o rótulo da janela vai em sr-only. */}
					<span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", WINDOW_DOT_CLASS[janela.variant])} />
					<span className="sr-only">{janela.label}</span>
					<span className={cn("text-[11px] tabular-nums", naoLidas > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
						{formatRelative(chat.ultimaMensagemData)}
					</span>
				</span>
			</div>

			<div className="flex items-center gap-2">
				<span
					className={cn(
						"flex min-w-0 flex-1 items-center gap-1 truncate text-xs",
						preview.isEmpty ? "italic text-muted-foreground/70" : naoLidas > 0 ? "text-foreground/80" : "text-muted-foreground",
					)}
				>
					{preview.isOutgoing && !preview.isEmpty && <span className="shrink-0 font-medium text-muted-foreground">Você:</span>}
					{MediaIcon && <MediaIcon className="h-3 w-3 shrink-0" />}
					<span className="truncate">{preview.body}</span>
				</span>
				{naoLidas > 0 && (
					<span className="flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold tabular-nums text-primary-foreground">
						{naoLidas > 99 ? "99+" : naoLidas}
					</span>
				)}
			</div>

			<div className="flex min-w-0 items-center gap-2 pt-0.5">
				<ResponsibleLine atendimento={atendimento} aiRunAtiva={!!chat.aiRunAtiva} />
				<span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
					{prioridade && (
						<span className={cn(chipVariants({ variant: "outline", size: "xs", shape: "pill" }), "py-0.5 font-bold", PRIORITY_META[prioridade].pill)}>
							{PriorityIcon ? <PriorityIcon className="h-3 w-3" /> : null}
							{PRIORITY_META[prioridade].label}
						</span>
					)}
					{/* Retomada agendada pela IA: a conversa não morreu, só está esperando o cliente. */}
					{chat.retomadaAgendadaPara && (
						<span className="flex items-center gap-1 text-primary" title="Retomada agendada pela IA">
							<CalendarClock className="h-3 w-3" aria-hidden />
							{formatFollowUpMoment(chat.retomadaAgendadaPara)}
						</span>
					)}
					{/* Estado do atendimento: mesmo vocabulário do select, para a cor significar
					    a mesma coisa nas duas superfícies. */}
					{atendimento && (
						<span className="flex items-center gap-1">
							<span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_META[atendimento.status].dot)} />
							{STATUS_META[atendimento.status].label}
						</span>
					)}
					{showPhoneBadge && numeroConexao && (
						<span className="max-w-24 truncate rounded-full border border-border px-1.5 py-0.5 font-medium">{numeroConexao}</span>
					)}
				</span>
			</div>
		</button>
	);
}
