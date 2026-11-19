import "dotenv/config";
import { processConversionAttribution } from "@/lib/conversions/attribution";
import { connection, db } from "@/services/drizzle";
import { campaignConversions, campaigns, organizations, sales } from "@/services/drizzle/schema";
import { and, asc, eq, gte, inArray, isNotNull, lte, sql, type SQL } from "drizzle-orm";

/**
 * Backfill of campaign conversion attribution for sales confirmed through the internal pipeline
 * (POS, tab, shop, drafts). Until the fix in process-sale-confirmation.ts these sales were never
 * attributed, so they sit with `atribuicao_processada = false`.
 *
 * Left out on purpose:
 * - POI sales (`canal` null): the POI route attributes on its own, and only when the organization has
 *   no integration; re-running it would credit sales that the integration already brings.
 * - Sales whose client was reassigned: the reassignment clears the attribution and deliberately does
 *   not redo it (the new client must not earn campaigns from a data operation).
 * - Sales that are not CONFIRMADA.
 *
 * Without --apply every sale is attributed inside a transaction that is rolled back, so the dry-run
 * report is exactly what --apply will write.
 */

type BackfillArgs = {
	apply: boolean;
	orgId: string | null;
	since: Date | null;
	until: Date | null;
	limit: number | null;
	concurrency: number;
};

class DryRunRollback extends Error {}

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const inlineArg = process.argv.find((arg) => arg.startsWith(prefix));
	if (inlineArg) return inlineArg.slice(prefix.length);
	const index = process.argv.indexOf(`--${name}`);
	if (index >= 0) return process.argv[index + 1] ?? null;
	return null;
}

function hasFlag(name: string) {
	return process.argv.includes(`--${name}`);
}

function parseDateArg(name: string) {
	const value = getArgValue(name);
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) throw new Error(`Valor inválido para --${name}: ${value}`);
	return date;
}

function parsePositiveIntArg(name: string, fallback: number | null) {
	const value = getArgValue(name);
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`--${name} deve ser um número inteiro positivo.`);
	return parsed;
}

function parseArgs(): BackfillArgs {
	return {
		apply: hasFlag("apply"),
		orgId: getArgValue("orgId"),
		since: parseDateArg("since"),
		until: parseDateArg("until"),
		limit: parsePositiveIntArg("limit", null),
		concurrency: parsePositiveIntArg("concurrency", 6) ?? 6,
	};
}

function printUsage() {
	console.log(`Uso:
  npm run backfill:internal-sale-conversion-attribution
  npm run backfill:internal-sale-conversion-attribution -- --apply
  npm run backfill:internal-sale-conversion-attribution -- --apply --orgId=<id> --since=2026-09-01 --until=2026-11-18

Opções:
  --apply         Persiste. Sem esta flag, atribui dentro de transações desfeitas (dry-run exato).
  --orgId         Filtra por organização.
  --since         Vendas com data_venda >= data.
  --until         Vendas com data_venda <= data.
  --limit         Máximo de vendas candidatas. Padrão: todas.
  --concurrency   Vendas processadas em paralelo. Padrão: 6.`);
}

async function findCandidateSales(args: BackfillArgs) {
	const conditions: SQL[] = [
		eq(sales.processamentoOrigem, "INTERNO"),
		isNotNull(sales.canal),
		eq(sales.statusVenda, "CONFIRMADA"),
		eq(sales.atribuicaoProcessada, false),
		isNotNull(sales.organizacaoId),
		isNotNull(sales.clienteId),
		isNotNull(sales.dataVenda),
		sql`not coalesce(${sales.rascunhoMetadados} -> 'edicoes' @> '[{"tipo":"CLIENTE"}]'::jsonb, false)`,
		sql`not exists (select 1 from ${campaignConversions} where ${campaignConversions.vendaId} = ${sales.id})`,
	];
	if (args.orgId) conditions.push(eq(sales.organizacaoId, args.orgId));
	if (args.since) conditions.push(gte(sales.dataVenda, args.since));
	if (args.until) conditions.push(lte(sales.dataVenda, args.until));

	const query = db
		.select({
			id: sales.id,
			organizacaoId: sales.organizacaoId,
			clienteId: sales.clienteId,
			valorTotal: sales.valorTotal,
			dataVenda: sales.dataVenda,
		})
		.from(sales)
		.where(and(...conditions))
		.orderBy(asc(sales.dataVenda), asc(sales.id));
	return args.limit ? query.limit(args.limit) : query;
}

type TCandidate = Awaited<ReturnType<typeof findCandidateSales>>[number];
type TOutcome = { sale: TCandidate; campanhaId: string | null } | { sale: TCandidate; error: unknown };

async function attributeSale(sale: TCandidate, apply: boolean): Promise<TOutcome> {
	let campanhaId: string | null = null;
	try {
		await db.transaction(async (tx) => {
			await processConversionAttribution(tx, {
				vendaId: sale.id,
				clienteId: sale.clienteId!,
				organizacaoId: sale.organizacaoId!,
				valorVenda: sale.valorTotal,
				dataVenda: sale.dataVenda!,
			});
			const [conversion] = await tx
				.select({ campanhaId: campaignConversions.campanhaId })
				.from(campaignConversions)
				.where(eq(campaignConversions.vendaId, sale.id))
				.limit(1);
			campanhaId = conversion?.campanhaId ?? null;
			if (!apply) throw new DryRunRollback();
		});
	} catch (error) {
		if (!(error instanceof DryRunRollback)) return { sale, error };
	}
	return { sale, campanhaId };
}

async function main() {
	if (hasFlag("help") || process.argv.includes("-h")) {
		printUsage();
		return;
	}

	const args = parseArgs();
	const tag = "[INTERNAL_SALE_ATTRIBUTION_BACKFILL]";
	const candidates = await findCandidateSales(args);
	console.log(`${tag} Modo: ${args.apply ? "APPLY" : "DRY-RUN"}`);
	console.log(`${tag} Candidatas: ${candidates.length}`);
	if (candidates.length === 0) return;

	const outcomes: TOutcome[] = [];
	let cursor = 0;
	async function worker() {
		while (cursor < candidates.length) {
			const sale = candidates[cursor++]!;
			outcomes.push(await attributeSale(sale, args.apply));
			if (outcomes.length % 250 === 0) console.log(`${tag} ${outcomes.length}/${candidates.length}`);
		}
	}
	await Promise.all(Array.from({ length: Math.min(args.concurrency, candidates.length) }, worker));

	const failures = outcomes.filter((outcome): outcome is Extract<TOutcome, { error: unknown }> => "error" in outcome);
	const attributed = outcomes.filter(
		(outcome): outcome is { sale: TCandidate; campanhaId: string } => "campanhaId" in outcome && !!outcome.campanhaId,
	);

	const campaignIds = [...new Set(attributed.map((outcome) => outcome.campanhaId))];
	const campaignRows = campaignIds.length
		? await db
				.select({ id: campaigns.id, titulo: campaigns.titulo, organizacao: organizations.nome })
				.from(campaigns)
				.innerJoin(organizations, eq(organizations.id, campaigns.organizacaoId))
				.where(inArray(campaigns.id, campaignIds))
		: [];
	const campaignById = new Map(campaignRows.map((row) => [row.id, row]));
	const byCampaign = new Map<string, { conversoes: number; clientes: Set<string>; receita: number }>();
	for (const { sale, campanhaId } of attributed) {
		const entry = byCampaign.get(campanhaId) ?? { conversoes: 0, clientes: new Set<string>(), receita: 0 };
		entry.conversoes += 1;
		entry.clientes.add(sale.clienteId!);
		entry.receita += sale.valorTotal;
		byCampaign.set(campanhaId, entry);
	}
	console.table(
		[...byCampaign.entries()]
			.map(([id, entry]) => ({
				organizacao: campaignById.get(id)?.organizacao ?? "?",
				campanha: campaignById.get(id)?.titulo ?? id,
				conversoes: entry.conversoes,
				clientes: entry.clientes.size,
				receita: Math.round(entry.receita * 100) / 100,
			}))
			.sort((a, b) => a.organizacao.localeCompare(b.organizacao) || b.conversoes - a.conversoes),
	);

	for (const failure of failures.slice(0, 10)) console.error(`${tag} Falha em ${failure.sale.id}:`, failure.error);
	console.log(
		`${tag} ${args.apply ? "Gravado" : "Simulado"}. Processadas: ${outcomes.length - failures.length}. Com conversão: ${attributed.length}. Sem campanha na janela: ${outcomes.length - failures.length - attributed.length}. Falhas: ${failures.length}.`,
	);
	if (failures.length > 0) process.exitCode = 1;
}

main()
	.catch((error) => {
		console.error("[INTERNAL_SALE_ATTRIBUTION_BACKFILL] Falha no backfill:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
