import assert from "node:assert/strict";
import test from "node:test";
import { AppliedCouponSchema } from "@/schemas/coupons";
import { evaluateCouponAgainstCart, evaluateCouponAgainstSaleValue } from "./engine";
import {
	buildCouponGiftOptions,
	filterCouponGiftProducts,
	readCouponItemIdentity,
	readCouponItemBasePrice,
	resolveAppliedCouponEvaluation,
} from "./gifts";
import { assertCouponCoherence } from "./creation";
import { buildDraftItemSnapshot } from "@/lib/sales/drafts/sync-draft-items";
import { resolveFiscalHeaderDiscount, allocateFiscalHeaderDiscount } from "@/lib/fiscal/header-discount";
import { normalizeCouponGiftItem, roundCouponGiftCurrency } from "./gift-pricing";
import { mapSaleDraftToSaleState } from "@/lib/sales/map-sale-draft-to-sale-state";

const coupon: Parameters<typeof evaluateCouponAgainstCart>[0]["coupon"] = {
	validacaoModo: "AUTOMATICA",
	beneficioTipo: "BRINDE",
	beneficioValor: null,
	beneficioDescontoMaximo: null,
	beneficioAplicacao: "ITENS_ELEGIVEIS",
	beneficioCompreQuantidade: null,
	beneficioLeveQuantidade: null,
	condicaoValorMinimoVenda: null,
	condicaoQuantidadeMinimaItens: null,
	condicaoModalidadesEntrega: null,
	condicaoPrimeiraCompra: false,
	condicaoAlvosOperador: "QUALQUER",
};
const target = { papel: "BENEFICIADO" as const, produtoId: "drink", produtoVarianteId: null, grupo: null, quantidadeMinima: 1 };
const context = { entregaModalidade: "RETIRADA" as const, comprasAnterioresConfirmadas: 0 };
const drink = { chave: "drink-line", produtoId: "drink", quantidade: 1, valorVendaUnitario: 12, valorUnitarioBase: 10 };
const purchase = { chave: "purchase-line", produtoId: "sandwich", quantidade: 1, valorVendaUnitario: 50, valorUnitarioBase: 50 };
const input = { coupon, targets: [target], cartItems: [purchase, drink], context, brinde: { itemChave: drink.chave, quantidade: 1 as const } };

test("a selected gift discounts exactly one base-price unit and retains payable extras", () => {
	const result = evaluateCouponAgainstCart({ ...input, cartItems: [purchase, { ...drink, quantidade: 3 }] });
	assert.equal(result.elegivel, true);
	if (!result.elegivel) return;
	assert.equal(result.valorDesconto, 10);
	assert.deepEqual(result.descontosPorItem, [{ chave: drink.chave, valorDesconto: 10 }]);
	assert.deepEqual(result.brinde, { ...input.brinde, produtoId: "drink", produtoVarianteId: null, valorUnitarioBase: 10, valorDesconto: 10 });
});

test("a gift-only cart is eligible with no purchase conditions", () => {
	assert.equal(evaluateCouponAgainstCart({ ...input, cartItems: [{ ...drink, valorVendaUnitario: 10 }] }).elegivel, true);
});

test("gift units cannot satisfy minimum spend, quantity, or required-product conditions", () => {
	for (const extra of [{ condicaoValorMinimoVenda: 60 }, { condicaoQuantidadeMinimaItens: 3 }]) {
		assert.equal(evaluateCouponAgainstCart({ ...input, coupon: { ...coupon, ...extra } }).elegivel, false);
	}
	const eligibleTarget = { ...target, papel: "ELEGIVEL" as const };
	assert.equal(evaluateCouponAgainstCart({ ...input, targets: [target, eligibleTarget] }).elegivel, false);
	assert.equal(
		evaluateCouponAgainstCart({ ...input, targets: [target, eligibleTarget], cartItems: [purchase, { ...drink, quantidade: 2 }] }).elegivel,
		true,
	);
});

test("paid extras contribute to minimum spend while the gifted base does not", () => {
	assert.equal(evaluateCouponAgainstCart({ ...input, coupon: { ...coupon, condicaoValorMinimoVenda: 52 } }).elegivel, true);
	assert.equal(evaluateCouponAgainstCart({ ...input, coupon: { ...coupon, condicaoValorMinimoVenda: 52.01 } }).elegivel, false);
});

test("gift choice stays explicit even when multiple allowed lines have different prices", () => {
	const other = { ...drink, chave: "other-line", valorVendaUnitario: 25, valorUnitarioBase: 25 };
	const cartItems = [other, drink];
	assert.equal(evaluateCouponAgainstCart({ ...input, cartItems, brinde: null }).elegivel, false);
	const result = evaluateCouponAgainstCart({ ...input, cartItems });
	assert.equal(result.elegivel && result.valorDesconto, 10);
	assert.equal(evaluateCouponAgainstCart({ ...input, cartItems: cartItems.toReversed() }).elegivel, true);
});

test("missing, duplicate, removed, unrelated, and fractional-only gift lines are rejected", () => {
	for (const cartItems of [[], [purchase], [drink, drink], [{ ...drink, produtoId: "unrelated" }], [{ ...drink, quantidade: 0.5 }]]) {
		assert.equal(evaluateCouponAgainstCart({ ...input, cartItems }).elegivel, false);
	}
	assert.equal(evaluateCouponAgainstCart({ ...input, brinde: { itemChave: "missing", quantidade: 1 } }).elegivel, false);
});

test("gift discounts require a valid base price and reject overlapping item discounts", () => {
	for (const extra of [
		{ valorUnitarioBase: undefined },
		{ valorUnitarioBase: NaN },
		{ valorUnitarioBase: Infinity },
		{ valorUnitarioBase: 0 },
		{ valorUnitarioBase: 0.001 },
		{ valorUnitarioBase: 13 },
		{ valorDesconto: 1 },
	]) {
		assert.equal(evaluateCouponAgainstCart({ ...input, cartItems: [{ ...drink, ...extra }] }).elegivel, false);
	}
});

test("gifts require explicit benefit targets and automatic item-scoped validation", () => {
	assert.equal(evaluateCouponAgainstCart({ ...input, targets: [] }).elegivel, false);
	assert.equal(evaluateCouponAgainstCart({ ...input, targets: [{ ...target, papel: "ELEGIVEL" }] }).elegivel, false);
	assert.equal(evaluateCouponAgainstCart({ ...input, coupon: { ...coupon, validacaoModo: "MANUAL" } }).elegivel, false);
	assert.equal(evaluateCouponAgainstCart({ ...input, coupon: { ...coupon, beneficioAplicacao: "VENDA_TOTAL" } }).elegivel, false);
});

test("variant-specific gifts cannot be redeemed against another variant", () => {
	const targets = [{ ...target, produtoId: null, produtoVarianteId: "small" }];
	assert.equal(evaluateCouponAgainstCart({ ...input, targets, cartItems: [{ ...drink, produtoVarianteId: "large" }] }).elegivel, false);
	assert.equal(evaluateCouponAgainstCart({ ...input, targets, cartItems: [{ ...drink, produtoVarianteId: "small" }] }).elegivel, true);
});

test("group gifts follow group matching and retain other checkout conditions", () => {
	const targets = [{ ...target, produtoId: null, grupo: "Drinks" }];
	assert.equal(evaluateCouponAgainstCart({ ...input, targets, cartItems: [{ ...drink, grupo: "Drinks" }] }).elegivel, true);
	assert.equal(
		evaluateCouponAgainstCart({
			...input,
			coupon: { ...coupon, condicaoPrimeiraCompra: true },
			context: { ...context, comprasAnterioresConfirmadas: 1 },
		}).elegivel,
		false,
	);
	assert.equal(evaluateCouponAgainstCart({ ...input, coupon: { ...coupon, condicaoModalidadesEntrega: ["ENTREGA"] } }).elegivel, false);
});

test("sale-total-only surfaces cannot evaluate gifts automatically", () => {
	assert.equal(evaluateCouponAgainstSaleValue({ coupon, targets: [target], saleValue: 100, context }).elegivel, false);
});

test("server coherence accepts valid gifts and rejects incomplete creation paths", () => {
	const coherence = { coupon: { ...coupon, escopo: "GLOBAL" as const, condicoesTexto: null }, targets: [target], audiences: [] };
	assert.doesNotThrow(() => assertCouponCoherence(coherence));
	assert.throws(() => assertCouponCoherence({ ...coherence, targets: [{ ...target, deletar: true }] }));
	assert.throws(() => assertCouponCoherence({ ...coherence, coupon: { ...coherence.coupon, validacaoModo: "MANUAL" } }));
});

test("preview evaluates each matching cart line without auto-selecting a gift", () => {
	const brindes = buildCouponGiftOptions(input);
	assert.equal(brindes.length, 1);
	const preview = { avaliacao: evaluateCouponAgainstCart({ ...input, brinde: null }), brindes };
	assert.equal(preview.avaliacao.elegivel, false);
	assert.equal(resolveAppliedCouponEvaluation(preview, { brinde: input.brinde })?.elegivel, true);
	assert.equal(resolveAppliedCouponEvaluation(preview, { brinde: { itemChave: "removed", quantidade: 1 } })?.elegivel, false);
});

test("restored gift coupons are explicitly invalid when their selected line disappears", () => {
	const applied = AppliedCouponSchema.parse({ cupomId: "gift", valorDesconto: 10, validacaoModo: "AUTOMATICA", brinde: input.brinde });
	const state = mapSaleDraftToSaleState({ itens: [], rascunhoMetadados: { cupom: applied, descontoGeral: 0 } } as unknown as Parameters<
		typeof mapSaleDraftToSaleState
	>[0]);
	assert.ok(state.cupomResgate);
	assert.equal(state.cupomResgate.validacaoModo, undefined);
	const evaluation = resolveAppliedCouponEvaluation({ avaliacao: null, brindes: [] }, state.cupomResgate);
	assert.equal(evaluation?.elegivel, false);
	assert.equal(resolveAppliedCouponEvaluation(undefined, state.cupomResgate)?.elegivel, false);
});

test("ordinary coupon evaluations retain automatic and manual semantics", () => {
	const result = { elegivel: true as const, valorDesconto: 10, aplicacao: "VENDA_TOTAL" as const, descontosPorItem: [] };
	assert.equal(resolveAppliedCouponEvaluation({ avaliacao: result }, {}), result);
	assert.equal(resolveAppliedCouponEvaluation({ avaliacao: null }, {}), null);
});

test("gift line rounding keeps precise unit prices while leaving paid units and extras payable", () => {
	for (const quantidade of [1, 2, 3]) {
		for (const base of [10.004, 10.005, 10.006]) {
			for (const extras of [0, 2]) {
				const item = { ...drink, quantidade, valorUnitarioBase: base, valorVendaUnitario: base + extras };
				const result = evaluateCouponAgainstCart({ ...input, cartItems: [item] });
				assert.ok(result.elegivel);
				const gross = roundCouponGiftCurrency(quantidade * item.valorVendaUnitario);
				const payable = roundCouponGiftCurrency(quantidade * item.valorVendaUnitario - base);
				assert.equal(roundCouponGiftCurrency(gross - result.valorDesconto), payable);
				assert.ok(result.valorDesconto <= gross);
				assert.equal(result.brinde?.valorUnitarioBase, base);
			}
		}
	}
});

test("normalization changes only the selected gift line and recomputes its financial totals", () => {
	const line = { chave: drink.chave, quantidade: 1, valorUnitarioFinal: 10.005, valorTotalBruto: 10, valorTotalLiquido: 10, valorDesconto: 0 };
	const normalized = normalizeCouponGiftItem(line, input.brinde);
	assert.equal(normalized.valorTotalBruto, 10.01);
	assert.equal(normalized.valorTotalLiquido, 10.01);
	assert.equal(normalized.valorUnitarioFinal, 10.005);
	assert.equal(normalizeCouponGiftItem(line, null), line);
	assert.equal(normalizeCouponGiftItem({ ...line, chave: "other" }, input.brinde).valorTotalBruto, 10);
});

test("catalog gift filtering preserves whole-product targets and restricts variant targets", () => {
	const products = [
		{ id: "drink", grupo: "Drinks", variantes: [{ id: "small" }, { id: "large" }] },
		{ id: "sandwich", variantes: [] },
	];
	assert.equal(filterCouponGiftProducts(products, [target]).length, 1);
	assert.deepEqual(filterCouponGiftProducts(products, [{ ...target, produtoId: null, produtoVarianteId: "small" }])[0].variantes, [{ id: "small" }]);
});

test("applied gift choice survives schema parsing and JSON round trips", () => {
	const applied = { cupomId: "coupon", valorDesconto: 10, brinde: input.brinde };
	assert.deepEqual(AppliedCouponSchema.parse(JSON.parse(JSON.stringify(applied))), applied);
	assert.equal(AppliedCouponSchema.safeParse({ ...applied, brinde: { itemChave: drink.chave, quantidade: 2 } }).success, false);
});

test("draft snapshots preserve the chosen line identity and separate extras", () => {
	const snapshot = buildDraftItemSnapshot({
		chave: drink.chave,
		produtoId: "drink",
		nome: "Drink",
		codigo: "D",
		quantidade: 1,
		valorUnitarioBase: 10,
		valorModificadores: 2,
		valorUnitarioFinal: 12,
		valorTotalBruto: 12,
		valorDesconto: 0,
		valorTotalLiquido: 12,
		modificadores: [],
	});
	const persisted = { id: "database-generated-id", valorVendaUnitario: 12, metadados: JSON.parse(JSON.stringify(snapshot)) };
	assert.equal(readCouponItemIdentity(persisted), drink.chave);
	assert.equal(readCouponItemBasePrice(persisted), 10);
});

test("gift allocation remains on its item and is not duplicated as a fiscal header discount", () => {
	const itens = [
		{ valorBruto: 50, valorDesconto: 0 },
		{ valorBruto: 12, valorDesconto: 10 },
	];
	const header = resolveFiscalHeaderDiscount({ itens, valorTotal: 52, acrescimosTotal: 0, descontosTotal: 10 });
	assert.equal(header, 0);
	assert.deepEqual(allocateFiscalHeaderDiscount({ valorDesconto: header, itens }), [0, 0]);
	assert.equal(resolveFiscalHeaderDiscount({ itens, valorTotal: 47, acrescimosTotal: 0, descontosTotal: 15 }), 5);
});
