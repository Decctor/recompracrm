# WhatsApp connection: activation design

How a store gets from "no number" to "the official WhatsApp delivers campaigns". The connection
itself happens outside RecompraCRM (Meta Embedded Signup, on the computer, plus the WhatsApp Business
app on the phone), and the store pays Meta directly with a card on its own WhatsApp Business account. We
do not rebill. Both facts shape the screens: we prepare people before they leave, explain what
happened when they return, and verify the payment before the first campaign runs into it.

Decisions (2026-11): the store pays Meta and we never rebill. Most stores already run the number in the
WhatsApp Business app, so coexistence onboarding is the main path. QR (internal gateway) is no longer
offered in onboarding but stays in Settings, because paying organizations use it.

## 1. Before the jump: `WhatsappConnectPreparation`

- **Where is the number?** "In the WhatsApp Business app" leads straight on. "In regular WhatsApp" and
  "a new number" get guidance first, because coexistence only works from the Business app.
- **What to have ready:** the phone with the number, the app at 2.24.17 or later, the Facebook of
  someone with full control of the business portfolio, and a card to add on Meta.
- **The 8 Meta screens, step by step**, marked computer or phone. They are collapsed by default.
- **"Prefer to do it together?"** sends `whatsapp_ajuda_pedida` to Control, and Control opens a CS task.

## 2. The callback never shows JSON

`app/api/integrations/whatsapp/auth/callback/route.ts` always ends in a redirect to the screen the
user started from (`redirectTo` cookie, default Settings). The result travels as query parameters
(`lib/whatsapp/meta-connect.ts`). `WhatsappConnectResultNotice` reads them once, removes them from the
URL and shows:

| Result | Slug | When |
|---|---|---|
| success | `whatsapp=conectado\|reconectado&whatsappNumeros=N` | `reconectado` = only phones that already existed |
| cancelled | `whatsappErro=cancelado` | `access_denied` / `user_denied` from Meta |
| expired | `expirado` | code or token rejected by Meta |
| session | `sessao` | state cookie missing or not matching (CSRF guard) |
| no number | `sem-numero` | WABA without a `CLOUD_API` phone |
| no permission | `sem-permissao` | `whatsapp_business_messaging` not granted on any WABA |
| Meta | `meta` | any other Graph failure |

Every failure also sends `whatsapp_conexao_falhou` to Control, keyed by day.

**Reconnecting never duplicates.** `planWhatsappConnectionUpsert` matches phones by Meta phone ID.
It reuses the organization's existing connection, moves known phones onto it and inserts only new
ones. A send block is cleared only when its reason is an invalid credential.

## 3. Five steps: `resolveWhatsappChannelSteps`

"Connected" is a sequence, not a moment (`lib/whatsapp/channel-activation.ts`, pure and tested):

1. **Number connected.** The token is valid and the health check reaches the phone. A failure asks
   for a reconnect.
2. **Display name approved.** This is `name_status`. Pending review is "in progress": nobody has to do
   anything. Declined or expired links to the WhatsApp Manager.
3. **Payment on Meta.** Verified by a delivered paid message. A `131042` (from the send call or from
   the status webhook) means no payment method, and the step links to Billing Hub. A user's
   "already added" stays "in progress" until a delivery proves it.
4. **Message templates approved.** This step counts per-phone template statuses.
5. **First message delivered.** This is the connection test below, or any delivered campaign.

The next step is the first failed one, otherwise the first pending one, otherwise the first that is
not done. `getWhatsappChannelStatus` (`lib/whatsapp/channel-status.ts`) computes the steps per Meta
phone from the database. The onboarding stage, Settings and the hub notice all read it through
`GET /api/whatsapp-connections/channel-status`.

**Meta fields** come from the health cron and `account_update` webhooks (`connection-health.ts`).
Each is read once and stored in `metadados.meta`:

- `name_status`
- `quality_rating`
- `whatsapp_business_manager_messaging_limit` (portfolio-wide unique recipients per 24 h;
  `messaging_limit_tier` is the deprecated name and is read only as a fallback)

These fields use a request separate from `?fields=status`, and that request never throws. A field Meta
refuses would otherwise fail the status check and email the store to reconnect a working number.

## 4. Payment check: the connection test (`lib/whatsapp/connection-test.ts`)

Meta exposes no reliable "payment method present" field. `primary_funding_id` does not cover credit
lines or OBO, and `health_status` does not list payment errors. The real signal is a charged message:

- After connecting, we submit `recompracrm_teste_conexao` (UTILITY, pt_BR) to the store's own WABA. It
  is infrastructure, not one of the organization's templates.
- Once Meta approves it, the "First message delivered" step offers **Enviar mensagem de teste**. The
  destination is prefilled with the user's own WhatsApp (`users.telefone`), and the connected number
  itself is refused.
- `delivered` / `read` marks the test `ENTREGUE` and the payment `VERIFICADO`. `131042`, from the
  send call or the status webhook, marks it `RECUSADO_PAGAMENTO`, sets the payment to `PENDENTE` and
  sends `whatsapp_pagamento_pendente` to Control.
- Utility templates are charged both inside and outside the service window in Brazil (since
  Oct 2026), so a delivery means Meta was able to charge.

## 5. Where the state surfaces

- **Onboarding** (`WhatsappStage`): before connecting, the preparation step. After connecting, the
  five steps per number, the campaign templates and "Conectar outro número". There is no QR option.
- **Settings → WhatsApp**: the result notice and the Meta card, which opens the preparation step and
  then the five steps. The QR gateway card is unchanged.
- **Dashboard hub** (`_hub/whatsapp-channel-notice.tsx`): a single notice when the next step is the
  store's to take (pending or failed), never while Meta is reviewing. It is shown to members with
  `empresa.editar`, the same audience as the health email.
- **Control events** (`lib/control/notices.ts`, sent with `ref:recompracrm:org_<id>`, never throw):
  `whatsapp_conexao_falhou` (daily), `whatsapp_pagamento_pendente` (per phone per day) and
  `whatsapp_ajuda_pedida` (daily). The workflows that listen to them open CS tasks in Control.
