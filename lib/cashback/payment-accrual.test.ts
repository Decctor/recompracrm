import assert from "node:assert/strict";
import test from "node:test";
import { type TAccrualPayment, computePaymentAccrualBase, getPaymentAccrualRule, resolveIntegratedSaleAccrual, resolveSaleAccrual } from "./payment-accrual";

const saleDate = new Date("2026-11-10T13:00:00.000Z");
const paidLater = new Date("2026-12-05T15:00:00.000Z");

test("rule: missing method in a configured map scores at the sale; A_DEFINIR has no rule", () => {
	assert.deepEqual(getPaymentAccrualRule({}, "PIX"), { pontua: true, momento: "NA_VENDA" });
	assert.deepEqual(getPaymentAccrualRule({ PIX: { pontua: false, momento: "NA_VENDA" } }, "PIX"), { pontua: false, momento: "NA_VENDA" });
	assert.equal(getPaymentAccrualRule({}, "A_DEFINIR"), null);
});

test("single payment scores the whole sale at the sale date", () => {
	const result = resolveSaleAccrual({ saleTotal: 26, saleDate, payments: [{ metodo: "DINHEIRO", valor: 26 }], rules: {} });
	assert.deepEqual(result, { status: "PONTUAVEL", base: 26, momento: saleDate, metodos: ["DINHEIRO"] });
});

test("change (troco) comes as a negative cash line and nets out", () => {
	const { base } = computePaymentAccrualBase({
		saleTotal: 26,
		payments: [
			{ metodo: "DINHEIRO", valor: 50 },
			{ metodo: "DINHEIRO", valor: -24 },
		],
		rules: {},
	});
	assert.equal(base, 26);
});

test("a non-scoring method (subsidy mapped to OUTRO) leaves its share out", () => {
	const result = resolveSaleAccrual({
		saleTotal: 50,
		saleDate,
		payments: [
			{ metodo: "CARTAO_CREDITO", valor: 30 },
			{ metodo: "OUTRO", valor: 20 },
		],
		rules: { OUTRO: { pontua: false, momento: "NA_VENDA" } },
	});
	assert.equal(result.status, "PONTUAVEL");
	assert.equal(result.status === "PONTUAVEL" && result.base, 30);
	assert.deepEqual(result.status === "PONTUAVEL" && result.metodos, ["CARTAO_CREDITO"]);
});

test("payments that do not add up to the total are applied as a proportion of the total", () => {
	const { base } = computePaymentAccrualBase({
		saleTotal: 50,
		payments: [
			{ metodo: "PIX", valor: 48 },
			{ metodo: "OUTRO", valor: 12 },
		],
		rules: { OUTRO: { pontua: false, momento: "NA_VENDA" } },
	});
	assert.equal(base, 40);
});

test("a sale paid only in non-scoring methods has no base", () => {
	const result = resolveSaleAccrual({
		saleTotal: 98.57,
		saleDate,
		payments: [{ metodo: "OUTRO", valor: 98.57 }],
		rules: { OUTRO: { pontua: false, momento: "NA_VENDA" } },
	});
	assert.deepEqual(result, { status: "SEM_BASE" });
});

test("credit and debit are distinct methods with their own rules", () => {
	const { base } = computePaymentAccrualBase({
		saleTotal: 100,
		payments: [
			{ metodo: "CARTAO_CREDITO", valor: 60 },
			{ metodo: "CARTAO_DEBITO", valor: 40 },
		],
		rules: { CARTAO_DEBITO: { pontua: false, momento: "NA_VENDA" } },
	});
	assert.equal(base, 60);
});

test("on-settlement store credit waits while open and scores on the settlement date", () => {
	const rules = { FIADO_NOTA: { pontua: true, momento: "NA_QUITACAO" as const } };
	const open = resolveSaleAccrual({ saleTotal: 80, saleDate, payments: [{ metodo: "FIADO_NOTA", valor: 80, quitadoEm: null }], rules });
	assert.deepEqual(open, { status: "AGUARDANDO", motivo: "QUITACAO_PENDENTE" });

	const settled = resolveSaleAccrual({ saleTotal: 80, saleDate, payments: [{ metodo: "FIADO_NOTA", valor: 80, quitadoEm: paidLater }], rules });
	assert.deepEqual(settled, { status: "PONTUAVEL", base: 80, momento: paidLater, metodos: ["FIADO_NOTA"] });
});

test("unknown settlement (source does not report it) falls back to the sale date", () => {
	const result = resolveSaleAccrual({
		saleTotal: 80,
		saleDate,
		payments: [{ metodo: "FIADO_NOTA", valor: 80 }],
		rules: { FIADO_NOTA: { pontua: true, momento: "NA_QUITACAO" } },
	});
	assert.equal(result.status === "PONTUAVEL" && result.momento, saleDate);
});

test("a settlement before the sale never moves the accrual earlier than the sale", () => {
	const result = resolveSaleAccrual({
		saleTotal: 80,
		saleDate,
		payments: [{ metodo: "PIX", valor: 80, quitadoEm: new Date("2026-11-01T00:00:00.000Z") }],
		rules: { PIX: { pontua: true, momento: "NA_QUITACAO" } },
	});
	assert.equal(result.status === "PONTUAVEL" && result.momento, saleDate);
});

test("mixed sale scores once, whole, when the last scoring payment becomes eligible", () => {
	const rules = { FIADO_NOTA: { pontua: true, momento: "NA_QUITACAO" as const } };
	const payments: TAccrualPayment[] = [
		{ metodo: "PIX", valor: 20, quitadoEm: saleDate },
		{ metodo: "FIADO_NOTA", valor: 60, quitadoEm: null },
	];
	assert.deepEqual(resolveSaleAccrual({ saleTotal: 80, saleDate, payments, rules }), { status: "AGUARDANDO", motivo: "QUITACAO_PENDENTE" });

	payments[1] = { ...payments[1], quitadoEm: paidLater };
	const result = resolveSaleAccrual({ saleTotal: 80, saleDate, payments, rules });
	assert.deepEqual(result, { status: "PONTUAVEL", base: 80, momento: paidLater, metodos: ["PIX", "FIADO_NOTA"] });
});

test("an open payment in a non-scoring method never holds the sale", () => {
	const result = resolveSaleAccrual({
		saleTotal: 80,
		saleDate,
		payments: [
			{ metodo: "PIX", valor: 50, quitadoEm: saleDate },
			{ metodo: "FIADO_NOTA", valor: 30, quitadoEm: null },
		],
		rules: { FIADO_NOTA: { pontua: false, momento: "NA_QUITACAO" } },
	});
	assert.equal(result.status === "PONTUAVEL" && result.base, 50);
});

test("a payment still without a method (A_DEFINIR) holds the sale", () => {
	const result = resolveSaleAccrual({
		saleTotal: 80,
		saleDate,
		payments: [
			{ metodo: "PIX", valor: 50 },
			{ metodo: "A_DEFINIR", valor: 30 },
		],
		rules: {},
	});
	assert.deepEqual(result, { status: "AGUARDANDO", motivo: "PAGAMENTO_A_DEFINIR" });
});

test("coverage: POS payments that do not reach the total hold the sale only when required", () => {
	const payments = [{ metodo: "PIX" as const, valor: 30 }];
	assert.deepEqual(resolveSaleAccrual({ saleTotal: 50, saleDate, payments, rules: {}, requireCoverage: true }), {
		status: "AGUARDANDO",
		motivo: "PAGAMENTO_INCOMPLETO",
	});
	const integration = resolveSaleAccrual({ saleTotal: 50, saleDate, payments, rules: {} });
	assert.equal(integration.status === "PONTUAVEL" && integration.base, 50);
});

test("no payments informed at all has no base", () => {
	assert.deepEqual(resolveSaleAccrual({ saleTotal: 50, saleDate, payments: [], rules: {} }), { status: "SEM_BASE" });
});

test("integrated sale: no rules or no payments from the source keeps the legacy total at the sale date", () => {
	const payments = [{ metodo: "OUTRO" as const, valor: 50 }];
	assert.deepEqual(resolveIntegratedSaleAccrual({ rules: null, saleTotal: 50, saleDate, payments }), { base: null, momento: saleDate, metodos: null });
	assert.deepEqual(resolveIntegratedSaleAccrual({ rules: {}, saleTotal: 50, saleDate, payments: null }), { base: null, momento: saleDate, metodos: null });
	assert.deepEqual(resolveIntegratedSaleAccrual({ rules: {}, saleTotal: 50, saleDate, payments: [] }), { base: null, momento: saleDate, metodos: null });
});

test("integrated sale: with rules and payments, non-scoring methods are left out and nothing scores when none does", () => {
	const rules = { OUTRO: { pontua: false, momento: "NA_VENDA" as const } };
	assert.deepEqual(
		resolveIntegratedSaleAccrual({
			rules,
			saleTotal: 50,
			saleDate,
			payments: [
				{ metodo: "CARTAO_CREDITO", valor: 30 },
				{ metodo: "OUTRO", valor: 20 },
			],
		}),
		{ base: 30, momento: saleDate, metodos: ["CARTAO_CREDITO"] },
	);
	assert.equal(resolveIntegratedSaleAccrual({ rules, saleTotal: 22.8, saleDate, payments: [{ metodo: "OUTRO", valor: 22.8 }] }), null);
});
