import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { formatDurationMs } from "@/lib/formatting";
import { type DBTransaction, db } from "@/services/drizzle";
import { clients, organizations, productClientReferences, products, saleItems, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { eq, max, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// Calculadas a cada execução: no escopo do módulo as datas congelavam no boot da instância, e uma
// instância quente reaproveitada pelo cron seguinte usava a janela da véspera.
function getProductReferenceWindows() {
	return [
		{ label: "GERAL" as const, startDate: null },
		{ label: "30_DIAS" as const, startDate: dayjs().subtract(30, "day").startOf("day").toDate() },
		{ label: "90_DIAS" as const, startDate: dayjs().subtract(90, "day").startOf("day").toDate() },
	];
}
type TProductReferenceWindow = ReturnType<typeof getProductReferenceWindows>[number];

// Orçamento da execução: a função morre em 300 s (maxDuration) e o rollback da transação da org em
// andamento descarta o trabalho dela. Só começa uma org nova enquanto sobra folga; as que ficarem
// para trás são as mais desatualizadas da próxima execução (ver ordenação em getOrganizationsToSync).
const RUN_TIME_BUDGET_MS = 170_000;
// Uma org atualizada há menos que isso é pulada: as execuções extras da madrugada só pegam o resto.
const MIN_REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000;

const VALID_SALE_STATUS = "CONFIRMADA";

// Suggested-product (cross-sell) computation knobs.
const SUGGESTION_CO_PRODUCTS_PER_SEED = 30; // keep only the strongest co-products per seed before fanning out to clients
const SUGGESTION_RECENT_WINDOW_DAYS = 365; // co-occurrence lookback window
const SUGGESTION_SEED_LIMIT_PER_CLIENT = 20; // top-K of the client's own products used as seeds
const SUGGESTION_MIN_CO_OCCURRENCE = 2; // prune noisy pairs seen together fewer than this many times
const SUGGESTION_GROUP_BOOST = 1.25; // content-based reinforcement when candidate shares the client's favorite group
const SUGGESTION_FALLBACK_POOL = 50; // cap best-seller pool so the fallback cross join stays bounded

type TOrganizationSyncSummary = {
	organizationId: string;
	rowsGenerated: number;
	durationMs: number;
};

async function insertWindowReferences({
	tx,
	organizationId,
	windowLabel,
	startDate,
}: {
	tx: DBTransaction;
	organizationId: string;
	windowLabel: TProductReferenceWindow["label"];
	startDate: Date | null;
}) {
	const startDateIso = startDate?.toISOString() ?? null;
	const dateFilter = startDateIso ? sql`and ${sales.dataVenda} >= ${startDateIso}::timestamp` : sql``;

	await tx.execute(sql`
		insert into ${productClientReferences} (
			id,
			organizacao_id,
			produto_id,
			produto_variante_id,
			cliente_id,
			total_compras_quantidade,
			total_compras_valor,
			ranking_valor,
			janela,
			primeira_compra_data,
			ultima_compra_data,
			data_ultima_atualizacao
		)
		select
			gen_random_uuid()::varchar as id,
			${organizationId}::varchar as organizacao_id,
			${saleItems.produtoId} as produto_id,
			null::varchar as produto_variante_id,
			${saleItems.clienteId} as cliente_id,
			cast(round(coalesce(sum(${saleItems.quantidade}), 0)) as integer) as total_compras_quantidade,
			coalesce(sum(${saleItems.valorVendaTotalLiquido}), 0)::double precision as total_compras_valor,
			-- Ranking calculado aqui (mesma ordem do antigo UPDATE de recomputeRankings): evita reescrever
			-- todas as linhas da org numa segunda passada (~40 s por noite na maior org).
			row_number() over (
				partition by ${saleItems.produtoId}
				order by
					coalesce(sum(${saleItems.valorVendaTotalLiquido}), 0) desc,
					cast(round(coalesce(sum(${saleItems.quantidade}), 0)) as integer) desc,
					max(${sales.dataVenda}) desc nulls last,
					${saleItems.clienteId} asc
			)::integer as ranking_valor,
			${windowLabel}::product_client_reference_window as janela,
			min(${sales.dataVenda}) as primeira_compra_data,
			max(${sales.dataVenda}) as ultima_compra_data,
			now()::timestamp as data_ultima_atualizacao
		from ${saleItems}
		inner join ${sales}
			on ${saleItems.vendaId} = ${sales.id}
		where ${saleItems.organizacaoId} = ${organizationId}
			and ${sales.organizacaoId} = ${organizationId}
			and ${saleItems.clienteId} is not null
			and ${sales.statusVenda} = ${VALID_SALE_STATUS}
			${dateFilter}
		group by ${saleItems.produtoId}, ${saleItems.clienteId}
		having coalesce(sum(${saleItems.quantidade}), 0) > 0
			or coalesce(sum(${saleItems.valorVendaTotalLiquido}), 0) > 0
	`);
}

/**
 * Computes a cross-sell "suggested product" per client and denormalizes it onto `clients.metadata_produto_sugerido_id`.
 *
 * Strategy (hybrid, basket-expansion intent):
 *  - item-item collaborative filtering: products co-purchased with the products the client already buys;
 *  - excludes products the client already buys (this is a discovery/expansion signal, distinct from "favorite product");
 *  - content-based reinforcement: candidates sharing the client's favorite group get a small boost;
 *  - the per-client #1 ranked candidate wins.
 *
 * Runs against `productClientReferences`, which must already be populated for the org in this transaction.
 */
async function computeSuggestedProductsForOrganization({ tx, organizationId }: { tx: DBTransaction; organizationId: string }) {
	const windowStartIso = dayjs().subtract(SUGGESTION_RECENT_WINDOW_DAYS, "day").startOf("day").toDate().toISOString();

	// Clear stale suggestions first: clients that lost their signal must end up null, not keep an outdated product.
	await tx.update(clients).set({ metadataProdutoSugeridoId: null }).where(eq(clients.organizacaoId, organizationId));

	await tx.execute(sql`
		with
		-- 0. One row per (sale, product) in the window: the self-join below then counts sales with count(*)
		--    instead of count(distinct), and repeated lines of the same product don't multiply the pairs.
		sale_products as (
			select distinct si.venda_id, si.produto_id
			from ${sales} s
			join ${saleItems} si on si.venda_id = s.id
			where s.organizacao_id = ${organizationId}
				and si.organizacao_id = ${organizationId}
				and s.status_venda = ${VALID_SALE_STATUS}
				and s.data_venda >= ${windowStartIso}::timestamp
		),
		-- 1. Org-wide item-item matrix: "buyers of A also bought B" (distinct sales, recent window).
		pair_counts as (
			select a.produto_id as seed_id, b.produto_id as co_id, count(*)::double precision as co_count
			from sale_products a
			join sale_products b on b.venda_id = a.venda_id and b.produto_id <> a.produto_id
			group by a.produto_id, b.produto_id
			having count(*) >= ${SUGGESTION_MIN_CO_OCCURRENCE}
		),
		-- 1b. Only active candidates, and only the strongest co-products per seed. Without the cap the
		--     fan-out to clients reached ~4.8M rows (sorted on disk) in the largest orgs; a co-product
		--     outside a seed's top-N contributes too little to beat the top candidates.
		pair_scores as (
			select seed_id, co_id, co_count from (
				select pc.seed_id, pc.co_id, pc.co_count,
					row_number() over (partition by pc.seed_id order by pc.co_count desc, pc.co_id asc) as co_rank
				from pair_counts pc
				join ${products} cand on cand.id = pc.co_id and cand.ativo = true
			) ranked_pairs
			where co_rank <= ${SUGGESTION_CO_PRODUCTS_PER_SEED}
		),
		-- 2. Seeds: top-K products the client already buys (weighted by spend), GERAL window.
		client_seed as (
			select cliente_id, produto_id, total_compras_valor,
				row_number() over (partition by cliente_id order by total_compras_valor desc) as seed_rank
			from ${productClientReferences}
			where organizacao_id = ${organizationId} and janela = 'GERAL'
		),
		-- 3. Client's favorite group, for the content-based boost.
		client_top_group as (
			select cliente_id, grupo from (
				select cs.cliente_id, p.grupo,
					row_number() over (partition by cs.cliente_id order by sum(cs.total_compras_valor) desc) as grupo_rank
				from client_seed cs
				join ${products} p on p.id = cs.produto_id
				group by cs.cliente_id, p.grupo
			) ranked_groups
			where grupo_rank = 1
		),
		-- 4. Candidates: co-products of the seeds, EXCLUDING what the client already buys.
		candidate_scores as (
			select cs.cliente_id, ps.co_id as produto_id,
				sum(ps.co_count * cs.total_compras_valor)
					* (case when cand.grupo = ctg.grupo then ${SUGGESTION_GROUP_BOOST} else 1.0 end) as score
			from client_seed cs
			join pair_scores ps on ps.seed_id = cs.produto_id
			join ${products} cand on cand.id = ps.co_id
			left join client_top_group ctg on ctg.cliente_id = cs.cliente_id
			where cs.seed_rank <= ${SUGGESTION_SEED_LIMIT_PER_CLIENT}
				and not exists (
					select 1 from client_seed owned
					where owned.cliente_id = cs.cliente_id and owned.produto_id = ps.co_id
				)
			group by cs.cliente_id, ps.co_id, cand.grupo, ctg.grupo
		),
		ranked as (
			select cliente_id, produto_id,
				row_number() over (partition by cliente_id order by score desc, produto_id asc) as rnk
			from candidate_scores
		)
		update ${clients} as c
		set metadata_produto_sugerido_id = ranked.produto_id
		from ranked
		where ranked.rnk = 1 and c.id = ranked.cliente_id and c.organizacao_id = ${organizationId}
	`);
}

/**
 * Fallback for clients with no personalized cross-sell signal (e.g. single-purchase clients):
 * suggest the org's best seller (by quantity, recent window) that the client does not already buy.
 */
async function computeSuggestedProductsFallbackForOrganization({ tx, organizationId }: { tx: DBTransaction; organizationId: string }) {
	const windowStartIso = dayjs().subtract(SUGGESTION_RECENT_WINDOW_DAYS, "day").startOf("day").toDate().toISOString();

	await tx.execute(sql`
		with
		best_sellers as (
			select si.produto_id,
				row_number() over (order by sum(si.quantidade) desc, si.produto_id asc) as rnk
			from ${saleItems} si
			join ${sales} s on si.venda_id = s.id
			join ${products} p on p.id = si.produto_id and p.ativo = true
			where si.organizacao_id = ${organizationId}
				and s.organizacao_id = ${organizationId}
				and s.status_venda = ${VALID_SALE_STATUS}
				and s.data_venda >= ${windowStartIso}::timestamp
			group by si.produto_id
		),
		-- Pick, per client missing a suggestion, the top best seller they do not already buy.
		fallback as (
			select c.id as cliente_id, bs.produto_id,
				row_number() over (partition by c.id order by bs.rnk asc) as rnk
			from ${clients} c
			join best_sellers bs on bs.rnk <= ${SUGGESTION_FALLBACK_POOL}
			where c.organizacao_id = ${organizationId}
				and c.metadata_produto_sugerido_id is null
				and not exists (
					select 1 from ${productClientReferences} owned
					where owned.organizacao_id = ${organizationId}
						and owned.cliente_id = c.id
						and owned.janela = 'GERAL'
						and owned.produto_id = bs.produto_id
				)
		)
		update ${clients} as c
		set metadata_produto_sugerido_id = fallback.produto_id
		from fallback
		where fallback.rnk = 1 and c.id = fallback.cliente_id and c.organizacao_id = ${organizationId}
	`);
}

async function syncProductClientReferencesForOrganization(organizationId: string): Promise<TOrganizationSyncSummary> {
	const startedAt = Date.now();

	await db.transaction(async (tx) => {
		await tx.delete(productClientReferences).where(eq(productClientReferences.organizacaoId, organizationId));

		for (const windowConfig of getProductReferenceWindows()) {
			await insertWindowReferences({
				tx,
				organizationId,
				windowLabel: windowConfig.label,
				startDate: windowConfig.startDate,
			});
		}

		await computeSuggestedProductsForOrganization({ tx, organizationId });
		await computeSuggestedProductsFallbackForOrganization({ tx, organizationId });
	});

	const [countResult] = await db
		.select({
			value: sql<number>`count(*)`,
		})
		.from(productClientReferences)
		.where(eq(productClientReferences.organizacaoId, organizationId));

	return {
		organizationId,
		rowsGenerated: Number(countResult?.value ?? 0),
		durationMs: Date.now() - startedAt,
	};
}

/**
 * Orgs ordered by how stale their references are (never synced first). The previous order was the
 * table's physical order, so the same orgs at the end of the list were cut by the timeout every night.
 */
async function getOrganizationsToSync() {
	const lastRefreshByOrganization = db
		.select({
			organizacaoId: productClientReferences.organizacaoId,
			lastRefresh: max(productClientReferences.dataUltimaAtualizacao).as("last_refresh"),
		})
		.from(productClientReferences)
		.groupBy(productClientReferences.organizacaoId)
		.as("last_refresh_by_organization");

	return db
		.select({ id: organizations.id, lastRefresh: lastRefreshByOrganization.lastRefresh })
		.from(organizations)
		.leftJoin(lastRefreshByOrganization, eq(lastRefreshByOrganization.organizacaoId, organizations.id))
		.orderBy(sql`${lastRefreshByOrganization.lastRefresh} asc nulls first`);
}

async function getProductClientReferencesRoute(_req: NextRequest) {
	const startedAt = Date.now();
	console.log("[INFO] [PRODUCT_CLIENT_REFERENCES] Starting product client references sync cron job");

	const allOrganizations = await getOrganizationsToSync();
	const organizationsToSync = allOrganizations.filter(
		(organization) => !organization.lastRefresh || startedAt - new Date(organization.lastRefresh).getTime() > MIN_REFRESH_INTERVAL_MS,
	);

	let processedOrganizations = 0;
	let failedOrganizations = 0;
	let deferredOrganizations = 0;
	let totalRowsGenerated = 0;
	const organizationsSummary: TOrganizationSyncSummary[] = [];

	for (const organization of organizationsToSync) {
		if (Date.now() - startedAt > RUN_TIME_BUDGET_MS) {
			deferredOrganizations = organizationsToSync.length - processedOrganizations - failedOrganizations;
			console.warn(`[INFO] [PRODUCT_CLIENT_REFERENCES] Time budget reached; ${deferredOrganizations} organization(s) deferred to the next run.`);
			break;
		}
		try {
			console.log(`[ORG: ${organization.id}] [PRODUCT_CLIENT_REFERENCES] Recomputing product client references...`);
			const summary = await syncProductClientReferencesForOrganization(organization.id);
			organizationsSummary.push(summary);
			processedOrganizations += 1;
			totalRowsGenerated += summary.rowsGenerated;
			console.log(
				`[ORG: ${organization.id}] [PRODUCT_CLIENT_REFERENCES] Sync completed in ${formatDurationMs(summary.durationMs)} | rows=${summary.rowsGenerated}`,
			);
		} catch (error) {
			failedOrganizations += 1;
			console.error(`[ORG: ${organization.id}] [PRODUCT_CLIENT_REFERENCES] Failed to recompute references`, error);
		}
	}

	const durationMs = Date.now() - startedAt;
	console.log(
		`[INFO] [PRODUCT_CLIENT_REFERENCES] Finished in ${formatDurationMs(durationMs)} | organizations=${processedOrganizations}/${organizationsToSync.length} | skipped_fresh=${allOrganizations.length - organizationsToSync.length} | deferred=${deferredOrganizations} | failed=${failedOrganizations} | rows=${totalRowsGenerated}`,
	);

	return NextResponse.json({
		message: "Referências de produto por cliente sincronizadas com sucesso.",
		data: {
			organizationsCount: allOrganizations.length,
			processedOrganizations,
			deferredOrganizations,
			failedOrganizations,
			totalRowsGenerated,
			durationMs,
			organizationsSummary,
		},
	});
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = appApiHandler({
	GET: async (req) => {
		assertCronAuthorized(req);
		return getProductClientReferencesRoute(req);
	},
});
