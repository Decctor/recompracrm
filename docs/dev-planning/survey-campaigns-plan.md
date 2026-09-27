# Survey campaigns (`PESQUISA`) — Design & implementation plan

> Status: proposta · Última atualização: 2026-09-27

A **survey campaign** sends a WhatsApp template whose quick-reply buttons are the answer options of
a question. Each tap is written to a **custom field** of the client, so the answer becomes a
segmentable attribute of the base: "which new flavour would you like?" today, "the flavour you
voted for is out" next month, sent only to the clients who picked it.

Three building blocks already exist and are reused whole: the custom-field model (choice fields
with options and a single write point), the campaign dispatch pipeline (scheduled one-shot
campaigns, recipients outbox, interactions) and the message-template model (quick-reply buttons
already round-trip to Meta). What is missing is the glue: a typed link between a template button
and a field option, a per-send payload so the reply routes itself, a capture path in the inbound
webhooks that does not depend on the chat hub, and an audience filter over custom fields.

---

## 0. What exists today (audit)

| Area | State | Gap for surveys |
| --- | --- | --- |
| Template buttons (`schemas/message-templates.ts`) | `RESPOSTA RÁPIDA` exists, is submitted to Meta as `QUICK_REPLY` and imported back from Meta. | At send time `buildButtonSendComponents` (`lib/message-templates/channels/whatsapp/send-payload.ts`) only emits `URL_PRESET` components; quick replies carry no payload, so a tap is only identifiable by its text. |
| Inbound tap (`lib/whatsapp/parsing.ts`) | Meta `button` / `interactive` messages are parsed into `{ text, payload }` and `context.quotedWhatsappMessageId` (the wamid of the template message) is kept. | The tap is persisted only as `metadados.whatsappButton` on a chat message, **after the `hubAtendimentos` gate** in `lib/whatsapp/webhook-processing.ts`. A CRM-only organization loses the tap entirely. |
| Internal gateway inbound (`lib/whatsapp/gateway-webhook-processing.ts`) | `message.received` carries only `content.text`. Confirmed: the gateway cannot echo a button id. | Gateway replies are text-matched (§6.3), by design. |
| Outbound correlation | `interactions.metadados.whatsappMessageId` stores the wamid; `applyProviderStatusUpdate` already resolves an interaction from a wamid. | Nothing links an inbound message back to the interaction it answers. |
| Custom fields (`lib/custom-fields/values.ts`) | Choice fields (`ESCOLHA_UNICA` / `ESCOLHA_MULTIPLA`) with `opcoes[{ valor, titulo }]`; `saveClientCustomFieldValues` is the single write point with cross-validation; index `(organizacao_id, campo_id)` exists "for segmentation". | No audience filter reads custom-field values yet: `CampaignFilterConditionSchema` knows only `LOCALIZAÇÃO` and `TOP_COMPRADORES_PRODUTO`. |
| Campaign ↔ template coupling | FK `whatsappTemplateId` + `validateTemplateForTrigger` (variables compatible with the trigger) at save. | A template can be edited freely after a campaign points at it; buttons can be reordered, removed or renamed and the campaign would not notice. |
| Scheduled one-shot campaigns | `USO-UNICO` and `PROMOCAO-PRODUTOS` share the clock (`lib/campaigns/dispatch/clock.ts`), expansion, send and results. | A survey is exactly this shape: a date, a time block, an audience, one send. |

---

## 1. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Where the button ↔ option link lives | **On the template button**, as a new typed button `RESPOSTA_PESQUISA { texto, campoId, opcaoValor }`. | Mirrors `URL_PRESET`: a button type the platform understands semantically. The question is the message text and the answers are the buttons, so the template *is* the survey; a campaign only picks it. Validation happens once, at template save. |
| Survey as a trigger or as a property | **New trigger `PESQUISA`** (scheduled one-shot, same clock as `USO-UNICO`) in v1. Capture is **trigger-agnostic** by construction (it keys on the button type and the send payload), so v2 can allow survey templates on event triggers (post-purchase "how was it?") by relaxing one validation. | The product asked for is "a new type of campaign" with its own results view; a new trigger is the established pattern (`PROMOCAO-PRODUTOS`). Building capture on the template keeps that door open at zero cost. |
| How a reply finds its campaign | **Per-send quick-reply payload** (Meta lets each send set `sub_type: "quick_reply"` + `{ type: "payload", payload }`, ≤128 chars). Fallback: `context.quotedWhatsappMessageId` → `interactions.metadados.whatsappMessageId`. | The reply becomes self-routing; no text matching, no guessing which of the client's recent sends it answers. The wamid fallback covers clients on old app versions and any provider that drops the payload. |
| Where responses are stored | **On the outbound interaction**, as `interactions.metadados.pesquisaRespostas[]` (one entry per tap), **and** on the client's custom-field value (through `saveClientCustomFieldValues`). No new table. | Every resolution strategy (§6.1) lands on the send that was answered, and that send is already an `interactions` row that carries delivery state (`ENVIADO → ENTREGUE → LIDO`). "Answered with X at T" is the next thing that happened to that message. The field value is what audiences filter on but it is mutable (a later survey or a manual edit overwrites it); the entries on the interaction are the immutable record the results view aggregates. A separate table would duplicate `campanhaId`/`clienteId`/`interacaoId` for nothing. |
| Capture placement | In **stage 1 of both webhooks** (right after `resolveWhatsappClient`, before the hub gate). | The value of a survey is the field write; it cannot depend on the organization paying for the chat hub. |
| Coupling guard | **Freeze, do not snapshot.** While an active `PESQUISA` campaign references a template, that template's buttons cannot change; while a template with survey buttons is not `ARQUIVADO`, the referenced field options cannot be removed or renamed. The response log snapshots `opcaoTitulo` so history stays readable after the freeze lifts. | A snapshot on the campaign would be a second source of truth for the same buttons. The freeze makes the coupling explicit and visible to the user editing the template ("em uso pela pesquisa X"). |
| Audience filter | **New condition `CAMPO_PERSONALIZADO`** on the filter tree (`{ campoId, operador, valores }`), resolved from `client_custom_field_values`. | General: it also serves fields collected at the point of interaction (gender, has-children…). The "send to who voted X" flow is a one-click audience prefilled with this condition from the results view. |
| Multiple taps | `ESCOLHA_UNICA`: last tap wins on the field; every tap is logged. `ESCOLHA_MULTIPLA`: taps accumulate (set union) on the field. | Matches the field semantics the organization chose when it created the question. |
| AI attendant | A tap consumed as a survey reply **does not start an AI turn**. | The client answered a question, they did not open a conversation. The chat message is still persisted (hub organizations) so the thread shows the answer. |

---

## 2. Data model

### 2.1 Enums

`services/drizzle/schema/enums.ts` — `ALTER TYPE ... ADD VALUE`, non-destructive:

```typescript
export const campaignTriggerTypeEnum = pgEnum("campaign_trigger_type", [
	// ...existing values...
	"PESQUISA",
]);
```

`schemas/enums.ts`: mirror in `CampaignTriggerTypeEnum`. Zod enums for the new filter operator:

```typescript
export const CustomFieldFilterOperatorEnum = z.enum(["IGUAL", "DIFERENTE", "PREENCHIDO", "NAO_PREENCHIDO"]);
export type TCustomFieldFilterOperatorEnum = z.infer<typeof CustomFieldFilterOperatorEnum>;
```

### 2.2 Campaign columns (`services/drizzle/schema/campaigns.ts`)

Following the one-prefix-per-trigger pattern:

```typescript
// specific for "PESQUISA"
gatilhoPesquisaDataReferencia: text("gatilho_pesquisa_data_referencia"), // YYYY-MM-DD in the interactions cron timezone
// Campo que recebe as respostas. Denormalizado do template (todo botão RESPOSTA_PESQUISA aponta
// para o mesmo campo): a validação de salvamento garante a igualdade, e ter a coluna aqui deixa
// a lista/estatísticas/filtros de campanhas responderem "qual pergunta" sem abrir o template.
gatilhoPesquisaCampoId: varchar("gatilho_pesquisa_campo_id", { length: 255 }).references(() => customFields.id, { onDelete: "restrict" }),
```

Time of day keeps coming from `execucaoAgendadaBloco`. `onDelete: "restrict"`: a field with a
survey pointing at it cannot be deleted (the custom-fields route already soft-deactivates; the
FK makes the hard path impossible too).

### 2.3 Template button (`schemas/message-templates.ts`)

New member of the `botoes` discriminated union:

```typescript
z.object({
	tipo: z.literal("RESPOSTA_PESQUISA", { ... }),
	texto: z.string({ ... }),          // what the client reads (≤ 25 chars, Meta limit)
	campoId: z.string({ ... }),        // custom_fields.id (ESCOLHA_UNICA | ESCOLHA_MULTIPLA)
	opcaoValor: z.string({ ... }),     // custom_fields.opcoes[].valor
}),
```

- To Meta (`meta-components.ts`): `{ type: "QUICK_REPLY", text: button.texto }` — identical to
  `RESPOSTA RÁPIDA`. Meta never sees the mapping.
- From Meta (`meta-status.ts` import): still `RESPOSTA RÁPIDA`; the user promotes buttons to
  survey buttons in the editor. Importing cannot guess the field.
- Plain text render (`buildWhatsappPlainContent`, internal gateway, previews): same as a quick
  reply.

### 2.4 Responses on the interaction (`schemas/interactions.ts`)

No new table. `InteractionMetadataSchema` gains one typed key, on the **outbound** interaction the
tap answers:

```typescript
// Respostas a botões de pesquisa (RESPOSTA_PESQUISA) dadas a este envio. Uma entrada por toque, em
// ordem de chegada; a resposta "vigente" é derivada (última para ESCOLHA_UNICA, união para
// ESCOLHA_MULTIPLA) por `resolveSurveyAnswer`, nunca gravada. `opcaoTitulo` é snapshot: o
// resultado continua legível se a opção for renomeada depois que o congelamento (§7) for liberado.
pesquisaRespostas: z
	.array(
		z.object({
			opcaoValor: z.string(),
			opcaoTitulo: z.string(),
			// Como a resposta foi correlacionada: PAYLOAD (Meta, exato), CONTEXTO (wamid citado),
			// TEXTO (gateway: rótulo do botão contra o último envio da pesquisa ao cliente).
			origem: z.enum(["PAYLOAD", "CONTEXTO", "TEXTO"]),
			// wamid da mensagem do cliente: chave de idempotência (a Meta reentrega webhooks).
			whatsappMessageId: z.string().optional().nullable(),
			chatMessageId: z.string().optional().nullable(),
			data: z.string(), // ISO
		}),
	)
	.optional()
	.nullable(),
```

Why the interaction and not a table: every strategy in §6.1 resolves the tap to the send it
answers, and that send is already a row that carries what happened to the message (`statusEnvio`,
`dataEnvio`, `whatsappMessageId`). A reply is the next event on the same message. Everything a
table would index (`campanhaId`, `clienteId`, `interacaoId`, `teste`) is already on the row, and the
campaign stats queries already scan a campaign's interactions through
`idx_interactions_org_campanha_status_data`, which is the same scan the results view needs.

What it costs: appends are a jsonb read-modify-write, so they must be a single atomic `UPDATE`
(§6.1) rather than a select-then-set; and aggregation is over a jsonb array. A survey has thousands
of interactions, not millions, so no extra index in v1; `metadados->>'whatsappMessageId'` lookups
already run without one.

`statusEnvio` stays pure delivery state (the redesign plan §2.6 closed that): "respondida" is
`metadados ? 'pesquisaRespostas'`, not a new enum value.

### 2.5 Filter condition (`schemas/campaigns.ts`)

```typescript
export const CampaignCustomFieldFilterConfigSchema = z.object({
	campoId: z.string({ ... }),
	operador: CustomFieldFilterOperatorEnum,
	// Só para IGUAL / DIFERENTE. Para ESCOLHA_MULTIPLA, IGUAL significa "contém ao menos um".
	valores: z.array(z.string({ ... })).default([]),
});

// CampaignFilterConditionSchema gains:
z.object({ id, tipo: z.literal("CAMPO_PERSONALIZADO"), configuracao: CampaignCustomFieldFilterConfigSchema })
```

Text/number/date operators are out of scope for v1 (choice fields only); the schema leaves room.

---

## 3. Template side

### 3.1 Validation (`lib/message-templates/validation.ts` + route)

Pure checks in `validateMessageTemplateForWhatsapp`:

- all `RESPOSTA_PESQUISA` buttons reference the **same** `campoId` (one question per template);
- no two survey buttons share an `opcaoValor`;
- `opcaoValor.length ≤ 64` (payload budget, §5.1).

DB-backed checks in `app/api/message-templates/route.ts` (create/update), in a new
`lib/message-templates/surveys.ts` `validateSurveyButtons({ organizationId, botoes })`:

- the field exists in the organization, is `ativo`, `entidade = CLIENTE`, and `tipo ∈ {ESCOLHA_UNICA, ESCOLHA_MULTIPLA}`;
- every `opcaoValor` is one of the field's `opcoes[].valor`.

### 3.2 Editor (`components/Modals/MessageTemplates/*`, `components/MessageTemplates/*`)

- Button type picker gains "Resposta de pesquisa". Choosing it asks for the field (dropdown of
  active choice fields, `useCustomFields`) and then the option; `texto` defaults to
  `opcao.titulo` truncated to 25 chars.
- A "Gerar botões a partir do campo" shortcut creates one survey button per option (up to Meta's
  10-button limit; the editor warns when the field has more options than fit).
- `TemplatePreview` renders survey buttons like quick replies with a small "pesquisa" marker.
- When the template is frozen (§7), the buttons block is read-only with the reason.

### 3.3 Trigger context (`lib/message-templates/variables.ts`)

`MESSAGE_TEMPLATE_TRIGGER_CONTEXT_MAP.PESQUISA = ["CLIENTE", "CASHBACK", "CUPOM"]` — same as
`USO-UNICO`.

---

## 4. Campaign side

### 4.1 Zod (`schemas/campaigns.ts`)

```typescript
// Specific for "PESQUISA"
gatilhoPesquisaDataReferencia: z.string({ ... }).optional().nullable(),
gatilhoPesquisaCampoId: z.string({ ... }).optional().nullable(),
```

### 4.2 Validation (`lib/campaigns/validation.ts`)

`validateSurveyCampaign(campaign, organizationId)`, called from `validateCampaignConfiguration`
and `createCampaign`/`updateCampaign` next to `validateProductPromotionCampaign`:

- `gatilhoPesquisaDataReferencia` valid `YYYY-MM-DD` (same check as `USO-UNICO`);
- the template has **≥ 2** `RESPOSTA_PESQUISA` buttons;
- every survey button's `campoId` equals `gatilhoPesquisaCampoId`;
- the field is active and choice-typed (re-checked here: the template may have been saved before
  the field was deactivated);
- `validateCampaignFrequencyInterval` skips `PESQUISA` like it skips `USO-UNICO`.

The rest of the campaign (audience, phone, cashback/coupon on send, attribution) is untouched:
a survey can still hand out a coupon on send.

### 4.3 Scheduling and expansion

- `lib/campaigns/dispatch/clock.ts`: add `and(eq(gatilhoTipo, "PESQUISA"), eq(gatilhoPesquisaDataReferencia, dateKey))` to the scheduled-campaigns query; origin `AGENDADA`.
- `expand.ts`: nothing survey-specific. No frequency cap (one-shot), same pause/contact filters.
- `send.ts` / `deliver.ts`: pass `recipient.id` into the runtime context (§5.1). Everything else
  (interaction row, quota, bonus on send) unchanged.

### 4.4 Builder (`app/dashboard/growth/campaigns/_module/builder/`)

- `helpers/categories.ts`: new category `SURVEY` — label "Pesquisas", tagline "Pergunte e segmente
  pela resposta", triggers `["PESQUISA"]`. Keeping it out of `SCHEDULE` makes the product visible.
- `helpers/triggers.ts`: `TRIGGER_META.PESQUISA` (icon `MessageSquareMore` or `ListChecks`).
- `helpers/trigger-defaults.ts`: null the `gatilhoPesquisa*` pair symmetrically with the others.
- `trigger-inline-config/`: date picker (reuse the `USO-UNICO` one) + field picker. Picking the
  field sets `gatilhoPesquisaCampoId`; a "criar campo" inline action opens the existing
  custom-field modal with `tipo: ESCOLHA_UNICA` preselected.
- `stages/stage-message.tsx`: when the trigger is `PESQUISA`, `compatibleTemplates` is narrowed to
  templates whose survey buttons reference `gatilhoPesquisaCampoId`; the "novo template" action
  pre-fills `NewMessageTemplate` with one survey button per option of the field and the question
  as body placeholder. Templates with survey buttons for another field are shown under "outros" with
  the reason.
- `stages/stage-review.tsx`: card listing the question (field title) and the answers (button →
  option), so the user sees the mapping once before saving.
- `helpers/validation.ts`: client-side mirror of §4.2.

`TestCampaign` sends a real template; taps on a test send are captured against the tester's client
like any other (the interaction is flagged `teste`, so the results view excludes them — see §8).

---

## 5. Send path

### 5.1 Payload (`lib/message-templates/channels/whatsapp/send-payload.ts`)

`TMessageTemplateRuntimeContext` gains `pesquisa?: { destinatarioId: string }`. For each
`RESPOSTA_PESQUISA` button:

```typescript
components.push({
	type: "button",
	sub_type: "quick_reply",
	index: String(index),
	parameters: [{ type: "payload", payload: buildSurveyReplyPayload({ destinatarioId, opcaoValor }) }],
});
```

`TWhatsappTemplateSendParameter` gains `{ type: "payload"; payload: string }`.

Payload format, in `lib/campaigns/surveys/payload.ts`:

```
psq:<dispatchRecipientId>:<opcaoValor>
```

4 + 36 + 1 + ≤64 = ≤105 chars, under Meta's 128. The recipient id resolves campaign, client and
interaction in one row (`campaign_dispatch_recipients`), and the interaction already stores
`dispatchRecipientId` in its metadata. `parseSurveyReplyPayload` returns `null` for anything that
does not match; nothing else in the platform emits `psq:` payloads.

### 5.2 Internal gateway

`parseTemplatePayloadToGatewayContent` (`lib/whatsapp/internal-gateway.ts`) today drops buttons.
Add: survey buttons → `buttons: [{ type: "quick_reply", text, id: payload }]` on the text content,
so the client sees the same buttons. The gateway's inbound webhook does not return the id (§6.3),
but sending the buttons costs nothing and makes the text fallback possible.

---

## 6. Capture path

### 6.1 Module (`lib/campaigns/surveys/capture.ts`)

```typescript
export async function captureSurveyReply(input: {
	organizacaoId: string;
	clienteId: string;
	whatsappMessageId: string;
	buttonText: string;
	buttonPayload: string | null;
	quotedWhatsappMessageId: string | null;
	date: Date;
}): Promise<{ captured: false } | { captured: true; campanhaId: string; campoId: string; opcaoValor: string }>
```

Resolution order, first match wins:

1. **PAYLOAD** — `parseSurveyReplyPayload(buttonPayload)` → recipient row (must belong to
   `organizacaoId` and `clienteId`) → campaign → template button with that `opcaoValor`.
2. **CONTEXTO** — `quotedWhatsappMessageId` → interaction via `metadados->>'whatsappMessageId'`
   (the lookup `applyProviderStatusUpdate` already does) → campaign is `PESQUISA` → survey button
   whose `texto` equals `buttonText`.
3. **TEXTO** (gateway only, see 6.3) — most recent `PESQUISA` recipient `ENVIADA` to this client in
   the last 7 days whose template has a survey button with `texto === buttonText`.

Each strategy ends on the outbound interaction (strategy 1 through the recipient's `interacaoId`,
strategy 2 directly, strategy 3 through the recipient). Then, in one transaction:

- append the entry atomically, guarded by the client's wamid so a Meta redelivery is a no-op:

  ```sql
  UPDATE interactions
  SET metadados = jsonb_set(
        COALESCE(metadados, '{}'::jsonb), '{pesquisaRespostas}',
        COALESCE(metadados->'pesquisaRespostas', '[]'::jsonb) || $entry::jsonb)
  WHERE id = $interacaoId
    AND NOT COALESCE(metadados->'pesquisaRespostas', '[]'::jsonb) @> $probe::jsonb
  RETURNING id
  ```

  where `$probe` is `[{"whatsappMessageId": "<wamid>"}]`. Zero rows returned = duplicate: return
  `captured: true` and skip the field write. One statement, no row lock, safe under two taps
  arriving within milliseconds.
- write the field through `saveClientCustomFieldValues`: `ESCOLHA_UNICA` → `valor = opcaoValor`;
  `ESCOLHA_MULTIPLA` → union of the current array and `opcaoValor` (read the current
  `client_custom_field_values` row `FOR UPDATE` inside the transaction, since the field aggregates
  across surveys);
- if the field is inactive by then, keep the entry and skip the field write (the results view
  still counts it; the audience filter cannot see it, which is what "inactive" means).

Never throws for a non-survey tap: `captured: false` costs one payload parse and, without a
payload, one indexed lookup.

### 6.2 Meta webhook (`lib/whatsapp/webhook-processing.ts`)

Right after `resolveWhatsappClient` (stage 1, before the `hubAtendimentos` gate), when
`incomingMessage.button` is present:

```typescript
const surveyReply = await captureSurveyReply({ ... });
```

Then continue as today. In stage 2, when `surveyReply.captured`:

- `metadados.pesquisaResposta = { campanhaId, campoId, opcaoValor }` on the chat message, so the
  hub can render "Respondeu à pesquisa: Morango";
- skip `dispatchAiTurn` for this message (decision in §1). The 24h window, unread counter and
  pending flag update as usual — a human may still want to reply.

### 6.3 Gateway webhook (`lib/whatsapp/gateway-webhook-processing.ts`)

`message.received` gives text only. Call `captureSurveyReply` with `buttonPayload: null`,
`quotedWhatsappMessageId: null` and `buttonText: content.text.trim()`. Only strategy 3 can match,
and only when the text equals a button label exactly. This is best-effort and documented as such
in the results view ("respostas por texto"). Ask the gateway team whether the reply can carry the
button `id`; when it does, strategy 1 lights up with no change here.

### 6.4 No inbound interaction row

A tap does **not** insert a new `interactions` row; it annotates the outbound one. Campaign
statistics count interactions by `campanhaId`, so an inbound row there would inflate sends. The
client timeline (`/api/clients/context`) already renders the send; it gains a "Respondeu: Morango"
line under it from `pesquisaRespostas`. If the seller-routine primitive later wants an
`ENTRADA`/`CLIENTE` interaction per tap, it can be derived from these entries then.

---

## 7. Coupling guards

The coupling the user is worried about becomes three explicit rules, each enforced at the write
point of the side that changes:

| Change | Guard | Where |
| --- | --- | --- |
| Template buttons edited while an **active** `PESQUISA` campaign references the template | Reject with `"Os botões deste template estão em uso pela pesquisa \"<título>\". Pause a campanha para editá-los."` Only the `botoes` array is frozen; body, header and footer stay editable (a Meta re-approval of the text does not change the mapping). | `app/api/message-templates/route.ts` PUT, helper `assertTemplateButtonsNotFrozen` in `lib/message-templates/surveys.ts` |
| Custom-field option removed or its `valor` changed while a non-archived template has a survey button on it | Reject naming the template(s). Adding options and editing `titulo` / `legenda` / `icone` are allowed (the button's `texto` is its own copy). | `app/api/custom-fields/route.ts` PUT |
| Custom field deactivated while an **active** `PESQUISA` campaign uses it | Reject naming the campaign. | same |
| Campaign activated (`ativo: true`) with a `PESQUISA` trigger | Re-run §4.2 in full (the template may have been edited while the campaign was paused). | `updateCampaign` |

"Active" means `ativo = true` **or** a dispatch in `PENDENTE / RESOLVENDO / ENFILEIRADA / ENVIANDO`.
After the one-shot completes and the campaign auto-deactivates, both template and field become
editable again; late taps still resolve through the payload (`opcaoValor` is in the payload, not
looked up by button index) and each entry keeps its `opcaoTitulo` snapshot.

---

## 8. Results

### 8.1 Route `GET /api/campaigns/surveys/results?campaignId=`

```typescript
{
	data: {
		campanha: { id, titulo, gatilhoPesquisaDataReferencia },
		campo: { id, titulo, tipo, opcoes },
		totais: { enviados, entregues, respondentes, respostas, taxaResposta }, // taxa = respondentes / enviados
		opcoes: [{ valor, titulo, respondentes, percentual }],                  // percentual over respondentes
		porOrigem: { PAYLOAD, CONTEXTO, TEXTO },
		ultimasRespostas: [{ clienteId, clienteNome, opcaoTitulo, dataResposta }],
	},
	message: "Resultados da pesquisa encontrados com sucesso.",
}
```

`enviados`/`entregues` come from the dispatch recipients and interactions the campaign already
has. Responses aggregate over the same rows:

```sql
SELECT r->>'opcaoValor' AS valor, COUNT(DISTINCT i.cliente_id) AS respondentes
FROM interactions i
CROSS JOIN LATERAL jsonb_array_elements(i.metadados->'pesquisaRespostas') AS r
WHERE i.organizacao_id = $org AND i.campanha_id = $campanha
  AND (i.metadados->>'teste') IS DISTINCT FROM 'true'
GROUP BY 1
```

For `ESCOLHA_UNICA` only the last entry per interaction counts (`metadados->'pesquisaRespostas'->-1`
instead of the lateral join), so a client who changed their mind is counted once, on their final
answer. For `ESCOLHA_MULTIPLA` the per-option percentages do not sum to 100. `respondentes` is
`COUNT(DISTINCT cliente_id) FILTER (WHERE metadados ? 'pesquisaRespostas')`.

### 8.2 UI (`app/dashboard/growth/campaigns/_module/detail/`)

- New tab "Respostas" on the campaign detail page, shown only for `PESQUISA`: response-rate stat
  tile, horizontal bar per option, respondents table (client, answer, when), and a per-option
  action **"Criar público"** that opens `NewAudience` with `filtros` pre-filled with one
  `CAMPO_PERSONALIZADO` condition `{ campoId, operador: "IGUAL", valores: [valor] }`.
- `campaign-config-view.tsx`: question + answers block for `PESQUISA`.
- Campaigns list: the survey row shows "N respostas · X%" instead of conversions.

The follow-up bulk send is therefore: results → "Criar público" → save → new `USO-UNICO` campaign
with that audience (or the audience's Meta destination). No new sending machinery.

---

## 9. Audience filter `CAMPO_PERSONALIZADO`

### 9.1 Resolution (`lib/campaigns/filters.ts`)

New branch in `resolveConditionClientIds`. The field type decides the SQL on the jsonb `valor`:

| Field type | `IGUAL` | `DIFERENTE` |
| --- | --- | --- |
| `ESCOLHA_UNICA` | `valor #>> '{}' IN (...)` | `NOT (valor #>> '{}' IN (...))` |
| `ESCOLHA_MULTIPLA` | `valor ?\| array[...]` | `NOT (valor ?\| array[...])` |

`PREENCHIDO` = a row exists for `(campo_id, cliente_id)`; `NAO_PREENCHIDO` = universe minus that
(use the existing `getAllOrganizationClientIds` + restriction, as the `NOT` group does). All
queries carry `organizacaoId` and `clientIdRestriction`, so the POI membership path stays cheap.
Native fields with write-through (`birth-date`, `email`, `cpf-cnpj`) have no rows here and are
excluded from the picker; they are not choice fields anyway.

### 9.2 Editors

Two filter editors exist and both need the condition:

- campaigns: `app/dashboard/growth/campaigns/_module/shared/form/Blocks/Filters.tsx` + `FilterEditors/`;
- audiences: `components/Modals/Internal/Audiences/Blocks/Filters.tsx`.

Add `CustomFieldConditionEditor` (field select → operator → option multi-select) and a
`CustomFieldDetails` summary in each. Folding the two editors into one shared block is worth
doing while touching both, but it is a refactor, not a requirement of this feature.

`previewCampaignAudience` and `/api/audiences/preview` need no change: they call the resolver.

---

## 10. Out of scope for v1 (and what v1 leaves ready)

- **Survey buttons on event triggers** (post-purchase NPS, "did you like it?"): capture already
  keys on the template, so this is a validation relaxation plus the `EVENTO` dispatch path passing
  `recipient.id` into the runtime context.
- **Reward on answer** (coupon/cashback granted when the tap lands, not on send): the capture
  transaction is the natural place; needs `pesquisaRecompensa*` columns and a "thank you" send.
- **Thank-you auto-reply** inside the 24h window the tap opens: `lib/chats/outgoing-message.ts`
  covers the send; needs a text on the campaign.
- **Free-text answers** (`TEXTO` fields): would need "next inbound text within N minutes after a
  survey send" heuristics. Not worth it while buttons exist.
- **Reminder to non-respondents**: a `USO-UNICO` campaign with `CAMPO_PERSONALIZADO / NAO_PREENCHIDO`
  restricted to the survey's recipients already expresses it; a one-click "lembrar quem não
  respondeu" can come later.
- **Response window / closing date**: v1 results are live; late taps still count.

---

## 11. Closed questions

1. **Trigger vs. property.** `PESQUISA` ships as a scheduled one-shot trigger. Capture stays
   trigger-agnostic so post-purchase surveys are a later validation change (§10).
2. **Internal gateway.** The gateway cannot echo a button id; gateway replies are text-matched
   (§6.3) and labelled as such in the results.
3. **AI attendant.** A captured tap does not start an AI turn.
4. **Timeline.** No inbound interaction row; the answer is rendered from the outbound interaction's
   `pesquisaRespostas` (§6.4).
5. **Storage.** Responses live on the outbound interaction's metadata, not in a new table (§2.4).

---

## 12. Implementation checklist (ordered; each step ships alone)

1. **Schema + enums** — `PESQUISA` trigger, `gatilhoPesquisa*` columns, `pesquisaRespostas` on
   `InteractionMetadataSchema`, Zod mirrors, migration.
2. **Template button `RESPOSTA_PESQUISA`** — schema, Meta component mapping, plain render,
   `validateSurveyButtons`, editor + preview. Templates become self-describing surveys even before
   campaigns know about them.
3. **Send payload** — runtime context `pesquisa.destinatarioId`, `payload` parameter type,
   `buildSurveyReplyPayload`/`parseSurveyReplyPayload` with unit tests, gateway buttons.
4. **Capture** — `captureSurveyReply` with the three strategies, the atomic append and the
   `ESCOLHA_MULTIPLA` merge;
   wire into both webhooks in stage 1; chat-message metadata + AI skip in stage 2. Unit tests for
   the resolver on fixtures; one replay test through the archived-webhook path.
5. **Campaign trigger** — validation, clock, builder category/trigger/inline config, message stage
   narrowing + pre-filled template creation, review card, `TRIGGER_CONTEXT_MAP`, MCP draft tools
   pass through `validateCampaignConfiguration` unchanged.
6. **Coupling guards** — template buttons freeze, field option/deactivation guards, re-validation
   on activation. Error messages name the other side.
7. **Audience filter `CAMPO_PERSONALIZADO`** — resolver branch + both editors + summaries.
8. **Results** — route, hook in `lib/queries/campaigns.ts`, "Respostas" tab, "Criar público"
   action, list-row summary, client timeline entry.
9. **Docs** — `docs/whatsapp-template-docs.md` gains the quick-reply payload section; this file
   moves from "proposta" to "implementado" with the gaps found on the way, as the promotion doc did.
