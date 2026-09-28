# Importação histórica do Phibo

## Fonte e objetivo

O arquivo local `.local-analysis/phibo/vendas-raw-2026-06-28-a-2026-09-28.json` contém 93 dias, 422 vendas, 721 itens, 272 telefones distintos e 370 EANs. Todas as vendas têm nome, telefone, nota NFC-e, itens e detalhamento de pagamento. Em 401 vendas o e-mail está vazio. A soma das parcelas de pagamento fecha com a soma dos itens em todas as 422 vendas (tolerância R$ 0,02); frete e desconto de cabeçalho também fecham com as linhas. Não há IDs de venda repetidos nem falhas de extração. A amostra de 29/06 teve os mesmos 92 cupons lidos pelos cartões da interface.

O objetivo é registrar esse período como **histórico de vendas externas**, antes de a loja passar a operar o ERP do RecompraCRM. A importação não deve criar movimentação financeira, estoque, emissão fiscal, cashback ou disparos de campanhas retroativos.

## Dry run no banco atual

Executado em transação `READ ONLY` para a organização `Use e abluse` (`b75a88a2-ef7c-4ff5-a53c-4e227791cad3`). O relatório completo está em `.local-analysis/phibo/import-preview-2026-06-28-a-2026-09-28.json` e pode ser reproduzido com `npm run preview:phibo-import`. Nenhuma linha foi escrita.

| Entidade | Já encontrada pela chave exata | Seria criada sem de-para |
| --- | ---: | ---: |
| Clientes por telefone base | 57 | 215 |
| Produtos por EAN em `codigo`/variante | 0 | 370 |
| Vendedores por identificador | 0 | 2 |
| Vendas por `vendasUuid` | 0 | 422 |

Há 185 clientes, 810 produtos e 1 vendedor cadastrados na organização. Dos 215 telefones novos, 9 têm nome igual ao de algum cadastro existente, exigindo revisão antes de criar. Dois EANs têm candidato com nome, cor e tamanho idênticos no catálogo; 59 têm prefixo de descrição semelhante, sem garantir identidade. O vendedor `JESSICA` tem candidato no cadastro existente `Jessica de Lima`, mas o identificador não coincide. As 422 vendas somam R$ 87.994,60, com R$ 1.988,92 de frete e R$ 11.975,58 de descontos/cupom. O arquivo passou nas verificações de itens, parcelas, descontos, frete, IDs e telefones.

Os 370 produtos e 2 vendedores são o resultado **mecânico** do mapeamento por código. Não devem ser criados antes de revisar o de-para, porque o catálogo atual parece usar códigos diferentes dos EANs do Phibo.

### De-para revisado (28/09/2026)

O preview agora lê `.local-analysis/phibo/import-mapping.json` (local e ignorado pelo Git). Cada exceção usa `vincular` com `destinoId`, `criar` ou `revisar`, sempre com um `motivo`. O arquivo fixa `organizacaoId` e `periodo`; o script rejeita chaves da fonte desconhecidas, IDs fora da organização e decisões que conflitam com uma correspondência exata. A saída inclui uma linha por identidade/EAN/vendedor e as pendências. `npm run preview:phibo-import` continua usando uma transação `READ ONLY`.

| Entidade | Vincular | Criar na configuração | Revisar |
| --- | ---: | ---: | ---: |
| Clientes | 59 (57 por telefone, 2 por nome e e-mail) | 206 | 7 |
| Produtos | 2 (descrição, cor e tamanho exatos) | 0 | 368 |
| Vendedores | 1 (`JESSICA` → Jessica de Lima) | 1 (`Juliana`) | 0 |

Nos nove clientes cujo nome coincide com um cadastro existente, dois também têm e-mail igual e único; os outros sete não têm segundo identificador, portanto seguem para revisão. Uma checagem dos demais telefones novos não encontrou outros e-mails correspondentes nem telefones da fonte com nomes ou e-mails conflitantes. O vínculo de `JESSICA` usa o único cadastro de vendedor com primeiro nome igual, mas a evidência é de confiança média.

Nenhum dos 368 EANs restantes foi marcado para criação automaticamente. A fila local `.local-analysis/phibo/product-mapping-queue.json` traz até três candidatos por EAN, com ID, código, nome, atributos e pontuação usada apenas para ordenação. A triagem separou 248 itens com candidatos parciais e 120 sem candidato plausível; mesmo estes últimos podem representar nomes diferentes do mesmo produto. A revisão aprofundada do catálogo está em `.local-analysis/phibo/product-mapping-review.json`; o levantamento de identidades está em `.local-analysis/phibo/identity-mapping-review.json`. O preview informa `deParaCompleto: false` até que todas as pendências sejam decididas.

### Segunda revisão semântica dos 368 EANs

Luna e Terra revisaram a fila por descrição, modelagem, cor e tamanho. Os pareceres individuais estão em `.local-analysis/phibo/product-semantic-review-a.json`, `product-semantic-review-a-support.json`, `product-semantic-review-a-support-2.json` e `product-semantic-review-b.json`. O consolidado aplicado está em `.local-analysis/phibo/product-semantic-consolidated.json`. A avaliação conservadora de Luna manteve a primeira metade em revisão; a leitura independente de Terra forneceu as decisões aplicadas. Dez vínculos propostos por Terra foram devolvidos à revisão final porque a fonte e o catálogo não confirmam o mesmo atributo (cor, modelagem, decote ou tamanho).

O de-para de produtos, incluindo os dois vínculos exatos iniciais, passou a **68 vinculados, 48 criações propostas e 254 pendentes**. A prévia foi reexecutada em transação somente leitura; as 370 chaves estão cobertas e nenhum vínculo aponta para um produto inexistente ou para o mesmo destino de outro EAN. Os 254 casos pendentes receberam parecer individual, mas não têm evidência suficiente para um vínculo ou uma criação confiável só pelo texto disponível. Clientes seguem com 7 pendências. `deParaCompleto` continua `false` e nenhuma importação foi executada.

## Importação aplicada

O usuário autorizou tratar os 254 EANs pendentes como produtos novos. Os sete clientes sem identidade confirmada também foram criados separadamente, evitando junção apenas por nome. O de-para final gerou 68 vínculos com produtos existentes e 302 produtos históricos novos. O arquivo anterior ficou em `.local-analysis/phibo/import-mapping-before-apply.json`.

Foi adicionada a origem `PHIBO` ao enum de integração; a migração `drizzle/0078_phibo_integration_type.sql` foi aplicada ao banco. A conexão de proveniência `c3316b03-2d50-4446-b241-fe8c2941245b` tem `ativo=false`, configuração `{tipo:"PHIBO",modo:"HISTORICO"}` e não entra no polling. O comando `npm run import:phibo-history -- --apply` persistiu 422 vendas em lotes de 40 via `persistCanonicalBatch({mode:"HISTORICO"})`, com 721 itens, 213 clientes, 302 produtos e 1 vendedor criados. Os produtos novos foram desativados (`ativo=false`, `vendavel=false`). A primeira execução está registrada em `.local-analysis/phibo/import-result-first-run.json`.

A soma persistida é R$ 87.994,60. Todas as vendas têm cliente, vendedor e pagamentos históricos nos metadados; todos os itens têm produto. As tabelas relacionadas por `venda_id` de estoque, contabilidade, documento fiscal, cashback, conversão e disparos têm zero registros ligados a essas vendas. Uma segunda execução da mesma carga resultou em **0 vendas/clientes/produtos/vendedores criados e 422 vendas inalteradas**; o relatório está em `.local-analysis/phibo/import-result-2026-06-28-a-2026-09-28.json`.

## Caminho técnico

1. Validar o JSON com um schema específico do Phibo e produzir um relatório de prévia sem escrever no banco. Rejeitar datas ou valores inválidos, IDs repetidos, venda sem cliente/telefone/itens e diferença superior a R$ 0,02 entre total dos itens e parcelas. Conferir o período e o destino (`organizacaoId`) explicitamente.
2. Criar uma origem `PHIBO` na modelagem de integrações, com uma linha de proveniência **inativa para o polling**. `vendasUuid` é o `sourceSaleId`/`idExterno`. A linha deve ter uma identidade estável para que reexecuções usem o mesmo `integrationId` e a proteção de colisão do `syncSales` funcione. Não colocar token do navegador nem o JSON no banco.
3. Mapear cada venda para `TCanonicalSale` e montar `TCanonicalImportBatch` em blocos cronológicos de 25–50 vendas. Chamar `persistCanonicalBatch` com `mode: "HISTORICO"`. Esse modo já desliga cashback, campanhas e atribuição; usa a política de ERP sem efeitos de estoque, financeiro e fiscal. A assinatura externa e o par integração/ID externo tornam a reexecução idempotente.
4. Após o último bloco, chamar `recomputeClientMetricsForOrganization`. A rotina de importação atualiza métricas ao salvar cada venda, mas a recomputação garante primeira/última compra corretas quando há compras anteriores na organização.
5. Emitir relatório final: vendas lidas/criadas/inalteradas, clientes criados/associados, produtos encontrados/criados, valores, colisões e rejeições. Exigir contagens e totais reconciliados antes de considerar o processo concluído.

## Mapeamento da venda

| Phibo | Canônico / destino | Regra |
| --- | --- | --- |
| `vendasUuid` | `sourceSaleId`, `sales.idExterno` | Chave de deduplicação; preservar o UUID literal. |
| `dataHora` | `occurredAt` | Timestamp com offset UTC; mostrar/validar no fuso `America/Sao_Paulo`. |
| `clienteNome`, `clienteFone`, `clienteEmail` | `client` | Normalizar telefone com `formatToPhone`/`formatPhoneAsBase`; usar `EXTERNAL_ID_THEN_PHONE` com `externalId: null`. Não casar apenas pelo nome. |
| `detalhamento.vendedorNomeAbreviado` | `sellerName`, `seller` | Identificador e nome conforme a fonte, quando presente. |
| `itens[].produtoEan` | `productCode`, `productExternalId` | EAN é a chave de correspondência. Guardar cor/grade e dados originais no `metadata` do item. |
| `detalhamento.itensVenda[]` | valores de `TCanonicalSaleItem` | `subTotal` bruto, `desconto`, `frete`, `valorTotal` líquido. Custo histórico desconhecido fica zero, sem inventar margem. |
| `valorDesconto` + `valorCupom`; `valorFrete` | `totalDiscount`; `totalSurcharge` | `totalValue` é a soma de `itensVenda.valorTotal`, igual à soma das parcelas. |
| `nfeChaveAcesso`, `nfeNumero`, `nfeModelo`, `nfeSerie` | `key`, `document`, `model`, `series` | Preservar como dados fiscais históricos; não reemitir NFC-e. |
| `origemVenda`, `nfeStatus` | `channel`, `statusText` | Neste arquivo, todas as vendas são `PDV` e todas as notas estão `Emitida`; validar em cada lote, sem generalizar para outras extrações. |

## Decisões antes da escrita

**Catálogo:** O pipeline só grava itens quando consegue resolver o produto pelo código/variante/vínculo. Há 370 EANs. A prévia deve cruzá-los com o catálogo da organização. Para EANs sem correspondência, definir se serão criados produtos históricos mínimos ou se o catálogo será migrado antes. Criar um produto por EAN sem esse confronto pode duplicar variantes e prejudicar o futuro ERP.

**Pagamentos:** `TCanonicalSale.payments` não gera lançamentos para vendas externas comuns no `syncSales`; o financeiro gerenciado só se aplica a canais com política própria. Os dados do Phibo têm método, parcelas e situação. Preservá-los como metadados históricos tipados ou em tabela de referência, sem criar contas a receber já quitadas. Não reutilizar `prePago` do iFood, cuja semântica é outra.

**Identidade da organização:** O nome “Use e Abluse” não é chave técnica. O comando de importação deve receber `--organization-id` e fazer uma prévia mostrando o nome da organização, o número de vendas existentes e colisões antes de permitir a gravação.

**Corte temporal:** Fixar 28/09/2026 como fim deste arquivo. As vendas registradas diretamente no RecompraCRM depois do corte não devem entrar novamente por uma nova extração do Phibo. Uma eventual janela de sobreposição exige conciliação explícita por cupom/NFC-e.

## Arquivos de implementação sugeridos

- `lib/data-connectors/phibo/types.ts` e `mappers.ts`: validação e conversão pura do JSON.
- `scripts/preview-phibo-import.ts`: auditoria de clientes, EANs, totais e colisões, sem escrita.
- `scripts/import-phibo-history.ts`: leitura local, confirmação do destino via argumento, lotes, checkpoint e relatório final.
- Migração e enums para a origem `PHIBO`; registrar a conexão de proveniência sem habilitar polling.

Testar o mapper com vendas que tenham desconto, frete, várias parcelas e vários itens. Testar reexecução do mesmo arquivo para verificar zero novas vendas e zero novos itens.
