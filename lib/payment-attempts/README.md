# Payment attempts (terminal SmartPOS)

Tentativas de pagamento executadas pelo RecompraCRM POS (Android) em terminais SmartPOS. Modelo,
máquina de estados, contratos e decisões vivem no repositório do app:
`recompracrm-pos-android/docs/03-tentativa-de-pagamento.md`, `04-contratos-http.md`,
`05-persistencia-backend.md`, `07-seguranca-e-observabilidade.md`.

## O que existe (marco 1, Fluxo B — backend)

| Arquivo | Papel |
| --- | --- |
| `state-machine.ts` | Transições monotônicas, resolução de evidência (`TRANSITION`/`NOOP`/`CONFLICT`), `nextAction`. Puro. |
| `evidence.ts` | Sanitização allowlisted da evidência, PAN só mascarado, fingerprint canônico, validação de aprovação. Puro. |
| `create-assigned.ts` | Cria a tentativa `CRIADA` atribuída a um dispositivo, dentro da transação de confirmação da venda, vinculada à transação financeira pendente. Também expõe `findActivePaymentAttemptForSale` (policy: uma ativa por venda) e `findAssignablePaymentTerminalDevice`. |
| `report-evidence.ts` | Recebe a evidência do terminal: lock + idempotência por `Idempotency-Key` + CAS por `versao` + evento; no caminho aprovado tenta consumir. |
| `consume.ts` | Efetiva a transação financeira pendente e marca a tentativa `CONSUMIDA` na mesma transação PostgreSQL; falha preserva a aprovação. |
| `cancel-from-platform.ts` | Cancelamento pela plataforma, somente em `CRIADA`, via CAS. |
| `views.ts` | Projeções da API (`attempt`, `sale`, `command`, `nextAction`). |
| `api.ts` | `paymentTerminalApiHandler` — envelope `{ error: { code, message, retryable, attemptId } }`. |

Rotas: `app/api/payment-terminal/charges`, `payment-attempts/[id]`, `payment-attempts/[id]/outcome`.
Autenticação: `authenticateExternalRequest` + `requireExternalScope` (`payment-terminal:*`), cliente
nativo `RECOMPRA_PAYMENT_TERMINAL` (categoria `TERMINAL_PAGAMENTO`).

## Invariantes que este módulo garante

- O terminal nunca escolhe o status: envia `tipo` da evidência; o backend deriva a transição.
- Evidência repetida é no-op (evento `EVIDENCIA_REPETIDA`); conflitante é `409` + evento
  `EVIDENCIA_CONFLITANTE`; concorrente perde no CAS e recebe `409`.
- Aprovação com valor, parcelas, `order_id` ou código de resposta divergentes vira
  `RESULTADO_INCERTO` + `422 PAYMENT_RESULT_MISMATCH` — bloqueia nova cobrança, exige conciliação.
- Consumo e efetivação acontecem na mesma transação; `financial_transactions.tentativa_pagamento_id`
  (unique) é a defesa definitiva contra duplo consumo.
- Nenhuma chamada externa dentro de transação PostgreSQL.

## Deploy

1. `npm run db:push` (novas tabelas `ampmais_payment_attempts`, `ampmais_payment_attempt_events`,
   coluna `tentativa_pagamento_id` em `ampmais_financial_transactions`, cinco `pgEnum`).
2. `npm run seed:access-clients` (cliente nativo `RECOMPRA_PAYMENT_TERMINAL`).

## Fluxo B na plataforma (P6–P9, P11)

- `assignment.ts` valida a regra do MVP (um único cartão cobrindo o total) e
  `processSaleConfirmationInTransaction` cria a tentativa atribuída na mesma transação da venda.
- PDV web: `app/api/pos/payment-terminals` (maquininhas com `online` por heartbeat) e
  `app/api/pos/sales/payment-attempt` (status por venda, pendências, CANCELAR/REATRIBUIR).
- Edição de venda confirmada é bloqueada com tentativa aberta; cancelar a venda cancela a
  tentativa em `CRIADA` e é recusado a partir de `PROCESSANDO`.
- Sessão de caixa (`lib/sales-sessions/payment-terminal-pendencies.ts`): cobrança em andamento
  bloqueia o fechamento; incerta e não aprovada com pagamento pendente aparecem como aviso; o
  resumo por método expõe `pendenteEfetivacao`.
- Admin: `/admin-dashboard/payment-attempts` lista o que exige atenção e permite retomar a
  efetivação de aprovações pendentes.

## Runbook: "cobrou, mas não efetivou"

Sintoma: o terminal mostrou aprovação, a venda continua com pagamento pendente.

1. Abra `/admin-dashboard/payment-attempts`. A tentativa aparece em **APROVADAS SEM EFETIVAÇÃO**
   (`APROVADA_EFETIVACAO_PENDENTE`) ou **INCERTAS** (`RESULTADO_INCERTO`).
2. **Aprovada sem efetivação**: clique em RETOMAR EFETIVAÇÃO. É `consumeApprovedPaymentAttempt`:
   idempotente, nunca reabre a adquirente. Se falhar de novo, o erro da linha diz por quê —
   quase sempre a transação pendente foi efetivada por outro meio ou perdeu o vínculo
   (`PAYMENT_ATTEMPT_INVALID_TRANSITION`) ou valor/método divergem (`PAYMENT_RESULT_MISMATCH`).
   Nesses casos a aprovação da adquirente é real: concilie manualmente no financeiro da
   organização (efetivar a transação correta com a referência ITK/ATK da linha) e registre o
   caso. Não há ação automática para isso de propósito.
3. **Resultado incerto**: a adquirente pode ter cobrado. Peça ao lojista o comprovante do
   terminal ou consulte o portal da adquirente pelo `order_id`/ITK/ATK da linha. Confirmada a
   aprovação, trate como o item 2 (conciliação manual). Confirmada a recusa, a venda segue com
   pagamento pendente: o lojista troca o método ou cancela a venda pelo PDV. Enquanto a linha
   estiver incerta, **nenhuma nova cobrança** deve ser feita para a mesma venda.
4. **Processando acima do SLA** (5 min sem outcome): o terminal iniciou e não reportou. O
   próprio app recupera pelo journal ao reabrir; se não voltar, trate como incerta.
5. Revogar o principal do terminal (Configurações > Dispositivos) impede novos comandos sem
   apagar o histórico.

## Pendente

P10 (emissão fiscal automática para vendas com cobrança em terminal: decisão de produto), P12
(testes com Postgres: efetivação exatamente uma vez sob concorrência, rollback preservando
aprovação, corrida cancelamento × outcome) e o contrato de reconciliação
(`POST /payment-attempts/{id}/reconciliation-outcome`) que tornaria o item 3 do runbook uma ação.
