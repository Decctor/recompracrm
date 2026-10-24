import assert from "node:assert/strict";
import test from "node:test";
import { CASHBACK_CALCULATOR_DEFAULTS, computeCashbackCalculator } from "./cashback-calculator";
import { WHATSAPP_COST_DEFAULTS, computeWhatsappCost } from "./whatsapp-cost";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test("cashback: valores padrão (ticket 80, margem 40%, cashback 5%, uso 60%)", () => {
	const result = computeCashbackCalculator(CASHBACK_CALCULATOR_DEFAULTS);
	close(result.cost, 2.4);
	close(result.grossMargin, 32);
	close(result.marginShare, 0.075);
	close(result.breakEven ?? Number.NaN, 2.4 / 29.6);
	close(result.creditPerSale, 4);
	close(result.monthlyCost, 2400);
	assert.equal(result.warning, false);
});

test("cashback: empate garante a mesma margem total", () => {
	const input = { ticket: 120, margin: 35, cashback: 8, redemption: 70, sales: 500 };
	const result = computeCashbackCalculator(input);
	const before = result.grossMargin;
	const after = (1 + (result.breakEven ?? 0)) * (result.grossMargin - result.cost);
	close(after, before);
});

test("cashback: sem empate quando o crédito usado alcança a margem", () => {
	const result = computeCashbackCalculator({ ticket: 100, margin: 10, cashback: 20, redemption: 100, sales: 100 });
	assert.equal(result.breakEven, null);
	close(result.marginShare, 2);
	assert.equal(result.warning, true);
});

test("cashback: a tabela inclui o percentual escolhido, em ordem e sem repetir", () => {
	const levels = (cashback: number) => computeCashbackCalculator({ ...CASHBACK_CALCULATOR_DEFAULTS, cashback }).compare.map((row) => row.cashback);
	assert.deepEqual(levels(5), [2, 3, 5, 7, 10, 15]);
	assert.deepEqual(levels(5.5), [2, 3, 5, 5.5, 7, 10, 15]);
	assert.deepEqual(levels(20), [2, 3, 5, 7, 10, 15, 20]);
	const selected = computeCashbackCalculator({ ...CASHBACK_CALCULATOR_DEFAULTS, cashback: 5.5 }).compare.filter((row) => row.selected);
	assert.deepEqual(
		selected.map((row) => row.cashback),
		[5.5],
	);
});

test("whatsapp: o exemplo do artigo (2.000 clientes, 2 campanhas, 1 aviso, 300 conversas × 10)", () => {
	const result = computeWhatsappCost(WHATSAPP_COST_DEFAULTS);
	assert.deepEqual(result.messages, { marketing: 4000, utility: 2000, service: 3000 });
	close(result.costs.marketing, 1286.8);
	close(result.costs.utility, 70);
	close(result.costs.service, 105);
	close(result.total, 1461.8);
	assert.equal(result.totalMessages, 9000);
	close(result.costPerClient, 1461.8 / 2000);
	close(result.saving?.amount ?? Number.NaN, 2800 * 0.3217);
});

test("whatsapp: sem dica de economia quando o alcance já é baixo ou não há campanha", () => {
	assert.equal(computeWhatsappCost({ ...WHATSAPP_COST_DEFAULTS, reach: 30 }).saving, null);
	assert.equal(computeWhatsappCost({ ...WHATSAPP_COST_DEFAULTS, campaigns: 0 }).saving, null);
});

test("whatsapp: mensagens de marketing arredondadas e custo por cliente sem base", () => {
	const result = computeWhatsappCost({ ...WHATSAPP_COST_DEFAULTS, base: 100, campaigns: 1, reach: 5 });
	assert.equal(result.messages.marketing, 5);
	assert.equal(computeWhatsappCost({ ...WHATSAPP_COST_DEFAULTS, base: 0 }).costPerClient, 0);
});
