import { ifoodCatalogPushLockKey, runIfoodCatalogPush } from "@/lib/integrations/ifood/sync/queue";
import { db } from "@/services/drizzle";
import { handleCallback } from "@vercel/queue";
import { sql } from "drizzle-orm";
import { z } from "zod";

/**
 * Consumer do tópico `ifood-catalog-push` (produtor em `lib/integrations/ifood/sync/queue.ts`).
 *
 * Sem URL pública: triggers `queue/v2beta` (vercel.json) só são invocáveis pela infraestrutura da
 * Vercel, por isso não há autenticação aqui.
 *
 * Um push por nó de cada vez: dois pushes do mesmo grupo em paralelo poderiam criar duas vezes a
 * mesma opção sem par no iFood (passo 3 do push do grupo). O lock advisory vive na transação que
 * envolve o push — o push grava pelo `db` (outras conexões), a transação só segura o lock. Quem não
 * consegue o lock devolve a mensagem para daqui a pouco, sem contar como falha.
 */
const MessageSchema = z.discriminatedUnion("tipo", [
	z.object({
		tipo: z.literal("PRODUTO"),
		orgId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).min(1),
		produtoId: z.string({ invalid_type_error: "Tipo inválido para o id do produto." }).min(1),
	}),
	z.object({
		tipo: z.literal("ADD_ON_GROUP"),
		orgId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).min(1),
		produtoAddOnId: z.string({ invalid_type_error: "Tipo inválido para o id do grupo de adicionais." }).min(1),
	}),
]);

class PushBusyError extends Error {
	constructor() {
		super("Outro push do mesmo nó está em andamento.");
	}
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handleCallback(
	async (raw) => {
		const message = MessageSchema.parse(raw);
		await db.transaction(async (tx) => {
			const [row] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${ifoodCatalogPushLockKey(message)})) as locked`);
			if (!row?.locked) throw new PushBusyError();
			const result = await runIfoodCatalogPush(message);
			console.log("[IFOOD_PUSH] [QUEUE] Push concluído.", { ...message, ...result });
		});
	},
	{
		retry: (error, metadata) => {
			if (error instanceof PushBusyError) return { afterSeconds: 15 };
			// O push em si nunca lança (best-effort por vínculo): chegar aqui é a função morrendo no
			// meio. Reentregar é seguro (diferencial por snapshot); mensagem envenenada não retenta até o TTL.
			if (metadata.deliveryCount >= 3) {
				console.error("[IFOOD_PUSH] [QUEUE] Mensagem descartada após 3 tentativas:", metadata.messageId, error);
				return { acknowledge: true };
			}
			return { afterSeconds: 30 };
		},
	},
);
