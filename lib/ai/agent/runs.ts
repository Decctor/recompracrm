import { parseJsonbWithFallback } from "@/lib/ai/shared/json";
import { AiAgentCapabilitiesSchema, AiAgentModelConfigSchema, type TAiAgentConfigSnapshot, type TAiAgentUsage } from "@/schemas/ai-agents";
import type { TAiAgentRunTriggerEnum } from "@/schemas/enums";
import type { DB, DBTransaction } from "@/services/drizzle";
import { type TAiAgentEntity, aiAgentRuns } from "@/services/drizzle/schema";
import { and, count, eq, gte, isNotNull, ne, or } from "drizzle-orm";

type TDb = DB | DBTransaction;

/** Ciclo de vida de uma execução do agente. Toda transição de status passa por aqui. */

export async function createAgentRun(
	db: TDb,
	input: {
		organizacaoId: string;
		agenteId: string;
		gatilho: TAiAgentRunTriggerEnum;
		chatId: string;
		clienteId: string;
		mensagemGatilhoId?: string | null;
		configSnapshot: TAiAgentConfigSnapshot;
		contextoEntradaSnapshot?: unknown;
	},
) {
	const [run] = await db
		.insert(aiAgentRuns)
		.values({
			organizacaoId: input.organizacaoId,
			agenteId: input.agenteId,
			status: "PENDENTE",
			gatilho: input.gatilho,
			chatId: input.chatId,
			clienteId: input.clienteId,
			mensagemGatilhoId: input.mensagemGatilhoId ?? null,
			configSnapshot: input.configSnapshot,
			contextoEntradaSnapshot: input.contextoEntradaSnapshot ?? null,
		})
		.returning({ id: aiAgentRuns.id });

	if (!run) throw new Error("Erro ao registrar a execução do agente.");
	return run;
}

export async function markAgentRunRunning(db: TDb, runId: string) {
	await db.update(aiAgentRuns).set({ status: "RODANDO", dataInicio: new Date() }).where(eq(aiAgentRuns.id, runId));
}

export async function completeAgentRun(db: TDb, input: { runId: string; outputResumo?: string | null; uso?: TAiAgentUsage | null }) {
	await db
		.update(aiAgentRuns)
		.set({ status: "CONCLUIDO", outputResumo: input.outputResumo ?? null, uso: input.uso ?? null, dataFim: new Date() })
		.where(eq(aiAgentRuns.id, input.runId));
}

export async function failAgentRun(db: TDb, input: { runId: string; erro: string }) {
	await db.update(aiAgentRuns).set({ status: "FALHA", erro: input.erro, dataFim: new Date() }).where(eq(aiAgentRuns.id, input.runId));
}

/**
 * Run supersedida: o turno terminou, mas a revalidação pré-entrega abortou o envio.
 * Sobrescreve o CONCLUIDO do turno de propósito — o estado final relevante é "não
 * entregue", e `uso` preserva o custo já gasto.
 */
export async function markAgentRunCancelled(db: TDb, input: { runId: string; reason: string }) {
	await db.update(aiAgentRuns).set({ status: "CANCELADO", erro: input.reason, dataFim: new Date() }).where(eq(aiAgentRuns.id, input.runId));
}

/**
 * Snapshot da configuração sem a base de conhecimento: para runs que não chegam a montar o
 * contexto (triagem, turno pulado). O que importa nelas é *por que* não houve turno.
 */
export function snapshotAgentConfigWithoutKnowledge(
	agent: Pick<TAiAgentEntity, "instrucoes" | "modeloConfig" | "capacidades">,
): TAiAgentConfigSnapshot {
	return {
		instrucoes: agent.instrucoes,
		modeloConfig: parseJsonbWithFallback(AiAgentModelConfigSchema, agent.modeloConfig),
		capacidades: parseJsonbWithFallback(AiAgentCapabilitiesSchema, agent.capacidades),
		conhecimento: [],
	};
}

/**
 * Turno pulado antes de abrir a execução: fica uma run CANCELADO com o motivo em `erro`.
 *
 * Antes o turno só deixava um `console.log`, e uma pergunta que a IA decidiu não responder não
 * tinha linha nenhuma em `ai_agent_runs` — indistinguível de um webhook que nunca chegou. Sem
 * `dataInicio`: nunca rodou, e por isso não conta no teto diário (`countAgentRunsToday`).
 */
export async function recordSkippedAgentRun(
	db: TDb,
	input: {
		organizacaoId: string;
		agent: Pick<TAiAgentEntity, "id" | "instrucoes" | "modeloConfig" | "capacidades">;
		gatilho: TAiAgentRunTriggerEnum;
		chatId: string;
		clienteId: string | null;
		mensagemGatilhoId: string | null;
		reason: string;
	},
) {
	const [run] = await db
		.insert(aiAgentRuns)
		.values({
			organizacaoId: input.organizacaoId,
			agenteId: input.agent.id,
			status: "CANCELADO",
			gatilho: input.gatilho,
			chatId: input.chatId,
			clienteId: input.clienteId,
			mensagemGatilhoId: input.mensagemGatilhoId,
			configSnapshot: snapshotAgentConfigWithoutKnowledge(input.agent),
			erro: input.reason,
			dataFim: new Date(),
		})
		.returning({ id: aiAgentRuns.id });
	return run ?? null;
}

/** Vínculo canônico execução → mensagem entregue ao cliente. */
export async function linkAgentRunMessage(db: TDb, input: { runId: string; mensagemId: string }) {
	await db.update(aiAgentRuns).set({ mensagemEnviadaId: input.mensagemId }).where(eq(aiAgentRuns.id, input.runId));
}

/** Freio de custo por organização (`capacidades.limites.maxRunsDiarios`). */
export async function countAgentRunsToday(db: TDb, organizacaoId: string): Promise<number> {
	const inicioDoDia = new Date();
	inicioDoDia.setHours(0, 0, 0, 0);

	const [row] = await db
		.select({ total: count() })
		.from(aiAgentRuns)
		.where(
			and(
				eq(aiAgentRuns.organizacaoId, organizacaoId),
				gte(aiAgentRuns.dataInsercao, inicioDoDia),
				// Turno pulado antes de rodar (`recordSkippedAgentRun`) não gastou nada: não consome o teto.
				or(ne(aiAgentRuns.status, "CANCELADO"), isNotNull(aiAgentRuns.dataInicio)),
			),
		);

	return Number(row?.total ?? 0);
}
