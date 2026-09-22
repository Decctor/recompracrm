# Múltiplas recompensas por venda — plano

Data: 2026-09-22
Status: **Proposta** (mapeamento de impacto concluído; decisões a validar antes de implementar)

Antecessor: `docs/dev-planning/pos-reward-redemption-plan.md`, que entregou o resgate de recompensa no PDV e
deixou "múltiplas recompensas por venda" explicitamente na Fase 4 (backlog). Este documento fecha essa fase.

## O problema em uma frase

Hoje uma venda resgata **no máximo uma** recompensa do programa de cashback — no PDV, na loja digital e no
ponto de interação. O pedido é permitir várias (inclusive a mesma recompensa mais de uma vez), como
**comportamento padrão, sem campo novo de configuração**. O limite de "uma" não é acidente de UI: é a
chave de idempotência do ledger (*"existe `RESGATE` para a venda"*), replicada em tipos, schemas, estado e
telas. Mudar sem mapear os pontos de contato produz números errados sem lançar erro (recibo, edição,
estatísticas, custo).

## O que já existe e sobrevive sem mudança

Estas partes já foram escritas com `filter`/`reduce`/loops e generalizam para N recompensas:

- **Reversão em cancelamento** — `lib/cashback/reverse-sale-cashback.ts:102-216`: `findMany` de todos os
  `RESGATE` ativos da venda, loop com `CANCELAMENTO` por linha, restauração do `consumoFifo` de cada uma e
  cópia de `resgateRecompensaId`/`resgateRecompensaValor` para o estorno.
- **Débito FIFO** — `lib/cashback/redemption.ts` (`applyCashbackRedemptionFIFO`): relê o saldo e o persiste a
  cada chamada, então N chamadas sequenciais na mesma transação compõem corretamente e cada uma grava seu
  próprio `consumoFifo`.
- **Edição de venda confirmada** — `lib/sales/sale-processing/process-confirmed-sale-edit.ts:214-249,
  376-438`: itens de recompensa por `filter` + `Set`, somas `rewardValorBase`/`rewardDescontoTotal`/
  `rewardCustoTotal`, imutabilidade por item, e resgates-desconto filtrados por `isNull(resgateRecompensaId)`.
  É o padrão a copiar nos demais lugares.
- **Fiscal** — `lib/fiscal/taxation-context.ts:111-138` e `lib/fiscal/header-discount.ts`: nada lê
  `POS-RESGATE-RECOMPENSA`; cada item de recompensa entra como item comum com `vDesc = vProd`, líquido 0,
  peso 0 no rateio do desconto de cabeçalho. N itens assim continuam somando 0 ao resíduo.
- **Estoque e COGS** — `process-stock-deduction.ts` e fulfillment não filtram por origem: N itens baixam
  estoque e compõem custo normalmente (desde que o `custoTotal` da venda seja somado certo — ver abaixo).
- **Política de reatribuição de cliente** — `sale-client-reassignment-policy.ts:60` usa `some()`.
- **Listagem e detalhe de venda, compras do cliente, card de transação** — mapeiam todas as
  `transacoesCashback`; N `RESGATE` viram N linhas.
- **Merge de clientes/produtos, exclusão de organização, scripts de escala do ledger** — operam por linha.
- **Campanhas, WhatsApp, automações, webhooks** — nenhum gancho disparado por `RESGATE`.

## Desenho central

### D1. Uma linha por recompensa distinta, com `quantidade`; um `RESGATE` por linha

| Grandeza | Hoje | Proposto |
|---|---|---|
| Estado / payload do cliente | `recompensaResgate: { recompensaId } \| null` | `recompensasResgate: Array<{ recompensaId, programaId?, quantidade }>` |
| Snapshot autoritativo no rascunho | `rascunhoMetadados.recompensa` (objeto) | `rascunhoMetadados.recompensas` (array de `{ recompensaId, programaId, titulo, valor, valorVenda, quantidade }`) |
| Item da venda | 1 `saleItem`, `quantidade: 1` | 1 `saleItem` **por recompensa distinta**, `quantidade: N`, bruto = desconto = `N × valorVenda`, custo = `N × precoCusto` |
| Ledger | 1 `RESGATE`, `valor = -prize.valor` | 1 `RESGATE` **por linha**, `valor = -(N × prize.valor)`, `resgateRecompensaId` da linha, `resgateRecompensaValor = abs(valor)`, `metadados.recompensa = { quantidade, valorUnitario }` |

Por que **uma linha por recompensa distinta** (e não uma linha por unidade):

1. `recompensaId` continua **único dentro da venda** — é a chave que correlaciona estado ↔ snapshot ↔ item ↔
   linha do ledger em `map-sale-to-sale-state.ts:195-204`, na revalidação de `RewardRedemptionSection.tsx:50`
   e na loja (`CashbackStep.tsx:87-101`). Linhas duplicadas quebrariam essas três correlações.
2. Repetir a mesma recompensa ("dois cafés") é o caso mais comum do pedido; `quantidade` é o vocabulário
   normal de `saleItems`.

Por que **um `RESGATE` por linha** (e não um `RESGATE` agregado por venda):

1. `resgateRecompensaId` é FK escalar (`schema/cashback-programs.ts:170`): um único `RESGATE` não consegue
   apontar para duas recompensas. Agregar destruiria a atribuição por prêmio que o card de transação, a busca
   da listagem (`transactions/route.ts:98` faz `leftJoin` por esse FK) e o estorno rastreável dependem.
2. O ledger é "posição econômica imutável" (CONTEXT.md). O grão "uma recompensa por linha" já é o grão do
   schema; mantê-lo evita empurrar detalhe para `metadados`.
3. Reversão já é por linha.

`resgateRecompensaValor` mantém o invariante atual `resgateRecompensaValor == abs(valor)` (hoje quantidade é
sempre 1, então total e unitário coincidem); o unitário vai em `metadados`. Leitores atuais
(`pos/sales/edit/route.ts:207`, `scale-cashback-ledger.ts:207-213`) continuam corretos.

### D2. Idempotência do ledger: "tudo ou nada" por venda, verificada uma vez

A guarda "existe `RESGATE` para a venda → reaproveita" (`process-sale-confirmation.ts:204-217`) continua
válida **desde que seja avaliada uma vez, antes do loop**: as N inserções acontecem na mesma transação de
banco, então uma reconfirmação encontra N linhas (pula todas) ou zero (insere todas). Nunca "algumas".

Endurecer com duas coisas baratas:

- Se existirem linhas, comparar a contagem/conjunto de `resgateRecompensaId` com o pedido; divergência lança
  `Conflict` em vez de reaproveitar silenciosamente.
- A guarda do ramo **resgate-desconto** (`:278-290`) passa a filtrar `isNull(resgateRecompensaId)`. Hoje é
  irrelevante (exclusividade), mas é o que impede uma futura relaxação da exclusividade de colidir.

### D3. Saldo: pré-checagem cumulativa, débito sequencial

- Admissão: `Σ (quantidade × prize.valor) ≤ saldoValorDisponivel`. A pré-checagem por prêmio isolado
  (`sale-reward-redemption.ts:100-104`) deixaria passar dois prêmios individualmente pagáveis cuja soma
  estoura, e a falha só apareceria dentro do FIFO na confirmação — exatamente o orçamento órfão que o
  comentário daquela linha existe para evitar.
- Confirmação: uma chamada `applyCashbackRedemptionFIFO` por linha, em sequência, na mesma `tx`. O débito é
  o autoritativo; a admissão é só para falhar cedo.
- Todas as linhas resolvem para **o mesmo programa** (o FIFO é por programa). Resolver o programa uma vez
  (input ?? saldo do cliente) e validar cada prêmio contra ele.

### D4. Elegibilidade na listagem é relativa ao carrinho

`listAvailableCashbackRewards` (`lib/cashback/prizes.ts:214`) marca `elegivel = saldo >= prize.valor` contra
o saldo cheio. Com seleção múltipla, o cliente deve derivar `saldoRestante = saldo − Σ selecionadas` e
recalcular elegibilidade/“+1” localmente. O endpoint não muda (continua devolvendo `saldoValorDisponivel` e
o `valor` de cada prêmio); o servidor segue autoritativo na admissão.

### D5. O que **não** muda (decisões herdadas, fora de escopo)

| Regra | Mantida | Onde está afirmada |
|---|---|---|
| Recompensa × cupom: exclusivos | sim | `sale-reward-redemption.ts:51`, `process-sale-confirmation.ts:196`, `poi new-transaction/route.ts:520`, `use-sale-state.tsx:494`, `use-shop-order-state.tsx:303` |
| Recompensa × resgate-desconto: exclusivos | sim | mesmos pontos (`:52`, `:194`, `:505`, `:288`) |
| `resgateLimite*` não se aplica a recompensa | sim | `process-sale-confirmation.ts:231`, POI `:588-604` |
| Acúmulo sobre `sale.valorTotal` (que já exclui recompensas) | sim | — |
| Recompensa imutável na edição de venda confirmada | sim | `process-confirmed-sale-edit.ts:233-247` |
| Cliente obrigatório | sim | — |
| Sem quota/estoque de prêmio por cliente | sim | Fase 4 do plano anterior |

Nenhum campo novo de configuração. Nenhuma migração de banco para PDV e loja (jsonb + colunas existentes).

### D6. Compatibilidade durante o deploy

Há estado em voo que o servidor precisa aceitar nas duas formas:

| Estado | Onde | Tratamento |
|---|---|---|
| Rascunhos PDV/loja gravados antes do deploy | `rascunhoMetadados.recompensa`, `rascunhoMetadados.shop.recompensa` | `parseSaleRewardDraftSnapshots()` lê `recompensas[]` se existir; senão converte o objeto legado em `[ { ...obj, quantidade: 1 } ]`. Ao gravar o novo formato, **apagar** a chave legada para não haver dupla leitura |
| Bundles antigos do PDV / carrinho da loja em `localStorage` | `recompensaResgate` singular no payload | Schemas Zod aceitam `recompensaResgate` (objeto) por uma release, normalizando para o array via `.transform`; `SHOP_CART_STORAGE_VERSION` (`use-shop-order-state.tsx:14`) sobe para invalidar carrinhos antigos |
| Solicitações POI `PENDENTE` criadas antes do deploy | `poiTransactionRequests.payloadSolicitacao` / `resumoSolicitacao` | Aprovação e fila toleram `recompensa` (objeto) e `recompensas[]` |
| App POI mobile (React Native) | ainda não migrou a seleção de prêmios (`poi-mobile-react-native-plan.md`, Fase 4 pendente) | Sem compatibilidade a manter hoje; `prizeRedemption` singular pode continuar aceito por cortesia |

Hashes de idempotência (`hashShopOrderPayload` em `shop/[orgId]/orders/route.ts:50-53` e
`poiTransactionIdempotencyRequests.payloadHash`) são `JSON.stringify` do input: **ordenar as recompensas por
`recompensaId` antes de hashear** para que a mesma cesta em ordem diferente não vire pedido novo.

## Mapa de impacto

Legenda: **BLOQUEIA** = lança ou pula silenciosamente um resgate; **SILENCIOSO** = número errado sem erro;
**FORMA** = tipo/schema singular que precisa virar lista.

### Núcleo compartilhado (PDV + loja + confirmação)

| Arquivo | Linhas | Hoje | Mudança |
|---|---|---|---|
| `lib/sales/sale-reward-snapshot.ts` | 13-19, 27-40 | `TSaleRewardDraftSnapshot` objeto; `parseSaleRewardDraftSnapshot` lê `recompensa` ou `shop.recompensa` | **FORMA.** `+ quantidade`; `parseSaleRewardDraftSnapshots(): []` com leitura legada (D6). Ponto de maior alavancagem: todo consumidor de servidor passa por aqui. Testar antes de mudar |
| `lib/sales/sale-reward-redemption.ts` | 27-104 | `admitSaleRewardRedemption` admite um prêmio; pré-checa saldo contra um `valor` | **BLOQUEIA (D3).** `admitSaleRewardRedemptions({ recompensas: [...] })`: iça cliente/cupom/cashback/programa/superfície para fora do loop, valida cada prêmio, rejeita `recompensaId` repetido (usar `quantidade`), checa `Σ` contra o saldo |
| idem | 113-143 | `buildRewardSaleItemValues` fixa `quantidade: 1` | recebe `quantidade`; bruto/desconto/custo multiplicados; `metadados.quantidade` |
| idem | 145-153 | `buildSaleRewardDraftSnapshot` um snapshot | plural |
| `lib/sales/sale-processing/process-sale-confirmation.ts` | 41-55 | `saleRewardRedemption?: { … } \| null` | **FORMA.** `saleRewardRedemptions?: Array<{ recompensaId, programaId, valorResgate, quantidade }>` |
| idem | 204-217 | guarda `findFirst(vendaId, tipo=RESGATE)` dentro do ramo | **BLOQUEIA (D2).** Avaliar uma vez antes do loop; validar conjunto; devolver lista |
| idem | 235-266 | um FIFO + um insert | loop por linha; `valor = -(qtd × valorResgate)`; `metadados.recompensa` |
| idem | 278-290 | guarda do resgate-desconto sem `isNull(resgateRecompensaId)` | higiene (D2) |
| idem | 184-187, retorno | `cashbackResgate: { transactionId, newBalance }` | `{ transactionIds: [], newBalance }` — sem consumidor externo hoje (`grep` confirma) |
| `lib/cashback/prizes.ts` | 214 | `elegivel` contra o saldo cheio | D4 — semântica documentada como "pagável sozinha"; cliente deriva o restante |

### PDV — servidor

| Arquivo | Linhas | Hoje | Mudança |
|---|---|---|---|
| `app/api/pos/sales/route.ts` | 58-66, 92-98 | schema `recompensaResgate` objeto (create e update) | **FORMA** + aceitar legado (D6) |
| idem | 127-129, 403 | "pelo menos um item ou uma recompensa" | `.length === 0` |
| idem | 134-146, 425-447 | uma admissão; tri-estado `undefined` mantém / `null` remove / objeto revalida | preservar o tri-estado: `undefined` mantém, `[]` limpa, array substitui e revalida |
| idem | 222, 483 | grava `rascunhoMetadados.recompensa` | grava `recompensas`, apaga `recompensa` |
| idem | 465 → `lib/sales/drafts/sync-draft-items.ts:157-169` | sync de itens sem noção de recompensa (apaga itens ausentes do payload) | **pré-existente**, multiplica com N: um `PUT` do checkout tardio sobre rascunho da loja com itens de recompensa os apagaria. Excluir itens com `origem = POS-RESGATE-RECOMPENSA` do diff |
| `app/api/pos/sales/confirm/route.ts` | 95-96 | `existingRewardItem = itens.find(origem)`; `draftItemsWithoutReward` exclui só ele | **SILENCIOSO/BLOQUEIA.** `filter` + `Set`; os demais itens de recompensa vazam para o drift de preço (`:100-120`) e para a base do teto |
| idem | 174-188 | um snapshot → uma admissão | loop via `parseSaleRewardDraftSnapshots` |
| idem | 196-204 | teto de desconto subtrai `existingRewardItem?.valorTotalDesconto` | **SILENCIOSO.** somar todos; senão a 2ª recompensa infla `descontosGerais` e exige aprovação de gestor espúria (`:212-219`) |
| idem | 232-240, 252-268 | um `saleRewardRedemption`; insere 1 item; `descontosTotal`/`custoTotal` += 1 prêmio | array; inserir os que faltam (match por `metadados.recompensaId`); somar |
| `app/api/pos/sales/create-and-confirm/route.ts` | 64-72, 94-96, 101-117 | schema/guarda/admissão singulares | **FORMA** |
| idem | 200-208 | `recompensaDesconto`, `custoTotal` de um prêmio | **SILENCIOSO (COGS).** somar |
| idem | 233, 314-323, 336-343 | snapshot, item e input de confirmação singulares | plural |
| `app/api/pos/sales/edit/route.ts` | 195, 204-209 | `recompensaResgatada = resgatesAtivos.find(…)` | **SILENCIOSO.** `filter`; devolver `recompensasResgatadas[]` (alimenta a hidratação abaixo) |
| `app/api/pos/cashback-rewards/available/route.ts` | — | devolve `saldo` + `rewards` | sem mudança (D4) |

### PDV — cliente

| Arquivo | Linhas | Hoje | Mudança |
|---|---|---|---|
| `state-hooks/use-sale-state.tsx` | 112, 178, 240 | `recompensaResgate` no metadata, no estado e no default | **FORMA.** `recompensasResgate: []` |
| idem | 255, 267, 340-350, 494, 505 | seis pontos que anulam a recompensa (limpar cliente, modo consumidor, limpar carrinho, aplicar cupom, aplicar cashback) | limpar o array (em `clearCart`, filtrar pelos itens de recompensa sobreviventes) |
| idem | 509-515 | `setRecompensaResgate(obj \| null)` — comentário afirma "1 RESGATE por venda" | `addRecompensaResgate`, `setRecompensaQuantidade`, `removeRecompensaResgate(recompensaId)`, `clearRecompensasResgate`; cada um zera cupom/cashback; atualizar o comentário |
| idem | 573-577, 616-621 | `isReadyForDraft`, `getDraftMetadata` | `.length`, array |
| `app/dashboard/sales/new/components/checkout/RewardRedemptionSection.tsx` | 31, 47-59, 65-93, 155-206 | "zero ou uma aplicada": card único, revalidação de uma, `handleApply` fecha a lista, `disabled={!elegivel}` | lista de chips aplicadas com quantidade e remoção individual; lista fica aberta; `elegivel` derivado do saldo restante; linha "total debitado" |
| `.../SummarySection.tsx` | 38-39, 208-216 | `cashbackDisabledReason` por truthiness; uma linha "Recompensa: …" | `.length > 0`; uma linha por recompensa (com `×N`) |
| `.../TotalDock.tsx` | 47 | `isEmpty` por truthiness | `.length === 0` |
| `.../ItemsSection.tsx` | 69-177 | por item (`isReward`) | já N-safe |
| `app/dashboard/sales/new/new-sale-page.tsx` | 238-240, 369-371, 402-404 | três serializações `{ recompensaId, programaId }` | `map` para o array |
| `app/dashboard/sales/checkout/[saleId]/checkout-page.tsx` | 216-233 | `updateSaleDraft` omite a recompensa (tri-estado) e funde `getDraftMetadata()` em `rascunhoMetadados` | garantir que a chave do cliente nunca sombreie a autoritativa `recompensas` do servidor |
| `lib/sales/map-sale-to-sale-state.ts` | 164-168 | `rewardItem = itens.find(...)`; `descontoGeral = descontosTotal − cupom − cashback − descontoRecompensa` (**uma**) | **SILENCIOSO.** a tela de edição mostra "desconto geral" fantasma igual ao valor comercial das outras recompensas, e salvar persiste isso. `filter` + soma |
| idem | 195-204 | constrói `recompensaResgate` de um item + um snapshot + um `recompensaResgatada` | zipar por `recompensaId` |
| `lib/sales/map-sale-draft-to-sale-state.ts` | 23, 65 | lê `metadata.recompensa` | leitura plural com fallback |

### Loja digital

| Arquivo | Linhas | Hoje | Mudança |
|---|---|---|---|
| `schemas/shop.ts` | 563-576, 584-597 | `recompensaResgate` objeto; `TShopRewardSnapshot`; `TShopDraftMetadata.recompensa` | **FORMA** (+ `quantidade`, `recompensas[]`), aceitar legado |
| `app/api/shop/[orgId]/orders/route.ts` | 703-716 | uma admissão (`surface: LOJA_DIGITAL`, `canal: SHOP`) | `admitSaleRewardRedemptions` |
| idem | 717-718, 768, 819 | `rewardDiscount`, `discountsTotal`, `subtotalItens`, `custoTotal` de um prêmio | **SILENCIOSO (COGS).** somar |
| idem | 772-779 | grava `shop.recompensa` | `shop.recompensas`, apaga a legada |
| idem | 895-905, 953-959 | um item; um `saleRewardRedemption` | N itens; array |
| idem | 50-53 | hash do payload | ordenar recompensas antes (D6) |
| idem | 368-409 | `validateCashbackRequest` resolve o programa por `findFirst(ativo)`, diferente da admissão (saldo do cliente) | pré-existente; ao içar a resolução de programa (D3), usar uma só |
| `state-hooks/use-shop-order-state.tsx` | 14, 30-32, 91-191, 250-276 | `reward.resgate` singular; `SHOP_CART_STORAGE_VERSION = 4` | `reward.resgates[]`; **subir a versão** |
| idem | 288-324, 403-408 | `updateReward` substitui; payload singular | `addReward`/`setRewardQuantity`/`removeReward`; manter exclusão de cupom/cashback; `map` no payload |
| `app/shop/[slug]/_components/checkout/CashbackStep.tsx` | 87-101, 123-125, 143, 167-233, 357-362 | reconciliação de uma; `selected` estilo rádio; botão RESGATAR/REMOVER; linha única no resumo | reconciliar cada uma; seleção múltipla com stepper e saldo restante; copy plural |
| `.../OrderReviewStep.tsx` | 123, 343-375 | um card | lista |
| `.../CheckoutSheet.tsx` | 105-119 | derruba a recompensa quando o programa deixa de permitir | filtrar o array por `programaId` |
| `app/api/shop/[orgId]/orders/[token]/route.ts` | 26, 206-212 | `reward` singular no status público | `rewards[]` |
| `app/shop/[slug]/pedidos/[token]/public-order-page.tsx` | 321-322, 350-356 | `rewardDiscount` de uma; uma linha | somar; lista |
| `lib/shop/checkout.ts` | — | capability booleana `recompensas` | sem mudança |

### Ponto de interação (POI)

O POI **não** passa por `processSaleConfirmation`: grava o `RESGATE` direto, depois cria a venda
`CONFIRMADA` e faz o back-link. Também dirige o ramo de resgate pelo canal do desconto (`cashback.aplicar:
true, valor: prize.valor`) — acoplamento frágil que N recompensas expõem. É a fatia com mais UI e a única com
schema a tocar; por isso vai em fase própria (ver Fases).

| Arquivo | Linhas | Hoje | Mudança |
|---|---|---|---|
| `app/api/point-of-interaction/new-transaction/route.ts` | 156-162, 194-200 | `sale.prizeRedemption` objeto (o schema público herda) | **FORMA.** `prizeRedemptions[]` com `quantidade`; aceitar singular |
| idem | 275-278, 299 | `isPrizeRedemption`; `transactionRequiresRedemptionProcessing` depende de `cashback.aplicar` | `prizes.length > 0`; fazer o caminho de prêmio dirigir o flag explicitamente |
| idem | 503-515 | `validatedPrize`; `effectiveSaleValue`/`effectiveRedemptionValue` escalares dos quais tudo depende | `validatedPrizes[]`; somas |
| idem | 605-615 | checagem de saldo e um FIFO | **BLOQUEIA (D3).** cumulativa; um FIFO por linha |
| idem | 624-651 | um insert `RESGATE` → `transactionRedemptionId` | N inserts → `transactionRedemptionIds[]` |
| idem | 716-727 | `descontosTotal` com `min(valorVenda, valor)`; `custoTotal` de um prêmio | somar custos; ver nota sobre `min()` abaixo |
| idem | 795-810 | back-link por `eq(id, transactionRedemptionId)` | `inArray` |
| idem | 811-833 | um item, `origem: "POI-RESGATE-RECOMPENSA"`, desconto `min(valorVenda, valor)` | N itens |
| `lib/point-of-interaction/sale-value-confirmation.ts` | 5-19 | `prizeRedemption` singular; `grossValue`/`discountValue` de uma | somas — função pura, testar primeiro |
| `lib/point-of-interaction/transaction-requests.ts` | 13-27, 40-85 | `resumo.recompensa` objeto; `prizeInfo` único | `recompensas[]`; `prizeInfo` por id — função pura, testar primeiro |
| `app/api/point-of-interaction/transaction-requests/public/route.ts` | 22-29 | `findFirst` de um prêmio (**sem filtro de org** — pré-existente) | `inArray` **com** `organizacaoId` |
| `services/drizzle/schema/poi-transaction-requests.ts` | 32-34, 75-79 | `transacaoResgateId` varchar escalar + relation `one` | ver "Decisão POI" abaixo |
| `app/api/point-of-interaction/transaction-requests/management/route.ts` | 45-58 | `transacaoResgate.resgateRecompensa` (um) | fila lê `resumoSolicitacao.recompensas[]` |
| `.../management/approve/route.ts` | 109 | grava `transacaoResgateId` | primeiro id (+ lista, ver decisão) |
| `state-hooks/use-point-of-interaction-new-{public,internal}-transaction-request.tsx` | 53-60/47-54, 93/71, 123-128/98-103 | `prizeRedemption` + `updatePrizeRedemption` substitui | array + add/remove/qty |
| `app/(external)/point-of-interaction/[orgId]/new-transaction/new-transaction-page.tsx` | 145-146, 151-155, 329-351, 676-730 | `selectedPrize` único; contagem de passos fixa por fluxo; **no mobile, selecionar já submete**; sucesso mostra um card | cesta (`selectedPrizes[]`), passo de revisão, CTA "Continuar", sucesso em lista |
| `.../components/prize-selection-step.tsx`, `prize-card.tsx` | 17-21, 155-186 / 11-24 | seleciona-e-avança; sem `isSelected`; `isDisabled` contra o saldo cheio | estado de seleção, stepper, `isDisabled` contra o saldo restante, CTA |
| `.../components/prize-confirmation-step.tsx`, `mobile/prize-confirmation-step.tsx` | 13-70 / 12-52 | um prêmio; o mobile está **sem importador** (código morto) | lista + totais; o mobile vira o passo de revisão da cesta |
| `components/Modals/TransactionRequests/NewTransaction.tsx` | 84, 168-176, 184, 388-440, 507-540 | `selectedPrize` único, rádio, copy singular | mesma refatoração do kiosk |
| `components/PointOfInteraction/TransactionRequestsQueue.tsx` | 148, 154-156, 211-224, 237 | `resumo.recompensa` + FK singular | lista via resumo |

**Decisão POI (schema).** `poiTransactionRequests.transacaoResgateId` só guarda um id. Duas opções:

- **(a) Sem migração:** manter `transacaoResgateId` = primeira linha e fazer a fila renderizar a partir de
  `resumoSolicitacao.recompensas[]` (que já é jsonb e já é persistido). Estorno de uma solicitação aprovada
  reverte pelo `vendaId` (todas as linhas), então a FK singular não é usada para reverter.
- **(b) Com migração:** coluna `transacoes_resgate_ids jsonb` (lista) ao lado da atual.

Recomendação: **(a)**, pela mesma razão do plano anterior (nenhuma coluna nova enquanto o jsonb resolve);
(b) fica registrado caso a fila precise de join real por prêmio.

**Divergências pré-existentes do POI que N multiplica** (registrar, não corrigir neste escopo, salvo o
primeiro): a query de prêmio sem org (corrigir junto, é uma linha); origem `POI-RESGATE-RECOMPENSA` distinta
de `POS-RESGATE-RECOMPENSA` (itens do POI invisíveis a `isRewardSaleItem`); desconto do item por
`min(valorVenda, valor)` cobrando a diferença (o plano anterior mandou não copiar; misturar pontos com reais
fica pior com soma); preço do prêmio resolvido sem `channelState` no servidor e no cliente
(`new-transaction/page.tsx:85`, `NewTransaction.tsx:96`).

### Leitores a jusante (sem os quais a feature "funciona" e mente)

| Arquivo | Linhas | Sintoma com 2 recompensas | Mudança |
|---|---|---|---|
| `lib/desktop-agent/cupom-venda-data.ts` | 165-170, 286-291 | **Recibo impresso ao cliente**: só a primeira recompensa aparece e o valor da segunda é impresso como "Desconto geral" | `filter` + soma; `recompensas[]` |
| `lib/desktop-agent/templates/cupom-venda.ts` | 130-137, 186, 281 | schema Zod `recompensa` objeto; uma `renderLinha` | array; uma linha por recompensa com `×N` |
| `app/api/cashback-programs/stats/route.ts` | 248-259, 260-271, 428-450 | "vendas com resgate" = `count()` de linhas `RESGATE`; "valor das vendas" = `sum(vendaValor)` por linha → **a mesma venda contada e somada N vezes**, no período atual e no anterior (delta errado também) | `count(distinct coalesce(vendaId, id))`; `sum(vendaValor)` sobre subquery `distinct on (vendaId)` |
| `app/api/cashback-programs/stats/graph/route.ts`, `usage/route.ts` | — | somam `valor` | já corretos |
| `components/CashbackPrograms/CashbackTransactionCard.tsx` | — | N linhas da mesma venda em sequência | correto; opcional agrupar por venda |
| `app/(external)/ui-studio/cashback-transactions/…` | 29-60 | fixtures | adicionar "duas recompensas, mesma venda" |
| `app/api/sales/route.ts` | ~610-640 | seleção de `transacoesCashback` do detalhe **não** traz `resgateRecompensaId` | oportunidade: trazer, para o detalhe rotular "prêmio X" vs "desconto" |

## Fases

Ordem por raio de explosão, cada fase entregável sozinha.

### Fase 0 — Testes de caracterização e fundação compartilhada

Escrever os testes **antes** de mudar as formas, porque os arquivos que codificam o invariante não têm teste
nenhum hoje (`process-sale-confirmation`, `sale-reward-redemption`, `sale-reward-snapshot`,
`map-sale-to-sale-state`, rotas PDV/loja/POI).

- `lib/sales/sale-reward-snapshot.test.ts`: legado `recompensa`, legado `shop.recompensa`, novo
  `recompensas[]`, precedência, lixo.
- `lib/point-of-interaction/sale-value-confirmation.test.ts` e `transaction-requests.test.ts`: funções puras
  cujo cálculo muda.
- `lib/fiscal/header-discount.test.ts`: caso com **dois** itens 100% descontados (`descontosTotal = 2X`,
  resíduo 0; rateio 0 para ambos). Adicionar o arquivo a um script `test:` — hoje não roda em nenhum.
- `lib/fiscal/providers/spedy/mappers/invoice.test.ts`: fixture com dois itens de recompensa.
- `lib/desktop-agent/templates/cupom-venda.test.ts`: duas recompensas, uma com `×2`.
- Extrair a matemática da admissão para uma função pura testável (ex.: `planRewardRedemptions({ saldo,
  linhas }) → { total, erro? }`) e testar soma, repetição de id, quantidade 0, programa divergente.

Depois: `parseSaleRewardDraftSnapshots`, `admitSaleRewardRedemptions`, `buildRewardSaleItemValues` com
`quantidade`, `buildSaleRewardDraftSnapshots`, e o `processSaleConfirmationInTransaction` plural (D1-D3).
Ao fim desta fase nenhuma rota mudou de contrato: os chamadores embrulham o singular em `[x]`.

### Fase 1 — PDV servidor + loja servidor (contrato plural, compat legado)

As três rotas PDV, a rota de pedidos da loja, o status público do pedido, o `edit/route.ts` (GET), o
`sync-draft-items` (excluir itens de recompensa), hashes ordenados. Aceitar `recompensaResgate` singular.
Corrigir os leitores a jusante na mesma fase: `cupom-venda-data`/template, `stats`, `map-sale-to-sale-state`,
`map-sale-draft-to-sale-state`. Ao fim, o backend aceita N e nenhum número mente — mas as telas ainda mandam 1.

### Fase 2 — PDV cliente

`use-sale-state` (array + updaters), `RewardRedemptionSection` (chips com quantidade, saldo restante),
`SummarySection`, `TotalDock`, `new-sale-page`, `checkout-page`, edição (somente exibição). Copy plural.

### Fase 3 — Loja cliente

`use-shop-order-state` (bump de versão), `CashbackStep` (multi-seleção + stepper), `OrderReviewStep`,
`CheckoutSheet`, `public-order-page`. Confirmar no PDV um pedido da loja com 2 recompensas (Fase 1 já cobre).

### Fase 4 — POI

Funções puras (Fase 0) → rota `new-transaction` → rota pública de solicitação e aprovação (tolerar as duas
formas) → hooks → kiosk (`prize-selection-step`/`prize-card`/confirmação) → mobile (cesta + passo de
revisão) → `NewTransaction.tsx` do operador → fila. Decisão de schema (a) por padrão.

### Fase 5 — Limpeza (release seguinte)

Remover a aceitação do singular nos schemas; remover a leitura legada de `rascunhoMetadados.recompensa`
depois de confirmar que não há `ORCAMENTO` com a chave (query rápida); revisar as divergências do POI listadas.

## Verificações obrigatórias antes de liberar

Roteiro manual/integrado por fase (o repositório não tem testes de rota com banco):

1. **Confirmação** — venda com prêmio A ×2 + prêmio B: 2 itens (`quantidade` 2 e 1), 2 `RESGATE` com
   `valor` = −(2·A) e −B, `saldoValorDisponivel` = saldo − 2A − B, `custoTotal` = 2·custoA + custoB,
   `descontosTotal` inclui 2·vendaA + vendaB, `valorTotal` inalterado.
2. **Saldo insuficiente no conjunto** — A e B cabem sozinhos, soma não cabe: a admissão recusa **antes** de
   gravar o orçamento (loja) / antes de confirmar (PDV); nenhum `ORCAMENTO` órfão.
3. **Reconfirmação** — reexecutar a confirmação sobre a mesma venda não cria linhas novas nem debita de novo.
4. **Cancelamento** — cancelar a venda do item 1 devolve `2A + B` em dois `CANCELAMENTO`, reativa os
   `ACÚMULO` consumidos, devolve o estoque dos dois itens.
5. **Edição de venda confirmada** — os dois itens seguem imutáveis; `descontoGeral` exibido é 0 (não o valor
   comercial de B); salvar sem mudanças não altera `descontosTotal`.
6. **Recibo** — imprime duas linhas de recompensa e "Desconto geral" 0.
7. **Fiscal** — emitir NFC-e em homologação de venda mista com dois itens 100% descontados; produto de cada
   prêmio precisa de perfil fiscal (erro bloqueante existente); confirmar no provedor que N linhas com
   `vDesc = vProd` são aceitas (hoje já é para uma).
8. **Estatísticas** — "vendas com resgate" conta 1 e "valor das vendas com resgate" soma o total uma vez.
9. **Rascunho legado** — `ORCAMENTO` gravado com `rascunhoMetadados.recompensa` (objeto) antes do deploy é
   confirmado depois com o prêmio único e o débito certo.
10. **Loja → PDV** — pedido da loja com 2 recompensas confirmado no balcão mantém as duas (surface
    `LOJA_DIGITAL`), sem drift de preço nem aprovação de desconto espúria.
11. **POI** — solicitação `PENDENTE` criada antes do deploy é aprovada depois; solicitação nova com 2
    prêmios grava 2 `RESGATE`, back-link em ambas, fila mostra as duas.
12. **Só recompensas** — venda `valorTotal = 0` com dois prêmios continua confirmando sem pagamentos
    (verificação já feita para um no plano anterior).

Scripts existentes a rodar: `test:cashback-redemption`, `test:print-templates`,
`test:sale-client-reassignment`, `test:sales-results`, `test:ai-quotes` (sync de rascunhos), mais o novo
script do `header-discount`.

## Riscos e pontos de atenção

- **Os erros mais caros são silenciosos**: recibo, tela de edição, COGS e estatísticas não lançam — mentem.
  Por isso os leitores a jusante entram na Fase 1, junto com o servidor, e não "depois".
- **Não reintroduzir o `min(valorVenda, valor)` do POI** no PDV/loja ao unificar código: mistura moeda
  cashback (pontos) com reais.
- **Tri-estado do `PUT /api/pos/sales`** (`undefined` mantém, `null` remove) foi adicionado porque o checkout
  multi-etapas salva o rascunho sem conhecer a recompensa; a versão em lista precisa preservar exatamente
  isso (`undefined` mantém, `[]` limpa).
- **`resgateRecompensaValor` = total da linha**, não unitário — documentar no schema para o próximo leitor.
- **FIFO com bypass** para saldos importados (`redemption.ts:103-114`) continua só logando; N chamadas
  geram N warnings. Não "consertar" aqui.
- **`recompensaId` repetido no payload** deve ser rejeitado (não fundido em silêncio), para o cliente não
  mascarar bug de estado.
- Mensagens de UI singulares em ~10 pontos ("Remova a recompensa…", "Selecione uma recompensa.", "O resgate
  de recompensa foi removido…") precisam de passada de copy.

## Fora de escopo (candidatos a plano próprio)

- Combinar recompensa com cupom ou com resgate-desconto na mesma venda (exclusividade afirmada em sete
  pontos; relaxar exige a higiene D2 e um desenho de precedência).
- Quota/estoque de prêmios e limite de resgates por cliente.
- Recompensa em comanda (`lib/tabs/close-tab.ts:138` não passa resgate; `confirm/route.ts:89` rejeita `tabId`).
- Unificar origem/precificação/desconto do item de recompensa entre POI e PDV.
- CFOP de bonificação por item.

## Arquivos-âncora

| Papel | Arquivo |
|---|---|
| Snapshot e parser (client-safe) | `lib/sales/sale-reward-snapshot.ts` |
| Admissão, item e snapshot (servidor) | `lib/sales/sale-reward-redemption.ts` |
| Ponto de efeito no ledger | `lib/sales/sale-processing/process-sale-confirmation.ts:191-271` |
| Débito FIFO (não muda) | `lib/cashback/redemption.ts` |
| Reversão (não muda) | `lib/cashback/reverse-sale-cashback.ts` |
| Edição confirmada (não muda) | `lib/sales/sale-processing/process-confirmed-sale-edit.ts:214-249` |
| Rotas PDV | `app/api/pos/sales/{route,confirm,create-and-confirm,edit}/route.ts` |
| Rota loja | `app/api/shop/[orgId]/orders/route.ts`, `schemas/shop.ts` |
| Rota POI | `app/api/point-of-interaction/new-transaction/route.ts`, `transaction-requests/{public,management}/**` |
| Estado PDV / loja / POI | `state-hooks/use-sale-state.tsx`, `use-shop-order-state.tsx`, `use-point-of-interaction-new-*-transaction-request.tsx` |
| Hidratação PDV | `lib/sales/map-sale-to-sale-state.ts`, `map-sale-draft-to-sale-state.ts` |
| Recibo | `lib/desktop-agent/cupom-venda-data.ts`, `templates/cupom-venda.ts` |
| Estatísticas | `app/api/cashback-programs/stats/route.ts:244-271,428-450` |
| Fiscal (não muda; testar) | `lib/fiscal/header-discount.ts`, `taxation-context.ts:111-138` |
