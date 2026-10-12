"use client";
import type { TTabListItem } from "@/app/api/tabs/route";
import type { TSaleAttendanceStatusEnum } from "@/schemas/enums";
import { useEffect, useState } from "react";

// ============================================================================
// Leitura operacional do board: quanto tempo uma rodada esta em aberto e se ja
// passou do aceitavel. Nao existe SLA configurado para contas — os limites
// abaixo sao fixos e ficam concentrados aqui para virarem configuracao por
// organizacao sem tocar na UI.
// ============================================================================

/** Minutos ate uma rodada nesse status ser considerada atrasada. */
const ROUND_DELAY_LIMIT_MINUTES: Partial<Record<TSaleAttendanceStatusEnum, number>> = {
	NAO_INICIADO: 10,
	EM_PREPARO: 20,
	PRONTO: 10,
	EM_ENTREGA: 10,
	PARCIALMENTE_ENTREGUE: 10,
};

/** Fracao do limite a partir da qual a rodada entra em atencao (antes de atrasar). */
const ATTENTION_RATIO = 0.7;

/** Status que ainda demandam acao do salao. */
const CLOSED_ROUND_STATUSES: TSaleAttendanceStatusEnum[] = ["ENTREGUE", "CANCELADO"];

export type TRoundUrgency = "no-prazo" | "atencao" | "atrasado";

export type TBoardRound = {
	id: string;
	numero: number;
	status: TSaleAttendanceStatusEnum;
	minutos: number;
	urgencia: TRoundUrgency;
	/** Limite do status em minutos, null quando o status nao tem limite definido. */
	limiteMinutos: number | null;
};

export function isOpenRound(status: string) {
	return !CLOSED_ROUND_STATUSES.includes(status as TSaleAttendanceStatusEnum);
}

function elapsedMinutes(from: Date | string | null, now: number) {
	if (!from) return 0;
	return Math.max(0, Math.floor((now - new Date(from).getTime()) / 60_000));
}

/**
 * Rodadas em aberto da conta, ja com urgencia calculada e ordenadas da mais
 * critica para a menos. `now` vem do relogio que tica, entao o tempo avanca
 * sozinho enquanto a tela fica aberta.
 */
export function getOpenRounds(tab: Pick<TTabListItem, "pedidos">, now: number): TBoardRound[] {
	return tab.pedidos
		.filter((order) => isOpenRound(order.status))
		.map((order) => {
			const status = order.status as TSaleAttendanceStatusEnum;
			// dataEnvio e o marco real da rodada; dataInsercao cobre pedidos ainda nao enviados.
			const minutos = elapsedMinutes(order.dataEnvio ?? order.dataInsercao, now);
			const limiteMinutos = ROUND_DELAY_LIMIT_MINUTES[status] ?? null;

			let urgencia: TRoundUrgency = "no-prazo";
			if (limiteMinutos !== null) {
				if (minutos >= limiteMinutos) urgencia = "atrasado";
				else if (minutos >= limiteMinutos * ATTENTION_RATIO) urgencia = "atencao";
			}

			return { id: order.id, numero: order.numero, status, minutos, urgencia, limiteMinutos };
		})
		.sort((a, b) => URGENCY_WEIGHT[b.urgencia] - URGENCY_WEIGHT[a.urgencia] || b.minutos - a.minutos);
}

const URGENCY_WEIGHT: Record<TRoundUrgency, number> = { "no-prazo": 0, atencao: 1, atrasado: 2 };

/** Peso para ordenacao; null (sem rodadas / ponto livre) fica abaixo de tudo. */
export function urgencyRank(urgencia: TRoundUrgency | null) {
	return urgencia ? URGENCY_WEIGHT[urgencia] : -1;
}

/** Pior urgencia entre um conjunto de rodadas (para pills e cabecalhos de card). */
export function worstUrgency(rounds: TBoardRound[]): TRoundUrgency | null {
	if (rounds.length === 0) return null;
	return rounds.reduce<TRoundUrgency>((worst, round) => (URGENCY_WEIGHT[round.urgencia] > URGENCY_WEIGHT[worst] ? round.urgencia : worst), "no-prazo");
}

export const URGENCY_META: Record<TRoundUrgency, { dot: string; text: string; surface: string; border: string }> = {
	"no-prazo": {
		dot: "bg-muted-foreground/40",
		text: "text-muted-foreground",
		surface: "bg-secondary/60 text-muted-foreground",
		border: "border-border",
	},
	atencao: {
		dot: "bg-warning",
		text: "text-warning-surface-foreground",
		surface: "bg-warning-surface text-warning-surface-foreground",
		border: "border-warning/40",
	},
	atrasado: { dot: "bg-destructive", text: "text-destructive", surface: "bg-destructive/10 text-destructive", border: "border-destructive/35" },
};

export const ROUND_STATUS_LABEL: Record<string, string> = {
	NAO_INICIADO: "na fila",
	EM_PREPARO: "em preparo",
	PRONTO: "pronto",
	EM_ENTREGA: "em entrega",
	PARCIALMENTE_ENTREGUE: "entrega parcial",
};

/** Abreviacao para o card do board: "Pedido 2 em preparo · 24min" */
const ROUND_STATUS_SHORT: Record<string, string> = {
	NAO_INICIADO: "na fila",
	EM_PREPARO: "em preparo",
	PRONTO: "pronto",
	EM_ENTREGA: "em entrega",
	PARCIALMENTE_ENTREGUE: "parcial",
};

export function describeRoundShort(round: TBoardRound) {
	return `Pedido ${round.numero} ${ROUND_STATUS_SHORT[round.status] ?? round.status.toLowerCase()} · ${round.minutos}min`;
}

/** "Pedido 2 · em preparo há 24min" */
export function describeRound(round: TBoardRound) {
	return `Pedido ${round.numero} · ${ROUND_STATUS_LABEL[round.status] ?? round.status.toLowerCase()} há ${round.minutos}min`;
}

export function formatTabAge(from: Date | string, now: number) {
	const minutes = elapsedMinutes(from, now);
	if (minutes < 60) return `${minutes}min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h${(minutes % 60).toString().padStart(2, "0")}`;
	return `${Math.floor(hours / 24)}d`;
}

/**
 * Relogio compartilhado do board. Tica a cada 15s para que "há 24min" e as
 * urgencias avancem sem depender de refetch (mesmo idioma do SLA do iFood).
 */
export function useTickingNow(intervalMs = 15_000) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(interval);
	}, [intervalMs]);
	return now;
}

export function tabLabel(tab: Pick<TTabListItem, "codigo" | "servicePoint">) {
	return tab.servicePoint?.rotulo ?? (tab.codigo ? `Comanda ${tab.codigo}` : "Conta avulsa");
}

/**
 * Leitura derivada de uma conta para o board: rodadas abertas (mais critica
 * primeiro) e a pior urgencia. Calculada uma vez por tick e compartilhada entre
 * filtros, ordenacao, cards e navegacao do painel.
 */
export type TBoardTab = TTabListItem & {
	label: string;
	rounds: TBoardRound[];
	critical: TBoardRound | null;
	urgencia: TRoundUrgency | null;
};

export function toBoardTab(tab: TTabListItem, now: number): TBoardTab {
	const rounds = getOpenRounds(tab, now);
	return { ...tab, label: tabLabel(tab), rounds, critical: rounds[0] ?? null, urgencia: worstUrgency(rounds) };
}

/** Atrasadas primeiro, depois a rodada mais antiga, depois o rotulo — a ordem que o salao precisa ler. */
export function compareBoardTabs(a: TBoardTab, b: TBoardTab) {
	return (
		urgencyRank(b.urgencia) - urgencyRank(a.urgencia) ||
		(b.critical?.minutos ?? 0) - (a.critical?.minutos ?? 0) ||
		a.label.localeCompare(b.label, "pt-BR", { numeric: true })
	);
}
