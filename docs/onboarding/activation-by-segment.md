# Activation by segment: phase 1 report

Status: investigation of 22/11/2026, on master `d59c3bf`. No code changed. It builds on
`revenue-centric-activation-analysis.md` (21/11) and keeps the product plan's state-honesty rules: never
"tudo pronto", never promise revenue, never send without explicit release. Messaging to the merchant stays
in Control ("RecompraCRM decides the state; Control decides the conversation").

Playbook references (heliocosta-dev/revenue-centric-design): *Map the whole journey to value, then fix the
biggest drop* · *Never ship a blank dashboard* · *Calibrate the first step* (started-progress) · *Celebrate
the activation moment* · *Tie the trial's end to value consumed* · *Add declarative friction, cut
administrative friction* · *Architect for what users fear losing* · *Measure activation, not signups*.

## 0. Summary

1. **"Activation" splits into five behaviours, and the 21/11 "never sent a campaign" group is mostly not a
   CRM failure.** 6 of its 11 orgs are ERP-only stores, whose value is selling through their channel, and 4
   more never got a single sale into the system.
2. **Each segment stalls in a different place.** Integration stores have data on day 0 and stall on the
   channel (first delivery after about three weeks), then on continuity (4 of the 7 that sent have stopped).
   Counter (POI) stores stall **before their first counter sale** (median day 30), but 4 of the 5 that started
   registering still do it every week. ERP stores sell on day 0–6 and then stop: only 1 of 6 reached a third
   week of sales, and it has stopped since.
3. **Readiness cannot tell the segments apart today, and it misreports two states.**
   - Every org is created with `poiConfiguracao.vendas.registroAtivo = true`, so every org reads as POI.
   - Seven healthy WhatsApp numbers, across six orgs, are past a guessed `dataExpiracao` and read as
     "expired". The already-shipped hub notice uses the same logic.

   These have to be fixed before any activation surface depends on readiness.
4. **For a CRM store with no sales, the real post-onboarding screen is not the hub.** `app/dashboard/page.tsx`
   replaces the hub with `SalesEmptyState`, a generic three-card page that ignores readiness. That is the
   screen POI stores and stores without a data source live on.
5. Proposed order: (1) make readiness truthful → (2) a pure, tested activation model per segment → (3) the hub
   activation block for CRM, which also replaces `SalesEmptyState` → (4) the ERP variant → (5)–(9) the
   WhatsApp CTA, the trial narrative, celebrations, intent/goal and the company stage.

## 1. Method and limits

- Read: `lib/onboarding/*` (readiness, journeys, quality, copy, campaign dependencies), the stage components
  in `app/onboarding/_components`, `onboarding-page.tsx`, `ActivationPanel`, the hub (`dashboard-page.tsx`,
  `_hub/*`), `app/dashboard/page.tsx`, `SalesEmptyState`, subscription status/access, the Meta callback,
  `channel-status.ts` and `lib/control/{lifecycle,sync}.ts`.
- Production: read-only aggregate queries on `RecompraCRM App`. Organizations are identified **only by order
  of creation (#1–#26)**; no names, no writes. Sales origin was inferred from `processamento_origem` +
  `canal`:
  - `INTERNO` with null `canal` = Ponto de Interação (POI);
  - `INTERNO` with `POS`, `COMANDA` or `SHOP` = ERP channel;
  - `EXTERNO` = integration or imported history.
- **Sample:** 26 organizations in total, created Dec/2025–Nov/2026. Only 6 went through the new
  `organization_onboardings` flow; most older ones were assisted (deal, consultoria, trials extended by
  hand). Segment sizes are 2–8 orgs. Read the numbers as direction, not statistics; correlation is not
  cause.

## 2. Segments, by behaviour (not by flag)

The flags can't segment (§4.1), so organizations were classified by where their sales actually come from.

| Segment | Orgs | Who | How sales arrive |
| --- | --- | --- | --- |
| **A. CRM via integration** | 8 (#1, #8, #9, #10, #13, #18, #19, #26) | Bling, Nuvemshop, CardápioWeb, Online Software, SQL views. Five of them have `erp.acesso` from their plan but no ERP sales. | Connector; history imported on connection (97 to 212k sales from before signup). |
| **B. CRM via POI** | 5 (#3, #7, #11, #17, #22) | Counter registration. #22 also brought an imported history. | Ponto de Interação, starting from zero. |
| **C. CRM both** (integration + POI) | 0 observed | `AMBOS` as defined does not occur in practice. #22 (history + counter) is the closest case. | — |
| **D. ERP only** | 6 (#15, #16, #20 MESAS, #21 BALCÃO, #24, #25) | #24 chose the CRM journey but only sells through the PDV. | ERP channel (POS / COMANDA / SHOP). |
| **E. CRM + ERP** | 2 (#2, #5) | #2: iFood integration + PDV, paying, sends campaigns. #5: dormant, paying. | Both. |
| **F. No source yet** | 5 (#4, #6, #12, #14, #23) | Never received a single sale. #6 pays; #12 has 7.6k clients from a spreadsheet and sent once, on day 70. | — |

Recent signups (Oct–Nov): 4 of 7 are D, 2 are CRM (#22 assisted, #26 self-serve), 1 is F. **The new-signup
mix currently leans ERP.**

## 3. Real journey, value moments and where each segment stalls

### A. CRM via integration

| Step | What the data shows |
| --- | --- |
| Connect the system | Day 0 in onboarding. The history import runs in the background. |
| **First value: the base lands, segmented** | Day 0 for all 8 orgs. This is the segment that can see "312 clients cooling" on day 1. |
| WhatsApp official + templates | Templates are already submitted on connect (`auth/callback/route.ts:259`). #26 is on day 6 with no connection, and Control already sent `aviso:whatsapp_pendente`. |
| **Activation: first campaign delivered** | Days 6, 15, 18, 25, 36 and 37 (n=6, median ≈ 3 weeks). |
| **Habit: keeps delivering** | **Only 3 of 7 are delivering today.** #8, #9 and #10 lost their WhatsApp connection (no rows; last delivery in Jul/Apr), and #18 has a healthy number but 0 active campaigns since 23/08. |

Stall: first the channel, then **continuity after the first send**. Without a regression state, "hidden
once activated" would hide exactly these four.

### B. CRM via POI

| Step | What the data shows |
| --- | --- |
| Choose "balcão" | Day 0. |
| **First value: first counter sale with an identified client and cashback credited** | Days 2, 16, 30, 40 and 153 (median day 30). In 4 of the 5 orgs the first 14 days had **zero** counter sales. |
| First campaign delivered | Follows within days of the counter starting (#7: POI on day 30, delivery on day 36; #17: day 40 → 62). |
| **Habit: weekly counter registration** | 4 of 5 have registered in **every week since their first counter sale** (8–9 weeks; #22, the youngest, 3 of 3), and those 4 deliver campaigns and convert. #11, on the QR gateway, stopped in July. |

Stall: **before the first counter sale.** Once B starts, it stays: it is the best-retained segment. The
first step that matters is a habit at the till, not a setting.

### D. ERP (by channel)

| Step | What the data shows |
| --- | --- |
| Channel → products → launch | Journeys finish in 0–2 minutes; one deferred the simulation. |
| **First value: first real sale on the channel** | Days 0–6, all 6 orgs. |
| **Activation: real sales in week 2** | Weeks with sales among the first 8: 7, 2, 2, 1, 1, 1. Only #15 reached 3 or more weeks, and it has stopped since. #25 is 13 days old and still selling; the other four sold in one or two weeks and stopped. |
| CRM bridge | None of the 6 has WhatsApp or campaigns. |

Stall: **week 2.** The launch works and the habit does not form. Control has no ERP milestones or nudges:
`CONTROL_SUCCESS_MILESTONES` is CRM-only, so these stores get no conversation at all.

### E. CRM + ERP

Two orgs. Their value comes through ERP first (sales enter through the PDV, which already makes the PDV a
data source) and CRM second. The surface should run the ERP ladder until ERP is active, then the CRM ladder
with "source" already done.

### F. No source

5 of 26 orgs never received a sale, and 1 of them pays. Because of the POI default, readiness says their
source is "Registro no balcão", the `fonte-dados` stage shows as complete and the
`proximaAcao` "fonte-dados" never fires. Control marked `fonte_dados_definida` for **25 of the 26 orgs**.

### Trial, for context

Of the 22 orgs with a trial, **15 had it extended by hand** (36–268 days). Only 7 ran on the 15-day clock:
the 5 most recent self-serve accounts and 2 older ones. The clock problem from 21/11 is real, but it only affects
self-serve signups, and the team already corrects it by hand.

## 4. What readiness computes, what is wrong, what is missing

### 4.1 Wrong (fix first)

1. **Data source mode.** `app/api/organizations/route.ts:238` creates every org with `registroAtivo: true`,
   and onboarding only sends a value when "balcão" is chosen. As a result, `fonteDados.modo` is `POI` or
   `AMBOS` for everyone. The default itself must stay, because POI registration depends on it
   (`point-of-interaction/new-transaction/route.ts:325`). Readiness should instead derive the mode from the
   journey answer (`respostas.fonteDadosModo`), active integrations and observed POI sales.
2. **WhatsApp number state.** The callback stores `dataExpiracao` as `expires_in`, defaulting to **60 days**
   when Meta omits it. 7 numbers (orgs #1, #3, #7, #13, #17, #18) pass today's health check
   (`metadados.saude = SAUDAVEL`) and are 37–113 days past that date.
   - `resolveWhatsappNumberState` (readiness) reads them as `EXPIRADO`.
   - `getWhatsappChannelStatus` marks step 1 as "Acesso expirado". By its logic, `WhatsappChannelNotice`
     ("O WhatsApp oficial parou num passo") is showing today to the editors of paying, delivering stores.
     I haven't checked this in the browser.
   - The fix is to treat `metadados.saude` as the truth and use the date only when health has never been
     checked.
3. **Campaigns.** `readiness.campanhas` filters on `chave_preset IS NOT NULL`, so an org running manually
   created campaigns (the active ones: #1, #13, #17…) reads as "Nenhuma por enquanto".
4. **`ActivationPanel`**:
   - its own frame (`rounded-xl border bg-card`) instead of `Section`/`Panel`;
   - a floating fixed "Continuar ativação" button;
   - dismissal kept in localStorage;
   - a dump of every campaign's dependencies;
   - not aware of segments.

   It is imported and never rendered. I recommend deleting it and building the block from §5.

### 4.2 Already computed and reusable

- Integrations with status and import progress (`TImportJobProgress`).
- Valid sales and clients; coverage.
- Cashback state and summary.
- Preset campaigns with dependencies and state.
- WhatsApp payment and templates.
- ERP: access, channel, usable products, shop, service points, simulation, launch checklist.
- Journeys with deferred stages; a fixed-priority `proximaAcao`.
- `lib/control/sync.ts → loadSnapshot` already queries first sale, first delivered campaign message, first
  redemption and deliveries in the last 14 days. It should be extracted and shared, not duplicated.

### 4.3 Missing

| Missing fact | Needed for |
| --- | --- |
| Sales by origin (POI / ERP channel / integration), with first date and weeks active | Segment; B and D milestones; ERP week 2 |
| First cashback credited (`ACÚMULO`) | B first value |
| First delivered campaign message, deliveries in the last 14 days, last delivery | Activation and regression for A, B, E |
| First attributed conversion (`campaign_conversions`) | Result and celebration |
| Clients with an RFM segment | A first value |
| All active campaigns, not only presets | Truthful campaign state |
| Activation flags (celebrations seen, block hidden) on the org, not in localStorage | One-time moments across devices |

## 5. Milestones per segment and the hub activation surface

### 5.1 Ladders

One ladder per segment. The first three rungs are already done when the org lands on the hub
(*started-progress*: you start at about 30%, not 0%).

| Segment | Done on arrival | First value | Activation (north star) | Habit | Result |
| --- | --- | --- | --- | --- | --- |
| A | Account, segment, system connected | Base landed and segmented | First campaign message delivered | Deliveries in 3 of the 4 weeks after activation | First attributed repurchase |
| B | Account, segment, counter chosen | First counter sale with cashback credited | First campaign message delivered (precondition: counter used in 2 distinct weeks) | Counter sales and deliveries in 3 of 4 weeks | First attributed repurchase |
| D · BALCÃO | Account, channel, products | First real PDV sale | Real sales in week 2 (days 8–14) | Sales in 3 of the first 4 weeks | — |
| D · CATÁLOGO | Same | First order from a customer through the shop | Orders in week 2 | 3 of 4 weeks | — |
| D · MESAS | Same | First comanda closed | Comandas in week 2 | 3 of 4 weeks | — |
| E | ERP ladder, then CRM ladder with "source" done | | | | |
| F | Account, segment | First sale from any source | (becomes A or B) | | |

The CRM bridge for D (prepare cashback/campaigns, plan §5.7) is offered only after the ERP **habit**,
never before. Offering it earlier spends the attention that week 2 needs.

### 5.2 The block

- **Place:** in `dashboard-page.tsx`, between the greeting and `HeroBand`, replacing `WhatsappChannelNotice`.
  The WhatsApp steps become one possible next action. It does not depend on the active tab, so the
  "one band, three tabs" rule holds.
- **Frame:** `Panel` (= `Section.Root`) with `Panel.Header`:
  - title: "Primeiros passos" during activation, or a regression title (below);
  - hint: "3 de 6".

  The ladder is `Panel.Bleed` with `Panel.Row` per rung (done / current / later; text and icon, never colour
  alone). There is **one primary button**, the next action. Dependency lists are not repeated here: the
  campaigns screen already shows them.
- **Data:** the block owns `useActivationStatus({ enabled })`, from
  `GET /api/organizations/onboarding/activation` (four-part route, under the resource that owns it), with its
  hook in `lib/queries/onboarding.ts`. The service loads facts (§4.3) and calls a pure
  `resolveActivation(facts)` in `lib/onboarding/activation.ts`, tested with node:test. Its output:
  - `segmento`
  - `marcos[]`
  - `proximaAcao`
  - `progresso`
  - `ativado`
  - `regressao`
- **Visibility:**
  - shown while the org is not activated;
  - hidden once activated;
  - **comes back in regression mode with a single action** when something activated breaks:
    - A or B: no delivery in 14 days, or the channel was lost;
    - D: no channel sale in 7 days.

  This is the case of the 4 stopped A orgs. Visible to members with `empresa.editar`, or with the capability
  of the next action (`canAccessDashboardCapability`); `enabled` is false otherwise.
- **Hub rules:** `grid-cols-1` at the base breakpoint; "—" where a fact has no source (for example "valor
  parado"); real numbers only.

Next action per state (draft copy, real numbers only):

| State | Action | Text |
| --- | --- | --- |
| F | Definir de onde vêm as vendas | "Conecte seu sistema ou registre a primeira venda no balcão para sua base começar." |
| A · import running | (no button) | "Sua base está chegando: 126 vendas importadas até agora." |
| A · no channel | Conectar o WhatsApp oficial | "1.284 clientes já estão na sua base. As campanhas preparadas só saem pelo número oficial." |
| A/B · ready | Liberar envios | "“Boas-vindas” está pronta e só começa quando você liberar." |
| A · regression | Revisar campanhas | "Suas campanhas não enviam desde 23/08." |
| B · no counter sale | Registrar a primeira venda no balcão | "O cliente recebe o cashback na hora e entra na sua base." |
| B · week 1 only | Abrir o Ponto de Interação | "12 vendas no balcão na semana passada, nenhuma nesta." |
| D · BALCÃO | Abrir o PDV | "Semana 1: vendas em 3 dias. Semana 2: nenhuma ainda." |
| D · CATÁLOGO | Copiar link da loja | "Mande o link para seus clientes; os pedidos chegam aqui." |
| D · MESAS | Abrir uma comanda | — |

### 5.3 Empty states that point to the filling action

| Where | Today | Per segment |
| --- | --- | --- |
| `app/dashboard/page.tsx` | `SalesEmptyState` replaces the hub for non-ERP orgs with no sales: three generic cards ("Configurar integração" even while importing), a POI link with `filledOperatorPassword=00000`, hard-coded colours | Render the hub. The activation block carries the next action. Retire `SalesEmptyState` there. |
| `hero-band.tsx` | "Nenhuma venda registrada ainda." | B: "…registre a primeira no balcão"; A, importing: "As vendas importadas aparecem aqui"; D: "Abra o PDV para a primeira venda do dia" |
| `relationship-tab.tsx` SegmentMovement | "Nenhum cliente segmentado ainda." | A: "Segmentando sua base…"; B/F: "Os clientes aparecem aqui a partir da primeira venda", with a link |
| CampaignsPanel | "Nenhuma mensagem enviada nos últimos 30 dias." | "3 campanhas preparadas; falta o WhatsApp oficial", or the regression text |

`Panel.Empty` gains an optional action link. Each block still owns its query. The hint copy comes from a
pure `resolveHubEmptyHint(segmento, …)` that reads the cached activation query.

## 6. Items 2–6, per segment

### Item 2: WhatsApp stage (CRM journey; affects A, B and the CRM half of E)

- The footer's primary button reads "Continuar sem conectar", and "Conectar depois" sits next to it as
  secondary. Both skip the stage; the connect button inside the stage looks secondary.
- **Change:** until the number connects, the stage's "Conectar com a Meta" is the only primary action and
  the footer offers only "Conectar depois" (ghost). "Continuar" appears once connected.
- **Optional reorder:** move `whatsapp` to 3rd place, right after `fonte-dados`, so Meta's review runs while
  the merchant sets up cashback and campaigns. This helps A most (data on day 0, channel about three weeks
  later). For B the counter habit matters more than the order.
- Caveat: templates are submitted at connect time. With WhatsApp before campaigns, seeding campaigns has to
  submit their templates when a number is already connected. To verify in Phase 2.

### Item 3: Trial (all segments; commercial decision)

- **Narrative (no contract change):** while the org is not activated, the subscription-status message and
  badge describe the next step, not the clock.
  - A: "Falta o WhatsApp oficial para sua primeira campanha sair."
  - B: "Registre as vendas no balcão para sua base crescer."
  - D: "Sua segunda semana de vendas no PDV."
- **`/subscription`:** a summary of what the store built, framed as loss, with exact numbers.
  - A: clients in the base, prepared campaigns, attributed repurchases.
  - B: counter sales, clients with cashback, active balance in R$.
  - D: PDV sales, products registered.
- **Rule (decision):** 15 of 22 trials were extended by hand. One option is to codify that as an automatic
  extension while the org is not activated **and** the pending step is external (Meta review, payment
  verification), capped at about 30 days from signup. The alternative is to keep it manual and only change
  the narrative.

### Item 4: Celebrations

- **A:** the entry stage opens with the store's own number (dormant clients and their value, from the
  segment distribution already in the hub), only when the coverage rule allows it. Otherwise it stays as
  today.
- **B:** the first counter sale with cashback ("Primeiro cliente com cashback: R$ 5 para a próxima
  visita").
- **D:** the first real sale on the channel.
- **First delivered campaign and first attributed repurchase (A, B, E):** a one-time moment in the activation
  block, stored on the org. Control already receives `primeira_campanha`; the message to the merchant is
  Control's.

### Item 5: Company stage

- Required today: CNPJ (client-side `isValidCNPJ`; the server accepts any string; the column is `NOT
  NULL`), name, segment and terms. Logo, "Endereço da loja online" (slug) and e-mail are also on the form,
  although the server already generates the slug from the name.
- **Cut now, no decision needed:** logo, slug and e-mail in the CRM journey (the slug stays in the ERP
  journey, where the catalog uses it).
- **CNPJ needs a decision.** It is read by fiscal emission, receipts, the Control sync (`cpfCnpj`) and a
  legacy Pages route that uses **the first 4 CNPJ digits as the operator password**
  (`app/api/sales/route.ts:757`; it looks dead, to confirm). Option: optional in onboarding, requested when
  fiscal, Meta or billing needs it. ERP (D, E) will need it before fiscal emission regardless. This is a
  contract and terms question, not a UI one.

### Item 6: Intent, trial goal and recording

- **Intent** (about 30 s, after the segment question): A/B answer "O que mais te incomoda hoje?". The answer
  picks the recommended campaign. D already declares its channel.
- **Goal:**
  - A/B: "Trazer de volta 10 clientes em 14 dias", counted from attributed conversions, shown only after
    activation;
  - D: "Vender pelo PDV em 5 dias desta semana", shown from day 1.

  The goal is stored in `respostas`.
- **PostHog recording:** `instrumentation-client.ts` only calls `posthog.init`. Recording would be enabled
  for `/onboarding` and the Meta screens, with input masking (CNPJ, phone, e-mail). It needs an LGPD
  decision (privacy policy and consent).

## 7. PR slices, ordered by impact on the biggest drops

The biggest drops are ERP week 2 (1 of 6 reached a third week; most recent signups are ERP), POI before the first counter sale (median day
30) together with "no source" (5 of 26), and integration continuity (4 of 7 stopped). All three are reached
by the same surface, and that surface depends on readiness telling the truth.

| # | Slice | Scope | Segments |
| --- | --- | --- | --- |
| 1 | **Truthful readiness** | WhatsApp state from `metadados.saude` (readiness and `channel-status`, which fixes the live hub notice); data-source mode from answer, integrations and observed sales; all active campaigns counted. Pure resolvers with tests. | All |
| 2 | **Activation model** | `lib/onboarding/activation.ts` (segment, ladders, next action, progress, activated, regression) with node:test; a facts loader shared with `lib/control/sync.ts`; GET route and hook. No UI. | All |
| 3 | **Hub activation block (CRM)** | Block in the hub frame; replaces `SalesEmptyState` and the `WhatsappChannelNotice` slot; empty states with actions; `ActivationPanel` deleted. Checked at 1440 and 390 px. | A, B, F, E (CRM half) |
| 4 | **Hub activation (ERP)** | Channel ladders and the week-2 counter; regression after 7 days without a channel sale. No Control event for now. | D, E |
| 5 | **WhatsApp stage CTA** | Until a number connects, "Conectar com a Meta" is the only primary action and the footer offers only "Conectar depois". The stage stays 5th. | A, B |
| 6 | **Trial message and `/subscription` summary** | Status copy by activation state; what the store built, with exact numbers per segment. The trial rule stays manual. | All in trial |
| 7 | **Celebrations** | Entry-stage impact number (A); first counter sale (B); first channel sale (D); first delivery and first repurchase moments. | All |
| 8 | **Intent and trial goal** | Declarative step after the CRM/ERP choice; goal counter. No session recording. | A, B, D |
| 9 | **Leaner company stage** | Logo, slug and e-mail out of the CRM journey. CNPJ stays required. | All |

## 8. Decisions (22/11/2026)

1. **Segments and activation ladders (§5.1):** approved.
2. **Regression mode:** yes. The block comes back, with a single action, when an activated store stops.
3. **WhatsApp stage order:** stays 5th; only the CTA changes. Moving it earlier would put the heaviest step
   (8 Meta screens, a Facebook login and a card) before the only value previews in the journey (cashback and
   ready campaigns), and the weeks are lost after the skip, not inside onboarding. Revisit if stores keep
   skipping it after the CTA change.
4. **Trial rule:** stays manual. Only the message changes (slice 6).
5. **CNPJ:** stays required. Open: confirm the legacy route that uses the first 4 CNPJ digits as the
   operator password (`app/api/sales/route.ts:757`) is dead.
6. **Session recording:** left out. At about 2 signups a month replays would take months, the Meta screens
   open in Meta's window, and the stage events, `organization_onboardings` and Control milestones already
   show where a store stops.
7. **ERP stall event to Control:** left out for now.

## 9. Implementation status (22/11/2026)

All nine slices are on branch `claude/cool-lovelace-8ncxdp`, in one PR as decided.

| # | Slice | Where |
| --- | --- | --- |
| 1 | Truthful readiness | `lib/whatsapp/meta-access.ts` (health check beats the estimated expiry date), `lib/onboarding/data-source-mode.ts` (counter only when chosen or used; the ERP's PDV is a source), `campanhasManuais` in readiness. Control: `whatsapp_conectado` carries the connection date and is recorded without an event when older than 7 days. |
| 2 | Activation model | `lib/onboarding/activation.ts` (pure, tested), `lib/onboarding/activity.ts` (shared with the Control sync), `GET /api/organizations/onboarding/activation`, `useOnboardingActivation`. |
| 3 | Hub block (CRM) | `app/dashboard/_hub/activation-panel.tsx`, `resolveHubEmptyHints`, `Panel.Empty` with `action`. The hub renders for every org; `ActivationPanel` and the `SalesEmptyState` swap are gone. |
| 4 | Hub block (ERP) | Channel ladders, week-2 step and 7-day regression came with slices 2–3; the launch checklist's comandas link was fixed. |
| 5 | WhatsApp stage CTA | "Conectar com a Meta" is the only primary action until a number connects; the stage stays 5th. |
| 6 | Trial message and paywall | `lib/subscriptions/activation-narrative.ts`: next step instead of the clock before activation; up to three exact counts of what the store built on `/subscription`. The trial rule is unchanged. |
| 7 | Celebrations | First repurchase, first delivery, first counter sale, first ERP channel sale (7 days, closable); entry-stage impact number only with complete coverage (`lib/onboarding/impact.ts`). |
| 8 | Intent and trial goal | `dorPrincipal` and `metaTesteAceita` in the CRM journey answers; recommended campaign first; goal of 5 clients back tracked in the hub after activation; ERP weekly rhythm. |
| 9 | Shorter company stage | Logo, slug and e-mail out of the CRM journey; CNPJ required. |

Not done, by decision: session recording (6), the ERP stall event to Control (7), any change to the trial rule (4) or to CNPJ (5).

## 10. Pricing model and activation (merged 22/11/2026)

The pricing branch (`docs/dev-planning/pricing-model-redesign-plan.md`) replaces tiers with two base
plans (`CRM`, `CRM_ERP`) and two add-ons (`HUB_ATENDIMENTOS`, `CONSULTORIA`). It was merged into this
branch without conflicts; typecheck and every test suite pass on the result.

### Where the two meet, and they agree

| Activation | Pricing | Fit |
| --- | --- | --- |
| Journey picker: CRM or ERP | `FREE-TRIAL` → `CRM`, `FREE-TRIAL-ERP` → `CRM_ERP`, both with `FREE_TRIAL_ADDONS` (the Hub) | The onboarding still sends the same two values; the trial now opens the matching base plan. |
| Second product during the trial (`enableErpTrial`) | Switches the trial to `CRM_ERP` through the resolver | Same entry point; readiness' `erp.testeDisponivel` is unchanged. |
| Segments read `erp.acesso` only together with real ERP use (journey or channel sales) | `erp.acesso` comes from the base plan | A legacy `ESCALA` store that never used the PDV stays in its CRM segment. |
| Trial message and `/subscription` summary (slice 6) | `/subscription` renders the new `PlanPicker`, same `acao` contract | The summary sits above the two base plans and the add-ons. |
| Activation and Control | `assinaturaPlano` now holds `CRM` / `CRM_ERP` | The Control field `plano` receives the new keys. Check that no Control workflow filters on `CRESCIMENTO` or `ESCALA`. |

### Gaps the merge exposed, and how they were closed (22/11)

1. **The suggested base plan follows use, not capability.** Every trial has the ERP unlocked, so
   `erp.acesso` says nothing. For an organization with no live subscription, the add-ons route now
   asks `getSubscriptionPlanSuggestion` (`lib/onboarding/activation-status.ts`). That function reads
   the activation segment, and `resolvePlanSuggestion` (`lib/subscriptions/activation-narrative.ts`)
   turns it into a plan: `ERP` or `CRM_ERP` → `CRM_ERP`, anything else → `CRM`. The picker shows the
   reason under the plan ("Sugerido porque sua loja vende pelo PDV", from the channel with the most
   sales, or "você começou pelo ERP no cadastro"). A subscriber keeps their own plan. If reading the
   use fails, the old `erp.acesso` rule applies, so the plans screen never breaks.
2. **Hub use is shown and preselected.** "Use" means conversations where someone from the store or the
   AI agent replied, counted from the start of the trial (`countHubRepliedChats` in `activity.ts`).
   Incoming customer messages and automated sends don't count. Above zero:
   - it becomes the last of the three items in "O que sua loja já construiu";
   - the route returns it in `adicionaisSugeridos`, with a reason per add-on;
   - `PlanPicker` starts with the Hub checked, with the reason under it and the price in the total.
   The first time the user touches an add-on, their choice wins and the suggestion never overrides
   it. The wording is "Sua equipe já respondeu N conversas pelo Hub", not "no teste", because deal
   stores reach this screen too. On production (read-only), three non-subscribers have replies:
   two deal stores and one trial.
3. **The badge tells trial from paid by where access comes from.** The session's `organizacao` now
   carries `assinaturaEmTeste`, from `isTrialSubscriptionAccess(resolveSubscriptionAccess(...))`
   (`TRIAL` or `TRIAL_GRACE`), the same verdict the subscription banner uses. On production, no
   organization without a Stripe subscription has access other than through a trial, so a stored plan
   on its own never means paying. The admin trial block used the same shortcut ("Organização com
   plano pago — período de teste não se aplica" for every trial). It now reads the Stripe status, so
   the team can see and extend a trial again (decision 4: trial stays manual).
4. **ERP-only stores have no ERP-only plan.** Unchanged and deliberate: the `ERP` segment's only plan
   is `CRM + ERP`, and now the checkout says why it is suggested. This is the context for the "ERP
   price review" left open in the pricing plan.

Fixed in the merge: the deal notice on the company stage printed the raw key (`plano CRM_ERP`); it
now prints the plan name.
