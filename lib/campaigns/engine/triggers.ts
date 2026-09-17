import type { TCampaignTriggerTypeEnum } from "@/schemas/enums";

/**
 * Motor único de gatilhos de compra (Fase 4 do redesign). Função pura: recebe as campanhas ativas
 * da organização, as audiências resolvidas e os fatos da venda, e devolve quais campanhas disparam.
 * Consumido por lib/data-collecting-v2/effects.ts, pelo POI (new-transaction) e pelo registro de
 * venda do POI antigo (app/api/sales) — antes cada um tinha sua cópia, com decisões divergentes.
 */

export type TTriggerCampaign = {
	id: string;
	gatilhoTipo: TCampaignTriggerTypeEnum;
	gatilhoNovaCompraValorMinimo: number | null;
	gatilhoQuantidadeTotalCompras: number | null;
	gatilhoValorTotalCompras: number | null;
	gatilhoNovoCashbackAcumuladoValorMinimo: number | null;
	gatilhoTotalCashbackAcumuladoValorMinimo: number | null;
};

export type TSaleTriggerFacts = {
	clientId: string | null;
	isFirstPurchase: boolean;
	saleValue: number;
	// Totais do cliente depois e antes desta venda. Null quando a venda não atualizou métricas
	// (ex.: transação do POI sem venda interna) — gatilhos de total não avaliam.
	newTotalPurchaseCount: number | null;
	previousTotalPurchaseCount: number | null;
	newTotalPurchaseValue: number | null;
	previousTotalPurchaseValue: number | null;
	// Cashback acumulado por esta venda e saldo disponível resultante. Null = sem acúmulo.
	cashbackAccumulatedValue: number | null;
	cashbackAvailableBalance: number | null;
};

export function campaignAudienceIncludesClient(audiencesByCampaignId: Map<string, Set<string>>, campaignId: string, clientId: string | null) {
	if (!clientId) return false;
	return audiencesByCampaignId.get(campaignId)?.has(clientId) ?? false;
}

// Cruzamento de limiar: dispara quando ESTA venda faz o cliente cruzar o valor configurado, então
// totais que saltam o valor exato (importações em lote) disparam exatamente uma vez.
function crossesThreshold({ threshold, previous, next }: { threshold: number | null; previous: number | null; next: number | null }) {
	return threshold != null && next != null && next >= threshold && (previous ?? 0) < threshold;
}

/**
 * Gatilhos de compra são mutuamente exclusivos, em ordem de prioridade:
 * PRIMEIRA-COMPRA > QUANTIDADE-TOTAL-COMPRAS > NOVA-COMPRA.
 *
 * Decisão única (antes divergia entre integrações e POI): NOVA-COMPRA dispara numa primeira
 * compra quando nenhuma campanha de PRIMEIRA-COMPRA se aplica ao cliente — uma loja sem campanha
 * de boas-vindas ainda saúda a compra; com ela, a prioridade evita a mensagem dupla.
 */
export function resolveExclusivePurchaseTriggerCampaigns<TCampaign extends TTriggerCampaign>({
	campaigns,
	audiencesByCampaignId,
	sale,
}: {
	campaigns: TCampaign[];
	audiencesByCampaignId: Map<string, Set<string>>;
	sale: TSaleTriggerFacts;
}): TCampaign[] {
	const { clientId } = sale;
	if (!clientId) return [];
	const appliesToClient = (campaign: TCampaign) => campaignAudienceIncludesClient(audiencesByCampaignId, campaign.id, clientId);

	const firstPurchaseCampaigns = campaigns.filter(
		(campaign) => campaign.gatilhoTipo === "PRIMEIRA-COMPRA" && sale.isFirstPurchase && appliesToClient(campaign),
	);
	if (firstPurchaseCampaigns.length > 0) return firstPurchaseCampaigns;

	const totalPurchaseCountCampaigns = campaigns.filter(
		(campaign) =>
			campaign.gatilhoTipo === "QUANTIDADE-TOTAL-COMPRAS" &&
			crossesThreshold({
				threshold: campaign.gatilhoQuantidadeTotalCompras,
				previous: sale.previousTotalPurchaseCount,
				next: sale.newTotalPurchaseCount,
			}) &&
			appliesToClient(campaign),
	);
	if (totalPurchaseCountCampaigns.length > 0) return totalPurchaseCountCampaigns;

	return campaigns.filter(
		(campaign) =>
			campaign.gatilhoTipo === "NOVA-COMPRA" &&
			appliesToClient(campaign) &&
			(campaign.gatilhoNovaCompraValorMinimo == null || sale.saleValue >= campaign.gatilhoNovaCompraValorMinimo),
	);
}

export function resolveTotalPurchaseValueCampaigns<TCampaign extends TTriggerCampaign>({
	campaigns,
	audiencesByCampaignId,
	sale,
}: {
	campaigns: TCampaign[];
	audiencesByCampaignId: Map<string, Set<string>>;
	sale: TSaleTriggerFacts;
}): TCampaign[] {
	return campaigns.filter(
		(campaign) =>
			campaign.gatilhoTipo === "VALOR-TOTAL-COMPRAS" &&
			campaignAudienceIncludesClient(audiencesByCampaignId, campaign.id, sale.clientId) &&
			crossesThreshold({ threshold: campaign.gatilhoValorTotalCompras, previous: sale.previousTotalPurchaseValue, next: sale.newTotalPurchaseValue }),
	);
}

export function resolveCashbackAccumulationCampaigns<TCampaign extends TTriggerCampaign>({
	campaigns,
	audiencesByCampaignId,
	sale,
}: {
	campaigns: TCampaign[];
	audiencesByCampaignId: Map<string, Set<string>>;
	sale: TSaleTriggerFacts;
}): TCampaign[] {
	const accumulated = sale.cashbackAccumulatedValue;
	if (accumulated == null || accumulated <= 0) return [];
	const available = sale.cashbackAvailableBalance ?? 0;

	return campaigns.filter((campaign) => {
		if (campaign.gatilhoTipo !== "CASHBACK-ACUMULADO") return false;
		if (!campaignAudienceIncludesClient(audiencesByCampaignId, campaign.id, sale.clientId)) return false;
		const meetsNewCashbackThreshold =
			campaign.gatilhoNovoCashbackAcumuladoValorMinimo == null || accumulated >= campaign.gatilhoNovoCashbackAcumuladoValorMinimo;
		const meetsTotalCashbackThreshold =
			campaign.gatilhoTotalCashbackAcumuladoValorMinimo == null || available >= campaign.gatilhoTotalCashbackAcumuladoValorMinimo;
		return meetsNewCashbackThreshold && meetsTotalCashbackThreshold;
	});
}

export type TTriggeredCampaign<TCampaign> = { campaign: TCampaign; grupo: "COMPRA" | "VALOR_TOTAL" | "CASHBACK" };

/** Todas as campanhas que uma venda dispara, já com a exclusividade de compra aplicada. */
export function resolveTriggeredCampaigns<TCampaign extends TTriggerCampaign>(params: {
	campaigns: TCampaign[];
	audiencesByCampaignId: Map<string, Set<string>>;
	sale: TSaleTriggerFacts;
}): TTriggeredCampaign<TCampaign>[] {
	if (!params.sale.clientId) return [];
	return [
		...resolveExclusivePurchaseTriggerCampaigns(params).map((campaign) => ({ campaign, grupo: "COMPRA" as const })),
		...resolveTotalPurchaseValueCampaigns(params).map((campaign) => ({ campaign, grupo: "VALOR_TOTAL" as const })),
		...resolveCashbackAccumulationCampaigns(params).map((campaign) => ({ campaign, grupo: "CASHBACK" as const })),
	];
}
