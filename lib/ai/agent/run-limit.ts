import type { DB, DBTransaction } from "@/services/drizzle";
import { countAgentRunsToday } from "./runs";

/**
 * Teto diário de execuções do agente (`capacidades.limites.maxRunsDiarios`).
 *
 * Uma só definição para dois chamadores: `prepareAgentExecution` (que lança
 * `AgentDailyRunLimitError`) e `resolveAiAssignmentAvailability` (que avisa o hub antes de
 * entregar a conversa a um agente que o runtime vai recusar). Duplicar a consulta deixaria as
 * duas bocas discordarem sobre o que é "dia" e sobre o `>=`.
 */
export async function getAgentDailyRunLimitState(
	db: DB | DBTransaction,
	input: { organizacaoId: string; maxRunsDiarios: number },
): Promise<{ reached: boolean; runsToday: number }> {
	const runsToday = await countAgentRunsToday(db, input.organizacaoId);
	return { reached: runsToday >= input.maxRunsDiarios, runsToday };
}
