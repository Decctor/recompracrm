import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { differsFromDefaultProductsFilters, getDefaultProductsFilters, parseStoredProductsFilters, serializeProductsFilters } from "./products-filters-storage";

// Sexta-feira, 16/10/2026, 14:30 local.
const reference = new Date(2026, 9, 16, 14, 30, 0, 0);
// Um mês depois, numa segunda visita.
const nextVisit = new Date(2026, 10, 20, 9, 0, 0, 0);

function roundTrip(filters: ReturnType<typeof getDefaultProductsFilters>, savedAt: Date, readAt: Date) {
	return parseStoredProductsFilters(JSON.stringify(serializeProductsFilters(filters, savedAt)), readAt);
}

describe("products filters storage", () => {
	it("guarda ordenação e filtros escolhidos", () => {
		const filters = { ...getDefaultProductsFilters(reference), orderByField: "dataAtualizacao" as const, orderByDirection: "desc" as const, groups: ["BEBIDAS"] };
		const restored = roundTrip(filters, reference, reference);
		assert.equal(restored.orderByField, "dataAtualizacao");
		assert.equal(restored.orderByDirection, "desc");
		assert.deepEqual(restored.groups, ["BEBIDAS"]);
	});

	it("o mês corrente acompanha a data da visita", () => {
		const restored = roundTrip(getDefaultProductsFilters(reference), reference, nextVisit);
		assert.deepEqual(restored.statsPeriodAfter, new Date(2026, 10, 1, 0, 0, 0, 0));
		assert.deepEqual(restored.statsPeriodBefore, new Date(2026, 10, 30, 23, 59, 59, 999));
	});

	it("um atalho de período é recalculado na visita", () => {
		const filters = { ...getDefaultProductsFilters(reference), statsPeriodAfter: new Date(2026, 8, 17), statsPeriodBefore: new Date(2026, 9, 16, 23, 59, 59, 999) };
		const restored = roundTrip(filters, reference, nextVisit);
		assert.deepEqual(restored.statsPeriodAfter, new Date(2026, 9, 22, 0, 0, 0, 0));
		assert.deepEqual(restored.statsPeriodBefore, new Date(2026, 10, 20, 23, 59, 59, 999));
	});

	it("um intervalo manual volta com as mesmas datas", () => {
		const after = new Date(2026, 0, 3);
		const before = new Date(2026, 1, 9, 23, 59, 59, 999);
		const restored = roundTrip({ ...getDefaultProductsFilters(reference), statsPeriodAfter: after, statsPeriodBefore: before }, reference, nextVisit);
		assert.deepEqual([restored.statsPeriodAfter, restored.statsPeriodBefore], [after, before]);
	});

	it("período limpo continua limpo", () => {
		const restored = roundTrip({ ...getDefaultProductsFilters(reference), statsPeriodAfter: null, statsPeriodBefore: null }, reference, nextVisit);
		assert.equal(restored.statsPeriodAfter, null);
		assert.equal(restored.statsPeriodBefore, null);
	});

	it("não grava busca nem página", () => {
		const serialized = serializeProductsFilters({ ...getDefaultProductsFilters(reference), search: ["cerveja"], page: 4 } as never, reference);
		assert.ok(!("search" in serialized.filters));
		assert.ok(!("page" in serialized.filters));
	});

	it("conteúdo ilegível abre no padrão", () => {
		assert.deepEqual(parseStoredProductsFilters("{nao e json", reference), {});
		assert.deepEqual(parseStoredProductsFilters(null, reference), {});
		assert.deepEqual(parseStoredProductsFilters(JSON.stringify({ outro: 1 }), reference), {});
	});

	it("um campo corrompido não descarta os outros", () => {
		const raw = JSON.stringify({ period: { type: "current-month" }, filters: { orderByField: "inexistente", groups: ["BEBIDAS"], priceMin: "abc" } });
		const restored = parseStoredProductsFilters(raw, reference);
		assert.equal(restored.orderByField, undefined);
		assert.equal(restored.priceMin, undefined);
		assert.deepEqual(restored.groups, ["BEBIDAS"]);
	});

	it("detecta quando há algo fora do padrão", () => {
		assert.equal(differsFromDefaultProductsFilters(getDefaultProductsFilters(reference), reference), false);
		assert.equal(differsFromDefaultProductsFilters({ ...getDefaultProductsFilters(reference), orderByDirection: "desc" }, reference), true);
	});
});
