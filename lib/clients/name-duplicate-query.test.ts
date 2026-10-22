import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildClientNameDuplicateInsert, buildClientNameDuplicateQuery, buildLiveDuplicateReasonsUpdate } from "./name-duplicate-query";

const require = createRequire(import.meta.url);
const { PGlite } = require("@electric-sql/pglite");
const { pg_trgm } = require("@electric-sql/pglite/contrib/pg_trgm");
const { unaccent } = require("@electric-sql/pglite/contrib/unaccent");
const dialect = new PgDialect();

test("nightly names: tenant isolation, matching guardrails, and idempotent evidence updates", async () => {
	const db = new PGlite({ extensions: { pg_trgm, unaccent } });
	try {
		await db.exec(`CREATE EXTENSION pg_trgm; CREATE EXTENSION unaccent;
		CREATE FUNCTION unaccent_immutable(text) RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT unaccent($1)';
		CREATE TABLE ampmais_clients (id text PRIMARY KEY, organizacao_id text, nome text, cpf_cnpj text);
		CREATE TABLE ampmais_client_duplicate_candidates (
		 id uuid PRIMARY KEY,organizacao_id text,cliente_a_id text,cliente_b_id text,motivos jsonb,status text,
		 data_atualizacao timestamp, UNIQUE(organizacao_id,cliente_a_id,cliente_b_id));`);
		const names = [
			["a", "Anna Clara Silva"],
			["b", "Ana Clara Silva"],
			["c", "Denis Morais Silva"],
			["d", "Denise Morais Silva"],
			["e", "Andressa Dos Santos Martins"],
			["f", "Andre Dos Santos Martins"],
			["g", "Ana Paula"],
			["h", "Ana Paula de Paula"],
			["i", "Bruno Henrique Silva Souza"],
			["j", "Bruno Henrique da Silva Souza"],
			["k", "Cliente Não Identificado"],
			["l", "Cliente Não Identificado"],
			["m", "Maria Eduarda Furlaneto"],
			["n", "Maria Eduarda Furlanetto"],
			["o", "SAMUEL ROCHA OLIVEIRA"],
			["p", "Samuel Rocha Oliveira"],
		];
		for (const [id, nome] of names)
			await db.query("INSERT INTO ampmais_clients VALUES ($1,'org',$2,$3)", [id, nome, id === "m" ? "111" : id === "n" ? "222" : null]);
		await db.query("INSERT INTO ampmais_clients VALUES ('other','other-org','Ana Clara Silva',null)");
		for (let i = 0; i < 11; i++) await db.query("INSERT INTO ampmais_clients VALUES ($1,'org','Maria Aparecida Costa',null)", [`common${i}`]);
		const select = dialect.sqlToQuery(buildClientNameDuplicateQuery("org"));
		const pairs = (await db.query(select.sql, select.params)).rows
			.map((r: { cliente_a_id: string; cliente_b_id: string }) => `${r.cliente_a_id}:${r.cliente_b_id}`)
			.sort();
		assert.deepEqual(pairs, ["a:b", "i:j", "o:p"]);
		await db.exec(`INSERT INTO ampmais_client_duplicate_candidates VALUES
		 (gen_random_uuid(),'org','a','b','[{"tipo":"EMAIL","valor":"shared"}]','PENDENTE',null),
		 (gen_random_uuid(),'org','i','j','[]','DESCARTADO',null),
		 (gen_random_uuid(),'org','o','p','[]','MESCLADO',null)`);
		const insert = dialect.sqlToQuery(buildClientNameDuplicateInsert("org"));
		await db.query(insert.sql, insert.params);
		await db.query(insert.sql, insert.params);
		const rows = (await db.query("SELECT cliente_a_id,motivos,status FROM ampmais_client_duplicate_candidates ORDER BY cliente_a_id")).rows;
		assert.equal(rows.length, 3);
		assert.deepEqual(rows[0].motivos.map((r: { tipo: string }) => r.tipo).sort(), ["EMAIL", "NOME_SEMELHANTE"]);
		assert.equal(rows[1].status, "DESCARTADO");
		assert.deepEqual(rows[1].motivos, []);
		assert.equal(rows[2].status, "MESCLADO");
		assert.deepEqual(rows[2].motivos, []);
		const liveUpdate = dialect.sqlToQuery(buildLiveDuplicateReasonsUpdate([{ tipo: "TELEFONE", valor: "123" }]));
		await db.query(
			`INSERT INTO ampmais_client_duplicate_candidates
 (id,organizacao_id,cliente_a_id,cliente_b_id,motivos,status)
 VALUES(gen_random_uuid(),'org','a','b','[]','PENDENTE')
 ON CONFLICT (organizacao_id,cliente_a_id,cliente_b_id) DO UPDATE SET motivos=${liveUpdate.sql}`,
			liveUpdate.params,
		);
		const updated = (await db.query("SELECT motivos FROM ampmais_client_duplicate_candidates WHERE cliente_a_id='a'")).rows[0];
		assert.deepEqual(updated.motivos.map((r: { tipo: string }) => r.tipo).sort(), ["NOME_SEMELHANTE", "TELEFONE"]);
	} finally {
		await db.close();
	}
});
