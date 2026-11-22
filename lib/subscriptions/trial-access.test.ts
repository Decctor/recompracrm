import assert from "node:assert/strict";
import { test } from "node:test";
import { isTrialSubscriptionAccess, resolveSubscriptionAccess } from "@/config";

/**
 * Teste e pagamento, como o selo da barra lateral os separa. Quem testa tem `assinaturaPlano`
 * gravado (o plano do teste), então a regra só pode vir da origem do acesso.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

const base = {
	stripeStatus: null,
	stripeStatusChangedAt: null,
	trialStart: daysFromNow(-5),
	trialEnd: daysFromNow(10),
	paidPeriodEnd: null,
	provisionalAccessEnd: null,
};

test("teste em curso, sem assinatura: em teste", () => {
	const access = resolveSubscriptionAccess(base);
	assert.equal(access.active, true);
	assert.equal(isTrialSubscriptionAccess(access), true);
});

test("carência depois do teste: ainda em teste, não pagando", () => {
	const access = resolveSubscriptionAccess({ ...base, trialStart: daysFromNow(-20), trialEnd: daysFromNow(-2) });
	assert.equal(access.reason, "TRIAL_GRACE");
	assert.equal(isTrialSubscriptionAccess(access), true);
});

test("assinatura ativa no Stripe, mesmo com teste ainda vigente: pagando", () => {
	const access = resolveSubscriptionAccess({ ...base, stripeStatus: "active" });
	assert.equal(access.reason, "PAGO");
	assert.equal(isTrialSubscriptionAccess(access), false);
});

test("período pago confirmado por invoice: pagando", () => {
	const access = resolveSubscriptionAccess({ ...base, trialEnd: daysFromNow(-60), trialStart: daysFromNow(-75), paidPeriodEnd: daysFromNow(20) });
	assert.equal(isTrialSubscriptionAccess(access), false);
	assert.equal(access.active, true);
});

test("past_due na carência de cobrança: é assinante com pagamento pendente, não teste", () => {
	const access = resolveSubscriptionAccess({ ...base, stripeStatus: "past_due", stripeStatusChangedAt: daysFromNow(-3) });
	assert.equal(access.reason, "GRACE_PAST_DUE");
	assert.equal(isTrialSubscriptionAccess(access), false);
});

test("teste e carência acabados, sem assinatura: bloqueado, nem teste nem pagando", () => {
	const access = resolveSubscriptionAccess({ ...base, trialStart: daysFromNow(-60), trialEnd: daysFromNow(-45) });
	assert.equal(access.active, false);
	assert.equal(isTrialSubscriptionAccess(access), false);
});
