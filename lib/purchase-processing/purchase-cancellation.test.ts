import assert from "node:assert/strict";
import { test } from "node:test";
import { getDefaultCancellationResolution, planPurchaseCancellation } from "./purchase-cancellation";

const paidAt = new Date("2026-11-01T12:00:00Z");

test("pendente cancela e paga devolve por padrão", () => {
	assert.equal(getDefaultCancellationResolution({ dataEfetivacao: null }), "CANCELAR");
	assert.equal(getDefaultCancellationResolution({ dataEfetivacao: paidAt }), "DEVOLUCAO");
});

test("soma os efeitos de cada resolução e retém mantidas + perdas", () => {
	const plan = planPurchaseCancellation({
		transactions: [
			{ id: "p1", valor: 300, dataEfetivacao: paidAt },
			{ id: "p2", valor: 100, dataEfetivacao: paidAt },
			{ id: "a1", valor: 400, dataEfetivacao: null },
			{ id: "a2", valor: 200, dataEfetivacao: null },
		],
		resolutions: new Map([
			["p1", "DEVOLUCAO"],
			["p2", "PERDA"],
			["a1", "CANCELAR"],
			["a2", "MANTER"],
		]),
	});
	assert.deepEqual(plan.cancelTransactionIds, ["a1"]);
	assert.deepEqual(plan.refundTransactionIds, ["p1"]);
	assert.equal(plan.valorDevolucao, 300);
	assert.equal(plan.valorPerda, 100);
	assert.equal(plan.valorCancelado, 400);
	assert.equal(plan.valorMantido, 200);
	assert.equal(plan.valorRetido, 300);
});

test("recusa resolução incompatível com o estado da parcela", () => {
	assert.throws(
		() => planPurchaseCancellation({ transactions: [{ id: "p1", valor: 10, dataEfetivacao: paidAt }], resolutions: new Map([["p1", "CANCELAR"]]) }),
		/parcela paga/,
	);
	assert.throws(
		() => planPurchaseCancellation({ transactions: [{ id: "a1", valor: 10, dataEfetivacao: null }], resolutions: new Map([["a1", "PERDA"]]) }),
		/parcela pendente/,
	);
});

test("exige resolução para toda parcela que ainda vale e ignora as já canceladas", () => {
	assert.throws(
		() => planPurchaseCancellation({ transactions: [{ id: "a1", valor: 10, dataEfetivacao: null }], resolutions: new Map() }),
		/cada parcela/,
	);
	const plan = planPurchaseCancellation({
		transactions: [{ id: "old", valor: 10, dataEfetivacao: null, dataCancelamento: paidAt }],
		resolutions: new Map(),
	});
	assert.equal(plan.valorRetido, 0);
	assert.throws(
		() =>
			planPurchaseCancellation({
				transactions: [{ id: "old", valor: 10, dataEfetivacao: null, dataCancelamento: paidAt }],
				resolutions: new Map([["old", "CANCELAR"]]),
			}),
		/não pertence/,
	);
});
