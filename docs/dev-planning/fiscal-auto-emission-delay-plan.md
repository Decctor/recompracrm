# Emissão fiscal automática — atraso configurável por organização (plano)

Hoje, quando uma venda fica elegível (CONFIRMADA + ENTREGUE + paga, sem documento vivo),
`processSaleAutomaticFiscalEmissionIfEligible` monta o payload e coloca o documento no outbox
(`PRONTO_PARA_ENVIO`, `proximaTentativaEm = now`); o cron `/api/cron/fiscal-queue` (a cada 2 min)
envia ao provedor. A nota sai, na prática, em até 2 minutos após a venda ficar elegível.

Este plano adiciona um **atraso por organização**: depois do gatilho automático, a emissão espera o
tempo configurado antes de acontecer. O transporte da espera é o **Vercel Queues**, já usado em
`ai-chat-turns` e `integration-import-batches`.

## Escopo

1. **Configuração**: `fiscalConfiguracao.emissaoAutomatica.atrasoMinutos` (0 = imediato, comportamento
   atual). UI na página de configuração fiscal, ao lado das exceções por método de pagamento.
2. **Agendamento**: quando o atraso é > 0, o gatilho grava o horário agendado na venda e publica uma
   mensagem com `delaySeconds` no tópico `fiscal-auto-emissions`.
3. **Consumer**: `app/api/queues/fiscal-auto-emission/route.ts` reavalia a elegibilidade **no
   momento da execução** e só então enfileira o documento no outbox (fluxo atual).
4. **Rede de segurança**: o cron `fiscal-queue` executa agendamentos vencidos que a fila não
   entregou (falha no `send`, ambiente local sem fila, mensagem perdida).
5. **Feedback**: PDV/checkout/edição mostram "emissão agendada para HH:mm"; a página da venda mostra
   o agendamento enquanto não existe documento.

Fora de escopo: atraso por canal ou por método de pagamento (o atraso é único por organização);
"emitir agora" dedicado (a emissão manual já existe e cancela o agendamento por construção).

## Decisões de arquitetura

### 1. A espera acontece ANTES do snapshot, não no outbox

A alternativa óbvia seria não usar fila: `enqueueFiscalDocument` gravaria
`proximaTentativaEm = now + atraso` e o cron de 2 minutos faria o resto. **Não fazer isso.**
`enqueueFiscalDocument` chama `prepareFiscalDocumentForSend` na hora, ou seja, o snapshot da venda
(itens, pagamentos, destinatário, frete) é congelado no gatilho. Uma venda corrigida ou cancelada
durante a janela emitiria a nota velha — exatamente o que um atraso existe para evitar.

Com a fila, a mensagem carrega só `{ organizacaoId, vendaId, autorId, agendadaPara }`; o consumer
chama de novo `processSaleAutomaticFiscalEmissionIfEligible`, que reavalia todas as travas
(status, pagamento, documento existente, exceções, override por venda) contra o banco atual e só
então monta o payload. Edição, cancelamento, estorno ou desligamento da emissão automática durante
a janela são respeitados sem código novo.

### 2. Estado do agendamento vive na venda: `sales.emissaoFiscalAgendadaPara`

O gatilho dispara várias vezes para a mesma venda (confirmação, entrega, efetivação de pagamento,
edição confirmada, data-collecting, crédito em loja). Hoje a deduplicação acontece em
`enqueueFiscalDocument` pela `referencia` do documento; com a espera antes do snapshot não há
documento para deduplicar. Precisamos de um marcador.

Opções consideradas:

- **Só `idempotencyKey` da fila.** Sem estado no banco: a UI não consegue mostrar o agendamento, o
  cron não consegue reconciliar, e a janela de deduplicação da Vercel não é documentada — uma venda
  que emite hoje e gera devolução amanhã reutilizaria a chave. Rejeitada.
- **Documento `RASCUNHO` no outbox com coluna `agendadoPara`.** Reaproveita a `referencia`, mas um
  documento vivo antes da hora contamina tudo que lê "existe documento": a trava
  `DOCUMENTO_EXISTENTE`, a listagem da venda, os sinais de `sale-fiscal-signals`, o digest de
  pendências. Muito raio de ação para um marcador. Rejeitada.
- **Coluna na venda** (`emissao_fiscal_agendada_para timestamp null`). Só o gatilho, o consumer, o
  cron e a página da venda leem. Mesmo lugar do override tri-state `emissaoFiscalAutomatica`.
  **Escolhida.**

Regra: agendamento vigente = coluna não nula. O gatilho não publica de novo enquanto houver
agendamento vigente (devolve `AGENDADO` com o horário existente). O consumer e o cron limpam a
coluna ao executar. A coluna é gerenciada pelo servidor: **não** entra no `SaleSchema` (Zod) nem
nos inputs de create/update — mesmo tratamento de `bloqueadoEm` no outbox.

Chave de idempotência da mensagem: `fiscal-auto-emission-${vendaId}-${agendadaPara.getTime()}`.
Um novo agendamento (depois de a coluna ter sido limpa) gera chave nova.

### 3. Vercel Queues é o caminho principal; o cron é o reconciliador

`delaySeconds` aceita até 7 dias (limitado ao `retentionSeconds`, também máximo 7 dias). A entrega
é at-least-once, sem ordem. Ambos são inócuos: o consumer confere `emissaoFiscalAgendadaPara ===
agendadaPara` da mensagem antes de agir (mensagem velha ou repetida recua), e o lock de envio
(`bloqueadoEm` → 409) já protege contra dois processos emitindo o mesmo documento.

O que a fila não cobre: `send` falhando (rede, credenciais ausentes em `next dev`), mensagem
descartada após as retentativas, ou TTL. Para isso, `processFiscalQueueUnlocked` ganha um terceiro
passo: vendas com `emissaoFiscalAgendadaPara <= now - 5 min` (graça para a fila entregar primeiro)
executam pelo mesmo caminho do consumer. Com isso o comportamento local sem fila é "atraso + até
2 min", e produção é "atraso exato".

Consequência honesta: tecnicamente o cron sozinho bastaria (granularidade de 2 minutos). A fila
entra pela precisão e por não varrer a tabela de vendas a cada ciclo como caminho principal — e por
ser o padrão pedido. Se um dia a fila for removida, nada quebra: o cron assume.

### 4. `atrasoMinutos` na configuração fiscal (jsonb), sem DDL nas organizações

Entra em `OrganizationFiscalConfigSchema.emissaoAutomatica`, ao lado de `excecoes`:

```ts
atrasoMinutos: z
  .number({ invalid_type_error: "Tipo não válido para o atraso da emissão automática." })
  .int()
  .min(0)
  .max(AUTO_EMISSION_MAX_DELAY_MINUTES) // 10080 = 7 dias, teto da fila
  .default(0),
```

Nome segue o precedente de `prazoMinutos`/`preparoMinutos` em `schemas/shop.ts`. Default 0 mantém
o comportamento atual para toda a base sem backfill. `normalizeFiscalConfig` no state hook já
espalha `existingConfig.emissaoAutomatica`, então a chave nova entra sem mudança ali.

### 5. O atraso vale para TODA emissão automática, override por venda incluído

`sales.emissaoFiscalAutomatica = true` decide **se** emite, não **quando**. Manter uma única regra
de tempo evita uma segunda tabela de decisão. A emissão manual (`origem: "MANUAL"`) não passa por
`processSaleAutomaticFiscalEmissionIfEligible` e continua imediata — e é, na prática, o "emitir
agora": quando o consumer rodar, encontra documento vivo e recua (`DOCUMENTO_EXISTENTE`).

### 6. Política pura e testável em `lib/fiscal/auto-emission-delay.ts`

```ts
export function resolveAutoEmissionSchedule({ atrasoMinutos, agendadaPara, now }):
  | { acao: "EMITIR" }
  | { acao: "AGENDAR"; agendadaPara: Date }
  | { acao: "JA_AGENDADA"; agendadaPara: Date };
```

Sem banco, sem fila — mesmo padrão de `resolveAutoEmissionException`. Teste em
`auto-emission-delay.test.ts` (node --test, como os demais em `lib/fiscal`).

## Fluxo

```
gatilho (confirm/entrega/pagamento/edição/data-collecting)
  └─ processSaleAutomaticFiscalEmissionIfEligible({ organization, saleId, authorId, modo: "GATILHO" })
       ├─ travas atuais (desativada, exceções, elegibilidade, documento existente, canal gerenciado)
       ├─ resolveAutoEmissionSchedule
       │    ├─ EMITIR       → enqueueFiscalDocument (fluxo atual) → { status: "SOLICITADO" }
       │    ├─ JA_AGENDADA  → { status: "AGENDADO", agendadaPara }
       │    └─ AGENDAR      → update sales.emissaoFiscalAgendadaPara
       │                      send("fiscal-auto-emissions", msg, { delaySeconds, retentionSeconds, idempotencyKey })
       │                      (send falhou → log; a coluna fica e o cron executa)
       │                      → { status: "AGENDADO", agendadaPara }
       └─ ...
consumer /api/queues/fiscal-auto-emission  ──┐
cron fiscal-queue (agendamentos vencidos) ───┴─ executeScheduledAutoEmission({ organizacaoId, vendaId, autorId, agendadaPara })
       ├─ venda.emissaoFiscalAgendadaPara !== agendadaPara → recua (mensagem velha/duplicada)
       ├─ limpa a coluna (UPDATE ... WHERE emissao_fiscal_agendada_para = agendadaPara RETURNING) → 0 linhas = outro processo já executou
       └─ processSaleAutomaticFiscalEmissionIfEligible({ ..., modo: "EXECUTAR_AGENDAMENTO" })
            (mesmas travas; resolveAutoEmissionSchedule é pulada; ERRO já notifica por e-mail)
```

O `UPDATE ... RETURNING` condicional é o claim: consumer e cron podem rodar juntos e só um segue.
Se ainda assim os dois chegarem em `emitFiscalDocument`, o lock `bloqueadoEm` resolve.

Ordem no consumer: claim antes de emitir. Se a emissão falhar, o resultado é `ERRO` (retornado, não
lançado) e o e-mail já sai por `notifyFiscalEmissionFailure`; não reagendamos — a venda fica visível
como "erro fiscal" e a emissão manual/retentativa segue o fluxo existente. Exceção que escapa
(banco fora) → o `handleCallback` retenta (3 entregas, 60 s) e, esgotado, reconhece; se a coluna
não foi limpa, o cron pega.

## Mudanças por arquivo

### Banco

- `services/drizzle/schema/sales.ts`: `emissaoFiscalAgendadaPara: timestamp("emissao_fiscal_agendada_para")`
  + índice parcial `where emissao_fiscal_agendada_para is not null` (a varredura do cron é
  `organizacao_id`-agnóstica e a tabela é grande).
- `npm run db:generate` → migration em `drizzle/`.

### Schemas

- `schemas/fiscal.ts`: `emissaoAutomatica.atrasoMinutos` (acima). Ajustar o `.default(...)` do
  objeto pai para incluir `atrasoMinutos: 0`.
- `lib/fiscal/constants.ts`: `AUTO_EMISSION_MAX_DELAY_MINUTES = 7 * 24 * 60`.

### Política e fila

- `lib/fiscal/auto-emission-delay.ts` + `.test.ts`: `resolveAutoEmissionSchedule`.
- `lib/fiscal/auto-emission-queue.ts`: `FISCAL_AUTO_EMISSION_TOPIC = "fiscal-auto-emissions"`,
  `sendScheduledAutoEmissionToQueue(payload, { delaySeconds })` no molde de `ai-turn-queue.ts`
  (`retentionSeconds = delaySeconds + 24h`, capado em 604 800).
- `lib/sales/sale-processing/process-sale-automatic-fiscal-emission.ts`:
  - novo parâmetro `modo?: "GATILHO" | "EXECUTAR_AGENDAMENTO"` (default `GATILHO`);
  - após as travas e antes de `enqueueFiscalDocument`, o bloco de agendamento;
  - novo retorno `{ status: "AGENDADO", agendadaPara: Date }`;
  - `select` da venda passa a incluir `emissaoFiscalAgendadaPara`.
- `lib/sales/sale-processing/execute-scheduled-auto-emission.ts`:
  `executeScheduledAutoEmission` (claim + delegação), usado por consumer e cron. Exportar em
  `sale-processing/index.ts`.
- `app/api/queues/fiscal-auto-emission/route.ts`: `handleCallback` + Zod da mensagem
  (`agendadaPara` como ISO string → Date), `runtime = "nodejs"`, `maxDuration = 300`, retry como os
  outros consumers.
- `vercel.json`: `experimentalTriggers` para a rota nova (`retryAfterSeconds: 60`).
- `lib/fiscal/worker.ts`: passo 3 em `processFiscalQueueUnlocked` — vendas com agendamento vencido
  há mais de 5 min (limite 25, ordenado por `emissaoFiscalAgendadaPara`), carregando a organização
  uma vez por `organizacaoId`; resultado ganha `agendadosExecutados`.

### Configuração (API e UI)

- `app/api/fiscal/settings/route.ts`: nada além do schema (o `PUT` já parseia
  `OrganizationFiscalConfigSchema`). Em `lib/fiscal/settings.ts`, nenhuma validação extra: o Zod já
  limita o intervalo.
- `app/dashboard/fiscal/_module/configuration/components/auto-emission-delay-settings.tsx`: bloco
  "ATRASO DA EMISSÃO AUTOMÁTICA" com presets (Imediato, 15 min, 30 min, 1 h, 2 h, 24 h) e campo em
  minutos para valor livre; texto explicando que a venda pode ser corrigida ou cancelada na janela e
  que a emissão manual continua imediata. Props `fiscalConfig`/`updateFiscalConfig`, como
  `AutoEmissionPaymentMethodExceptions`.
- `fiscal-configuration-view.tsx`: renderizar o bloco novo dentro do `if
  (state.fiscalEmissaoAutomatica)`, acima das exceções.

### Feedback ao operador

- `SaleSuccessPanel.tsx`, `new-sale-page.tsx`, `checkout-page.tsx`, `edit-sale-page.tsx`: ramo
  `status === "AGENDADO"` → "Emissão fiscal agendada para {formatDateTimeInOperationTimezone}".
  O tipo do resultado muda, então o `tsc` aponta os pontos.
- `sale-by-id-page.tsx`: quando `emissaoFiscalAgendadaPara` não é nulo e não há documento vivo,
  linha "Emissão automática agendada para …" no bloco fiscal. Conferir que o GET da venda por id
  devolve a coluna (o `db.query.sales.findFirst` sem `columns` já devolve).
- `scripts/diagnose-sale-fiscal-emission.ts`: imprimir `atrasoMinutos` da org e
  `emissao_fiscal_agendada_para` da venda.

### Testes

- `lib/fiscal/auto-emission-delay.test.ts`: atraso 0 → EMITIR; atraso > 0 sem agendamento →
  AGENDAR com `now + atraso`; agendamento vigente → JA_AGENDADA com a data existente; teto.
- Script `test:fiscal-auto-emission` em `package.json` cobrindo `auto-emission-policy.test.ts` e o
  novo (hoje `auto-emission-policy.test.ts` não está em nenhum script).
- Manual (homologação): venda com atraso de 2 min → editar item dentro da janela → nota sai com o
  item novo; cancelar dentro da janela → nada emite e a coluna é limpa; emitir manualmente dentro
  da janela → nota imediata e o consumer recua; desligar a fila (env local) → cron executa.

## Casos de borda (decididos)

| Situação na janela                                  | Resultado                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| Venda editada (itens/total)                         | Nota sai com o estado no momento da execução; gatilho da edição não duplica |
| Venda cancelada                                     | Consumer recua (`VENDA_NAO_ELEGIVEL`), coluna limpa, nada emite            |
| Pagamento estornado e refeito                       | Recua na execução; ao voltar a ficar paga, agenda de novo (atraso inteiro) |
| Emissão manual                                      | Imediata; consumer encontra documento vivo e recua                         |
| Org muda `atrasoMinutos`                            | Agendamentos em voo mantêm o horário original                              |
| Org desliga a emissão automática                    | Consumer recua (`EMISSAO_AUTOMATICA_DESATIVADA`)                            |
| `send` falha (rede / `next dev` sem fila)           | Coluna fica; cron executa até 2 min após `agendadaPara + 5 min`            |
| Mensagem entregue duas vezes / fora de ordem        | Claim por `UPDATE ... WHERE = agendadaPara` deixa passar uma só            |
| Consumer e cron simultâneos                         | Claim decide; em último caso, lock `bloqueadoEm` (409)                     |

## Fases de implementação

1. **Schema + política** — coluna na venda, `atrasoMinutos`, `resolveAutoEmissionSchedule` com
   teste, constante de teto. Sem mudança de comportamento (default 0).
2. **Agendamento + execução** — bloco em `processSaleAutomaticFiscalEmissionIfEligible`,
   `executeScheduledAutoEmission`, producer, consumer, `vercel.json`, passo do cron. Deploy
   verificável em homologação com atraso curto.
3. **Configuração** — bloco de UI e texto.
4. **Feedback** — PDV/checkout/edição/página da venda e script de diagnóstico.

Cada fase é um commit (`feat:`) e o sistema fica consistente entre elas.

## Perguntas em aberto

- Presets e teto exibido na UI: sugestão de teto prático de **24 h** na interface, mantendo 7 dias
  no schema. Confirmar.
- O atraso deve aparecer no preview do PDV ("esta venda emitirá em X min")? Fica fora do v1 salvo
  pedido.
