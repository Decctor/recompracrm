import assert from "node:assert/strict";
import test from "node:test";
import { db } from "@/services/drizzle";
import { sales } from "@/services/drizzle/schema";
import { and } from "drizzle-orm";
import { buildSalesUniverseConditions, type TSalesResultsFilters } from "./universe";

function compileUniverse(excludedFinancialAccountIds: string[]) {
	const filters: TSalesResultsFilters = {
		organizacaoId: "org-1",
		after: new Date("2026-09-01T00:00:00.000Z"),
		before: new Date("2026-09-30T23:59:59.999Z"),
		sellersIds: [],
		channels: [],
		excludedFinancialAccountIds,
	};

	return db
		.select({ id: sales.id })
		.from(sales)
		.where(and(...buildSalesUniverseConditions(filters, "CONFIRMADA")))
		.toSQL();
}

test("does not join the financial tables when no account is excluded", () => {
	const query = compileUniverse([]);

	assert.doesNotMatch(query.sql, /not exists/i);
	assert.doesNotMatch(query.sql, /financial_transactions/i);
});

test("excludes the whole sale when an incoming sale transaction uses an excluded account", () => {
	const query = compileUniverse(["account-a", "account-b"]);

	assert.match(query.sql, /not exists/i);
	assert.match(query.sql, /financial_transactions/i);
	assert.match(query.sql, /accounting_entries/i);
	assert.match(query.sql, /accounting_entries"\."venda_id" = "ampmais_sales"\."id/i);
	assert.ok(query.params.includes("VENDA"));
	assert.ok(query.params.includes("ENTRADA"));
	assert.ok(query.params.includes("account-a"));
	assert.ok(query.params.includes("account-b"));
});
