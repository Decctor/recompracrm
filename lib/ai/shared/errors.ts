/**
 * Erros tipados do módulo de agentes. São discriminados por `name` (não `instanceof`), que
 * sobrevive a boundaries de bundle e serialização.
 */

/** Agente ausente, `PAUSADO`, ou com configuração inválida. */
export class AgentInactiveError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentInactiveError";
	}
}

/** Freio de custo: a organização estourou `capacidades.limites.maxRunsDiarios`. */
export class AgentDailyRunLimitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentDailyRunLimitError";
	}
}

/** O modelo tentou uma ferramenta que as capacidades do agente não permitem. */
export class AgentToolNotEnabledError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentToolNotEnabledError";
	}
}

/** Falha na execução de uma ferramenta. */
export class AgentToolExecutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentToolExecutionError";
	}
}

/**
 * A run foi abortada no meio porque a conversa a superou (nova mensagem do cliente, resposta de
 * um humano, atendimento tomado). Não é falha: o run fica CANCELADO com o motivo.
 */
export class AgentRunAbortedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentRunAbortedError";
	}
}

export function isAgentError(error: unknown, name: string): boolean {
	return error instanceof Error && error.name === name;
}

/** Campos que o driver do Postgres anexa ao erro e que dizem o que de fato quebrou. */
const POSTGRES_ERROR_FIELDS = ["code", "detail", "hint", "constraint", "column", "table", "routine"] as const;

function describeErrorLayer(error: Error): string {
	const record = error as unknown as Record<string, unknown>;
	const fields = POSTGRES_ERROR_FIELDS.filter((field) => typeof record[field] === "string" && record[field] !== "").map(
		(field) => `${field}=${record[field]}`,
	);
	return fields.length > 0 ? `${error.message} (${fields.join(", ")})` : error.message;
}

/**
 * Serializa um erro **com sua cadeia de causas** para persistir em `ai_agent_tool_calls.erro`.
 *
 * O Drizzle embrulha a falha do banco em "Failed query: <SQL> params: ...", que diz o que foi
 * tentado mas não o que deu errado — a mensagem real do Postgres ("missing FROM-clause entry",
 * um code 42P01) vive em `error.cause`. Sem esta função o diagnóstico de uma tool call quebrada
 * exige reproduzir a query à mão, que foi exatamente o custo do bug de correlação do EXISTS.
 */
export function formatAgentErrorChain(error: unknown, maxDepth = 3): string {
	if (!(error instanceof Error)) return String(error);

	const layers = [describeErrorLayer(error)];
	let cause: unknown = error.cause;
	while (cause instanceof Error && layers.length <= maxDepth) {
		layers.push(`causa: ${describeErrorLayer(cause)}`);
		cause = cause.cause;
	}
	if (cause !== undefined && cause !== null && !(cause instanceof Error)) layers.push(`causa: ${String(cause)}`);

	return layers.join(" | ");
}
