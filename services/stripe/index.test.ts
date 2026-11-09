import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";

// As credenciais são lidas no import do módulo: definir antes de importá-lo.
const SYNCRONIZA_WEBHOOK_SECRET = "whsec_syncroniza_test";
const RECOMPRACRM_WEBHOOK_SECRET = "whsec_recompracrm_test";
process.env.STRIPE_SECRET_KEY = "sk_test_syncroniza";
process.env.STRIPE_WEBHOOK_SIGNATURE_SECRET = SYNCRONIZA_WEBHOOK_SECRET;
process.env.STRIPE_RECOMPRACRM_SECRET_KEY = "sk_test_recompracrm";
process.env.STRIPE_RECOMPRACRM_WEBHOOK_SIGNATURE_SECRET = RECOMPRACRM_WEBHOOK_SECRET;

// Import dinâmico (sem top-level await, que o transform CJS do tsx não aceita).
const loadModule = () => import("./index");

const body = JSON.stringify({ id: "evt_test", object: "event", type: "invoice.paid", data: { object: {} } });

function sign(secret: string) {
	return Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
}

test("identifica a conta pelo segredo que valida a assinatura", async () => {
	const { constructStripeWebhookEvent } = await loadModule();
	assert.equal(constructStripeWebhookEvent({ body, signature: sign(SYNCRONIZA_WEBHOOK_SECRET) })?.account, "SYNCRONIZA");
	assert.equal(constructStripeWebhookEvent({ body, signature: sign(RECOMPRACRM_WEBHOOK_SECRET) })?.account, "RECOMPRACRM");
});

test("recusa assinatura que nenhum segredo valida", async () => {
	const { constructStripeWebhookEvent } = await loadModule();
	assert.equal(constructStripeWebhookEvent({ body, signature: sign("whsec_outra_conta") }), null);
});

test("conta de vendas é a SYNCRONIZA até a virada ser configurada", async () => {
	const { getStripeSalesAccount } = await loadModule();
	const previous = process.env.STRIPE_SALES_ACCOUNT;
	try {
		delete process.env.STRIPE_SALES_ACCOUNT;
		assert.equal(getStripeSalesAccount(), "SYNCRONIZA");
		process.env.STRIPE_SALES_ACCOUNT = "valor-invalido";
		assert.equal(getStripeSalesAccount(), "SYNCRONIZA");
		process.env.STRIPE_SALES_ACCOUNT = "RECOMPRACRM";
		assert.equal(getStripeSalesAccount(), "RECOMPRACRM");
	} finally {
		if (previous === undefined) delete process.env.STRIPE_SALES_ACCOUNT;
		else process.env.STRIPE_SALES_ACCOUNT = previous;
	}
});

test("customer sem conta gravada é da SYNCRONIZA, nunca da conta de vendas", async () => {
	const { resolveStripeAccount } = await loadModule();
	const previous = process.env.STRIPE_SALES_ACCOUNT;
	try {
		process.env.STRIPE_SALES_ACCOUNT = "RECOMPRACRM";
		assert.equal(resolveStripeAccount(null), "SYNCRONIZA");
		assert.equal(resolveStripeAccount("RECOMPRACRM"), "RECOMPRACRM");
	} finally {
		if (previous === undefined) delete process.env.STRIPE_SALES_ACCOUNT;
		else process.env.STRIPE_SALES_ACCOUNT = previous;
	}
});
