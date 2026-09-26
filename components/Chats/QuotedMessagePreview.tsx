"use client";

import { describeQuotedMedia, type TQuotedMessageSnapshot } from "@/lib/chats/quoted-message";
import { cn } from "@/lib/utils";
import { FileText, Image as ImageIcon, MapPin, Mic, Smile, Video } from "lucide-react";

type QuotedMessagePreviewProps = {
	quote: TQuotedMessageSnapshot;
	/** Nome do cliente da conversa — a citação de uma mensagem dele não guarda nome. */
	clientName: string;
	/** Bolha de saída (fundo primário) deriva as cores do texto em vez de usar tokens fixos. */
	onPrimary?: boolean;
	/** Pula até a mensagem original; ausente no painel do compositor. */
	onClick?: () => void;
	className?: string;
};

function QuotedMediaIcon({ mediaType }: { mediaType: TQuotedMessageSnapshot["mediaType"] }) {
	const className = "h-3 w-3 shrink-0";
	if (mediaType === "IMAGEM") return <ImageIcon className={className} />;
	if (mediaType === "VIDEO") return <Video className={className} />;
	if (mediaType === "AUDIO") return <Mic className={className} />;
	if (mediaType === "DOCUMENTO") return <FileText className={className} />;
	if (mediaType === "FIGURINHA") return <Smile className={className} />;
	if (mediaType === "LOCALIZACAO") return <MapPin className={className} />;
	return null;
}

function resolveQuotedAuthorLabel(quote: TQuotedMessageSnapshot, clientName: string) {
	if (quote.authorType === "CLIENTE") return clientName;
	if (quote.authorType === "AI") return "Assistente IA";
	if (quote.authorType === "BUSINESS-APP") return "Telefone";
	return quote.authorName ?? "Você";
}

/**
 * Painel de citação, como no WhatsApp: barra colorida à esquerda (uma cor para o cliente, outra
 * para a loja), autor em destaque, até duas linhas de texto e miniatura à direita quando é foto.
 * Serve a bolha (clicável, pula até a original) e o compositor (com botão de cancelar ao lado).
 */
export function QuotedMessagePreview({ quote, clientName, onPrimary = false, onClick, className }: QuotedMessagePreviewProps) {
	const unavailable = !quote.chatMessageId;
	const isClient = quote.authorType === "CLIENTE";
	const authorLabel = unavailable ? null : resolveQuotedAuthorLabel(quote, clientName);
	const body = unavailable ? "Mensagem original não disponível" : quote.text || describeQuotedMedia(quote) || "Mensagem";
	const thumbnail = !unavailable && quote.mediaUrl && (quote.mediaType === "IMAGEM" || quote.mediaType === "FIGURINHA") ? quote.mediaUrl : null;

	const content = (
		<>
			<span
				aria-hidden
				className={cn(
					"w-1 shrink-0 self-stretch rounded-full",
					// A barra identifica quem falou, como no WhatsApp (verde para o contato, azul para você).
					isClient ? "bg-emerald-500" : onPrimary ? "bg-primary-foreground/80" : "bg-primary",
				)}
			/>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5 text-left">
				{authorLabel && (
					<span
						className={cn(
							"truncate text-[11px] font-semibold leading-tight",
							isClient ? "text-emerald-600 dark:text-emerald-400" : onPrimary ? "text-primary-foreground" : "text-primary",
						)}
					>
						{authorLabel}
					</span>
				)}
				<span
					className={cn(
						"line-clamp-2 flex items-start gap-1 text-xs leading-snug",
						unavailable && "italic",
						onPrimary ? "text-primary-foreground/80" : "text-muted-foreground",
					)}
				>
					{!quote.text && !unavailable && <QuotedMediaIcon mediaType={quote.mediaType} />}
					<span className="min-w-0 break-words">{body}</span>
				</span>
			</span>
			{thumbnail && <img src={thumbnail} alt="" className="h-11 w-11 shrink-0 self-center rounded-md object-cover" loading="lazy" />}
		</>
	);

	const surfaceClasses = cn(
		"flex w-full items-stretch gap-2 overflow-hidden rounded-lg py-1 pr-1.5 pl-1.5",
		onPrimary ? "bg-primary-foreground/10" : "bg-muted/70",
		className,
	);

	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				className={cn(surfaceClasses, "cursor-pointer transition-colors", onPrimary ? "hover:bg-primary-foreground/15" : "hover:bg-muted")}
				aria-label="Ir para a mensagem citada"
			>
				{content}
			</button>
		);
	}
	return <div className={surfaceClasses}>{content}</div>;
}
