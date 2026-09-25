"use client";

import { formatDecimalPlaces } from "@/lib/formatting";
import type { TChatsStatsOverview } from "@/lib/queries/chats-stats";
import { ArrowRightLeft, Bot, CalendarClock, MessagesSquare } from "lucide-react";
import { CHAT_MESSAGE_AUTHOR_LABEL, CHAT_RESPONSIBLE_TYPE_LABEL } from "../config";

type ChatsAutomationBlockProps = {
	overview: TChatsStatsOverview | undefined;
	isLoading: boolean;
};

/**
 * Quem carregou o atendimento: equipe, automação ou o telefone.
 *
 * Contenção é a razão de o bloco existir — a métrica que diz se a IA está resolvendo ou só
 * adiando. Ela aparece ao lado dos handoffs de propósito: uma contenção alta com muitos
 * handoffs significa coisa diferente de uma contenção alta sem nenhum.
 */
export function ChatsAutomationBlock({ overview, isLoading }: ChatsAutomationBlockProps) {
	if (isLoading) return <div className="h-[240px] w-full animate-pulse rounded-2xl border border-border bg-muted/40" />;

	const atendimento = overview?.atendimento;
	const mensagens = overview?.mensagens;
	const totalResponsaveis = (atendimento?.porTipoResponsavel ?? []).reduce((soma, item) => soma + item.quantidade, 0);
	const totalMensagens = mensagens?.total ?? 0;

	return (
		<div className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
			<div className="flex flex-col">
				<h2 className="text-sm font-bold tracking-tight">EQUIPE, AUTOMAÇÃO E TELEFONE</h2>
				<p className="text-xs text-muted-foreground">Quem respondeu no período e quanto a automação segurou sozinha.</p>
			</div>

			<div className="flex flex-col gap-2 sm:flex-row">
				<div className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border p-3">
					<span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
						<Bot className="h-3.5 w-3.5" /> Contenção da IA
					</span>
					<span className="text-xl font-bold tabular-nums tracking-tight">{formatDecimalPlaces((atendimento?.contencaoIA ?? 0) * 100)}%</span>
					<span className="text-[11px] text-muted-foreground">
						{formatDecimalPlaces(atendimento?.encerradosPelaIA ?? 0, 0, 0)} encerrados pela automação
					</span>
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border p-3">
					<span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
						<ArrowRightLeft className="h-3.5 w-3.5" /> Handoffs
					</span>
					<span className="text-xl font-bold tabular-nums tracking-tight">{formatDecimalPlaces(atendimento?.handoffs ?? 0, 0, 0)}</span>
					<span className="text-[11px] text-muted-foreground">Passados da automação para a equipe</span>
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border p-3">
					<span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
						<CalendarClock className="h-3.5 w-3.5" /> Retomadas
					</span>
					<span className="text-xl font-bold tabular-nums tracking-tight">{formatDecimalPlaces(atendimento?.retomadas?.enviadas ?? 0, 0, 0)}</span>
					<span className="text-[11px] text-muted-foreground">
						{formatDecimalPlaces(atendimento?.retomadas?.respondidas ?? 0, 0, 0)} responderam (
						{formatDecimalPlaces((atendimento?.retomadas?.taxaResposta ?? 0) * 100)}%)
						{atendimento?.retomadas?.expiradas ? ` · ${formatDecimalPlaces(atendimento.retomadas.expiradas, 0, 0)} fora da janela` : ""}
					</span>
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border p-3">
					<span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
						<MessagesSquare className="h-3.5 w-3.5" /> Mensagens por atendimento
					</span>
					<span className="text-xl font-bold tabular-nums tracking-tight">{formatDecimalPlaces(mensagens?.mediaPorAtendimento ?? 0)}</span>
					<span className="text-[11px] text-muted-foreground">
						{formatDecimalPlaces(mensagens?.recebidas ?? 0, 0, 0)} recebidas · {formatDecimalPlaces(mensagens?.enviadas ?? 0, 0, 0)} enviadas
					</span>
				</div>
			</div>

			<div className="flex flex-col gap-3 lg:flex-row">
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<h3 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Atendimentos por responsável</h3>
					{totalResponsaveis === 0 ? (
						<p className="text-xs text-muted-foreground">Nenhum atendimento no período.</p>
					) : (
						(atendimento?.porTipoResponsavel ?? []).map((item) => (
							<div key={item.tipo} className="flex items-center gap-2">
								<span className="w-32 shrink-0 truncate text-[11px] text-muted-foreground">{CHAT_RESPONSIBLE_TYPE_LABEL[item.tipo]}</span>
								<div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
									<div className="h-full rounded-full bg-primary" style={{ width: `${(item.quantidade / totalResponsaveis) * 100}%` }} />
								</div>
								<span className="w-10 shrink-0 text-right text-[11px] font-bold tabular-nums">{item.quantidade}</span>
							</div>
						))
					)}
				</div>

				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<h3 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Mensagens por autor</h3>
					{totalMensagens === 0 ? (
						<p className="text-xs text-muted-foreground">Nenhuma mensagem no período.</p>
					) : (
						(mensagens?.porAutor ?? []).map((item) => (
							<div key={item.autor} className="flex items-center gap-2">
								<span className="w-32 shrink-0 truncate text-[11px] text-muted-foreground">{CHAT_MESSAGE_AUTHOR_LABEL[item.autor]}</span>
								<div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
									<div className="h-full rounded-full bg-brand" style={{ width: `${(item.quantidade / totalMensagens) * 100}%` }} />
								</div>
								<span className="w-14 shrink-0 text-right text-[11px] font-bold tabular-nums">{formatDecimalPlaces(item.quantidade, 0, 0)}</span>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
