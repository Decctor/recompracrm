import { claimDueFollowUps } from "@/lib/ai/agent/follow-ups";
import { appApiHandler } from "@/lib/app-api";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { runAiFollowUp } from "@/lib/chats/ai-follow-up-runner";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { db } from "@/services/drizzle";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Executa as retomadas de conversa vencidas (`ai_agent_follow_ups` com `agendada_para <= now`).
 *
 * Reivindica em lote com lease (`claimDueFollowUps`) e executa com concorrência limitada. Com
 * `AI_TURN_TRANSPORT=queue` publica cada uma no tópico `ai-chat-follow-ups` e devolve na hora —
 * o mesmo interruptor do turno de IA. Cada retomada é uma run comum com gatilho RETOMADA: passa
 * pela revalidação pré-entrega e fica registrada como qualquer outra.
 */

export const maxDuration = 300;

const BATCH_SIZE = 25;
/** Turnos de LLM simultâneos na própria função: cada um segura poucas conexões do pool (máx. 10). */
const INLINE_RUN_CONCURRENCY = 3;
/** Publicações simultâneas na fila: chamadas HTTP curtas. */
const QUEUE_PUBLISH_CONCURRENCY = 5;

async function runDueFollowUps() {
	const now = new Date();
	const due = await claimDueFollowUps(db, { now, limit: BATCH_SIZE });
	const useQueue = process.env.AI_TURN_TRANSPORT === "queue";

	// Concorrência limitada em vez de uma a uma: cada retomada é independente — o índice parcial
	// `ai_agent_follow_ups_chat_agendada_idx` garante no máximo uma AGENDADA por chat, então o lote
	// nunca traz duas do mesmo chat. Em série, um lote de turnos de LLM podia passar do lease de
	// 5 min e do `maxDuration`, deixando as últimas do lote para serem reivindicadas de novo.
	let executadas = 0;
	await mapWithConcurrency(due, useQueue ? QUEUE_PUBLISH_CONCURRENCY : INLINE_RUN_CONCURRENCY, async (followUp) => {
		const payload = { followUpId: followUp.id, organizationId: followUp.organizacaoId, chatId: followUp.chatId, tentativa: followUp.tentativa };
		try {
			if (useQueue) {
				const { sendFollowUpToQueue } = await import("@/lib/chats/ai-follow-up-queue");
				await sendFollowUpToQueue(payload);
			} else {
				await runAiFollowUp(payload);
			}
			executadas += 1;
		} catch (error) {
			// A retomada fica AGENDADA com o lease; o próximo ciclo tenta de novo, até três vezes.
			console.error("[AI_FOLLOW_UP] [CRON] Falha ao executar a retomada:", followUp.id, error);
		}
	});

	console.log(`[INFO] [AI_FOLLOW_UPS] ${due.length} retomada(s) vencida(s), ${executadas} ${useQueue ? "enfileirada(s)" : "executada(s)"}.`);
	return { data: { vencidas: due.length, processadas: executadas, transporte: useQueue ? "queue" : "inline" }, message: "Retomadas processadas com sucesso." };
}
export type TRunAiFollowUpsOutput = Awaited<ReturnType<typeof runDueFollowUps>>;

async function runAiFollowUpsRoute(req: NextRequest) {
	assertCronAuthorized(req);
	const result = await runDueFollowUps();
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: runAiFollowUpsRoute });
