import type { TCanonicalImportBatch } from "@/lib/data-connectors";
import type { TDataSourceIntegration } from "@/lib/integrations/data-sources";
import type { TDataCollectingV2RunSummary } from "./types";

/**
 * Decisões puras do run contínuo (`runDataCollectingV2`), isoladas do banco para que o cron de
 * polling do iFood — que roda a cada 30s e quase sempre sem eventos — pague só pelo que aconteceu.
 */

/**
 * Lote sem nada para persistir: nenhuma venda, produto, vendedor, parceiro ou adicional, e sem
 * `postProcess` (um conector que precisa rodar algo após o commit não é "vazio"). O run pula a
 * transação inteira — campanhas, cashback e o UPDATE da conexão — e a última sincronização segue
 * a regra de `resolveIntegrationStatusUpdate`.
 */
export function isEmptyCanonicalBatch(batch: TCanonicalImportBatch): boolean {
	return (
		batch.sales.length === 0 &&
		batch.products.length === 0 &&
		batch.sellers.length === 0 &&
		batch.partners.length === 0 &&
		batch.productAddOns.length === 0 &&
		batch.productAddOnOptions.length === 0 &&
		!batch.postProcess
	);
}

export function createEmptyRunSummary({
	organizationId,
	integrationId,
	source,
}: Pick<TDataCollectingV2RunSummary, "organizationId" | "integrationId" | "source">): TDataCollectingV2RunSummary {
	return {
		organizationId,
		integrationId,
		source,
		importedSalesCount: 0,
		saleIdCollisionsCount: 0,
		createdSalesCount: 0,
		updatedSalesCount: 0,
		unchangedSalesCount: 0,
		createdClientsCount: 0,
		createdProductsCount: 0,
		createdSellersCount: 0,
		createdPartnersCount: 0,
		resolvedCampaignAudiencesCount: 0,
		createdInteractionsCount: 0,
		immediateInteractionsCount: 0,
		cashbackTransactionsCount: 0,
		cashbackAccumulatedValue: 0,
		firstPurchaseInteractionsCount: 0,
		cashbackAccumulationInteractionsCount: 0,
	};
}

/**
 * Integrações agrupadas por organização, preservando a ordem de chegada (a ordenação estável de
 * `getActiveDataSourceIntegrations`). Organizações distintas não compartilham clientes, produtos
 * nem vendas, então podem correr em paralelo; duas conexões da MESMA organização continuam em
 * série para não criarem o mesmo cliente/produto em transações concorrentes.
 */
export function groupIntegrationsByOrganization<T extends Pick<TDataSourceIntegration, "organizacaoId">>(integrations: T[]): T[][] {
	const groups = new Map<string, T[]>();
	for (const integration of integrations) {
		const group = groups.get(integration.organizacaoId);
		if (group) group.push(integration);
		else groups.set(integration.organizacaoId, [integration]);
	}
	return Array.from(groups.values());
}

export async function mapWithConcurrency<TInput, TOutput>(
	items: TInput[],
	concurrency: number,
	mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
	const results: TOutput[] = Array.from({ length: items.length });
	const limit = Math.max(1, Math.min(Math.floor(concurrency), items.length || 1));
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await mapper(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: limit }, () => worker()));
	return results;
}

/** "Última sincronização" de um run sem mudanças é regravada no máximo a cada 5 minutos. */
export const INTEGRATION_SYNC_STATUS_STALE_MS = 5 * 60 * 1000;

export type TIntegrationStatusUpdate = {
	dataUltimaSincronizacao: Date;
	status: "CONECTADO";
	ultimoErro: string | null;
};

function describeSaleIdCollisions(count: number) {
	return `${count} colisão(ões) de idExterno com vendas de outra origem no último run — itens ignorados (fail-closed).`;
}

/**
 * Decide se a linha da conexão precisa do UPDATE de "run bem-sucedido". A escrita é obrigatória
 * quando algo mudou (vendas importadas, status/erro divergentes do que o run apurou) e, fora isso,
 * só quando a última sincronização gravada envelheceu — o polling do iFood a cada 30s regravava a
 * mesma linha 5.760 vezes por dia sem nenhuma venda. `null` = nada a gravar.
 */
export function resolveIntegrationStatusUpdate({
	integration,
	summary,
	now,
	staleAfterMs = INTEGRATION_SYNC_STATUS_STALE_MS,
}: {
	integration: Pick<TDataSourceIntegration, "status" | "ultimoErro" | "dataUltimaSincronizacao">;
	summary: Pick<TDataCollectingV2RunSummary, "importedSalesCount" | "saleIdCollisionsCount">;
	now: Date;
	staleAfterMs?: number;
}): TIntegrationStatusUpdate | null {
	const ultimoErro = summary.saleIdCollisionsCount > 0 ? describeSaleIdCollisions(summary.saleIdCollisionsCount) : null;
	const update: TIntegrationStatusUpdate = { dataUltimaSincronizacao: now, status: "CONECTADO", ultimoErro };

	if (summary.importedSalesCount > 0) return update;
	if (integration.status !== "CONECTADO") return update;
	if ((integration.ultimoErro ?? null) !== ultimoErro) return update;
	if (!integration.dataUltimaSincronizacao) return update;
	if (now.getTime() - integration.dataUltimaSincronizacao.getTime() >= staleAfterMs) return update;
	return null;
}
