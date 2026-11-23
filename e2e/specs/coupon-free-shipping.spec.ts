import { test } from "playwright/test";

/**
 * Free-shipping coupon (benefit `FRETE_GRATIS`, PR #152, branch `feat/coupon-free-shipping`).
 *
 * SKIPPED: when this harness was written, PR #152 was not in `master` (no `FRETE_GRATIS` in
 * `services/drizzle/schema/enums.ts`, no `drizzle/0158_coupon_free_shipping.sql`). Nothing below
 * has been run. Once the feature is merged:
 *
 * 1. Rebase, run `npm run local:setup` (the schema comes from the Drizzle files, so the new enum
 *    value is there without applying any migration) and `npm run test:local-dev` (it fails if 0158
 *    brought a function or trigger that scripts/local/db-objects.sql must learn).
 * 2. Add a `FRETE_GRATIS` coupon to the `coupons` pack (scripts/local/seed/packs/coupons.ts) and
 *    its id/code to SEED_COUPONS.
 * 3. Replace each `test.fixme` with the real steps. The seed already has what they need: delivery
 *    is on with a fee of SEED_SHOP_DELIVERY.taxa and free delivery above
 *    SEED_SHOP_DELIVERY.gratisAcima; SEED_CLIENTS.maria and .joao have saved addresses.
 */
test.describe("free-shipping coupon", () => {
	test.fixme("is created in the coupon builder", async () => {
		// /dashboard/growth/coupons → NOVO CUPOM → benefit "Frete grátis" → save → listed with its code.
	});

	test.fixme("register: on a delivery sale the fee disappears and the total drops by the fee", async () => {
		// /dashboard/sales/new → add a product below the free-delivery threshold → link SEED_CLIENTS.maria
		// → ENTREGA → fee shown → apply the coupon → fee gone, total = items.
	});

	test.fixme("online store: applies on a delivery order", async () => {
		// /shop/loja-demo → cart below the threshold → delivery → coupon step → fee removed in the review.
	});

	test.fixme("is refused for pickup", async () => {
		// Same cart with RETIRADA: the coupon is not offered / is rejected with its reason.
	});

	test.fixme("is refused when the cart is already above the free-delivery threshold", async () => {
		// Cart above SEED_SHOP_DELIVERY.gratisAcima: there is no fee to waive.
	});

	test.fixme("editing the confirmed sale refuses switching away from delivery", async () => {
		// Confirm a delivery sale with the coupon → edit → change to PRESENCIAL/RETIRADA → refused.
	});
});
