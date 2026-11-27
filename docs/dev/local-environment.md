# Local development environment

Run the app against a throwaway PostgreSQL on your own machine: build the schema, load seed data,
log in without a password and run end-to-end specs. Nothing here can reach production — see
[Isolation](#isolation).

```bash
npm install
npm run local:setup        # .env.localdb + database + schema + seed packs + snapshot  (~10 s)
npm run local:dev          # the app on http://localhost:3100
npm run local:login        # session for the demo admin; prints a URL to open
npm run test:e2e           # Playwright specs (starts the app if it is not running)
npm run local:reset        # back to the seeded snapshot  (< 1 s)
```

## Requirements

- Node 20.12+ and npm (never pnpm/yarn/bun — see AGENTS.md).
- **PostgreSQL 16** on this machine with the `pg_trgm` and `unaccent` extensions available
  (the `postgresql-contrib` package on Linux; bundled with the Windows installer).
- A role that can create databases. The default is
  `postgres://postgres:postgres@127.0.0.1:5432/postgres`; anything else goes in
  `LOCAL_PG_ADMIN_URL` **for the first `local:setup`** (it is saved in `.env.localdb` afterwards):

  ```bash
  # bash
  LOCAL_PG_ADMIN_URL=postgres://postgres:mypassword@127.0.0.1:5432/postgres npm run local:setup
  # PowerShell
  $env:LOCAL_PG_ADMIN_URL = "postgres://postgres:mypassword@127.0.0.1:5432/postgres"; npm run local:setup
  ```

- For the specs: `npx playwright install chromium` once.

The tooling is Node/TypeScript only (run with `tsx`, talking to PostgreSQL through the `postgres`
package). It does not need `psql`, bash or Docker, so it behaves the same on Windows and Linux.

## Commands

| Command | What it does |
| --- | --- |
| `npm run local:setup` | Writes `.env.localdb`, drops and recreates the database, builds the schema, loads the seed packs, snapshots the result as a template. Safe to re-run; it always starts from scratch. |
| `npm run local:setup -- --packs=base,coupons` | Only some packs (`base` always loads). |
| `npm run local:setup -- --no-seed` | Schema only. |
| `npm run local:setup -- --env-only` | Only regenerate `.env.localdb` (after a new `process.env.X` appeared in the code). |
| `npm run local:setup -- --suffix=my-branch --port=3101` | A separate database (`recompracrm_my_branch_dev`) and port for this checkout. `--suffix=` goes back to the default. |
| `npm run local:dev` | Next.js with only the local environment, on the local port. |
| `npm run local:reset` | Drops the database and recreates it from the template. Sessions are data, so log in again. |
| `npm run local:login -- <user>` | Creates a session for a seeded user (`admin`, `operator`, `crmOwner`, `trialOwner`, or an e-mail), writes `.local-dev/auth/<user>.json` (Playwright `storageState`) and prints a dev-login URL. `--all` logs everyone in; `--next=/dashboard/sales/new` chooses where the URL lands. |
| `npm run test:e2e` | Restores the snapshot, logs every seeded user in, runs `e2e/specs`. Extra arguments go to Playwright: `npm run test:e2e -- pos.spec.ts --headed`. |
| `npm run test:local-dev` | Unit tests of the guards, plus the check that `scripts/local/db-objects.sql` knows every function/trigger/extension the migrations create. |

## Isolation

Four layers, each enough to stop a mistake on its own.

1. **A complete environment.** `.env.localdb` (git-ignored, generated) defines *every* variable the
   code reads, found by scanning for `process.env.X`, plus every key name present in a `.env*` file
   on the machine. Next.js and `dotenv/config` only fill variables the process does not define, so
   nothing is left to come from a real `.env`. Values are stubs; a key with a code fallback
   (`process.env.X ?? "literal"`) gets that literal, because an empty string is not nullish.
2. **Fail closed.** `local:dev` and every local script refuse to start when a key that the code
   reads, or that a real env file defines, is missing from `.env.localdb`. The real files' values
   are never loaded, printed or passed on — only their key names are read.
3. **One database guard.** `assertLocalDatabase()` (`lib/local-dev/guard.ts`) accepts only a
   loopback host and a database whose name ends in `_dev` or `_template`. Every script, the
   dev-login route and the app's boot in local mode go through it.
4. **No way out.** In local mode the server process may only open TCP connections to this machine
   (`lib/local-dev/network-guard.ts`, installed from `instrumentation.ts`). A stub key is never
   even sent to Stripe, Resend, Meta, the fiscal provider or an AI gateway.

Local mode is `LOCAL_DEV=1` outside production and outside Vercel (`isLocalDevMode()`). The
dev-login route answers 404 without it.

Do not point `drizzle-kit push` or `scripts/apply-sql-migration.ts` at anything using these files;
they read `.env`, not `.env.localdb`.

## Schema

The numbered files in `drizzle/` cannot be replayed (the journal stops at 0005; later files were
applied by hand), so the local schema is generated from `services/drizzle/schema/` with
`drizzle-kit/api` — the same call the PGlite integration tests use, on a real PostgreSQL so the
trigram and unaccent indexes exist too.

What Drizzle does not describe lives in `scripts/local/db-objects.sql`: the `pg_trgm` and `unaccent`
extensions, `unaccent_immutable`, and the three trigger functions with their triggers. Each one
names the migration it came from. **When a migration adds or changes a function, trigger, extension,
view or policy, copy the latest definition there** — `npm run test:local-dev` fails until you do.

Consequences worth knowing:

- A schema change is picked up by `npm run local:setup`; there is no migration to apply locally.
- Anything a migration does that is neither in the Drizzle schema nor in `db-objects.sql` (a
  hand-written index, a `CHECK`, row-level security, a data backfill) does not exist locally.

## Seed packs

Synthetic data only; nothing is copied from production. Packs are functions in
`scripts/local/seed/packs/`, registered in `scripts/local/seed/index.ts`. Every id, e-mail and code
is fixed in `scripts/local/seed/ids.ts` — import it from a spec, or read
`.local-dev/seed-manifest.json` (same data plus the urls) from anything else.

| Pack | Contents |
| --- | --- |
| `base` | **Loja Demo** (`/shop/loja-demo`): paying CRM + ERP with the Hub add-on, admin `admin@demo.local.test`, restricted operator `operador@demo.local.test`, three sellers, nine products (plain, variants, optional and required add-ons, sold by weight, seven groups), eight clients across the RFM segments with two tags and two saved addresses, a 5% cashback program (Maria has R$ 30 to redeem), online shop open all day with delivery (fee R$ 8, free above R$ 80), default chart of accounts / financial accounts / payment defaults, an open register with R$ 100. |
| `coupons` | One coupon per benefit type (`DEZREAIS`, `QUINZE`, `ACAI15`, `LEVE3PAGUE2`, `BRINDEAGUA`) plus a manual-validation one (`ANIVERSARIO`). |
| `sales-history` | About 220 confirmed counter sales over the last 90 days (none today), deterministic. |
| `crm-only` | **Loja Só CRM**: paying CRM plan, no ERP. Owner `dono@crm.local.test`. |
| `trial` | **Loja em Teste**: free trial started when the pack ran. Owner `dono@teste.local.test`. |

Sales and coupons are created through the app's own functions (`createAndConfirmSale`,
`CouponSchema` + `assertCouponCoherence` + `insertCouponWithinTransaction`), so a rule change that
would reject them in the UI breaks the seed loudly. Stores mirror `POST /api/organizations` using
the same config builders. Leaf catalog and client rows are plain inserts.

Dates are relative to when `local:setup` ran. A snapshot older than a couple of weeks has an
expired trial store and a history that no longer reaches yesterday: run `local:setup` again.

### Adding a pack

Write `scripts/local/seed/packs/<name>.ts` exporting an async function, add its ids to `ids.ts`
and register it in `index.ts` (packs run in registry order; `base` always runs first).

## Logging in

`npm run local:login` inserts a real row in `auth_sessions` and gives you two ways in:

- **Any browser:** open the printed `http://localhost:3100/auth/dev-login?token=…&next=…`.
- **Playwright:** `storageState: ".local-dev/auth/admin.json"`.

The route (`app/auth/dev-login/route.ts`) only turns a token that is *already* a valid session in
the local database into the httpOnly cookie. It creates nothing and answers 404 outside local mode,
for an unknown token, or for a database that is not local.

## End-to-end specs

`e2e/playwright.config.ts` takes its base URL from `.env.localdb`. The global setup restores the
snapshot and logs every seeded user in; specs run in one worker because they share the database.
Specs use the admin session by default; another user is one line:

```ts
import { storageStateFor } from "../support/local";
test.use({ storageState: storageStateFor("operator") });
```

`e2e/support/database.ts` gives a spec a guarded connection to assert what a click wrote.

Reports and traces go to `e2e/.results/` (`npx playwright show-report e2e/.results/report`).

## What does not work locally

| Area | Why |
| --- | --- |
| File uploads, images in Supabase Storage | No storage service; `NEXT_PUBLIC_SUPABASE_URL` is a dead loopback address. Seeded images are inline SVG placeholders. |
| Realtime (live updates in chats, order boards) | Same: no Supabase realtime. Pages load; they do not update by themselves. |
| WhatsApp, e-mail, Stripe, fiscal emission, iFood and other integrations, AI | Stub keys and the network guard. Flows that call them fail at the call. The subscription pages open, but checkout and the billing portal cannot. |
| Crons, queues, webhooks | Nothing triggers them. RFM labels, for example, are seeded rather than computed. |
| Google login, magic link | Use `local:login`. |
| The checkout scale, the desktop agent, payment terminals | Hardware. |

## Troubleshooting

- **`Refusing to start: N key(s) are not defined in .env.localdb`** — the code (or a real env file)
  gained a variable. `npm run local:setup -- --env-only`.
- **`Could not reach PostgreSQL on this machine`** — start the service, or set `LOCAL_PG_ADMIN_URL`.
- **`next dev` prints a notice and exits on its first run** — `local:dev` starts it once more by
  itself.
- **A page complains about a missing key at import time** — some SDK refuses an empty key. Give it
  a stub in `resolveStubValues` (`scripts/local/env.ts`) and regenerate the env file.
- **Two checkouts at once** — give each its own `--suffix` and `--port`. Local mode builds into
  `.next-localdb`, so it also runs next to a regular `next dev` in the same folder.
- **Dropping a branch database** — `DROP DATABASE recompracrm_<suffix>_dev` and `…_template` with
  any PostgreSQL client.
