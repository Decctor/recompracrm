import type { TAiAgentUsageAttemptOriginEnum, TAiAgentUsageStepRoleEnum } from "@/schemas/enums";

/**
 * O que o AI Gateway devolve sobre uma chamada, além do `usage` padronizado do AI SDK.
 *
 * O SDK 7 não coloca o custo nem o modelo de fallback em `response.modelId`: o provider do
 * gateway repassa `providerMetadata` e, na prática, `response.modelId` cai no id solicitado.
 * O modelo que rodou e o USD ficam em `providerMetadata.gateway` (custo e `routing`) ou, quando
 * isso não vem na resposta, em `gateway.getGenerationInfo`.
 */

export type TModelTokenUsage = {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	inputTokenDetails?: {
		noCacheTokens?: number;
		cacheReadTokens?: number;
		cacheWriteTokens?: number;
	};
	outputTokenDetails?: {
		textTokens?: number;
		reasoningTokens?: number;
	};
	/** Campo do AI SDK 6. O SDK 7 moveu para `inputTokenDetails.cacheReadTokens`. */
	cachedInputTokens?: number;
	/** Campo do AI SDK 6. O SDK 7 moveu para `outputTokenDetails.reasoningTokens`. */
	reasoningTokens?: number;
};

export type TAiUsageAttempt = {
	modelo: string;
	sucesso?: boolean;
	provedor?: string;
	idGeracao?: string;
	custoUsd?: number;
	origem?: TAiAgentUsageAttemptOriginEnum;
};

/** Um passo de modelo, antes de virar o JSON persistido. */
export type TAiUsageStep = {
	papel: TAiAgentUsageStepRoleEnum;
	modeloSolicitado: string;
	modeloResolvido?: string;
	modeloConfirmado?: boolean;
	provedor?: string;
	modeloProvedorId?: string;
	usage?: TModelTokenUsage;
	/** Cobrança do gateway para este passo, quando já conhecida. */
	custoGatewayUsd?: number;
	/** Estimativa já fechada (triagem). Evita procurar o modelo no catálogo de atendimento. */
	custoEstimadoUsd?: number;
	latenciaMs?: number;
	motivoEncerramento?: string;
	ferramentas?: string[];
	idGeracao?: string;
	idsGeracao?: string[];
	tentativas?: TAiUsageAttempt[];
};

export type TGatewayGenerationSnapshot = {
	totalCost: number;
	model: string;
	providerName?: string;
	generationTime?: number;
	promptTokens?: number;
	completionTokens?: number;
	reasoningTokens?: number;
	cachedTokens?: number;
	cacheCreationTokens?: number;
};

const COST_KEYS = ["cost", "gatewayCost", "totalCost", "inferenceCost"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

export function readUsd(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function readCount(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
	return undefined;
}

function readModelId(record: Record<string, unknown>): string | undefined {
	for (const key of ["modelId", "model", "canonicalSlug"]) {
		const value = record[key];
		if (typeof value === "string" && value.includes("/")) return value.trim();
	}
	for (const key of ["modelId", "model", "canonicalSlug"]) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

function readCost(record: Record<string, unknown>): number | undefined {
	for (const key of COST_KEYS) {
		const cost = readUsd(record[key]);
		if (cost !== undefined) return cost;
	}
	return undefined;
}

function readAttemptTokens(attempt: Record<string, unknown>): TModelTokenUsage | undefined {
	const source = asRecord(attempt.usage);
	if (!source) return undefined;
	const inputTokens = readCount(source.promptTokens ?? source.inputTokens ?? source.native_tokens_prompt);
	const outputTokens = readCount(source.completionTokens ?? source.outputTokens ?? source.native_tokens_completion);
	const reasoningTokens = readCount(source.reasoningTokens ?? source.native_tokens_reasoning);
	const cacheReadTokens = readCount(source.cachedTokens ?? source.cachedInputTokens ?? source.native_tokens_cached);
	const cacheWriteTokens = readCount(source.cacheCreationTokens ?? source.cacheCreationInputTokens ?? source.native_tokens_cache_creation);
	if (
		inputTokens === undefined &&
		outputTokens === undefined &&
		reasoningTokens === undefined &&
		cacheReadTokens === undefined &&
		cacheWriteTokens === undefined
	) {
		return undefined;
	}
	return {
		inputTokens,
		outputTokens,
		totalTokens: inputTokens !== undefined || outputTokens !== undefined ? (inputTokens ?? 0) + (outputTokens ?? 0) : undefined,
		inputTokenDetails: { cacheReadTokens, cacheWriteTokens },
		outputTokenDetails: { reasoningTokens },
	};
}

function sumUsage(usages: TModelTokenUsage[]): TModelTokenUsage | undefined {
	if (usages.length === 0) return undefined;
	const sum = (values: Array<number | undefined>) => {
		const defined = values.filter((value): value is number => typeof value === "number");
		return defined.length > 0 ? defined.reduce((total, value) => total + value, 0) : undefined;
	};
	const inputTokens = sum(usages.map((usage) => usage.inputTokens));
	const outputTokens = sum(usages.map((usage) => usage.outputTokens));
	const cacheReadTokens = sum(usages.map((usage) => usage.inputTokenDetails?.cacheReadTokens));
	const cacheWriteTokens = sum(usages.map((usage) => usage.inputTokenDetails?.cacheWriteTokens));
	const reasoningTokens = sum(usages.map((usage) => usage.outputTokenDetails?.reasoningTokens));
	return {
		inputTokens,
		outputTokens,
		totalTokens: inputTokens !== undefined || outputTokens !== undefined ? (inputTokens ?? 0) + (outputTokens ?? 0) : undefined,
		inputTokenDetails: { cacheReadTokens, cacheWriteTokens },
		outputTokenDetails: { reasoningTokens },
	};
}

export function roundUsd(value: number): number {
	return Math.round(value * 1e8) / 1e8;
}

/**
 * Lê custo, geração e o modelo que o gateway de fato executou.
 * `responseModelId` entra só como pista: no provider do gateway ele costuma ser o id pedido.
 */
export function readGatewayCallFacts(
	providerMetadata: unknown,
	responseModelId?: string,
): {
	custoUsd?: number;
	modeloResolvido?: string;
	modeloConfirmado: boolean;
	provedor?: string;
	modeloProvedorId?: string;
	idGeracao?: string;
	idsGeracao: string[];
	tentativas: TAiUsageAttempt[];
	tokens?: TModelTokenUsage;
} {
	const gateway = asRecord(asRecord(providerMetadata)?.gateway);
	if (!gateway) {
		return { modeloConfirmado: false, idsGeracao: [], tentativas: [] };
	}

	const routing = asRecord(gateway.routing);
	const rawAttempts = Array.isArray(routing?.modelAttempts) ? routing.modelAttempts : [];
	const tentativas: TAiUsageAttempt[] = [];
	const attemptTokens: TModelTokenUsage[] = [];
	for (const raw of rawAttempts) {
		const attempt = asRecord(raw);
		if (!attempt) continue;
		const modelo = readModelId(attempt);
		if (!modelo) continue;
		const sucesso = typeof attempt.success === "boolean" ? attempt.success : undefined;
		const idGeracao = typeof attempt.generationId === "string" && attempt.generationId ? attempt.generationId : undefined;
		const provedor =
			typeof attempt.provider === "string" ? attempt.provider : typeof attempt.providerName === "string" ? attempt.providerName : undefined;
		tentativas.push({ modelo, sucesso, provedor, idGeracao, custoUsd: readCost(attempt), origem: "GATEWAY" });
		const tokens = readAttemptTokens(attempt);
		if (tokens) attemptTokens.push(tokens);
	}

	const successful = [...tentativas].reverse().find((attempt) => attempt.sucesso !== false);
	const canonical = typeof routing?.canonicalSlug === "string" ? routing.canonicalSlug : undefined;
	const original = typeof routing?.originalModelId === "string" ? routing.originalModelId : undefined;
	const modeloResolvido = successful?.modelo ?? (canonical && canonical !== original ? canonical : undefined) ?? (canonical || undefined);
	const modeloConfirmado = Boolean(successful?.modelo || canonical);
	const provedor =
		successful?.provedor ??
		(typeof routing?.finalProvider === "string" ? routing.finalProvider : undefined) ??
		(typeof routing?.resolvedProvider === "string" ? routing.resolvedProvider : undefined);
	const modeloProvedorId = typeof routing?.resolvedProviderApiModelId === "string" ? routing.resolvedProviderApiModelId : undefined;

	const ids = new Set<string>();
	const topLevelId = typeof gateway.generationId === "string" && gateway.generationId ? gateway.generationId : undefined;
	if (topLevelId) ids.add(topLevelId);
	for (const attempt of tentativas) {
		if (attempt.idGeracao) ids.add(attempt.idGeracao);
	}

	const attemptCosts = tentativas.map((attempt) => attempt.custoUsd).filter((cost): cost is number => typeof cost === "number");
	const custoUsd = attemptCosts.length > 0 ? roundUsd(attemptCosts.reduce((total, cost) => total + cost, 0)) : readCost(gateway);

	// `response.modelId` no provider do gateway costuma ser o id pedido. Só conta como
	// resolução quando o roteamento diz qual era o original e a resposta diverge dele.
	const resolvedFromResponse = original && responseModelId && responseModelId !== original ? responseModelId : undefined;

	return {
		custoUsd,
		modeloResolvido: modeloResolvido ?? resolvedFromResponse,
		modeloConfirmado: modeloConfirmado || Boolean(resolvedFromResponse && resolvedFromResponse !== original),
		provedor,
		modeloProvedorId,
		idGeracao: successful?.idGeracao ?? topLevelId,
		idsGeracao: [...ids],
		tentativas,
		tokens: sumUsage(attemptTokens),
	};
}

/** `generationId` em qualquer camada da cadeia de causas — o gateway carimba o erro com ele. */
export function readGenerationIdFromError(error: unknown): string | undefined {
	const seen = new Set<unknown>();
	let current: unknown = error;
	while (current && typeof current === "object" && !seen.has(current)) {
		seen.add(current);
		const record = current as Record<string, unknown>;
		if (typeof record.generationId === "string" && record.generationId) return record.generationId;
		const facts = readGatewayCallFacts(record.providerMetadata);
		if (facts.idGeracao) return facts.idGeracao;
		const data = asRecord(record.data);
		if (typeof data?.generationId === "string" && data.generationId) return data.generationId;
		current = record.cause ?? record.lastError;
	}
	return undefined;
}

function usageFromGeneration(info: TGatewayGenerationSnapshot): TModelTokenUsage {
	const inputTokens = readCount(info.promptTokens);
	const outputTokens = readCount(info.completionTokens);
	const reasoningTokens = readCount(info.reasoningTokens);
	const cacheReadTokens = readCount(info.cachedTokens);
	const cacheWriteTokens = readCount(info.cacheCreationTokens);
	return {
		inputTokens,
		outputTokens,
		totalTokens: inputTokens !== undefined || outputTokens !== undefined ? (inputTokens ?? 0) + (outputTokens ?? 0) : undefined,
		inputTokenDetails: { cacheReadTokens, cacheWriteTokens },
		outputTokenDetails: { reasoningTokens },
	};
}

function hasTokenUsage(usage: TModelTokenUsage | undefined): boolean {
	return typeof usage?.inputTokens === "number" || typeof usage?.outputTokens === "number";
}

/**
 * Completa passos sem custo inline consultando `getGenerationInfo`.
 * Não lança: timeout ou falha de rede deixam a estimativa do catálogo no lugar.
 */
export async function enrichUsageStepsWithGatewayCost(
	steps: TAiUsageStep[],
	options: {
		lookup: (id: string) => Promise<TGatewayGenerationSnapshot | null>;
		timeoutMs?: number;
	},
): Promise<TAiUsageStep[]> {
	const ids = [
		...new Set(
			steps.filter((step) => step.custoGatewayUsd === undefined).flatMap((step) => step.idsGeracao ?? (step.idGeracao ? [step.idGeracao] : [])),
		),
	];
	if (ids.length === 0) return steps;

	const pending = ids.map(async (id) => {
		try {
			return { id, info: await options.lookup(id) };
		} catch {
			return { id, info: null as TGatewayGenerationSnapshot | null };
		}
	});
	const timeoutMs = options.timeoutMs ?? 1200;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const settled = await Promise.race([
		Promise.all(pending).finally(() => {
			if (timer) clearTimeout(timer);
		}),
		new Promise<null>((resolve) => {
			timer = setTimeout(() => resolve(null), timeoutMs);
		}),
	]);
	if (!settled) return steps;

	const byId = new Map(settled.flatMap((entry) => (entry.info ? [[entry.id, entry.info] as const] : [])));
	if (byId.size === 0) return steps;

	return steps.map((step) => {
		if (step.custoGatewayUsd !== undefined) return step;
		const idsDoPasso = step.idsGeracao ?? (step.idGeracao ? [step.idGeracao] : []);
		const infos = idsDoPasso.flatMap((id) => {
			const info = byId.get(id);
			return info ? [info] : [];
		});
		if (infos.length === 0) return step;
		// `totalCost` 0 logo após a chamada costuma ser cobrança ainda não fechada (o gateway
		// leva dezenas de segundos para o stream). Zero aqui não vence o catálogo.
		const costs = infos.map((info) => readUsd(info.totalCost)).filter((cost): cost is number => typeof cost === "number" && cost > 0);
		if (costs.length === 0) return step;
		const custoGatewayUsd = roundUsd(costs.reduce((total, cost) => total + cost, 0));
		const last = infos[infos.length - 1];
		if (!last) return step;
		const usage = hasTokenUsage(step.usage) ? step.usage : usageFromGeneration(last);
		return {
			...step,
			custoGatewayUsd,
			usage,
			modeloResolvido: last.model || step.modeloResolvido,
			modeloConfirmado: Boolean(last.model) || step.modeloConfirmado,
			provedor: last.providerName || step.provedor,
			latenciaMs: step.latenciaMs ?? (typeof last.generationTime === "number" ? last.generationTime : undefined),
		};
	});
}
