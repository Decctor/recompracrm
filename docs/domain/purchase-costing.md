# Custos de compra, estoque e contabilização

Este documento é a referência funcional para a implementação de custos discriminados em compras. Ele explica as decisões preservadas no [ADR-0001](../adr/0001-purchase-cost-composition-and-accounting-entry-lines.md) e no [ADR-0002](../adr/0002-purchase-fiscal-entry-primitives.md). A classificação fiscal concreta deve ser validada com a contabilidade responsável pela organização.

## Objetivo

Uma compra precisa responder separadamente:

1. Quanto será pago ao fornecedor?
2. Quanto será pago a outros credores (fisco, transportadora)?
3. Quanto será incorporado ao custo do estoque (ou do bem)?
4. Quanto será reconhecido como crédito tributário?
5. Quanto será reconhecido como despesa do período?

Misturar essas perguntas em um único `valorUnitarioLiquido` produz custo médio incorreto e lançamentos contábeis sem discriminação.

## Documento, item e produto

**Documento fiscal.** Todo XML com chave de acesso é uma linha em `fiscal_inbound_documents`, venha do DF-e ou de upload. O arquivo vive no catálogo `files` (`xmlArquivoId`, `pdfArquivoId`). Documentos sem chave (cupom, recibo, leitura por IA) ficam só no snapshot `purchases.documentosImportados`, com `arquivoId`.

**Fatos declarados.** O item não copia CFOP, CST, bases ou alíquotas. Ele aponta para o documento (`documentoRef`) e para o item do XML (`documentoItem` = `det/@nItem`); quem precisa desses fatos os lê do XML pela mesma função do import (`readNfeItemFacts`). Por isso um arquivo fiscal referenciado nunca é apagado nem substituído.

**Natureza e destinação.** Produto é o catálogo de tudo que a organização adquire ou vende. `products.natureza` diz o que o produto **é** (`REVENDA`, `INSUMO`, `USO_CONSUMO`, `ATIVO_IMOBILIZADO`) e define padrões; `purchase_items.destinacao`, com o mesmo enum, diz para que **esta** aquisição serve. Tributação, conta contábil e recebimento decidem pela destinação. Divergir da natureza é permitido, com aviso.

**Natureza da operação.** Não é guardada. O CFOP do emitente decide no import: compra vira item; bonificação (5910/6910) vira item com componente `BONIFICACAO`; consignação, remessa, transferência e devolução não viram item de compra.

## Valor-base e modificadores

O valor-base da mercadoria continua nos campos monetários do item. `MERCADORIA` não é uma chave de modificador.

Chaves suportadas:

| Chave                      | Significado                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `DESCONTO`                 | Desconto, abatimento ou redução atribuída ao item                                       |
| `BONIFICACAO`              | Linha bonificada: redução de 100% do valor-base (CPC 16); custo e dívida da linha zeram |
| `FRETE`                    | Transporte relacionado à aquisição (na nota ou por CT-e)                                |
| `SEGURO`                   | Seguro relacionado à aquisição                                                          |
| `DESPESA_ACESSORIA`        | Manuseio ou outro valor diretamente atribuível, ou despesa separada conforme tratamento |
| `IMPOSTOS_IPI`             | IPI destacado ou atribuído ao item                                                      |
| `IMPOSTOS_ICMS`            | ICMS próprio embutido no preço (crédito quando o regime permite)                        |
| `IMPOSTOS_ICMS_SN`         | Crédito de ICMS concedido por fornecedor do Simples (`vCredICMSSN`)                     |
| `IMPOSTOS_ICMS_ST`         | ICMS-ST destacado ou atribuído ao item                                                  |
| `IMPOSTOS_FCP_ST`          | FCP-ST destacado ou atribuído ao item                                                   |
| `IMPOSTOS_ICMS_ST_ENTRADA` | ICMS-ST recolhido pelo destinatário na entrada                                          |
| `IMPOSTOS_DIFAL`           | Diferencial de alíquota em aquisição interestadual para uso/consumo ou ativo            |
| `IMPOSTOS_FCP_DIFAL`       | FCP devido junto com o DIFAL                                                            |
| `IMPOSTOS_ANTECIPACAO`     | Antecipação parcial do ICMS exigida por algumas UFs                                     |
| `IMPOSTOS_PIS`             | PIS embutido no preço                                                                   |
| `IMPOSTOS_COFINS`          | COFINS embutida no preço                                                                |
| `IMPOSTOS_IBS`             | IBS (reforma tributária)                                                                |
| `IMPOSTOS_CBS`             | CBS (reforma tributária)                                                                |
| `OUTRO`                    | Modificador não coberto; exige descrição                                                |

Toda nova chave tributária deve começar com `IMPOSTOS_`.

Cada modificador registra:

```typescript
{
	chave: PurchaseCostModifierKey;
	valorCentavos: number;
	efeito: "ACRESCIMO" | "REDUCAO";
	tratamento: "CUSTO_ESTOQUE" | "CREDITO_TRIBUTARIO" | "DESPESA_PERIODO";
	// De onde vem o valor. Ausente = FORNECEDOR (snapshots anteriores ao ADR-0002).
	contrapartida?: "FORNECEDOR" | "FISCO" | "TRANSPORTADORA" | "INCLUSO_NO_VALOR";
	origem: "XML" | "IA" | "MANUAL" | "CALCULO";
	documentoRef?: string | null;
	descricao?: string | null;
	memoriaCalculo?: { base: number; aliquota: number; aliquotaInterestadual?: number; metodo?: string } | null;
	rateio?: {
		metodo: "INFORMADO_ITEM" | "PROPORCIONAL_VALOR" | "PROPORCIONAL_QUANTIDADE" | "MANUAL";
	} | null;
}
```

## Contrapartidas

A contrapartida responde "de onde vem este valor?":

### `FORNECEDOR`

Soma-se (ou subtrai-se) à dívida com o fornecedor da nota. É o comportamento padrão e o único que existia antes do ADR-0002.

### `FISCO` e `TRANSPORTADORA`

O valor é devido a outro credor e gera um lançamento contábil próprio (ver "Lançamentos por credor"). Exemplos: DIFAL, antecipação parcial, ST por entrada, frete de CT-e.

### `INCLUSO_NO_VALOR`

O valor já está dentro do valor-base. Não muda dívida alguma; apenas tira valor do custo e o leva ao tratamento. É assim que o crédito de ICMS, PIS e COFINS embutidos no preço é tomado. Exige tratamento ≠ `CUSTO_ESTOQUE` e efeito `ACRESCIMO`, e a soma dos componentes `INCLUSO_NO_VALOR` de um item não pode passar do seu valor-base líquido.

## Tratamentos

### `CUSTO_ESTOQUE`

Capitaliza o valor no item e afeta o custo médio móvel no recebimento (ou o valor de aquisição do bem, quando a destinação é ativo). Inclui normalmente valor líquido da mercadoria, transporte, seguro, manuseio diretamente atribuível e tributos não recuperáveis.

Um `DESCONTO` tratado como custo de estoque usa `REDUCAO` e diminui o custo capitalizado.

### `CREDITO_TRIBUTARIO`

O valor não entra no custo do produto. A contabilização debita a conta de tributo recuperável configurada. Com contrapartida `FORNECEDOR` ele faz parte do passivo com o fornecedor; com `INCLUSO_NO_VALOR` ele é parte do valor-base que deixa de ser custo.

### `DESPESA_PERIODO`

O valor é reconhecido diretamente no resultado. Exemplos possíveis incluem taxa administrativa, encargo financeiro ou gasto não diretamente atribuível à colocação do estoque em sua condição e localização atuais.

## Regra contábil orientadora

O CPC 16 determina que o custo de aquisição inclui preço de compra, tributos não recuperáveis, transporte, seguro, manuseio e outros gastos diretamente atribuíveis, deduzidos descontos e abatimentos. Tributos recuperáveis, despesas administrativas não atribuíveis, despesas de venda e perdas anormais não compõem o custo normal do estoque. Bonificações reduzem o custo, por isso a linha bonificada entra a custo zero.

A chave não decide o tratamento sozinha. Por exemplo, `IMPOSTOS_IPI` pode ser `CUSTO_ESTOQUE` ou `CREDITO_TRIBUTARIO` conforme a operação e o regime fiscal.

## Regras de tratamento

O tratamento é sugerido em três camadas e confirmado pela pessoa; o item guarda o resultado e a `descricao` explica a origem ("ICMS como crédito — preset Lucro Real · revenda"):

1. **Preset por regime** (`lib/fiscal/entry/presets.ts`), função pura de (regime tributário, destinação, chave, CRT do emitente). Fornecedor do Simples (CRT 1) só gera `IMPOSTOS_ICMS_SN`, nunca `IMPOSTOS_ICMS`. Uso e consumo e ativo imobilizado não geram crédito de ICMS próprio na entrada (LC 87/96, art. 33); o ativo tem o CIAP.
2. **Override da organização** em `fiscalConfiguracao.entrada.tratamentos[destinacao][chave]`.
3. **Memória** da destinação no de-para fornecedor-produto.

Parâmetros por UF (alíquota interna, método do DIFAL, antecipação) e a conversão de CFOP de entrada são código puro com vigência, não tabela.

## Totais derivados

Para cada item:

```text
dívida com o fornecedor = valor-base líquido
                        + acréscimos com contrapartida FORNECEDOR
                        - reduções   com contrapartida FORNECEDOR

dívida com cada credor  = acréscimos com contrapartida FISCO | TRANSPORTADORA daquele credor

valor total de custo    = valor-base líquido
                        + acréscimos CUSTO_ESTOQUE (contrapartida ≠ INCLUSO_NO_VALOR)
                        - reduções   CUSTO_ESTOQUE
                        - componentes INCLUSO_NO_VALOR

valor de crédito tributário = acréscimos CREDITO_TRIBUTARIO (inclusive INCLUSO_NO_VALOR)
                             - reduções CREDITO_TRIBUTARIO

valor de despesa do período = acréscimos DESPESA_PERIODO (inclusive INCLUSO_NO_VALOR)
                            - reduções DESPESA_PERIODO

valor unitário de custo = valor total de custo / quantidade interna
```

Invariante, em centavos:

```text
custo + crédito tributário + despesa = dívida com o fornecedor + dívidas com outros credores
```

Um snapshot sem `contrapartida` produz exatamente os totais anteriores ao ADR-0002. `valorTotalLiquido` permanece como sinônimo de "dívida com o fornecedor" para os leitores existentes.

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

## Recebimento por destinação

Ao receber a compra, o módulo persiste `valorTotalCusto` e `valorUnitarioCusto` e ramifica pela destinação do item:

| Destinação          | Estoque                                              | Débito contábil                                                                                                                                   | Outros efeitos                               |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `REVENDA`, `INSUMO` | `ENTRADA_AQUISICAO`                                  | conta de estoques da destinação                                                                                                                   | lotes por `rastro` quando houver             |
| `USO_CONSUMO`       | `ENTRADA_AQUISICAO` só se o produto rastreia estoque | conta configurada para uso e consumo (padrão: despesa 6.6 "Material de Uso e Consumo"; quem controla almoxarifado aponta para uma conta de ativo) | sai pela `SAIDA` manual existente            |
| `ATIVO_IMOBILIZADO` | nenhum                                               | imobilizado                                                                                                                                       | cria `fixed_assets` com a quantidade do item |

Para estoque:

```text
novo custo médio =
  (valor do estoque anterior + valor de custo recebido)
  / quantidade posterior
```

Composição, valores, quantidade, produto e destinação ficam congelados depois que a entrada de estoque (ou o bem) é criada. Correções precisam reverter ou reprocessar a entrada explicitamente. Desfazer o recebimento remove bens que ainda não entraram em lançamento `PATRIMONIO`; com algum já lançado, é recusado.

O valor efetivo do lançamento congela junto: depois do recebimento ele já bate com os itens e com as linhas contábeis gravadas, então alterá-lo desfaria a igualdade sem nada a reprocessar. Reprogramar pagamento continua livre. A tela desabilita o campo e o servidor recusa a mudança.

## Lançamentos por credor

Uma compra gera **um lançamento contábil por contrapartida e documento**. A dívida com cada credor é um título próprio, com suas parcelas em `financial_transactions`; é isso que mantém a invariante "as transações reconciliam com o valor de face do lançamento".

| Contrapartida    | Origem           | `chaveIdempotencia`                               | Contraparte (`accounting_entries`)    |
| ---------------- | ---------------- | ------------------------------------------------- | ------------------------------------- |
| `FORNECEDOR`     | `COMPRA`         | `compra:{compraId}:FORNECEDOR:{documentoRef}`     | `fornecedorId` da compra              |
| `TRANSPORTADORA` | `COMPRA`         | `compra:{compraId}:TRANSPORTADORA:{documentoRef}` | `fornecedorId` da transportadora      |
| `FISCO`          | `TRIBUTO_COMPRA` | `compra:{compraId}:FISCO:{documentoRef}`          | nenhuma; a UF vem da `memoriaCalculo` |

`purchases.lancamentoContabilId` continua apontando para o lançamento do fornecedor. A contraparte vive no lançamento, não nas linhas: um lançamento é um título, com um credor ou devedor. Guia e comprovante são anexos da parcela (`financial_transactions.documentoCobrancaArquivoId`, `comprovanteArquivoId`); o status da guia é a parcela liquidada ou não.

## Linhas contábeis

As contas ficam em `configuracao.defaults.contabilidade.lancamentosPadrao.compras`: a compra é o único lançamento padrão com mais de um débito, e os débitos extras são pernas do mesmo lançamento, não um bloco de configuração paralelo.

| Tratamento / destino                   | Conta                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `CUSTO_ESTOQUE`                        | `contasDebitoPorDestinacao[destinacao]` (fallback: `debitoContaId`)                   |
| `CREDITO_TRIBUTARIO`                   | `contasCreditoTributarioPorChave[chave]` (fallback: `debitoCreditoTributarioContaId`) |
| `DESPESA_PERIODO`                      | `debitoDespesaPeriodoContaId`                                                         |
| dívida com fornecedor / transportadora | `creditoContaId` (crédito)                                                            |
| dívida com o fisco                     | `creditoTributoCompraContaId` (crédito)                                               |

As linhas são geradas pela conta resultante, não pelas chaves dos modificadores:

```text
Lançamento do fornecedor (e da transportadora)
  CUSTO_ESTOQUE (contrapartida do credor)   → débito na conta da destinação
  CREDITO_TRIBUTARIO (inclusive INCLUSO)    → débito em tributo recuperável
  DESPESA_PERIODO (inclusive INCLUSO)       → débito em despesa
  dívida com o credor                       → crédito em fornecedores

Lançamento do fisco
  componentes FISCO, pelo tratamento        → débito na conta da destinação ou em tributo recuperável
  dívida com o fisco                        → crédito em obrigações tributárias
```

Exemplo 1 — revenda, Simples Nacional (o que já existia):

```text
Mercadoria líquida       R$ 100
Frete capitalizado       R$  10
Despesa do período       R$   5
IPI recuperável          R$   8
Dívida com o fornecedor  R$ 123
```

```text
Débito — Estoques                  R$ 110
Débito — Despesa configurada       R$   5
Débito — IPI a recuperar           R$   8
Crédito — Fornecedores             R$ 123
```

Exemplo 2 — Lucro Real, compra interestadual de um bem para uso (ativo), ICMS 12% destacado,
alíquota interna 18%, base única (números ilustrativos; a base do DIFAL e o crédito do ativo
dependem de regime e UF):

```text
Valor-base                              R$ 5.000
IMPOSTOS_ICMS  600  INCLUSO_NO_VALOR  CREDITO_TRIBUTARIO (CIAP)
IMPOSTOS_DIFAL 300  FISCO             CUSTO_ESTOQUE
```

```text
Lançamento do fornecedor (COMPRA)
  Débito — Imobilizado                 R$ 4.400
  Débito — ICMS a recuperar (CIAP)     R$   600
  Crédito — Fornecedores               R$ 5.000

Lançamento do fisco (TRIBUTO_COMPRA)
  Débito — Imobilizado                 R$   300
  Crédito — Obrigações tributárias     R$   300
```

Custo do bem: R$ 4.700. Fecha: 4.700 + 600 + 0 = 5.000 + 300.

Para todo lançamento:

```text
soma dos débitos = soma dos créditos = valor do lançamento
```

## Patrimônio

Cada item recebido com destinação `ATIVO_IMOBILIZADO` cria um registro em `fixed_assets` com a quantidade do item e `valorAquisicao` = `valorTotalCusto`. Depreciação acumulada e cronograma do CIAP (1/48 por mês) são funções do bem e da data, não tabelas. Um lançamento mensal por organização, origem `PATRIMONIO`, `chaveIdempotencia = patrimonio:{org}:{yyyy-mm}`, é o registro do mês. Baixa parcial e plaqueta individual são divisão do registro.

## Importação documental

XML de NF-e é interpretado deterministicamente e nunca enviado a um modelo de IA. PDF e imagem usam o extrator visual existente, mas ambos produzem a mesma forma normalizada.

O snapshot do documento preserva referência local, chave de acesso, identificação, totais originais, hash e `arquivoId`. Quando o XML tem chave, o snapshot também aponta para a linha em `fiscal_inbound_documents` (`documentoFiscalId`). Modificadores e itens apontam para a referência local.

O snapshot **não** guarda bucket nem caminho: o arquivo é resolvido por `arquivoId`, conferindo a organização da linha em `files`. Um caminho transportado no payload seria um caminho forjável, e `documentosImportados` não entra pelo cabeçalho da compra — entra por `importedDocuments`, validado à parte.

Validações bloqueantes do import: destinatário diferente da organização; chave já vinculada a outra compra; nota complementar (`finNFe = 2`) sem compra referenciada. XML sem protocolo de autorização gera aviso.

## Casos que devem permanecer cobertos por testes

- Frete direto aumenta custo de estoque.
- Imposto recuperável afeta o passivo e o crédito tributário, não o custo médio.
- Imposto não recuperável aumenta custo de estoque.
- Desconto reduz custo de estoque.
- Despesa do período afeta o passivo, não o custo médio.
- Componente `INCLUSO_NO_VALOR` reduz o custo e cria crédito sem alterar a dívida com o fornecedor.
- Componente `FISCO` cria dívida própria e, conforme o tratamento, custo ou crédito; nunca altera a dívida com o fornecedor.
- Bonificação zera custo e dívida da linha e não gera parcela.
- Snapshot sem `contrapartida` produz exatamente os totais anteriores.
- `custo + crédito + despesa = dívida com o fornecedor + dívidas com terceiros`, em centavos.
- Rateio fecha exatamente em centavos.
- Lançamentos por credor são idempotentes pela `chaveIdempotencia`.
- Compra recebida não aceita alteração silenciosa de custos.
- Linhas contábeis sempre se balanceiam.
- Job do patrimônio é idempotente; baixa no mês 20 apropria só 20 parcelas de CIAP.
- XML malformado, com DTD ou entidade customizada é rejeitado.
- XML com destinatário de outra organização é rejeitado.

## Manutenção

Mudanças nas chaves, contrapartidas, tratamentos, fórmulas, regras de rateio ou contabilização exigem atualização conjunta deste documento, dos ADRs e dos testes. Comentários no código devem explicar apenas invariantes locais e apontar para estes documentos, evitando cópias divergentes da regra completa.
