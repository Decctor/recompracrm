# Pricing go-live: handoff for local setup

Run this before merging PR #151 (activation by segment + base plans and add-ons). Merging deploys
Production, and the new code depends on steps 1–4.

State checked on 22/11/2026 (Vercel project `recompracrm`, team `syncroniza`; names only, no values
read):

| What | State |
| --- | --- |
| Migration `0157_subscription_addons.sql` | **Not applied** in production |
| CRM + ERP and Hub prices in Stripe | **Not created** (no env var points to them) |
| `NEXT_PUBLIC_STRIPE_CRM_ERP_*` / `NEXT_PUBLIC_STRIPE_HUB_ATENDIMENTOS_*` | **Missing** in every environment |
| `NEXT_PUBLIC_STRIPE_CRESCIMENTO_*` (reused by the CRM plan) | Set everywhere |
| `NEXT_PUBLIC_STRIPE_CONSULTORIA_MONTHLY_PRICE_ID` | Production and Preview; missing in Development |
| `STRIPE_SALES_ACCOUNT`, `STRIPE_RECOMPRACRM_SECRET_KEY`, `STRIPE_RECOMPRACRM_WEBHOOK_SIGNATURE_SECRET` | Production only (expected) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SIGNATURE_SECRET` (Syncroniza) | Set everywhere |
| `STRIPE_BOLETO_ENABLED` | Set in Preview and Production (value not read) |
| `STRIPE_PIX_ENABLED` | Not set |

Production sells through the **RecompraCRM** Stripe account. Preview and Development stay on
**Syncroniza**. A price exists in one account only, so every price ID in an environment must
belong to that environment's sales account.

Keep secrets out of the repo. `.env*` is gitignored; don't paste keys into files you commit.

---

## 0. Prerequisites

- Checkout of the PR branch, with dependencies installed:
  ```bash
  git fetch origin claude/cool-lovelace-8ncxdp && git checkout claude/cool-lovelace-8ncxdp
  ```
  ```bash
  npm install
  ```
- Vercel CLI, logged in and linked to the project:
  ```bash
  vercel link --scope syncroniza --project recompracrm
  ```
- Stripe CLI. The steps below pass `--api-key` on each call, so it doesn't matter which account
  `stripe login` points at. Keep the two live secret keys at hand (Stripe dashboard → Developers →
  API keys):
  - RecompraCRM (CNPJ account): `sk_live_…` (call it `$RCRM_KEY` below)
  - Syncroniza (MEI account): `sk_live_…` for the account, or `sk_test_…` if Preview uses test mode
    (call it `$SYNC_KEY` below)

  In each new terminal:
  ```bash
  read -rs RCRM_KEY && export RCRM_KEY
  ```
  ```bash
  read -rs SYNC_KEY && export SYNC_KEY
  ```

---

## 1. Apply the database migration (production)

The new code selects the new columns. Deploying without them breaks organization queries. The
migration only adds columns with defaults, and it is safe to run again (`IF NOT EXISTS`, 5 s lock
timeout).

`scripts/apply-sql-migration.ts` connects through `SUPABASE_DB_URL`. Point it at the production
database for this one command:
```bash
SUPABASE_DB_URL='<production connection string>' npx tsx ./scripts/apply-sql-migration.ts drizzle/0157_subscription_addons.sql
```

Check it worked (expects 4 rows):
```sql
select table_name, column_name from information_schema.columns
where (table_name, column_name) in (
  ('ampmais_organizations','assinatura_adicionais'),
  ('ampmais_deals','adicionais'),
  ('ampmais_platform_partner_commissions','valor_adicionais_centavos'),
  ('ampmais_platform_partner_commissions','percentual_comissao_adicionais_bps'));
```

The current production code ignores the new columns, so you can do this any time before the merge.

---

## 2. Create the new prices in Stripe

`scripts/create-subscription-prices.ts` creates the CRM + ERP and Hub de Atendimentos products and
their monthly and yearly prices. The amounts come from `config/index.ts`. It finds existing prices
by `lookup_key`, so running it again only reports them. Without `--apply` it just shows what it
would create. It prints the four env lines at the end.

### Production (RecompraCRM account)

```bash
STRIPE_RECOMPRACRM_SECRET_KEY="$RCRM_KEY" npx tsx ./scripts/create-subscription-prices.ts --account RECOMPRACRM
```
```bash
STRIPE_RECOMPRACRM_SECRET_KEY="$RCRM_KEY" npx tsx ./scripts/create-subscription-prices.ts --account RECOMPRACRM --apply
```

Expected: products `recompracrm_crm_erp` and `recompracrm_hub_atendimentos`, and four prices:

| Lookup key | Amount |
| --- | --- |
| `recompracrm_crm_erp_mensal` | R$ 599,90 / month |
| `recompracrm_crm_erp_anual` | R$ 5.759,90 / year |
| `recompracrm_hub_atendimentos_mensal` | R$ 299,90 / month |
| `recompracrm_hub_atendimentos_anual` | R$ 2.879,90 / year |

If a line says "ATENÇÃO: valor ou intervalo diferente do config", stop: a price with that lookup key
already exists at another amount.

The product IDs must not start with `chats_`. That prefix belongs to the `recompracrm-chats` app,
which shares this account.

### Preview / Development (Syncroniza account), optional but recommended for testing

```bash
STRIPE_SECRET_KEY="$SYNC_KEY" npx tsx ./scripts/create-subscription-prices.ts --account SYNCRONIZA --apply
```

---

## 3. Check that the prices already in Vercel belong to the right account

The CRM plan reuses the Crescimento prices, and consulting keeps its price. Both are already set in
Vercel. In Production they must be **RecompraCRM** prices; a Syncroniza ID there fails at
checkout. The price script does not check them; it only handles its own four lookup keys.

Pull the Production values. Encrypted vars come with their values; sensitive ones come back empty.
```bash
vercel env pull .env.production.check.local --environment=production
```
```bash
grep -E 'NEXT_PUBLIC_STRIPE_(CRESCIMENTO|CONSULTORIA)' .env.production.check.local
```

Retrieve each ID from the RecompraCRM account. A 404 ("No such price") means it lives in the other
account:
```bash
stripe prices retrieve <price_id> --api-key "$RCRM_KEY"
```

Expected amounts:

| Variable | Amount |
| --- | --- |
| `NEXT_PUBLIC_STRIPE_CRESCIMENTO_MONTHLY_PLAN_PRICE_ID` | 39990 (R$ 399,90), month |
| `NEXT_PUBLIC_STRIPE_CRESCIMENTO_YEARLY_PLAN_PRICE_ID` | 383990 (R$ 3.839,90), year |
| `NEXT_PUBLIC_STRIPE_CONSULTORIA_MONTHLY_PRICE_ID` | 50000 (R$ 500,00), month |

The legacy Essencial and Escala vars are not sold anymore, so they don't matter here.

Delete the pulled file afterwards:
```bash
rm .env.production.check.local
```

If the Crescimento prices turn out to be Syncroniza prices, create a RecompraCRM price for CRM
(R$ 399,90 monthly, R$ 3.839,90 yearly). Set it as `NEXT_PUBLIC_STRIPE_CRM_MONTHLY_PLAN_PRICE_ID` /
`NEXT_PUBLIC_STRIPE_CRM_YEARLY_PLAN_PRICE_ID` in Production; the config prefers those over the
Crescimento vars. Don't repoint the Crescimento vars: legacy invoices are matched by them.

---

## 4. Set the four price IDs in Vercel

`NEXT_PUBLIC_*` values are inlined at build time, so they must exist before the deploy that
merging triggers. Use the IDs printed by step 2.

Production (RecompraCRM prices):
```bash
printf '%s' 'price_…' | vercel env add NEXT_PUBLIC_STRIPE_CRM_ERP_MONTHLY_PLAN_PRICE_ID production
```
```bash
printf '%s' 'price_…' | vercel env add NEXT_PUBLIC_STRIPE_CRM_ERP_YEARLY_PLAN_PRICE_ID production
```
```bash
printf '%s' 'price_…' | vercel env add NEXT_PUBLIC_STRIPE_HUB_ATENDIMENTOS_MONTHLY_PRICE_ID production
```
```bash
printf '%s' 'price_…' | vercel env add NEXT_PUBLIC_STRIPE_HUB_ATENDIMENTOS_YEARLY_PRICE_ID production
```

Preview and Development (Syncroniza prices, if you ran step 2 for Syncroniza): run the same four
commands with `preview` and then `development` in place of `production`. For `preview`, the CLI
may ask for a Git branch; leave it empty so it applies to every preview branch.

Optional, so consulting checkout works locally:
```bash
vercel env add NEXT_PUBLIC_STRIPE_CONSULTORIA_MONTHLY_PRICE_ID development
```

Confirm:
```bash
vercel env ls production | grep -E 'CRM_ERP|HUB_ATENDIMENTOS'
```

`STRIPE_SALES_ACCOUNT` is stored as sensitive, so its value can't be read back. It must be
`RECOMPRACRM` in Production. If in doubt, remove it and add it again with that value:
```bash
vercel env rm STRIPE_SALES_ACCOUNT production
```
```bash
printf '%s' 'RECOMPRACRM' | vercel env add STRIPE_SALES_ACCOUNT production --sensitive
```

---

## 5. Check the webhook endpoints in both accounts

Both accounts deliver to `https://<production domain>/api/integrations/stripe/webhook`. Access to
the plan and add-ons is written by `customer.subscription.created` / `updated` after payment.
Without them a store pays and nothing unlocks.

```bash
stripe webhook_endpoints list --api-key "$RCRM_KEY"
```
```bash
stripe webhook_endpoints list --api-key "$SYNC_KEY"
```

The endpoint's `enabled_events` must include every event the handler accepts:

```
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
```

To add missing events, pass the **full** list (it replaces the current one):
```bash
stripe webhook_endpoints update we_… --api-key "$RCRM_KEY" \
  -d "enabled_events[]=customer.subscription.created" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted" \
  -d "enabled_events[]=invoice.paid" \
  -d "enabled_events[]=invoice.payment_succeeded" \
  -d "enabled_events[]=invoice.payment_failed" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=checkout.session.async_payment_succeeded" \
  -d "enabled_events[]=checkout.session.async_payment_failed"
```

The RecompraCRM account also serves `recompracrm-chats`. Only touch the endpoint whose URL is this
app's `/api/integrations/stripe/webhook`.

---

## 6. Merge and deploy

With steps 1–5 done, merge PR #151. The merge deploys Production; confirm it built:
```bash
vercel ls recompracrm --scope syncroniza --environment production | head -5
```

---

## 7. Test one full cycle

Do this on Preview against Syncroniza first if you created those prices, then once in Production
with a real card (refund afterwards). Use an organization you own.

| # | Action | Expected |
| --- | --- | --- |
| 1 | Checkout of **CRM** monthly | After payment: `assinaturaPlano = CRM`, `assinaturaAdicionais = []`, sidebar shows "PLANO CRM" |
| 2 | Add **Hub de Atendimentos** from the subscription menu (sidebar badge → menu) | Prorated charge now; within seconds `assinaturaAdicionais = ["HUB_ATENDIMENTOS"]` and the inbox works |
| 3 | Remove the Hub | Item gone from the Stripe subscription, credit on the next invoice, `assinaturaAdicionais = []` |
| 4 | New org: checkout of **CRM + ERP + Hub + Consultoria**, monthly | One subscription with four items, `metadata.pricingModel = MODULAR`; ERP, Hub and consulting unlocked |
| 5 | After each paid invoice of a referred org | One row in `ampmais_platform_partner_commissions`, with `valor_adicionais_centavos` filled when the Hub is on the invoice |

Read-only checks:
```sql
select assinatura_plano, assinatura_adicionais, stripe_conta, stripe_subscription_status
from ampmais_organizations where id = '<org id>';
```
```bash
stripe subscriptions list --customer cus_… --api-key "$RCRM_KEY"
```

**Boleto.** `STRIPE_BOLETO_ENABLED` is set in Production. Card add-on purchases are covered. Stripe
doesn't document how an add-on purchase (`payment_behavior: error_if_incomplete`) behaves for a
customer paying by boleto. Before a boleto-paying store adds the Hub, repeat step 2 with a boleto
customer on Preview. `STRIPE_PIX_ENABLED` is not set, so PIX is not a concern.

---

## 8. After go-live

- **Control.** The `plano` custom field now receives `CRM` / `CRM_ERP`. Check that no Control
  workflow filters on `CRESCIMENTO` or `ESCALA`.
- **ERP-only.** There is no ERP-only plan, on purpose: ERP stores are offered `CRM + ERP`, with the
  reason shown at checkout.
- **Reference.** Background and defaults: `docs/dev-planning/pricing-model-redesign-plan.md`.
  Activation mapping: `docs/onboarding/activation-by-segment.md` §10.
