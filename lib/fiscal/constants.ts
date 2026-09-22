import type { TFiscalDocumentTypeEnum } from "@/schemas/enums";
import type { TEmitirDocumentoInput } from "./types";

export const FISCAL_STORAGE_PREFIX = "fiscal";

export const SUPPORTED_AUTOMATIC_DOCUMENT_TYPES: TFiscalDocumentTypeEnum[] = ["NFCE", "NFE"];

/**
 * Prazos legais adotados como padrao do produto. Cancelamento varia por UF (algumas SEFAZ aceitam
 * 24h para NFC-e); por ora o padrao e unico, em codigo. Cancelamento extemporaneo nao e suportado
 * pelo provedor (Spedy) — fora da janela, a saida e devolucao ou carta de correcao.
 */
export const FISCAL_DEADLINES = {
	nfceCancellationMinutes: 30,
	nfeCancellationHours: 24,
	// Limite legal de eventos de carta de correcao por NF-e; a ultima substitui as anteriores.
	correctionLetterMaxEvents: 20,
	// Inutilizacao deve ser pedida ate o dia 10 do mes seguinte ao da numeracao reservada.
	inutilizationDayOfNextMonth: 10,
	// Documento parado em processamento alem disto merece atencao do operador.
	processingAlertMinutes: 15,
} as const;

export type TFiscalDeadlines = typeof FISCAL_DEADLINES;

/**
 * Atraso da emissão automática (fiscalConfiguracao.emissaoAutomatica.atrasoMinutos).
 * O teto do schema é o limite de `delaySeconds` do Vercel Queues (7 dias); a interface oferece
 * até 24 h — acima disso a espera deixa de ser "janela de correção" e vira nota esquecida.
 */
export const AUTO_EMISSION_MAX_DELAY_MINUTES = 7 * 24 * 60;
export const AUTO_EMISSION_UI_MAX_DELAY_MINUTES = 24 * 60;
// Graça que o cron fiscal-queue dá à fila antes de executar um agendamento vencido por conta própria.
export const AUTO_EMISSION_SCHEDULE_GRACE_MINUTES = 5;

export function buildFiscalReference(input: Pick<TEmitirDocumentoInput, "organizacaoId" | "vendaId" | "tipo" | "documentoOrigemId">) {
	const base = `v:${input.vendaId}:t:${input.tipo}`;
	// Devolucao referencia a mesma venda/tipo da original; sufixo evita colisao de referencia.
	return input.documentoOrigemId ? `${base}:dev:${input.documentoOrigemId}` : base;
}
