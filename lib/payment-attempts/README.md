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

## Venda nascida no terminal (Fluxo A)

`POST /api/payment-terminal/sales` não tem pipeline próprio: monta o carrinho pelo catálogo do canal
PDV (`terminal-cart-item.ts`, com `resolveCatalogOrderItem` aplicando preço, regras de grupo e preço
das opções), resolve os pagamentos pelo recorte do terminal (`terminal-payments.ts`) e chama as três
etapas de `lib/sales/create-and-confirm-sale.ts` dentro da transação idempotente do dispositivo, com
a maquininha como ator `DEVICE`. Qualquer regra nova do PDV web (cupom, cashback, desconto, entrega)
vale para o terminal no mesmo commit; o que falta para usá-la é o terminal enviar o campo.

Decisões vigentes (2026-10-11): desconto acima do teto é aprovado remotamente por um gestor; o
terminal escolhe um caixa já aberto no RecompraCRM, sem abrir/fechar/sangria; o terminal não emite
nem imprime NFC-e (a emissão automática segue a política da organização, como no PDV web).

### Cliente e benefícios no terminal

- `GET /api/payment-terminal/clients?telefone=` identifica; `POST /api/payment-terminal/clients`
  cadastra (scope `payment-terminal:clients:create`, nome + telefone + aceite de marketing,
  `lib/clients/create-counter-client.ts`). Telefone já cadastrado é `CONFLICT`. O scope novo entra
  no teto do cliente nativo: terminais ativados antes dele precisam ser ativados de novo para
  cadastrar (identificar e vender continuam funcionando).
- `POST /api/payment-terminal/clients/benefits` recebe `{clienteId, itens}` e devolve, sobre o
  carrinho precificado pelo servidor, o cashback (saldo, limite do programa, se pode virar
  desconto e por quê), os cupons avaliados (`lib/coupons/client-cart-coupons.ts`, o mesmo do PDV
  web) e as recompensas. Superfície `POS`: desligar resgates no PDV desliga aqui também.
- A venda recebe `benefits: {cupomId?, cashbackResgate?, recompensas?}`. O servidor decide de novo
  (`terminal-benefits-policy.ts`): o desconto do cupom é o do motor, o cashback respeita
  `getCashbackRedemptionMaximum` sobre o que sobra depois do cupom, recompensa não se combina com
  cupom nem cashback. Nada é ajustado em silêncio: um valor que deixou de valer é recusado com a
  mensagem para o operador. Os pagamentos cobrem o total depois dos benefícios; venda quitada
  pelos benefícios (total zero) vai sem pagamento, e venda só de recompensas vai sem itens.
- Cupom de validação MANUAL aparece na lista, sem poder ser escolhido: a validação é do operador
  e o desconto conta no teto — no terminal, sem teto, viraria aprovação a cada venda.

### Desconto com aprovação remota

- O teto é o do vendedor da venda (membership vinculada); sem vendedor com membership, o do
  dispositivo é zero. `GET /configuration` manda `vendedores[].descontoLimite` e
  `descontoLimitePadrao` (`null` = sem teto) para o app avisar antes de cobrar.
- Acima do teto, o app pede a aprovação: `POST /api/payment-terminal/discount-approvals`
  (`{vendedorId, itens, descontosTotal}`; base e desconto calculados aqui sobre os itens
  precificados) abre uma `VENDA_DESCONTO` na fila da plataforma com o terminal como solicitante
  (`solicitanteDispositivoId`; `solicitanteId` ficou anulável). Dentro do teto responde
  `approval: null`; um pedido pendente idêntico é devolvido em vez de duplicar a fila.
  `GET .../{id}` acompanha (expiração preguiçosa) e `POST .../{id}/cancel` desiste. Tudo no scope
  `payment-terminal:sales:create`: pedir desconto é parte de vender, sem nova ativação.
- A venda leva `sale.descontosTotal` e `sale.descontoAprovacaoId`. Sem aprovação válida a recusa é
  `403 DISCOUNT_APPROVAL_REQUIRED` (não `SCOPE_REQUIRED`). Aprovação pedida pelo terminal só é
  consumida por ele, e a do PDV web só pelo PDV web (`authorizeSaleDiscount`, `deviceId`).
- O desconto vem antes dos benefícios, como no checkout: cupom e cashback abatem o que sobra.

Deploy desta etapa: `npm run db:push` (coluna `solicitante_dispositivo_id`, `solicitante_id` anulável
em `ampmais_action_approval_requests`).

