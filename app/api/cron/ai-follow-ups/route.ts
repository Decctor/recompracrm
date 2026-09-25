import { claimDueFollowUps } from "@/lib/ai/agent/follow-ups";
import { appApiHandler } from "@/lib/app-api";
import { runAiFollowUp } from "@/lib/chats/ai-follow-up-runner";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { db } from "@/services/drizzle";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Executa as retomadas de conversa vencidas (`ai_agent_follow_ups` com `agendada_para <= now`).
 *
 * Reivindica em lote com lease (`claimDueFollowUps`) e executa uma a uma. Com
 * `AI_TURN_TRANSPORT=queue` publica cada uma no tópico `ai-chat-follow-ups` e devolve na hora —
 * o mesmo interruptor do turno de IA. Cada retomada é uma run comum com gatilho RETOMADA: passa
 * pela revalidação pré-entrega e fica registrada como qualquer outra.
 */

export const maxDuration = 300;

const BATCH_SIZE = 25;

async function runDueFollowUps() {
	const now = new Date();
	const due = await claimDueFollowUps(db, { now, limit: BATCH_SIZE });
	const useQueue = process.env.AI_TURN_TRANSPORT === "queue";

	let executadas = 0;
	for (const followUp of due) {
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
	}

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
