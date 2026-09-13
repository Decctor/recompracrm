import assert from "node:assert/strict";
import test from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DBTransaction } from "@/services/drizzle";
import { countPreviousConfirmedPurchases, lockClientPurchaseHistory } from "./purchase-history";

test("history query excludes only the current confirmed sale and scopes customer and organization", async () => {
	let predicate: SQL | undefined;
	const trx = {
		select: () => ({
			from: () => ({
				where: (condition: SQL) => {
					predicate = condition;
					return [{ total: 2 }];
				},
			}),
		}),
	} as unknown as DBTransaction;

	assert.equal(await countPreviousConfirmedPurchases({ trx, organizacaoId: "org", clienteId: "cliente", vendaId: "venda-atual" }), 2);
	const query = new PgDialect().sqlToQuery(predicate!);
	assert.deepEqual(query.params, ["org", "cliente", "CONFIRMADA", "venda-atual"]);
	assert.match(query.sql, /"id" <>/);
	assert.match(query.sql, /"organizacao_id" =/);
	assert.match(query.sql, /"cliente_id" =/);
	assert.match(query.sql, /"status_venda" =/);
});

test("POI history before sale creation does not exclude a sale", async () => {
	let predicate: SQL | undefined;
	const trx = {
		select: () => ({
			from: () => ({
				where: (condition: SQL) => {
					predicate = condition;
					return [{ total: 0 }];
				},
			}),
		}),
	} as unknown as DBTransaction;

	assert.equal(await countPreviousConfirmedPurchases({ trx, organizacaoId: "org", clienteId: "cliente", vendaId: null }), 0);
	assert.deepEqual(new PgDialect().sqlToQuery(predicate!).params, ["org", "cliente", "CONFIRMADA"]);
});

test("purchase lock fails with a retryable conflict instead of waiting", async () => {
	let statement: SQL | undefined;
	const trx = {
		execute: async (query: SQL) => {
			statement = query;
			return [{ adquirido: false }];
		},
	} as unknown as DBTransaction;

	await assert.rejects(lockClientPurchaseHistory(trx, "org", "cliente"), (error: unknown) => (error as { statusCode: number }).statusCode === 409);
	const query = new PgDialect().sqlToQuery(statement!);
	assert.match(query.sql, /pg_try_advisory_xact_lock\(hashtextextended/);
	assert.deepEqual(query.params, ["org:cliente:primeira-compra"]);
});
