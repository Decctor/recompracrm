import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampPageSize, getPaginationItems, pageSizeInputSchema } from "./pagination";

function labels(activePage: number, totalPages: number) {
	return getPaginationItems({ activePage, totalPages }).map((item) => (item.type === "page" ? item.page : "…"));
}

describe("getPaginationItems", () => {
	it("lista todas as páginas quando cabem", () => {
		assert.deepEqual(labels(1, 1), [1]);
		assert.deepEqual(labels(3, 7), [1, 2, 3, 4, 5, 6, 7]);
		assert.deepEqual(labels(1, 0), []);
	});

	it("perto do início, encurta o fim", () => {
		assert.deepEqual(labels(1, 20), [1, 2, 3, 4, 5, "…", 20]);
		assert.deepEqual(labels(4, 20), [1, 2, 3, 4, 5, "…", 20]);
	});

	it("no meio, mostra a vizinhança da ativa", () => {
		assert.deepEqual(labels(5, 20), [1, "…", 4, 5, 6, "…", 20]);
		assert.deepEqual(labels(10, 20), [1, "…", 9, 10, 11, "…", 20]);
	});

	it("perto do fim, encurta o início", () => {
		assert.deepEqual(labels(17, 20), [1, "…", 16, 17, 18, 19, 20]);
		assert.deepEqual(labels(20, 20), [1, "…", 16, 17, 18, 19, 20]);
	});

	it("mantém sempre 7 itens com chaves únicas", () => {
		for (let active = 1; active <= 30; active++) {
			const items = getPaginationItems({ activePage: active, totalPages: 30 });
			assert.equal(items.length, 7);
			const keys = items.map((item) => (item.type === "page" ? `p${item.page}` : item.key));
			assert.equal(new Set(keys).size, keys.length);
			assert.ok(items.some((item) => item.type === "page" && item.page === active));
		}
	});

	it("tolera página ativa fora do intervalo", () => {
		assert.deepEqual(labels(99, 20), [1, "…", 16, 17, 18, 19, 20]);
		assert.deepEqual(labels(0, 20), [1, 2, 3, 4, 5, "…", 20]);
	});
});

describe("clampPageSize / pageSizeInputSchema", () => {
	it("cai no padrão quando vazio ou inválido", () => {
		assert.equal(clampPageSize(null), 25);
		assert.equal(clampPageSize(""), 25);
		assert.equal(clampPageSize("abc"), 25);
		assert.equal(clampPageSize("-5"), 25);
		assert.equal(clampPageSize(undefined, 10), 10);
	});

	it("corta no teto de 100", () => {
		assert.equal(clampPageSize("50"), 50);
		assert.equal(clampPageSize(100), 100);
		assert.equal(clampPageSize("5000"), 100);
	});

	it("o schema deixa a chave opcional", () => {
		const schema = pageSizeInputSchema(20);
		assert.equal(schema.parse(undefined), undefined);
		assert.equal(schema.parse(null), 20);
		assert.equal(schema.parse("100"), 100);
	});
});
