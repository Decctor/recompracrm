import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/services/drizzle/schema";
import { countPreviousConfirmedPurchases, lockClientPurchaseHistory } from "./purchase-history";

// Explicit test database only. Never load the application's production .env.
test(
	"PostgreSQL purchase history: self exclusion, status/tenant scope, contention and rollback",
	{
		skip: !process.env.COUPON_TEST_DATABASE_URL,
	},
	async () => {
		const namespace = `coupon_test_${randomUUID().replaceAll("-", "")}`;
		const sql = postgres(process.env.COUPON_TEST_DATABASE_URL!, { max: 3, prepare: false });
		await sql.unsafe(`CREATE SCHEMA ${namespace}`);
		try {
			await sql.unsafe(`CREATE TABLE ${namespace}.ampmais_sales (id text PRIMARY KEY, organizacao_id text, cliente_id text, status_venda text)`);
			await sql.begin(async (tx) => {
				await tx.unsafe(`SET LOCAL search_path TO ${namespace}`);
				await tx.unsafe(readFileSync("drizzle/0105_coupon_purchase_history_lock.sql", "utf8"));
			});
			const database = drizzle(sql, { schema });
			await database.transaction(async (tx) => {
				await tx.execute((await import("drizzle-orm")).sql.raw(`SET LOCAL search_path TO ${namespace}`));
				await lockClientPurchaseHistory(tx, "org", "client");
				await tx.execute(
					(await import("drizzle-orm")).sql.raw(
						`INSERT INTO ampmais_sales VALUES ('self','org','client','CONFIRMADA'), ('draft','org','client','ORCAMENTO'), ('cancelled','org','client','CANCELADA'), ('other-org','other','client','CONFIRMADA'), ('other-client','org','other','CONFIRMADA')`,
					),
				);
				assert.equal(await countPreviousConfirmedPurchases({ trx: tx, organizacaoId: "org", clienteId: "client", vendaId: "self" }), 0);
				assert.equal(await countPreviousConfirmedPurchases({ trx: tx, organizacaoId: "org", clienteId: "client" }), 1);
				// Another coupon transaction cannot acquire the customer lock, and does not wait.
				await assert.rejects(
					database.transaction((other) => lockClientPurchaseHistory(other, "org", "client")),
					/Outra compra/,
				);
				// An importer bypassing the application helper is still protected by the trigger.
				await assert.rejects(
					sql.begin(async (other) => {
						await other.unsafe(`SET LOCAL search_path TO ${namespace}`);
						await other`INSERT INTO ampmais_sales VALUES ('import','org','client','CONFIRMADA')`;
					}),
					(error: unknown) => (error as { code: string }).code === "40001",
				);
			});
			await sql.begin(async (tx) => {
				await tx.unsafe(`SET LOCAL search_path TO ${namespace}`);
				await tx`INSERT INTO ampmais_sales VALUES ('import','org','client','CONFIRMADA')`;
			});
			await database.transaction(async (tx) => {
				await tx.execute((await import("drizzle-orm")).sql.raw(`SET LOCAL search_path TO ${namespace}`));
				await lockClientPurchaseHistory(tx, "org", "client");
				assert.equal(await countPreviousConfirmedPurchases({ trx: tx, organizacaoId: "org", clienteId: "client", vendaId: "self" }), 1);
			});
		} finally {
			await sql.unsafe(`DROP SCHEMA ${namespace} CASCADE`);
			await sql.end();
		}
	},
);
