# Pricing model redesign — base plans + add-ons

> Status: **planned, nothing implemented** · Last updated: 2026-11-22 · Branch: `claude/pricing-model-redesign-e2bj6j`

The platform stops selling tiers and sells **two base plans and two add-ons**, all flat, with no
usage limits. Today's commercial reality is already close to this: only one of the three legacy
tiers is sold, the consulting add-on exists, and the limits written in the tiers are not enforced.
What is new is a public price for the ERP, a public price for the Hub de Atendimentos, and an
entitlement model that composes access from what the subscription contains instead of copying a
tier's capability block.

## 1. Decisions

| Item | Monthly | Yearly (20% off, same rule as today) | Kind |
| --- | --- | --- | --- |
| CRM | R$ 399,90 | R$ 3.839,90 | Base plan |
| CRM + ERP | R$ 599,90 ("for now") | R$ 5.759,90 | Base plan |
| Hub de Atendimentos + AI agent | + R$ 299,90 | + R$ 2.879,90 | Add-on |
| Consultoria (Gestor de Crescimento) | + R$ 500,00 ("for now") | monthly only | Add-on (service) |

- **No tiered access.** No maximum of campaigns, attendants, integrations, interactions or
  customers. The only scaling axis is the **organization (one store)**; multi-store deals keep
  using `deals.quantidadeLicencas`.
- **Existing subscribers keep their current plan and price.** The three legacy plan keys
  (`ESSENCIAL`, `CRESCIMENTO`, `ESCALA`) stay in the config for them and are never sold again.
- **"Hub de Atendimentos" means this app's own module** — the `hubAtendimentos` and
  `iaAtendimento` capabilities and `/dashboard/conversations`. It is **not** the separate
  `recompracrm-chats` app, which shares the `RECOMPRACRM` Stripe account (`chats_*` products) and
  is out of scope. The new Stripe product must not use the `chats_` prefix.
- **The Hub is added with an in-app button**, not through the Stripe billing portal. The portal's
  default configuration is shared with `recompracrm-chats` and stays as it is (payment method and
  cancellation only).
- **Partner commissions:** full current rule on the base plan, flat 20% on the Hub, nothing on
  consulting (section 6). *Recommended; not yet explicitly confirmed.*

Useful coincidences of these numbers:

- The largest monthly combination is 599,90 + 299,90 + 500,00 = **R$ 1.399,80**, just under the
  current PIX Automático mandate ceiling of R$ 1.399,90 (`PIX_MANDATE_MAX_AMOUNT_CENTS`). The
  ceiling does not need to move, but it must stop being derived from `ESCALA` (section 5.2).
- All software together is **R$ 899,80**, effectively the legacy `ESCALA` price (R$ 899,90), so
  grandfathered `ESCALA` organizations sit at parity with the new table.

## 2. Where the code is today

Platform snapshot on 2026-11-10: 25 organizations, 6 with an active Stripe subscription;
11 `CRESCIMENTO`, 7 `ESCALA`, 1 `ESSENCIAL`, 6 with no plan. The migration surface is small.

| Fact | Where |
| --- | --- |
| Three tiers defined; only `CRESCIMENTO` is sold (`DEAL_PLAN_KEY`) | `config/index.ts` |
| Consulting is a second line item at R$ 500, monthly only | `CONSULTORIA_ADDON` in `config/index.ts`, `generate-checkout/route.ts` |
| A plan key copies a whole capability block into `configuracao.recursos` | `generate-checkout/route.ts`, `app/api/organizations/route.ts`, `lib/deals/index.ts`, `lib/onboarding/erp-trial.ts` |
| Capabilities are written when the checkout is **generated**, before payment | `generate-checkout/route.ts` (the `organizations` update after customer creation) |
| The webhook syncs subscription **status** only; it never touches capabilities | `processEvent` in `app/api/integrations/stripe/webhook/route.ts` |
| `campanhas.limiteAtivas`, `hubAtendimentos.limiteAtendentes` and `integracoes.limiteAtivas` are read only by the admin modal and the Zod schema — **not enforced** | `components/Modals/Organizations/Blocks/Resources.tsx`, `schemas/organizations.ts` |
| The only enforced limit is the AI spend ceiling, a monthly cap in estimated USD | `iaAtendimento.limiteCreditos`, `lib/ai/agent/spend.ts` |
| The in-app picker still advertises "Até 10 campanhas e jornadas ativas"; the `/pricing` FAQ says there is no charge per campaign | `AppSubscriptionPlans.CRESCIMENTO.pricingTableFeatures` vs `pricing-content.ts` |
| ERP is "Proposta sob medida" and the inbox is "Sob consulta" on the public page | `PRICING_ADDONS` in `app/(brand-marketing)/pricing/_components/pricing-content.ts` |
| ERP trial works by setting the plan to `ESCALA` | `lib/onboarding/erp-trial.ts`, `FREE-TRIAL-ERP` in `app/api/organizations/route.ts` |
| Deals store a tier key and always write `DEAL_PLAN_KEY` | `deals.planoBase`, `app/api/admin/deals/route.ts`, `lib/deals/` |
| `getOrganizationAccessToRoute` and the per-plan `routes` maps have no callers outside the config | `config/index.ts` |

One behaviour to be aware of: `CRESCIMENTO` has `iaAtendimento.acesso: true` with
`hubAtendimentos.acesso: false`. `iaAtendimento` gates the AI agents, the chat assist and the AI
answering in the WhatsApp webhooks, so base-plan organizations can have the AI agent today
without the inbox. In the new model the AI agent belongs to the Hub add-on (open question 1).

## 3. Market research (collected 10–11 Nov 2026)

Public pricing pages read through Monid (page fetches and Google searches), under US$ 0,10 in
total. November pages carry Black Friday promotions; list prices are used where the page showed
both. Figures marked *claim* come from a third party, not from the vendor's own page.

### 3.1 Retail CRM / loyalty — supports CRM at R$ 399,90

| Vendor | Price | Gated on |
| --- | --- | --- |
| Fidelimax (standalone) | R$ 179 / 249 / 749 | Customers: 10k / 50k / 350k |
| Fidelimax Combos | R$ 279 / 399 / 697, plus installation R$ 1.380 / 1.890 / 2.290 | Customers; R$ 59 per extra store |
| ChatMax (Fidelimax WhatsApp) | R$ 99 / 179 / 349, plus implementation R$ 997–1.399 | Attendants and contacts; bulk sends only on the top tier |
| Smartbis | R$ 147,90 / 297,90 / 597,90 | Features |
| Clientela Digital | R$ 47,90 | Nothing (no WhatsApp yet) |
| Repediu (restaurants, annual) | R$ 187,94 / 296,65 | Contacts, campaigns, segmentations |
| Zoppy | R$ 397 + R$ 39 chip (*claim*) | Message credits |

- R$ 399,90 matches the closest like-for-like offers (Fidelimax Combo Pro R$ 399; Zoppy R$ 397).
- Cheaper entries exist, but without bulk WhatsApp campaigns, RFM or sales BI at that tier.
- Tiering by customer or contact count is the norm, so flat pricing gains value as the store grows.
- Onboarding is charged as a one-off of roughly R$ 1.000–2.300; "sem taxa de setup" stands out.
- Nobody includes Meta's marketing-message fee; it is passed through or marked up.

### 3.2 ERP / PDV — supports CRM + ERP between R$ 599,90 and R$ 699,90

| Vendor | Price | Gated on |
| --- | --- | --- |
| Bling | R$ 60 / from 120 / 650 / from 1.250 | Imported orders, users |
| Olist Tiny | R$ 66 / 177 / 390 / 948 (list) | Listings, storage |
| GestãoClick (annual) | R$ 119 / 199 / 289 / 379 | Users 1/3/5/7, stores 1/1/2/3 |
| vhsys | R$ 169 / 329 / 359 | Users; PDV and stock only on the top tier |
| eGestor (annual) | R$ 309,90 / 349,90 / 399,90 | Users; PDV add-on R$ 59,90 |
| Conta Azul | R$ 179,90 / 349,90 / 439,90 / 799,90 | Annual revenue and users |
| Omie | from R$ 339 (ERP) / from R$ 468 (Multivarejo) | Monthly revenue |
| Linx Empório | R$ 349 / 529 / 779 per store | Stores, PDV count |
| Consumer (restaurants, annual) | R$ 59,90 / 179,90 / 269,90 | Computers, modules |
| Saipos (restaurants) | from R$ 240,79 | Not public |
| Anota AI (restaurants) | R$ 99,99 / 199,99 / 299,99 | Orders per month |

- Mainstream single-store ERP runs about R$ 265–470 a month; entry offers R$ 60–200; restaurant
  PDV about R$ 100–300.
- The ERP step at R$ 599,90 is **R$ 200**, below the mainstream standalone range. R$ 699,90 (a
  R$ 300 step) was the original recommendation and remains defensible; R$ 599,90 was chosen as
  the opening price.
- Tiering is nearly universal, and PDV or NFC-e are often held back or sold as extras. A single
  price with PDV, fiscal, stock, finance, menu and tables included is unusual.
- Per store is the market's own unit (Linx, GestãoClick).

### 3.3 WhatsApp inbox with AI — supports the Hub at R$ 299,90

| Vendor | 3 attendants, 1 number | 8 attendants |
| --- | --- | --- |
| Umbler Talk Essencial | R$ 299,70 (annual) / 374,64 (monthly) | R$ 799,20 / 999,04 |
| Poli Digital | R$ 369,90 + R$ 1.197,90 setup | R$ 969,80 |
| Huggy Intermediário | R$ 818,80 | R$ 1.418,30 |
| JivoChat + WhatsApp + AI agent (annual) | R$ 707 | R$ 1.022 |
| Zenvia Specialist | R$ 640–700 | R$ 640–700 |
| Suri Essential | R$ 530 + setup (1.000 interactions) | same |
| Octadesk | R$ 1.399 + onboarding (by daily active users) | same |
| ConverZAP | R$ 197 | R$ 497 |
| chatPro | R$ 199 + AI wallet | R$ 399 + AI wallet |

(Totals are arithmetic from the unit prices on each pricing page.)

- At 3 attendants R$ 299,90 matches the closest competitor; at 8 it is the lowest price seen.
- Per-seat pricing is the norm. No public offer has unlimited attendants **and** AI under R$ 500.
- Every vendor meters AI somehow: credits, conversations, prepaid wallet, or a fixed add-on.
- Setup fees of R$ 649–2.999 are common in this category.

### 3.4 Managed service — context for consulting at R$ 500

- Agency packages for small businesses: about R$ 1.500–3.000 a month; junior freelancers
  R$ 500–2.000 (traffic-management price tables, the nearest commoditized comparison).
- Direct comparables: Revii "CS R$ 500" and Zoppy formerly R$ 1.000 to operate the CRM (both
  *claims*). No vendor publishes a price for a managed CRM service.
- R$ 500 is below the agency floor. It was kept as an acquisition lever; R$ 990 with a
  three-month minimum was the alternative considered.

## 4. Target model

### 4.1 Entitlements = base plan + add-ons

Capabilities stop being a property of a tier and become a function of what the subscription
contains. In `config/index.ts`:

```typescript
export type TSubscriptionBasePlanKey = "CRM" | "CRM_ERP";
export type TSubscriptionAddonKey = "HUB_ATENDIMENTOS" | "CONSULTORIA";

export function resolveSubscriptionEntitlements({ basePlan, addons }: {
	basePlan: TSubscriptionBasePlanKey;
	addons: TSubscriptionAddonKey[];
}): TOrganizationConfiguration["recursos"]
```

| Capability | `CRM` | `CRM_ERP` | + `HUB_ATENDIMENTOS` |
| --- | --- | --- | --- |
| `analytics`, `campanhas`, `programasCashback`, `integracoes`, `relatoriosWhatsapp` | on | on | — |
| `erp` | off | on | — |
| `hubAtendimentos` | off | off | on |
| `iaAtendimento` | off | off | on |

- Every limit is `null` (`limiteAtivas`, `limiteAtendentes`). The limit fields stay in the schema
  because the admin modal and existing rows use them.
- `iaAtendimento.limiteCreditos` gets a **default internal ceiling** when the Hub is added (open
  question 2). It is a fair-use guard, never shown as a tier.
- `CONSULTORIA` grants no capability; it keeps setting `consultoriaAtiva` and `baselineInicio`.
- `preferencias.rastreamentoEstoque` keeps following `erp.acesso`, as today.
- `organizations.assinaturaPlano` (free text) stores the base plan key. The legacy keys remain
  valid values; `TAppSubscriptionPlanKey` and `AppSubscriptionPlans` stay for those rows and for
  `SubscriptionBadge`, which needs badge entries for the two new keys.
- Add a column mirroring the active add-ons (suggested: `assinaturaAdicionais`, a JSON array of
  add-on keys, next migration after `0150`) so the UI can render "what this organization pays
  for" without calling Stripe.

### 4.2 The subscription is the source of truth

A map from Stripe price ID to base plan or add-on key, built from the config, lets the webhook
turn a subscription's items into entitlements.

- `customer.subscription.created` and `customer.subscription.updated` read the items, resolve
  base plan + add-ons, and write `assinaturaPlano`, `assinaturaAdicionais`, `consultoriaAtiva`
  and the governed capability flags. `generate-checkout` stops writing capabilities.
- **Unknown price IDs leave the organization untouched.** A subscription with no item that maps
  to a new base plan is a legacy or grandfathered one; its `recursos` must not be recomputed.
- **Write only on change.** Compare the resolved plan and add-ons with what is stored and write
  only when they differ, so capabilities granted by hand in the admin modal are not wiped by an
  unrelated `subscription.updated` (a status change, a renewal).
- Deal customers are handled before this branch and are not affected (`findDealByStripeCustomerId`).
- All existing Stripe rules hold: the client comes from
  `getStripeClient(resolveStripeAccount(row.stripeConta))`, new customers are born in the sales
  account, and the price-ID map must stay correct per environment (the
  `NEXT_PUBLIC_STRIPE_*_PRICE_ID` variables are the sales account's prices).

## 5. Implementation phases

### Phase 1 — Entitlement model (no behaviour change)

- `config/index.ts`: base plans, add-ons, prices, `resolveSubscriptionEntitlements`, the
  price-ID map; `DEAL_PLAN_KEY` and the public pricing source move to the new keys.
- `schemas/enums.ts`: Zod enums for the two key sets. Migration for `assinaturaAdicionais`.
- Remove `getOrganizationAccessToRoute` and the per-plan `routes` maps if they are confirmed dead.
- Unit tests for the resolver (each base plan, each add-on combination, limits all `null`).

### Phase 2 — Stripe prices and environment

- Create in the sales account of each environment: CRM + ERP (monthly, yearly) and Hub de
  Atendimentos (monthly, yearly). CRM and consulting reuse the existing prices.
- New variables, following the current naming: `NEXT_PUBLIC_STRIPE_CRM_ERP_MONTHLY_PLAN_PRICE_ID`,
  `..._CRM_ERP_YEARLY_...`, `NEXT_PUBLIC_STRIPE_HUB_ATENDIMENTOS_MONTHLY_PRICE_ID`,
  `..._HUB_ATENDIMENTOS_YEARLY_...`. They are inlined at build, so they change in the same deploy.
- `PIX_MANDATE_MAX_AMOUNT_CENTS` is derived from the new maximum combination instead of
  `ESCALA + consultoria`, and must not fall below the value existing mandates were created with.

### Phase 3 — Checkout, webhook and the add-on button

- `generate-checkout/route.ts`: input becomes `{ basePlan, cycle, addons }`; line items are built
  from it; the capability write is removed. Consulting stays monthly-only.
- `webhook/route.ts`: entitlement sync as in section 4.2.
- New route under the owning resource, e.g. `app/api/organizations/subscription/addons/route.ts`:
  - **Add:** appends the Hub price to the existing subscription, in the account where it lives,
    with Stripe's default proration.
  - **Remove:** removes the item at period end; access ends with the paid period.
  - A yearly subscription can only take the yearly Hub price, because one subscription cannot mix
    intervals. For the same reason consulting cannot be added to a yearly subscription.
  - The route never writes capabilities; the webhook does.
- The button lives in Settings → Assinatura and wherever the Hub is locked
  (`PlanRestrictionComponent`), and is hidden for deal organizations and legacy plans that
  already include the Hub.

### Phase 4 — Partner commission

- `webhook/route.ts` already separates consulting lines by price ID. Add the Hub price IDs as a
  second set with a flat rate.
- `lib/platform-partnerships/constants.ts`: new rate constant, new
  `PLATFORM_PARTNER_COMMISSION_RULE_VERSION`, updated `PLATFORM_PARTNER_RULE_SNAPSHOT`.
- The commission row should record the Hub amount separately, as it does for consulting
  (`valorConsultoriaCentavos`).

### Phase 5 — Trial and onboarding

- `app/api/organizations/route.ts`: `FREE-TRIAL` resolves to `CRM`, `FREE-TRIAL-ERP` to `CRM_ERP`
  (open question 3 decides whether the trial also includes the Hub).
- `lib/onboarding/erp-trial.ts`: switches the ERP module on instead of assigning `ESCALA`.
- The subscription enum accepted by the onboarding route moves to the new shape.

### Phase 6 — Deals and admin

- `deals.planoBase` accepts the new base plan keys; a deal may also carry add-ons (suggested:
  a JSON column mirroring the organization one). `linkOrganizationToDeal` uses the resolver.
- `components/Modals/Organizations/Blocks/Resources.tsx` keeps manual overrides; the admin row
  shows base plan and add-ons.

### Phase 7 — Public and in-app surfaces

- `components/Subscription/PlanPicker.tsx`: two base plans, the two add-ons as toggles, monthly
  and yearly; "Até 10 campanhas e jornadas ativas" is removed.
- `app/_content/pricing.ts` and `app/(brand-marketing)/pricing/`: the four prices replace "Sob
  consulta" and "Proposta sob medida"; the comparison table and FAQ are rewritten; the `/erp`
  page gains its price.
- FAQ line on Meta's message fees, including service messages (open question 4).
- Product documentation and agent-facing descriptions that name the tiers
  (`lib/agent-tools/resources.ts`, `lib/agent-tools/tools/platform.ts`).

## 6. Partner commission rule

Current rule (`lib/platform-partnerships/constants.ts`): monthly pays 100% of invoice 1, 20% of
invoice 2, 100% of invoice 3 and 20% of every later invoice; yearly pays 27%. The base is the
gross SaaS plan excluding consulting.

| Invoice line | Commission |
| --- | --- |
| Base plan (CRM or CRM + ERP) | Current rule, unchanged |
| Hub de Atendimentos | Flat 20% from the first invoice, monthly or yearly |
| Consultoria | None, as today |

- The ERP earns the full bonus because it is sticky and is the module partners should bring.
- The Hub gets a flat rate because it can be added and dropped without churning and each
  conversation has an AI cost.
- On a full CRM + ERP + Hub sale the partner receives about R$ 1.500 over the first three
  invoices and about R$ 180 a month after. Under one rule for everything it would be about
  R$ 1.980 in the first three.

## 7. Migration and grandfathering

- No data migration of existing organizations. Their `assinaturaPlano`, `recursos` and Stripe
  prices stay as they are.
- A legacy organization moves to the new table only by cancelling and subscribing again, or by an
  explicit admin action; the webhook never converts one by itself (section 4.2).
- Legacy plan definitions can be deleted only when no organization and no deal references them.

## 8. Open questions

1. **AI agent in the base plan.** `CRESCIMENTO` grants `iaAtendimento` without the inbox. The
   new `CRM` plan turns it off, so new CRM-only customers get the AI agent only with the Hub.
   Confirm this is intended.
2. **AI fair-use ceiling.** Choose the default `limiteCreditos` (USD a month) for the Hub from
   real spend in `ai_agent_runs`, and decide what the customer sees when it is reached.
3. **Trial contents.** Does the 15-day trial include the Hub, or only the chosen base plan?
4. **Meta service-message fee.** Two vendors quote R$ 0,035 per service message after 1.000 free
   per number per month since 01/10/2026. Verify against Meta's own pricing before writing the FAQ.
5. **Consulting scope.** At R$ 500 the service needs a written scope (what is delivered each
   month, how many campaigns, response times) so the price holds as the base grows.
6. **Commission rule.** Confirm section 6.
7. **ERP price review.** R$ 599,90 and R$ 500 are both "for now"; decide when they are revisited
   and whether the price then applies only to new subscribers.

## 9. Out of scope

- The `recompracrm-chats` app, its `chats_*` products and its billing portal configuration.
- Moving any existing customer between Stripe accounts.
- Usage-based billing of any kind.
