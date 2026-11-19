import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { type TClientMergeSuggestionRow, buildClientMergeSuggestionsQuery, mapClientMergeSuggestionRow } from "./merge-suggestions";

const require = createRequire(import.meta.url);
const { PGlite } = require("@electric-sql/pglite");
const { pg_trgm } = require("@electric-sql/pglite/contrib/pg_trgm");
const { unaccent } = require("@electric-sql/pglite/contrib/unaccent");
const dialect = new PgDialect();

/** Nomes de enchimento sem dígitos (dígito no nome marca cadastro genérico) e sem termos repetidos. */
function fillerName(index: number) {
	const letters = "bcdfghjklmnpqrstvwxz";
	const word = (n: number) => `${letters[n % 20]}${"aeiou"[n % 5]}${letters[Math.floor(n / 20) % 20]}${"aeiou"[Math.floor(n / 5) % 5]}r`;
	return `Fulano${word(index)} Sicrano${word(index + 7)}`;
}

test("merge suggestions: abbreviated and rare names, phone typos, guardrails", async () => {
	const db = new PGlite({ extensions: { pg_trgm, unaccent } });
	try {
		await db.exec(`CREATE EXTENSION pg_trgm; CREATE EXTENSION unaccent;
		CREATE FUNCTION unaccent_immutable(text) RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT unaccent($1)';
		CREATE TABLE ampmais_clients (id text PRIMARY KEY, organizacao_id text, nome text, telefone text, telefone_base text,
		 email text, cpf_cnpj text, data_insercao timestamp DEFAULT now(), ultima_compra_data timestamp,
		 metadata_total_compras int, metadata_valor_total_compras double precision);
		CREATE TABLE ampmais_client_duplicate_candidates (id text, organizacao_id text, cliente_a_id text, cliente_b_id text, status text);`);

		async function insert(id: string, nome: string, extra: { phone?: string; email?: string; cpf?: string; org?: string } = {}) {
			await db.query("INSERT INTO ampmais_clients (id,organizacao_id,nome,telefone,telefone_base,email,cpf_cnpj) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
				id,
				extra.org ?? "org",
				nome,
				extra.phone ?? "",
				extra.phone ?? "",
				extra.email ?? null,
				extra.cpf ?? null,
			]);
		}

		// Base grande o bastante para a raridade fazer sentido.
		for (let i = 0; i < 200; i++) await insert(`filler${i}`, fillerName(i));

		await insert("ananda", "Ananda Lacerda");
		await insert("ananda-full", "ANANDA COSTA LACERDA", { phone: "3499271779" });
		await insert("ananda-other-org", "Ananda Lacerda", { org: "other" });

		await insert("fernanda", "FERNANDA MATTAR", { phone: "3498087524" });
		await insert("fernanda-full", "FERNANDA COUTO ZANIN MATTAR", { phone: "9498087524" });

		for (let i = 0; i < 6; i++) await insert(`maria${i}`, "Maria Clara", { phone: `349${String(i).repeat(7)}` });
		// Linhas sequenciais de uma família com nome comum: sugere, mas sem confiança alta.
		await insert("joana-a", "Joana Silva", { phone: "3498866998" });
		await insert("joana-b", "Joana Silva", { phone: "3498866999" });
		for (let i = 0; i < 12; i++) await insert(`silva${i}`, `${fillerName(400 + i).split(" ")[0]} Silva`);
		for (let i = 0; i < 12; i++) await insert(`joana${i}`, `Joana ${fillerName(500 + i).split(" ")[1]}`);

		// E-mail placeholder em 11 cadastros: não é evidência.
		await insert("placeholder", "Wilson Ninno", { email: "invalido@invalido.com.br" });
		for (let i = 0; i < 10; i++) await insert(`placeholder${i}`, fillerName(300 + i), { email: "invalido@invalido.com.br" });

		await insert("doc-a", "Ricardo Brandao", { cpf: "11111111111" });
		await insert("doc-b", "Ricardo Brandao", { cpf: "22222222222" });

		await insert("dismissed-a", "Heloisa Tavares");
		await insert("dismissed-b", "Heloisa Tavares");
		await db.exec("INSERT INTO ampmais_client_duplicate_candidates VALUES ('p1','org','dismissed-a','dismissed-b','DESCARTADO')");

		async function suggestionsFor(clienteId: string) {
			const query = dialect.sqlToQuery(buildClientMergeSuggestionsQuery({ organizacaoId: "org", clienteId }));
			const rows = (await db.query(query.sql, query.params)).rows as TClientMergeSuggestionRow[];
			return rows.map(mapClientMergeSuggestionRow);
		}

		// O caso que motivou o menu: nome abreviado, sem telefone de um lado. Outra organização fica de fora.
		const ananda = await suggestionsFor("ananda");
		assert.deepEqual(
			ananda.map((s) => s.cliente.id),
			["ananda-full"],
		);
		assert.deepEqual(
			ananda[0]?.motivos.map((m) => m.tipo),
			["NOME_ABREVIADO"],
		);
		assert.equal(ananda[0]?.confianca, "ALTA");

		// DDD digitado errado + nome abreviado.
		const fernanda = await suggestionsFor("fernanda");
		assert.deepEqual(
			fernanda.map((s) => s.cliente.id),
			["fernanda-full"],
		);
		assert.deepEqual(fernanda[0]?.motivos.map((m) => m.tipo).sort(), ["NOME_ABREVIADO", "TELEFONE_PARECIDO"]);

		// Combinação observada em 6 cadastros: coincidência, não duplicidade.
		assert.deepEqual(await suggestionsFor("maria0"), []);

		const joana = await suggestionsFor("joana-a");
		assert.deepEqual(
			joana.map((s) => [s.cliente.id, s.confianca]),
			[["joana-b", "MEDIA"]],
		);

		// Placeholder compartilhado por mais de 10 cadastros não vira motivo.
		assert.deepEqual(await suggestionsFor("placeholder"), []);

		// CPF/CNPJ diferentes e pares descartados nunca voltam.
		assert.deepEqual(await suggestionsFor("doc-a"), []);
		assert.deepEqual(await suggestionsFor("dismissed-a"), []);
	} finally {
		await db.close();
	}
});
