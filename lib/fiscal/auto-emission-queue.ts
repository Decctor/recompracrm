import { send } from "@vercel/queue";

/** Consumido por `app/api/queues/fiscal-auto-emission` (trigger `queue/v2beta` no vercel.json). */
export const FISCAL_AUTO_EMISSION_TOPIC = "fiscal-auto-emissions";

// Limite de retenção do Vercel Queues (7 dias); o delay é capado à retenção.
const MAX_RETENTION_SECONDS = 7 * 24 * 60 * 60;
// Sobra depois do horário agendado para retentativas do consumer antes de a mensagem expirar.
const RETENTION_MARGIN_SECONDS = 24 * 60 * 60;

export type TFiscalAutoEmissionQueueMessage = {
	organizationId: string;
	saleId: string;
	authorId: string | null;
	// ISO string: o payload atravessa JSON (fila) sem perder tipo. É também o valor que o consumer
	// compara com `sales.emissaoFiscalDataAgendamento` para recusar mensagem velha ou duplicada.
	scheduledFor: string;
};

/**
 * Publica a execução de uma emissão automática agendada. A espera é o `delaySeconds` gerenciado
 * pela fila — nenhum processo fica segurando compute. Quem chama trata a falha (a coluna na venda
 * fica gravada e o cron `fiscal-queue` executa o agendamento vencido).
 */
export async function sendScheduledAutoEmissionToQueue(
	message: TFiscalAutoEmissionQueueMessage,
	{ now = new Date() }: { now?: Date } = {},
): Promise<void> {
	const scheduledFor = new Date(message.scheduledFor);
	const delaySeconds = Math.min(Math.max(1, Math.ceil((scheduledFor.getTime() - now.getTime()) / 1000)), MAX_RETENTION_SECONDS);
	await send(FISCAL_AUTO_EMISSION_TOPIC, message, {
		delaySeconds,
		retentionSeconds: Math.min(delaySeconds + RETENTION_MARGIN_SECONDS, MAX_RETENTION_SECONDS),
		// Um agendamento = uma mensagem, mesmo que dois gatilhos concorrentes passem pelo claim da
		// coluna na mesma janela. Um agendamento novo (coluna limpa e regravada) gera chave nova.
		idempotencyKey: `fiscal-auto-emission-${message.saleId}-${scheduledFor.getTime()}`,
	});
}
