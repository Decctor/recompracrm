# Product Promotion Campaign Trigger (`PROMOCAO-PRODUTOS`) — Design

Scheduled one-shot campaign that promotes a curated list of up to 10 products (with optional
per-product price overrides) and personalizes the message per client with the **suggested product of
the promotion** — the product from the list the client is most likely to buy, computed at enqueue
time from existing purchase-affinity data.

Runs on the same scheduled cron machinery as `USO-UNICO` (date + time block, atomic claim, chunked
enqueue, reactivation on failure).

---

## Locked decisions

| Decision | Choice |
| --- | --- |
| Product list storage | **jsonb config on `campaigns`** (typed like `filtros`), not a child table. The structure is small, bounded (≤10), and always read/written whole. |
| Suggestion semantics | **Repurchase-friendly.** Products the client already buys are eligible and *preferred* — a promo is a repurchase nudge, deliberately unlike the discovery-only cross-sell in `clients.metadataProdutoSugeridoId`. |
| Discount model | **Promo price (value) is the source of truth** (`precoPromocional`). A percentage input in the UI is merely a helper that computes the value from `precoVenda`; no percentage is persisted. |
| Variable resolution timing | **At enqueue time**, snapshotted into the interaction's `metadados` jsonb. Send time stays a pure template-fill (same pattern as cashback-expiring context). |
| Processor | Reuse `process-single-use-campaigns` — it becomes the "scheduled one-shot campaigns" processor handling both `USO-UNICO` and `PROMOCAO-PRODUTOS`. |
| Dynamic header image (product photo) | **Not in v1.** The metadata snapshot already carries `promocaoProdutoImagemUrl` so v2 is purely additive (new `IMAGEM_DINAMICA` preset). |

---

## 1. Data model

### 1.1 Enums

`services/drizzle/schema/enums.ts`:

```typescript
export const campaignTriggerTypeEnum = pgEnum("campaign_trigger_type", [
	// ...existing values...
	"PROMOCAO-PRODUTOS",
]);
```

`schemas/enums.ts`: add `"PROMOCAO-PRODUTOS"` to the matching `z.enum`.

> Migration note: adding a value to an existing `pgEnum` is an `ALTER TYPE ... ADD VALUE` —
> non-destructive, but drizzle-kit must generate it before any row uses the value.

### 1.2 Campaign columns (`services/drizzle/schema/campaigns.ts`)

Following the one-prefix-per-trigger pattern:

```typescript
// specific for "PROMOCAO-PRODUTOS"
gatilhoPromocaoDataReferencia: text("gatilho_promocao_data_referencia"), // YYYY-MM-DD in the interactions cron timezone
gatilhoPromocaoProdutos: jsonb("gatilho_promocao_produtos").$type<TCampaignPromotionProduct[]>(),
```

- `gatilhoPromocaoDataReferencia`: same semantics as `gatilhoUsoUnicoDataReferencia`. Time of day
  keeps coming from `execucaoAgendadaBloco` — nothing new there.
- `gatilhoPromocaoProdutos`: ordered array; **array order is the fallback priority** when a client
  has no affinity signal (no separate `ordem` field needed).
- We intentionally do NOT reuse the `usoUnico` column: cheap to add, keeps each trigger's config
  self-describing, and lets `getTriggerDefaultsPatch` null the right fields symmetrically.

### 1.3 jsonb item shape

Data travels as data → Portuguese fields (see CLAUDE.md). Only configuration is stored; product
name/price/image are resolved fresh at enqueue time and snapshotted onto the interaction, so a
renamed or repriced product never leaves the campaign config stale.

```typescript
type TCampaignPromotionProduct = {
	produtoId: string;
	precoPromocional?: number | null; // null/undefined = no override, effective price = products.precoVenda
};
```

---

## 2. Zod schemas (`schemas/campaigns.ts`)

Following the `CampaignFiltersSchema` precedent (schema + inferred type consumed by the Drizzle
`$type`):

```typescript
export const CampaignPromotionProductSchema = z.object({
	produtoId: z.string({
		required_error: "Produto da promoção não informado.",
		invalid_type_error: "Tipo não válido para o produto da promoção.",
	}),
	precoPromocional: z
		.number({ invalid_type_error: "Tipo não válido para o preço promocional." })
		.positive("O preço promocional deve ser maior que zero.")
		.optional()
		.nullable(),
});
export type TCampaignPromotionProduct = z.infer<typeof CampaignPromotionProductSchema>;
```

`CampaignSchema` gains:

```typescript
gatilhoPromocaoDataReferencia: z.string({ ... }).optional().nullable(),
gatilhoPromocaoProdutos: z.array(CampaignPromotionProductSchema, { ... }).optional().nullable(),
```

The campaign create/update routes need no structural change — the jsonb rides the existing
campaign payload (no nested child-row processing, no `deletar` soft-delete; the array is replaced
whole on save).

---

## 3. Validation (`lib/campaigns/validation.ts`)

New `validateProductPromotionCampaign(campaign)`, mirroring `validateSingleUseCampaign`:

1. `gatilhoPromocaoDataReferencia` present, valid, strictly `YYYY-MM-DD`
   (`dayjs(value).format("YYYY-MM-DD") === value`).
2. `gatilhoPromocaoProdutos` present with **1 to 10** items.
3. No duplicate `produtoId`.
4. Every `precoPromocional`, when set, `> 0`.
5. Async check: all `produtoId`s exist, are `ativo`, and belong to the organization
   (single `inArray` query).

Also:

- `validateCampaignFrequencyInterval`: exempt `"PROMOCAO-PRODUTOS"` the same way `"USO-UNICO"` is
  exempt (one-shot campaigns have no recurrence interval).
- `TRIGGERS_SUPPORTING_ANTES` stays unchanged (this trigger only makes sense with `DEPOIS`, the
  default).
- Template ↔ trigger compatibility comes for free via
  `validateCampaignTemplateTriggerCompatibility` once the context map is updated (§5).

Builder-side validation (`app/dashboard/growth/campaigns/_module/builder/helpers/validation.ts`)
mirrors rules 1–4 for inline feedback.

---

## 4. Suggested-product resolution

**Where:** in the cron, per enqueue chunk (bounded batches of `ENQUEUE_CHUNK_SIZE`), producing a
`Map<clienteId, TPromotionSnapshot>` passed into the insert.

**Inputs:** the campaign's product id list (from jsonb), the chunk's client ids, plus:

- `productClientReferences` (`janela = 'GERAL'`) — already maintained by the
  `product-client-references` cron;
- `clients.metadataProdutoMaisCompradoId` and `clients.metadataGrupoProdutoMaisComprado`;
- `products` rows for the campaign list (loaded **once per campaign**: `nome`, `precoVenda`,
  `imagemCapaUrl`, `grupo`, `ativo`).

**Ranking, per client** (first match wins — repurchase-friendly by design):

1. The client's favorite product (`metadataProdutoMaisCompradoId`) is in the list → pick it.
2. The list product with the highest `totalComprasValor` for this client in
   `productClientReferences` (`GERAL`), ties broken by `totalComprasQuantidade` then `produtoId`.
3. A list product whose `grupo` equals the client's `metadataGrupoProdutoMaisComprado`
   (ties broken by campaign list order).
4. Fallback: the **first product in the campaign list order** — guarantees every client resolves a
   product and the template variable never renders empty.

**Implementation shape:** one `inArray(clienteId, chunk) AND inArray(produtoId, campaignProductIds)`
query over `productClientReferences` + the client metadata columns already fetched for the chunk;
the ranking itself is plain in-memory logic over ≤ `chunkSize × 10` rows. No new SQL machinery, no
new tables, deterministic and cheap.

---

## 5. Template variables & interaction metadata

### 5.1 Context group and variables (`lib/message-templates/variables.ts`)

- `TMessageTemplateVariableContextGroup` += `"PROMOCAO"`.
- `MESSAGE_TEMPLATE_VARIABLE_CONTEXT_GROUP_LABELS.PROMOCAO = "Produto Sugerido da Promoção"`.
- `MESSAGE_TEMPLATE_TRIGGER_CONTEXT_MAP["PROMOCAO-PRODUTOS"] = ["CLIENTE", "PROMOCAO", "CASHBACK", "CUPOM"]`
  — and `"PROMOCAO"` is added to **no other trigger**, so template gating
  (`getVariablesForTrigger` / `validateTemplateForTrigger`) works automatically.

New variables (keys English like the rest of `TMessageTemplateVariables`):

| Variable | Meta id | Label | Content |
| --- | --- | --- | --- |
| `promotionProductName` | `promotion_product_name` | Nome do Produto da Promoção | Snapshotted product name |
| `promotionProductPrice` | `promotion_product_price` | Preço Promocional do Produto | Effective price: override if set, else `precoVenda`, formatted via `formatToMoney` |
| `promotionProductOriginalPrice` | `promotion_product_original_price` | Preço Original do Produto | `precoVenda` at enqueue time, formatted |

Percentage is a UI helper only (§7) — no `promotionProductDiscountPercentage` variable in v1. It is
trivially computable from the snapshot later if copywriting demands it.

Example values in `MessageTemplateVariableExampleValues`:
`promotionProductName: "Cappuccino"`, `promotionProductPrice: "R$ 9,90"`,
`promotionProductOriginalPrice: "R$ 12,90"`.

### 5.2 Interaction metadata snapshot

`TInteractionContextMetadados` (same file) gains:

```typescript
promocaoProdutoId?: string;
promocaoProdutoNome?: string;
promocaoProdutoPrecoOriginal?: number;
promocaoProdutoPrecoPromocional?: number; // effective price (override ?? precoVenda)
promocaoProdutoImagemUrl?: string;        // unused in v1; enables the v2 dynamic header preset
```

`buildContextVariablesMap` (`lib/interactions/message-preview.ts`) maps them:

```typescript
promotionProductName: ctx?.promocaoProdutoNome ?? "",
promotionProductPrice: formatToMoney(ctx?.promocaoProdutoPrecoPromocional ?? 0),
promotionProductOriginalPrice: formatToMoney(ctx?.promocaoProdutoPrecoOriginal ?? 0),
```

and the `Omit<...>` list in `TInteractionContextVariablesMap` stays untouched (these are
context-driven, not client-driven).

`sendReservedInteraction` needs **zero changes** for v1: the variables flow through
`contextMetadados` exactly like the cashback/coupon ones.

### 5.3 Gap found during implementation: context on the immediate-send path

The drain path (`process-interactions` cron) reads `interactions.metadados` back from the database
and passes it as `contextMetadados`. The **immediate** path did not: `processEnqueuedChunkImmediate
Interactions` (`lib/campaigns/shared.ts`) built its `ImmediateProcessingData` payloads without the
field, so anything enqueued and sent in the same run would render context variables empty.

Fixed by adding an optional `contextMetadadosByClientId` map to that helper. A follow-up audit of
every enqueue-and-send path then found (and fixed) the wider class:

- **`process-recurrent-campaigns` never ran campaign effects at all.** A RECORRENTE campaign with
  `cashbackGeracaoAtivo`/`cupomGeracaoAtivo` silently credited nothing and granted nothing. The
  cron now applies both effects per recurrence inside the enqueue transaction.
- **`process-single-use-campaigns` ran effects but discarded their context.** Cashback was credited
  and coupon grants were burned, yet the message rendered `couponCode` empty and cashback variables
  as "R$ 0,00" (`formatCashbackValue(0)` — a plausible wrong number, worse than blank).
- **Shared fix**: `applyCampaignBatchEffectsToInteractionMetadata`
  (`lib/campaigns/interaction-metadata.ts`) is the batch mirror of
  `applyCampaignBonusToInteractionMetadata` — it runs the FIXO-cashback and coupon batch generators
  and returns the per-client context to persist and pass along. The batch generators now return
  per-client balances (`balancesByClientId`, plus the program's `terminologia`) and the coupon's
  code/title/expiration. Both crons pre-generate interaction IDs (so cashback transactions still
  record `metadados.interacaoId` for send-block reversal) and insert the interaction with the full
  merged context — effects and interaction stay atomic in one transaction.
- **Structural guard**: `sendReservedInteraction` now falls back to the interaction's persisted
  `metadados` (same query it already made, widened by one column) whenever the caller does not pass
  `contextMetadados`. The persisted row is authoritative, so a future caller that forgets the
  in-memory map degrades to correct-but-one-query behavior instead of rendering wrong values.

---

## 6. Cron processing (`app/api/cron/process-single-use-campaigns/route.ts`)

The route becomes the scheduled one-shot processor for both triggers. Reused untouched: atomic claim
(`ativo=false` with `.returning`), audience resolution via
`resolveCampaignAudienceClientIdsForCampaign` (segmentations + `filtros` work for free), chunked
enqueue with retries, per-client dedup inside `enqueueCampaignChunk`, reactivation +
`notifyCampaignEnqueueFailure` on failure, weekly limit cache, immediate processing, cashback/coupon
generation.

Changes:

1. **Campaign query** (`getSingleUseCampaignsForBlock`): match both trigger types, each on its own
   date column —

   ```typescript
   or(
   	and(eq(fields.gatilhoTipo, "USO-UNICO"), eq(fields.gatilhoUsoUnicoDataReferencia, currentDate)),
   	and(eq(fields.gatilhoTipo, "PROMOCAO-PRODUTOS"), eq(fields.gatilhoPromocaoDataReferencia, currentDate)),
   )
   ```

2. **Per-campaign product load** (promo campaigns only): fetch the `products` rows for
   `gatilhoPromocaoProdutos` ids once, before chunking. Products that vanished or went inactive
   since save are dropped from the working list (logged); if the list ends up empty, treat as a
   config failure → release the claim + notify, same path as audience-resolution failure.

3. **Per-chunk suggestion resolution** (§4) producing `Map<clienteId, snapshot>`.

4. **`enqueueCampaignChunk`**: accept an optional `metadadosByClientId` map and set
   `metadados: metadadosByClientId?.get(clientId)` on each inserted interaction row. This is the one
   structural change — today the chunk insert is uniform per row. `titulo`/`descricao` for promo
   interactions: `` `Promoção de produtos: ${campaign.titulo}` ``.

The recurrent-campaigns cron, `process-interactions` drain, attribution and stats are untouched —
the campaign is just a campaign with `campanhaId` on its interactions.

---

## 7. UI

### 7.1 Builder wiring (`app/dashboard/growth/campaigns/_module/builder/`)

Every per-trigger touchpoint follows the existing registry pattern:

- `helpers/triggers.ts`: register `"PROMOCAO-PRODUTOS"` (label "Promoção de Produtos", description,
  icon — e.g. `BadgePercent`/`Tag` from lucide).
- `helpers/categories.ts`: same category as `USO-UNICO` (scheduled/one-shot group).
- `helpers/trigger-defaults.ts` — `getTriggerDefaultsPatch`: seed
  `gatilhoPromocaoDataReferencia: dayjs().format("YYYY-MM-DD")` and
  `gatilhoPromocaoProdutos: []`, null all other trigger-specific fields; symmetrically, every other
  trigger's patch nulls `gatilhoPromocaoDataReferencia`/`gatilhoPromocaoProdutos`.
- `helpers/validation.ts`, `helpers/stages.ts`: mirror §3 rules for inline feedback/stage gating.
- `components/trigger-inline-config/promocao-produtos-config.tsx` + registration in `index.ts`:
  date picker (same as `uso-unico-config.tsx`) + the products table below.
- Detail view: `detail/helpers/trigger-config-summary.ts` and `detail/campaign-config-view.tsx`
  render the date + product list with prices.
- Global label maps: `utils/select-options.tsx` and
  `components/Stats/Blocks/CampaignTriggerDistributionBlock.tsx`.

### 7.2 Hydrating display data from IDs

The jsonb persists only `produtoId` + `precoPromocional`, but the table shows name, code, current
price and image — and in edit mode those must come from the catalog. Solved with an additive `ids`
hydration mode on the existing `/api/products/search` route (when present, the textual search and
pagination are bypassed and exactly the requested products return) plus a `useProductsByIds` hook in
`lib/queries/products.ts`. The hook sorts the IDs into its query key so the same set in a different
order reuses the cache.

No display data is written into the campaign state: the persisted array stays exactly the shape the
API validates.

### 7.3 Products table — purchases spreadsheet pattern

Reuse the spreadsheet stack from `components/Modals/Purchases/Blocks/Items.tsx`:
`components/Spreadsheet/*` (`SpreadsheetCellWrapper`, `EditableNumberCell`, `DeleteRowButton`,
`MobileEditableField`) + `lib/spreadsheet-navigation` (`SPREADSHEET_TABLE_ATTR`,
`handleSpreadsheetNavigationKeyDown`, grid bounds) for keyboard nav, and the same visual language:
header row `bg-muted/60` with uppercase micro-labels, percentage-width columns, desktop grid +
mobile `MobileEditableField` cards.

Columns:

| Produto | Preço atual | Preço promo | % desc. | Total? — no; Ações |
| --- | --- | --- | --- | --- |
| product picker (`SelectProductWithVariants` sans variants, or the plain product select) with image + group, 30–40% | read-only `precoVenda` | `EditableNumberCell` for `precoPromocional` (blank = no override) | **UI helper**: editing % writes `precoPromocional = precoVenda × (1 − pct/100)`; editing the price recomputes the displayed % — nothing persisted | `DeleteRowButton` |

Rules:

- "Adicionar produto" row disabled at 10 items, with a `x/10` counter in the section header.
- Row order is meaningful (fallback priority — §4). V1 keeps it simple: order = insertion order;
  drag-to-reorder is a possible follow-up.
- Since storage is jsonb, row removal just filters the array (no `deletar` soft-delete).
- State lives in the campaign state hook (`components/Modals/use-campaign-state.tsx`):
  `addPromotionProduct` / `updatePromotionProduct` / `removePromotionProduct` updaters over
  `gatilhoPromocaoProdutos`, all `useCallback`-wrapped per the state-hook conventions.

### 7.4 Template side

Nothing bespoke: the template editor already groups variables by context, so "Produto Sugerido da
Promoção" appears as a group when (and only when) the trigger allows it; previews use the new
example values.

---

## 8. Preview & testing

- `/api/campaigns/test` (test-send path): when the campaign is `PROMOCAO-PRODUTOS`, build the
  snapshot for the test client with the same resolution helper used by the cron (extract it to
  `lib/campaigns/` — e.g. `lib/campaigns/promotion-suggestion.ts` — so cron and test route share
  one implementation).
- Unit-testable pure core: `rankPromotionProductForClient({ candidates, signals })`, covered by
  `lib/campaigns/promotion-suggestion.test.ts` (`node:test`) — the four ranking rules, the
  empty-signal fallback, list-order tie-breaking, the empty-list null, and effective-price
  resolution.
- Manual QA checklist: campaign with overrides + without; client with favorite in list; client with
  no purchase history (fallback); product deactivated between save and fire; template using a
  `PROMOCAO` variable rejected on a non-promo trigger.

---

## 9. V2 — dynamic product header image (out of scope for v1)

The plumbing exists: `IMAGEM_DINAMICA` headers with the preset registry in
`lib/message-templates/headers/dynamic-presets.ts` (currently `CASHBACK_AVAILABLE_BALANCE`). V2 adds
a `PROMOTION_PRODUCT` preset rendering product image + name + promo price from the interaction
snapshot (`promocaoProdutoImagemUrl`, already stored by v1), with
`requiredVariables: ["promotionProductName", "promotionProductPrice"]`.

Other explicitly deferred items: percentage as a persisted/variable concept, drag-to-reorder for
priority, variant-level promotion (`produtoVarianteId`), restricting audience to clients with
affinity to the list.

---

## 10. Implementation checklist (ordered — all shipped)

1. **Schema/enums**: pgEnum + Zod enum value; `gatilhoPromocaoDataReferencia` +
   `gatilhoPromocaoProdutos` columns; `CampaignPromotionProductSchema` + type; migration
   (`ALTER TYPE` + 2 columns).
2. **Validation**: `validateProductPromotionCampaign` (+ async product ownership check), wire into
   campaign create/update routes; frequency-interval exemption.
3. **Variables/metadata**: `PROMOCAO` context group, 3 variables, trigger context map, example
   values; `TInteractionContextMetadados` fields; `buildContextVariablesMap` mapping.
4. **Suggestion lib**: `lib/campaigns/promotion-suggestion.ts` — batch loader + pure ranking
   function.
5. **Cron**: extend `process-single-use-campaigns` (query, product load, per-chunk resolution,
   `metadadosByClientId` in `enqueueCampaignChunk`).
6. **Builder UI**: registry entries, defaults patch, inline config with spreadsheet products table,
   state-hook updaters, detail/summary views, label maps.
7. **Test path**: `/api/campaigns/test` support + unit tests for the ranking core.
