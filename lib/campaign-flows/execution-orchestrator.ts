import type { TFilterTree } from "@/schemas/campaign-audiences";
import { db, type DBTransaction } from "@/services/drizzle";
import {
	campaignAudiences,
	campaignFlowExecutions,
	campaignFlowExecutionSteps,
	campaignFlows,
} from "@/services/drizzle/schema";
import type { TCampaignFlowEntity } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { resolveAudience } from "./audience-resolver";
import { type FlowGraph, type NodeResult, getNextNodeId, loadFlowGraph, validateFlowGraph } from "./graph-utils";
import { processNode } from "./node-processors";

// ============================================================================
// TYPES
// ============================================================================

type TriggerFlowParams = {
	campanhaId: string;
	organizacaoId: string;
	clienteId: string;
	eventoTipo: string;
	eventoMetadados?: Record<string, unknown>;
};

type TriggerBatchFlowParams = {
	campanhaId: string;
	organizacaoId: string;
};

export type FlowRunResult = {
	executionId: string;
	status: "CONCLUIDA" | "FALHOU" | "CANCELADA";
	stepsProcessed: number;
	erro?: string;
};

// ============================================================================
// INDIVIDUAL EXECUTION (event-triggered)
// ============================================================================

/**
 * Triggers a campaign flow for a single client (event-driven campaigns).
 * Creates an execution record and walks the graph.
 */
export async function triggerFlowForClient({
	campanhaId,
	organizacaoId,
	clienteId,
	eventoTipo,
	eventoMetadados,
}: TriggerFlowParams): Promise<FlowRunResult> {
	// Create execution record
	const [execution] = await db
		.insert(campaignFlowExecutions)
		.values({
			campanhaId,
			organizacaoId,
			tipo: "INDIVIDUAL",
			clienteId,
			eventoTipo,
			eventoMetadados,
			status: "EM_EXECUCAO",
			dataInicio: new Date(),
		})
		.returning({ id: campaignFlowExecutions.id });

	return executeFlowForClient({
		executionId: execution.id,
		campanhaId,
		organizacaoId,
		clienteId,
		eventoMetadados,
	});
}

/**
 * Walks the flow graph for a single client within an existing execution.
 * This is the core execution loop.
 */
export async function executeFlowForClient({
	executionId,
	campanhaId,
	organizacaoId,
	clienteId,
	eventoMetadados,
}: {
	executionId: string;
	campanhaId: string;
	organizacaoId: string;
	clienteId: string;
	eventoMetadados?: Record<string, unknown> | null;
}): Promise<FlowRunResult> {
	let stepsProcessed = 0;

	try {
		const graph = await loadFlowGraph({ tx: db, campanhaId });
		const entryNode = graph.getEntryNode();

		if (!entryNode) {
			await markExecutionFailed(executionId, "Nó gatilho não encontrado.");
			return { executionId, status: "FALHOU", stepsProcessed, erro: "Nó gatilho não encontrado." };
		}

		let currentNodeId: string | null = entryNode.id;

		while (currentNodeId) {
			const node = graph.getNode(currentNodeId);
			if (!node) {
				await markExecutionFailed(executionId, `Nó ${currentNodeId} não encontrado no grafo.`);
				return { executionId, status: "FALHOU", stepsProcessed, erro: `Nó ${currentNodeId} não encontrado.` };
			}

			// Create step record
			const [step] = await db
				.insert(campaignFlowExecutionSteps)
				.values({
					execucaoId: executionId,
					noId: currentNodeId,
					clienteId,
					status: "EM_EXECUCAO",
					dataInicio: new Date(),
				})
				.returning({ id: campaignFlowExecutionSteps.id });

			// Process node
			const result = await processNode({
				tx: db,
				node,
				clienteId,
				executionId,
				campanhaId,
				organizacaoId,
				eventoMetadados,
			});

			stepsProcessed++;

			// Handle DELAY nodes — return early with AGUARDANDO_DELAY status
			// The Vercel Workflow runner will call context.sleep() and then resume.
			if (node.tipo === "DELAY" && result.sucesso) {
				await db
					.update(campaignFlowExecutionSteps)
					.set({
						status: "AGUARDANDO_DELAY",
						resultado: result.dados,
						delayAte: result.dados?.sleepMs
							? new Date(Date.now() + (result.dados.sleepMs as number))
							: null,
					})
					.where(eq(campaignFlowExecutionSteps.id, step.id));

				// Return the delay info — the caller (Vercel Workflow) handles the wait
				return {
					executionId,
					status: "CONCLUIDA", // Not really done, but the delay step is handled externally
					stepsProcessed,
				};
			}

			// Update step status
			const stepStatus = result.pulado ? "PULADO" : result.sucesso ? "CONCLUIDO" : "FALHOU";
			await db
				.update(campaignFlowExecutionSteps)
				.set({
					status: stepStatus,
					resultado: result.dados ?? result,
					erro: result.erro,
					dataConclusao: new Date(),
				})
				.where(eq(campaignFlowExecutionSteps.id, step.id));

			// If failed or filtered out, stop
			if (!result.sucesso || result.pulado) {
				const finalStatus = result.pulado ? "CONCLUIDA" : "FALHOU";
				await markExecutionCompleted(executionId, finalStatus, result.erro);
				return {
					executionId,
					status: finalStatus,
					stepsProcessed,
					erro: result.erro,
				};
			}

			// Determine next node
			currentNodeId = getNextNodeId(graph, currentNodeId, result);
		}

		// All nodes processed
		await markExecutionCompleted(executionId, "CONCLUIDA");
		return { executionId, status: "CONCLUIDA", stepsProcessed };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
		console.error(`[CAMPAIGN_FLOW] Execution ${executionId} failed:`, error);
		await markExecutionFailed(executionId, errorMessage);
		return { executionId, status: "FALHOU", stepsProcessed, erro: errorMessage };
	}
}

// ============================================================================
// BATCH EXECUTION (recurrent / one-time)
// ============================================================================

/**
 * Triggers a campaign flow for all matching clients (recurrent or one-time).
 * Creates a batch execution and fans out to individual client runs.
 */
export async function triggerBatchFlow({
	campanhaId,
	organizacaoId,
}: TriggerBatchFlowParams): Promise<{
	executionId: string;
	totalClients: number;
}> {
	// Load campaign to get audience
	const campaign = await db.query.campaignFlows.findFirst({
		where: eq(campaignFlows.id, campanhaId),
	});

	if (!campaign) throw new Error(`Campaign flow ${campanhaId} não encontrado.`);

	// Resolve audience
	let clientIds: string[];
	if (campaign.publicoId) {
		const audience = await db.query.campaignAudiences.findFirst({
			where: eq(campaignAudiences.id, campaign.publicoId),
		});

		if (audience) {
			clientIds = await resolveAudience({
				tx: db,
				organizacaoId,
				filtros: audience.filtros as TFilterTree,
			});
		} else {
			clientIds = [];
		}
	} else {
		// No audience filter — all clients
		const allClients = await db.query.clients.findMany({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizacaoId),
			columns: { id: true },
		});
		clientIds = allClients.map((c) => c.id);
	}

	// Create batch execution
	const [execution] = await db
		.insert(campaignFlowExecutions)
		.values({
			campanhaId,
			organizacaoId,
			tipo: "LOTE",
			status: "EM_EXECUCAO",
			loteTotalClientes: clientIds.length,
			loteClientesProcessados: 0,
			dataInicio: new Date(),
		})
		.returning({ id: campaignFlowExecutions.id });

	return {
		executionId: execution.id,
		totalClients: clientIds.length,
	};
}

/**
 * Returns the list of client IDs that should be processed in a batch execution.
 * Useful for the Vercel Workflow runner to fan out.
 */
export async function getBatchClientIds({
	campanhaId,
	organizacaoId,
}: {
	campanhaId: string;
	organizacaoId: string;
}): Promise<string[]> {
	const campaign = await db.query.campaignFlows.findFirst({
		where: eq(campaignFlows.id, campanhaId),
	});

	if (!campaign) return [];

	if (campaign.publicoId) {
		const audience = await db.query.campaignAudiences.findFirst({
			where: eq(campaignAudiences.id, campaign.publicoId),
		});

		if (audience) {
			return resolveAudience({
				tx: db,
				organizacaoId,
				filtros: audience.filtros as TFilterTree,
			});
		}
		return [];
	}

	const allClients = await db.query.clients.findMany({
		where: (fields, { eq }) => eq(fields.organizacaoId, organizacaoId),
		columns: { id: true },
	});
	return allClients.map((c) => c.id);
}

// ============================================================================
// EVENT TRIGGER MATCHING
// ============================================================================

/**
 * Finds active campaign flows that match a given trigger event type.
 * Used by point-of-interaction and cron routes.
 */
export async function getActiveCampaignFlowsByTrigger({
	tx,
	organizacaoId,
	gatilhoSubtipo,
}: {
	tx: DBTransaction;
	organizacaoId: string;
	gatilhoSubtipo: string;
}): Promise<
	(TCampaignFlowEntity & {
		gatilhoConfig: Record<string, unknown>;
	})[]
> {
	// Get active event-driven campaign flows for this organization
	const flows = await tx.query.campaignFlows.findMany({
		where: and(eq(campaignFlows.organizacaoId, organizacaoId), eq(campaignFlows.status, "ATIVO"), eq(campaignFlows.tipo, "EVENTO")),
		with: { nos: true },
	});

	// Filter to campaigns whose trigger node matches the requested event type
	return flows
		.map((flow) => {
			const triggerNode = flow.nos.find((n) => n.tipo === "GATILHO" && n.subtipo === gatilhoSubtipo);
			if (!triggerNode) return null;
			return {
				...flow,
				gatilhoConfig: triggerNode.configuracao as Record<string, unknown>,
			};
		})
		.filter((f): f is NonNullable<typeof f> => f !== null);
}

// ============================================================================
// TRIGGER VALIDATION
// ============================================================================

/**
 * Validates whether a trigger should fire based on event data and trigger config.
 * E.g., NOVA-COMPRA with valorMinimo check.
 */
export function shouldTriggerFire({
	gatilhoSubtipo,
	gatilhoConfig,
	eventoMetadados,
}: {
	gatilhoSubtipo: string;
	gatilhoConfig: Record<string, unknown>;
	eventoMetadados: Record<string, unknown>;
}): boolean {
	switch (gatilhoSubtipo) {
		case "NOVA-COMPRA": {
			const valorMinimo = gatilhoConfig.valorMinimo as number | undefined;
			if (valorMinimo != null) {
				const saleValue = eventoMetadados.valor as number;
				return saleValue >= valorMinimo;
			}
			return true;
		}

		case "PRIMEIRA-COMPRA":
			return true;

		case "CASHBACK-ACUMULADO": {
			const valorMinimoNovo = gatilhoConfig.valorMinimoNovo as number | undefined;
			const valorMinimoTotal = gatilhoConfig.valorMinimoTotal as number | undefined;
			const novoCashback = eventoMetadados.novoCashback as number;
			const totalCashback = eventoMetadados.totalCashback as number;

			if (valorMinimoNovo != null && novoCashback < valorMinimoNovo) return false;
			if (valorMinimoTotal != null && totalCashback < valorMinimoTotal) return false;
			return true;
		}

		case "QUANTIDADE-TOTAL-COMPRAS": {
			const quantidade = gatilhoConfig.quantidade as number;
			const totalCompras = eventoMetadados.totalCompras as number;
			return totalCompras >= quantidade;
		}

		case "VALOR-TOTAL-COMPRAS": {
			const valor = gatilhoConfig.valor as number;
			const valorTotal = eventoMetadados.valorTotalCompras as number;
			return valorTotal >= valor;
		}

		case "ENTRADA-SEGMENTACAO":
		case "PERMANENCIA-SEGMENTACAO": {
			const segmentos = gatilhoConfig.segmentos as string[];
			const segmentoAtual = eventoMetadados.segmentoAtual as string;
			return segmentos?.includes(segmentoAtual) ?? false;
		}

		case "CASHBACK-EXPIRANDO":
		case "ANIVERSARIO-CLIENTE":
		case "INICIO-RECORRENTE":
		case "INICIO-UNICO":
			return true;

		default:
			return false;
	}
}

// ============================================================================
// HELPERS
// ============================================================================

async function markExecutionCompleted(executionId: string, status: "CONCLUIDA" | "FALHOU" | "CANCELADA", erro?: string) {
	await db
		.update(campaignFlowExecutions)
		.set({
			status,
			dataConclusao: new Date(),
			erro: erro ?? null,
		})
		.where(eq(campaignFlowExecutions.id, executionId));
}

async function markExecutionFailed(executionId: string, erro: string) {
	await markExecutionCompleted(executionId, "FALHOU", erro);
}

/**
 * Updates batch execution progress counter.
 */
export async function incrementBatchProgress(executionId: string) {
	await db
		.update(campaignFlowExecutions)
		.set({
			loteClientesProcessados: sql`${campaignFlowExecutions.loteClientesProcessados} + 1`,
		})
		.where(eq(campaignFlowExecutions.id, executionId));
}
