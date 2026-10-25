import "dotenv/config";
import { connection, db } from "@/services/drizzle";
import { accountingEntries, purchases, sales } from "@/services/drizzle/schema";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

/**
 * Backfill de 0140_accounting_entry_counterparty_and_purchase_tax.sql (ADR-0002, Fase 5). Rodar
 * DEPOIS da migração e do deploy; cada etapa é idempotente e pode ser repetida.
 *
 *   npx tsx ./scripts/backfill-accounting-entry-counterparties.ts --dry-run
 *   npx tsx ./scripts/backfill-accounting-entry-counterparties.ts
 *   npx tsx ./scripts/backfill-accounting-entry-counterparties.ts --only=sales
 *
 * Etapas:
 *   sales      lançamentos com `venda_id` e sem `cliente_id` recebem o cliente da venda.
 *   purchases  lançamentos apontados por `purchases.lancamento_contabil_id` recebem `compra_id` e o
 *              fornecedor da compra (quando a compra tem `fornecedor_id`).
 *
 * Nada é sobrescrito: só colunas nulas são preenchidas.
 */

const ALL_STEPS = ["sales", "purchases"] as const;
type TStep = (typeof ALL_STEPS)[number];

const dryRun = process.argv.includes("--dry-run");
const onlyArgument = process.argv.find((argument) => argument.startsWith("--only="));
const requestedSteps = onlyArgument
	? onlyArgument
			.slice("--only=".length)
			.split(",")
			.filter((step): step is TStep => (ALL_STEPS as readonly string[]).includes(step))
	: [...ALL_STEPS];
const steps = requestedSteps.length > 0 ? requestedSteps : [...ALL_STEPS];

function log(message: string) {
	console.log(`${dryRun ? "[dry-run] " : ""}${message}`);
}

async function backfillSales() {
	const rows = await db
		.select({ id: accountingEntries.id, clienteId: sales.clienteId })
		.from(accountingEntries)
		.innerJoin(sales, eq(sales.id, accountingEntries.vendaId))
		.where(and(isNull(accountingEntries.clienteId), isNotNull(sales.clienteId)));
	log(`sales: ${rows.length} lançamentos de venda sem cliente`);
	if (dryRun) return;
	for (const row of rows) {
		if (!row.clienteId) continue;
		await db.update(accountingEntries).set({ clienteId: row.clienteId }).where(eq(accountingEntries.id, row.id));
	}
	log(`sales: ${rows.length} lançamentos atualizados`);
}

async function backfillPurchases() {
	const rows = await db
		.select({ entryId: purchases.lancamentoContabilId, purchaseId: purchases.id, fornecedorId: purchases.fornecedorId })
		.from(purchases)
		.innerJoin(accountingEntries, eq(accountingEntries.id, purchases.lancamentoContabilId))
		.where(sql`${accountingEntries.compraId} is null or (${accountingEntries.fornecedorId} is null and ${purchases.fornecedorId} is not null)`);
	log(`purchases: ${rows.length} lançamentos de compra sem compra/fornecedor`);
	if (dryRun) return;
	for (const row of rows) {
		if (!row.entryId) continue;
		await db
			.update(accountingEntries)
			.set({ compraId: row.purchaseId, fornecedorId: sql`coalesce(${accountingEntries.fornecedorId}, ${row.fornecedorId})` })
			.where(eq(accountingEntries.id, row.entryId));
	}
	log(`purchases: ${rows.length} lançamentos atualizados`);
}

async function main() {
	log(`Etapas: ${steps.join(", ")}`);
	for (const step of steps) {
		if (step === "sales") await backfillSales();
		if (step === "purchases") await backfillPurchases();
	}
}

main()
	.catch((error) => {
		console.error("Falha no backfill:", error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
