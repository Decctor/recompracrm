# iFood add-on availability reliability

Status: implemented locally on 2026-10-13; deployment pending. Production catalog containment was performed separately earlier that day.

## Required behavior

Deleting or disabling an option in Recompra must pause every linked iFood copy. A successful HTTP response is not sufficient evidence that the customer-facing catalog reflects the change. Confirmed mismatches in fields managed by Recompra must remain retryable even when the last saved snapshot already matches the desired local value.

Preserve many-to-one links, per-merchant channel overrides, per-product selection limits, unrelated catalog fields, and soft-deleted local rows. Never hard-delete remote options.

## Evidence and immediate containment

Organization: Congelatte Gelateria (`27817d9a-cb04-4704-a1f4-15b81a3610d3`). Merchant: `e7f8201f-05ff-4ee3-969a-a92df22dc103`. Local group: `501f0c62-a2e5-4c32-86a1-05fc68942887` (Escolha seu gelato:).

The five linked deleted entries had `ultimoSnapshot.disponivel: false`, no stored error, last synchronization on October 3, and availability divergence recorded on October 13. The tombstone branch in `lib/integrations/ifood/sync/add-ons.ts` skips a pause when that snapshot is already false, ignoring a newer observation that the remote option is available. Reconciliation records divergence but does not repair it.

Raw item documents showed root AVAILABLE / DEFAULT UNAVAILABLE for Leite Ninho and Torta de limão. Pistache Zero and both Mousse entries were AVAILABLE at both levels. Root status alone therefore overstates availability divergence; establish channel precedence with sandbox checks before implementing the effective-status resolver. The historical cause of the original mismatch is not established: retained snapshots do not prove remote propagation or identify a later writer.

Six targeted `PATCH /options/status` requests returned success, followed by fresh reads confirming root and DEFAULT UNAVAILABLE:

- Pistache Zero: `f92833a1-deb0-4195-83d8-fe84667e45c9`.
- Mousse de maracujá: `58fb90bc-7d45-4e33-a900-19d5e24a8e77` and `c3256c32-3543-4c25-950a-76a67aea30a1`.
- Leite Ninho: `9549c978-7de5-4aae-83a6-04d3ebb992d4`.
- Torta de limão: `849ec8a6-6741-4dc2-8dc8-97a9dcc7a37a`.
- Bombom de Morango: `feeebd40-46bd-4ade-ad7c-5307666c7c4a` (açaí copy).

Bombom de Morango was inactive locally but unlinked remotely. Restored its mapping to local option `6a424f0f-b4a4-4437-add3-80b5817a8504`, remote group `fceda8fd-9b77-4e18-b18f-5877f89c5c75`, with name, price and availability managed by Recompra. Future activation/deactivation can now reach that existing copy.

Full verification completed at **2026-10-13 15:22:47 Brasília time** (18:22:47 UTC). Read all 44 catalog items; 20 used one of the two managed gelato groups. Every occurrence of a targeted option was UNAVAILABLE at root and channel levels. Selection limits matched resolved local rules on all 20 products, and every currently active local flavor was present. Both copies had 28 active flavors. During the operation, Pistache Supremo also changed from available to unavailable remotely and its current local desired state was false; it was not included in our six PATCH requests and was left matching that current state. All other non-target option statuses and channel modifiers matched the captured pre-operation documents.

After that verification, recorded synchronization success for the six repaired option links. The local group's link statuses were 147 SINCRONIZADO and 152 historical DESVINCULADO, with no remaining PENDENTE, DIVERGENTE or ERRO links. These counts are database metadata; the preceding live reads are the evidence for the targeted availability repair.

## Implementation

- `option-state.ts` resolves DEFAULT availability and price with root fallback, treats missing availability as unknown, and verifies reads with bounded propagation backoff. Catalog DTOs now use the same resolver. Context precedence is confirmed by the [iFood catalog reference](https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/fundamentals).
- `sync/option-sync.ts` plans availability from live observations rather than trusting a false snapshot. Deleted options retain the mandatory pause rule, live options respect opt-out policies, and snapshots retain values of unsent fields.
- `sync/add-ons.ts` observes linked options before planning writes and confirms synchronized fields afterward. It preserves each failed copy and each newly created mapping for redelivery. Potential existing remote names/codes stop blind creation and surface a mapping conflict.
- Queue results distinguish retryable and permanent failures. The consumer now rejects retryable partial results; both queue and inline delivery have bounded retries. Per-link errors remain visible after exhaustion.
- Reconciliation uses effective channel availability, enqueues availability-only repairs after the propagation grace period, and leaves other fields for manual resolution. It reports active unlinked options on group links and in `opcoesSemVinculo`, without guessing a mapping or modifying ambiguous options.
- All local `PUT /items` paths (sync, publication, group status, and catalog editor) now use `writeIfoodItemDocument`. Just before writing, `sync/document-availability.ts` reapplies current managed local availability to existing linked options, protects deleted options across contexts, preserves other fields, and verifies the result. This uses the enforcement alternative rather than adding merchant-wide locks; it does not establish which historical writer caused the original incident.
- The standalone variant editor now schedules pushes for edited existing shared groups. Product and variant saves use the same group-id selection rule, deduplicating shared groups and excluding detached references.

The design below records the intended behavior and release checks. No database migration or dependency change is required.

## Validation completed

- `npm run test:ifood`: **73 passed**, including 22 option-sync regression/service tests. Covers stale false snapshots, multiple remote copies, partial failures, idempotent replay, delayed/failed observations, effective channel status in both read DTOs, snapshot ownership, full-item deletion safety, mapping conflicts, and shared-group dispatch selection.
- `npm run test:product-pricing`: **19 passed**, including the write-path scans for product/variant price snapshots and update stamps.
- Focused Oxlint: **0 warnings, 0 errors** across the iFood module and the touched API routes.
- Source TypeScript check: **passed**, using a temporary config that extends the repository config and excludes generated `.next` files. The temporary config and outputs were removed afterward.
- Full `tsc --noEmit`: blocked by four unrelated generated route errors in `.next/dev/types/validator.ts` and `.next/types/validator.ts` (stale WhatsApp/service-account page references and the barcode-usage route constraint). No application-source errors remain.
- `git diff --check`: passed. Live sandbox lifecycle testing and deployment have not been performed for this code change.

## Design and release checks

1. **Resolve observed availability consistently.** Add a shared resolver beside `effectiveOptionPrice` in `lib/integrations/ifood/item-document.ts`. Validate DEFAULT/root precedence and missing/null statuses in the sandbox. Preserve context status in read DTOs or collect it from representative raw item documents; use the same resolver in reconciliation and post-push verification. Read each group through a representative item rather than repeatedly reading every product.

2. **Make known drift override the snapshot optimization.** Extract a small, testable change-planning function used by `pushAddOnGroupToLinkedMerchants`. Schedule a pause for a deleted option when a verified availability divergence says it is still available, even if the snapshot is false. Apply the same rule to inactive live options and other synchronized fields. Respect opt-out policies for live options; retain the existing deletion safety rule. Do not clear unrelated divergences or mark skipped tombstones synchronized without evidence.

3. **Verify writes before committing synchronization success.** After status patches, reread affected groups/options with bounded backoff for eventual consistency. Keep unconfirmed results pending/error and retryable; record a clear error after the propagation deadline. Commit snapshot/status success only for confirmed fields and copies. Batch reads, preserve per-option results, and make queue redelivery idempotent.

4. **Retry partial failures and repair managed availability.** `app/api/queues/ifood-catalog-push/route.ts` currently logs a returned `erros > 0` and acknowledges the message; those failures do not reach its retry callback. Make retryable partial failures trigger bounded queue retries while retaining successful results. Classify permanent failures separately. Reconciliation should enqueue confirmed availability repair only where the local policy owns the field; preserve manual resolution for other fields and opt-out policies. Record retry exhaustion instead of silently reporting completion.

5. **Protect shared options during whole-item writes.** Audit `sync/push.ts`, `sync/publish.ts`, group status updates, and catalog editor writes that round-trip item documents. Product and group queue locks currently have different keys, so they do not exclude each other. Determine whether stale whole-item writes can restore option status; serialize conflicting writes with a shared merchant/group lock acquired in a stable order, or enforce desired managed availability within the write. Apply the chosen protection to every competing write path and verify after the write. This is a hypothesis to test, not a proven historical cause.

6. **Report missing mappings.** Detect active unlinked remote options inside managed groups, including duplicates, during reconciliation. Offer explicit mapping/review; do not automatically match or disable an ambiguous remote option by name. A remotely active option with a confirmed inactive local match must be flagged for repair. Preserve intentionally partial groups and options belonging to another local group.

## Regression checks and acceptance

- Local deletion retains row/link identity and schedules a group push in every supported save path (group, product, variant).
- Deleted option + false snapshot + observed AVAILABLE still schedules UNAVAILABLE for every linked copy.
- Live inactive option follows channel overrides and sync policy; another merchant's configuration is unaffected.
- Root/channel disagreement is resolved using sandbox-confirmed semantics, with fallback for absent context status.
- HTTP success followed by stale reads is not marked confirmed; later propagation settles successfully; sustained mismatch remains retryable.
- Partial patch failures trigger queue retry; retries do not recreate existing options, repeat successful work unnecessarily, or hide permanent failures.
- Concurrent whole-item writes cannot reactivate deleted/inactive options; prices, schedules, selection limits, and unrelated options survive.
- Missing/duplicate mappings are visible without unsafe automatic matching.
- Run `npm run test:ifood` and focused new tests; run the repository's required type/lint checks for touched files. Confirm behavior with a sandbox option through activate, deactivate, delete, delayed propagation, and replayed queue delivery before deployment.
- After deployment, perform read-only reconciliation for Congelatte and verify that ordinary saves cannot leave the repaired options available again.

## Delivery scope

The targeted production pause, mapping repair, and live verification are complete. Application changes are implemented locally and have not been deployed. Integration tests use mocked iFood HTTP responses and database records; a live sandbox lifecycle check remains part of release validation.
