import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { type SQL, sql } from "drizzle-orm";
import { withProductUpdateStamp } from "./update-stamp";

const dialect = new PgDialect();

function renderStamp(set: { dataAtualizacao?: SQL }) {
	assert.ok(set.dataAtualizacao, "esperava o carimbo de atualização");
	return dialect.sqlToQuery(set.dataAtualizacao);
}

test("campos de cadastro geram o carimbo condicional, comparando com o valor antigo da linha", () => {
	const set = withProductUpdateStamp({ nome: "Bolo de pote", precoVenda: 12.9, ativo: true });
	const { sql: text, params } = renderStamp(set);
	assert.equal(
		text,
		`CASE WHEN "ampmais_products"."nome" IS DISTINCT FROM $1 OR "ampmais_products"."preco_venda" IS DISTINCT FROM $2 OR "ampmais_products"."ativo" IS DISTINCT FROM $3 THEN now() ELSE "ampmais_products"."data_atualizacao" END`,
	);
	assert.deepEqual(params, ["Bolo de pote", 12.9, true]);
	// O set original segue intacto.
	assert.equal(set.nome, "Bolo de pote");
});

test("saldo e carimbo de sincronização não contam como alteração de cadastro", () => {
	const set = withProductUpdateStamp({ quantidade: 10, dataUltimaSincronizacao: new Date() });
	assert.equal(set.dataAtualizacao, undefined);
	// Junto de um campo de cadastro, só o campo de cadastro entra na comparação.
	const { sql: text } = renderStamp(withProductUpdateStamp({ quantidade: 10, dataUltimaSincronizacao: new Date(), grupo: "DOCES" }));
	assert.ok(!text.includes("quantidade") && !text.includes("data_ultima_sincronizacao"));
	assert.ok(text.includes(`"ampmais_products"."grupo" IS DISTINCT FROM $1`));
});

test("campos ausentes (undefined) não entram; null limpa e conta como alteração", () => {
	assert.equal(withProductUpdateStamp({ descricao: undefined }).dataAtualizacao, undefined);
	const { sql: text, params } = renderStamp(withProductUpdateStamp({ descricao: undefined, fornecedorPrincipalId: null }));
	assert.ok(!text.includes("descricao"));
	assert.deepEqual(params, [null]);
});

test("datas passam pelo encoder da coluna e expressões SQL são comparadas como estão", () => {
	const when = new Date("2026-10-10T12:00:00Z");
	const { params } = renderStamp(withProductUpdateStamp({ dataAlteracaoPrecoVenda: when }));
	assert.deepEqual(params, [when.toISOString()]);
	const { sql: text } = renderStamp(withProductUpdateStamp({ nome: sql`upper(${"bolo"})` }));
	assert.ok(text.includes(`"ampmais_products"."nome" IS DISTINCT FROM upper($1)`));
});

// -----------------------------------------------------------------------------
// GUARDA: todo arquivo que atualiza `products` passa o set por withProductUpdateStamp.
// -----------------------------------------------------------------------------
// Mesma heurística por arquivo de `price-snapshot.test.ts`. Exceções precisam de motivo abaixo.

const REPO_ROOT = path.resolve(__dirname, "../..");
const SCANNED_DIRS = ["app", "lib", "scripts", "utils", "services"];
const ALLOWED_WITHOUT_HELPER: Record<string, string> = {
	"lib/stock/apply-stock-movement.ts": "Só saldo e custo médio da movimentação — operação, não cadastro.",
	"lib/purchase-processing/process-purchase-item-stock.ts": "Só saldo e custo médio da entrada da compra — operação, não cadastro.",
};

const UPDATES_PRODUCTS = /\.update\(\s*products\s*\)/;

function listSourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry.startsWith(".")) continue;
		const fullPath = path.join(dir, entry);
		if (statSync(fullPath).isDirectory()) files.push(...listSourceFiles(fullPath));
		else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(fullPath);
	}
	return files;
}

test("toda atualização de produtos passa por withProductUpdateStamp", () => {
	const offenders: string[] = [];
	for (const dir of SCANNED_DIRS) {
		for (const file of listSourceFiles(path.join(REPO_ROOT, dir))) {
			const relativePath = path.relative(REPO_ROOT, file).split(path.sep).join("/");
			if (ALLOWED_WITHOUT_HELPER[relativePath]) continue;
			const source = readFileSync(file, "utf-8");
			if (!UPDATES_PRODUCTS.test(source)) continue;
			if (!source.includes("withProductUpdateStamp(")) offenders.push(relativePath);
		}
	}
	assert.deepEqual(
		offenders,
		[],
		"Estes arquivos atualizam products sem withProductUpdateStamp (lib/products/update-stamp.ts). " +
			"Use o helper para que a data de atualização do cadastro avance quando algo mudar.",
	);
});
