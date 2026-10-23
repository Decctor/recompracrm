import type { TAiAgentUsage } from "@/schemas/ai-agents";
import type { TAiAgentUsageStepRoleEnum } from "@/schemas/enums";
import type { TMessageTriage } from "../triage/message-triage";
import { NoObjectGeneratedError, gateway } from "ai";
import {
	type TAiUsageStep,
	type TGatewayGenerationSnapshot,
	type TModelTokenUsage,
	enrichUsageStepsWithGatewayCost,
	readGatewayCallFacts,
	readGenerationIdFromError,
} from "./gateway-usage";
import { normalizeAiUsage } from "./usage";

/**
 * Junta o que cada chamada de modelo devolveu — inclusive a que falhou ou foi abortada —
 * e grava um `uso` único. A consulta ao gateway só acontece quando a resposta não trouxe o USD.
 */

const GATEWAY_LOOKUP_TIMEOUT_MS = 1200;

type TSdkCallEnd = {
	responseId?: string;
	modelId?: string;
	provider?: string;
	finishReason?: string;
	usage?: TModelTokenUsage;
	providerMetadata?: unknown;
	performance?: { responseTimeMs?: number };
};

type TSdkStepEnd = {
	usage?: TModelTokenUsage;
	providerMetadata?: unknown;
	finishReason?: string;
	response?: { id?: string; modelId?: string };
	model?: { provider?: string; modelId?: string };
	performance?: { responseTimeMs?: number; stepTimeMs?: number };
	toolCalls?: Array<{ toolName?: string }>;
};

function stepFromFacts(input: {
	papel: TAiAgentUsageStepRoleEnum;
	modeloSolicitado: string;
	usage?: TModelTokenUsage;
	providerMetadata?: unknown;
	responseModelId?: string;
	provider?: string;
	latenciaMs?: number;
	motivoEncerramento?: string;
	ferramentas?: string[];
	idGeracao?: string;
}): TAiUsageStep {
	const facts = readGatewayCallFacts(input.providerMetadata, input.responseModelId);
	const usage =
		input.usage && (typeof input.usage.inputTokens === "number" || typeof input.usage.outputTokens === "number") ? input.usage : facts.tokens;
	return {
		papel: input.papel,
		modeloSolicitado: input.modeloSolicitado,
		modeloResolvido: facts.modeloResolvido ?? input.responseModelId ?? input.modeloSolicitado,
		modeloConfirmado: facts.modeloConfirmado,
		provedor: facts.provedor ?? input.provider,
		modeloProvedorId: facts.modeloProvedorId,
		usage,
		custoGatewayUsd: facts.custoUsd,
		latenciaMs: input.latenciaMs,
		motivoEncerramento: input.motivoEncerramento,
		ferramentas: input.ferramentas?.filter((name): name is string => Boolean(name)),
		idGeracao: input.idGeracao ?? facts.idGeracao,
		idsGeracao: facts.idsGeracao.length > 0 ? facts.idsGeracao : input.idGeracao ? [input.idGeracao] : undefined,
		tentativas: facts.tentativas.length > 0 ? facts.tentativas : undefined,
	};
}

/** Acumula os passos de uma chamada de `generate`, na ordem, sem duplicar o fim da chamada e o fim do passo. */
export function createModelCallCollector(input: { modeloSolicitado: string; papel: TAiAgentUsageStepRoleEnum }) {
	const byKey = new Map<string, TAiUsageStep>();
	const order: string[] = [];
	let anonymous = 0;

	function upsert(key: string, step: TAiUsageStep) {
		const current = byKey.get(key);
		if (!current) {
			byKey.set(key, step);
			order.push(key);
			return;
		}
		byKey.set(key, {
			...current,
			...step,
			usage: step.usage ?? current.usage,
			custoGatewayUsd: step.custoGatewayUsd ?? current.custoGatewayUsd,
			custoEstimadoUsd: step.custoEstimadoUsd ?? current.custoEstimadoUsd,
			latenciaMs: step.latenciaMs ?? current.latenciaMs,
			ferramentas: step.ferramentas && step.ferramentas.length > 0 ? step.ferramentas : current.ferramentas,
			modeloResolvido: step.modeloConfirmado ? step.modeloResolvido : (current.modeloResolvido ?? step.modeloResolvido),
			modeloConfirmado: step.modeloConfirmado || current.modeloConfirmado,
			idGeracao: step.idGeracao ?? current.idGeracao,
			idsGeracao: step.idsGeracao ?? current.idsGeracao,
			tentativas: step.tentativas ?? current.tentativas,
			provedor: step.provedor ?? current.provedor,
			modeloProvedorId: step.modeloProvedorId ?? current.modeloProvedorId,
		});
	}

	return {
		onLanguageModelCallEnd(event: TSdkCallEnd) {
			const key = event.responseId || `chamada-${anonymous++}`;
			upsert(
				key,
				stepFromFacts({
					papel: input.papel,
					modeloSolicitado: input.modeloSolicitado,
					usage: event.usage,
					providerMetadata: event.providerMetadata,
					responseModelId: event.modelId,
					provider: event.provider,
					latenciaMs: event.performance?.responseTimeMs,
					motivoEncerramento: event.finishReason,
				}),
			);
		},
		onStepEnd(event: TSdkStepEnd) {
			const key = event.response?.id || `passo-${anonymous++}`;
			upsert(
				key,
				stepFromFacts({
					papel: input.papel,
					modeloSolicitado: input.modeloSolicitado,
					usage: event.usage,
					providerMetadata: event.providerMetadata,
					responseModelId: event.response?.modelId ?? event.model?.modelId,
					provider: event.model?.provider,
					latenciaMs: event.performance?.responseTimeMs ?? event.performance?.stepTimeMs,
					motivoEncerramento: event.finishReason,
					ferramentas: event.toolCalls?.map((call) => call.toolName ?? "").filter(Boolean),
				}),
			);
		},
		/**
		 * A chamada estourou antes de qualquer passo. Ainda assim registramos o modelo pedido
		 * e, se o erro trouxer uso ou um id de geração, o que deu para saber até a parada.
		 */
		noteError(error: unknown) {
			if (order.length > 0) return;
			const idGeracao = readGenerationIdFromError(error);
			if (NoObjectGeneratedError.isInstance(error)) {
				upsert(
					"erro",
					stepFromFacts({
						papel: input.papel,
						modeloSolicitado: input.modeloSolicitado,
						usage: error.usage,
						responseModelId: error.response?.modelId,
						motivoEncerramento: error.finishReason,
						idGeracao,
					}),
				);
				return;
			}
			upsert(
				"erro",
				stepFromFacts({
					papel: input.papel,
					modeloSolicitado: input.modeloSolicitado,
					idGeracao,
				}),
			);
		},
		steps(): TAiUsageStep[] {
			return order.map((key) => byKey.get(key)).filter((step): step is TAiUsageStep => step !== undefined);
		},
	};
}

export function stepFromMessageTriage(triagem: TMessageTriage): TAiUsageStep {
	const tokensEntrada = triagem.tokensEntrada;
	const tokensSaida = triagem.tokensSaida;
	return {
		papel: "TRIAGEM",
		modeloSolicitado: triagem.modeloSolicitado ?? triagem.modelo,
		modeloResolvido: triagem.modelo,
		modeloConfirmado: triagem.modeloConfirmado,
		usage: {
			inputTokens: tokensEntrada,
			outputTokens: tokensSaida,
			totalTokens: typeof tokensEntrada === "number" || typeof tokensSaida === "number" ? (tokensEntrada ?? 0) + (tokensSaida ?? 0) : undefined,
			inputTokenDetails: {
				cacheReadTokens: triagem.tokensCacheLeitura,
				cacheWriteTokens: triagem.tokensCacheEscrita,
			},
			outputTokenDetails: { reasoningTokens: triagem.tokensRaciocinio },
		},
		custoGatewayUsd: triagem.custoGatewayUsd ?? undefined,
		custoEstimadoUsd: triagem.custoGatewayUsd === null || triagem.custoGatewayUsd === undefined ? (triagem.custoUsd ?? undefined) : undefined,
		idGeracao: triagem.idGeracao,
		idsGeracao: triagem.idGeracao ? [triagem.idGeracao] : undefined,
		latenciaMs: triagem.latenciaMs,
	};
}

async function lookupGatewayGeneration(id: string): Promise<TGatewayGenerationSnapshot | null> {
	try {
		const info = await gateway.getGenerationInfo({ id });
		return {
			totalCost: info.totalCost,
			model: info.model,
			providerName: info.providerName,
			generationTime: info.generationTime,
			promptTokens: info.promptTokens,
			completionTokens: info.completionTokens,
			reasoningTokens: info.reasoningTokens,
			cachedTokens: info.cachedTokens,
			cacheCreationTokens: info.cacheCreationTokens,
		};
	} catch {
		return null;
	}
}

export async function finalizeRunUsage(input: {
	steps: TAiUsageStep[];
	triagem?: TMessageTriage | null;
	usoParcial?: boolean;
	lookup?: (id: string) => Promise<TGatewayGenerationSnapshot | null>;
	timeoutMs?: number;
}): Promise<TAiAgentUsage | null> {
	const triageStep = input.triagem ? stepFromMessageTriage(input.triagem) : null;
	const turnSteps = input.lookup
		? await enrichUsageStepsWithGatewayCost(input.steps, { lookup: input.lookup, timeoutMs: input.timeoutMs ?? GATEWAY_LOOKUP_TIMEOUT_MS })
		: await enrichUsageStepsWithGatewayCost(input.steps, { lookup: lookupGatewayGeneration, timeoutMs: input.timeoutMs ?? GATEWAY_LOOKUP_TIMEOUT_MS });
	const steps = triageStep ? [triageStep, ...turnSteps] : turnSteps;
	return normalizeAiUsage(steps, { usoParcial: input.usoParcial });
}
