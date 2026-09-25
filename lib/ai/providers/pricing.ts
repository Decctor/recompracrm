import type { LanguageModelUsage } from "ai";
import { findAiAgentModelInCatalog } from "./model-catalog";
import { resolveLanguageModelId } from "./models";

/**
 * Preço por modelo e custo estimado de uma run.
 *
 * Os valores são **estimativas**: o preço vem do catálogo curado (`model-catalog.ts`), conferido
 * na curadoria, e a cobrança real é a do AI Gateway — que tem preço regional em alguns modelos.
 * A UI diz "estimado" onde exibe. O que importa aqui não é o centavo, é a ordem de grandeza por
 * organização e por mês, para o limite de créditos ter em que se apoiar.
 */

export type TModelPrice = { precoEntrada: number; precoSaida: number };

/** Preço de referência (USD por 1M tokens) do catálogo. `null` para modelo fora do catálogo. */
export function resolveModelPrice(modelo: string | null | undefined): TModelPrice | null {
	const entry = findAiAgentModelInCatalog(resolveLanguageModelId(modelo));
	if (!entry) return null;
	return { precoEntrada: entry.precoEntrada, precoSaida: entry.precoSaida };
}

/** Custo em USD de um uso reportado pelo SDK contra um preço. `null` quando não há como estimar. */
export function estimateUsageCostUsd(usage: Partial<LanguageModelUsage> | undefined, price: TModelPrice | null): number | null {
	if (!usage || !price) return null;
	const entrada = typeof usage.inputTokens === "number" ? usage.inputTokens : null;
	const saida = typeof usage.outputTokens === "number" ? usage.outputTokens : null;
	if (entrada === null && saida === null) return null;
	return ((entrada ?? 0) * price.precoEntrada + (saida ?? 0) * price.precoSaida) / 1_000_000;
}

/**
 * Soma o custo de uma run que pode ter passado por mais de um modelo (fallback de saída
 * estruturada). `usages[i]` corresponde a `modelos[i]`; um trecho sem preço conhecido é ignorado
 * na soma e a run fica marcada como estimativa parcial.
 */
export function estimateRunCostUsd(segments: Array<{ modelo: string; usage: Partial<LanguageModelUsage> | undefined }>): {
	custoUsd: number | null;
	parcial: boolean;
} {
	let total: number | null = null;
	let parcial = false;
	for (const segment of segments) {
		const cost = estimateUsageCostUsd(segment.usage, resolveModelPrice(segment.modelo));
		if (cost === null) {
			parcial = true;
			continue;
		}
		total = (total ?? 0) + cost;
	}
	return { custoUsd: total, parcial };
}

/** Formata um custo em USD para a UI: centavos visíveis mesmo em valores pequenos. */
export function formatUsd(value: number | null | undefined): string {
	if (typeof value !== "number" || !Number.isFinite(value)) return "—";
	const digits = value < 0.01 && value > 0 ? 4 : 2;
	return `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
