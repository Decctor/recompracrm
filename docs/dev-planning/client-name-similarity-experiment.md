# Client name similarity experiment — 2026-10-21

Read-only experiment against Congelatte Gelateria (not DEMO), 8,414 clients.
Run: `node --env-file=.env scripts/analyze-client-name-similarity.mjs`.
No DDL, candidate writes, or persistent settings. Transactions are read-only with a 20-second statement timeout.

## Query structure

Materialize only the organization's clients, normalize names once, remove connecting words for fuzzy comparison, then compare bounded groups using equality joins:

- Same last token and first initial.
- Same first token and first three characters of last token.

Expand both keys into rows and equality-join on the key, deduplicating pairs. This lets PostgreSQL use merge joins instead of evaluating an OR across the entire organization. Existing indexes are sufficient for this experiment.

## Measurements

EXPLAIN ANALYZE warm executions, single production run each (not load tests):

- Normalized exact name: 199 ms; 1,294 pairs.
- Surname + initial: 291 ms; 1,710 pairs at score >= 0.65.
- First name + surname prefix: 208 ms; 1,631 pairs.
- Combined equality keys: 445 ms; 1,761 unique pairs; 510 ms client wall time.
- Previous unrestricted global-index similarity join exceeded 25 seconds.
- Previous 200-client indexed lateral query took 7.1 seconds.

Combined thresholds: 1,589 pairs >= 0.70; 1,483 >= 0.75; 1,365 >= 0.80; 1,327 >= 0.85. These include exact-name pairs. No manual labels exist, so precision/recall are unknown.

## Quality findings

- Useful fuzzy examples: Anna/Ana Clara Silva (0.833), Maria Eduarda Furlaneto/Furlanetto (0.885), Vanessa Corrreia/Corrêa Pereira (0.808).
- False-positive risk: Denis/Denise Morais (0.857), Andressa/Andre Dos Santos Martins (0.800).
- Trigram sets ignore multiplicity: Ana Paula vs Ana Paula de Paula scores 1 after particle removal. Exact string equality must be tracked separately.
- Generic names and common two-token names dominate: cliente não identificado and Maria Eduarda each generate 66 exact pairs.
- Exploratory JS postfilter excluding generic names, groups >10, and conflicting nonempty documents leaves 1,629 pairs. Requiring contact support OR at least three raw tokens per name with score >=0.8 leaves 331 pairs. This is an exploratory heuristic, not a validated SQL rule; particle words count as raw tokens, and frequency is measured among returned pairs rather than the complete organization.

## Proposed next iteration

Use the equality-key query as the performance baseline. Compute complete normalized-name frequencies in SQL; exclude placeholders; count meaningful tokens; preserve repeated-token differences; rank exact normalized names separately. Develop first-name-specific checks using manually labeled candidates because a scalar trigram threshold cannot distinguish spelling variants from different people. Exclude already dismissed/merged pairs before presenting results. Current counts have not subtracted existing reconciliation records.

Do not deploy candidate generation from these experiments yet. A database index/schema change is not required for the demonstrated improvement. Any database changes require user confirmation.

## Refined SQL experiment

Run `node --env-file=.env scripts/analyze-client-name-similarity-refined.mjs`.

Moves guardrails into SQL: full-organization normalized-name frequencies, meaningful token counts (excluding particles), placeholder and numeric-name exclusion, conflicting nonempty document exclusion, and permanent dismissal/merge exclusion. Exact equality uses strings, not a trigram score of 1. Short-name tiers stay separate. Fuzzy matches require >=0.8, at least three meaningful tokens on both sides, and either identical first names or first names equal after collapsing repeated letters.

Measured database execution: 407 ms on the initial refined run; client wall time 572–614 ms. Results: 308 exact full-name pairs, 3 particle-only full-name pairs, 8 fuzzy pairs with identical first name, 2 fuzzy pairs with repeated-letter first-name variants. Separate lower-confidence tiers: 613 short exact-name pairs and 6 short particle-only pairs. 407 other generated pairs are omitted. Counts are pairs, not unique people or verified duplicates.

The strict tiers preserve Anna/Ana Clara Silva, Bruna Alves/Alvez de Menezes, and Maria Eduarda Furlaneto/Furlanetto; they omit Denis/Denise and Andressa/Andre. They deliberately lose two-token fuzzy variants and first-name variants beyond repeated letters (e.g. Jordy/Jordi). Common exact names can still refer to different people. Frequencies are currently grouped by the normalized string before particle removal; grouping by particle-normalized names could improve common-name suppression. The keys also miss simultaneous first- and last-name changes. No precision/recall claim can be made without labeled samples.

No application detection or queue behavior has been changed. Existing cron is configured at `30 3 * * *` (03:30 UTC); create/update hooks and detail-page rechecks also populate stored candidates.

## Code implementation (not executed against production)

The nightly sweep now includes `name-duplicate-query.ts`, sequentially per organization. Only the full-name tiers are inserted. Groups over 100 clients are skipped; output is limited to 10 matches per pair side and 5,000 per organization, with a 15-second per-organization statement timeout. Pending pairs retain other evidence; dismissed/merged pairs remain untouched. Live contact recomputation preserves name evidence. The queue recognizes `NOME_SEMELHANTE` as its weakest signal. No schema migration is needed.

Local PGlite tests execute the actual SQL with pg_trgm/unaccent against synthetic fixtures, including tenant isolation, conflicting documents, repeated runs, permanent decisions, and live-upsert evidence preservation. Run `node --import tsx --test lib/clients/name-duplicate-query.test.ts` with the existing declared PGlite dev dependency installed. No production candidate writes have been performed. Deploying this code enables candidate writes at the next nightly run; approval is still required before deployment/execution.
