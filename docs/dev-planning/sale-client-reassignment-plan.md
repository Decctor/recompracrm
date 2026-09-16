# Troca e definição de cliente em venda confirmada — plano

Data: 2026-09-16
Status: **Implementado** (fase única entregue em 2026-09-16)

## O problema em uma frase

Uma venda confirmada nasce sem cliente ("ao consumidor") ou com o cliente errado, e hoje a única saída é cancelar e refazer — mas o cliente da venda é a raiz de efeitos que não são triviais de mover: acúmulo de cashback, atribuição de campanha, métricas de recompra do cliente e o destinatário do documento fiscal.

## Desenho central: uma primitiva, não duas features

"Definir cliente" e "trocar cliente" são a mesma operação: **reatribuir a venda do cliente X para o cliente Y**, onde X pode ser nulo (definir) e Y pode ser nulo (desvincular). A implementação é um único processador; as três variantes caem de graça.

## O que já existe e é reaproveitado

- **Reversão de cashback**: `lib/cashback/reverse-sale-cashback.ts` — a lógica de escrita (CANCELAMENTO, EXPIRADO, saldo) é reaproveitada, **mas a query não**: ela seleciona por `vendaId` apenas, o que inclui o acúmulo do parceiro (`acumuloValorParceiro`) e o RESGATE. O parceiro pertence à venda (`parceiroId`), não ao comprador, e não pode ser tocado.
- **Acúmulo**: `accumulateCashbackForClient` (`lib/cashback/accumulation.ts`) — guarda de idempotência por (venda, cliente), então Y recebe uma linha nova mesmo com a linha de X expirada.
- **Elegibilidade de acúmulo**: `processSaleCashbackAccumulationIfEligible` — CONFIRMADA + totalmente paga. A reatribuição usa a mesma régua.
- **Derivados do cliente**: `recomputeClientDerivedDataSafely` (`lib/clients/recompute.ts`), criado para o merge de duplicados — metadados de compra, RFM, vínculos vendedor × cliente e produto × cliente, best-effort, com o cron noturno como rede de segurança.
- **Regras fiscais**: `saleHasLiveFiscalDocument` e a regra de devolução autorizada em `lib/sales/sale-editability.ts`.
- **Log de edição**: `rascunhoMetadados.edicoes[]`, o mesmo do `process-confirmed-sale-edit.ts`.
- **Lock de histórico de compra**: `lockClientPurchaseHistory` (`lib/coupons/purchase-history.ts`) — a "primeira compra" de Y muda com a reatribuição.
- **Molde de rota e UI**: `app/api/pos/sales/edit/route.ts` e `components/Modals/Sales/CancelConfirmedSaleDialog.tsx`.

## Decisões de escopo (fechadas)

| Dimensão                                     | Decisão                                                                    | Racional                                                                                                                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vendas externas                              | **Não elegíveis**                                                          | Não somos a fonte da verdade; o re-sync reescreve `clienteId` quando a assinatura muda.                                                                                                           |
| Rascunho / cancelada                         | Não elegíveis                                                              | O rascunho troca cliente no checkout; a cancelada é congelada.                                                                                                                                    |
| Venda de conta (`tabId`)                     | Não elegível                                                               | O cliente vive na conta; edita-se pela conta.                                                                                                                                                     |
| Resgate de cashback (desconto ou recompensa) | **Recusa**                                                                 | X recebe o saldo de volta, mas Y não tem saldo para ser debitado e o total da venda já carrega o desconto: qualquer "transferência" é um presente ao par. Cancele e refaça.                       |
| Cupom resgatado                              | **Recusa**                                                                 | `limiteResgatesPorCliente`, cupons de primeira compra e atribuições a cliente específico tornam o resgate sem sentido para Y.                                                                     |
| NF-e (modelo 55) viva                        | **Recusa**                                                                 | A CC-e não altera destinatário. A regularização é cancelamento na janela ou devolução + nova emissão. Uma NF-e em nome de X com a venda em nome de Y é exatamente o que uma fiscalização procura. |
| NFC-e viva com CPF de X                      | Permite com confirmação explícita                                          | Não há evento de correção para o modelo 65; o CPF é só identificação do consumidor.                                                                                                               |
| NFC-e sem CPF ou sem documento               | Permite sem confirmação                                                    | Fiscalmente é um no-op. É o caso mais comum: "cliente pediu CPF na nota" é definir o cliente e emitir.                                                                                            |
| Acúmulo de X parcialmente consumido          | Permite                                                                    | Reverte o que resta e registra o não estornado no log — mesma regra do cancelamento hoje.                                                                                                         |
| Campanhas de comportamento para Y            | **Não dispara**                                                            | Mesmo princípio do merge: é operação de dados, não comportamento do cliente.                                                                                                                      |
| Validade do acúmulo de Y                     | `createdAt = dataVenda`                                                    | A validade não pode se estender por causa da troca.                                                                                                                                               |
| Atribuição de campanha                       | Apaga a conversão de X, zera `atribuicao*`, `atribuicaoProcessada = false` | Foi calculada contra as interações de X. Não reprocessa aqui: Y não deve ganhar campanhas por uma operação de dados, e a venda fica coerente para qualquer backfill futuro.                       |
| Permissão                                    | `vendas.editar`                                                            | Mesma da edição.                                                                                                                                                                                  |

## Regra de elegibilidade (pura, testada)

`lib/sales/sale-client-reassignment-policy.ts` — `resolveSaleClientReassignmentPolicy(row)` devolve `{ elegivel, motivos, confirmacaoFiscalExigida, documentoFiscal }`. A rota usa para a prévia e o processador re-executa sob lock. Um caso de teste por linha da tabela acima.

## Transação

`lib/sales/sale-processing/process-sale-client-reassignment.ts`, na ordem:

1. `SELECT ... FOR UPDATE` na venda; `lockClientPurchaseHistory` para X e Y quando presentes; re-executa a política.
2. **Cashback sai**: `transferSaleCashbackAccumulation` (`lib/cashback/transfer-sale-accumulation.ts`) — reversão **restrita ao comprador** (`vendaId` + `clienteId` + `ACÚMULO`), CANCELAMENTO com `motivo: "VENDA_REATRIBUIDA"`, apaga as interações não executadas das campanhas de cashback de X.
3. Atualiza `sales.clienteId`, `saleItems.clienteId` (denormalizado; alimenta produto × cliente) e o título do lançamento contábil.
4. **Cashback entra**: `accumulateCashbackForClient` para Y só quando a venda está totalmente paga, com `createdAt: dataVenda`.
5. Atribuição: delete em `campaignConversions` da venda + reset das colunas na venda.
6. Log em `rascunhoMetadados.edicoes[]`: `{ tipo: "CLIENTE", clienteAnteriorId, clienteNovoId, cashbackEstornado, cashbackNaoEstornado, cashbackAcumulado, fiscalDesatualizado }`.

Pós-commit, best-effort: `recomputeClientDerivedDataSafely` para X e Y; depois `processSaleAutomaticFiscalEmissionIfEligible` (idempotente) — é o que faz "definir cliente e a NF-e de entrega finalmente emitir" funcionar sem uma segunda ação.

## API e UI

- `GET /api/sales/client?saleId=` — prévia: cliente atual, política (motivos, confirmação fiscal), cashback estornável e não estornável.
- `PATCH /api/sales/client` — `{ saleId, clienteId | null, confirmacoes: { fiscal } }`.
- `lib/queries/sales.ts` → `useSaleClientReassignmentPreview`; `lib/mutations/sales.ts` → `reassignSaleClient`.
- `components/Modals/Sales/ReassignSaleClientDialog.tsx`, aberto por "Trocar cliente" / "Definir cliente" no `SaleFulfillmentDetailsMenu`. Recusas aparecem como estado desabilitado com o motivo, nunca como submit falho. O checkbox fiscal só aparece quando a prévia pede.

## Verificações feitas na implementação

- Retentativa de NFC-e pendente após a troca: o provedor Spedy reconstrói o payload do contexto da venda em cada envio (`mapSaleContextToSpedyInvoicePayload`), então uma pendente sai em nome de Y. O `snapshotOrigemVenda` gravado na criação do documento continua com X — é a fonte da leitura de "CPF na nota" da política.
- Atribuição de vendas internas: hoje a confirmação do PDV não roda `processConversionAttribution` (só o import e o POI rodam), e o cron `fix-previous-sales` reprocessa apenas vendas importadas. Zerar as colunas mantém a venda coerente; não há backfill a disparar.
