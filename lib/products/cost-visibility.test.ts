import assert from "node:assert/strict";
import test from "node:test";
import { redactCatalogCosts } from "./cost-visibility";

test("redacts catalog cost at every depth and keeps everything else", () => {
	const date = new Date("2026-11-17T12:00:00Z");
	const product = {
		id: "p1",
		precoCusto: 4,
		precoVenda: 10,
		dataInsercao: date,
		variantes: [{ id: "v1", precoCusto: 5, precoVenda: 12 }],
		addOnsReferencias: [{ grupo: { opcoes: [{ produto: { id: "p2", precoCusto: 1 }, produtoVariante: null }] } }],
	};
	const redacted = redactCatalogCosts(product, false);
	assert.equal(redacted.precoCusto, null);
	assert.equal(redacted.variantes[0]?.precoCusto, null);
	assert.equal(redacted.addOnsReferencias[0]?.grupo.opcoes[0]?.produto.precoCusto, null);
	assert.equal(redacted.precoVenda, 10);
	assert.equal(redacted.variantes[0]?.precoVenda, 12);
	assert.ok(redacted.dataInsercao instanceof Date);
	assert.equal(product.precoCusto, 4, "does not mutate the input");
	assert.equal(redactCatalogCosts(product, true), product);
});
