import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildSalePriceUpdate } from "./price-snapshot";

const now = new Date("2026-10-03T12:00:00Z");

test("preço igual ao gravado não gera snapshot (sincronizações reescrevem o mesmo valor)", () => {
	assert.deepEqual(buildSalePriceUpdate({ current: { precoVenda: 9.9, precoVendaAnterior: 12.9 }, next: { precoVenda: 9.9 }, now }), {
		precoVenda: 9.9,
	});
	// Ruído de double precision abaixo de meio centavo não é mudança.
	assert.deepEqual(buildSalePriceUpdate({ current: { precoVenda: 9.9, precoVendaAnterior: null }, next: { precoVenda: 9.900000001 }, now }), {
		precoVenda: 9.900000001,
	});
});

test("redução e aumento de preço guardam o preço atual como anterior", () => {
	assert.deepEqual(buildSalePriceUpdate({ current: { precoVenda: 12.9, precoVendaAnterior: null }, next: { precoVenda: 9.9 }, now }), {
		precoVenda: 9.9,
		precoVendaAnterior: 12.9,
		dataAlteracaoPrecoVenda: now,
	});
	// Fim da promoção: o preço volta e o anterior passa a ser o promocional (menor) — sem "De / Por".
	assert.deepEqual(buildSalePriceUpdate({ current: { precoVenda: 9.9, precoVendaAnterior: 12.9 }, next: { precoVenda: 12.9 }, now }), {
		precoVenda: 12.9,
		precoVendaAnterior: 9.9,
		dataAlteracaoPrecoVenda: now,
	});
});

test("primeiro preço de um produto sem preço deixa o anterior nulo", () => {
	assert.deepEqual(buildSalePriceUpdate({ current: { precoVenda: null, precoVendaAnterior: null }, next: { precoVenda: 15 }, now }), {
		precoVenda: 15,
		precoVendaAnterior: null,
		dataAlteracaoPrecoVenda: now,
	});
});

test("anterior manual diferente do gravado vence a regra automática", () => {
	// Correção de digitação: 9,90 → 99,00 gravou anterior 9,90; ao voltar para 9,90 o usuário limpa o anterior.
	assert.deepEqual(
		buildSalePriceUpdate({ current: { precoVenda: 99, precoVendaAnterior: 9.9 }, next: { precoVenda: 9.9, precoVendaAnterior: null }, now }),
		{ precoVenda: 9.9, precoVendaAnterior: null, dataAlteracaoPrecoVenda: now },
	);
	// "De" explícito sem mexer no preço: reinicia a data, a promoção vale a partir de agora.
	assert.deepEqual(
		buildSalePriceUpdate({ current: { precoVenda: 9.9, precoVendaAnterior: null }, next: { precoVenda: 9.9, precoVendaAnterior: 14.9 }, now }),
		{ precoVenda: 9.9, precoVendaAnterior: 14.9, dataAlteracaoPrecoVenda: now },
	);
	// Limpar sem mudar o preço não toca na data.
	assert.deepEqual(
		buildSalePriceUpdate({ current: { precoVenda: 9.9, precoVendaAnterior: 14.9 }, next: { precoVenda: 9.9, precoVendaAnterior: null }, now }),
		{ precoVenda: 9.9, precoVendaAnterior: null },
	);
});

test("anterior reenviado sem alteração não bloqueia o snapshot automático", () => {
	// O formulário devolve o anterior que leu; se o preço mudou, o snapshot automático segue valendo.
	assert.deepEqual(
		buildSalePriceUpdate({ current: { precoVenda: 12.9, precoVendaAnterior: 14.9 }, next: { precoVenda: 9.9, precoVendaAnterior: 14.9 }, now }),
		{ precoVenda: 9.9, precoVendaAnterior: 12.9, dataAlteracaoPrecoVenda: now },
	);
});

// -----------------------------------------------------------------------------
// GUARDA: todo arquivo que atualiza products/productVariants e grava `precoVenda` usa o helper.
// -----------------------------------------------------------------------------
// Heurística por arquivo — barata e sem AST: um `.update(products|productVariants)` no arquivo + uma
// escrita de `precoVenda` (chave de objeto com valor que não é coluna/flag de leitura, ou atribuição)
// exige uma chamada a `buildSalePriceUpdate` no mesmo arquivo. Exceções precisam de motivo abaixo.

const REPO_ROOT = path.resolve(__dirname, "../..");
const SCANNED_DIRS = ["app", "lib", "scripts", "utils", "services"];
const ALLOWED_WITHOUT_HELPER: Record<string, string> = {};

const UPDATES_PRODUCT_TABLES = /\.update\(\s*(products|productVariants)\s*\)/;
// `precoVenda: <valor>` — exclui leituras (`precoVenda: true`, `precoVenda: products.precoVenda`, `sql<...>`).
const WRITES_PRECO_VENDA_KEY =
	/\bprecoVenda\s*:\s*(?!true\b|false\b|(?:products|productVariants|productChannelSettings)\.|sql\b|[a-zA-Z_]+\.precoVenda\s*[,}\n])/;
const ASSIGNS_PRECO_VENDA = /\.precoVenda\s*=(?!=)/;

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

test("toda escrita de precoVenda em produtos/variantes passa por buildSalePriceUpdate", () => {
	const offenders: string[] = [];
	for (const dir of SCANNED_DIRS) {
		for (const file of listSourceFiles(path.join(REPO_ROOT, dir))) {
			const relativePath = path.relative(REPO_ROOT, file);
			if (relativePath === "lib/products/price-snapshot.ts" || ALLOWED_WITHOUT_HELPER[relativePath]) continue;
			const source = readFileSync(file, "utf-8");
			if (!UPDATES_PRODUCT_TABLES.test(source)) continue;
			if (!WRITES_PRECO_VENDA_KEY.test(source) && !ASSIGNS_PRECO_VENDA.test(source)) continue;
			if (!source.includes("buildSalePriceUpdate(")) offenders.push(relativePath);
		}
	}
	assert.deepEqual(
		offenders,
		[],
		"Estes arquivos atualizam products/productVariants e gravam precoVenda sem buildSalePriceUpdate (lib/products/price-snapshot.ts). " +
			"Use o helper para que o preço anterior seja registrado.",
	);
});
