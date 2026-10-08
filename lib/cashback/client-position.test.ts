import assert from "node:assert/strict";
import test from "node:test";
import {
	describeCashbackDiscount,
	describeCashbackPrizeGap,
	estimatePurchaseToAccumulate,
	listCashbackRedemptionSurfaceLabels,
} from "./client-position";

const percentProgram = { acumuloTipo: "PERCENTUAL" as const, acumuloValor: 5, acumuloRegraValorMinimo: 20 };
const fixedProgram = { acumuloTipo: "FIXO" as const, acumuloValor: 10, acumuloRegraValorMinimo: 50 };

test("prize gap: eligible when the balance covers the prize", () => {
	const gap = describeCashbackPrizeGap({ program: percentProgram, prizeValue: 30, saldoDisponivel: 38 });
	assert.deepEqual(gap, { resgatavel: true, falta: 0, compraEstimada: null });
});

test("prize gap: percentage accumulation estimates the purchase total that closes the gap", () => {
	const gap = describeCashbackPrizeGap({ program: percentProgram, prizeValue: 80, saldoDisponivel: 38 });
	assert.equal(gap.resgatavel, false);
	assert.equal(gap.falta, 42);
	assert.equal(gap.compraEstimada?.valorCompras, 840);
	assert.equal(gap.compraEstimada?.quantidadeCompras, null);
	assert.match(gap.compraEstimada?.descricao ?? "", /840,00/);
	assert.match(gap.compraEstimada?.descricao ?? "", /estimativa/);
});

test("prize gap: a purchase below the program minimum accumulates nothing, so the estimate never goes below it", () => {
	const estimate = estimatePurchaseToAccumulate({ program: percentProgram, falta: 0.5 });
	assert.equal(estimate?.valorCompras, 20);
});

test("prize gap: fixed accumulation counts purchases and prices them by the minimum", () => {
	const gap = describeCashbackPrizeGap({ program: fixedProgram, prizeValue: 100, saldoDisponivel: 75 });
	assert.equal(gap.falta, 25);
	assert.equal(gap.compraEstimada?.quantidadeCompras, 3);
	assert.equal(gap.compraEstimada?.valorCompras, 150);
	assert.match(gap.compraEstimada?.descricao ?? "", /3 compras de pelo menos R\$ 50,00/);
});

test("prize gap: fixed accumulation without a minimum has no purchase total", () => {
	const estimate = estimatePurchaseToAccumulate({ program: { ...fixedProgram, acumuloRegraValorMinimo: 0 }, falta: 10 });
	assert.equal(estimate?.quantidadeCompras, 1);
	assert.equal(estimate?.valorCompras, null);
	assert.match(estimate?.descricao ?? "", /^1 compra \(/);
});

test("prize gap: a program that does not accumulate has no path to the prize", () => {
	assert.equal(estimatePurchaseToAccumulate({ program: { ...percentProgram, acumuloValor: 0 }, falta: 10 }), null);
});

test("discount: percentage limit states the rule instead of a number", () => {
	const discount = describeCashbackDiscount({
		program: { terminologia: "DINHEIRO", modalidadeDescontosPermitida: true, resgateLimiteTipo: "PERCENTUAL", resgateLimiteValor: 30 },
		saldoDisponivel: 38,
	});
	assert.equal(discount.permitido, true);
	assert.equal(discount.maximoPorCompra, null);
	assert.equal(discount.limitePercentualDaCompra, 30);
	assert.match(discount.regra, /R\$ 38,00/);
	assert.match(discount.regra, /30% do valor de cada compra/);
});

test("discount: fixed limit caps the balance per purchase", () => {
	const discount = describeCashbackDiscount({
		program: { terminologia: "DINHEIRO", modalidadeDescontosPermitida: true, resgateLimiteTipo: "FIXO", resgateLimiteValor: 20 },
		saldoDisponivel: 38,
	});
	assert.equal(discount.maximoPorCompra, 20);
	assert.match(discount.regra, /R\$ 20,00/);
	assert.match(discount.regra, /próximas compras/);
});

test("discount: no limit uses the whole balance up to the purchase value", () => {
	const discount = describeCashbackDiscount({
		program: { terminologia: "DINHEIRO", modalidadeDescontosPermitida: true, resgateLimiteTipo: null, resgateLimiteValor: null },
		saldoDisponivel: 38,
	});
	assert.equal(discount.maximoPorCompra, 38);
	assert.match(discount.regra, /até o valor da compra/);
});

test("discount: points programs speak in points", () => {
	const discount = describeCashbackDiscount({
		program: { terminologia: "PONTOS", modalidadeDescontosPermitida: true, resgateLimiteTipo: null, resgateLimiteValor: null },
		saldoDisponivel: 120,
	});
	assert.match(discount.regra, /120 pontos/);
});

test("discount: empty balance and discount-less programs are stated, not computed", () => {
	const noBalance = describeCashbackDiscount({
		program: { terminologia: "DINHEIRO", modalidadeDescontosPermitida: true, resgateLimiteTipo: null, resgateLimiteValor: null },
		saldoDisponivel: 0,
	});
	assert.equal(noBalance.maximoPorCompra, 0);
	const notAllowed = describeCashbackDiscount({
		program: { terminologia: "DINHEIRO", modalidadeDescontosPermitida: false, resgateLimiteTipo: null, resgateLimiteValor: null },
		saldoDisponivel: 38,
	});
	assert.equal(notAllowed.permitido, false);
});

test("redemption surfaces are listed in words, only the enabled ones", () => {
	const labels = listCashbackRedemptionSurfaceLabels({
		resgatePermitirViaPos: true,
		resgatePermitirViaPontoIntegracao: false,
		resgatePermitirViaLojaDigital: true,
	});
	assert.equal(labels.length, 2);
	assert.match(labels[0] ?? "", /PDV/);
	assert.match(labels[1] ?? "", /loja digital/);
	assert.deepEqual(
		listCashbackRedemptionSurfaceLabels({
			resgatePermitirViaPos: false,
			resgatePermitirViaPontoIntegracao: false,
			resgatePermitirViaLojaDigital: false,
		}),
		[],
	);
});
