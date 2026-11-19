# Custos de compra, estoque e contabilização

Este documento é a referência funcional para a implementação de custos discriminados em compras. Ele explica as decisões preservadas no [ADR-0001](../adr/0001-purchase-cost-composition-and-accounting-entry-lines.md). A classificação fiscal concreta deve ser validada com a contabilidade responsável pela organização.

## Objetivo

Uma compra precisa responder separadamente:

1. Quanto será pago ao fornecedor?
2. Quanto será incorporado ao custo do estoque?
3. Quanto será reconhecido como crédito tributário?
4. Quanto será reconhecido como despesa do período?

Misturar essas perguntas em um único `valorUnitarioLiquido` produz custo médio incorreto e lançamentos contábeis sem discriminação.

## Valor-base e modificadores

O valor-base da mercadoria continua nos campos monetários do item. `MERCADORIA` não é uma chave de modificador.

Chaves suportadas inicialmente:

| Chave               | Significado                                                                             |
| ------------------- | --------------------------------------------------------------------------------------- |
| `DESCONTO`          | Desconto, abatimento ou redução atribuída ao item                                       |
| `FRETE`             | Transporte relacionado à aquisição                                                      |
| `SEGURO`            | Seguro relacionado à aquisição                                                          |
| `DESPESA_ACESSORIA` | Manuseio ou outro valor diretamente atribuível, ou despesa separada conforme tratamento |
| `IMPOSTOS_IPI`      | IPI destacado ou atribuído ao item                                                      |
| `IMPOSTOS_ICMS_ST`  | ICMS-ST destacado ou atribuído ao item                                                  |
| `IMPOSTOS_FCP_ST`   | FCP-ST destacado ou atribuído ao item                                                   |
| `OUTRO`             | Modificador não coberto; exige descrição                                                |

Toda nova chave tributária deve começar com `IMPOSTOS_`.

Cada modificador registra:

```typescript
{
	chave: PurchaseCostModifierKey;
	valorCentavos: number;
	efeito: "ACRESCIMO" | "REDUCAO";
	tratamento: "CUSTO_ESTOQUE" | "CREDITO_TRIBUTARIO" | "DESPESA_PERIODO";
	origem: "XML" | "IA" | "MANUAL";
	documentoRef?: string | null;
	descricao?: string | null;
	rateio?: {
		metodo: "INFORMADO_ITEM" | "PROPORCIONAL_VALOR" | "PROPORCIONAL_QUANTIDADE" | "MANUAL";
	} | null;
}
```

## Tratamentos

### `CUSTO_ESTOQUE`

Capitaliza o valor no item e afeta o custo médio móvel no recebimento. Inclui normalmente valor líquido da mercadoria, transporte, seguro, manuseio diretamente atribuível e tributos não recuperáveis.

Um `DESCONTO` tratado como custo de estoque usa `REDUCAO` e diminui o custo capitalizado.

### `CREDITO_TRIBUTARIO`

O valor faz parte do documento e do passivo com o fornecedor, mas não entra no custo do produto. A contabilização debita a conta de tributo recuperável configurada.

### `DESPESA_PERIODO`

O valor faz parte do documento e do passivo, mas é reconhecido diretamente no resultado. Exemplos possíveis incluem taxa administrativa, encargo financeiro ou gasto não diretamente atribuível à colocação do estoque em sua condição e localização atuais.

## Regra contábil orientadora

O CPC 16 determina que o custo de aquisição inclui preço de compra, tributos não recuperáveis, transporte, seguro, manuseio e outros gastos diretamente atribuíveis, deduzidos descontos e abatimentos. Tributos recuperáveis, despesas administrativas não atribuíveis, despesas de venda e perdas anormais não compõem o custo normal do estoque.

A chave não decide o tratamento sozinha. Por exemplo, `IMPOSTOS_IPI` pode ser `CUSTO_ESTOQUE` ou `CREDITO_TRIBUTARIO` conforme a operação e o regime fiscal.

## Totais derivados

Para cada item:

```text
valor financeiro = valor-base líquido
                 + acréscimos de todos os tratamentos
                 - reduções de todos os tratamentos

valor total de custo = valor-base líquido
                     + acréscimos CUSTO_ESTOQUE
                     - reduções CUSTO_ESTOQUE

valor de crédito tributário = acréscimos CREDITO_TRIBUTARIO
                             - reduções CREDITO_TRIBUTARIO

valor de despesa do período = acréscimos DESPESA_PERIODO
                            - reduções DESPESA_PERIODO

valor unitário de custo = valor total de custo / quantidade interna
```

Todos os rateios e somatórios intermediários usam centavos inteiros. Colunas SQL monetárias usam tipos exatos, nunca ponto flutuante novo.

## Rateio

Valores declarados por item são preservados como `INFORMADO_ITEM`. Valores declarados apenas no total do documento são distribuídos por:

- valor líquido do item, padrão;
- quantidade, quando escolhido;
- atribuição manual.

O algoritmo de maior resto distribui centavos residuais em ordem estável. Para cada modificador documental:

```text
soma das parcelas dos itens = valor declarado no documento
```

## Recebimento e custo médio

Ao receber a compra, o módulo persiste `valorTotalCusto` e `valorUnitarioCusto` e os utiliza na movimentação de entrada:

```text
novo custo médio =
  (valor do estoque anterior + valor de custo recebido)
  / quantidade posterior
```

Composição, valores, quantidade e produto ficam congelados depois que a entrada de estoque é criada. Correções precisam reverter ou reprocessar a entrada explicitamente.

O valor efetivo do lançamento congela junto: depois do recebimento ele já bate com os itens e com as linhas contábeis gravadas, então alterá-lo desfaria a igualdade sem nada a reprocessar. Reprogramar pagamento continua livre. A tela desabilita o campo e o servidor recusa a mudança.

## Linhas contábeis

As contas ficam em `configuracao.defaults.contabilidade.lancamentosPadrao.compras`: a compra é o único lançamento padrão com mais de um débito, e os débitos extras são pernas do mesmo lançamento, não um bloco de configuração paralelo.

| Tratamento           | Conta                              |
| -------------------- | ---------------------------------- |
| `CUSTO_ESTOQUE`      | `debitoContaId`                    |
| `CREDITO_TRIBUTARIO` | `debitoCreditoTributarioContaId`   |
| `DESPESA_PERIODO`    | `debitoDespesaPeriodoContaId`      |
| total a pagar        | `creditoContaId` (crédito)         |

As linhas são geradas pela conta resultante, não pelas chaves dos modificadores:

```text
CUSTO_ESTOQUE       → débito em estoque
CREDITO_TRIBUTARIO  → débito em tributo recuperável configurado
DESPESA_PERIODO     → débito em despesa configurada
total a pagar       → crédito em fornecedores
```

Exemplo:

```text
Mercadoria líquida       R$ 100
Frete capitalizado       R$  10
Despesa do período       R$   5
IPI recuperável          R$   8
Total a pagar            R$ 123
```

```text
Débito — Estoques                  R$ 110
Débito — Despesa configurada       R$   5
Débito — IPI a recuperar           R$   8
Crédito — Fornecedores             R$ 123
```

Para todo lançamento:

```text
soma dos débitos = soma dos créditos = valor do lançamento
```

## Destino do item

Todo item de compra é um produto — a entidade dos bens físicos —, mas nem todo produto comprado vira estoque. Material de manutenção, reforma ou uso e consumo é comprado com nota e entra na compra como qualquer outro item, só que o custo dele vai direto para uma conta própria.

O destino é escolhido **na entrada da nota**, item a item (`purchase_items.conta_contabil_id`). Não existe destino padrão por produto, por fornecedor nem por organização além do de sempre: nulo é o débito padrão de compras (a conta de estoque). A tela oferece "Destino da nota" para preencher todos os itens de uma vez e o seletor por linha para a nota mista.

**Regra central: o item só movimenta estoque quando o destino é o estoque.** Com conta própria, o recebimento não gera saldo, custo médio nem lote, e o custo do item (`valorTotalCusto`: mercadoria + modificadores `CUSTO_ESTOQUE`) é debitado na conta escolhida em vez da conta de estoque. Assim o saldo físico (quantidade × custo médio) e a conta de estoque nunca divergem.

| Destino              | Estoque físico          | Débito do custo do item         |
| -------------------- | ----------------------- | ------------------------------- |
| nulo (estoque)       | entrada, custo médio, lote | `debitoContaId` (Estoques)   |
| conta de despesa     | nenhum                  | a conta (ex.: Manutenção e Reparos) |
| conta de ativo       | nenhum                  | a conta (ex.: Benfeitorias)     |

- Só contas de natureza ativo, custo ou despesa são aceitas. Escolher a própria conta de estoque grava nulo, para que a decisão de estoque dependa só do item gravado — nunca de uma configuração que pode mudar entre o recebimento e um cancelamento.
- O recebimento e o estorno leem o destino **gravado** no item, então entrada e saída de estoque ficam simétricas.
- Produto novo criado por um item fora do estoque nasce sem rastreio de estoque e não vendável. A disponibilidade para venda é decidida na compra, produto a produto, e o padrão é não vendável.
- Tributos de item fora do estoque: a tela passa IPI, ICMS-ST e FCP-ST marcados como crédito (ou sem tratamento) para `CUSTO_ESTOQUE`, que no item fora do estoque significa custo debitado na conta de destino. Material de uso e consumo não dá crédito de ICMS/IPI, e o crédito de ativo imobilizado (CIAP) não é apurado aqui. É sugestão da tela; a regra concreta deve ser confirmada com a contabilidade.
- Compra recebida: os itens continuam congelados, com uma exceção — trocar a conta de um item **entre contas fora do estoque** (manutenção → benfeitorias) só refaz as linhas contábeis. Entrar ou sair do estoque exige cancelar e refazer a compra.

Exemplo de nota mista:

```text
Débito — Estoques                      R$ 800
Débito — Manutenção e Reparos          R$ 150
Débito — Benfeitorias                  R$  50
Crédito — Fornecedores                 R$ 1.000
```

O plano de contas padrão traz Imobilizado (1.6, com Máquinas, Móveis e Equipamentos 1.6.1 e Benfeitorias em Imóveis de Terceiros 1.6.2), Manutenção e Reparos (6.6) e Material de Uso e Consumo (6.7). Organizações anteriores recebem essas contas por `scripts/provision-purchase-destination-accounts.ts`, que só cria contas cujo código está livre.

## Cancelamento

`POST /api/purchases/cancel` (o `PUT` recusa a transição para `CANCELADA`). Cancelar:

1. desfaz a entrada de estoque dos itens que entraram no estoque (exige lotes intactos);
2. estorna o lançamento **linha a linha** (`buildReversalAccountingEntryLines`): cada linha volta com a natureza invertida, na mesma conta — inverter só o par legado perderia as pernas de destino próprio e de tributos;
3. aplica a decisão escolhida para cada parcela.

| Parcela  | Opções                                                                                   |
| -------- | ---------------------------------------------------------------------------------------- |
| Pendente | `CANCELAR` — deixa de ser devida · `MANTER` — continua devida (multa, valor negociado)    |
| Paga     | `DEVOLUCAO` — o fornecedor devolve, vira entrada prevista · `PERDA` — o valor não volta  |

O que fica com a organização sem contrapartida (`MANTER` + `PERDA`) é o **custo do cancelamento**: o estorno não o devolve a Fornecedores e o debita na conta escolhida (padrão: a conta de despesas do período de compras). O estorno mantém o valor do lançamento original e continua balanceado:

```text
Compra de R$ 1.000 em manutenção, R$ 400 pagos e assumidos como perda, R$ 600 pendentes cancelados

Estorno: Crédito — Manutenção e Reparos   R$ 1.000
         Débito  — Fornecedores           R$   600
         Débito  — Despesa do cancelamento R$   400
```

A parcela pendente cancelada ganha `data_cancelamento` e sai de contas a pagar/receber, fluxo de caixa, conciliação e estatísticas, mas continua no histórico do lançamento. Só parcela pendente é cancelada: dinheiro que já se moveu vira devolução ou perda. As devoluções nascem como transações de entrada pendentes no lançamento de estorno (`accounting_entries.compra_id`, origem `ESTORNO`).

## Importação documental

XML de NF-e é interpretado deterministicamente e nunca enviado a um modelo de IA. PDF e imagem usam o extrator visual existente, mas ambos produzem a mesma forma normalizada.

O snapshot do documento preserva referência local, chave de acesso, identificação, totais originais e hash. Modificadores dos itens apontam para essa referência local.

O snapshot **não** guarda bucket nem caminho: o objeto privado é localizado por `referencia` mais a organização da sessão, em `buildPurchaseImportedDocumentPath` (`lib/purchase/imported-documents.ts`). Um caminho transportado no payload seria um caminho forjável, e `documentosImportados` não entra pelo cabeçalho da compra — entra por `importedDocuments`, validado à parte.

## Casos que devem permanecer cobertos por testes

- Frete direto aumenta custo de estoque.
- Imposto recuperável afeta o passivo e o crédito tributário, não o custo médio.
- Imposto não recuperável aumenta custo de estoque.
- Desconto reduz custo de estoque.
- Despesa do período afeta o passivo, não o custo médio.
- Rateio fecha exatamente em centavos.
- Compra recebida não aceita alteração silenciosa de custos.
- Linhas contábeis sempre se balanceiam.
- Item com destino próprio debita a conta escolhida e não gera linha de estoque.
- Estorno inverte cada linha e retém o custo do cancelamento sem desbalancear.
- Resolução de parcela incompatível com o estado dela (pendente × paga) é recusada.
- XML malformado, com DTD ou entidade customizada é rejeitado.

## Manutenção

Mudanças nas chaves, tratamentos, fórmulas, regras de rateio ou contabilização exigem atualização conjunta deste documento, do ADR e dos testes. Comentários no código devem explicar apenas invariantes locais e apontar para estes documentos, evitando cópias divergentes da regra completa.
