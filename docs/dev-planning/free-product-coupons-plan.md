# Free-product coupons implementation plan

Date: 2026-10-24
Status: Implemented locally. Automated verification passed; authenticated browser smoke testing remains pending.

## Implementation record

- Added “Produto grátis” to the guided builder and coupon forms, with automatic validation and explicit gift targets. Existing coupons can configure gift products and conditions through a modal before saving the benefit change.
- PDV and digital-store checkouts offer explicit selection of one cart unit, plus allowed-product discovery through the existing variant/add-on builders. Adding a product to the cart does not automatically redeem the coupon; the final gift choice applies the server-evaluated benefit.
- Removing a gift coupon offers a choice between retaining the product at its normal price and removing one unit. Cart lines identify the selected gift and explain that extras remain payable.
- The request contract carries `brinde: { itemChave, quantidade: 1 }`. PDV item payloads carry optional `chave`; shop items retain `tempId`. Sale-item metadata preserves this as `itemChave`, including draft saves and hydration.
- Gift discounts are recomputed on confirmation and allocated to the selected sale item. Metadata `cupomBrindeDesconto` lets the edit mapper reconstruct the ordinary cart discount without counting the coupon twice. The redemption snapshot records the actual gift and its price.
- Confirmed-sale editing retains the original selected product and allocation, or requires explicit coupon removal. Normal stock handling and individual-grant cancellation remain in use. Redemption serializes coupon-limit checks under a row lock.
- Gift-only orders can complete with zero payable and no payment transaction. Paid extras and delivery continue through the normal totals.
- Sale-total-only point-of-interaction flows and payment terminals without gift selection explicitly reject or disable this coupon type. Existing coupon enums and JSON metadata suffice; no migration or dependency installation is required.

### Review fixes

- Gift pricing keeps original unit-price precision and reconciles the selected line's gross, discount, and net totals in cents. Multiple quantities and paid extras remain chargeable; gift-only sales cannot persist a negative net. Client totals, draft admission, shop orders, confirmation, and confirmed-sale editing share this calculation. A one-cent gift-discount change refreshes the preview or requires reapplication before confirmation/editing.
- Restored applied coupons do not persist validation mode. Checkout now uses the fresh coupon mode and explicitly invalidates a gift when its selected line disappears, clearing the stale benefit.
- Draft updates preserve each existing item's stored identity even when an optional key is omitted, null, or replaced in the request. Legacy items retain their persisted row ID as the fallback.
- Permanent regression tests cover restored selections, omitted keys, sub-cent unit prices, paid extras, multiple quantities, zero-payment confirmation, stale one-cent discounts, and persisted totals after confirmed-sale editing.
- Confirmation requires an explicit matching gift discount, including when the submitted amount is zero or absent. It verifies that stored discounts include the gift and cashback, then reconciles the stored sale total against normalized item nets, sale-level discounts, and charges. Mismatches abort the transaction and roll back stock, payments, accounting, cashback debits, and coupon usage. Integration cases also cover valid delivery fees, general discounts, discounts on other items, and cashback accumulation against the final payable total.

### Verification

- `npm run test:coupons`: 44 passing tests, including fifteen in-memory PostgreSQL integration cases exercising confirmation, stock, rollback, grants, limits, zero totals, draft saving, confirmed-sale editing, and cancellation.
- `npm run test:cashback-redemption`: 64 passing regression tests.
- `npm run test:payment-attempts`: 66 passing tests, including the unsupported-terminal gift policy.
- Draft snapshot tests: five passing tests.
- `npx tsc --noEmit --pretty false`: passed.
- Changed-file lint: no errors; remaining warnings concern existing empty-object fallbacks in object spreads.
- The local app compiled and redirected the protected coupon route to sign-in. Browser automation was retried through an alternate browser, which confirmed the sign-in screen. Merchant and checkout interactions still need an authenticated visual smoke test.
- Concurrent redemption across independent PostgreSQL connections and full fiscal document issuance were not exercised; the integration suite uses embedded PostgreSQL, and fiscal allocation is covered by calculation tests.

## Objective

Allow a coupon to grant one free unit of a specific product or one chosen product from an allowed set. Use the existing `BRINDE` benefit type and existing coupon infrastructure.

## Existing behavior and reusable foundations

- `BRINDE` already exists in the Zod and PostgreSQL enums, but `lib/coupons/creation.ts` and `lib/coupons/engine.ts` explicitly reject it. The guided builder omits it.
- Coupon targets already support products, variants, and product groups.
- `ELEGIVEL` targets specify which products must be in the cart to activate a coupon. Their minimum quantities are combined using `condicaoAlvosOperador` (`TODOS` or `QUALQUER`).
- `BENEFICIADO` targets specify the products receiving the benefit. Today they support item-scoped fixed/percentage discounts, fixed unit prices, and buy-X-take-Y promotions. Example: buy a sandwich (`ELEGIVEL`) and receive a discount on a drink (`BENEFICIADO`).
- The current engine falls back from `BENEFICIADO` targets to `ELEGIVEL` targets, then to the whole cart when neither exists. For ordinary fixed/percentage discounts with `VENDA_TOTAL`, the discount base remains the whole sale.
- The gift type must require explicit `BENEFICIADO` targets; it must never inherit the whole-cart fallback.
- The engine already returns per-item discounts. Confirmation, shop order creation, and confirmed-sale editing re-evaluate coupons on the server.
- Applied coupons currently carry a coupon ID and discount amount, but no explicit selected gift. Cart references differ between preview indexes and persisted sale-item IDs.
- Existing availability, individual grants, usage limits, expiration, redemption ledger, and cancellation behavior should be reused.

## First-version product rules

1. One whole unit is gifted per redemption, regardless of how many matching units are in the cart. Configurable gift quantities and fractional-unit gifts are out of scope.
2. A merchant configures one or more allowed products or variants. Existing group targets may represent a set, subject to normal channel availability.
3. A customer or cashier explicitly selects the gift. A sole available option may be preselected; variants and required options still need resolution.
4. The selected gift is a normal sale item with its base price fully discounted. Paid extras and delivery remain payable.
5. One redemption can designate a unit of an existing cart line or add a dedicated gift line. Prefer a dedicated one-unit line when needed to preserve modifiers, pricing, and a clear UI.
6. Minimum spend excludes the gifted unit's base value. Paid extras still contribute to spend. Minimum item count and `ELEGIVEL` product requirements also exclude the gifted unit, so it cannot satisfy its own purchase requirement.
7. Existing coupon combination policies continue to apply. Prevent overlapping discounts from exceeding the selected unit's chargeable value; do not silently replace the gift with another product.
8. Gift-only purchases are permitted when the coupon has no purchase conditions. A zero-total sale must complete without requiring a payment; delivery or extras may still leave an amount payable.
9. Use automatic validation for this structured gift type in v1. Reject `BRINDE` with `MANUAL` validation rather than accepting an arbitrary operator-entered discount.
10. Enable redemption only on checkout flows that supply a validated itemized cart. Sale-total-only point-of-interaction flows must explain that the gift requires an itemized checkout.

Example: R$ 50 in paid products plus a R$ 10 gift drink yields R$ 60 in merchandise, R$ 10 in coupon discount, and R$ 50 payable before other charges. The drink cannot make R$ 40 of purchases qualify for a R$ 50 minimum.

## Stage 1 — Data contract and shared validation

- Extend `schemas/coupons.ts`, the sale state schema, and relevant request/response types with optional selected-gift data using Portuguese field names, such as `brinde.itemChave` and `brinde.quantidade` (fixed to one). Finalize the exact shape after tracing draft serialization.
- Preserve backward compatibility for existing coupon types and saved drafts.
- Define a stable cart-line identity and explicit mapping to persisted sale-item IDs. Never depend on an array position surviving insertion, removal, sorting, or draft persistence.
- Carry selection through previews, draft saves/restores, order submission, confirmation, and sale edits. Product IDs alone cannot distinguish duplicate lines with different extras or prices.
- Extend the redemption snapshot with the actual product, variant, item reference, quantity, base unit price, and discount granted. Preserve this historical record if coupon targets later change.
- Prefer existing JSON metadata and snapshots. Confirm whether a database migration is necessary after identifying storage consumers; the existing benefit enum itself needs no extension.
- In `assertCouponCoherence`, require automatic validation, item-scoped application, and at least one active `BENEFICIADO` target. Ignore or normalize irrelevant monetary/buy-X-take-Y fields consistently.

## Stage 2 — Shared gift engine

Primary files: `lib/coupons/engine.ts`, `lib/coupons/creation.ts`, and `lib/coupons/client-cart-coupons.ts`.

- Resolve allowed gifts separately from activation conditions; eligible gifts should be discoverable even before the chosen product is in the cart.
- Distinguish available coupon, gift selection required, and applied coupon. Do not represent a missing selection as a redeemable zero-discount coupon.
- Validate that the selected line exists, contains at least one whole unit, matches an allowed target, and belongs to the correct organization/channel.
- Extend the engine inputs to distinguish base product price from paid extras. Current cart adapters expose a unit price that can include extras; simply discounting that value would incorrectly make extras free.
- Calculate one unit's full base-price discount from authoritative sale pricing and return its item-level allocation and selected-gift details.
- Evaluate purchase conditions against the cart with that one gifted unit excluded as specified above.
- Keep existing non-gift calculations and target fallback behavior unchanged.
- Return actionable Portuguese validation messages for missing selection, changed pricing, invalid targets, and removed items.

## Stage 3 — Merchant configuration

Primary areas: `app/dashboard/growth/coupons/_module/builder/`, `components/Modals/Coupons/`, `state-hooks/use-internal-coupon-state`, and `lib/coupons/coupon-registry-state.ts`.

- Add a “Produto grátis” benefit card and make `BRINDE` item-scoped.
- Show required allowed-gift targets separately from optional purchase conditions. Multiple gift targets mean alternatives; they do not grant one of each.
- Hide irrelevant discount amount, percentage, cap, and buy-X-take-Y fields.
- Clearly explain one unit per redemption, paid extras, and minimum-spend calculation.
- Update review, live preview, list labels, summaries, validation, and create/edit hydration.
- Cover campaign-created coupons, shared selectors, and AI tools that create or describe coupons so all creation paths obey the same rules.

## Stage 4 — Checkout integration

### PDV and digital store

- Selecting the coupon opens an allowed-gift picker. Resolve stock, channel visibility, variants, required modifiers, and availability using existing product rules.
- Add or designate the selected unit and display “Brinde”, its discount, and any payable extras.
- Carry selection through cart state, preview APIs, draft metadata, and order/confirmation payloads.
- Re-evaluate when quantities, prices, extras, delivery mode, or gift selection change. If invalidated, require a valid selection or coupon removal before completion.
- Removing the coupon removes its discount. For a line added specifically as a gift, offer remove-or-keep behavior; a previously purchased line remains in the cart at its regular applicable price.
- Ensure a coupon selection dialog canceled before application leaves no unintended gift item or discount behind.

### Other surfaces

- Audit payment-terminal itemized flows and their benefit-policy adapters before enabling gifts there. Enable only where selected-line identity and authoritative base pricing survive the entire request path.
- Continue rejecting automatic gift redemption on sale-total-only point-of-interaction flows, including direct API requests. Show an explanation rather than asking the operator to enter a gift value.

## Stage 5 — Confirmation, accounting, and lifecycle

Primary areas: `app/api/shop/[orgId]/orders/route.ts`, `app/api/pos/sales/`, `lib/sales/sale-processing/process-sale-confirmation.ts`, `process-confirmed-sale-edit.ts`, and `lib/coupons/redemption.ts`.

- Recompute the gift discount server-side using the selected persisted line and validated pricing. Treat the submitted discount as a preview, never authority.
- Apply and persist the gift discount exactly once. Trace existing header discounts and item allocations so gift discounts cannot be double-counted or spread across unrelated items.
- Preserve ordinary inventory, preparation, fulfillment, product-cost, and cancellation processing for the gifted unit.
- Preserve redemption idempotency, grant consumption, usage limits, and atomic sale/redemption writes under concurrency.
- Re-evaluate confirmed-sale edits. Removing or changing the gift must follow the existing explicit coupon-removal/revalidation flow; never silently grant a different item.
- Snapshot the actual gift for audit. Verify receipts, customer messages, reporting, and fiscal item allocations reflect its discount and payable extras correctly.
- Validate zero-total checkout against payment and fiscal constraints before exposing gift-only purchases. If a supported surface cannot complete that flow, resolve the limitation or keep that surface disabled for gifts.

## Verification and acceptance criteria

- [ ] A single-product coupon grants exactly one unit free.
- [ ] A set-based coupon grants only the selected product, including when multiple eligible products are present.
- [ ] Product-wide and variant-specific targets behave correctly; group targets follow current catalog membership and channel availability.
- [ ] Multiple identical lines with different extras do not confuse the selection; reordering and saving/restoring drafts preserve it.
- [ ] Additional quantities remain paid; paid extras and delivery are not discounted as gifts.
- [ ] Purchase conditions exclude the gifted unit; unrelated valid purchases satisfy them normally.
- [ ] Missing, unavailable, wrong-organization, out-of-stock, fractional-only, removed, and tampered selections are rejected.
- [ ] Stale prices or coupon changes require reevaluation without silently changing the chosen gift.
- [ ] Standalone zero-total gifts complete without payment where supported.
- [ ] Existing discounts, cashback/reward combination rules, and ordinary coupons retain their behavior.
- [ ] Confirmation retries and concurrent redemptions do not duplicate discounts, stock deductions, or grant consumption.
- [ ] Confirmed-sale edits and cancellation preserve correct totals, stock, and redemption ledger behavior.
- [ ] Receipts, reporting, and fiscal calculations allocate the gift discount correctly.
- [ ] Sale-total-only and unsupported terminal flows cannot bypass gift validation.

Add focused engine/coherence tests and integration coverage for selection persistence, server confirmation, editing, cancellation, and monetary allocation. Run relevant existing coupon, shop, payment, and sale checks plus the project's type checks using npm. Verify the merchant builder and checkout interactions visually when implementation begins.

## Delivery sequence

1. Finalize contracts and stable identity; implement engine and server-side rules with tests.
2. Add merchant configuration and all creation-path validation.
3. Integrate PDV and digital store selection, persistence, and confirmation.
4. Complete lifecycle, stock, financial/fiscal, zero-total, and regression verification.
5. Enable the benefit in the merchant-facing picker only when the supported redemption flows are complete. Reject unsupported surfaces explicitly.

## Deferred scope

Configurable gift quantities, multiple gifts per redemption, fractional-unit gifts, free extras, new stacking policies, automatic cheapest/most-expensive selection, and manual sale-total-only fulfillment are deferred.
