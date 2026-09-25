import { runDataCollectingV2 } from "@/lib/data-collecting-v2";
import { getActiveDataSourceIntegrations, type TDataSourceIntegration } from "@/lib/integrations/data-sources";
import { connection, db } from "@/services/drizzle";

const IFOOD_POLLING_LOCK_NAMESPACE = 746_663; // "IFOOD" em um namespace privado da aplicacao.
const IFOOD_POLLING_LOCK_KEY = 1;
/**
 * Organizacoes consultadas no iFood em paralelo. O ciclo custa o poll mais lento, nao a soma: com
 * duas conexoes o tempo de rede caiu pela metade, e uma nova loja nao alonga o ciclo. Conexoes da
 * mesma organizacao seguem em serie (ver `groupIntegrationsByOrganization`).
 */
const IFOOD_POLLING_ORGANIZATION_CONCURRENCY = 4;

type TIfoodPollingCollectionResult = Awaited<ReturnType<typeof runDataCollectingV2>>;

export type TIfoodPollingCycle = {
	startedAt: string;
	finishedAt: string;
	durationMs: number;
	summaries: number;
	errors: number;
	result: TIfoodPollingCollectionResult;
};

export type TIfoodPollingResult = {
	state: "COMPLETED" | "SKIPPED_OVERLAP" | "NO_ACTIVE_INTEGRATIONS";
	integrationIds: string[];
	cycles: TIfoodPollingCycle[];
	durationMs: number;
};

async function collectIfoodIntegrations(integrations: TDataSourceIntegration[]): Promise<TIfoodPollingCycle> {
	const startedAt = new Date();
	// As linhas ja foram lidas sob o lock: passa-las adiante evita reler TODAS as fontes de dados
	// ativas (de todos os tipos e organizacoes, com config e tokens) a cada 30s.
	const result = await runDataCollectingV2({
		integrations,
		integrationIds: integrations.map((integration) => integration.id),
		organizationConcurrency: IFOOD_POLLING_ORGANIZATION_CONCURRENCY,
	});
	const finishedAt = new Date();

	return {
		startedAt: startedAt.toISOString(),
		finishedAt: finishedAt.toISOString(),
		durationMs: finishedAt.getTime() - startedAt.getTime(),
		summaries: result.summaries.length,
		errors: result.errors.length,
		result,
	};
}

/**
 * Executa um ciclo curto de polling do iFood. O Supabase Cron define a frequencia; o advisory lock
 * impede que uma chamada atrasada ou duplicada concorra com o ciclo anterior.
 */
export async function runIfoodPollingCycle(): Promise<TIfoodPollingResult> {
	const cycleStartedAt = Date.now();

	return connection.begin(async (transaction) => {
		const [lock] = await transaction<{ acquired: boolean }[]>`
			select pg_try_advisory_xact_lock(${IFOOD_POLLING_LOCK_NAMESPACE}, ${IFOOD_POLLING_LOCK_KEY}) as acquired
		`;
		if (!lock?.acquired) {
			console.warn("[IFOOD_POLLING_CRON] Ciclo ignorado porque outra invocacao ainda possui o lock.");
			return { state: "SKIPPED_OVERLAP", integrationIds: [], cycles: [], durationMs: Date.now() - cycleStartedAt };
		}

		const integrations = await getActiveDataSourceIntegrations({ executor: db, types: ["IFOOD"] });
		const integrationIds = integrations.map((integration) => integration.id);
		if (integrationIds.length === 0) {
			return { state: "NO_ACTIVE_INTEGRATIONS", integrationIds, cycles: [], durationMs: Date.now() - cycleStartedAt };
		}

		const cycle = await collectIfoodIntegrations(integrations);

		return {
			state: "COMPLETED",
			integrationIds,
			cycles: [cycle],
			durationMs: Date.now() - cycleStartedAt,
		};
	});
}
