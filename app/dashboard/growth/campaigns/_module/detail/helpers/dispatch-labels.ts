import type { TCampaignDispatchOriginEnum, TCampaignDispatchSkipReasonEnum, TCampaignDispatchStatusEnum } from "@/schemas/enums";
import dayjs from "dayjs";

export const DISPATCH_STATUS_LABELS: Record<TCampaignDispatchStatusEnum, { label: string; className: string }> = {
	PENDENTE: { label: "AGENDADO", className: "bg-blue-500 text-white" },
	RESOLVENDO: { label: "RESOLVENDO AUDIÊNCIA", className: "bg-blue-500 text-white" },
	ENFILEIRADA: { label: "NA FILA", className: "bg-blue-500 text-white" },
	ENVIANDO: { label: "ENVIANDO", className: "bg-amber-500 text-white" },
	CONCLUIDA: { label: "CONCLUÍDO", className: "bg-green-500 text-white" },
	FALHOU: { label: "FALHOU", className: "bg-red-500 text-white" },
	CANCELADA: { label: "CANCELADO", className: "bg-muted text-muted-foreground" },
	INTERROMPIDA: { label: "INTERROMPIDO", className: "bg-red-500 text-white" },
};

export const DISPATCH_ORIGIN_LABELS: Record<TCampaignDispatchOriginEnum, string> = {
	AGENDADA: "Agendado",
	RECORRENTE: "Recorrência",
	EVENTO: "Evento",
};

export const DISPATCH_SKIP_REASON_LABELS: Record<TCampaignDispatchSkipReasonEnum, string> = {
	EVENTO_INVALIDO: "evento inválido",
	VENDA_INVALIDA: "venda cancelada ou cliente alterado",
	EVENTO_EXPIRADO: "janela de envio expirada",
	QUOTA_ORG_DIARIO: "limite diário da organização",
	QUOTA_ORG_SEMANAL: "limite semanal da organização",
	QUOTA_CAMPANHA_DIARIO: "limite diário da campanha",
	QUOTA_CAMPANHA_SEMANAL: "limite semanal da campanha",
	SEM_CONTATO: "sem telefone nem e-mail",
	COMUNICACAO_PAUSADA: "comunicação pausada",
	FREQUENCIA: "já recebeu no intervalo",
	CAMPANHA_INATIVA: "campanha pausada",
	ENVIO_INTERROMPIDO: "envio interrompido",
};

/** Pulos que "Reenviar pulados por limite" devolve à fila: os de cota, que mudam com o tempo. */
export const QUOTA_SKIP_REASONS: TCampaignDispatchSkipReasonEnum[] = [
	"QUOTA_ORG_DIARIO",
	"QUOTA_ORG_SEMANAL",
	"QUOTA_CAMPANHA_DIARIO",
	"QUOTA_CAMPANHA_SEMANAL",
];

const SCHEDULED_WINDOW_PATTERN = /^(\d{4}-\d{2}-\d{2})@(\d{2}):\d{2}$/;

/**
 * Quando a rodada aconteceu, para leitura: "08/11/2026 · 09h" para uma janela agendada (o bloco é
 * uma hora, começando ali), data e hora para um evento. A chave crua de evento
 * ('entrada:<cliente>:<segmento>:...') não diz nada a quem lê, então nunca aparece.
 */
export function formatDispatchMoment(dispatch: {
	janelaReferencia: string;
	dataAgendada: Date | string | null;
	dataInsercao: Date | string;
}): string {
	const scheduled = SCHEDULED_WINDOW_PATTERN.exec(dispatch.janelaReferencia);
	if (scheduled) return `${dayjs(scheduled[1]).format("DD/MM/YYYY")} · ${scheduled[2]}h`;
	return dayjs(dispatch.dataAgendada ?? dispatch.dataInsercao).format("DD/MM/YYYY · HH:mm");
}
