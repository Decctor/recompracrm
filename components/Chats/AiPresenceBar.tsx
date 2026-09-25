"use client";

import { Button } from "@/components/ui/button";
import type { TAiPresence } from "@/lib/chats/ai-presence";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { TypingIndicator } from "./TypingIndicator";

type AiPresenceBarProps = {
	presence: TAiPresence;
	/** Nome configurado do agente, para a faixa falar "Ana responde…" em vez de "a IA". */
	agentName: string | null;
	/** Ausente quando o usuário já é o dono ou não pode assumir. */
	onAssume?: () => void;
	isAssuming?: boolean;
	onOpenRun?: (runId: string) => void;
};

function formatClock(date: Date) {
	return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Linha entre a lista de mensagens e o composer que diz o que a IA está fazendo agora.
 *
 * É discreta de propósito nos estados normais (aguardando, respondendo) — o atendente só
 * precisa saber que não está sozinho — e vira alerta quando a IA falhou ou bateu o limite,
 * porque aí o atendimento parece atendido e não está.
 */
export function AiPresenceBar({ presence, agentName, onAssume, isAssuming, onOpenRun }: AiPresenceBarProps) {
	if (presence.estado === "ausente") return null;

	const nome = agentName?.trim() || "A IA";
	const assumeButton = onAssume ? (
		<Button
			size="sm"
			variant={presence.estado === "falhou" || presence.estado === "limite" ? "default" : "ghost"}
			className="h-7 shrink-0"
			onClick={onAssume}
			disabled={isAssuming}
		>
			{isAssuming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
			{presence.estado === "respondendo" ? "Assumir agora" : "Assumir"}
		</Button>
	) : null;

	if (presence.estado === "aguardando") {
		return (
			<div className="flex items-center gap-2 border-t border-border bg-muted/40 px-4 py-1.5 text-[11px] text-muted-foreground">
				<Sparkles className="h-3 w-3 shrink-0 text-primary" aria-hidden />
				<span className="min-w-0 flex-1 truncate">
					{presence.motivo === "reserva"
						? `${nome} responde às ${formatClock(presence.previstoEm)} se ninguém assumir antes`
						: `${nome} responde em instantes`}
				</span>
				{assumeButton}
			</div>
		);
	}

	if (presence.estado === "respondendo") {
		return (
			<div className="flex items-center gap-2 border-t border-border bg-primary/5 px-4 py-1.5 text-[11px] text-foreground">
				<Sparkles className="h-3 w-3 shrink-0 text-primary" aria-hidden />
				<span className="flex min-w-0 flex-1 items-center gap-2">
					<span className="truncate">{nome} está escrevendo</span>
					<TypingIndicator className="text-primary" />
				</span>
				{onAssume ? <span className="hidden text-muted-foreground sm:inline">a resposta em andamento será descartada</span> : null}
				{assumeButton}
			</div>
		);
	}

	const isLimit = presence.estado === "limite";
	return (
		<div className={cn("flex items-center gap-2 border-t px-4 py-1.5 text-[11px]", "border-destructive/30 bg-destructive/5 text-destructive")}>
			<AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
			<span className="min-w-0 flex-1 truncate">
				{isLimit ? "Limite mensal de IA atingido: a IA não responde até o próximo mês." : `${nome} não conseguiu responder.`}
				{!isLimit && onOpenRun ? (
					<>
						{" "}
						<button type="button" className="underline underline-offset-2" onClick={() => onOpenRun(presence.runId)}>
							ver detalhes
						</button>
					</>
				) : null}
			</span>
			{assumeButton}
		</div>
	);
}
