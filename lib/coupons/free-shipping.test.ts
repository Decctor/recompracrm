import assert from "node:assert/strict";
import test from "node:test";
import { AppliedCouponSchema } from "@/schemas/coupons";
import type { TCouponEntity } from "@/services/drizzle/schema";
import { assertCouponCoherence } from "./creation";
import { FREE_SHIPPING_ALREADY_FREE_REASON, FREE_SHIPPING_DELIVERY_ONLY_REASON, evaluateCouponAgainstCart, evaluateCouponAgainstSaleValue } from "./engine";
import {
	applyFreeShippingCoupon,
	isFreeShippingRedemption,
	readAppliedCouponWaivedDeliveryFee,
	readCouponRedemptionItemDiscount,
	readCouponRedemptionWaivedDeliveryFee,
	resolveAppliedCouponValues,
} from "./free-shipping";

const freeShippingCoupon = {
	validacaoModo: "AUTOMATICA",
	beneficioTipo: "FRETE_GRATIS",
	beneficioValor: null,
	beneficioDescontoMaximo: null,
	beneficioAplicacao: "VENDA_TOTAL",
	beneficioCompreQuantidade: null,
	beneficioLeveQuantidade: null,
	condicaoValorMinimoVenda: null,
	condicaoQuantidadeMinimaItens: null,
	condicaoModalidadesEntrega: ["ENTREGA"],
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

const cartItems = [{ chave: "item-1", produtoId: "produto-1", quantidade: 2, valorVendaUnitario: 30 }];
const deliveryContext = { entregaModalidade: "ENTREGA" as const, comprasAnterioresConfirmadas: 0, taxaEntrega: 8.5 };

test("free shipping waives the whole delivery fee and discounts no item", () => {
	const result = evaluateCouponAgainstCart({ coupon: freeShippingCoupon, targets: [], cartItems, context: deliveryContext });
	assert.deepEqual(result, { elegivel: true, valorDesconto: 8.5, aplicacao: "ENTREGA", descontosPorItem: [] });
});

test("free shipping is refused outside delivery", () => {
	for (const entregaModalidade of ["RETIRADA", "PRESENCIAL", "COMANDA"] as const) {
		const result = evaluateCouponAgainstCart({
			coupon: freeShippingCoupon,
			targets: [],
			cartItems,
			context: { ...deliveryContext, entregaModalidade },
		});
		assert.equal(result.elegivel, false, entregaModalidade);
	}
	// Mesmo um cupom gravado sem a condição de modalidade não vale fora da entrega.
	const withoutModeCondition = evaluateCouponAgainstCart({
		coupon: { ...freeShippingCoupon, condicaoModalidadesEntrega: null },
		targets: [],
		cartItems,
		context: { ...deliveryContext, entregaModalidade: "RETIRADA" },
	});
	assert.deepEqual(withoutModeCondition, { elegivel: false, motivo: FREE_SHIPPING_DELIVERY_ONLY_REASON });
});

test("free shipping is not spent when the delivery is already free or the fee is unknown", () => {
	for (const taxaEntrega of [0, null, undefined]) {
		const result = evaluateCouponAgainstCart({
			coupon: freeShippingCoupon,
			targets: [],
			cartItems,
			context: { ...deliveryContext, taxaEntrega },
		});
		assert.deepEqual(result, { elegivel: false, motivo: FREE_SHIPPING_ALREADY_FREE_REASON });
	}
});

test("free shipping still honours cart conditions and required products", () => {
	const belowMinimum = evaluateCouponAgainstCart({
		coupon: { ...freeShippingCoupon, condicaoValorMinimoVenda: 80 },
		targets: [],
		cartItems,
		context: deliveryContext,
	});
	assert.equal(belowMinimum.elegivel, false);

	const requiredProduct = { papel: "ELEGIVEL" as const, produtoId: "produto-2", produtoVarianteId: null, grupo: null, quantidadeMinima: 1 };
	const missingProduct = evaluateCouponAgainstCart({ coupon: freeShippingCoupon, targets: [requiredProduct], cartItems, context: deliveryContext });
	assert.equal(missingProduct.elegivel, false);

	const withProduct = evaluateCouponAgainstCart({
		coupon: freeShippingCoupon,
		targets: [{ ...requiredProduct, produtoId: "produto-1" }],
		cartItems,
		context: deliveryContext,
	});
	assert.equal(withProduct.elegivel, true);
});

test("surfaces that only know the sale value cannot evaluate free shipping", () => {
	const result = evaluateCouponAgainstSaleValue({ coupon: freeShippingCoupon, targets: [], saleValue: 100, context: deliveryContext });
	assert.equal(result.elegivel, false);
});

test("server coherence pins free shipping to automatic validation, delivery and fee-aware surfaces", () => {
	const coupon = { ...freeShippingCoupon, escopo: "GLOBAL" as const, condicoesTexto: null, resgatePermitirViaPontoInteracao: false };
	const target = { papel: "ELEGIVEL" as const, produtoId: "produto-1", produtoVarianteId: null, grupo: null, quantidadeMinima: 1 };
	assert.doesNotThrow(() => assertCouponCoherence({ coupon, targets: [], audiences: [] }));
	assert.doesNotThrow(() => assertCouponCoherence({ coupon, targets: [target], audiences: [] }));
	assert.throws(() => assertCouponCoherence({ coupon: { ...coupon, validacaoModo: "MANUAL", condicoesTexto: "x" }, targets: [], audiences: [] }));
	assert.throws(() => assertCouponCoherence({ coupon: { ...coupon, condicaoModalidadesEntrega: [] }, targets: [], audiences: [] }));
	assert.throws(() => assertCouponCoherence({ coupon: { ...coupon, condicaoModalidadesEntrega: ["ENTREGA", "RETIRADA"] }, targets: [], audiences: [] }));
	assert.throws(() => assertCouponCoherence({ coupon: { ...coupon, resgatePermitirViaPontoInteracao: true }, targets: [], audiences: [] }));
	assert.throws(() => assertCouponCoherence({ coupon, targets: [{ ...target, papel: "BENEFICIADO" }], audiences: [] }));
});

test("applied coupon values keep the waived fee apart from the item discount", () => {
	assert.deepEqual(resolveAppliedCouponValues({ elegivel: true, valorDesconto: 8.5, aplicacao: "ENTREGA", descontosPorItem: [] }), {
		valorDesconto: 0,
		taxaEntregaIsenta: 8.5,
	});
	assert.deepEqual(resolveAppliedCouponValues({ elegivel: true, valorDesconto: 10, aplicacao: "VENDA_TOTAL", descontosPorItem: [] }), {
		valorDesconto: 10,
		taxaEntregaIsenta: null,
	});
	assert.equal(readAppliedCouponWaivedDeliveryFee({ valorDesconto: 0, taxaEntregaIsenta: 8.5 }), 8.5);
	assert.equal(readAppliedCouponWaivedDeliveryFee({ valorDesconto: 10 }), 0);
	assert.equal(readAppliedCouponWaivedDeliveryFee(null), 0);
});

test("the applied coupon payload accepts a waived fee with no item discount, and nothing else at zero", () => {
	assert.equal(AppliedCouponSchema.safeParse({ cupomId: "c", valorDesconto: 0, taxaEntregaIsenta: 8.5 }).success, true);
	assert.equal(AppliedCouponSchema.safeParse({ cupomId: "c", valorDesconto: 10 }).success, true);
	assert.equal(AppliedCouponSchema.safeParse({ cupomId: "c", valorDesconto: 0 }).success, false);
	assert.equal(AppliedCouponSchema.safeParse({ cupomId: "c", valorDesconto: 0, taxaEntregaIsenta: 0 }).success, false);
});

test("the cart charges no delivery fee while a free-shipping coupon is applied, and keeps the fee for when it is removed", () => {
	const withCoupon = { taxaEntrega: 8.5, cupomResgate: { cupomId: "c", valorDesconto: 0, taxaEntregaIsenta: 5 } };
	const derived = applyFreeShippingCoupon(withCoupon);
	assert.equal(derived.taxaEntrega, 0);
	// A isenção acompanha a taxa atual do carrinho, não a do momento em que o cupom foi aplicado.
	assert.equal(derived.cupomResgate.taxaEntregaIsenta, 8.5);
	assert.equal(withCoupon.taxaEntrega, 8.5);

	const regularCoupon = { taxaEntrega: 8.5, cupomResgate: { cupomId: "c", valorDesconto: 10, taxaEntregaIsenta: null } };
	assert.equal(applyFreeShippingCoupon(regularCoupon), regularCoupon);
	const noCoupon = { taxaEntrega: 8.5, cupomResgate: null };
	assert.equal(applyFreeShippingCoupon(noCoupon), noCoupon);
});

test("a free-shipping redemption is a waived fee, never an item discount", () => {
	const freeShipping = { valorDesconto: 8.5, beneficioSnapshot: { beneficioTipo: "FRETE_GRATIS", taxaEntregaIsenta: 8.5 } };
	assert.equal(isFreeShippingRedemption(freeShipping), true);
	assert.equal(readCouponRedemptionItemDiscount(freeShipping), 0);
	assert.equal(readCouponRedemptionWaivedDeliveryFee(freeShipping), 8.5);

	const discount = { valorDesconto: 10, beneficioSnapshot: { beneficioTipo: "DESCONTO_FIXO" } };
	assert.equal(readCouponRedemptionItemDiscount(discount), 10);
	assert.equal(readCouponRedemptionWaivedDeliveryFee(discount), 0);
	// Resgates antigos sem snapshot são descontos comuns.
	assert.equal(readCouponRedemptionItemDiscount({ valorDesconto: 7, beneficioSnapshot: null }), 7);
	assert.equal(readCouponRedemptionItemDiscount(null), 0);
});
