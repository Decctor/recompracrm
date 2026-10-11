import { isAgentError } from "@/lib/ai/shared/errors";

/**
 * Motivo gravado em `transferencia_motivo` quando o turno morre antes de a IA gerar qualquer
 * coisa e o atendimento volta para a fila. Constante de dados: aparece no histórico do ticket.
 */
export const AI_PRE_RUN_FAILURE_RELEASE_REASON = "IA_INDISPONIVEL_ANTES_DA_EXECUCAO";

/**
 * Erros que `prepareAgentExecution` lança **antes** de criar a linha em `ai_agent_runs`: agente
 * ausente/pausado, teto diário de execuções e teto mensal de gasto. Nenhum deles deixa rastro de
 * run, então ninguém além do runner sabe que o turno morreu.
 */
const PRE_RUN_ERROR_NAMES = ["AgentInactiveError", "AgentDailyRunLimitError", "AgentSpendLimitError"] as const;

export function isPreRunAgentError(error: unknown): boolean {
	return PRE_RUN_ERROR_NAMES.some((name) => isAgentError(error, name));
}

/**
 * O runner deve devolver o atendimento à fila depois desta falha?
 *
 * Só quando (1) este turno foi quem tirou o ticket da fila (`freshClaim`) e (2) a falha é de
 * pré-execução. Sem (1) liberaríamos um episódio que o agente já conduzia, apagando uma posse
 * legítima; sem (2) uma falha no meio da run já tem a run FALHA registrada e o hub a mostra.
 * Sem esta devolução o ticket ficava `AGENTE` para sempre e ninguém respondia ao cliente.
 */
export function shouldReleaseAfterPreRunFailure(input: { freshClaim: boolean; error: unknown }): boolean {
	return input.freshClaim && isPreRunAgentError(input.error);
}
