# Cashback — Recompensa avulsa

> Implementado. Migração `drizzle/0152_cashback_free_form_reward.sql` (aplicação manual).
> Contexto: uma organização com programa em pontos troca prêmios que variam demais para manter
> cadastrados. Pediu um resgate "como o de recompensa", mas em que o valor é digitado na hora.

## Decisão

Uma terceira forma de resgate no ponto de interação, ao lado de desconto e recompensa do catálogo:
o operador **descreve** o que o cliente leva e **digita** quanto debitar (na moeda do programa). O
resgate vive **só no ledger** — uma transação `RESGATE` com `resgate_recompensa_descricao` — e não
gera venda.

| Coluna                                                              | Papel                                        |
| ------------------------------------------------------------------- | -------------------------------------------- |
| `ampmais_cashback_programs.modalidade_recompensa_avulsa_permitida`   | Liga a recompensa avulsa (default `false`)   |
| `ampmais_cashback_program_transactions.resgate_recompensa_descricao` | O que saiu, quando não há item de catálogo   |

## Por que não só tirar o bloqueio de "venda de valor zero"

O bloqueio é da UI (`state.sale.valor <= 0` no wizard), mas o problema é o modelo do desconto: o
máximo resgatável é `min(saldo, valorVenda, limite)`, então com venda zero o máximo é zero — e um
limite percentual sobre zero também bloqueia. Além disso, o desconto trata 1 ponto como R$ 1.
Forçar uma venda de R$ 0 para carregar o resgate contaria compra (`metadataTotalCompras`), mexeria
na frequência do RFM e dispararia campanhas de primeira compra para algo que não é compra.

## Por que não um "prêmio de valor variável" no catálogo

Prêmio exige vínculo com produto (`validatePrizeForRedemption`) e vira item de venda. Um prêmio
genérico "Prêmio diverso" criaria itens de um produto que não existe e um caso especial no
validador. A recompensa avulsa não toca o catálogo.

## Regras

- **Sub-modalidade da troca por recompensas**: vale só com `modalidade_recompensas_permitida`
  ligada (`isFreeFormRewardAllowed`). Desligar a troca grava a avulsa como `false`.
- **Superfície**: só o ponto de interação, e respeita `resgate_permitir_via_ponto_integracao`.
- **Sem venda, sem acúmulo, sem limite de resgate** (o limite é do desconto em dinheiro). Sem
  confirmação de valor de venda (`poiSaleRequiresValueConfirmation`).
- **Não combina** com recompensas do catálogo, cupom ou desconto em cashback.
- **Sem evento de campanha.** O evento de compra do POI é `COMPRA_CONFIRMADA`, e `contabilizarCompra: false`
  só zera os totais: `PRIMEIRA-COMPRA` (cliente sem compras) e `NOVA-COMPRA` sem valor mínimo
  disparariam um "obrigado pela compra" para uma troca de pontos. A recompensa avulsa não grava evento.
- O estorno usa o `consumoFifo` gravado na transação, como os demais resgates.

## Fluxos

- **Totem**: Recompensas → "Outra recompensa" → descrição + valor → confirmação com a senha do
  operador. Programa sem prêmios cadastrados mostra só a entrada avulsa.
- **Celular do cliente → fila de aprovação**: o cliente só descreve. O operador digita o débito na
  aprovação (`operatorFreeFormRewardValue`, mesmo desenho do desconto do cupom `MANUAL`), vendo o
  saldo do cliente. O valor aprovado volta no `resultadoProcessamento` e é gravado no resumo.

Código: `lib/point-of-interaction/free-form-reward.ts` (regras, client-safe) e o ramo
`isFreeFormRedemption` de `app/api/point-of-interaction/new-transaction/route.ts`.

Testes: `npm run test:cashback-redemption` (regras e resumo) e `npm run test:poi-free-form-reward`
(integração contra PostgreSQL em memória: débito, ausência de venda e acúmulo, recusas).
