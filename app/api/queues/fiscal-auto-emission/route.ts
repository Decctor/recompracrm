import { executeScheduledAutoEmission } from "@/lib/sales/sale-processing/execute-scheduled-auto-emission";
import { handleCallback } from "@vercel/queue";
import { z } from "zod";

/**
 * Consumer do tópico `fiscal-auto-emissions` (produtor em `lib/fiscal/auto-emission-queue.ts`).
 *
 * A rota não tem URL pública: triggers `queue/v2beta` (ver vercel.json) só são invocáveis pela
 * infraestrutura interna da Vercel, por isso não há checagem de autenticação aqui.
 *
 * A entrega é at-least-once e sem FIFO — inócuo por construção: `executeScheduledAutoEmission`
 * só age se `sales.emissaoFiscalDataAgendamento` ainda for exatamente o `scheduledFor` da mensagem
 * (claim por UPDATE condicional) e reavalia a elegibilidade da venda antes de emitir.
 */
const FiscalAutoEmissionQueueMessageSchema = z.object({
	organizationId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).min(1),
	saleId: z.string({ invalid_type_error: "Tipo inválido para o id da venda." }).min(1),
	authorId: z.string({ invalid_type_error: "Tipo inválido para o id do autor." }).nullable(),
	scheduledFor: z
		.string({ invalid_type_error: "Tipo inválido para o horário agendado." })
		.datetime({ message: "Horário agendado inválido." })
		.transform((value) => new Date(value)),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handleCallback(
	async (message) => {
		const input = FiscalAutoEmissionQueueMessageSchema.parse(message);
		await executeScheduledAutoEmission({ ...input, source: "FILA" });
	},
	{
		retry: (error, metadata) => {
			// Retentar é seguro (o claim recusa repetição), mas uma mensagem envenenada não pode
			// girar até o TTL: três tentativas e reconhece. O cron fiscal-queue cobre o agendamento
			// se a coluna da venda ainda estiver preenchida.
			if (metadata.deliveryCount >= 3) {
				console.error("[FISCAL_AUTO_EMISSION] [QUEUE] Mensagem descartada após 3 tentativas:", metadata.messageId, error);
				return { acknowledge: true };
			}
			return { afterSeconds: 60 };
		},
	},
);
