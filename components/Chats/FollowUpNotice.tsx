"use client";

import { Button } from "@/components/ui/button";
import { CalendarClock, Loader2 } from "lucide-react";

type FollowUpNoticeProps = {
	retomada: { id: string; agendadaPara: Date | string; objetivo: string };
	agentName: string | null;
	onCancel?: () => void;
	isCancelling?: boolean;
};

export function formatFollowUpMoment(date: Date | string) {
	const value = new Date(date);
	const today = new Date();
	const sameDay = value.toDateString() === today.toDateString();
	const tomorrow = new Date(today.getTime() + 86_400_000);
	const time = value.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
	if (sameDay) return `hoje às ${time}`;
	if (value.toDateString() === tomorrow.toDateString()) return `amanhã às ${time}`;
	return `${value.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })} às ${time}`;
}

/**
 * Retomada agendada pela IA, na mesma faixa em que a presença dela aparece: quem olha a
 * conversa sabe que ela não morreu — a IA volta se o cliente não responder — e pode cancelar.
 */
export function FollowUpNotice({ retomada, agentName, onCancel, isCancelling }: FollowUpNoticeProps) {
	const nome = agentName?.trim() || "A IA";
	return (
		<div className="flex items-center gap-2 border-t border-border bg-muted/40 px-4 py-1.5 text-[11px] text-muted-foreground">
			<CalendarClock className="h-3 w-3 shrink-0 text-primary" aria-hidden />
			<span className="min-w-0 flex-1 truncate" title={retomada.objetivo}>
				<span className="text-foreground">
					{nome} retoma {formatFollowUpMoment(retomada.agendadaPara)}
				</span>{" "}
				se o cliente não responder · {retomada.objetivo}
			</span>
			{onCancel ? (
				<Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={onCancel} disabled={isCancelling}>
					{isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
					Cancelar
				</Button>
			) : null}
		</div>
	);
}
