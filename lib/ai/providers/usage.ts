import type { TAiAgentUsage } from "@/schemas/ai-agents";
import type { LanguageModelUsage } from "ai";
import { estimateRunCostUsd } from "./pricing";

/**
 * Converte o uso reportado pelo AI SDK para o formato persistido em `ai_agent_runs.uso`.
 *
 * Uma run pode passar por mais de um modelo (fallback de saída estruturada): cada trecho chega
 * com o modelo que o executou, os tokens são somados e o custo é estimado por trecho com o preço
 * daquele modelo. O total é recalculado quando o provider não o informa, para que a soma de
 * tokens da organização nunca dependa de um campo opcional.
 */
export type TAiUsageSegment = { modelo: string; usage: Partial<LanguageModelUsage> | undefined };

function sumDefined(values: Array<number | undefined>): number | undefined {
	const defined = values.filter((value): value is number => typeof value === "number");
	return defined.length > 0 ? defined.reduce((total, value) => total + value, 0) : undefined;
}

export function normalizeAiUsage(segments: TAiUsageSegment[]): TAiAgentUsage | null {
	if (segments.length === 0) return null;

	const usages = segments.map((segment) => segment.usage).filter((usage): usage is Partial<LanguageModelUsage> => usage !== undefined);
	const modelos = [...new Set(segments.map((segment) => segment.modelo))];
	const modelo = modelos.join(" -> ");

	if (usages.length === 0) return { modelo, modelos };

	const tokensEntrada = sumDefined(usages.map((usage) => usage.inputTokens));
	const tokensSaida = sumDefined(usages.map((usage) => usage.outputTokens));
	const reportedTotal = sumDefined(usages.map((usage) => usage.totalTokens));
	const tokensTotal =
		reportedTotal ?? (typeof tokensEntrada === "number" || typeof tokensSaida === "number" ? (tokensEntrada ?? 0) + (tokensSaida ?? 0) : undefined);
	const tokensEntradaCache = sumDefined(usages.map((usage) => (usage as { cachedInputTokens?: number }).cachedInputTokens));

	const { custoUsd, parcial } = estimateRunCostUsd(segments);

	return {
		tokensEntrada,
		tokensSaida,
		tokensTotal,
		tokensEntradaCache,
		modelo,
		modelos,
		custoUsd: custoUsd ?? undefined,
		custoParcial: parcial || undefined,
	};
}
