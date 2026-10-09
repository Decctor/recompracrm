import { DEFAULT_AI_AGENT_MODEL } from "@/schemas/ai-agents";

/**
 * Aliases de modelo. A configuração do agente guarda o alias (ou um id concreto), e a
 * resolução para o id do AI Gateway acontece aqui — trocar o modelo por trás de um alias
 * não exige tocar em nenhuma configuração persistida.
 */
export const AI_MODEL_ALIASES = {
	"agent-default": DEFAULT_AI_AGENT_MODEL,
	"agent-fast": DEFAULT_AI_AGENT_MODEL,
} as const;

export type TAiModelAlias = keyof typeof AI_MODEL_ALIASES;

function isAlias(value: string): value is TAiModelAlias {
	return value in AI_MODEL_ALIASES;
}

/**
 * Normaliza para o formato `provider/modelo` que o AI Gateway espera. Aceita aliases e ids
 * sem provider (`"gpt-5"` → `"openai/gpt-5"`), porque configurações antigas e digitação
 * manual não deveriam quebrar uma execução.
 */
export function resolveLanguageModelId(modelo: string | undefined | null): string {
	const value = modelo?.trim();
	if (!value) return DEFAULT_AI_AGENT_MODEL;
	if (isAlias(value)) return AI_MODEL_ALIASES[value];
	if (!value.includes("/")) return `openai/${value}`;
	return value;
}
