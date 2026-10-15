# Pagamento parcial em contas de atendimento (Mesas e Comandas)

Demanda: numa conta com várias pessoas, uma vai embora antes e paga a parte dela. Hoje isso não tem
onde ficar: o pagamento só existe no estado do `ClosePane` e só é gravado quando a conta fecha. O
recebimento antecipado precisa ser persistido, entrar no caixa na hora e abater do fechamento.

## Decisões fechadas

- **Por valor, não por itens.** O parcial abate um valor da conta; os itens continuam todos na venda
  rascunho. Fechamento por itens (venda própria para quem saiu) fica fora deste plano.
- **Uma NFC-e só, no fechamento**, cobrindo a conta inteira. O `detPag` traz todos os pagamentos,
  parciais inclusos.
- **Teto do parcial = consumo atual da conta** (líquido dos itens, sem desconto/acréscimo do
  fechamento), descontados os parciais ativos. Se depois o total final ficar abaixo do já pago, o
  fechamento bloqueia e pede estorno.
- **Sem atribuição de cliente.** O parcial guarda só um nome livre opcional ("João") para exibição.
  Cashback continua sendo do cliente da conta, sobre a venda inteira.

## Leitura do estado atual (não alterar o espírito)

- A conta tem **uma** venda rascunho (`ORCAMENTO`, partial unique `idx_sales_tab_rascunho`), criada
  no primeiro pedido. Fechar = confirmar essa venda uma única vez (`lib/tabs/close-tab.ts`).
- No fechamento, `processSaleConfirmationInTransaction` cria o lançamento contábil `VENDA` e o
  provider (`lib/payments/providers/local.ts`) insere uma `financialTransactions` por pagamento (uma
  por parcela no crédito parcelado), carimbadas com o `sessaoVendaId` do fechamento.
- Esperado de gaveta (`compute-session-expected-by-method.ts`) soma `financialTransactions` por
  `sessaoVendaId`, sem olhar status. Estorno nunca reescreve a sessão original: lança uma SAÍDA na
  sessão aberta (`registerRefundCashMovement`).
- Leitores que assumem **um** lançamento `VENDA` por venda: cancelamento
  (`lancamentosContabeis[0]`), emissão fiscal automática (`lancamentosContabeis[0]`), edição e
  reatribuição de cliente (`find(origemTipo === "VENDA")`). Os leitores de pagamento (`detPag` em
  `lib/fiscal/documents.ts`, `get-sale-financial-state.ts`) já achatam todos os lançamentos e já
  ignoram transações `ESTORNADO`/`CANCELADO`.
- Venda de conta não é editável depois de confirmada (`sale-editability.ts`): "edite pela conta".

## Modelo contábil: o lançamento da venda nasce no primeiro recebimento

O dinheiro precisa entrar no caixa **na hora** (a sessão pode fechar antes da conta), e
`financialTransactions.lancamentoContabilId` é NOT NULL. Então o primeiro parcial cria o lançamento
`VENDA` da venda rascunho, com `valor` = soma recebida, e cada parcial seguinte (ou estorno) ajusta
o valor em place e ressincroniza as linhas (`syncAccountingEntryLines`). No fechamento a confirmação
**reaproveita** esse lançamento: valor passa ao total da venda, competência à data de confirmação,
e os pagamentos do restante entram nele.

Por que um lançamento só, e não um por recebimento: mantém o invariante "um lançamento `VENDA` por
venda", e assim cancelamento, emissão automática, reatribuição e conciliação continuam corretos sem
mudança. Ajuste de valor em place já é o padrão da edição de venda confirmada. Custo aceito:
enquanto a conta está aberta, uma venda `ORCAMENTO` tem lançamento, e um parcial recebido às 23h50
de uma conta fechada à 0h20 tem competência no dia do fechamento.

## Modelo de dados (aditivo)

```
ampmais_tab_payments                         -- Drizzle: tabPayments (schema/tabs.ts)
  id varchar(255) PK
  organizacao_id      FK organizations cascade, NOT NULL
  tab_id              FK tabs cascade, NOT NULL
  venda_id            FK sales cascade, NOT NULL        -- a venda rascunho da conta
  lancamento_contabil_id FK accounting_entries set null -- o lançamento VENDA da venda
  transacao_financeira_id FK financial_transactions set null
  sessao_venda_id     FK sales_sessions set null        -- caixa que recebeu
  metodo              payment_method NOT NULL
  valor               double precision NOT NULL
  pagador_nome        text NULL                         -- livre, só exibição
  status              tab_payment_status NOT NULL default 'ATIVO'   -- 'ATIVO' | 'ESTORNADO'
  recebido_por_usuario_id  FK users set null
  data_recebimento    timestamp NOT NULL default now()
  estornado_por_usuario_id FK users set null
  data_estorno        timestamp NULL
  motivo_estorno      text NULL
  data_insercao       timestamp NOT NULL default now()

  idx_tab_payments_tab (tab_id, status)
  idx_tab_payments_sessao (sessao_venda_id)
```

- `tabPaymentStatusEnum` em `schema/enums.ts`; `TabPaymentStatusEnum` em `schemas/enums.ts`.
- Relations: `tabs.pagamentosParciais`, e o inverso para tab, venda, sessão e usuários.
- Um recebimento = um método = uma transação (sem parcelamento, ver abaixo). João pagando metade em
  Pix e metade em dinheiro = dois recebimentos.
- Migração `0132_tab_payments.sql`, aplicada manualmente pelo usuário antes do deploy.

## Recebimento parcial — `POST /api/tabs/payments`

`app/api/tabs/payments/route.ts` (padrão das rotas irmãs `close`/`cancel`).

Input (`TCreateTabPaymentInput`):

```
tabId
payment: CheckoutPaymentSplitSchema.pick({ metodo, valor, contaFinanceiraId, observacoes })
payerName?: string | null      -- vira pagador_nome
sessaoVendaId?: string | null
```

Regras de entrada: método ≠ `CASHBACK`; sempre `efetivacaoTipo: "IMEDIATA"`, sem parcelas (o
parcelado gera transações `PENDENTE` e fiado não é "pagou a parte dele"; ficam no fechamento).

Rota: mesma resolução de caixa do `closeTabService` (obrigatoriedade de `sessoesVenda`,
`resolveActiveSalesSession`, `validateSalesSessionSeller` contra o vendedor da venda rascunho).

Serviço `receiveTabPayment` em `lib/tabs/receive-tab-payment.ts`:

1. `resolvePaymentFinancialAccounts` fora da transação (igual ao fechamento).
2. Na transação: lock da tab `FOR UPDATE`, exige `ABERTA`; lock da venda rascunho `FOR UPDATE`,
   exige existir ("Conta sem consumo lançado."). Com `sessaoVendaId`, lock da sessão `FOR UPDATE`
   e recheck de `ABERTA` dentro da transação, igual ao que a confirmação faz
   (`process-sale-confirmation.ts`): a resolução na rota é só mensagem amigável; sem o lock, um
   caixa fechado entre a rota e o insert recebe uma transação que o snapshot da sessão nunca verá.
3. `recomputeTabDraftSaleTotals` → consumo; `jaPago` = Σ `tab_payments` `ATIVO`. Bloqueia se
   `jaPago + valor > consumo + 0,01` ("O valor supera o saldo da conta: R$ X.").
4. Lançamento: busca o `VENDA` da venda; se não existe, `createAccountingEntry` com as contas padrão
   de vendas da organização, `valor` = valor recebido e título "Conta em aberto · Mesa 4" (ver
   *Módulo financeiro* em Leituras); se existe, `valor += valor` e `syncAccountingEntryLines`.
5. `paymentProvider.processPayments` com esse `lancamentoContabilId` e o `sessaoVendaId`. O provider
   monta o título fixo `Pagamento via {método}{ (obs)} - {saleLabel}` (`providers/local.ts`); não
   mudar o provider: passar `saleLabel = "Parcial · Mesa 4"` e o nome do pagador em `observacoes`,
   resultando em "Pagamento via PIX (João) - Parcial · Mesa 4". Carimbar a transação com
   `modificadoresMetadata.origem = "PAGAMENTO_PARCIAL_CONTA"` (update pelo `transacaoId` retornado;
   o provider não recebe metadados hoje).
6. Insere `tab_payments` e devolve `{ tabPayment, valorPago, valorRestante }`.

## Estorno do parcial — `POST /api/tabs/payments/refund`

Input: `tabPaymentId`, `reason` (obrigatório), `sessaoVendaId`. Só com a conta `ABERTA`; depois do
fechamento o caminho é o cancelamento da venda (abaixo).

**Estorno em dinheiro exige caixa aberto.** `sessaoVendaId` é obrigatório quando o parcial é
`DINHEIRO` (400 "Abra um caixa para estornar um recebimento em dinheiro."). Motivo: o cancelamento
da venda confirmada calcula o dinheiro a devolver somando toda transação `DINHEIRO` com
`dataEfetivacao`, **sem olhar status** (`process-confirmed-sale-cancellation.ts`, `cashEfetivado`).
Um parcial em dinheiro estornado sem SAÍDA correspondente continuaria contando como recebido, e um
cancelamento posterior da venda fechada devolveria esse dinheiro pela segunda vez. Com a SAÍDA
sempre presente, ENTRADA − SAÍDA = 0 e a conta fecha. Demais métodos aceitam `sessaoVendaId` nulo.

1. Lock da tab e do `tab_payments` (`ATIVO`); com sessão, lock da sessão e recheck de `ABERTA`.
2. `tab_payments` → `ESTORNADO` com autor/data/motivo; transação → `provedorStatus: "ESTORNADO"`.
3. Lançamento: `valor -= valor`, `syncAccountingEntryLines`. Quando o estorno zera o último
   parcial, o lançamento fica com `valor = 0` e duas linhas de 0 — `assertAccountingEntryLinesBalanced`
   aceita (exige só ≥ 2 linhas e débito = crédito = valor). Cobrir com teste para que um
   endurecimento futuro dessa asserção não quebre o estorno.
4. Dinheiro: SAÍDA na sessão **aberta** ancorada no mesmo lançamento, com
   `origem = "ESTORNO_PAGAMENTO_PARCIAL"` (mesmo modelo do `registerRefundCashMovement`; a origem
   não pode ser `TROCO`, senão o `detPag` a desconta como troco). Demais métodos: só o status, como
   no cancelamento de venda.

## Fechamento — mudanças em `closeTab` e na confirmação

- `CloseTabInputSchema.pagamentos`: sai o `.min(1)`. O servidor exige pagamento só quando há
  restante.
- Sob o lock: `jaPago` = Σ `ATIVO`. Depois de aplicar desconto/acréscimo:
  - `jaPago > valorTotal + 0,01` → 400 "Os pagamentos parciais superam o total da conta. Estorne um
    recebimento antes de fechar."
  - A soma dos pagamentos precisa bater com `restante = valorTotal − jaPago` (não mais com
    `valorTotal`).
- `processSaleConfirmationInTransaction` ganha dois inputs opcionais:
  - `existingAccountingEntryId` — em vez de `createAccountingEntry`, atualiza o lançamento existente
    (valor = `sale.valorTotal`, título, `dataCompetencia` = confirmação, contas de débito/crédito do
    fechamento) e ressincroniza as linhas.
  - `prepaidAmount` — o troco (`registerSaleChangeTransaction`) é calculado contra
    `sale.valorTotal − prepaidAmount`, não contra o total. Hoje o fechamento de conta exige valor
    exato e nunca gera troco, mas o cálculo precisa estar certo para quando gerar.
- Pagamentos vazios com restante zero: `processPayments` e o troco já são no-op com lista vazia.
- Cashback, baixa de estoque, emissão fiscal: sem mudança. O `detPag` sai com parciais + restante.

## Guardas nos demais fluxos

- **Cancelar pedido** (`cancel-tab-order.ts`): depois do `recomputeTabDraftSaleTotals`, se o novo
  consumo `< jaPago − 0,01` → 400 "O cancelamento deixaria a conta abaixo do valor já recebido
  (R$ X). Estorne um recebimento parcial antes." Helper `assertTabCoversPartialPayments(tx, { tabId,
  consumo })` em `lib/tabs/utils.ts`. Lançar pedido só aumenta; não precisa.
- **Cancelar conta** (`cancel-tab.ts`): bloqueia com parcial `ATIVO` ("Estorne os recebimentos
  parciais antes de cancelar a conta."). O estorno é um ato físico (devolver nota, estornar na
  maquininha) e precisa de confirmação um a um. Com parciais todos estornados, o lançamento fica com
  valor 0 junto da venda `CANCELADA`, preservando a trilha.
- **Transferir conta**: nada; os parciais seguem o `tabId`.
- **Cancelar a venda já fechada** (`process-confirmed-sale-cancellation.ts`): já funciona, porque o
  lançamento é um só com todas as transações (marca tudo estornado, reverte o valor cheio, devolve o
  dinheiro efetivado). Único acréscimo: quando `sale.tabId`, marcar os `tab_payments` da venda como
  `ESTORNADO` para o histórico da conta não mentir.
- **Excluir a venda** (`DELETE /api/sales`): uma venda `CANCELADA` cujos parciais foram todos
  estornados passa na regra de exclusão (lançamentos `VENDA`/`ESTORNO` só com transações
  `ESTORNADO`/`CANCELADO`), e a exclusão apaga os lançamentos; `tab_payments.venda_id` em cascade
  apagaria a trilha que o cancelamento da conta promete preservar. Bloquear: venda com `tab_payments`
  (qualquer status) não é excluível ("A venda possui recebimentos parciais registrados na conta.").

## Leituras

- **`GET /api/tabs`** (lista e `byId`): `valorPago` e `valorRestante` ao lado de `consumoParcial`
  (estendem a entidade, então ficam em português). `byId` traz `pagamentosParciais` (ativos e
  estornados, com método, valor, pagador, quem recebeu, data).
- **QR público da conta**: mostra "Já pago" e "Restante", sem nomes de pagador.
- **Modal da sessão de venda** (`app/api/pos/sales-sessions/route.ts`): a lista de movimentos exclui
  ENTRADA de `VENDA` porque a venda aparece na lista de vendas do turno. Um parcial recebido numa
  sessão e fechado em outra ficaria invisível. Incluir transações `PAGAMENTO_PARCIAL_CONTA` quando a
  venda não foi confirmada nesta sessão ("Recebimento parcial · Mesa 4"). O esperado de gaveta já
  está certo sem mudança.
- **Lado oposto, na sessão do fechamento**: a lista de vendas do turno e o resumo por vendedor
  (`summarizeSessionSalesBySeller`) usam `sales.valorTotal` da venda com `sessaoVendaId` = sessão.
  Uma conta recebida em parte na sessão A e fechada na B aparece inteira em B, enquanto a gaveta de
  B só recebeu o restante — "total de vendas" e "esperado por método" deixam de bater. Na venda do
  turno, descontar os parciais recebidos em **outra** sessão (`Σ tab_payments ATIVO` com
  `sessao_venda_id <> sessão`) e mostrar "R$ 62 recebidos em outro caixa"; o resumo por vendedor
  soma o valor líquido.
- **Módulo financeiro**: a lista de lançamentos e a de transações não filtram por status da venda, e
  passam a mostrar um lançamento `VENDA` de uma venda ainda `ORCAMENTO`. Custo aceito, mas o título
  precisa denunciar: enquanto a conta está aberta o lançamento se chama "Conta em aberto · Mesa 4";
  no fechamento a confirmação o renomeia para o título padrão de venda (`buildSaleEntryTitle`).
- **Cupom de conferência** (`lib/desktop-agent/cupom-venda-data.ts`): linhas "Já pago" e "Restante".

## UI (`app/dashboard/sales/service-accounts/_components/account-panel/`)

- Extrair do `ClosePane` os tiles de método, o cartão de pagamento e o seletor de caixa para
  componentes compartilhados; o parcial reaproveita sem duplicar.
- **`PartialPaymentPane`**: ação "Receber parcial" no painel. Valor (atalhos 1/N do consumo), método,
  conta financeira quando editável, nome opcional, troco só em tela no dinheiro (como no
  fechamento).
- **Lista de recebidos** no painel: "João · Pix · R$ 62,00 · 21:14 · por Ana", com estorno inline
  pedindo motivo (padrão das confirmações destrutivas do `AccountOrders`).
- **`ClosePane`**: "Consumo / Desconto / Acréscimo / Já pago (2) / Restante". "Dividir igualmente"
  e o pagamento padrão passam a usar o restante. Restante zero: fecha sem cartões de pagamento. O
  desconto não pode baixar o total abaixo do já pago (mesma regra do servidor, mensagem antecipada).
- **Board** (`BoardCards`): conta com parcial mostra o restante e um "R$ 62 pago" discreto.
- Mutations em `lib/mutations/tabs.ts` (`receiveTabPayment`, `refundTabPayment`); invalidar a query
  da conta e a do board.
- `components/Modals/Internal/Tabs/CloseTab.tsx` não é importado em lugar nenhum: remover em vez de
  adaptar.

## Testes

- Módulo client-safe `lib/tabs/partial-payments.ts` com o cálculo de saldo (`consumo`, desconto,
  acréscimo, `jaPago` → `valorTotal`, `restante`, bloqueio) usado pelo `ClosePane` e pelo servidor.
  Testes: sem parcial, parcial < total, parcial cobre tudo, desconto deixando total < já pago,
  tolerância de centavo.
- Teste de integração do estorno: estornar o único parcial deixa o lançamento `VENDA` com valor 0
  e linhas balanceadas (protege contra endurecimento de `assertAccountingEntryLinesBalanced`);
  estorno de parcial `DINHEIRO` sem `sessaoVendaId` é recusado; estorno de PIX sem sessão passa.
- Checagens manuais: parcial numa sessão e fechamento em outra (esperado de cada gaveta E lista de
  vendas/resumo por vendedor da sessão do fechamento líquidos do parcial), estorno em dinheiro com
  a sessão de origem já fechada, NFC-e com `detPag` misto, cancelamento da venda fechada devolvendo
  o dinheiro dos parciais exatamente uma vez (inclusive quando um parcial em dinheiro foi estornado
  antes do fechamento), tentativa de excluir a venda cancelada com parciais estornados bloqueada.

## Ordem

1. Schema + migração 0132, `receiveTabPayment`, estorno, guardas, mudanças no `closeTab` e na
   confirmação.
2. `GET /api/tabs`, painel (receber, lista, estorno), `ClosePane`, board.
3. Modal da sessão, cupom de conferência, QR público.

## Fora de escopo

- Fechamento parcial por itens (venda e NFC-e próprias para quem saiu, cashback por pessoa). O
  esquema já comporta (tab 1:N vendas); este plano não bloqueia.
- Parcial parcelado ou a prazo.
- Comprovante não fiscal impresso do parcial.
