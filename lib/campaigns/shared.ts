import { type ImmediateProcessingData, processOrganizationInteractionsBatch } from "@/lib/interactions";
import type { TCampaignWeeklyLimitCache } from "@/lib/interactions/campaign-weekly-limits";
import { db } from "@/services/drizzle";

export const IMMEDIATE_PROCESSING_CONCURRENCY = 5;
// Insertions are chunked so each transaction stays short and stays under Postgres'
// 65535 bind-parameter limit (interactions: ~8 columns, cashback: ~13 columns per row).
export const ENQUEUE_CHUNK_SIZE = 1000;
export const MAX_ENQUEUE_ATTEMPTS = 3;
export const ENQUEUE_RETRY_BASE_DELAY_MS = 250;

export type TEnqueuedCampaignInteraction = { id: string; clienteId: string };

export function chunkArray<T>(array: T[], size: number): T[][] {
	if (size <= 0) return [array];

	const chunks: T[][] = [];
	for (let index = 0; index < array.length; index += size) {
		chunks.push(array.slice(index, index + size));
	}

	return chunks;
}

export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getEnqueueErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Erro desconhecido ao enfileirar interações.";
}

// Executes an enqueue attempt with bounded retries and exponential backoff. Never throws:
// callers decide what to do with the failed chunk (mark clients as failed, notify, etc.).
export async function enqueueChunkWithRetries<T>({
	enqueue,
	logPrefix,
}: {
	enqueue: () => Promise<T>;
	logPrefix: string;
}): Promise<{ success: true; result: T } | { success: false; error: string }> {
	let lastError: unknown = null;

	for (let attempt = 1; attempt <= MAX_ENQUEUE_ATTEMPTS; attempt += 1) {
		try {
			return { success: true, result: await enqueue() };
		} catch (error) {
			lastError = error;
			console.error(`${logPrefix} Enqueue attempt ${attempt} failed:`, getEnqueueErrorMessage(error));
			if (attempt < MAX_ENQUEUE_ATTEMPTS) {
				await sleep(ENQUEUE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
			}
		}
	}

	return { success: false, error: getEnqueueErrorMessage(lastError) };
}

type TProcessEnqueuedChunkImmediateInteractionsParams = {
	organizationId: string;
	inserted: TEnqueuedCampaignInteraction[];
	campaign: ImmediateProcessingData["campaign"];
	whatsappToken?: string;
	whatsappSessionId?: string;
	weeklyLimitCache: TCampaignWeeklyLimitCache;
	logTag: string;
	sendConcurrency?: number;
	// Metadados de contexto por cliente, gravados na interação no enfileiramento. O caminho de
	// drenagem (cron process-interactions) lê `interactions.metadados` do banco, mas o envio
	// imediato roda em memória logo após o insert — sem repassar aqui, as variáveis de contexto
	// renderizariam vazias justamente nos disparos imediatos.
	contextMetadadosByClientId?: Map<string, ImmediateProcessingData["contextMetadados"]>;
};

export type TProcessEnqueuedChunkImmediateInteractionsResult = {
	queuedForImmediateProcessing: number;
	missingClientData: number;
};

// Immediately processes a chunk of freshly enqueued campaign interactions: loads the clients'
// message-variable data, builds the immediate-processing payloads and delegates to
// processOrganizationInteractionsBatch. Shared by the single-use and recurrent campaign crons.
export async function processEnqueuedChunkImmediateInteractions({
	organizationId,
	inserted,
	campaign,
	whatsappToken,
	whatsappSessionId,
	weeklyLimitCache,
	logTag,
	sendConcurrency = IMMEDIATE_PROCESSING_CONCURRENCY,
	contextMetadadosByClientId,
}: TProcessEnqueuedChunkImmediateInteractionsParams): Promise<TProcessEnqueuedChunkImmediateInteractionsResult> {
	const clientIds = inserted.map((row) => row.clienteId);
	const clientsData = await db.query.clients.findMany({
		where: (fields, { inArray: inArrayFilter }) => inArrayFilter(fields.id, clientIds),
		columns: {
			id: true,
			nome: true,
			telefone: true,
			email: true,
			analiseRFMTitulo: true,
			metadataProdutoMaisCompradoId: true,
			metadataGrupoProdutoMaisComprado: true,
			metadataProdutoSugeridoId: true,
		},
	});
	const clientDataById = new Map(clientsData.map((client) => [client.id, client]));

	let missingClientData = 0;
	const immediateProcessingDataList: ImmediateProcessingData[] = [];
	for (const row of inserted) {
		const clientData = clientDataById.get(row.clienteId);
		if (!clientData) {
			missingClientData += 1;
			continue;
		}

		immediateProcessingDataList.push({
			interactionId: row.id,
			organizationId,
			client: {
				id: clientData.id,
				nome: clientData.nome,
				telefone: clientData.telefone,
				email: clientData.email,
				analiseRFMTitulo: clientData.analiseRFMTitulo,
				metadataProdutoMaisCompradoId: clientData.metadataProdutoMaisCompradoId,
				metadataGrupoProdutoMaisComprado: clientData.metadataGrupoProdutoMaisComprado,
				metadataProdutoSugeridoId: clientData.metadataProdutoSugeridoId,
			},
			campaign,
			whatsappToken,
			whatsappSessionId,
			contextMetadados: contextMetadadosByClientId?.get(row.clienteId),
		});
	}

	if (immediateProcessingDataList.length === 0) {
		return { queuedForImmediateProcessing: 0, missingClientData };
	}

	console.log(`[ORG: ${organizationId}] [INFO] [${logTag}] Processing ${immediateProcessingDataList.length} immediate interactions`);
	const processingSummary = await processOrganizationInteractionsBatch({
		organizationId,
		interactions: immediateProcessingDataList,
		sendConcurrency,
		weeklyLimitCache,
	});

	if (processingSummary.failed > 0 || processingSummary.blocked > 0) {
		for (const failedResult of processingSummary.results.filter((itemResult) => !itemResult.success)) {
			console.error(`[${logTag}] Failed to process interaction ${failedResult.interactionId}:`, failedResult.error);
		}
	}

	console.log(`[ORG: ${organizationId}] [INFO] [${logTag}] Immediate interactions processed`, {
		total: processingSummary.total,
		succeeded: processingSummary.sent + processingSummary.queued,
		failed: processingSummary.failed,
		claimed: processingSummary.claimed,
		blocked: processingSummary.blocked,
		durationMs: processingSummary.durationMs,
	});

	return { queuedForImmediateProcessing: immediateProcessingDataList.length, missingClientData };
}
