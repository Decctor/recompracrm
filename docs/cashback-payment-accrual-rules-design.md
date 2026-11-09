# Cashback — Regras de Acúmulo por Forma de Pagamento

> Fases 1–6 implementadas em 2026-11-09 (branch `feat/cashback-payment-accrual-rules`). Migração
> `drizzle/0150_cashback_payment_accrual_rules.sql` aplicada no mesmo dia. Fase 7 depende da ATMA.
> Origem: migração da Fran Farma (ERP Nereus, da ATMA, integrado por SQL-VIEWS). No app de
> fidelidade anterior, cada forma de pagamento tinha uma política: Outro e Subsídio não pontuavam, e
> Convênio (fiado) só pontuava no dia em que era pago. A regra precisa ser nativa: valer para o PDV
> e para toda integração que informe pagamentos, sem quebrar as que não informam.

## Decisão

O **programa** diz, por forma de pagamento (`PaymentMethodEnum`), **se pontua** e **quando pontua**:

| Campo da regra | Valores | Forma ausente num mapa configurado |
| -------------- | ------- | ---------------------------------- |
| `pontua`       | boolean | `true` |
| `momento`      | `NA_VENDA` \| `NA_QUITACAO` | `NA_VENDA` |

Todas as formas aceitam os dois momentos, para o modelo ser uniforme. `NA_QUITACAO` num pagamento
que a fonte não sabe quitar equivale a `NA_VENDA` (ver *Quitação desconhecida*).

### Programa sem regras = comportamento anterior, caminho por caminho

`acumuloRegrasPagamento = null` não passa pela regra: cada caminho de acúmulo continua como era.
Isso importa porque **não existe um comportamento único a reproduzir**:

| Caminho | Sem regras (antes e depois) |
| ------- | --------------------------- |
| PDV, confirmação (`processSaleConfirmation`) | pontua o total **na confirmação**, qualquer forma, inclusive fiado |
| Loja digital (`accumulateCashback: false`) e gatilhos adiados (`processSaleCashbackAccumulationIfEligible`) | pontua o total quando a venda fica `RECEBIDA` |
| Integrações (`processDataCollectingV2Effects`) | pontua o `valor_total` quando a venda fica válida |
| Ponto de interação | não tem pagamentos; sempre pelo valor informado |

A primeira versão deste documento afirmava que o PDV já pontuava "na quitação". Estava errado: só a
loja espera o pagamento. Um default único teria mudado o PDV ou as integrações. Com regras
configuradas, todos os caminhos passam a seguir a mesma regra. Sem backfill.

### Formas de pagamento

A regra usa `PaymentMethodEnum`, o mesmo vocabulário do PDV, do financeiro, do fiscal e do formato
canônico das integrações. Não há enum próprio do cashback. Crédito e débito continuam separados.

Todas as formas recebem regra (`CashbackAccrualPaymentMethodEnum`), menos `A_DEFINIR`, que é um
pagamento ainda sem forma. Ele **segura** o acúmulo da venda até ser definido.

Uma fonte que não distingue crédito de débito (a ATMA só diz "TEF" ou "CARTÃO") é traduzida para um
dos dois na integração (ver *Tradução de formas*). Com a mesma regra para crédito e débito, a escolha
não muda nada. Com regras diferentes, essa fonte não tem como respeitá-las.

### Onde a regra mora

Coluna jsonb `acumulo_regras_pagamento` em `ampmais_cashback_programs`, validada por
`CashbackPaymentAccrualRulesSchema` (`schemas/cashback-programs.ts`); enums `CashbackAccrualMomentEnum`
e `CashbackAccrualPaymentMethodEnum` em `schemas/enums.ts`:

```ts
acumuloRegrasPagamento: Partial<Record<TCashbackAccrualPaymentMethodEnum, { pontua: boolean; momento: "NA_VENDA" | "NA_QUITACAO" }>> | null
```

Jsonb, e não tabela filha, porque a regra é pequena, fechada (10 formas), sempre editada junto com
o programa e nunca consultada por fora dele. Ela entra no `PUT /api/cashback-programs` existente. O
campo não tem default no schema Zod: o PUT espalha o payload no UPDATE, e um chamador que omite o
campo não pode apagar as regras. `null` explícito remove.

## Mecanismo

### 1. Pagamentos da venda, num formato só

```ts
type TAccrualPayment = {
	metodo: TPaymentMethodEnum;
	valor: number; // líquido; linhas negativas (troco) são aceitas
	quitadoEm?: Date | null; // null = em aberto; undefined = a fonte não sabe
};
```

- **Vendas internas** (`loadSaleAccrualPayments`, `lib/cashback/sale-accrual-payments.ts`): as
  ENTRADAs vivas da venda, com `dataEfetivacao` como quitação, e o troco (SAÍDA `origem = TROCO`)
  como linha negativa. As demais SAÍDAs (estornos) não são pagamento.
- **Integração com pagamentos:** `TCanonicalSale.payments`. `TCanonicalSalePayment` ganhou
  `formaOriginal` (rótulo cru da fonte) e `quitadoEm` (ausente quando o conector não informa).
- **Integração sem pagamentos** (`payments` null **ou lista vazia**): sem restrição. O total pontua
  na data da venda, como antes. Lista vazia de uma fonte que expõe pagamentos é tratada como "não
  sei", não como "não pontua": uma venda válida sem linha de pagamento seria um defeito da fonte, e
  perder o acúmulo por isso seria pior. Na Fran Farma, toda venda sem pagamento é cancelada (642 de
  642 na loja 1).

### 2. Função pura de acúmulo

`lib/cashback/payment-accrual.ts`, client-safe, testes em `payment-accrual.test.ts`
(`npm run test:cashback-payment-accrual`):

```ts
resolveSaleAccrual({ saleTotal, saleDate, payments, rules, requireCoverage? }) =>
	| { status: "PONTUAVEL"; base: number; momento: Date; metodos: TPaymentMethodEnum[] }
	| { status: "AGUARDANDO"; motivo: "PAGAMENTO_A_DEFINIR" | "PAGAMENTO_INCOMPLETO" | "QUITACAO_PENDENTE" }
	| { status: "SEM_BASE" }
```

- **Base proporcional:** `base = saleTotal × Σ líquido das formas que pontuam ÷ Σ líquido de
  todos os pagamentos`, com o líquido calculado por forma. A proporção é obrigatória: na Fran Farma,
  cerca de 16% das vendas da loja 1 têm pagamentos cuja soma não bate com o total.
- **Momento:** `NA_VENDA` → data da venda; `NA_QUITACAO` → `quitadoEm`, ou a data da venda quando
  `quitadoEm` é `undefined`, ou "ainda não" quando é `null`. Nunca antes da data da venda.
- **Venda mista:** pontua **uma vez**, inteira, quando o último pagamento que pontua fica
  pontuável. Pagamentos que não pontuam nunca seguram a venda. Em 30 dias, a Fran Farma teve 1 venda
  com convênio misturado a outra forma, em cerca de 650 com convênio. Pontuar cada parte na sua data
  exigiria um acúmulo por pagamento, e o sistema pressupõe um por venda (idempotência em
  `accumulateCashbackForClient`, estorno, reatribuição, edição).
- **Cobertura** (`requireCoverage`, só vendas internas): pagamentos que ainda não cobrem o total
  seguram a venda, como o `isFullyPaid` fazia. Integrações não exigem: o ERP é a fonte da verdade.

`resolveIntegratedSaleAccrual` embrulha a regra para integrações: sem regras ou sem pagamentos,
devolve `base: null` (total, data da venda).

`calculateAccumulatedCashbackValue` e `accumulateCashbackForClient` aceitam `accrualBase`: o percentual
incide sobre a base, e o valor mínimo do programa continua comparado ao **total** da venda. A mesma
base vale para o acúmulo de parceiro (`acumuloValorParceiro`).

### 3. Vendas internas

Só com regras configuradas:

- **Confirmação no PDV** (`process-sale-confirmation.ts`): avalia os pagamentos recém-gravados na
  mesma transação (incluindo o troco). Se a venda já é pontuável, pontua a base; senão, não pontua
  e deixa para o gatilho adiado.
- **Gatilho adiado** (`processSaleCashbackAccumulationIfEligible`): troca o `isFullyPaid` pela regra,
  com cobertura. Os chamadores continuam os mesmos (efetivação de transação, recebimento de fiado,
  consumo de tentativa de pagamento, mudança de atendimento). Nas vendas internas, o acúmulo é
  gravado na hora do gatilho, como antes; só nas integrações a data vem do `momento`.
- **Edição de venda:** `resyncSaleCashbackAccumulation` recalcula pela base dos pagamentos. Para isso
  o resync passou para **depois** da regravação dos pagamentos em `process-confirmed-sale-edit.ts`;
  o log da edição grava `cashbackAcumuloDesatualizado` depois do resync.
- **Reatribuição de cliente:** a elegibilidade do novo cliente usa "pontuável" no lugar de "totalmente
  paga", e o acúmulo transferido (e a prévia) usa a base.

Venda interna sem nenhum pagamento registrado (ex.: venda de integração editada ou reatribuída) usa
o total (`computeInternalSaleAccrualBase` devolve `null`).

### 4. Integrações

**Conector SQL-VIEWS:** lê `vw_recompra_venda_pagamentos` **se a view existir** (consulta a
`information_schema` uma vez por leitura). Sem a view, `payments = null`. Colunas lidas:

| Coluna | Uso |
| ------ | --- |
| `pagamento_id`, `venda_id` | chave |
| `forma_pagamento` | sugestão de `PaymentMethodEnum` feita pela fonte |
| `forma_pagamento_original` | rótulo cru → `formaOriginal` e chave da tradução |
| `valor` | líquido (troco vem negativo, com `troco_para`) |
| `pago_online`, `troco_para` | repassados ao formato canônico |
| `data_quitacao` | **não lida até a fase 7**: sem o caminho adiado, um convênio em aberto nunca pontuaria |

**Tradução de formas por integração:** `configuracao.paymentMethodMapping: Record<formaOriginal,
TPaymentMethodEnum>` no config SQL-VIEWS (chave em inglês, como as vizinhas `storeId` e
`anonymousClientIds`). O rótulo é comparado normalizado (maiúsculas, sem acento). Sem entrada, vale a
`forma_pagamento` da fonte; fora do enum, `OUTRO`. A integração SQL-VIEWS não tem tela; a tradução é
operada pelo script:

```bash
# lista as formas dos últimos 30 dias: original, fonte, tradução gravada e forma efetiva
npm run sql-views -- payment-methods --org <orgId>
# grava (repetível); "TEF=" remove
npm run sql-views -- payment-methods --org <orgId> --map "TEF=CARTAO_CREDITO" --map "SUBSIDIO=OUTRO"
```

**Assinatura da venda:** `computeSaleImportSignature` recebe `payments` e só os inclui no hash
quando não são `null`. Conectores sem pagamentos mantêm as assinaturas atuais. Para a Fran Farma, a
primeira leitura depois do deploy reprocessa uma vez as vendas da janela (sem efeito no cashback:
o acúmulo só roda na validação).

**Efeitos** (`processDataCollectingV2Effects`): na validação (`becameValid`), como antes, mas com
`resolveIntegratedSaleAccrual`. O ACÚMULO grava `dataInsercao = momento`, e a validade conta a partir
dele. Sem quitação, o `momento` é a data da venda, igual a antes. Os metadados recebem
`regrasPagamento: { base, metodos }` quando a regra se aplicou.

### 5. Fase 7: caminho adiado (pendente da ATMA)

Quando a fonte informar quitação, um segundo caminho nos efeitos: a venda já era válida, não tem
ACÚMULO, devolve `PONTUAVEL`, o `momento` vem de um `quitadoEm` real e `momento >=
acumuloViaIntegracaoDesde`.

`acumuloViaIntegracaoDesde` é uma coluna nova (timestamp) no programa, gravada quando
`acumuloPermitirViaIntegracao` é ligado. Com `null`, o caminho adiado fica desligado.

**Por que a coluna existe.** Uma venda antiga é relida sempre que o ERP a altera ou que a assinatura
muda (a chegada de `data_quitacao` muda a assinatura de toda venda da janela), e o cron
`fix-previous-sales` reprocessa dias anteriores com cashback ligado. Sem um corte, um convênio
quitado **antes** da virada, que o app anterior já pontuou e que veio no saldo migrado, pontuaria de
novo. Nenhum dado da venda separa "quitado antes de ligar o acúmulo" de "quitado depois": as vendas
da Fran Farma entraram no CRM em 27/10, semanas antes da virada. Com o corte, o convênio vendido
antes da virada e quitado depois pontua no RecompraCRM; é o que fica de fora da migração de saldo.

**Por que só na fase 7.** O caminho adiado só dispara com `quitadoEm` real. Até lá ele nunca roda,
e a coluna não protegeria nada.

## Quitação desconhecida

Quando a fonte informa pagamentos mas não a quitação (Fran Farma hoje), `NA_QUITACAO` equivale a
`NA_VENDA`. O convênio pontua na venda até a fase 7, e aí passa sozinho a pontuar na quitação, sem
mudar a configuração. Quem preferir que o fiado não pontue nesse intervalo desmarca `FIADO_NOTA`.

## Casos de borda

- **Troco:** linha de dinheiro negativa. Entra no líquido da forma.
- **Soma ≠ total:** resolvido pela proporção.
- **Σ líquido ≤ 0 com pagamentos informados:** `SEM_BASE`.
- **`A_DEFINIR`:** `AGUARDANDO` até virar uma forma.
- **FIXO com regras:** venda com base > 0 ganha o valor fixo inteiro; base 0 não ganha nada.
- **Venda cancelada:** inalterado (`reverseSaleCashback`).
- **Regras alteradas:** valem para os próximos acúmulos. O que já pontuou não é recalculado.

## UX

- Programa → seção **"Formas de pagamento"** (`components/Modals/CashbackPrograms/Blocks/PaymentMethods.tsx`):
  liga/desliga as regras; ligadas, uma linha por forma com *Pontua* e *Quando*, gravadas
  explicitamente (o mapa no banco não depende do default). Bloqueia aplicar com nenhuma forma
  pontuando.
- `describeCashbackProgram` cita as exceções: "Não pontua: Outro. Pontua só quando pago: Fiado / nota."
- Não incluído: o bloco no modal de criação de programa (programa novo nasce sem regras) e o aviso
  de crédito/débito com regras diferentes numa fonte que não os distingue.

## Fora do escopo

- Multiplicador por forma (o app anterior só usava 1,00x e 0,00x).
- Acúmulo por pagamento numa venda mista.
- Persistir os pagamentos das vendas integradas no financeiro. A regra relê da fonte a cada sync.

## Estado da Fran Farma (2026-11-09)

- Tradução gravada nas 3 conexões: TEF/CARTAO → `CARTAO_CREDITO`, SUBSIDIO → `OUTRO`, CONVENIO →
  `FIADO_NOTA`. `HAVER DEBITO` segue a fonte (`CARTAO_DEBITO`) até a ATMA confirmar.
- Regra do programa: `OUTRO` não pontua, `FIADO_NOTA` na quitação, o resto na venda.
- Simulação sem escrita sobre as vendas de 07/11: loja 1 pontuaria 97,9% do total (20 vendas só com
  subsídio de fora), loja 2 89,6% (17), loja 3 100%.
- Acúmulo via integração continua **desligado**: liga na virada, junto com a carga de pontos
  (`scripts/import-franfarma-points.ts`). Só tem efeito depois do deploy desta branch.

## Pendências com a ATMA

1. Coluna `data_quitacao` em `vw_recompra_venda_pagamentos` (null enquanto o convênio está em
   aberto), com `contrato_versao` 1.1.
2. Atualizar `vw_recompra_vendas.data_atualizacao` quando um pagamento da venda for quitado. O sync lê
   vendas por `data_venda` ou `data_atualizacao`; sem esse carimbo, a quitação nunca é relida.
3. Confirmar o que é `HAVER DEBITO` (traduzido por eles como `CARTAO_DEBITO`; o nome sugere crédito
   do cliente na loja, que seria `VALE`).
