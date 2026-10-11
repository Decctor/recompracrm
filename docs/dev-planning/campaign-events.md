# Campaign events

Campaign events are the durable boundary between business occurrences and campaign dispatches.
All 14 campaign trigger types now enter this boundary: purchase confirmation and cashback,
RFM entry/permanence, birthday, expiring cashback, worst sales day, and the four scheduled
families (single use, product promotion, survey and recurrence). Manual resend uses the same
pipeline with its existing frequency bypass.

## Capture, processing and delivery

Producers record versioned Portuguese payloads in their own database transaction. A unique
`(organizacaoId, tipo, chaveIdempotencia)` preserves the first capture, including its timestamp
and immutable facts. Customer events carry `clienteId`; campaign-wide occurrences leave it null.
Sources are generic references, so a sale foreign key is not required.

Post-commit publication sends only the event ID and pages through every due row, so a producer
that captures thousands of events in one transaction (RFM analysis) publishes all of them. The
campaign-dispatch cron recovers pending events after publication failure. The queue idempotency
key derives from the row's current `proximaTentativa`, so the producer and the cron reading the
same row state deduplicate while a republish after a bump is a new delivery. Publication
permission is persisted: a capture with publication disabled (manual integration runs) is stored
already DESCARTADA, so its key still blocks a later capture of the same occurrence but it never
enters the pending index, the ordering gate or the recovery sweep. Historical imports and
correction runs retain their existing effects flags. There is no backfill.

The worker locks the event and serializes frequency checks by customer or campaign scope.
A database sequence orders pending customer events, so an out-of-order queue delivery cannot
make the later purchase win the frequency check. Handler effects, dispatch creation and event
completion commit together. Failed attempts roll back and remain retryable, but never forever:
an event older than 24 hours is discarded on delivery, and an event that keeps throwing
(unsupported version, malformed payload, deterministic handler error) is discarded after 10
attempts. A stale or exhausted earlier event does not hold back the customer's newer events.
There is no after-process work: the worker only creates dispatches.

Dispatches and recipients reference their originating event. Existing dispatch scheduling,
audience expansion, quotas, send reservations and delivery retries remain in charge of sending.
Scheduled events create expansion work; detector events create their frozen candidate set.
Lost expansion publication is recovered by the existing stale-dispatch sweep. Stable occurrence
windows retain the existing dispatch deduplication keys as a second layer of protection.

Before sending, the generic guard validates event ownership, completion and publication
permission, then calls its handler. The guard is created once per send batch: the event row,
whose payload embeds every recipient of a campaign-wide occurrence, is loaded and parsed once and
shared by all its recipients, the handlers memoize per-event lookups, and the client facts they
revalidate ride on the batched delivery client query. Handlers check current source validity,
campaign state, communication pauses and source-specific conditions. Birthday date, expected RFM
segment and remaining expiring credit are revalidated. Processing recovery expires after 24
hours; intentional multi-day delivery delays allow 24 hours after their configured due time.
Scheduled and recurring rounds keep a null due time and never expire at send time, as before the
migration. Invalid events release reserved quota through the existing dispatch path. Legacy
recipients without an event keep their existing behavior. Database idempotency cannot guarantee
exactly-once external provider delivery.

## Purchase producers and financial boundaries

Internal POS, shop and tab closing capture through `processSaleConfirmationInTransaction`.
The data-collecting pipeline captures when an imported sale becomes valid; managed integration
confirmation uses the same effects service. POI captures its existing transaction intent, including
flows without a persisted sale. The older sale-registration route captures its cashback trigger
and preserves its existing nullable confirmation status.

Internal snapshots use live confirmed purchase totals under the purchase-history lock. Import
snapshots preserve each sale's before/after totals, explicit first-purchase flag, cashback and seller.
Ingestion takes the blocking variant of the customer lock (it holds many sale rows and several
customers until commit, and must wait for a POS confirmation rather than abort it or be aborted by
it) and refreshes the customer's cached starting totals before applying the batch. Managed
confirmation locks the customer before claiming the sale row, in the same order as POS confirmation.
The event observation time controls recovery freshness; the original integration purchase date
is retained separately. POI intents without a sale do not increment quantity/value thresholds.

Payments, accounting, change, inventory, rewards, cashback accumulation/reversal, affiliate
cashback and conversion attribution remain in their producer transactions. The worker never
repeats those effects and never writes client purchase metadata: internal sales keep relying on
the nightly cron for the cache, as before; imports keep their existing ingestion-owned updates.

## Adding another event

1. Define its payload and runtime schema in `schemas/` and register its versioned contract in
   `schemas/campaign-events.ts`.
2. Implement and register a handler with source checks, freshness and recipient validation.
3. Capture a stable business key in the producer transaction and publish after commit.
4. Verify rollback, duplicate capture, retries and send guards. Retain old handlers while their
   versioned events can still be pending.

## Deployment

Apply `drizzle/0124_campaign_events.sql` before deploying. It adds the event table, status enum,
nullable dispatch/recipient references and skip reasons. Existing reads select the new columns
even with capture disabled. Later SQL files are outside the legacy Drizzle journal;
`db:migrate` alone does not apply this migration. The earlier sale-only migration was never applied.

Capture defaults enabled globally. `CAMPAIGN_EVENTS_ENABLED=false` is a stop-all-campaigns
switch, not a capture-only switch: every trigger type, scheduled and recurring campaigns and
manual resend enter through events and there is no legacy direct-dispatch fallback, so nothing
is sent for the affected organizations while it is off (a warning is logged once per process).
`CAMPAIGN_EVENTS_ORGANIZATIONS` restricts capture, and therefore sending, to the listed
organizations. Queue configuration is in `vercel.json`; the `campaign-events` trigger must be
live before the first producer publishes. No organization pilot is required. Disabling capture
does not retract existing dispatches or already queued messages. Leave the additive schema in
place if rolling back application code. No production data or configuration was changed here.

## Verification and limits

`npm run test:campaign-events` uses ephemeral PGlite PostgreSQL, applies the actual migration,
and never loads an environment file or contacts production. It covers confirmation finance,
transaction rollback, lifecycle retries, immutable/scoped deduplication, unsupported contracts,
ordering, import publication permission and cashback parity, detector guards and scheduled expansion.
The existing integration, financial and campaign policy suites provide regression coverage.

PGlite has one backend: it verifies PostgreSQL constraints and idempotency, but multi-connection
lock contention and the Vercel queue/provider boundary need staging verification. No deployment,
historical replay or provider submissions are performed by these tests.
