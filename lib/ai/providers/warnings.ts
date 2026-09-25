import type { LogWarningsFunction, Warning } from "ai";

/**
 * Logger de avisos do AI SDK, registrado em `instrumentation.ts`.
 *
 * O padrão do SDK passa por `process.emitWarning`, que em produção vira três linhas por aviso
 * ("(node:4) Warning: ...", a dica do `--trace-warnings` e o banner do `AI_SDK_LOG_WARNINGS`)
 * e emite o mesmo aviso a cada chamada de modelo. Aqui cada aviso vira uma linha com o prefixo
 * do módulo, no mesmo formato dos outros logs do agente, e os avisos que descrevem um
 * comportamento conhecido e aceito são descartados — o que sobra é sinal.
 */

/**
 * Avisos que descrevem um comportamento esperado do modelo escolhido, não um problema.
 *
 * `responseFormat JSON schema` em modo de compatibilidade: o AI Gateway injeta o JSON schema no
 * system prompt quando o modelo não expõe `response_format: json_schema` nativo (DeepSeek, entre
 * outros). O resultado continua validado pelo Zod em `Output.object`, e um formato inválido cai
 * no modelo de resgate (`STRUCTURED_OUTPUT_FALLBACK_MODEL`). Como o DeepSeek V4 Pro é o modelo
 * recomendado do catálogo, o aviso apareceria duas vezes em todo turno de atendimento.
 */
export function isExpectedAiSdkWarning(warning: Warning): boolean {
	return warning.type === "compatibility" && warning.feature === "responseFormat JSON schema";
}

export function formatAiSdkWarning(warning: Warning, { provider, model }: { provider?: string; model?: string }): string {
	const scope = provider && model ? ` (${provider} / ${model})` : "";
	switch (warning.type) {
		case "unsupported":
			return `[AI_SDK]${scope} Recurso "${warning.feature}" não suportado pelo modelo.${warning.details ? ` ${warning.details}` : ""}`;
		case "compatibility":
			return `[AI_SDK]${scope} Recurso "${warning.feature}" em modo de compatibilidade.${warning.details ? ` ${warning.details}` : ""}`;
		case "deprecated":
			return `[AI_SDK]${scope} Uso depreciado de ${warning.setting}.${warning.message ? ` ${warning.message}` : ""}`;
		default:
			return `[AI_SDK]${scope} ${JSON.stringify(warning)}`;
	}
}

export const logAiSdkWarnings: LogWarningsFunction = ({ warnings, provider, model }) => {
	for (const warning of warnings) {
		if (isExpectedAiSdkWarning(warning)) continue;
		console.warn(formatAiSdkWarning(warning, { provider, model }));
	}
};

/**
 * Idempotente: `register()` do Next roda uma vez por instância do servidor, mas scripts e testes
 * podem chamar de novo sem efeito colateral.
 */
export function registerAiSdkWarningLogger() {
	globalThis.AI_SDK_LOG_WARNINGS = logAiSdkWarnings;
}
