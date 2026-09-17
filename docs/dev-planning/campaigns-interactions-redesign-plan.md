# Campaigns + Interactions — Audit & Redesign Plan

**Status:** proposta refinada (2026-09-17)
**Scope:** campaign processing (single-use, recurrent, event-triggered), interaction delivery pipeline, send-quota capping (weekly + daily), campaign bonuses (cashback/coupon).
**Related:** supersedes and absorbs `docs/dev-planning/bulk-messaging-workflows-plan.md` (outbox proposal); consistent with `docs/seller-routine-hub-design.md` (interactions as relationship primitive).
**Progress since first draft:** see *Current state* below. `weekly_send_counters` + quota adjust-on-status-change shipped; several Phase 0 bleed-stops shipped. Dispatch tables, Queues for campaigns, bonus-on-send, unified engine, and generic `send_counters` have **not**.

---

## Current state (2026-09-17) — what the July audit got wrong

The **target architecture is still the work**. What changed is that Phase 0 is mostly done and the weekly ledger already exists, so Part 1's line numbers and a few "root cause" mechanisms are stale. The four-roles problem, the three-cron 300s pump, bonus-at-enqueue, and the missing outbox are not.

### Already shipped (do not redo)

| Item | Where | Notes |
|---|---|---|
| O(1) weekly ledger | `weekly_send_counters`, `lib/interactions/weekly-send-counters.ts`, `drizzle/0041` | Hot path is counter `FOR UPDATE`, not org-row lock. `COUNT(*)` only lazy-backfills the first row of a week. |
| Quota release on terminal status | `updateInteractionDeliveryState` → `adjustWeeklySendQuota` | `releaseWeeklySendQuota` exists but **nothing in product calls it**; delivery-state is the real hook. Keep that hook when generalizing windows. |
| Reject campaign weekly limit > org limit at save | `validateCampaignWeeklyLimit` in `lib/campaigns/validation.ts`, called from `app/api/campaigns/route.ts` | Runtime still `Math.min` as belt-and-suspenders. |
| Threshold **crossing** (`previous < t && new >= t`) | `effects.ts`, POI, `lib/campaigns/purchase-trigger-priority.ts` | The `===` bug is gone. |
| Chunk/sleep/retry helpers | `lib/campaigns/shared.ts` | Used by both enqueue crons. |
| `processMultipleInteractions` deleted | — | Delivery-state helpers are **in use**, not dead. |
| Retry no longer requires `dataExecucao IS NULL` | `app/api/campaigns/interactions/route.ts` | Uses `weeklyLimitMode: skip` when already reserved. |
| Reactivate single-use on enqueue **failure** | `reactivateCampaignAfterEnqueueFailure` | Claim is **still** `ativo=false` *before* audience. Empty audience after claim does **not** reactivate. Kill mid-run still leaves it off. |
| Seller-routine columns on `interactions` | `canal`, `direcao`, `iniciadoPor`, `vendedorId`, `dataInteracao`, `status` | v1 of `seller-routine-hub-design.md` shipped. Timeline role is real; queue role is still mixed in. |
| Communication pause | `clients.comunicacaoPausadaAte`, stripped in `lib/campaigns/filters.ts` | Outbox `PULADA/COMUNICACAO_PAUSADA` is journal, not a new product rule. |
| Campaigns health widget | `app/api/campaigns/health` | Counts today's `FALHOU`/`BLOQUEADA`/`PENDENTE` **and** reads `weekly_send_counters`. Must cut over with Phase 2/5. |

### New since the July draft (absorb into the redesign, not a surprise)

- **`PROMOCAO-PRODUTOS`** — new trigger, same mechanics as `USO-UNICO` (date + block, claimed in `process-single-use-campaigns`). Dispatcher treats it as `origem = 'AGENDADA'`.
- **`canScheduleCampaignForClient` is 9 copies**, not 4: effects, POI, `app/api/sales/route.ts`, rfm-analysis, segmentations/sync, birthday-notify, cashback-expiring-notify, worst-sales-day-notify, plus the test script. Phase 4's "one function" has a wider fan-in than the draft listed.
- Exclusive purchase-trigger priority is already extracted to `lib/campaigns/purchase-trigger-priority.ts`. The two callers still disagree on `allowNewPurchaseOnFirstPurchase` (`false` vs `true` on POI). There is still no `lib/campaigns/engine/`.
- Internal gateway send passes `clientMessageId: interactionId` — partial provider idempotency **only** on that channel. Meta Cloud still has none.
- Coupon generation on campaigns (`cupomGeracao*`) sits next to cashback; both still grant at enqueue.

### Still true (the redesign exists for these)

- `interactions` is still queue + ledger-ish + timeline + attribution. Quota-`BLOQUEADA` is still written (`campaign-weekly-limits.ts` + SEM_CONTATO in `send-reserved-interaction.ts`).
- Three hourly crons, `maxDuration = 300`, enqueue crons unbounded, sender self-stops at 295s.
- Dedup is still SELECT-then-INSERT, no unique on `(campanha, cliente, janela)`. Recurrent has no claim.
- Send is still non-atomic (chat insert → provider → status). Drain still requires `dataExecucao IS NULL AND statusEnvio IS NULL` — reserved-but-unsent rows stay invisible.
- Cashback/coupon still granted at interaction create; `reverseCampaignCashbackForBlockedInteractions` still scans `metadados->>'interacaoId'`.
- No `campaign_dispatches` / recipients / generic `send_counters`. Campaigns are not on Vercel Queues (only AI turns + import jobs).
- Webhook status updates still two processors (`lib/whatsapp/webhook-processing.ts` vs `gateway-webhook-processing.ts`); shared bits (`mapWhatsAppStatusToAppStatus`, `updateInteractionDeliveryState`) are not one `applyProviderStatusUpdate`.
- `statusEnvio` / `atribuicao_modelo` still `text`+$type; `metadados` untyped jsonb with more shapes than before (cupom + promoção). Missing indexes unchanged. No CREATE TABLE migration for core campaign tables.
- Operational scripts still exist. Automated coverage of the pipeline is still essentially none (`promotion-suggestion.test.ts` only; quota still hand-rolled scripts).

### Phase 0 leftover (still worth doing before/with Phase 1)

Move the single-use `ativo=false` claim to **after** successful enqueue (reactivate-on-failure is not enough: empty audience and killed runs still stick the campaign off). That is the last Phase 0 item that still eats production.

---

## Part 1 — Audit

### 1.1 The root cause everything else follows from

The `interactions` table plays **four roles at once**:

1. **CRM relationship timeline** (canal/direcao/iniciadoPor/vendedorId/dataInteracao/status) — the seller-routine primitive.
2. **Message delivery queue** (agendamentoDataReferencia/agendamentoBlocoReferencia + `statusEnvio IS NULL` = "pending work").
3. **Quota ledger** — weekly usage is `COUNT(*)` over interactions with `statusEnvio IN (PENDENTE, ENVIADO, ENTREGUE, LIDO)` and `dataExecucao >= startOfWeek` (`lib/interactions/campaign-weekly-limits.ts:344-397`). _(Partially superseded by `weekly_send_counters`; the COUNT still backfills the first row of a week, and `BLOQUEADA` rows are still written.)_
4. **Attribution anchor** (`dataExecucao` feeds conversion attribution).

Because the queue, the ledger, and the record are the same rows:

- Enforcing a limit requires **mutating rows into `BLOQUEADA`** — dead data polluting the timeline and stats, created in 5 different places in `campaign-weekly-limits.ts` (lines 583, 719, 777, 983, 1057) plus `send-reserved-interaction.ts:457`.
- Quota checks require `COUNT(*)` scans plus `SELECT ... FOR UPDATE` **on the organization row itself** (`campaign-weekly-limits.ts:564, 689, 880`), serializing every send in the org through one lock.
- `dataExecucao` is simultaneously the **claim lock**, the **quota window anchor**, and the **attribution anchor** (acknowledged in `seller-routine-hub-design.md:69`). A crash between claim (`dataExecucao` set) and send (`statusEnvio` set) leaves rows invisible to the drain query (`process-interactions/route.ts:88-92` requires both NULL) — never retried. `scripts/recover-single-use-campaign.ts` exists because this happened in production.

### 1.2 Bonus-at-enqueue

Cashback/coupons are granted when the interaction is **created**, not when the message is delivered (`lib/data-collecting-v2/effects.ts:357-406`, `process-single-use-campaigns/route.ts:160-185`). Every blocked/failed send therefore needs **compensating reversal**, keyed by a `metadados ->> 'interacaoId'` back-reference on cashback transactions (`lib/cashback/reverse-campaign-cashback.ts:58`) — an unindexed JSON scan, and only stamped since commit 55c09fb (older grants are unreversible). Reversal runs in a different transaction than some block decisions, so a crash in between leaks granted-but-unsent cashback.

### 1.3 The pipeline is fragile by construction

- **Three crons fire at the same minute hourly** (`vercel.json:47-70`), each iterating **all organizations sequentially**, `maxDuration = 300s`. Only `process-interactions` has an internal time budget; the two enqueue crons can be hard-killed mid-run.
- **Single-use claim = `UPDATE campaigns SET ativo = false`** _before_ audience resolution and enqueue (`process-single-use-campaigns/route.ts:224-233`). Timeout mid-run ⇒ campaign permanently deactivated with a partial audience, silently. The failure note even says "campanha permaneceu desativada e NÃO foi reativada".
- **Dedup is SELECT-then-INSERT with no unique constraint** (recurrent: `route.ts:147-161`; single-use: `route.ts:125-138`; event path: 4 copies of `canScheduleCampaignForClient`). Overlapping runs can double-enqueue; recurrent has no claim at all.
- **Send is non-atomic**: chat-message insert, provider call, and status writes are separate statements (`send-reserved-interaction.ts:318-513`). Crash after the provider call but before the status write ⇒ duplicate send on any retry. There is no idempotency key at the provider boundary.
- The retry endpoint (`app/api/campaigns/interactions/route.ts:301-302`) requires `dataExecucao IS NULL`, but any send failure inside `sendReservedInteraction` happens _after_ reservation set `dataExecucao` — so retry is unreachable exactly for real send failures.

### 1.4 Duplication census

| Logic                                                           | Copies                | Locations                                                                                                                                                                |
| --------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Event-trigger engine                                            | 2 (+1 in test script) | `lib/data-collecting-v2/effects.ts` vs `app/api/point-of-interaction/new-transaction/route.ts` (behaviorally divergent: `allowNewPurchaseOnFirstPurchase` false vs true) |
| `canScheduleCampaignForClient` (frequency dedup)                | 4                     | effects.ts:41, new-transaction/route.ts:43, test script, inline                                                                                                          |
| Quota reservation                                               | 3                     | `reserveCampaignWeeklyQuota` / `reserveCampaignWeeklyQuotaBatch` / `reserveOrganizationWeeklyQuotaBatch` (~500 lines of near-identical claim/block logic)                |
| `processChunkImmediateInteractions` + chunk/sleep/retry helpers | 3                     | both enqueue crons + process-interactions' `buildImmediateProcessingData`                                                                                                |
| Webhook status mapping + handlers                               | 2                     | `integrations/whatsapp/route.ts:329` vs `whatsapp/gateway/route.ts:447`                                                                                                  |
| `getEffectiveCampaignWeeklyLimit`                               | 2                     | `lib/campaigns/validation.ts:113` vs `campaign-weekly-limits.ts:94`                                                                                                      |
| Enum definitions                                                | 2–3                   | pgEnum + Zod + `$type` text columns; live drift: `whatsappMensagemId` vs `whatsappMessageId` (`schemas/interactions.ts:22-23`)                                           |

### 1.5 Data-model debt

- **No CREATE TABLE migration exists** for campaigns/interactions/conversions — schema is `db:push`-managed; the `drizzle/*.sql` files are a partial, misleading record (`0024` even targets an unprefixed table name).
- `statusEnvio` and `atribuicao_modelo` are raw `text` with `$type` casts — DB accepts anything.
- `interactions.metadados` is untyped jsonb with **three divergent shapes** written by different modules (`schemas/interactions.ts:9-44` vs `lib/message-templates/variables.ts:195-213` vs `lib/campaigns/interaction-metadata.ts:72-128`).
- `campaigns` is single-table accretion: 12 trigger types × dedicated nullable `gatilho_*` columns; boolean+nullable-cluster pattern for cashback/coupon config; recurrence day lists as JSON-in-`text`.
- Missing indexes for hot analytics: stats queries filter `statusEnvio` + `dataInsercao` (no covering index); `campaign_conversions` has **no `organizacao_id` index**; campaign list full-text search has no GIN index.
- Trigger thresholds use **exact equality** (`newTotalPurchaseValue === gatilhoValorTotalCompras`, effects.ts:97) — a sale that crosses the threshold without landing on it never fires; float equality besides.
- Campaign weekly limit above org limit is silently clamped at runtime (surfaced as blocked sends) instead of rejected at save time.

### 1.6 What the operational scripts prove

- `scripts/recover-single-use-campaign.ts` — audiences partially enqueued + PENDENTE rows reserved-but-never-dispatched (claim-then-crash).
- `scripts/backfill-campaign-interaction-delivery-dates.ts` — delivered rows with NULL `dataExecucao`/`dataEnvio`, i.e. sends invisible to quota and reporting.
- `utils/scripts/test-recurrent-campaign-weekly-quota.ts` — quota behavior untrusted enough to need a hand-rolled phone-targeted test rig; no automated test coverage exists for any of this.

---

## Part 2 — Target architecture

**Principle: separate the pipeline from the record.**
The pipeline (what should be sent, to whom, under what budget) lives in dedicated dispatch tables. `interactions` returns to being the **record of things that actually happened** — clean timeline, no dead rows, no queue semantics.

### 2.1 New tables

```
campaign_dispatches            -- one row per campaign "run"
  id, organizacao_id, campanha_id
  origem            ENUM('AGENDADA','RECORRENTE','EVENTO')
  janela_referencia text        -- 'YYYY-MM-DD@HH:00' for scheduled; sale id for event
  status            ENUM('PENDENTE','RESOLVENDO','ENFILEIRADA','ENVIANDO','CONCLUIDA','FALHOU','CANCELADA')
  total_destinatarios, total_enviados, total_falhados, total_pulados  int
  erro, data_insercao, data_conclusao
  UNIQUE (campanha_id, janela_referencia)          -- idempotent run creation

campaign_dispatch_recipients   -- the outbox / work queue
  id, dispatch_id FK, organizacao_id, campanha_id, cliente_id
  status            ENUM('AGUARDANDO','RESERVADA','ENVIADA','FALHOU','PULADA')
  motivo_pulo       ENUM(
                      'QUOTA_ORG_DIARIO','QUOTA_ORG_SEMANAL',
                      'QUOTA_CAMPANHA_DIARIO','QUOTA_CAMPANHA_SEMANAL',
                      'SEM_CONTATO','COMUNICACAO_PAUSADA','FREQUENCIA'
                    ) NULL
  tentativas int, erro text
  interacao_id FK NULL          -- set when the send happens
  idempotency_key varchar       -- passed to provider; makes retries safe
  UNIQUE (dispatch_id, cliente_id)                 -- idempotent enqueue (ON CONFLICT DO NOTHING)

send_counters                  -- O(1) quota ledger, window-agnostic
                               -- reshapes weekly_send_counters (already shipped)
  organizacao_id, campanha_id NULL
  tipo              ENUM('DIARIO','SEMANAL')
  periodo_chave     text        -- DIARIO: 'YYYY-MM-DD'; SEMANAL: 'YYYY-Www'
  usados            int
  UNIQUE (organizacao_id, campanha_id, tipo, periodo_chave)
                               -- campanha_id NULL = org counter; NULLS NOT DISTINCT
```

`tipo` is the generalization that `weekly_send_counters.semana_chave` lacked. `SEMANAL` is one window, not the schema. The first extra window is `DIARIO` — the knob for **números novos no WhatsApp**, which Meta throttles hard on a 24h rolling/calendar cap until the number warms up. Weekly stays the campaign-pacing tool; daily is the warming tool.

Period keys stay in `America/Sao_Paulo` (same timezone as the interactions cron):

| `tipo`    | `periodo_chave` | example      |
| --------- | --------------- | ------------ |
| `DIARIO`  | `YYYY-MM-DD`    | `2026-09-17` |
| `SEMANAL` | `YYYY-Www`      | `2026-W38`   |

A later window (`MENSAL`, or a phone-scoped daily for a single fresh line in a multi-number org) is the same row shape — add a `tipo` value, or a nullable `whatsapp_conexao_telefone_id` on the unique key. Do not add either until a product need exists; the unique key stays `(organizacao_id, campanha_id, tipo, periodo_chave)`.

Keep the drizzle-kit caveat from `0041`: the unique is `NULLS NOT DISTINCT` in real DDL and **omitted** from the Drizzle table definition, otherwise every `db:push` tries to recreate it.

### 2.2 Quota enforcement (kills BLOQUEADA)

Reservation is one atomic statement **per (scope, window)** — no org-row lock, no COUNT(\*), no status mutation:

```sql
UPDATE send_counters
SET usados = usados + :n
WHERE organizacao_id = :org
  AND campanha_id IS NOT DISTINCT FROM :camp
  AND tipo = :tipo
  AND periodo_chave = :periodo
  AND usados + :n <= :limit
RETURNING usados;
```

(Wrapped in upsert-then-claim. Claim every applicable counter in a **fixed order** to avoid deadlock: org `DIARIO` → org `SEMANAL` → campaign `DIARIO` → campaign `SEMANAL`. Skip a window whose limit is null. When quota is partial, claim `min(remaining across all windows, batch)` and mark the rest `PULADA/QUOTA_*`.)

A send is allowed iff **every applicable window has remaining ≥ 1**. The old `effective = min(campaign, org)` is the weekly special case of that rule, not a single number anymore.

- Over-quota recipients are marked `PULADA` with the specific window that exhausted (`QUOTA_ORG_DIARIO`, `QUOTA_CAMPANHA_SEMANAL`, …) — **no interaction row is ever created**, so nothing pollutes the timeline and there is nothing to reverse.
- **Terminal failures decrement every counter the send incremented**, on the window keys of the reservation (not "now") — already the behavior of `releaseWeeklySendQuota`; keep it when generalizing. Replaces the old accidental behavior where `FALHOU` freed quota by falling out of the counted statuses.
- Limits: org weekly (`limiteMensagensSemanaisViaCampanhas`, existing) + org daily (`limiteMensagensDiariasViaCampanhas`, new) + campaign weekly (`limiteEnviosSemanais`, existing). Campaign daily (`limiteEnviosDiarios`) is the same row shape; ship it only if the builder needs per-campaign day pacing — org daily is enough for warming a fresh number. Reject `campaign limit > org limit` **per window** at save time instead of clamping at send time.

Product surface for daily: next to the existing weekly cap in outbound settings. Typical warming values (50 / 250 / 1000) sit beside "sem limite"; copy should say this is for números novos, not a second weekly budget.

### 2.3 Processing (one dispatcher + one sender, both queued)

Replace the three-cron structure with two roles, both idempotent and resumable. The **clock** stays a cron; the **work** is Vercel Queues — the same split already used by import jobs (`app/api/cron/import-jobs` → `integration-import-batches`) and AI turns (`sendAiTurnToQueue` → `ai-chat-turns`).

1. **Clock** (cron, cheap, hourly-per-block): for each due campaign, `INSERT campaign_dispatches ... ON CONFLICT DO NOTHING` (the unique key on `(campanha_id, janela_referencia)` *is* the claim — deletes the `ativo=false` lock). Then `send('campaign-dispatch-expand', { dispatchId }, { idempotencyKey: dispatchId })`. The cron does not resolve audiences and does not send messages. It must finish in seconds even with many orgs.
2. **Expand consumer** (`campaign-dispatch-expand`): resolve the audience, bulk-insert recipients `ON CONFLICT DO NOTHING`. Frequency-cap and communication-pause filters run here, marking `PULADA` rows instead of silently skipping — full observability of why someone wasn't messaged. Advances dispatch `PENDENTE → ENFILEIRADA`. Then publishes N `campaign-dispatch-send` messages (worker tokens, or one per recipient batch). Safe to re-run: unique on `(dispatch_id, cliente_id)` makes expansion idempotent.
3. **Send consumer** (`campaign-dispatch-send`): claims a recipient batch with `FOR UPDATE SKIP LOCKED` (the mutex against at-least-once redelivery), reserves quota via counters, sends with the recipient's `idempotency_key`, writes the `interactions` row at send time (`interacao_id` back-ref), updates recipient + dispatch counters. If `AGUARDANDO` rows remain, `send()` a continuation — same budget-then-requeue loop as `runImportJobBatch`. A killed invocation is retried by the queue; SKIP LOCKED makes concurrent consumers safe.

Single-use, product-promotion, and recurrent campaigns become the *same* flow — the only difference is how `janela_referencia` is computed (`PROMOCAO-PRODUTOS` is scheduled like `USO-UNICO`). Event-triggered campaigns create a 1-recipient dispatch (`origem = 'EVENTO'`, `janela_referencia = saleId`) through the **one shared engine** (see 2.5) and publish straight to the send topic — same quota, same journal, same debuggability, no wait for the clock. Event entry points to fold in: `effects.ts`, POI `new-transaction`, and `app/api/sales/route.ts`, plus the notify crons that copy `canScheduleCampaignForClient` (birthday, cashback-expiring, worst-sales-day, RFM, segmentations/sync).

#### Why 300s will not improve (so Queues is definitive, not an escalation)

The plan already sits at the platform ceiling: every campaign cron is `maxDuration = 300`, and `process-interactions` stops itself at 295s (`RUNTIME_BUDGET_MS`). That is the Fluid/Pro function cap, not a bug we can raise.

SKIP LOCKED + a more frequent cron would make timeouts **safe** (resume instead of lost work). It would not make them **rare**:

- The bottleneck is I/O fan-out (WhatsApp round-trips), not a slow query we can index away. Today the sender runs `SEND_CONCURRENCY = 10` inside **one** hourly invocation that walks **all** orgs sequentially. ~10 in-flight sends × 295s is the whole platform's campaign throughput until the next hour. The redesign does not make a single function send faster.
- Vercel Cron is one invocation per tick (minimum 1 minute). Overlapping ticks + SKIP LOCKED is accidental parallelism — a homemade, poorly-scaled queue. Expanding a large audience in that same cron is how enqueue jobs already get hard-killed mid-run (1.3).
- A later Enterprise bump (e.g. 800s) is a longer sequential loop, not a fan-out. The shape of the work wants many parallel invocations, which is what Queues is.

So: journal = source of truth, queue = delivery of work. `@vercel/queue` is already in the repo; this is not a new infra bet. Workflows stay out.

#### Execution substrate (closed)

| Option | Verdict |
|---|---|
| **Vercel Queues** | **Chosen.** Clock cron claims the dispatch row and publishes; expand + send are push consumers (`queue/v2beta` in `vercel.json`, `handleCallback`, `idempotencyKey` on publish). At-least-once + SKIP LOCKED + recipient unique + provider idempotency key. The DB journal stays the source of truth — the queue is not the ledger. Same pattern as import jobs and AI turns. |
| **Crons + `SKIP LOCKED` alone** | **Rejected as the pump.** Correctness-preserving, throughput-capped. 300s already bites; the redesign does not change the arithmetic. SKIP LOCKED remains, but as the consumer mutex, not as the scheduler. |
| **Vercel Workflows** | **Rejected.** Workflows sit on Queues and add durable steps / sleep / hooks. Lived experience in another codebase: the DX is too heavy (slow local loop, workflow runtime in the inner loop). We do not need multi-step orchestration — we need a pump over rows. Do not revisit unless the product actually grows a multi-step campaign (wait-for-reply, then branch). |

`bulk-messaging-workflows-plan.md` is absorbed for the **outbox shape**, not for the Workflow runtime.

### 2.4 Bonus on send success

Grant cashback/coupon when the send **succeeds** (recipient → `ENVIADA`), inside the same transaction that records the interaction. Not at the first delivery webhook — gateway sends may lack delivery receipts, and the grant should not depend on Meta. Deletes: `reverseCampaignCashbackForBlockedInteractions`, the `metadados->>'interacaoId'` back-reference convention, and the cashback-leak window. (Product note: message templates that mention the bonus remain valid — the grant lands milliseconds before/with the send.)

### 2.5 One event-trigger engine

Extract to `lib/campaigns/engine/` (single module consumed by both `lib/data-collecting-v2/effects.ts` and `app/api/point-of-interaction/new-transaction/route.ts`):

- `resolveTriggeredCampaigns(saleContext)` — pure function: priority resolution + threshold **crossing** semantics (`previous < threshold && new >= threshold`) instead of float equality. One explicit decision on `allowNewPurchaseOnFirstPurchase` (today the two paths silently disagree).
- `checkFrequencyCap(...)` — the single `canScheduleCampaignForClient` (deletes 3 copies).
- Both entry points shrink to: build context → call engine → create dispatch+recipient.

### 2.6 Schema hygiene (with the dust settled)

- `interactions` sheds queue columns (`agendamento*`, `statusEnvio`-as-claim ambiguity): rows are created at send time with `canal`/`direcao`/`iniciadoPor` populated; `statusEnvio` remains as pure delivery tracking (ENVIADO→ENTREGUE→LIDO via webhooks) and becomes a **pgEnum**; `FALHOU`/`BLOQUEADA` disappear from it (failures/blocks live on recipients).
- `dataExecucao` overload dissolves: claim → recipient row; quota → counters; attribution → interaction creation timestamp.
- Type `metadados` (`$type` + one Zod schema; fix `whatsappMensagemId`/`whatsappMessageId`).
- Unify the two webhook handlers behind one `applyProviderStatusUpdate`.
- Add missing indexes: `campaign_conversions (organizacao_id, campanha_id, data_conversao)`; stats-covering index on interactions; GIN for campaign search.
- **Leave the wide `gatilho_*` column set as-is.** Folding it into a discriminated `configuracaoGatilho` jsonb is a separate, unmotivated migration — not part of this redesign.
- **Delete historical `BLOQUEADA` rows** once the dispatch journal owns that information. They are dead timeline pollution, not an archive worth keeping. Stats windows that still count them must be cut over to recipients/`PULADA` first, then the rows go.

### 2.7 Testability & debuggability

- Eligibility, priority, frequency-cap, quota-math (including multi-window claim/release), and recurrence-schedule logic become **pure functions** → plain unit tests (replaces the phone-targeted test rig).
- The dispatch journal answers "why didn't client X get campaign Y?" with a row: `PULADA/QUOTA_ORG_DIARIO`, `PULADA/SEM_CONTATO`, etc. Today that answer requires archaeology across BLOQUEADA rows and logs.
- A small admin view over dispatches (status, counts, errors, retry button) replaces `recover-single-use-campaign.ts` — stuck dispatches are visible and re-runnable instead of requiring hardcoded-UUID scripts.

---

## Part 3 — Migration plan (strangler, each phase ships alone)

**Phase 0 — stop the bleeding.** Mostly shipped. Remaining: move the single-use `ativo=false` claim to *after* successful enqueue (reactivate-on-failure is not enough: empty audience and killed runs stay off). Already done: validate campaign-limit ≤ org-limit at save; threshold-crossing; delete `processMultipleInteractions`; chunk/retry helpers in `lib/campaigns/shared`.

**Phase 1 — generic send counters.** Reshape the **existing** `weekly_send_counters` → `send_counters`: add `tipo` (backfill existing rows as `SEMANAL`), rename `semana_chave` → `periodo_chave`, expand the unique to `(organizacao_id, campanha_id, tipo, periodo_chave)`. Generalize `adjustWeeklySendQuota` (the live hook; not the unused `releaseWeeklySendQuota` wrapper) to release every window the send incremented. Add org daily limit (`limiteMensagensDiariasViaCampanhas`) and claim it alongside weekly. Stop writing quota-`BLOQUEADA`. Keep `SEM_CONTATO` blocking as-is for now. Cut over `app/api/campaigns/health` with the new windows.

**Phase 2 — dispatch/recipients for scheduled campaigns.** New tables; clock cron + `campaign-dispatch-expand` / `campaign-dispatch-send` queue consumers replace `process-single-use-campaigns` and `process-recurrent-campaigns`; `process-interactions` keeps draining legacy event-path rows during transition. Roll out behind a per-org flag; dual-run comparison on a pilot org; then cutover and delete the two enqueue crons + the send cron + recovery scripts.

**Phase 3 — bonus on send success.** Move grant to send success; delete reversal machinery and the metadata back-reference.

**Phase 4 — unified event engine.** Extract `lib/campaigns/engine/`; route sales + POI paths through it; event sends become 1-recipient dispatches; retire the legacy drain path in `process-interactions`.

**Phase 5 — schema hygiene + cleanup.** pgEnums, typed metadata, indexes, webhook unification; **delete** historical `BLOQUEADA` rows after stats no longer read them. Do **not** fold `gatilho_*` into jsonb.

**Testing gate per phase:** unit tests on the pure functions; one integration test per pipeline invariant (idempotent enqueue, crash-resume via queue redelivery, quota-exact across weekly+daily, release-on-terminal-failure, no-double-send with concurrent send consumers).

---

## Part 4 — Closed decisions

1. **Execution substrate — Vercel Queues.** 300s already bites and will not improve (function cap + I/O fan-out; see 2.3). Clock cron claims the dispatch; expand/send are queue consumers. SKIP LOCKED stays as the at-least-once mutex, not as the pump. Workflows stay out (DX too heavy). Pattern already in-repo (import jobs, AI turns).
2. **Quota release on failure — decrement.** Terminal failure releases every counter the send incremented, on the reservation's window keys. Matches current `releaseWeeklySendQuota` and the old accidental `FALHOU`-drops-out-of-COUNT behavior, but auditable.
3. **Bonus grant moment — send success** (recipient → `ENVIADA`), same transaction as the interaction insert. Not the delivery webhook.
4. **Historical BLOQUEADA rows — delete** after stats cut over to the dispatch journal. No archive table.
5. **`gatilho_*` column sprawl — leave it.** Not in this redesign.
6. **Counters are window-typed, not weekly-only.** `send_counters.tipo` (`DIARIO` \| `SEMANAL`) + `periodo_chave`. Daily exists so we can cap números novos no WhatsApp without a second ledger.)
