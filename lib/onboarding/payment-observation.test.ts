import assert from "node:assert/strict";
import test from "node:test";
import { shouldReconcileAfterPaymentObservation } from "./payment-observation";

const MINUTE = 60 * 1000;

test("reconciles when the payment status changes, even inside the window", () => {
	assert.equal(shouldReconcileAfterPaymentObservation({ previousStatus: "VERIFICADO", payment: "PENDENTE", lastReconcileAt: 0, now: MINUTE }), true);
	assert.equal(shouldReconcileAfterPaymentObservation({ previousStatus: undefined, payment: "VERIFICADO", lastReconcileAt: 0, now: MINUTE }), true);
});

test("reconciles an unchanged status the first time this instance sees the organization", () => {
	assert.equal(shouldReconcileAfterPaymentObservation({ previousStatus: "VERIFICADO", payment: "VERIFICADO", lastReconcileAt: undefined, now: 0 }), true);
});

test("skips an unchanged status inside the window and reconciles once it elapses", () => {
	assert.equal(shouldReconcileAfterPaymentObservation({ previousStatus: "VERIFICADO", payment: "VERIFICADO", lastReconcileAt: 0, now: 9 * MINUTE }), false);
	assert.equal(shouldReconcileAfterPaymentObservation({ previousStatus: "VERIFICADO", payment: "VERIFICADO", lastReconcileAt: 0, now: 10 * MINUTE }), true);
});
