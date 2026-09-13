import assert from "node:assert/strict";
import test from "node:test";
import { getCouponCheckoutConditionIssue, readCouponCheckoutConditions } from "./conditions";
import { evaluateCouponAgainstSaleValue } from "./engine";

test("null and empty modalities are unrestricted, including unknown fulfillment", () => {
	for (const modes of [null, [], undefined]) {
		assert.equal(
			getCouponCheckoutConditionIssue({ condicaoModalidadesEntrega: modes }, { entregaModalidade: null, comprasAnterioresConfirmadas: 4 }),
			null,
		);
	}
});

test("restricted coupons require an explicit allowed modality in every validation mode", () => {
	const conditions = { condicaoModalidadesEntrega: ["ENTREGA" as const], condicaoPrimeiraCompra: true };
	assert.match(getCouponCheckoutConditionIssue(conditions, { entregaModalidade: null, comprasAnterioresConfirmadas: 0 })!, /Selecione/);
	assert.match(getCouponCheckoutConditionIssue(conditions, { entregaModalidade: "PRESENCIAL", comprasAnterioresConfirmadas: 0 })!, /modalidade/);
	assert.match(getCouponCheckoutConditionIssue(conditions, { entregaModalidade: "ENTREGA", comprasAnterioresConfirmadas: 1 })!, /primeira compra/);
	assert.equal(getCouponCheckoutConditionIssue(conditions, { entregaModalidade: "ENTREGA", comprasAnterioresConfirmadas: 0 }), null);
});

test("legacy snapshots stay unrestricted; manual redemption snapshots retain restrictions", () => {
	assert.deepEqual(readCouponCheckoutConditions(null), {});
	assert.equal(
		getCouponCheckoutConditionIssue(readCouponCheckoutConditions({ beneficioTipo: "DESCONTO_FIXO" }), {
			entregaModalidade: null,
			comprasAnterioresConfirmadas: 3,
		}),
		null,
	);
	const snapshot = { validacaoModo: "MANUAL", condicaoModalidadesEntrega: ["ENTREGA"], condicaoPrimeiraCompra: true };
	assert.match(
		getCouponCheckoutConditionIssue(readCouponCheckoutConditions(snapshot), { entregaModalidade: "RETIRADA", comprasAnterioresConfirmadas: 0 })!,
		/modalidade/,
	);
});

test("POI sale-value evaluation applies checkout conditions before calculating discount", () => {
	const coupon = {
		validacaoModo: "AUTOMATICA",
		beneficioTipo: "DESCONTO_FIXO",
		beneficioValor: 10,
		beneficioDescontoMaximo: null,
		beneficioAplicacao: "VENDA_TOTAL",
		condicaoValorMinimoVenda: null,
		condicaoModalidadesEntrega: ["RETIRADA"],
		condicaoPrimeiraCompra: true,
	} as const;
	const input = { coupon: { ...coupon, condicaoModalidadesEntrega: ["RETIRADA" as const] }, targets: [], saleValue: 100 };
	assert.equal(
		evaluateCouponAgainstSaleValue({ ...input, context: { entregaModalidade: "RETIRADA", comprasAnterioresConfirmadas: 0 } }).elegivel,
		true,
	);
	assert.equal(
		evaluateCouponAgainstSaleValue({ ...input, context: { entregaModalidade: "PRESENCIAL", comprasAnterioresConfirmadas: 0 } }).elegivel,
		false,
	);
	assert.equal(
		evaluateCouponAgainstSaleValue({ ...input, context: { entregaModalidade: "RETIRADA", comprasAnterioresConfirmadas: 1 } }).elegivel,
		false,
	);
});
