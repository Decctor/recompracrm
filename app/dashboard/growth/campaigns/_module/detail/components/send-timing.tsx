"use client";

import type { TGetCampaignsOutputById } from "@/app/api/campaigns/route";
import { useCampaignNextDispatch } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import { CalendarClock, Send } from "lucide-react";
import dayjs from "dayjs";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

// O que acontece com o cliente de cada gatilho de evento, para o "Quando o cliente recebe".
const EVENT_LABELS: Partial<Record<TGetCampaignsOutputById["gatilhoTipo"], string>> = {
	"NOVA-COMPRA": "Compra realizada",
	"PRIMEIRA-COMPRA": "Primeira compra",
	"CASHBACK-ACUMULADO": "Cashback acumulado",
	ANIVERSARIO_CLIENTE: "Aniversário",
	"QUANTIDADE-TOTAL-COMPRAS": "Marco de compras",
	"VALOR-TOTAL-COMPRAS": "Marco de valor",
	"PIOR-DIA-VENDAS": "Pior dia de vendas",
	"ENTRADA-SEGMENTAÇÃO": "Entrada na segmentação",
	"PERMANÊNCIA-SEGMENTAÇÃO": "Tempo na segmentação",
};

const SCHEDULED_TRIGGERS = new Set(["RECORRENTE", "USO-UNICO", "PROMOCAO-PRODUTOS", "PESQUISA"]);

function hourOf(block: string) {
	return Number(block.split(":")[0]);
}

export function formatHourWindow(block: string) {
	const hour = hourOf(block);
	return `${String(hour).padStart(2, "0")}h – ${String((hour + 1) % 24).padStart(2, "0")}h`;
}

function formatDuration(value: number, unit: string | null | undefined) {
	return `${value} ${(unit ?? "DIAS").toLowerCase()}`;
}

/** A janela de uma hora em que a campanha entra na fila, desenhada sobre o dia. */
export function DayWindowStrip({ block, appliesOnlyToDelayed }: { block: string; appliesOnlyToDelayed: boolean }) {
	const selected = hourOf(block);
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between gap-2">
				<span className="text-label text-muted-foreground">Janela do dia</span>
				<span className="text-[0.7rem] text-muted-foreground">
					{appliesOnlyToDelayed ? "vale para os envios com intervalo" : "a rodada entra na fila nesta hora"}
				</span>
			</div>
			<div className="grid grid-cols-24 gap-0.5" role="img" aria-label={`Janela das ${formatHourWindow(block)}`}>
				{HOURS.map((hour) => (
					<div
						key={hour}
						className={cn("h-6 rounded-sm", hour === selected ? "bg-primary" : hour >= 6 && hour < 22 ? "bg-muted" : "bg-muted/50")}
						title={`${String(hour).padStart(2, "0")}h`}
					/>
				))}
			</div>
			<div className="grid grid-cols-4 text-[0.65rem] text-muted-foreground tabular-nums">
				<span>00h</span>
				<span>06h</span>
				<span>12h</span>
				<span>18h</span>
			</div>
		</div>
	);
}

/**
 * Em que momento, em relação ao evento, o cliente recebe. Sem datas inventadas: o aviso de
 * cashback expirando, por exemplo, sai na varredura que encontra o saldo dentro da antecedência,
 * então "até 7 dias antes" é o que dá para prometer.
 */
export function ReceiveTimeline({ campaign }: { campaign: TGetCampaignsOutputById }) {
	if (SCHEDULED_TRIGGERS.has(campaign.gatilhoTipo)) return null;

	let first: string;
	let second: string;
	let gap: string;
	if (campaign.gatilhoTipo === "CASHBACK-EXPIRANDO") {
		first = "Mensagem enviada";
		second = "Cashback expira";
		gap = campaign.gatilhoCashbackExpirandoAntecedenciaValor
			? `até ${formatDuration(campaign.gatilhoCashbackExpirandoAntecedenciaValor, campaign.gatilhoCashbackExpirandoAntecedenciaMedida)} antes`
			: "antes do vencimento";
	} else {
		const event = EVENT_LABELS[campaign.gatilhoTipo] ?? "Evento";
		const delay = campaign.execucaoAgendadaValor ?? 0;
		if (delay <= 0) {
			first = event;
			second = "Mensagem enviada";
			gap = "logo em seguida";
		} else if (campaign.execucaoAgendadaDirecao === "ANTES") {
			first = "Mensagem enviada";
			second = event;
			gap = `${formatDuration(delay, campaign.execucaoAgendadaMedida)} antes`;
		} else {
			first = event;
			second = "Mensagem enviada";
			gap = `${formatDuration(delay, campaign.execucaoAgendadaMedida)} depois`;
		}
	}

	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-label text-muted-foreground">Quando o cliente recebe</span>
			<div className="flex items-center gap-2">
				<span className="size-2.5 shrink-0 rounded-full bg-primary" />
				<span className="flex-1 border-t-2 border-dashed border-border" />
				<span className="shrink-0 text-[0.7rem] font-bold text-primary">{gap}</span>
				<span className="flex-1 border-t-2 border-dashed border-border" />
				<span className="size-2.5 shrink-0 rounded-full bg-muted-foreground" />
			</div>
			<div className="flex items-center justify-between gap-2 text-[0.7rem] font-bold uppercase">
				<span>{first}</span>
				<span className="text-right">{second}</span>
			</div>
		</div>
	);
}

function describeNextDispatch(date: Date) {
	const target = dayjs(date);
	const today = dayjs();
	const day = target.isSame(today, "day") ? "Hoje" : target.isSame(today.add(1, "day"), "day") ? "Amanhã" : target.format("DD/MM/YYYY");
	return `${day}, ${target.format("DD/MM")} · ${target.format("HH")}h`;
}

export function NextDispatchCard({ campaign }: { campaign: TGetCampaignsOutputById }) {
	const { data, isLoading } = useCampaignNextDispatch({ campaignId: campaign.id });

	let text: string;
	if (isLoading) text = "Calculando...";
	else if (!data || data.fonte === null) text = campaign.ativo ? "Nenhum disparo previsto" : "Campanha pausada";
	else if (data.fonte === "PROXIMO_EVENTO") text = `No próximo evento, na janela das ${formatHourWindow(data.bloco)}`;
	else text = data.dataPrevista ? describeNextDispatch(new Date(data.dataPrevista)) : "Nenhum disparo previsto";

	return (
		<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
			<CalendarClock className="size-5 min-h-5 min-w-5 shrink-0 text-muted-foreground" />
			<div className="flex min-w-0 flex-col">
				<span className="text-label text-muted-foreground">Próximo disparo</span>
				<span className="text-sm font-bold">{text}</span>
			</div>
			{data?.fonte === "DISPARO_AGENDADO" ? (
				<span className="ml-auto flex items-center gap-1 text-[0.65rem] text-muted-foreground">
					<Send className="size-3.5" />
					rodada já criada
				</span>
			) : null}
		</div>
	);
}
