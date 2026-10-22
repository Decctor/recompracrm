import type { TAiAgentUsage } from "@/schemas/ai-agents";
import type { TAiAgentUsageCostOriginEnum, TAiAgentUsageFallbackOriginEnum } from "@/schemas/enums";
import type { TAiUsageStep, TModelTokenUsage } from "./gateway-usage";
import { roundUsd } from "./gateway-usage";
import { estimateUsageCostUsd, resolveModelPrice } from "./pricing";

/**
 * Converte os passos de modelo de uma run para o JSON de `ai_agent_runs.uso`.
 *
 * Uma run pode passar por mais de um modelo (fallback de saída estruturada, ou o próprio
 * gateway trocando de modelo). Cada passo guarda o modelo que foi pedido e, quando o gateway
 * confirma, o que efetivamente rodou. O custo de cada passo prefere o USD do gateway e só
 * estima pelo catálogo quando essa cobrança não veio.
 */

export type { TAiUsageStep };

function sumDefined(values: Array<number | undefined>): number | undefined {
	const defined = values.filter((value): value is number => typeof value === "number");
	return defined.length > 0 ? defined.reduce((total, value) => total + value, 0) : undefined;
}

function cacheRead(usage: TModelTokenUsage | undefined): number | undefined {
	return usage?.inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens;
}

function cacheWrite(usage: TModelTokenUsage | undefined): number | undefined {
	return usage?.inputTokenDetails?.cacheWriteTokens;
}

function reasoning(usage: TModelTokenUsage | undefined): number | undefined {
	return usage?.outputTokenDetails?.reasoningTokens ?? usage?.reasoningTokens;
}

function displayModel(step: TAiUsageStep): string {
	return step.modeloResolvido || step.modeloSolicitado;
}

function uniqueInOrder(values: string[]): string[] {
	return [...new Set(values.filter((value) => value.length > 0))];
}

type TPricedStep = {
	step: TAiUsageStep;
	custoUsd?: number;
	origem?: Exclude<TAiAgentUsageCostOriginEnum, "MISTO">;
	tokensEntrada?: number;
	tokensSaida?: number;
	tokensCacheLeitura?: number;
	tokensCacheEscrita?: number;
	tokensRaciocinio?: number;
};

function priceStep(step: TAiUsageStep): TPricedStep {
	const tokensEntrada = step.usage?.inputTokens;
	const tokensSaida = step.usage?.outputTokens;
	const gateway = step.custoGatewayUsd;
	const estimated =
		step.custoEstimadoUsd ??
		estimateUsageCostUsd(
			step.usage ? { inputTokens: step.usage.inputTokens, outputTokens: step.usage.outputTokens } : undefined,
			resolveModelPrice(step.modeloResolvido ?? step.modeloSolicitado),
		) ??
		undefined;
	const hasGateway = typeof gateway === "number";
	const hasEstimate = typeof estimated === "number";
	return {
		step,
		custoUsd: hasGateway ? gateway : hasEstimate ? estimated : undefined,
		origem: hasGateway ? "GATEWAY" : hasEstimate ? "ESTIMADO" : undefined,
		tokensEntrada,
		tokensSaida,
		tokensCacheLeitura: cacheRead(step.usage),
		tokensCacheEscrita: cacheWrite(step.usage),
		tokensRaciocinio: reasoning(step.usage),
	};
}

function fallbackOrigin(steps: TAiUsageStep[]): TAiAgentUsageFallbackOriginEnum | null {
	const requested = uniqueInOrder(steps.map((step) => step.modeloSolicitado));
	const structured = steps.some((step) => step.papel === "SAIDA_ESTRUTURADA") || requested.length > 1;
	const gateway = steps.some(
		(step) =>
			(step.modeloResolvido !== undefined && step.modeloResolvido !== step.modeloSolicitado) ||
			(step.tentativas ?? []).some((attempt) => attempt.origem === "GATEWAY" && attempt.modelo !== step.modeloSolicitado),
	);
	if (structured && gateway) return "MISTA";
	if (structured) return "SAIDA_ESTRUTURADA";
	if (gateway) return "GATEWAY";
	return null;
}

function persistedStep(priced: TPricedStep, indice: number): NonNullable<TAiAgentUsage["passos"]>[number] {
	const { step } = priced;
	return {
		indice,
		papel: step.papel,
		modeloSolicitado: step.modeloSolicitado,
		modeloResolvido: step.modeloResolvido,
		modeloConfirmado: step.modeloConfirmado,
		provedor: step.provedor,
		modeloProvedorId: step.modeloProvedorId,
		tokensEntrada: priced.tokensEntrada,
		tokensSaida: priced.tokensSaida,
		tokensCacheLeitura: priced.tokensCacheLeitura,
		tokensCacheEscrita: priced.tokensCacheEscrita,
		tokensRaciocinio: priced.tokensRaciocinio,
		custoUsd: priced.custoUsd,
		custoOrigem: priced.origem,
		latenciaMs: step.latenciaMs,
		motivoEncerramento: step.motivoEncerramento,
		ferramentas: step.ferramentas && step.ferramentas.length > 0 ? step.ferramentas : undefined,
		idGeracao: step.idGeracao,
	};
}

export function normalizeAiUsage(steps: TAiUsageStep[], options: { usoParcial?: boolean } = {}): TAiAgentUsage | null {
	if (steps.length === 0) return null;

	const priced = steps.map(priceStep);
	const turnSteps = steps.filter((step) => step.papel !== "TRIAGEM");
	const modelSteps = turnSteps.length > 0 ? turnSteps : steps;
	const modelos = uniqueInOrder(modelSteps.map(displayModel));
	const modelo = modelos.join(" -> ");
	const last = modelSteps[modelSteps.length - 1];
	const first = modelSteps[0];

	const tokensEntrada = sumDefined(priced.map((step) => step.tokensEntrada));
	const tokensSaida = sumDefined(priced.map((step) => step.tokensSaida));
	const reportedTotal = sumDefined(priced.map((step) => step.step.usage?.totalTokens));
	const tokensTotal =
		reportedTotal ?? (typeof tokensEntrada === "number" || typeof tokensSaida === "number" ? (tokensEntrada ?? 0) + (tokensSaida ?? 0) : undefined);
	const tokensCacheLeitura = sumDefined(priced.map((step) => step.tokensCacheLeitura));
	const tokensCacheEscrita = sumDefined(priced.map((step) => step.tokensCacheEscrita));
	const tokensRaciocinio = sumDefined(priced.map((step) => step.tokensRaciocinio));

	const missingPrice = priced.some(
		(step) => step.custoUsd === undefined && (typeof step.tokensEntrada === "number" || typeof step.tokensSaida === "number"),
	);
	const gatewayCosts = priced.map((step) => (step.origem === "GATEWAY" ? step.custoUsd : undefined));
	const estimatedCosts = priced.map((step) => (step.origem === "ESTIMADO" ? step.custoUsd : undefined));
	const custoGatewayUsd = sumDefined(gatewayCosts);
	const custoEstimadoUsd = sumDefined(estimatedCosts);
	const custoUsd = sumDefined(priced.map((step) => step.custoUsd));
	const usedGateway = gatewayCosts.some((cost) => typeof cost === "number");
	const usedEstimate = estimatedCosts.some((cost) => typeof cost === "number");
	const custoOrigem: TAiAgentUsageCostOriginEnum | undefined =
		usedGateway && usedEstimate ? "MISTO" : usedGateway ? "GATEWAY" : usedEstimate ? "ESTIMADO" : undefined;

	const origin = fallbackOrigin(turnSteps.length > 0 ? turnSteps : []);
	const distinctModels = uniqueInOrder(modelSteps.map(displayModel));
	const switched = distinctModels.length > 1 || origin !== null;

	const idsGeracao = uniqueInOrder(steps.flatMap((step) => step.idsGeracao ?? (step.idGeracao ? [step.idGeracao] : [])));
	const latenciaMs = sumDefined(steps.map((step) => step.latenciaMs));

	const tentativas = switched
		? modelSteps.flatMap((step) => {
				if (step.tentativas && step.tentativas.length > 0) return step.tentativas;
				return [
					{
						modelo: displayModel(step),
						sucesso: typeof step.usage?.inputTokens === "number" || typeof step.usage?.outputTokens === "number" || step.modeloConfirmado === true,
						provedor: step.provedor,
						idGeracao: step.idGeracao,
						custoUsd: priced.find((item) => item.step === step)?.custoUsd,
						origem: step.papel === "SAIDA_ESTRUTURADA" ? ("SAIDA_ESTRUTURADA" as const) : ("TURNO" as const),
					},
				];
			})
		: undefined;

	return {
		tokensEntrada,
		tokensSaida,
		tokensTotal,
		tokensEntradaCache: tokensCacheLeitura,
		tokensCacheLeitura,
		tokensCacheEscrita,
		tokensRaciocinio,
		modelo: modelo || undefined,
		modelos: modelos.length > 0 ? modelos : undefined,
		modeloSolicitado: first?.modeloSolicitado,
		modeloResolvido: last ? displayModel(last) : undefined,
		modeloConfirmado: last?.modeloConfirmado,
		provedor: last?.provedor,
		modeloProvedorId: last?.modeloProvedorId,
		custoUsd: typeof custoUsd === "number" ? roundUsd(custoUsd) : undefined,
		custoGatewayUsd: typeof custoGatewayUsd === "number" ? roundUsd(custoGatewayUsd) : undefined,
		custoEstimadoUsd: typeof custoEstimadoUsd === "number" ? roundUsd(custoEstimadoUsd) : undefined,
		custoOrigem,
		custoParcial: missingPrice || undefined,
		usoParcial: options.usoParcial || undefined,
		latenciaMs,
		idsGeracao: idsGeracao.length > 0 ? idsGeracao : undefined,
		contingencia:
			switched && origin && first && last
				? {
						ocorreu: true,
						origem: origin,
						solicitado: first.modeloSolicitado,
						usado: displayModel(last),
						tentativas,
					}
				: undefined,
		passos: priced.map(persistedStep),
	};
}
