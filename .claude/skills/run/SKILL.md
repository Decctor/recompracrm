---
name: run
description: Start RecompraCRM locally against the throwaway seeded database, log in as a seeded user, reset data and run the Playwright specs. Use when asked to run, start, open or screenshot the app, to click through a feature, or to confirm a change works in the real app rather than only in unit tests.
---

# Running RecompraCRM locally

The app runs against a local PostgreSQL with synthetic data. **Never** load `.env` / `.env.local`,
never run `drizzle-kit push` or `scripts/apply-sql-migration.ts`, and never change
`SUPABASE_DB_URL` by hand: the commands below are the only supported path, and they refuse anything
that is not a loopback `*_dev` database. Full reference: `docs/dev/local-environment.md`.

## 1. Prepare (once per checkout, and after schema or seed changes)

```bash
npm install
npm run local:setup
```

About 10 seconds. It regenerates `.env.localdb`, rebuilds the database from
`services/drizzle/schema/`, loads the seed packs and snapshots the result. If it cannot reach
PostgreSQL, stop and ask the user — do not install or reconfigure a database on your own. A
non-default superuser goes in `LOCAL_PG_ADMIN_URL` for that one run.

Sharing the machine with another checkout or agent: `npm run local:setup -- --suffix=<branch> --port=<free port>`.

## 2. Start the app

```bash
npm run local:dev
```

Run it in the background. The port is `LOCAL_PORT` in `.env.localdb` (default 3100); ready when
`GET /auth/signin` answers 200. The first hit of each route compiles and can take several seconds.

## 3. Log in

```bash
npm run local:login                # demo store admin
npm run local:login -- operator    # restricted operator (also: crmOwner, trialOwner)
```

It prints `Open to log in: http://localhost:3100/auth/dev-login?token=…` — navigate the browser
there and you land on the dashboard with the session cookie set. Add `--next=/dashboard/sales/new`
to land elsewhere. For Playwright, use `storageState: ".local-dev/auth/<user>.json"` instead.

Ids, e-mails, product names, coupon codes and urls of everything seeded are in
`.local-dev/seed-manifest.json` (source: `scripts/local/seed/ids.ts`). Useful entry points:

- `/dashboard` — hub
- `/dashboard/sales/new` — register (PDV); a cash session is already open
- `/shop/loja-demo` — public online store (no login)
- `/dashboard/growth/coupons` — coupons (codes `DEZREAIS`, `QUINZE`, `ACAI15`, `LEVE3PAGUE2`, `BRINDEAGUA`)

## 4. Reset

```bash
npm run local:reset    # back to the seeded snapshot in under a second
npm run local:login    # sessions are data: log in again
```

Reset before a check that depends on counts or balances, and after one that leaves data behind.
The app can stay up through a reset.

## 5. Specs

```bash
npm run test:e2e                         # everything in e2e/specs
npm run test:e2e -- pos.spec.ts          # one file
npm run test:e2e -- -g "cash sale"       # by title
```

The run resets the database, logs every seeded user in and starts the app if it is not up.
`npx playwright install chromium` once if the browser is missing. Failures leave a screenshot, a
trace and an `error-context.md` (page snapshot) under `e2e/.results/artifacts/`.

When a change touches a flow, add or extend a spec in `e2e/specs/` — assert in the UI, and use
`queryLocalDatabase` (`e2e/support/database.ts`) for what the click must have written.

## What will not work

Uploads and realtime (no Supabase), WhatsApp/e-mail/Stripe/fiscal/iFood/AI calls (stub keys, and
the server cannot open connections outside this machine), crons, queues and webhooks. A flow that
needs one of these fails at that call: report it as not verifiable locally rather than working
around it.
