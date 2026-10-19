import assert from "node:assert/strict";
import test from "node:test";
import { DEVICE_DISCOUNT_AUTHORITY } from "@/lib/permissions/discounts";
import { PaymentTerminalError } from "./errors";
import {
	getTerminalDiscountCeiling,
	resolveTerminalDiscount,
	terminalDiscountNeedsApproval,
	toTerminalDiscountLimit,
} from "./terminal-discount-policy";

const tenPercent = { aplicar: true, limiteTipo: "PERCENTUAL" as const, limiteValor: 10, aprovar: false };

test("the app reads the ceiling as null (free), zero (device) or the seller rule", () => {
	assert.deepEqual(toTerminalDiscountLimit(DEVICE_DISCOUNT_AUTHORITY), { tipo: "FIXO", valor: 0 });
	assert.equal(toTerminalDiscountLimit({ aplicar: true, limiteTipo: null, limiteValor: null, aprovar: true }), null);
	assert.deepEqual(toTerminalDiscountLimit(tenPercent), { tipo: "PERCENTUAL", valor: 10 });
});

test("approval is needed above the seller ceiling and for any discount without one", () => {
	assert.equal(terminalDiscountNeedsApproval({ authority: tenPercent, valorBase: 80, descontoTotal: 8 }), false);
	assert.equal(terminalDiscountNeedsApproval({ authority: tenPercent, valorBase: 80, descontoTotal: 8.02 }), true);
	assert.equal(terminalDiscountNeedsApproval({ authority: DEVICE_DISCOUNT_AUTHORITY, valorBase: 80, descontoTotal: 0.5 }), true);
	assert.equal(terminalDiscountNeedsApproval({ authority: DEVICE_DISCOUNT_AUTHORITY, valorBase: 80, descontoTotal: 0 }), false);
	assert.equal(getTerminalDiscountCeiling({ authority: tenPercent, valorBase: 33.33 }), 3.33);
});

test("the discount is never negative nor above the items", () => {
	assert.equal(resolveTerminalDiscount({ descontosTotal: 5.555, itemsTotal: 20 }), 5.56);
	assert.equal(resolveTerminalDiscount({ descontosTotal: null, itemsTotal: 20 }), 0);
	assert.throws(
		() => resolveTerminalDiscount({ descontosTotal: 20.5, itemsTotal: 20 }),
		(error: unknown) => error instanceof PaymentTerminalError && error.status === 422,
	);
	assert.throws(() => resolveTerminalDiscount({ descontosTotal: -1, itemsTotal: 20 }), PaymentTerminalError);
});
