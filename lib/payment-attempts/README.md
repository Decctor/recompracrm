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

## Pendente (ver `recompracrm-pos-android/docs/11-pendencias-recompracrm.md`)

P6 (confirmação da venda com dispositivo atribuído chamando `createAssignedPaymentAttempt`),
P7 (PDV web: dispositivos ativos, atribuição, polling, ações de saída usando
`cancelPaymentAttemptFromPlatform`), P8 (bloqueio de edição com `findActivePaymentAttemptForSale`),
P9 (sessão de caixa), P11 (listagem administrativa), P12 (testes com Postgres: concorrência,
replay, rollback).
