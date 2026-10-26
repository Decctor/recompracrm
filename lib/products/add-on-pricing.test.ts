import assert from "node:assert/strict";
import test from "node:test";
import { resolveAddOnUnitPrices, type TAddOnPricingSelection } from "./add-on-pricing";

function flavor(
	opcaoId: string,
	precoDelta: number,
	quantidade = 1,
	regraPreco: TAddOnPricingSelection["regraPreco"] = "MAIOR",
	grupoId = "sabores",
) {
	return { opcaoId, precoDelta, quantidade, grupoId, regraPreco };
}

function charged(selections: TAddOnPricingSelection[]) {
	const prices = resolveAddOnUnitPrices(selections);
	return selections.reduce((sum, selection) => sum + (prices.get(selection.opcaoId) ?? 0) * selection.quantidade, 0);
}

test("SOMA keeps each option's own price", () => {
	const selections = [flavor("bacon", 33, 2, "SOMA", "extras"), flavor("milho", 10, 1, "SOMA", "extras")];
	const prices = resolveAddOnUnitPrices(selections);
	assert.equal(prices.get("bacon"), 33);
	assert.equal(prices.get("milho"), 10);
	assert.equal(charged(selections), 76);
});

test("MAIOR charges only the most expensive option", () => {
	const selections = [flavor("calabresa", 8), flavor("camarao", 53)];
	const prices = resolveAddOnUnitPrices(selections);
	assert.equal(prices.get("camarao"), 53);
	assert.equal(prices.get("calabresa"), 0);
	assert.equal(charged(selections), 53);
});

test("MAIOR with a single option charges it once, even with quantity", () => {
	assert.equal(charged([flavor("calabresa", 8)]), 8);
	assert.equal(charged([flavor("calabresa", 8, 2)]), 8);
});

test("MAIOR breaks ties by option id regardless of input order", () => {
	const a = resolveAddOnUnitPrices([flavor("b", 10), flavor("a", 10)]);
	const b = resolveAddOnUnitPrices([flavor("a", 10), flavor("b", 10)]);
	assert.deepEqual([...a.entries()].sort(), [...b.entries()].sort());
	assert.equal(a.get("a"), 10);
	assert.equal(a.get("b"), 0);
});

test("MAIOR handles negative deltas (flavor cheaper than the base)", () => {
	assert.equal(charged([flavor("promo", -8), flavor("tradicional", 0)]), 0);
	assert.equal(charged([flavor("promo", -8)]), -8);
});

test("MEDIA charges the quantity-weighted average", () => {
	assert.equal(charged([flavor("calabresa", 8, 1, "MEDIA"), flavor("camarao", 53, 1, "MEDIA")]), 30.5);
	assert.equal(charged([flavor("calabresa", 8, 2, "MEDIA")]), 8);
	assert.equal(charged([flavor("a", 9, 2, "MEDIA"), flavor("b", 30, 1, "MEDIA")]), 16);
});

test("rules apply per group: extras still add on top of the flavor charge", () => {
	const selections = [flavor("calabresa", 8), flavor("camarao", 53), flavor("borda", 20, 1, "SOMA", "borda")];
	assert.equal(charged(selections), 73);
});

test("duplicated lines of the same option are consolidated before the rule", () => {
	const selections = [flavor("calabresa", 8, 1, "MEDIA"), flavor("calabresa", 8, 1, "MEDIA"), flavor("camarao", 53, 2, "MEDIA")];
	assert.equal(charged(selections), 30.5);
});
