import assert from "node:assert/strict";
import test from "node:test";
import type { TCouponEntity } from "@/services/drizzle/schema";
import { evaluateCouponAgainstCart } from "./engine";

const baseCoupon = {
	validacaoModo: "AUTOMATICA",
	beneficioTipo: "DESCONTO_PERCENTUAL",
	beneficioValor: 10,
	beneficioDescontoMaximo: null,
	beneficioAplicacao: "VENDA_TOTAL",
	beneficioCompreQuantidade: null,
	beneficioLeveQuantidade: null,
	condicaoValorMinimoVenda: null,
	condicaoQuantidadeMinimaItens: null,
	condicaoModalidadesEntrega: null,
	condicaoPrimeiraCompra: false,
	condicaoAlvosOperador: "QUALQUER",
} satisfies Pick<
	TCouponEntity,
	| "validacaoModo"
	| "beneficioTipo"
	| "beneficioValor"
	| "beneficioDescontoMaximo"
	| "beneficioAplicacao"
	| "beneficioCompreQuantidade"
	| "beneficioLeveQuantidade"
	| "condicaoValorMinimoVenda"
	| "condicaoQuantidadeMinimaItens"
	| "condicaoModalidadesEntrega"
	| "condicaoPrimeiraCompra"
	| "condicaoAlvosOperador"
>;

const cartItems = [{ chave: "item-1", produtoId: "produto-1", quantidade: 1, valorVendaUnitario: 100 }];

test("accepts a coupon for an allowed fulfillment mode", () => {
	const result = evaluateCouponAgainstCart({
		coupon: { ...baseCoupon, condicaoModalidadesEntrega: ["ENTREGA"] },
		targets: [],
		cartItems,
		context: { entregaModalidade: "ENTREGA", comprasAnterioresConfirmadas: 2 },
	});
	assert.deepEqual(result, { elegivel: true, valorDesconto: 10, aplicacao: "VENDA_TOTAL", descontosPorItem: [] });
});

test("rejects a coupon for a different fulfillment mode", () => {
	const result = evaluateCouponAgainstCart({
		coupon: { ...baseCoupon, condicaoModalidadesEntrega: ["ENTREGA"] },
		targets: [],
		cartItems,
		context: { entregaModalidade: "RETIRADA", comprasAnterioresConfirmadas: 0 },
	});
	assert.equal(result.elegivel, false);
});

test("accepts a first-purchase coupon when there are no previous confirmed purchases", () => {
	const result = evaluateCouponAgainstCart({
		coupon: { ...baseCoupon, condicaoPrimeiraCompra: true },
		targets: [],
		cartItems,
		context: { entregaModalidade: "PRESENCIAL", comprasAnterioresConfirmadas: 0 },
	});
	assert.equal(result.elegivel, true);
});

test("rejects a first-purchase coupon after a confirmed purchase", () => {
	const result = evaluateCouponAgainstCart({
		coupon: { ...baseCoupon, condicaoPrimeiraCompra: true },
		targets: [],
		cartItems,
		context: { entregaModalidade: "PRESENCIAL", comprasAnterioresConfirmadas: 1 },
	});
	assert.deepEqual(result, { elegivel: false, motivo: "Este cupom é válido somente na primeira compra." });
});
