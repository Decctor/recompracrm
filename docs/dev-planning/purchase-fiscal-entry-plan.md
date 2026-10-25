# Plano: entrada fiscal de compras para cenários complexos

Contexto: a entrada de compras resolve bem o caso "mercadoria para revenda com IPI/ICMS-ST
destacado e tratamento escolhido à mão". Ela não cobre crédito de tributo embutido no preço
(ICMS próprio, PIS, COFINS), tributo devido a quem não é o fornecedor (DIFAL, antecipação, ST por
entrada, frete de CT-e) nem aquisições que não viram estoque de revenda (insumo, uso e consumo,
ativo imobilizado). A nota recebida via DF-e também não vira compra: `fiscal_inbound_documents.compraId`
existe e nunca é preenchido.

Este plano estende — não substitui — o [ADR-0001](../adr/0001-purchase-cost-composition-and-accounting-entry-lines.md)
e o guia [`docs/domain/purchase-costing.md`](../domain/purchase-costing.md). As decisões abaixo
viram o ADR-0002 antes de qualquer código.

A classificação fiscal concreta (qual tributo é crédito em qual regime, base do DIFAL por UF,
alíquotas internas) **deve ser validada com a contabilidade**. O sistema sugere por regra; ele não
é a fonte de verdade tributária.

---

## Estado atual relevante

| Peça                   | Onde                                                                  | Observação                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parser de NF-e         | `lib/purchase/import-xml.ts`                                          | Determinístico. Lê vDesc, vFrete, vSeg, vOutro, vIPI, vICMSST, vFCPST. **Ignora** vICMS, vPIS, vCOFINS, vCredICMSSN, CFOP, CST/CSOSN, orig, `rastro`, ST retido, `dest`, `finNFe`, `IBSCBS`. |
| Custeio                | `lib/purchase/costing.ts`                                             | `financeiro = bruto ± modificadores`; `custo = bruto ± modificadores CUSTO_ESTOQUE`. Reduções fora de CUSTO_ESTOQUE são recusadas (`costing.ts:107`).                                        |
| Modificador            | `PurchaseCostModifierSchema` (`schemas/purchases.ts`)                 | chave, valorCentavos, efeito, tratamento, origem, documentoRef, rateio. Todo valor é implicitamente devido ao fornecedor.                                                                    |
| Tratamento             | `applyTaxTreatment` (`.../builder/helpers/review-lines.ts`)           | Sempre manual. Nenhuma regra.                                                                                                                                                                |
| Item de compra         | `purchase_items`                                                      | `produtoId` NOT NULL; implicitamente sempre estoque de revenda.                                                                                                                              |
| Documentos da compra   | `purchases.documentosImportados` (JSONB)                              | Arquivo em `organizations/{org}/purchase-imports/{ref}` via `storePrivateFile` — fora do catálogo `files`.                                                                                   |
| Nota recebida          | `fiscal_inbound_documents`                                            | Só para DF-e. `xmlStoragePath`/`pdfStoragePath` como caminho — fora do catálogo `files`. Unique (org, chaveAcesso).                                                                          |
| Lançamento da compra   | `syncPurchaseAccountingLines` (`app/api/purchases/route.ts`)          | Débitos por tratamento; um único crédito (Fornecedores). Um lançamento por compra (`purchases.lancamentoContabilId`).                                                                        |
| Lançamentos com origem | `accounting_entries`                                                  | Já têm `vendaId`, `loteId` e `chaveIdempotencia` com unique (org, chave).                                                                                                                    |
| Transação financeira   | `financial_transactions`                                              | Parcelas e liquidações de um lançamento; sem anexo.                                                                                                                                          |
| Produto                | `products`                                                            | `vendavel`, `rastreamentoEstoqueAtivo`, `tipo` (texto livre legado). Nada diz o que o produto **é** para a empresa.                                                                          |
| Configuração fiscal    | `organizations.fiscalConfiguracao` (`OrganizationFiscalConfigSchema`) | Já tem `regimeTributario`, CNPJ, IE, UF.                                                                                                                                                     |

---

## Primeiros princípios

### Os fatos irredutíveis de uma entrada

Toda entrada, por mais complexa, se reduz a cinco fatos:

1. **Um documento declarou algo.** Emitente, destinatário, itens, tributos. É imutável, tem
   identidade (chave de acesso) e um ciclo de vida externo (autorizada, cancelada, manifestada).
2. **Algo foi adquirido.** Um produto, numa quantidade, com uma **destinação**: vender, produzir,
   consumir ou usar como bem.
3. **O valor se decompõe.** Cada parcela tem uma origem (de onde veio o valor), um destino (custo,
   crédito ou despesa) e uma contrapartida (a quem se deve, ou "já estava no preço").
4. **Alguém passou a ser credor.** Fornecedor, fisco, transportadora. Cada dívida é paga e
   comprovada.
5. **Se é um bem, ele passa a existir individualmente.** Tem identidade, se deprecia e um dia é
   baixado.

### O teste para virar tabela

O mesmo do ADR-0001: **uma coisa só ganha tabela se tem identidade e ciclo de vida próprios,
independentes de quem a contém.** Se ela nasce, muda e morre junto com o pai, é campo ou JSONB
no pai. Se pode ser recalculada a partir de fatos já guardados, não é guardada.

Aplicando o teste a cada fato:

| Fato                                         | Identidade e ciclo próprios?                                          | Primitivo                                     | Já existe?                                                     |
| -------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Documento declarou                           | Sim (chave, cancelamento, manifestação, pode servir a várias compras) | Linha de documento fiscal + arquivo           | **Sim**: `fiscal_inbound_documents` + `files` — só generalizar |
| Fatos declarados por item (CFOP, CST, bases) | Não; são do documento e o XML é a fonte                               | Ponteiro do item para o `det` do XML          | Re-parse determinístico                                        |
| Algo foi adquirido                           | Sim (já é o item)                                                     | `purchase_items` + destinação                 | **Sim** — uma coluna                                           |
| O que o produto é                            | Propriedade do cadastro                                               | Coluna no produto                             | **Sim** — uma coluna                                           |
| Decomposição do valor                        | Não; vive e morre com o item                                          | Componente no JSONB do item                   | **Sim**: `modificadoresCusto` — um campo novo                  |
| Credor e dívida                              | Sim, mas já modelado                                                  | Lançamento contábil + transações financeiras  | **Sim** — falta só ligar à compra                              |
| Guia, boleto, comprovante                    | Propriedade da parcela                                                | `arquivoId` na transação financeira           | **Sim** — duas colunas                                         |
| Regras de tratamento                         | Não variam por organização na maior parte                             | Presets em código + overrides em configuração | **Sim**: `fiscalConfiguracao`                                  |
| Parâmetros por UF                            | Dado de referência pequeno e versionado                               | Constante em código com vigência              | Código                                                         |
| Bem patrimonial                              | **Sim** (plaqueta, uso, baixa)                                        | Tabela nova                                   | **Não** — única tabela nova                                    |
| Depreciação, CIAP                            | Não; são função do bem e do tempo                                     | Cálculo + lançamento mensal idempotente       | `chaveIdempotencia`                                            |

### O que mudou em relação à primeira versão deste plano

| Proposta anterior                                         | Decisão                                                                                  | Por quê                                                                                                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `purchase_items.dadosFiscais` (JSONB grande)              | **Cortado** → ponteiro `documentoRef` + `documentoItem`                                  | Os fatos declarados são do documento e o XML guardado é a fonte. Copiá-los cria uma segunda verdade. Quem precisar (escrituração, ST retido) re-parseia o `det` apontado.                          |
| `naturezaEntrada` (coluna + enum de 7 valores)            | **Cortado**                                                                              | Decidida pelo CFOP **no import**: compra entra, bonificação entra com um componente, o resto não vira item de compra. Não é estado que precise ser guardado.                                       |
| `cfopEntrada` (coluna)                                    | **Cortado**                                                                              | Função pura de (CFOP do emitente, destinação). Calculado quando for usado.                                                                                                                         |
| `products.tipoItem` com os 12 valores do SPED             | **Simplificado** → `natureza` com 4 valores, mesmo enum da destinação                    | O que o sistema faz hoje só distingue quatro comportamentos. O SPED não é gerado; quando for, o mapeamento é derivável e o enum cresce.                                                            |
| Efeito `RECLASSIFICACAO` + campo `credor`                 | **Fundidos** num único campo `contrapartida`                                             | São a mesma pergunta: "esse valor é devido a quem — ou já estava no preço?".                                                                                                                       |
| Modificador v2                                            | **Cortado** → continua `versao: 1`                                                       | O campo novo é aditivo e o default (`FORNECEDOR`) reproduz exatamente a semântica atual.                                                                                                           |
| `purchase_obligations` (tabela)                           | **Cortado** → lançamento por contrapartida com `compraId`                                | Uma obrigação é uma dívida: isso já é lançamento + transações. Status = transação liquidada ou não. Vencimento = `dataPrevisao`.                                                                   |
| `fiscal_entry_rules` (tabela)                             | **Cortado** → presets em código + overrides em `fiscalConfiguracao` + memória no de-para | A decisão depende de regime × destinação × tributo, que é o preset. Exceção por produto já cabe no de-para fornecedor-produto. Tabela só com demanda provada.                                      |
| `fiscal_uf_parameters` (tabela global)                    | **Cortado** → `lib/fiscal/entry/uf-parameters.ts`                                        | 27 linhas com vigência. Código é versionado e revisado; tabela só se precisar de atualização sem deploy.                                                                                           |
| `fixed_asset_depreciations`, `fixed_asset_icms_credits`   | **Cortados**                                                                             | A depreciação linear e o cronograma do CIAP são funções do bem e da data. O lançamento mensal guarda o resultado (inclusive o coeficiente do CIAP do mês) e a `chaveIdempotencia` impede duplicar. |
| `fixed_asset_files`                                       | **Adiado**                                                                               | A nota do bem já está na compra. Anexos múltiplos (foto, laudo) quando houver demanda.                                                                                                             |
| Propósitos `GUIA_TRIBUTO` e `COMPROVANTE_PAGAMENTO`       | **Fundidos** em `DOCUMENTO_FINANCEIRO`                                                   | Mesmo conteúdo, mesma validação, mesmo destino (transação financeira).                                                                                                                             |
| `files.retidoAte`                                         | **Cortado**                                                                              | Não há exclusão de arquivo pelo usuário. A invariante é: arquivo referenciado por documento fiscal não é apagado, exceto na exclusão da organização.                                               |
| Origens `OBRIGACAO_COMPRA`, `DEPRECIACAO`, `CREDITO_CIAP` | **Reduzidas** a `TRIBUTO_COMPRA` e `PATRIMONIO`                                          | O que importa para filtros e travas é "dívida com o fisco nascida de compra" e "lançamento gerado pelo patrimônio".                                                                                |

Saldo: **uma tabela nova** (`fixed_assets`) em vez de oito.

---

## Os primitivos

### 1. Documento fiscal de entrada — `fiscal_inbound_documents`, generalizado

Hoje a tabela só recebe notas do DF-e; XMLs enviados à mão vivem só no JSONB da compra. Dois
lugares para o mesmo fato. Passa a valer: **todo XML com chave de acesso vira uma linha aqui**,
venha do DF-e ou de upload (`provedor = MANUAL`, valor que já existe).

O que isso dá de graça:

- Deduplicação por chave pelo unique (org, chaveAcesso) que já existe.
- "Esta nota já está em outra compra" = `compraId` preenchido.
- Uma lista só de notas recebidas, qualquer que seja a origem.
- Acompanhamento de cancelamento para notas enviadas à mão também (consulta por chave quando o
  provedor permitir).

Mudanças:

```typescript
modelo: fiscalInboundDocumentModelEnum("modelo").notNull().default("NFE"), // NFE | CTE
xmlArquivoId: varchar("xml_arquivo_id", { length: 255 }).references(() => files.id, { onDelete: "set null" }),
pdfArquivoId: varchar("pdf_arquivo_id", { length: 255 }).references(() => files.id, { onDelete: "set null" }),
// xmlStoragePath / pdfStoragePath: sombra até o backfill, depois removidos.
```

Documentos **sem** chave (cupom, recibo, PDF lido por IA) continuam só no snapshot da compra,
com `arquivoId`. Não têm identidade fiscal para justificar linha própria.

`purchases.documentosImportados[]` ganha `documentoFiscalId` (quando há linha) e `arquivoId`, e
perde a derivação de caminho por `referencia`.

Limite assumido: `compraId` é 1:1. Um CT-e que cobre várias compras se vincula a uma só nesta
fase (ver fluxo E).

### 2. Natureza do produto e destinação do item — um enum, dois lugares

```typescript
export const AcquisitionNatureEnum = z.enum([
  "REVENDA",
  "INSUMO",
  "USO_CONSUMO",
  "ATIVO_IMOBILIZADO",
]);
```

- `products.natureza` — o que o produto **é** para a empresa. Define padrões no cadastro e o
  default das compras. Produto é o catálogo de tudo que a empresa adquire ou vende; material de
  consumo e bens do ativo também são produtos.
- `purchase_items.destinacao` — para que **esta** aquisição serve. Nasce de
  `products.natureza`, depois da memória do de-para, e pode divergir com aviso (o açúcar da
  padaria é insumo numa compra e revenda em outra). Tributação, conta contábil e recebimento
  decidem por ela, nunca pelo cadastro.

Por que os dois e não só um:

- Só no produto: erra a tributação quando o mesmo item tem duas destinações.
- Só no item: perde o default, e a pessoa escolheria a destinação em toda linha de toda nota.

| Natureza            | `vendavel` padrão | Estoque             | Débito contábil    | ICMS próprio                    | DIFAL interestadual            |
| ------------------- | ----------------- | ------------------- | ------------------ | ------------------------------- | ------------------------------ |
| `REVENDA`           | sim               | `ENTRADA_AQUISICAO` | Estoques           | crédito conforme regime         | não (antecipação pode existir) |
| `INSUMO`            | não               | `ENTRADA_AQUISICAO` | Estoques           | crédito conforme regime         | não                            |
| `USO_CONSUMO`       | não               | nenhum nesta fase   | Despesa de consumo | sem crédito (LC 87/96, art. 33) | **sim**                        |
| `ATIVO_IMOBILIZADO` | não               | nenhum; gera bens   | Imobilizado        | CIAP 1/48 conforme regime       | **sim**                        |

`vendavel` e `rastreamentoEstoqueAtivo` continuam sendo os interruptores reais. `natureza` só
preenche padrões e avisa sobre combinações incoerentes (bem do ativo vendável). Migração: todo
produto existente vira `REVENDA`, exceto os não vendáveis usados como insumo em ficha técnica,
que viram `INSUMO`. `products.tipo` (legado) não é reaproveitado.

`supplier_product_mappings.destinacao` (anulável): o de-para lembra a última destinação usada para
aquele código do fornecedor.

### 3. Ponteiro do item para o documento

```typescript
// purchase_items
documentoRef: varchar("documento_ref", { length: 255 }),  // referencia em documentosImportados
documentoItem: integer("documento_item"),                  // det/@nItem
```

É tudo o que o item guarda do documento. CFOP, CST, bases, alíquotas, `rastro` e ST retido são
lidos do `det` apontado quando alguém precisar deles. O parser expõe isso como
`readNfeItemFacts({ xml, nItem })` — o mesmo código usado no import, então import e leitura
posterior nunca divergem.

O que o import ainda **usa** desses fatos na hora (sem guardar): CFOP para decidir se a linha entra,
CST/CSOSN e CRT do emitente para sugerir tratamento, `rastro` para preencher `dataValidade`.

### 4. Componente de valor — `modificadoresCusto`, com `contrapartida`

Um campo novo responde à pergunta que faltava, **"de onde vem esse valor?"**:

```typescript
contrapartida: "FORNECEDOR" | "FISCO" | "TRANSPORTADORA" | "INCLUSO_NO_VALOR"; // default FORNECEDOR
```

- `FORNECEDOR`: soma-se (ou subtrai-se) à dívida com o fornecedor. É o comportamento de hoje.
- `FISCO` / `TRANSPORTADORA`: gera dívida com esse credor (DIFAL, antecipação, ST por entrada,
  frete de CT-e).
- `INCLUSO_NO_VALOR`: já está dentro do valor-base. Não muda dívida nenhuma; só tira valor do
  custo e o leva ao tratamento (ICMS, PIS e COFINS embutidos → crédito).

Outros acréscimos, todos opcionais e aditivos (o snapshot continua `versao: 1`):

- `origem` ganha `CALCULO`, para DIFAL e antecipação calculados pelo sistema.
- `memoriaCalculo`: base, alíquotas e método, para o que for `CALCULO`.
- Chaves novas: `IMPOSTOS_ICMS`, `IMPOSTOS_ICMS_SN`, `IMPOSTOS_PIS`, `IMPOSTOS_COFINS`,
  `IMPOSTOS_DIFAL`, `IMPOSTOS_FCP_DIFAL`, `IMPOSTOS_ANTECIPACAO`, `IMPOSTOS_ICMS_ST_ENTRADA`,
  `IMPOSTOS_IBS`, `IMPOSTOS_CBS` e `BONIFICACAO`.

Bonificação é economicamente um desconto incondicional de 100% (CPC 16: bonificações reduzem o
custo). Logo é um componente — `BONIFICACAO`, `REDUCAO`, `CUSTO_ESTOQUE`, `FORNECEDOR`, valor =
valor-base — e não uma natureza de operação nova. Custo e dívida da linha zeram. A conferência
do total da nota no import precisa saber disso (o `vNF` inclui a linha bonificada).

Fórmula (substitui "Totais derivados" no guia de domínio):

```text
dívida com o fornecedor = valor-base + Σ componentes FORNECEDOR (com sinal)
dívida com cada credor  = Σ componentes FISCO | TRANSPORTADORA daquele credor
custo de estoque        = valor-base
                        + Σ CUSTO_ESTOQUE (com sinal, contrapartida ≠ INCLUSO_NO_VALOR)
                        − Σ INCLUSO_NO_VALOR
crédito tributário      = Σ CREDITO_TRIBUTARIO (com sinal, inclusive INCLUSO_NO_VALOR)
despesa do período      = Σ DESPESA_PERIODO   (com sinal, inclusive INCLUSO_NO_VALOR)
```

Invariantes (testes em `lib/purchase/costing.test.ts`):

- `INCLUSO_NO_VALOR` exige tratamento ≠ `CUSTO_ESTOQUE` e efeito `ACRESCIMO`.
- Σ `INCLUSO_NO_VALOR` do item ≤ valor-base líquido do item.
- `custo + crédito + despesa = dívida com o fornecedor + dívidas com terceiros`, em centavos.
- Snapshot sem `contrapartida` produz exatamente o resultado de hoje.

`calculatePurchaseItemCost` passa a devolver `valorTotalFornecedor` (= `valorTotalLiquido`,
mantido para os leitores atuais) e `dividasPorContrapartida`.

### 5. Credor e dívida — lançamentos da compra

Nada de tabela de obrigações. Uma dívida já tem modelo: lançamento contábil com parcelas em
`financial_transactions`. Falta só a compra poder ter mais de um.

```typescript
// accounting_entries — mesmo padrão de vendaId/loteId
compraId: varchar("compra_id", { length: 255 }).references(() => purchases.id, { onDelete: "set null" }),
```

- **Um lançamento por contrapartida e documento.** Isso mantém a invariante de hoje, "as
  transações reconciliam com o valor de face do lançamento", sem pôr contraparte em transação.
- Identidade determinística: `chaveIdempotencia = compra:{compraId}:{contrapartida}:{documentoRef}`.
  O unique (org, chave) que já existe faz o resync achar e atualizar o lançamento certo, e impede
  duplicar.
- Origem: `COMPRA` para fornecedor e transportadora (que é um fornecedor). Nova origem
  `TRIBUTO_COMPRA` para o fisco: é o filtro da lista "Guias a pagar" e a trava de edição.
- `purchases.lancamentoContabilId` continua apontando para o lançamento do fornecedor. É a
  sombra de compatibilidade para os leitores atuais.

Linhas, pela conta resultante como no ADR-0001:

```text
Lançamento do fornecedor
  D conta da destinação     custo com contrapartida FORNECEDOR
  D tributo a recuperar     créditos (inclusive INCLUSO_NO_VALOR)
  D despesa                 DESPESA_PERIODO
  C Fornecedores            dívida com o fornecedor

Lançamento de cada credor terceiro
  D conta da destinação ou tributo a recuperar, conforme o tratamento do componente
  C Obrigações Tributárias (fisco) | Fornecedores (transportadora)
```

Status da guia: transação com `dataEfetivacao` (paga) ou sem (a pagar). Vencimento:
`dataPrevisao`. UF e código de receita: `memoriaCalculo` do componente.

### 6. Anexos da dívida — duas colunas na transação financeira

```typescript
// financial_transactions
documentoCobrancaArquivoId,  // boleto, guia DAE/GNRE
comprovanteArquivoId,         // comprovante de pagamento
```

São propriedades da parcela, e servem a qualquer conta a pagar, não só à compra: o boleto do
fornecedor é o mesmo conceito que a guia do DIFAL. Uma parcela tem no máximo um de cada; se
precisar de mais, aí sim uma tabela de vínculo.

### 7. Regras de tratamento — código + configuração + memória

1. **Preset por regime** (`lib/fiscal/entry/presets.ts`): função pura de
   `(regime, destinação, chave, CRT do emitente) → tratamento`. Cobre a maior parte.

   | Regime           | ICMS próprio (revenda/insumo) | IPI                            | ICMS-ST | PIS/COFINS | DIFAL (uso/ativo) |
   | ---------------- | ----------------------------- | ------------------------------ | ------- | ---------- | ----------------- |
   | Simples Nacional | custo                         | custo                          | custo   | custo      | custo, fisco      |
   | Lucro Presumido  | crédito                       | custo                          | custo   | custo      | custo, fisco      |
   | Lucro Real       | crédito                       | crédito se contribuinte de IPI | custo   | crédito    | custo, fisco      |

   Fornecedor do Simples (CRT 1) só gera `IMPOSTOS_ICMS_SN` (vCredICMSSN), nunca `IMPOSTOS_ICMS`.

2. **Override da organização**, em `fiscalConfiguracao.entrada.tratamentos[destinacao][chave]`.
   É JSON de configuração, como o resto da configuração fiscal, e não uma tabela.

3. **Memória**: a destinação vem do de-para fornecedor-produto.

O resultado vai para o componente com `descricao` explicando de onde veio ("ICMS como crédito —
preset Lucro Real · revenda"). Parâmetros por UF (`uf-parameters.ts`) e conversão de CFOP de
entrada (`deriveEntryCfop`) também são código puro e testado.

### 8. Bem patrimonial — `fixed_assets` (a única tabela nova)

Passa no teste: tem plaqueta, local, responsável, estado de uso e baixa, independentemente da
compra que o criou.

```typescript
export const fixedAssets = newTable("fixed_assets", {
	id, organizacaoId,
	produtoId, produtoVarianteId,                 // o que o bem é (catálogo)
	compraItemId,                                 // de qual aquisição nasceu; null = cadastro manual
	codigoPatrimonio, descricao, numeroSerie, localizacao, responsavelId,
	status: fixedAssetStatusEnum("status"),       // EM_USO | EM_MANUTENCAO | BAIXADO
	valorAquisicao: numeric("valor_aquisicao", { precision: 14, scale: 2, mode: "number" }).notNull(),
	dataInicioUso: timestamp("data_inicio_uso").notNull(),
	vidaUtilMeses: integer("vida_util_meses").notNull(),
	valorResidual: numeric("valor_residual", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
	depreciacaoAcumuladaInicial: numeric(...).notNull().default(0),  // bens cadastrados já em uso
	creditoIcmsCiap: numeric(...),                // total a apropriar em 48 meses; null = sem CIAP
	dataBaixa, motivoBaixa, valorBaixa,
	dataInsercao,
});
```

- **Depreciação acumulada** = função de (`valorAquisicao`, `valorResidual`, `vidaUtilMeses`,
  `dataInicioUso`, `dataBaixa`, data). Não é guardada mês a mês.
- **Lançamento mensal** por organização, origem `PATRIMONIO`, `chaveIdempotencia =
patrimonio:{org}:{yyyy-mm}`: linhas de depreciação e de apropriação do CIAP (1/48 × coeficiente
  de saídas tributadas do mês). O lançamento **é** o registro do mês; refazer o job não duplica.
- Baixa: o bem guarda data e valor; o lançamento de baixa leva o valor contábil residual, e as
  parcelas de CIAP restantes simplesmente deixam de ser apropriadas (a função para na baixa).
- Quantidade do item > 1 → N bens (ver decisões em aberto sobre bem agrupado).

---

## Módulo de arquivos

Este plano é o gatilho para tirar do caminho direto os dois fluxos fiscais que contornam o
catálogo `files` (dívida listada em `lib/files/README.md`).

| Propósito novo             | Transporte | Limite | Tipos                     | Destino                                                                                  |
| -------------------------- | ---------- | ------ | ------------------------- | ---------------------------------------------------------------------------------------- |
| `DOCUMENTO_FISCAL_ENTRADA` | PROXY      | 4 MB   | XML, PDF, PNG, JPEG, WEBP | `fiscal_inbound_documents.xmlArquivoId/pdfArquivoId`, `documentosImportados[].arquivoId` |
| `DOCUMENTO_FINANCEIRO`     | PROXY      | 4 MB   | PDF, PNG, JPEG            | `financial_transactions.documentoCobrancaArquivoId/comprovanteArquivoId`                 |

- O `inspect` do propósito fiscal aplica ao XML a mesma barreira de DTD/ENTITY de
  `extractCompositionFromNfeXml` e valida a raiz (`nfeProc`, `NFe`, `cteProc`, `CTe`).
- `/api/purchases/imported-document` passa a resolver por `arquivoId`, conferindo o
  `organizacaoId` da linha de `files`. Preserva a garantia atual: um id forjado só alcança a
  própria organização.
- Deduplicação por conteúdo: `idx_files_org_sha256`, que já existe. Por identidade fiscal: o
  unique de chave em `fiscal_inbound_documents`.
- O DF-e grava o XML e o PDF baixados via `storeFile`; `storeFiscalAsset` deixa de ser usado
  para notas recebidas.
- Backfill `scripts/backfill-purchase-fiscal-files.ts`: registra em `files` os objetos existentes
  (`purchase-imports/*` e assets de notas recebidas), grava os `arquivoId` e cria linhas em
  `fiscal_inbound_documents` para os XMLs com chave enviados à mão. Idempotente.

---

## Fluxos

### A. Nota → compra (DF-e ou upload, mesmo caminho)

1. Upload de XML: cria ou reaproveita a linha de documento por chave. Se `compraId` já estiver
   preenchido, avisa e oferece abrir a compra existente.
2. DF-e: "Lançar compra" na aba de notas recebidas quando `completo = true` e `compraId` nulo.
   Abre o builder com o XML do catálogo.
3. Os dois passam pelo mesmo pipeline de `/api/purchases/import-composition`, que ganha
   validações bloqueantes: `dest/CNPJ` ≠ CNPJ da organização, e `finNFe = 2` (complementar) sem
   compra referenciada. XML sem protocolo de autorização gera aviso, não bloqueio.
4. Criar a compra preenche `compraId` na mesma transação.
5. Opt-in: manifestar `CONFIRMACAO` ao receber a compra.
6. Nota vinculada que passa a `CANCELADA`: problema fiscal `NOTA_ENTRADA_CANCELADA`
   (`lib/fiscal/problems.ts`) e bloqueio do recebimento. Se a compra já foi recebida, o problema
   orienta o estorno; o sistema não desfaz sozinho.

### B. Builder — import e revisão

No import, o CFOP do emitente decide o destino da linha:

| CFOP do emitente                               | Linha                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| venda/revenda (5101/5102/5403/5405 e 6xxx)     | item de compra                                                        |
| bonificação (5910/6910)                        | item de compra + componente `BONIFICACAO`                             |
| consignação, remessa, transferência, devolução | não vira item; aparece listada como "fora desta compra", com o motivo |

Na fila de itens, cada linha mostra a destinação (com aviso de divergência) e os tributos já
com tratamento e contrapartida sugeridos. "Tributo sem tratamento" vira exceção, para quando
nenhum preset resolve. Uma etapa de resumo mostra as **dívidas por credor**, com memória de
cálculo, vencimento sugerido e edição manual (que registra `origem: MANUAL`).

### C. Recebimento por destinação

`handlePurchaseItemStockProcessing` passa a ramificar pela destinação:

| Destinação          | Estoque                                                 | Outros efeitos                    |
| ------------------- | ------------------------------------------------------- | --------------------------------- |
| `REVENDA`, `INSUMO` | `ENTRADA_AQUISICAO` com `valorUnitarioCusto`, como hoje | lotes pelo `rastro` quando houver |
| `USO_CONSUMO`       | nenhum                                                  | despesa no lançamento             |
| `ATIVO_IMOBILIZADO` | nenhum                                                  | cria os `fixed_assets`            |

Os lançamentos de terceiros nascem junto com o do fornecedor, em `syncPurchaseAccountingLines`.
Desfazer o recebimento remove bens ainda não incluídos em lançamento `PATRIMONIO`; se algum já
foi incluído, recusa (mesma lógica de `assertPurchaseLotsArePristine`).

### D. Guias a pagar

É uma lista, não um módulo: transações de lançamentos `TRIBUTO_COMPRA`, filtráveis por
vencimento e status, com anexar guia/comprovante (`DOCUMENTO_FINANCEIRO`). A geração automática
de GNRE fica fora do escopo.

### E. CT-e

- Parser `lib/purchase/import-cte.ts`, com a mesma barreira de XML inseguro.
- Vira linha em `fiscal_inbound_documents` (`modelo = CTE`). É anexado à compra cuja NF-e aparece
  em `infDoc/infNFe/chave`.
- `vTPrest` vira componente `FRETE` (contrapartida `TRANSPORTADORA`, rateado pelos itens); o ICMS
  do CT-e vira componente `INCLUSO_NO_VALOR` com o tratamento do preset.
- Compra já recebida: entra pelo fluxo explícito de correção de custo (o ADR-0001 proíbe
  alteração silenciosa).

### F. Patrimônio

Lista, detalhe e baixa de bens; cadastro manual de bens antigos; job mensal
`/api/cron/fixed-assets-close` gerando o lançamento `PATRIMONIO`.

### G. ST retido na saída

A NF-e de saída com CSOSN 500 / CST 60 precisa de `vBCSTRet`, `pST` e `vICMSSTRet`. Eles são
lidos, pelo ponteiro do item, do `det` da última entrada do produto. Não há cópia para manter.

---

## Contas e configuração

- Plano de contas padrão: só o que não existe. 1.6 Imobilizado, 1.6.9 (−) Depreciação
  Acumulada, despesa de Depreciação e despesa de Material de Uso e Consumo. Tributos a recuperar
  (1.4) e obrigações tributárias (2.3) já existem; subcontas por tributo ficam a critério da
  organização.
- `lancamentosPadrao.compras` ganha, com `.default(null)`:
  - `contasDebitoPorDestinacao`;
  - `contasCreditoTributarioPorChave` (fallback: `debitoCreditoTributarioContaId`);
  - `creditoTributoCompraContaId`.
- Novo bloco `lancamentosPadrao.patrimonio`.
- `accountingEntryOriginTypeEnum` ganha `TRIBUTO_COMPRA` e `PATRIMONIO`.

---

## Resumo do schema

| Onde                                     | Mudança                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `products`                               | + `natureza`                                                                      |
| `purchase_items`                         | + `destinacao`, `documentoRef`, `documentoItem`                                   |
| `supplier_product_mappings`              | + `destinacao` (anulável)                                                         |
| `modificadoresCusto` (JSONB)             | + `contrapartida`, `memoriaCalculo`, origem `CALCULO`, chaves novas               |
| `purchases.documentosImportados` (JSONB) | + `documentoFiscalId`, `arquivoId`                                                |
| `fiscal_inbound_documents`               | + `modelo`, `xmlArquivoId`, `pdfArquivoId`; caminhos viram sombra                 |
| `accounting_entries`                     | + `compraId`; origens `TRIBUTO_COMPRA`, `PATRIMONIO`                              |
| `financial_transactions`                 | + `documentoCobrancaArquivoId`, `comprovanteArquivoId`                            |
| `fiscalConfiguracao` (JSON)              | + `entrada.tratamentos`                                                           |
| `fixed_assets`                           | **tabela nova**                                                                   |
| Código                                   | presets, `deriveEntryCfop`, `uf-parameters`, cálculo de DIFAL, `readNfeItemFacts` |

---

## Fases

Cada fase é entregável sozinha e não muda nada para quem não usa a novidade.

| Fase | Entrega                                                                                                                                                                                     | Schema                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 0    | ADR-0002 + guia de domínio; validação dos presets e do DIFAL com a contabilidade                                                                                                            | —                                                              |
| 1    | Documento como primitivo: uploads de XML viram linha de documento, propósito `DOCUMENTO_FISCAL_ENTRADA`, `arquivoId`, ponteiro do item, validações do import, `rastro` → validade, backfill | `fiscal_inbound_documents`, `purchase_items` (ponteiro), JSONB |
| 2    | Nota recebida → compra, `compraId`, cancelamento, confirmação opt-in                                                                                                                        | —                                                              |
| 3    | Natureza e destinação, uso e consumo em despesa, bonificação como componente, contas por destinação                                                                                         | `products`, `purchase_items`, `supplier_product_mappings`      |
| 4    | `contrapartida = INCLUSO_NO_VALOR`, créditos de ICMS/ICMS SN/PIS/COFINS, presets, overrides                                                                                                 | JSONB, `fiscalConfiguracao`                                    |
| 5    | Contrapartida `FISCO`, DIFAL/antecipação/ST de entrada, lançamentos por credor, guias a pagar, `DOCUMENTO_FINANCEIRO`                                                                       | `accounting_entries`, `financial_transactions`                 |
| 6    | CT-e                                                                                                                                                                                        | —                                                              |
| 7    | Patrimônio                                                                                                                                                                                  | `fixed_assets`                                                 |
| 8    | ST retido na saída; devolução de compra; IBS/CBS como componentes                                                                                                                           | —                                                              |

**Testes que precisam existir:**

- Fixtures de XML reais anonimizados: revenda Simples, Lucro Real com ICMS/PIS/COFINS, ST,
  bonificação misturada, complementar, importação, IBS/CBS e destinatário errado.
- Snapshot antigo produz o mesmo custo.
- Fechamento em centavos da invariante de dívidas.
- Lançamentos por credor idempotentes.
- Job do patrimônio idempotente; baixa no mês 20 apropria só 20 parcelas de CIAP.

---

## Riscos

- **O motor fiscal de saída é Simples-only** (CSOSN em `fiscal_tax_groups`). Presumido e Real
  escrituram a entrada com este plano, mas o ciclo crédito × débito só fecha com a Fase 8.
- **Re-parse como fonte**: o ponteiro só funciona se o XML nunca for perdido nem trocado. Daí a
  invariante de arquivo fiscal não apagável e o `sha256` no catálogo. Documentos lidos por IA não
  têm `det`; para eles os fatos fiscais simplesmente não existem.
- **Organização sem configuração fiscal** cai no preset do Simples, com aviso.
- **Compras recebidas antes da Fase 4** não são reprocessadas.

## Decisões em aberto

1. **Bonificação**: custo zero (CPC 16, proposto aqui) ou valor da nota com receita? A segunda
   exigiria um tratamento novo.
2. **Uso e consumo com estoque** (almoxarifado): fica para depois (pede saída `CONSUMO_INTERNO` e
   lançamento), ou entra na Fase 3?
3. **Patrimônio**: módulo próprio na navegação ou aba em Produtos?
4. **Bem agrupado**: um bem por unidade sempre, ou `quantidade` no bem (20 cadeiras = 1 registro)?
   Se agrupado, um campo a mais e a baixa precisa aceitar baixa parcial.
5. **CT-e para várias compras**: aceitar o 1:1 nesta fase ou já trocar `compraId` por vínculo pelo
   snapshot da compra?
6. **Contraparte genérica em lançamentos** (fornecedor/cliente em `accounting_entries`): fica
   fora deste plano, mas resolveria "contas a pagar por fornecedor" para o sistema todo. Vale uma
   iniciativa própria?
