"use client";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { TChatThreadMessage } from "@/lib/queries/chats";
import { cn } from "@/lib/utils";
import type { TChatMessageMetadata } from "@/schemas/chats";
import { AlertCircle, Check, CheckCheck, ChevronDown, Clock, MapPin, RotateCw, Smartphone, Sparkles } from "lucide-react";
import { ChatMediaAttachment } from "./ChatMediaAttachment";
import { WhatsAppMessageText } from "./WhatsAppMessageText";

/** Mensagem otimista: existe no cliente antes de a rota confirmar a persistência. */
export type TOptimisticFields = { optimistic?: boolean };

type ChatMessageBubbleProps = {
	message: TChatThreadMessage & TOptimisticFields;
	/** Primeira bolha de uma sequência do mesmo autor — só ela mostra o cabeçalho. */
	showAuthor: boolean;
	onRetry?: (messageId: string) => void;
	isRetrying?: boolean;
	/** Mensagem do agente: abre a execução que a produziu (`metadados.aiAgente.runId`). */
	onOpenAiRun?: (runId: string) => void;
};

function formatTime(date: Date | string) {
	return new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const DELIVERY_LABELS: Record<TChatThreadMessage["statusEntrega"], string> = {
	PENDENTE: "Enviando",
	ENVIADA: "Enviada",
	ENTREGUE: "Entregue",
	LIDA: "Lida",
	FALHA: "Falha no envio",
	CANCELADA: "Cancelada",
};

/**
 * Um check = enviada, dois = entregue, dois em destaque = lida.
 *
 * "Lida" se distingue por opacidade plena, não por matiz: a bolha de saída já é o azul
 * da marca, então um tick azul sobre ela seria invisível. O rótulo textual acompanha —
 * ticks são informação por forma e cor, que sozinha não passa em 1.4.1.
 */
function DeliveryTicks({ status }: { status: TChatThreadMessage["statusEntrega"] }) {
	const icon =
		status === "PENDENTE" ? (
			<Clock className="h-3 w-3 opacity-70" />
		) : status === "FALHA" ? (
			<AlertCircle className="h-3 w-3" />
		) : status === "ENVIADA" ? (
			<Check className="h-3 w-3 opacity-70" />
		) : status === "ENTREGUE" ? (
			<CheckCheck className="h-3 w-3 opacity-70" />
		) : status === "LIDA" ? (
			<CheckCheck className="h-3 w-3 opacity-100" />
		) : null;

	if (!icon) return null;
	return (
		<span className="inline-flex items-center">
			{icon}
			<span className="sr-only">{DELIVERY_LABELS[status]}</span>
		</span>
	);
}

/**
 * Cartão de localização compartilhada: link para o próprio local (negócios) ou um pin no
 * mapa pelas coordenadas. Não há arquivo a baixar, então não passa pelo ChatMediaAttachment.
 */
function LocationCard({ location }: { location: NonNullable<TChatMessageMetadata["whatsappLocation"]> }) {
	const title = location.name?.trim() || "Localização compartilhada";
	const description = location.address?.trim() || `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
	const href = location.url?.trim() || `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;

	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={`Abrir ${title} no mapa`}
			className="mb-1 flex items-center gap-2.5 rounded-lg bg-current/10 p-2.5 transition-colors hover:bg-current/15 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-current/30"
		>
			<MapPin className="h-5 w-5 shrink-0 opacity-70" />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-xs font-semibold">{title}</span>
				<span className="truncate text-[11px] opacity-70">{description}</span>
			</span>
		</a>
	);
}

function resolveAuthorLabel(message: TChatThreadMessage) {
	if (message.autorTipo === "CLIENTE") return message.autorCliente?.nome ?? "Cliente";
	if (message.autorTipo === "AI") return message.metadados?.aiAgente?.retomadaId ? "Assistente IA · retomada" : "Assistente IA";
	if (message.autorTipo === "BUSINESS-APP") return "Telefone";
	return message.autorUsuario?.nome ?? "Você";
}

export function ChatMessageBubble({ message, showAuthor, onRetry, isRetrying, onOpenAiRun }: ChatMessageBubbleProps) {
	const isIncoming = message.autorTipo === "CLIENTE";
	const isFailed = message.statusEntrega === "FALHA";
	const isAutomated = message.autorTipo === "AI" || message.autorTipo === "BUSINESS-APP" || message.whatsappEcho;
	const hasMedia = message.conteudoMidiaTipo !== "TEXTO";
	// Figurinha se desenha sem bolha, como no WhatsApp: fundo transparente, tamanho próprio,
	// sem a coluna estável de mídia. A "análise da IA" também some — o texto processado de
	// figurinha é fixo, não uma leitura.
	const isSticker = message.conteudoMidiaTipo === "FIGURINHA";
	// Bolha de saída (azul) e de falha (vermelha) são superfícies coloridas: links, code
	// e fundos de anexo precisam derivar da cor do texto em vez de usar tokens fixos.
	const onColoredSurface = !isIncoming && !isAutomated;
	const referral = message.metadados?.whatsappReferral;
	const aiContext = message.conteudoMidiaTextoProcessado || message.conteudoMidiaTextoProcessadoResumo;
	// O metadata guarda o histórico de react/unreact. No WhatsApp cada remetente tem no
	// máximo uma reação por mensagem e o "unreact" chega sem emoji, então a redução é a
	// última ação por remetente — não por emoji, que deixaria uma reação trocada para trás.
	const activeReactions = (() => {
		const reactions = message.metadados?.whatsappReactions ?? [];
		if (!reactions.length) return [] as string[];
		const lastBySender = new Map<string, (typeof reactions)[number]>();
		for (const reaction of reactions) {
			lastBySender.set(reaction.senderPhoneNumber ?? "", reaction);
		}
		return [...lastBySender.values()].filter((reaction) => reaction.action === "react").map((reaction) => reaction.emoji ?? "❤️");
	})();

	// O texto de localização repete o que o cartão já mostra — só serve a prévias e agentes.
	const showsText =
		!message.metadados?.whatsappUnsupported &&
		!!message.conteudoTexto &&
		!(message.conteudoMidiaTipo === "LOCALIZACAO" && message.metadados?.whatsappLocation);
	// Hora na mesma linha do texto, como no WhatsApp: metade da altura numa mensagem curta. Só
	// quando o texto é o último elemento da bolha — com a análise da IA abaixo, o carimbo fecha a bolha.
	const metaInline = showsText && !(hasMedia && !isSticker && aiContext);
	// Como no WhatsApp: "Editada" ao lado da hora. O texto anterior fica no title, para quem
	// precisar saber o que mudou sem poluir a bolha.
	const edits = message.metadados?.whatsappEdits ?? [];
	const previousText = edits[edits.length - 1]?.previousText;
	const meta = (
		<>
			{edits.length > 0 && <span title={previousText ? `Antes: ${previousText}` : undefined}>Editada</span>}
			<span>{formatTime(message.dataEnvio)}</span>
			{!isIncoming && <DeliveryTicks status={message.statusEntrega} />}
		</>
	);

	return (
		<div className={cn("flex w-full flex-col gap-0.5", isIncoming ? "items-start" : "items-end")}>
			{showAuthor && (
				// Rótulo discreto: quem fala é contexto, a mensagem é o conteúdo. Caixa alta em negrito
				// fazia o nome pesar mais que o texto da bolha.
				<span className="flex items-center gap-1 px-1 text-[11px] font-semibold text-muted-foreground">
					{message.autorTipo === "AI" && <Sparkles className="h-3 w-3" />}
					{message.autorTipo === "BUSINESS-APP" && <Smartphone className="h-3 w-3" />}
					{resolveAuthorLabel(message)}
				</span>
			)}

			<div
				className={cn(
					"max-w-[72%] rounded-2xl text-sm",
					!isSticker && "px-3 py-2 shadow-sm",
					// Como no WhatsApp, mensagens com mídia têm uma coluna estável: a
					// legenda quebra dentro dela em vez de alargar a bubble sozinha.
					hasMedia && !isSticker && "w-[20rem]",
					// Rabinho assimétrico do lado do autor.
					isIncoming ? "rounded-tl-lg" : "rounded-tr-lg",
					isSticker
						? "bg-transparent"
						: isIncoming
							? "border border-border bg-card text-card-foreground"
							: isFailed
								? "bg-destructive text-destructive-foreground"
								: isAutomated
									? // Texto em foreground: muted-foreground sobre muted não passa 4.5:1, e a
										// mensagem do telefone/IA é tão legível quanto qualquer outra.
										"bg-muted text-foreground"
									: "bg-primary text-primary-foreground",
					message.optimistic && "opacity-70",
				)}
			>
				{referral && (
					<div className="mb-2 rounded-lg border border-current/20 bg-current/5 p-2 text-xs">
						<p className="font-semibold">Veio de um anúncio</p>
						{referral.headline && <p className="mt-0.5 line-clamp-2">{referral.headline}</p>}
						{referral.sourceUrl && (
							<a href={referral.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate underline">
								{referral.sourceUrl}
							</a>
						)}
					</div>
				)}

				{message.conteudoMidiaTipo === "LOCALIZACAO" && message.metadados?.whatsappLocation && (
					<LocationCard location={message.metadados.whatsappLocation} />
				)}

				{/* Checagem inline em vez de `hasMedia`: o narrowing do union não atravessa o alias. */}
				{message.conteudoMidiaTipo !== "TEXTO" && message.conteudoMidiaTipo !== "LOCALIZACAO" && (
					<div className="mb-1">
						<ChatMediaAttachment
							tipo={message.conteudoMidiaTipo}
							url={message.conteudoMidiaUrl}
							arquivoNome={message.conteudoMidiaArquivoNome}
							arquivoTamanho={message.conteudoMidiaArquivoTamanho}
							mimeType={message.conteudoMidiaMimeType}
						/>
					</div>
				)}

				{message.metadados?.whatsappUnsupported ? (
					// Nota honesta: a Cloud API não entrega o conteúdo (enquete, edição, gif…),
					// então mostramos isso em vez de fingir que é uma mensagem comum.
					<p className="text-xs italic opacity-80">
						{message.conteudoTexto || "Mensagem não suportada pelo WhatsApp."}
						{message.metadados.whatsappUnsupported.code ? ` (código ${message.metadados.whatsappUnsupported.code})` : ""}
					</p>
				) : (
					showsText && (
						<p className="relative">
							<WhatsAppMessageText text={message.conteudoTexto ?? ""} onColoredSurface={onColoredSurface} />
							{metaInline && (
								<>
									{/* Reserva invisível do tamanho do carimbo no fim da última linha: se couber,
									    a hora divide a linha com o texto; se não, a reserva quebra e abre uma
									    linha só para ela. O carimbo real fica ancorado no canto. */}
									<span aria-hidden className="invisible ml-2 inline-flex items-center gap-1 text-[11px]">
										{meta}
									</span>
									<span className="absolute right-0 bottom-0 inline-flex translate-y-0.5 items-center gap-1 text-[11px] leading-none opacity-80">{meta}</span>
								</>
							)}
						</p>
					)
				)}

				{hasMedia && !isSticker && aiContext && (
					<Collapsible className="mt-1.5">
						<CollapsibleTrigger className="flex items-center gap-1 text-[11px] opacity-80 hover:opacity-100">
							<ChevronDown className="h-3 w-3" />
							Ver análise da IA
						</CollapsibleTrigger>
						<CollapsibleContent className="mt-1 whitespace-pre-wrap rounded-lg bg-current/10 p-2 text-[11px] leading-snug">{aiContext}</CollapsibleContent>
					</Collapsible>
				)}

				{!metaInline && (
					<div
						className={cn(
							"mt-1 flex items-center justify-end gap-1 text-[11px] opacity-80",
							// Fora da bolha colorida não há cor herdada para o carimbo de hora.
							isSticker && "text-muted-foreground",
						)}
					>
						{meta}
					</div>
				)}
			</div>

			{/* Vínculo mensagem → execução, que o playground já tinha e o hub ignorava: "por que a IA
			    disse isso?" deixa de exigir uma ida a Configurações. */}
			{message.autorTipo === "AI" && message.metadados?.aiAgente?.runId && onOpenAiRun && (
				<button
					type="button"
					onClick={() => onOpenAiRun(message.metadados?.aiAgente?.runId as string)}
					className="px-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
				>
					ver o que a IA consultou
				</button>
			)}

			{activeReactions.length > 0 && (
				// O chip sobrepõe a borda inferior da bolha (-mt) e precisa de z próprio para
				// pintar por cima dela.
				<div className={cn("relative z-10 -mt-2 flex", isIncoming ? "justify-start pl-2" : "justify-end pr-2")}>
					<span className="rounded-full bg-card px-1.5 py-0.5 text-[11px] leading-none shadow-sm ring-1 ring-inset ring-border" aria-label="Reações">
						{activeReactions.join(" ")}
					</span>
				</div>
			)}

			{/* O módulo equivalente do Control nunca passa onRetry, então este botão é
			    invisível lá mesmo quando o envio falha. */}
			{isFailed && onRetry && !message.optimistic && (
				<Button variant="ghost" size="sm" className="gap-1 text-xs" disabled={isRetrying} onClick={() => onRetry(message.id)}>
					<RotateCw className={cn("h-3 w-3", isRetrying && "animate-spin")} />
					Tentar novamente
				</Button>
			)}
		</div>
	);
}
