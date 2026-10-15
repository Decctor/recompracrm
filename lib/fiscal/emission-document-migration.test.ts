import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("migração preserva vendas existentes, persiste a intenção e rejeita NFS-e no banco", async () => {
	const database = new PGlite();
	try {
		await database.exec(
			`CREATE TYPE fiscal_document_type AS ENUM ('NFE','NFCE','NFSE'); CREATE TABLE ampmais_sales (id text PRIMARY KEY); INSERT INTO ampmais_sales VALUES ('existente');`,
		);
		const migration = await readFile("drizzle/0133_sale_fiscal_document.sql", "utf8");
		await database.exec(migration);
		await database.exec(migration);
		assert.deepEqual((await database.query("SELECT emissao_fiscal_documento FROM ampmais_sales WHERE id='existente'")).rows, [
			{ emissao_fiscal_documento: null },
		]);
		await database.exec("UPDATE ampmais_sales SET emissao_fiscal_documento='NFE' WHERE id='existente'");
		assert.deepEqual((await database.query("SELECT emissao_fiscal_documento FROM ampmais_sales WHERE id='existente'")).rows, [
			{ emissao_fiscal_documento: "NFE" },
		]);
		await assert.rejects(
			database.exec("UPDATE ampmais_sales SET emissao_fiscal_documento='NFSE' WHERE id='existente'"),
			/sales_emissao_fiscal_documento_check/,
		);
		assert.deepEqual((await database.query("SELECT emissao_fiscal_documento FROM ampmais_sales WHERE id='existente'")).rows, [
			{ emissao_fiscal_documento: "NFE" },
		]);
	} finally {
		await database.close();
	}
});
