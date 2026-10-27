import "@/utils/scripts/load-next-env";

import { parseArgs } from "node:util";

import { recomputeClientMetricsForOrganization } from "@/lib/clients/recompute-metrics";
import { persistCanonicalBatch } from "@/lib/data-collecting-v2";
import { bulkPersistHistoricalBatch } from "@/lib/integrations/import-jobs/bulk-persist";
import { sqlViewsDataConnector } from "@/lib/data-connectors/sql-views";
import { connectDataSourceIntegration, isUsableDataSourceIntegration } from "@/lib/integrations/data-sources";
import { SqlViewsIntegrationConfigSchema, type TSqlViewsIntegrationConfig } from "@/schemas/integrations";
import { connection, db } from "@/services/drizzle";
import { integrations } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import timezone from "dayjs/plugin/timezone";
import minMax from "dayjs/plugin/minMax";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(minMax);

/**
 * Operação do conector SQL-VIEWS (ERPs locais com views `vw_recompra_*`).
 *
 *   fetch    Busca e mapeia uma janela SEM gravar nada. Credenciais por flags (teste antes de
 *            conectar) ou da conexão existente (--integration).
 *   connect  Cria uma conexão por loja na organização (--org, --store, --apelido) DESATIVADA: o
 *            cron só a enxerga depois do `activate`.
 *   backfill Carga histórica de uma conexão (--integration, --from, [--to], [--step-days 30]), em modo
 *            HISTORICO (sem cashback, campanhas nem atribuição). Idempotente: venda inalterada é
 *            pulada, então rodar de novo retoma de onde parou.
 *   activate Liga a conexão (--integration) para o cron de 5 minutos.
 *
 * Ordem: connect → backfill → activate. Ativar antes do histórico faz toda primeira venda
 * importada de um cliente parecer primeira compra (campanhas e cashback disparam sobre ela).
 *
 * A senha vem de SQL_VIEWS_PASSWORD para não ficar no histórico do shell.
 *
 *   npm run sql-views -- fetch --host franfarma.ddns.net --port 15432 --database ansg \
 *     --username recompracrmfranfarma --store 1 --anonymous-client 30015372 --date 2026-10-27
 *   npm run sql-views -- connect --org <orgId> --store 1 --apelido "Fran Farma - Loja 1" ...
 */

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		host: { type: "string" },
		port: { type: "string", default: "5432" },
		database: { type: "string" },
		schema: { type: "string", default: "recompracrm" },
		username: { type: "string" },
		ssl: { type: "boolean", default: false },
		store: { type: "string" },
		"anonymous-client": { type: "string", multiple: true, default: [] },
		integration: { type: "string" },
		org: { type: "string" },
		apelido: { type: "string" },
		date: { type: "string" },
		from: { type: "string" },
		to: { type: "string" },
		days: { type: "string", default: "1" },
		"step-days": { type: "string", default: "30" },
	},
});

const TIMEZONE = "America/Sao_Paulo";

function buildConfigFromFlags(): TSqlViewsIntegrationConfig {
	const password = process.env.SQL_VIEWS_PASSWORD;
	if (!values.host || !values.database || !values.username || !password) {
		throw new Error("Informe --host, --database, --username e a senha em SQL_VIEWS_PASSWORD.");
	}
	return SqlViewsIntegrationConfigSchema.parse({
		tipo: "SQL-VIEWS",
		host: values.host,
		port: Number(values.port),
		database: values.database,
		schema: values.schema,
		username: values.username,
		password,
		ssl: values.ssl,
		storeId: values.store ?? null,
		anonymousClientIds: values["anonymous-client"],
	});
}

/** Ativa ou não: o backfill roda justamente enquanto a conexão está desligada. */
async function loadSqlViewsIntegration(integrationId: string | undefined) {
	if (!integrationId) throw new Error("Informe --integration.");
	const row = await db.query.integrations.findFirst({ where: eq(integrations.id, integrationId) });
	if (!row || !isUsableDataSourceIntegration(row) || row.configuracao.tipo !== "SQL-VIEWS") {
		throw new Error(`Conexão SQL-VIEWS ${integrationId} não encontrada.`);
	}
	return row;
}

async function resolveConfig() {
	if (!values.integration) return { organizationId: values.org ?? "dry-run", integrationId: "dry-run", config: buildConfigFromFlags() };
	const row = await loadSqlViewsIntegration(values.integration);
	return { organizationId: row.organizacaoId, integrationId: row.id, config: row.configuracao };
}

async function runFetch() {
	const { organizationId, integrationId, config } = await resolveConfig();
	const reference = values.date ? dayjs.tz(values.date, TIMEZONE) : dayjs().tz(TIMEZONE);
	const window = {
		startDate: reference
			.subtract(Number(values.days) - 1, "day")
			.startOf("day")
			.toDate(),
		endDate: reference.endOf("day").toDate(),
	};
	const batch = await sqlViewsDataConnector.fetchImportBatch({ organizationId, integrationId, config, window });

	const valid = batch.sales.filter((sale) => sale.isValidSale);
	const canceled = batch.sales.filter((sale) => sale.isCanceled);
	const withClient = batch.sales.filter((sale) => !!sale.client);
	console.log({
		window: { start: window.startDate.toISOString(), end: window.endDate.toISOString() },
		sales: batch.sales.length,
		valid: valid.length,
		canceled: canceled.length,
		validTotal: Number(valid.reduce((total, sale) => total + sale.totalValue, 0).toFixed(2)),
		withClient: withClient.length,
		withClientPhone: withClient.filter((sale) => !!sale.client?.basePhone).length,
		withBirthDate: withClient.filter((sale) => !!sale.client?.birthDate).length,
		withoutItems: batch.sales.filter((sale) => sale.items.length === 0).length,
		products: batch.products.length,
		sellers: batch.sellers.length,
	});
	const sample = batch.sales.find((sale) => sale.client && sale.items.length > 0) ?? batch.sales[0];
	if (sample) console.dir({ ...sample, raw: undefined }, { depth: 4 });
}

async function runConnect() {
	if (!values.org || !values.store || !values.apelido) throw new Error("Informe --org, --store e --apelido.");
	const config = buildConfigFromFlags();
	const { integration, reconnected } = await connectDataSourceIntegration({
		executor: db,
		organizationId: values.org,
		config,
		apelido: values.apelido,
	});
	await db.update(integrations).set({ ativo: false }).where(eq(integrations.id, integration.id));
	console.log(
		`${reconnected ? "Reconectada" : "Criada"} DESATIVADA: ${integration.id} (${integration.apelido}) refExterno=${integration.refExterno}. Rode o backfill e depois o activate.`,
	);
}

async function runActivate() {
	const integration = await loadSqlViewsIntegration(values.integration);
	await db.update(integrations).set({ ativo: true, dataDesativacao: null }).where(eq(integrations.id, integration.id));
	console.log(`Ativada: ${integration.id} (${integration.apelido}). O cron de 5 minutos passa a sincronizá-la.`);
}

const BACKFILL_SALES_PER_TRANSACTION = 500;
const SERIALIZATION_RETRY_ATTEMPTS = 3;

/**
 * O trigger de histórico de compras toma um `pg_try_advisory_xact_lock` por cliente e falha com
 * 40001 se outra compra do mesmo cliente estiver em andamento (ex.: PDV). O lote inteiro é
 * desfeito, então repetir é seguro.
 */
async function withSerializationRetry<T>(run: () => Promise<T>): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await run();
		} catch (error) {
			const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
			if (code !== "40001" || attempt >= SERIALIZATION_RETRY_ATTEMPTS) throw error;
			console.warn(`[BACKFILL] Lote em conflito com outra compra do mesmo cliente; tentativa ${attempt + 1}...`);
			await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
		}
	}
}

/**
 * Uma consulta por janela (o custo da view é quase fixo por consulta); gravação em lotes de 500
 * vendas pelo caminho em lote de carga histórica (`bulkPersistHistoricalBatch`).
 */
async function runBackfill() {
	if (!values.from) throw new Error("Informe --from (YYYY-MM-DD).");
	const integration = await loadSqlViewsIntegration(values.integration);
	const stepDays = Number(values["step-days"]);

	const lastDay = values.to ? dayjs.tz(values.to, TIMEZONE) : dayjs().tz(TIMEZONE).subtract(1, "day");
	const totals = { sales: 0, created: 0, updated: 0, clients: 0 };
	const startedAt = Date.now();
	for (let windowStart = dayjs.tz(values.from, TIMEZONE); !windowStart.isAfter(lastDay, "day"); windowStart = windowStart.add(stepDays, "day")) {
		const windowEnd = dayjs.min(windowStart.add(stepDays - 1, "day"), lastDay)!;
		const window = { startDate: windowStart.startOf("day").toDate(), endDate: windowEnd.endOf("day").toDate() };
		const batch = await sqlViewsDataConnector.fetchImportBatch({
			organizationId: integration.organizacaoId,
			integrationId: integration.id,
			config: integration.configuracao,
			window,
		});

		for (let offset = 0; offset < batch.sales.length; offset += BACKFILL_SALES_PER_TRANSACTION) {
			const sales = batch.sales.slice(offset, offset + BACKFILL_SALES_PER_TRANSACTION);
			const productCodes = new Set(sales.flatMap((sale) => sale.items.map((item) => item.productCode)));
			const sellerIdentifiers = new Set(sales.map((sale) => sale.seller?.identifier).filter(Boolean));
			const chunkBatch = {
				...batch,
				integrationId: integration.id,
				sales,
				products: batch.products.filter((product) => productCodes.has(product.code)),
				sellers: batch.sellers.filter((seller) => sellerIdentifiers.has(seller.identifier)),
			};

			const result = await withSerializationRetry(() => bulkPersistHistoricalBatch({ integration, batch: chunkBatch }));
			totals.sales += sales.length;
			totals.created += result.createdSalesCount;
			totals.clients += result.createdClientsCount;

			// Venda já importada (rerun) ou com modificadores: caminho normal; inalterada não escreve nada.
			if (result.fallbackSales.length > 0) {
				const { summary } = await withSerializationRetry(() =>
					persistCanonicalBatch({
						integration,
						organizationConfiguration: null,
						batch: { ...chunkBatch, sales: result.fallbackSales },
						effects: { processCashback: false, processCampaigns: false, processConversionAttribution: false },
						mode: "HISTORICO",
					}),
				);
				totals.created += summary.createdSalesCount;
				totals.updated += summary.updatedSalesCount;
			}
		}

		const elapsedSeconds = (Date.now() - startedAt) / 1000;
		console.log(
			`[BACKFILL] ${windowStart.format("YYYY-MM-DD")}..${windowEnd.format("YYYY-MM-DD")}: ${batch.sales.length} venda(s). Acumulado: ${totals.sales} venda(s), ${totals.created} criada(s), ${totals.clients} cliente(s) novo(s) em ${Math.round(elapsedSeconds)}s (${(totals.sales / elapsedSeconds).toFixed(1)} venda(s)/s).`,
		);
	}

	console.log("[BACKFILL] Recalculando métricas de clientes da organização...");
	await recomputeClientMetricsForOrganization({ organizationId: integration.organizacaoId });
	console.log("[BACKFILL] Concluído.", totals);
}

async function main() {
	const [command] = positionals;
	if (command === "fetch") await runFetch();
	else if (command === "connect") await runConnect();
	else if (command === "backfill") await runBackfill();
	else if (command === "activate") await runActivate();
	else throw new Error('Comando inválido. Use "fetch", "connect", "backfill" ou "activate".');
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
