import "@/utils/scripts/load-next-env";

import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { groupIntegrationsByOrganization, runFetchThenPersistByOrganization } from "@/lib/data-collecting-v2/run-plan";
import { fetchConnectorImportBatch, type TCanonicalImportBatch, type TCanonicalImportWindow } from "@/lib/data-connectors";
import { getActiveDataSourceIntegrations, type TDataSourceIntegration } from "@/lib/integrations/data-sources";
import { connection, db } from "@/services/drizzle";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Benchmark da BUSCA do data-collecting (nada é gravado: sem transação, sem efeitos, sem ACK).
 *
 * Três rodadas sobre as mesmas integrações ativas, na janela de hoje:
 *   1. SERIAL      — desenho anterior: organizações em paralelo (4), integrações da mesma org em série.
 *   2. PARALELO    — desenho novo, run completo: buscas em paralelo (6), qualquer organização.
 *   3. INCREMENTAL — desenho novo, run incremental: as assinaturas de listagem da rodada 2 fazem o
 *                    papel das gravadas em produção, então Bling/Cardápio Web pulam o detalhe do que
 *                    não mudou entre as duas rodadas.
 *
 * iFood fica de fora: tem o próprio polling de 30 s e a busca dele consome eventos da fila.
 * A rodada 1 já usa os limitadores por conta (Bling/Cardápio Web), então subestima o desenho antigo.
 *
 * Uso: npm run bench:data-collecting-fetch [-- --org=<organizacaoId>] [-- --types=BLING,CARDAPIO-WEB]
 */

const ORGANIZATION_CONCURRENCY = 4;
const FETCH_CONCURRENCY = 6;
const TIMEZONE = process.env.DATA_COLLECTING_TIMEZONE ?? "America/Sao_Paulo";

type TFetchSample = { integrationId: string; type: string; organizationId: string; fetchMs: number; sales: number; error: string | null };
type TRoundResult = { label: string; wallMs: number; samples: Map<string, TFetchSample> };

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function getTodayWindow(): TCanonicalImportWindow {
	const reference = dayjs().tz(TIMEZONE);
	return { startDate: reference.startOf("day").toDate(), endDate: reference.endOf("day").toDate() };
}

async function timedFetch({
	integration,
	window,
	knownSignatures,
}: {
	integration: TDataSourceIntegration;
	window: TCanonicalImportWindow;
	knownSignatures?: Map<string, string>;
}): Promise<{ sample: TFetchSample; batch: TCanonicalImportBatch | null }> {
	const startedAt = Date.now();
	try {
		const batch = await fetchConnectorImportBatch({
			organizationId: integration.organizacaoId,
			integrationId: integration.id,
			config: integration.configuracao,
			window,
			resolveKnownListingSignatures: knownSignatures ? async () => knownSignatures : undefined,
		});
		return {
			sample: {
				integrationId: integration.id,
				type: integration.tipo,
				organizationId: integration.organizacaoId,
				fetchMs: Date.now() - startedAt,
				sales: batch.sales.length,
				error: null,
			},
			batch,
		};
	} catch (error) {
		return {
			sample: {
				integrationId: integration.id,
				type: integration.tipo,
				organizationId: integration.organizacaoId,
				fetchMs: Date.now() - startedAt,
				sales: 0,
				error: error instanceof Error ? error.message : String(error),
			},
			batch: null,
		};
	}
}

async function runSerialRound(integrations: TDataSourceIntegration[], window: TCanonicalImportWindow): Promise<TRoundResult> {
	const samples = new Map<string, TFetchSample>();
	const startedAt = Date.now();
	await mapWithConcurrency(groupIntegrationsByOrganization(integrations), ORGANIZATION_CONCURRENCY, async (group) => {
		for (const integration of group) {
			const { sample } = await timedFetch({ integration, window });
			samples.set(integration.id, sample);
		}
	});
	return { label: "SERIAL", wallMs: Date.now() - startedAt, samples };
}

async function runParallelRound({
	label,
	integrations,
	window,
	knownSignaturesByIntegration,
	onBatch,
}: {
	label: string;
	integrations: TDataSourceIntegration[];
	window: TCanonicalImportWindow;
	knownSignaturesByIntegration?: Map<string, Map<string, string>>;
	onBatch?: (integration: TDataSourceIntegration, batch: TCanonicalImportBatch) => void;
}): Promise<TRoundResult> {
	const samples = new Map<string, TFetchSample>();
	const startedAt = Date.now();
	await runFetchThenPersistByOrganization({
		items: integrations,
		fetchConcurrency: FETCH_CONCURRENCY,
		organizationConcurrency: ORGANIZATION_CONCURRENCY,
		fetch: (integration) =>
			timedFetch({
				integration,
				window,
				knownSignatures: knownSignaturesByIntegration ? (knownSignaturesByIntegration.get(integration.id) ?? new Map()) : undefined,
			}),
		// "Gravação" vazia: só registra a amostra. A ordem e a concorrência são as do run real.
		persist: async (integration, fetched) => {
			if (!fetched.ok) throw fetched.error;
			samples.set(integration.id, fetched.value.sample);
			if (fetched.value.batch) onBatch?.(integration, fetched.value.batch);
		},
	});
	return { label, wallMs: Date.now() - startedAt, samples };
}

function printReport(integrations: TDataSourceIntegration[], rounds: TRoundResult[]) {
	const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
	console.log("\n=== Tempo de parede por rodada (só busca) ===");
	for (const round of rounds) console.log(`${round.label.padEnd(12)} ${seconds(round.wallMs)}`);

	console.log("\n=== Busca por integração (tempo / vendas no lote) ===");
	console.log(["tipo".padEnd(16), "integração".padEnd(38), ...rounds.map((round) => round.label.padStart(18))].join(" "));
	for (const integration of [...integrations].sort((a, b) => a.tipo.localeCompare(b.tipo))) {
		const cells = rounds.map((round) => {
			const sample = round.samples.get(integration.id);
			if (!sample) return "—".padStart(18);
			if (sample.error) return `ERRO ${seconds(sample.fetchMs)}`.padStart(18);
			return `${seconds(sample.fetchMs)} / ${sample.sales}`.padStart(18);
		});
		console.log([integration.tipo.padEnd(16), integration.id.padEnd(38), ...cells].join(" "));
	}

	const errors = rounds.flatMap((round) =>
		[...round.samples.values()].filter((sample) => sample.error).map((sample) => ({ round: round.label, ...sample })),
	);
	if (errors.length > 0) {
		console.log("\n=== Erros ===");
		for (const error of errors) console.log(`${error.round} ${error.type} ${error.integrationId}: ${error.error}`);
	}
}

async function main() {
	const organizationId = getArgValue("org");
	const types = getArgValue("types")?.split(",").filter(Boolean) ?? null;
	const window = getTodayWindow();

	const integrations = (await getActiveDataSourceIntegrations({ executor: db })).filter(
		(integration) =>
			integration.tipo !== "IFOOD" && (!organizationId || integration.organizacaoId === organizationId) && (!types || types.includes(integration.tipo)),
	);
	console.log(
		`[BENCH] ${integrations.length} integração(ões), janela ${window.startDate.toISOString()} → ${window.endDate.toISOString()}:`,
		integrations.map((integration) => `${integration.tipo}:${integration.id}`).join(", "),
	);

	console.log("\n[BENCH] Rodada 1/3: SERIAL...");
	const serial = await runSerialRound(integrations, window);

	console.log("\n[BENCH] Rodada 2/3: PARALELO (completo)...");
	const knownSignaturesByIntegration = new Map<string, Map<string, string>>();
	const parallel = await runParallelRound({
		label: "PARALELO",
		integrations,
		window,
		onBatch: (integration, batch) => {
			const signatures = new Map<string, string>();
			for (const sale of batch.sales) if (sale.listingSignature) signatures.set(sale.sourceSaleId, sale.listingSignature);
			knownSignaturesByIntegration.set(integration.id, signatures);
		},
	});

	console.log("\n[BENCH] Rodada 3/3: INCREMENTAL...");
	const incremental = await runParallelRound({ label: "INCREMENTAL", integrations, window, knownSignaturesByIntegration });

	printReport(integrations, [serial, parallel, incremental]);
}

main()
	.catch((error) => {
		console.error("[BENCH] Falha:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
