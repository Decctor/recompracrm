/**
 * Consumer de uma mensagem de envio com vários disparos (lote). A fila não limita a concorrência
 * dos consumers; um lote mantém numa única instância o que antes eram dezenas de instâncias em
 * paralelo, cada uma com seu pool de conexões (incidente de 04/11/2026, 41 disparos às 12:00).
 *
 * Cada disparo segue idempotente por conta própria (status + FOR UPDATE SKIP LOCKED), então:
 *  - uma falha não interrompe os demais; o lote termina e o chamador relança, para a fila
 *    reentregar — os disparos já concluídos recuam na hora;
 *  - perto do fim do orçamento, os disparos não iniciados seguem numa mensagem de continuação.
 */

// Abaixo do maxDuration (300s) do consumer, como o orçamento de um disparo isolado.
export const CAMPAIGN_DISPATCH_SEND_BATCH_BUDGET_MS = 240_000;
// Um disparo novo só começa se sobrar ao menos isto: o disparo recebe o prazo do lote e, se não
// terminar, publica a própria continuação — mas começar no último segundo só gera continuação.
const START_MARGIN_MS = 30_000;
// Dois disparos de cada vez: ~4 conexões cada no início do envio, dentro do pool de 10.
const BATCH_CONCURRENCY = 2;

export type TCampaignDispatchSendBatchResult = {
	completed: string[];
	failed: { dispatchId: string; error: unknown }[];
	continued: string[];
};

export async function runCampaignDispatchSendBatch({
	dispatchIds,
	worker,
	runOne,
	publishContinuation,
	now = Date.now,
	budgetMs = CAMPAIGN_DISPATCH_SEND_BATCH_BUDGET_MS,
	concurrency = BATCH_CONCURRENCY,
}: {
	dispatchIds: string[];
	worker?: number;
	runOne: (input: { dispatchId: string; worker?: number; deadlineAt: number }) => Promise<unknown>;
	publishContinuation: (dispatchIds: string[]) => Promise<unknown>;
	now?: () => number;
	budgetMs?: number;
	concurrency?: number;
}): Promise<TCampaignDispatchSendBatchResult> {
	const deadlineAt = now() + budgetMs;
	const result: TCampaignDispatchSendBatchResult = { completed: [], failed: [], continued: [] };
	let nextIndex = 0;
	let outOfTime = false;

	async function lane() {
		while (nextIndex < dispatchIds.length) {
			// Um lote de um disparo sempre roda: é o caminho da mensagem simples.
			if (nextIndex > 0 && now() > deadlineAt - START_MARGIN_MS) {
				outOfTime = true;
				return;
			}
			const dispatchId = dispatchIds[nextIndex];
			nextIndex += 1;
			try {
				await runOne({ dispatchId, worker, deadlineAt });
				result.completed.push(dispatchId);
			} catch (error) {
				result.failed.push({ dispatchId, error });
			}
		}
	}

	await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, dispatchIds.length)) }, () => lane()));

	if (outOfTime && nextIndex < dispatchIds.length) {
		result.continued = dispatchIds.slice(nextIndex);
		// Se a continuação falhar, a exceção sobe e a fila reentrega o lote inteiro: os concluídos
		// recuam e os restantes rodam de novo.
		await publishContinuation(result.continued);
	}
	return result;
}

/** Erro que faz a fila reentregar o lote; nomeia os disparos que falharam. */
export function buildCampaignDispatchSendBatchError(failed: TCampaignDispatchSendBatchResult["failed"]) {
	const ids = failed.map((failure) => failure.dispatchId).join(", ");
	return new Error(`Falha em ${failed.length} disparo(s) do lote: ${ids}.`, { cause: failed[0]?.error });
}
