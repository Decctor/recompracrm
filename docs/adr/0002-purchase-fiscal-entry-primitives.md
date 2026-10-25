# ADR-0002 — Primitivos da entrada fiscal de compras

- Status: Aceito
- Data: 2026-10-25
- Estende: [ADR-0001](./0001-purchase-cost-composition-and-accounting-entry-lines.md)
- Plano de implementação: [`docs/dev-planning/purchase-fiscal-entry-plan.md`](../dev-planning/purchase-fiscal-entry-plan.md)

## Contexto

A composição de custo do ADR-0001 cobre a compra de mercadoria para revenda com tributos
destacados na nota (IPI, ICMS-ST, FCP-ST) e tratamento escolhido pelo operador. Ela não representa:

- tributo **embutido** no preço cujo crédito é tomado (ICMS próprio, PIS, COFINS, crédito de ICMS
  do Simples): o modelo só soma ou subtrai do valor devido ao fornecedor;
- valor devido a **quem não é o fornecedor** (DIFAL, antecipação parcial, ICMS-ST recolhido pelo
  destinatário, frete por CT-e): todo acréscimo engorda a duplicata do fornecedor;
- aquisição que **não é estoque de revenda** (insumo, uso e consumo, ativo imobilizado): o item de
  compra assume estoque e a conta de estoques;
- a **nota recebida** como origem da compra: `fiscal_inbound_documents.compraId` existe e nunca é
  preenchido; XMLs enviados à mão vivem só no snapshot da compra, fora do catálogo de arquivos;
- **com quem** é cada dívida ou crédito: nenhuma estrutura financeira tem contraparte.

## Decisão

### Teste para criar tabela

Mantido do ADR-0001 e aplicado a cada fato novo: **uma coisa só ganha tabela se tem identidade e
ciclo de vida próprios, independentes de quem a contém.** O que nasce, muda e morre com o pai é
campo ou JSONB no pai; o que pode ser recalculado a partir de fatos guardados não é guardado.

Resultado: uma tabela nova (`fixed_assets`) e colunas em tabelas existentes.

### 1. Documento fiscal de entrada é um primitivo único

Todo XML com chave de acesso vira uma linha em `fiscal_inbound_documents`, venha do DF-e ou de
upload (`provedor = MANUAL`). A tabela ganha `modelo` (`NFE | CTE`) e `xmlArquivoId`/`pdfArquivoId`
apontando para `files`; os caminhos atuais são sombra até o backfill.

Documentos sem chave (cupom, recibo, leitura por IA) continuam só em `purchases.documentosImportados`,
que passa a carregar `arquivoId` e `documentoFiscalId` e deixa de derivar caminho por `referencia`.

`compraId` é 1:1 com compra nesta decisão.

### 2. Fatos declarados pelo documento não são copiados

O item de compra guarda um ponteiro — `documentoRef` (referência em `documentosImportados`) e
`documentoItem` (`det/@nItem`). CFOP, CST/CSOSN, bases, alíquotas, `rastro` e ST retido são lidos
do `det` apontado pela mesma função usada no import (`readNfeItemFacts`). Consequência: o arquivo
fiscal referenciado nunca é apagado nem substituído, exceto na exclusão da organização.

### 3. Natureza do produto e destinação do item

Um enum, `AcquisitionNatureEnum = REVENDA | INSUMO | USO_CONSUMO | ATIVO_IMOBILIZADO`, em dois
lugares:

- `products.natureza` — o que o produto **é** para a organização. Produto é o catálogo de tudo que
  ela adquire ou vende; material de consumo e bens do ativo também são produtos. Define padrões
  do cadastro e o default das compras. Não substitui `vendavel` nem `rastreamentoEstoqueAtivo`.
- `purchase_items.destinacao` — para que **esta** aquisição serve. Tributação, conta contábil e
  recebimento decidem por ela, nunca pelo cadastro. Pode divergir da natureza, com aviso.

`supplier_product_mappings.destinacao` guarda a última destinação usada por código do fornecedor.

A natureza da **operação** (compra, bonificação, consignação, remessa, devolução, complementar)
não é guardada: é decidida pelo CFOP no import. Compra vira item; bonificação vira item com
componente `BONIFICACAO`; o restante não vira item de compra. O CFOP de entrada é função pura de
(CFOP do emitente, destinação) e também não é guardado.

### 4. Componente de valor ganha contrapartida

`modificadoresCusto` continua `versao: 1`. Cada componente ganha, de forma aditiva:

```typescript
contrapartida: "FORNECEDOR" | "FISCO" | "TRANSPORTADORA" | "INCLUSO_NO_VALOR"; // default FORNECEDOR
origem: ... | "CALCULO";
memoriaCalculo?: { base; aliquota; aliquotaInterestadual?; metodo? } | null;
```

`contrapartida` responde "de onde vem este valor": soma à dívida com o fornecedor, gera dívida com
outro credor, ou já estava dentro do valor-base. `INCLUSO_NO_VALOR` substitui a ideia de um efeito
de reclassificação: tira valor do custo e o leva ao tratamento sem mudar dívida alguma.

Chaves novas, todas tributárias com prefixo `IMPOSTOS_`: `IMPOSTOS_ICMS`, `IMPOSTOS_ICMS_SN`,
`IMPOSTOS_PIS`, `IMPOSTOS_COFINS`, `IMPOSTOS_DIFAL`, `IMPOSTOS_FCP_DIFAL`, `IMPOSTOS_ANTECIPACAO`,
`IMPOSTOS_ICMS_ST_ENTRADA`, `IMPOSTOS_IBS`, `IMPOSTOS_CBS`; e `BONIFICACAO`.

Bonificação é um desconto incondicional de 100% (CPC 16): componente `BONIFICACAO`, `REDUCAO`,
`CUSTO_ESTOQUE`, `FORNECEDOR`, valor igual ao valor-base. Custo e dívida da linha zeram.

Fórmula:

```text
dívida com o fornecedor = valor-base + Σ componentes FORNECEDOR (com sinal)
dívida com cada credor  = Σ componentes FISCO | TRANSPORTADORA daquele credor
custo de estoque        = valor-base
                        + Σ CUSTO_ESTOQUE (com sinal, contrapartida ≠ INCLUSO_NO_VALOR)
                        − Σ INCLUSO_NO_VALOR
crédito tributário      = Σ CREDITO_TRIBUTARIO (com sinal, inclusive INCLUSO_NO_VALOR)
despesa do período      = Σ DESPESA_PERIODO   (com sinal, inclusive INCLUSO_NO_VALOR)
```

Invariantes:

- `INCLUSO_NO_VALOR` exige tratamento ≠ `CUSTO_ESTOQUE` e efeito `ACRESCIMO`.
- Σ `INCLUSO_NO_VALOR` do item ≤ valor-base líquido do item.
- `custo + crédito + despesa = dívida com o fornecedor + dívidas com terceiros`, em centavos.
- Um snapshot sem `contrapartida` produz exatamente o resultado anterior a esta decisão.

### 5. Dívida é lançamento contábil; um lançamento por contrapartida e documento

Não há tabela de obrigações. `accounting_entries` ganha `compraId`. A compra passa a ter um
lançamento por (contrapartida, documento), com `chaveIdempotencia =
compra:{compraId}:{contrapartida}:{documentoRef}`. Origem `COMPRA` para fornecedor e
transportadora; nova origem `TRIBUTO_COMPRA` para o fisco. `purchases.lancamentoContabilId`
continua apontando para o lançamento do fornecedor, como sombra de compatibilidade.

Status de uma guia é a transação financeira liquidada ou não; vencimento é `dataPrevisao`.
`financial_transactions` ganha `documentoCobrancaArquivoId` e `comprovanteArquivoId` — o boleto do
fornecedor e a guia do DIFAL são o mesmo conceito.

### 6. Contraparte vive no lançamento, não nas linhas

`accounting_entries` ganha `clienteId` e `fornecedorId` (FKs anuláveis; no máximo uma preenchida).
A contraparte é do **título**; as parcelas e as linhas a herdam. Nas linhas ela seria um razão
auxiliar que permitiria dois credores no mesmo lançamento, quebrando "um lançamento = um título" e
a reconciliação das parcelas com o valor de face.

Derivada da origem (venda → cliente; compra → fornecedor ou transportadora) e editável só em
`MANUAL` e `RECORRENCIA`. `financial_recurring_rules` ganha as mesmas colunas. O fisco não é
contraparte: a origem `TRIBUTO_COMPRA` o identifica.

### 7. Regras de tratamento não são tabela

Três camadas: preset em código por `(regime, destinação, chave, CRT do emitente)`; override da
organização em `fiscalConfiguracao.entrada.tratamentos`; memória de destinação no de-para.
Parâmetros por UF e a conversão de CFOP de entrada são código puro com vigência.

### 8. Bem patrimonial é a única tabela nova

`fixed_assets`: produto (o que o bem é), item de compra de origem, plaqueta, local, responsável,
status, `quantidade`, `valorAquisicao`, `dataInicioUso`, `vidaUtilMeses`, `valorResidual`,
`depreciacaoAcumuladaInicial`, `creditoIcmsCiap`, dados de baixa.

Depreciação acumulada e cronograma do CIAP são funções do bem e da data; não há tabela de
parcelas. Um lançamento mensal por organização, origem `PATRIMONIO`, `chaveIdempotencia =
patrimonio:{org}:{yyyy-mm}`, é o registro do mês. Baixa parcial e plaqueta individual são divisão
do registro (reduz a quantidade do original, cria outro com a parte separada).

### 9. Recebimento por destinação

| Destinação                  | Estoque             | Contabilidade                    |
| --------------------------- | ------------------- | -------------------------------- |
| `REVENDA`, `INSUMO`         | `ENTRADA_AQUISICAO` | conta de estoques da destinação  |
| `USO_CONSUMO` rastreado     | `ENTRADA_AQUISICAO` | material de consumo (ativo)      |
| `USO_CONSUMO` não rastreado | nenhum              | despesa de consumo               |
| `ATIVO_IMOBILIZADO`         | nenhum              | imobilizado; cria `fixed_assets` |

Sem tipo novo de movimentação de estoque. O lançamento contábil da `SAIDA` manual de produtos de
consumo é follow-up, fora deste ADR.

## Alternativas rejeitadas

### Snapshot fiscal por item (`dadosFiscais` JSONB)

Cria segunda verdade sobre o que o documento declarou. O XML é guardado e o parse é
determinístico; o ponteiro basta.

### Tabela de obrigações tributárias

Uma obrigação é uma dívida, e dívida já é lançamento + transações. Uma tabela repetiria
vencimento, valor, pagamento e comprovante.

### Efeito `RECLASSIFICACAO` separado de `credor`

São a mesma pergunta ("este valor é devido a quem — ou já estava no preço?"). Dois campos
permitiriam combinações sem sentido (reclassificação devida ao fisco).

### Enum de natureza do produto com os 12 tipos do SPED

O sistema distingue quatro comportamentos. O mapeamento para o SPED é derivável quando a
escrituração existir.

### Contraparte nas linhas contábeis

Ver decisão 6.

### Tabelas de regras de entrada e de parâmetros por UF

A decisão depende de regime × destinação × tributo (preset) e de 27 linhas por UF. Código
versionado e revisado; tabela só se a atualização precisar dispensar deploy.

### Tabelas de depreciação e de parcelas do CIAP

Derivadas de campos do bem e da data. O lançamento mensal idempotente já guarda o resultado.

## Consequências

- Arquivo fiscal referenciado por documento ou item não pode ser apagado nem substituído.
- Compras recebidas antes desta decisão permanecem com snapshot v1 sem `contrapartida`, com o
  mesmo resultado de custo; não há reprocessamento retroativo.
- O motor fiscal de saída continua Simples-only; para Presumido e Real a entrada fica correta, mas
  o ciclo crédito × débito só fecha quando a saída suportar esses regimes.
- Mudanças em chaves, contrapartidas, fórmula, regras de rateio ou contabilização exigem atualizar
  este ADR, o guia de domínio e os testes no mesmo conjunto de mudanças.

## Referências

- [CPC 16 (R1) — Estoques](https://conteudo.cvm.gov.br/export/sites/cvm/menu/regulados/normascontabeis/cpc/CPC_16_R1_rev_12.pdf)
- [CPC 27 — Ativo Imobilizado](https://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos/Pronunciamento?Id=58)
- [LC 87/96 (Lei Kandir), art. 20 e 33](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp87.htm) — crédito de ICMS sobre ativo (CIAP) e uso e consumo
- [`docs/domain/purchase-costing.md`](../domain/purchase-costing.md)
