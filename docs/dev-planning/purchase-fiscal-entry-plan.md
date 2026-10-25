# Plano: entrada fiscal de compras para cenários complexos

Contexto: a entrada de compras resolve bem o caso "mercadoria para revenda com IPI/ICMS-ST
destacado e tratamento escolhido à mão". Ela não cobre crédito de tributo embutido no preço
(ICMS próprio, PIS, COFINS), tributo pago a quem não é o fornecedor (DIFAL, antecipação, ST por
entrada, frete de CT-e) nem aquisições que não viram estoque de revenda (insumo, uso e consumo,
ativo imobilizado). A nota recebida via DF-e também não vira compra: `fiscal_inbound_documents.compraId`
existe e nunca é preenchido.

Este plano define as novas entidades, os novos fluxos e o papel do módulo de arquivos. Ele
estende — não substitui — o [ADR-0001](../adr/0001-purchase-cost-composition-and-accounting-entry-lines.md)
e o guia [`docs/domain/purchase-costing.md`](../domain/purchase-costing.md). As decisões estruturais
abaixo viram o ADR-0002 antes de qualquer código (Fase 0).

A classificação fiscal concreta (qual tributo é crédito em qual regime, base do DIFAL por UF,
alíquotas internas) **deve ser validada com a contabilidade**. O sistema decide por regras
configuráveis e sugere; ele não é a fonte de verdade tributária.

---

## Estado atual relevante

| Peça | Onde | Observação |
| --- | --- | --- |
| Parser de NF-e | `lib/purchase/import-xml.ts` | Determinístico. Lê vDesc, vFrete, vSeg, vOutro, vIPI, vICMSST, vFCPST. **Ignora** vICMS, vPIS, vCOFINS, vCredICMSSN, CFOP, CST/CSOSN, orig, CEST, cBenef, bases, alíquotas, `rastro`, ST retido, `dest`, `finNFe`, `IBSCBS`. |
| Custeio | `lib/purchase/costing.ts` | `financeiro = bruto ± modificadores`; `custo = bruto ± modificadores CUSTO_ESTOQUE`. Reduções fora de CUSTO_ESTOQUE são recusadas (`costing.ts:107`). |
| Modificador | `PurchaseCostModifierSchema` (`schemas/purchases.ts`) | chave, valorCentavos, efeito (ACRESCIMO/REDUCAO), tratamento, origem, documentoRef, rateio. Não sabe a quem se paga. |
| Tratamento | `applyTaxTreatment` (`app/dashboard/purchases/_module/builder/helpers/review-lines.ts`) | Sempre manual, linha a linha ou "nota inteira". Nenhuma regra. |
| Item de compra | `purchase_items` | `produtoId` NOT NULL; nenhum campo fiscal; implicitamente sempre estoque. |
| Documentos da compra | `purchases.documentosImportados` (JSONB) | Arquivo em `organizations/{org}/purchase-imports/{ref}` via `storePrivateFile` — **fora** do catálogo `files`. |
| Nota recebida | `fiscal_inbound_documents` | `xmlStoragePath`/`pdfStoragePath` como caminho — **fora** do catálogo `files`. A aba só manifesta e baixa. |
| Lançamento da compra | `syncPurchaseAccountingLines` (`app/api/purchases/route.ts`) | Débitos por tratamento; um único crédito (Fornecedores). |
| Transação financeira | `financial_transactions` | Sem contraparte; reconcilia com o valor de face do lançamento. |
| Perfil fiscal do produto | `product_fiscal_profiles`, `fiscal_tax_groups` | Orientados à **saída** e ao Simples (CSOSN). Nada de entrada. |
| Plano de contas padrão | `config/onboarding.tsx` | 1.3 Estoques, 1.4 Tributos a Recuperar, 2.3 Obrigações Tributárias. Sem imobilizado nem depreciação. |
| Produto | `products` | `tipo` texto livre legado, `vendavel`, `rastreamentoEstoqueAtivo`. Nada diz o que o produto **é** para a empresa. |

---

## Princípios de design

1. **Produto é o catálogo de tudo que a empresa adquire ou vende — não só estoque.** Mercadoria,
   insumo, embalagem, material de consumo e bem do ativo são todos produtos. O que muda é o
   papel do produto e a destinação de cada aquisição. Não criamos um catálogo paralelo de
   "itens de compra" ou de "tipos de bem".

2. **Duas perguntas diferentes, dois campos diferentes.** "O que esse produto é para a empresa?"
   é uma propriedade do cadastro (estável). "Para que esta aquisição específica serve?" é uma
   propriedade do item da compra (por entrada). O açúcar de uma padaria é insumo; o mesmo açúcar
   na prateleira é revenda. A destinação do item nasce do papel do produto e pode divergir, com
   aviso. Crédito, DIFAL, CFOP de entrada e conta contábil dependem da **destinação**, não do
   cadastro.

3. **Natureza da operação ≠ destinação.** Bonificação, consignação, remessa, devolução e nota
   complementar são naturezas da operação, lidas do CFOP e do `finNFe`, **por item** (uma nota de
   compra traz linhas bonificadas com CFOP 5910 ao lado de linhas vendidas com 5102).

4. **Embutido ≠ acrescido.** ICMS próprio, PIS e COFINS estão dentro do `vProd`. Tomar o crédito
   reclassifica parte do valor-base de estoque para tributo a recuperar **sem mudar o valor a
   pagar**. Isso é um terceiro efeito do modificador, não uma redução.

5. **Todo valor tem um credor.** O modificador declara a quem se deve: fornecedor (entra na
   duplicata), fisco (guia), transportadora (CT-e). Credor diferente de fornecedor gera uma
   obrigação com ciclo de vida próprio (vencimento, guia, comprovante, pagamento).

6. **Regra sugere, pessoa confirma, snapshot congela.** Tratamentos, CFOP de entrada e
   obrigações são sugeridos por regras (preset por regime + exceções da organização). O item
   guarda o resultado e qual regra o produziu. Mudar a regra depois não reescreve compra
   recebida (mesma invariante do ADR-0001).

7. **Arquivo é ativo do catálogo `files`.** Todo documento da cadeia de entrada (NF-e, DANFE,
   CT-e, guia, comprovante, laudo do bem) é uma linha em `files`, referenciada por `arquivoId`.
   Nenhuma entidade nova guarda caminho.

Convenção de linguagem (CLAUDE.md): tabelas, funções e tipos em inglês; colunas, campos de
snapshot e valores de enum em português.

---

## Decisão central: papel do produto e destinação do item

### Papel do produto — `products.tipoItem`

Enum único, alinhado ao `TIPO_ITEM` do registro 0200 do SPED (EFD ICMS/IPI), porque é a
classificação que a escrituração vai exigir de qualquer forma e evita inventar uma taxonomia
própria:

| Valor (`ProductItemTypeEnum`) | SPED | Comportamento padrão |
| --- | --- | --- |
| `MERCADORIA_REVENDA` | 00 | vendável, rastreia estoque, conta 1.3.1 |
| `MATERIA_PRIMA` | 01 | não vendável, estoque, consumido em produção, conta 1.3.2 |
| `EMBALAGEM` | 02 | idem matéria-prima |
| `PRODUTO_EM_PROCESSO` | 03 | gerado por produção |
| `PRODUTO_ACABADO` | 04 | gerado por produção, vendável |
| `SUBPRODUTO` | 05 | gerado por produção |
| `PRODUTO_INTERMEDIARIO` | 06 | insumo consumido no processo |
| `USO_CONSUMO` | 07 | não vendável, estoque opcional (almoxarifado) |
| `ATIVO_IMOBILIZADO` | 08 | não vendável, sem estoque; cada unidade recebida vira um bem patrimonial |
| `SERVICO` | 09 | sem estoque (reservado; serviços tomados ficam fora deste plano) |
| `OUTROS_INSUMOS` | 10 | insumo |
| `OUTROS` | 99 | sem comportamento implícito |

- Migração: todo produto existente recebe `MERCADORIA_REVENDA` (é o que o sistema já assume),
  exceto os que hoje são insumo de ficha técnica e não vendáveis → `MATERIA_PRIMA`. Relatório de
  revisão para a organização conferir.
- `products.tipo` (texto livre legado) **não** é reaproveitado: tem valores de integrações
  (`"Produto"`, `""`) e significado diferente.
- `vendavel` e `rastreamentoEstoqueAtivo` continuam sendo os interruptores reais; `tipoItem`
  só define os **padrões** no cadastro e um aviso quando combinações são incoerentes (ex.: ativo
  imobilizado vendável).

### Destinação do item — `purchase_items.destinacao`

Enum menor, porque é o que muda tributação e contabilização na entrada:

| Valor (`PurchaseItemDestinationEnum`) | Origem padrão (`tipoItem`) | Estoque | Débito contábil | ICMS próprio | DIFAL interestadual |
| --- | --- | --- | --- | --- | --- |
| `REVENDA` | 00, 04 | entrada no saldo | Estoque de mercadorias | crédito conforme regime | não (antecipação parcial pode existir) |
| `INSUMO` | 01, 02, 06, 10 | entrada no saldo | Estoque de matérias-primas | crédito conforme regime | não |
| `USO_CONSUMO` | 07 | opcional (almoxarifado) | Despesa de consumo, ou Material de consumo se rastreado | sem crédito (LC 87/96, art. 33) | **sim** |
| `ATIVO_IMOBILIZADO` | 08 | não; gera bens patrimoniais | Imobilizado | crédito via CIAP (1/48) conforme regime | **sim** |

- Default: do `tipoItem` do produto; depois do mapeamento fornecedor-produto
  (`lib/purchase/supplier-product-mappings.ts` passa a lembrar a destinação usada na última
  compra daquele código de fornecedor).
- Divergência entre destinação e papel é permitida com aviso ("este produto é revenda, mas está
  entrando como uso e consumo").
- `produtoId` continua NOT NULL: material de consumo e bens também são produtos. Isso mantém um
  único caminho de casamento (EAN, código do fornecedor, IA) para qualquer linha da nota.

### Natureza da entrada — `purchase_items.naturezaEntrada`

Derivada do CFOP do emitente e do `finNFe`, por item:

| Valor (`PurchaseEntryNatureEnum`) | CFOP do emitente (exemplos) | Efeito |
| --- | --- | --- |
| `COMPRA` | 5101/5102/6101/6102/5403/5405/6403/6404 | fluxo normal |
| `BONIFICACAO` | 5910/6910 | estoque entra; custo pela regra da organização (zero ou valor da nota); não gera duplicata |
| `CONSIGNACAO` | 5917/6917 | estoque de terceiros; sem custo nem passivo até a venda/devolução |
| `REMESSA` | 5915/5949/6949/5908 (conserto, demonstração, comodato) | não entra no saldo próprio; registro de controle |
| `DEVOLUCAO_VENDA` | 5202/6202 com `refNFe` | retorno ao estoque vinculado à venda original (fora do builder de compra — ver Fase 8) |
| `COMPLEMENTAR` | `finNFe = 2` | complementa valor/imposto de uma compra existente (`refNFe`); não cria linhas novas |
| `TRANSFERENCIA` | 5152/6152 | entre estabelecimentos; sem passivo |

O que não é `COMPRA`, `BONIFICACAO` ou `COMPLEMENTAR` fica fora do custo médio nesta fase: o
builder mostra a linha, explica a natureza e não a lança como aquisição.

---

## Novas entidades e mudanças de schema

### 1. `products.tipoItem` (coluna) — ver acima

pgEnum `product_item_type` em `services/drizzle/schema/enums.ts`, espelho Zod em `schemas/enums.ts`.

### 2. `purchase_items` — novas colunas

```typescript
destinacao: purchaseItemDestinationEnum("destinacao").notNull().default("REVENDA"),
naturezaEntrada: purchaseEntryNatureEnum("natureza_entrada").notNull().default("COMPRA"),
// CFOP que a organização escritura (1102, 2102, 1403, 1556, 2556, 1551, 2551, 1910...).
// Derivado do CFOP do emitente + destinação pelas regras de entrada; editável antes do recebimento.
cfopEntrada: varchar("cfop_entrada", { length: 4 }),
// Snapshot fiscal versionado lido do documento (o que o emitente declarou). Ver formato abaixo.
dadosFiscais: jsonb("dados_fiscais").$type<TPurchaseItemFiscalSnapshot>(),
```

`dadosFiscais` (versão 1) guarda o **declarado**, não o tratado:

```typescript
{
	versao: 1,
	cfopOrigem, ncm, cest, cBenef, origemMercadoria,         // orig 0..8
	icms: { cst | csosn, modBC, vBC, pRedBC, pICMS, vICMS, pCredSN, vCredICMSSN, vICMSDeson },
	icmsSt: { vBCST, pMVAST, pICMSST, vICMSST, vBCSTRet, vICMSSTRet, pST, vFCPST, vFCPSTRet },
	ipi: { cst, vBC, pIPI, vIPI },
	pis: { cst, vBC, pPIS, vPIS },
	cofins: { cst, vBC, pCOFINS, vCOFINS },
	ibsCbs: { cst, cClassTrib, vBC, pIBSUF, vIBSUF, pIBSMun, vIBSMun, pCBS, vCBS } | null,
	ii: { vBC, vII } | null,                                   // importação
	rastro: [{ nLote, qLote, dFab, dVal }] | null,             // alimenta dataValidade/lotes
}
```

Por que JSONB + colunas escalares, como no ADR-0001: o snapshot tem o ciclo de vida do item e é
sempre lido junto; `destinacao`, `naturezaEntrada` e `cfopEntrada` são filtrados em relatórios e
na escrituração, por isso são colunas.

### 3. `purchases.documentosImportados` — extensão do snapshot de documento

`PurchaseImportedDocumentSchema` ganha (todos opcionais, mesmo `versao: 1`):

```typescript
tipoDocumento: "NFE" | "NFCE" | "CTE" | "NFSE" | "CUPOM" | "OUTRO",
arquivoId,                       // FK lógica para files.id (substitui o caminho derivado — ver módulo de arquivos)
emitente: { cnpj, ie, uf, crt }, // crt 1/2/3/4: limita crédito quando o fornecedor é do Simples
destinatario: { cnpj, ie, uf },
finalidade,                      // finNFe
naturezaOperacao,                // natOp
documentosReferenciados: [chaveAcesso],
protocoloAutorizacao: { cStat, nProt, dhRecbto } | null,
notaRecebidaId,                  // fiscal_inbound_documents.id quando veio do DF-e
```

### 4. Modificador de custo — versão 2

`PurchaseCostModifiersSnapshotSchema` aceita `versao: 1 | 2`. A v1 continua válida para leitura;
toda escrita nova usa v2.

```typescript
{
	chave,                     // + novas chaves abaixo
	valorCentavos,
	efeito: "ACRESCIMO" | "REDUCAO" | "RECLASSIFICACAO",
	tratamento: "CUSTO_ESTOQUE" | "CREDITO_TRIBUTARIO" | "DESPESA_PERIODO",
	credor: "FORNECEDOR" | "FISCO" | "TRANSPORTADORA",   // default FORNECEDOR
	origem: "XML" | "IA" | "MANUAL" | "CALCULO",         // CALCULO = DIFAL/antecipação calculados
	regraId?: string | null,          // regra de entrada que sugeriu o tratamento
	obrigacaoRef?: string | null,     // purchase_obligations.id quando credor ≠ FORNECEDOR
	memoriaCalculo?: { base, aliquota, aliquotaInterestadual?, metodo?, ... } | null,
	documentoRef, descricao, rateio,
}
```

Novas chaves (todas com prefixo `IMPOSTOS_`, regra do guia de domínio):
`IMPOSTOS_ICMS`, `IMPOSTOS_ICMS_SN` (crédito do fornecedor do Simples), `IMPOSTOS_PIS`,
`IMPOSTOS_COFINS`, `IMPOSTOS_DIFAL`, `IMPOSTOS_FCP_DIFAL`, `IMPOSTOS_ANTECIPACAO`,
`IMPOSTOS_ICMS_ST_ENTRADA` (ST recolhido pelo destinatário), `IMPOSTOS_IBS`, `IMPOSTOS_CBS`,
`IMPOSTOS_II`.

Fórmula nova (substitui a seção "Totais derivados" do guia):

```text
valor a pagar ao fornecedor = valor-base
                            + acréscimos com credor FORNECEDOR
                            − reduções   com credor FORNECEDOR
                            (RECLASSIFICACAO não altera)

obrigações com terceiros    = acréscimos com credor FISCO/TRANSPORTADORA (por credor)

custo de estoque            = valor-base
                            + acréscimos CUSTO_ESTOQUE (qualquer credor)
                            − reduções   CUSTO_ESTOQUE
                            − reclassificações (saem do custo)

crédito tributário          = acréscimos CREDITO_TRIBUTARIO + reclassificações CREDITO_TRIBUTARIO
despesa do período          = acréscimos DESPESA_PERIODO   + reclassificações DESPESA_PERIODO
```

Invariantes novas (testes em `lib/purchase/costing.test.ts`):

- `RECLASSIFICACAO` só com tratamento ≠ `CUSTO_ESTOQUE`, e nunca com credor ≠ `FORNECEDOR`.
- Soma das reclassificações de um item ≤ valor-base líquido do item.
- `custo + crédito + despesa = pagar ao fornecedor + obrigações com terceiros` (fecha em centavos).

`calculatePurchaseItemCost` passa a devolver também `valorTotalFornecedor` e
`obrigacoesPorCredor`. `valorTotalLiquido` (financeiro) vira sinônimo de `valorTotalFornecedor`
para não quebrar leitores.

### 5. `purchase_obligations` (tabela nova)

Obrigação de pagamento a um credor que não é o fornecedor da nota. Tem ciclo de vida próprio
(vencimento, guia, pagamento, comprovante), por isso justifica tabela — diferente dos
modificadores, que o ADR-0001 manteve em JSONB por não terem.

```typescript
export const purchaseObligations = newTable("purchase_obligations", {
	id, organizacaoId,
	compraId,                                  // FK purchases, cascade
	tipo: purchaseObligationTypeEnum("tipo"),  // DIFAL | FCP_DIFAL | ANTECIPACAO_PARCIAL | ICMS_ST_ENTRADA | FRETE_CTE | OUTRO
	credor: purchaseCreditorEnum("credor"),    // FISCO | TRANSPORTADORA
	status: purchaseObligationStatusEnum("status"), // PREVISTA | GUIA_EMITIDA | PAGA | CANCELADA
	// Credor fisco
	uf: varchar("uf", { length: 2 }),
	codigoReceita: varchar("codigo_receita", { length: 20 }),
	documentoArrecadacao: varchar("documento_arrecadacao", { length: 60 }), // nº GNRE/DAE
	// Credor transportadora
	fornecedorId,                              // suppliers (transportadora cadastrada como fornecedor)
	documentoRef,                              // referência do CT-e em documentosImportados
	valor: numeric("valor", { precision: 14, scale: 2, mode: "number" }).notNull(),
	dataVencimento: timestamp("data_vencimento"),
	memoriaCalculo: jsonb("memoria_calculo"),
	guiaArquivoId,                             // files.id
	comprovanteArquivoId,                      // files.id
	lancamentoContabilId,                      // lançamento próprio (ver contabilidade)
	dataInsercao, dataAtualizacao,
});
```

### 6. Regras de entrada — `fiscal_entry_rules` (tabela nova) + presets em código

Presets por regime (`lib/fiscal/entry/presets.ts`, versionados em código, não no banco):

| Regime | ICMS próprio | ICMS SN (CSOSN 101) | IPI | ICMS-ST | PIS/COFINS | DIFAL uso/ativo |
| --- | --- | --- | --- | --- | --- | --- |
| Simples Nacional | custo | custo | custo | custo | custo | custo, credor fisco |
| Lucro Presumido | crédito (revenda/insumo) | crédito | custo (sem IPI na saída) | custo | custo (cumulativo) | custo, credor fisco |
| Lucro Real | crédito (revenda/insumo) | crédito | crédito se contribuinte de IPI, senão custo | custo | crédito (não cumulativo) | custo, credor fisco |

Exceções da organização em tabela, com as mesmas convenções de `fiscal_tax_group_rules`
(coluna anulável = "qualquer"):

```typescript
export const fiscalEntryRules = newTable("fiscal_entry_rules", {
	id, organizacaoId, nome, prioridade, ativo,
	// Dimensões (anuláveis)
	destinacao, naturezaEntrada, cfopOrigemPrefixo, ufOrigem, ncmPrefixo,
	fornecedorId, cstIcms, crtEmitente,
	// Saídas (anuláveis = mantém o preset)
	tratamentos: jsonb("tratamentos"),   // { IMPOSTOS_ICMS: "CREDITO_TRIBUTARIO", ... }
	cfopEntrada,
	aplicaDifal, aplicaAntecipacao, aliquotaInternaOverride,
	custoBonificacao,                    // ZERO | VALOR_NOTA
	dataInsercao,
});
```

Resolução (`resolveEntryTaxTreatment`, puro e testado): preset do regime → regras da organização
ordenadas por especificidade e depois `prioridade`. O resultado registra `regraId` e um texto de
explicação para a UI ("ICMS como crédito — regra 'Lucro Real · revenda'").

Conversão de CFOP de entrada (`deriveEntryCfop`): 5xxx→1xxx, 6xxx→2xxx, 7xxx→3xxx, com
substituições por destinação (revenda 1102/2102, revenda com ST 1403/2403, uso e consumo
1556/2556, ativo 1551/2551, bonificação 1910/2910). Tabela em código, sobrescrevível por regra.

### 7. Parâmetros por UF — `fiscal_uf_parameters` (tabela global de referência)

Mesmo padrão de `fiscal_ibpt_rates`: global, sem `organizacaoId`, atualizada por script.

```typescript
{ uf, vigenciaInicio, vigenciaFim,
  aliquotaInternaPadrao, aliquotaFcp,
  metodoDifal: "BASE_UNICA" | "BASE_DUPLA",
  difalSimplesNacional: boolean,
  antecipacaoParcial: boolean, antecipacaoParcialSimples: boolean,
  prazoVencimentoDias, codigoReceitaDifal, codigoReceitaAntecipacao }
```

Exceções por NCM ficam nas regras da organização (`aliquotaInternaOverride`) nesta fase; uma
tabela global UF×NCM só se a demanda provar.

### 8. Patrimônio — `fixed_assets` e satélites (tabelas novas)

O produto com papel `ATIVO_IMOBILIZADO` é o **tipo** do bem; cada unidade recebida é um bem.

```typescript
export const fixedAssets = newTable("fixed_assets", {
	id, organizacaoId,
	produtoId, produtoVarianteId,             // o que o bem é (catálogo)
	compraItemId,                             // de qual aquisição nasceu (null = cadastro manual/legado)
	codigoPatrimonio,                         // plaqueta; único por organização
	descricao, numeroSerie, localizacao, responsavelId,
	status: fixedAssetStatusEnum("status"),   // EM_USO | EM_MANUTENCAO | BAIXADO
	valorAquisicao: numeric(14,2),            // = valorUnitarioCusto do item
	dataAquisicao, dataInicioUso,
	vidaUtilMeses, valorResidual: numeric(14,2),
	metodoDepreciacao: "LINEAR",
	contaContabilId,                          // subconta do imobilizado
	dataBaixa, motivoBaixa, valorBaixa,
	dataInsercao,
});

export const fixedAssetDepreciations = newTable("fixed_asset_depreciations", {
	id, organizacaoId, bemId, competencia /* 1º dia do mês */, valor: numeric(14,2),
	lancamentoContabilId, dataInsercao,
	// unique (bemId, competencia): o job é idempotente
});

export const fixedAssetIcmsCredits = newTable("fixed_asset_icms_credits", {
	id, organizacaoId, bemId, parcela /* 1..48 */, competencia, valor: numeric(14,2),
	status: "PREVISTA" | "APROPRIADA" | "CANCELADA",     // cancelada na baixa antes de 48 meses
	lancamentoContabilId, dataInsercao,
});
```

- Vida útil padrão sugerida pelo NCM (tabela de taxas da RFB, em código) e editável.
- Quantidade do item > 1 → N bens; quantidade fracionária é recusada para destinação ativo.

### 9. Plano de contas e defaults contábeis

Novos nós em `RecompraCRMDefaultAccountCharts` (organizações existentes recebem por migração
de dados idempotente, como na conta de perdas):

```
1.3.1 Estoque de Mercadorias        1.3.2 Estoque de Matérias-Primas    1.3.3 Material de Consumo
1.4.1 ICMS a Recuperar              1.4.2 PIS a Recuperar               1.4.3 COFINS a Recuperar
1.4.4 IPI a Recuperar               1.4.5 ICMS a Recuperar — CIAP       1.4.6 IBS/CBS a Recuperar
1.6   Imobilizado                   1.6.9 (−) Depreciação Acumulada
2.3.1 ICMS a Recolher (DIFAL/Antecipação/ST)
6.x   Material de Uso e Consumo     6.y   Depreciação
```

`lancamentosPadrao.compras` ganha, com `.default(null)` como os campos atuais:
`contasDebitoPorDestinacao` (REVENDA, INSUMO, USO_CONSUMO, ATIVO_IMOBILIZADO),
`contasCreditoTributarioPorChave` (fallback: `debitoCreditoTributarioContaId`) e
`creditoObrigacoesFiscoContaId`. Novo bloco `lancamentosPadrao.depreciacao`.

Novas origens em `accountingEntryOriginTypeEnum`: `OBRIGACAO_COMPRA`, `DEPRECIACAO`,
`CREDITO_CIAP`.

---

## Contabilização

Um lançamento por credor, para manter a invariante atual "transações financeiras reconciliam
com o valor de face do lançamento" sem precisar de contraparte em `financial_transactions`:

**Lançamento da compra (credor fornecedor)** — evolução de `buildPurchaseAccountingEntryLines`:

```text
Débito  — conta da destinação (estoque/consumo/imobilizado)  parcela CUSTO_ESTOQUE com credor FORNECEDOR
Débito  — tributo a recuperar (por chave)                    créditos + reclassificações
Débito  — despesa                                            DESPESA_PERIODO
Crédito — Fornecedores                                       valor a pagar ao fornecedor
```

**Lançamento de cada obrigação (credor fisco/transportadora)**:

```text
Débito  — conta da destinação ou tributo a recuperar, conforme o tratamento do modificador
Crédito — ICMS a Recolher (fisco) | Fornecedores (transportadora)
```

Exemplo — Lucro Real, compra interestadual de um notebook para uso (ativo), R$ 5.000, ICMS 12%
destacado (R$ 600), alíquota interna 18%, base única:

```text
Compra:     D Imobilizado            4.400      C Fornecedores        5.000
            D ICMS a Recuperar CIAP    600       (reclassificação)
Obrigação:  D Imobilizado              300      C ICMS a Recolher       300   (DIFAL 6%)
CIAP:       48 × D ICMS a Recuperar 12,50 / C ICMS a Recuperar — CIAP 12,50
Depreciação mensal sobre 4.700.
```

(Números ilustrativos: o tratamento do ICMS do ativo e a base do DIFAL dependem de regime e UF.)

---

## Módulo de arquivos

Hoje os documentos de compra e de nota recebida contornam o catálogo `files`
(`storePrivateFile` com caminho derivado, `xmlStoragePath`/`pdfStoragePath`). Este plano é o
gatilho para migrá-los, conforme a dívida listada em `lib/files/README.md`.

### Novos propósitos de upload (`UPLOAD_PURPOSES` + `UploadPurposeEnum`)

| Propósito | Transporte | Limite | Tipos | Uso |
| --- | --- | --- | --- | --- |
| `DOCUMENTO_FISCAL_ENTRADA` | PROXY | 4 MB | XML, PDF, PNG, JPEG, WEBP | NF-e, NFC-e, CT-e, cupom — builder e agente MCP |
| `GUIA_TRIBUTO` | PROXY | 4 MB | PDF, imagem | guia DAE/GNRE de uma obrigação |
| `COMPROVANTE_PAGAMENTO` | PROXY | 4 MB | PDF, imagem | comprovante de obrigação ou parcela |
| `DOCUMENTO_BEM_PATRIMONIAL` | DIRECT | 20 MB | PDF, imagem | termo, foto, laudo, garantia do bem |

Todos privados, bucket `private-files`, prefixo `organizations/{org}/...` derivado no servidor
(regra de `docs/security/file-storage-classification.md`).

`inspect` do propósito fiscal: XML passa pela mesma barreira de DTD/ENTITY de
`extractCompositionFromNfeXml` e por validação de raiz (`nfeProc`, `NFe`, `cteProc`, `CTe`);
PDF/imagem pela inspeção existente.

### Referência por `arquivoId`

- `PurchaseImportedDocumentSchema.arquivoId` substitui o caminho derivado de `referencia`. A rota
  `/api/purchases/imported-document` passa a resolver por `arquivoId` **com checagem de
  `organizacaoId` da linha de `files`** — preserva a garantia de hoje (uma referência forjada só
  alcança a própria organização).
- `fiscal_inbound_documents` ganha `xmlArquivoId` e `pdfArquivoId`; `xmlStoragePath`/`pdfStoragePath`
  viram sombra até o backfill terminar e então são removidas.
- `purchase_obligations.guiaArquivoId/comprovanteArquivoId` e anexos de `fixed_assets` (tabela de
  vínculo `fixed_asset_files` com `tipo`, pois um bem tem N anexos).

### Deduplicação

- Por conteúdo: `idx_files_org_sha256` já existe. Subir o mesmo XML duas vezes reaproveita a
  linha de `files`.
- Por identidade fiscal: ao importar um XML cuja `chaveAcesso` já existe em
  `fiscal_inbound_documents`, a compra se vincula à nota recebida (preenche `compraId`) e usa o
  mesmo `arquivoId`. Ao importar uma chave que **já está em outra compra**, o import avisa e
  bloqueia (com opção de abrir a compra existente).

### Retenção

Documentos fiscais precisam ser guardados pelo prazo decadencial (5 anos, contados do exercício
seguinte). `files` ganha `retidoAte timestamp` (ou campo em `metadados`, a decidir no ADR); a
exclusão de arquivo com `retidoAte` futuro é recusada. A exclusão da organização continua
apagando tudo (cascade), como hoje.

### Backfill

Script `scripts/backfill-purchase-fiscal-files.ts`: para cada documento em
`purchases.documentosImportados` e cada `fiscal_inbound_documents` com caminho, registra a linha
em `files` (`registerStoredFile`, conferindo `sha256` quando o snapshot tem) e grava o
`arquivoId`. Idempotente; relatório de órfãos.

---

## Novos fluxos

### A. Nota recebida → compra

1. A aba de notas recebidas ganha **"Lançar compra"** quando `completo = true` e `compraId` é nulo.
2. A ação abre o builder de compra na etapa de origem com o XML já carregado do catálogo
   (`xmlArquivoId`) — **mesmo pipeline** de `/api/purchases/import-composition`, origem `DFE`.
   Nenhum caminho paralelo de parsing.
3. Ao criar a compra, `fiscal_inbound_documents.compraId` é preenchido na mesma transação.
4. Configuração por organização: manifestar `CONFIRMACAO` automaticamente quando a compra é
   recebida (opt-in).
5. Quando o sync aplica `situacao = CANCELADA` (ou evento de cancelamento) em nota com
   `compraId`: problema fiscal novo em `lib/fiscal/problems.ts` (`NOTA_ENTRADA_CANCELADA`),
   notificação, e bloqueio de receber a compra se ainda não recebida. Se já recebida, o problema
   orienta o estorno (o sistema não desfaz sozinho).
6. Notas com `compraId` saem da lista "a lançar"; a lista ganha filtro "lançadas / pendentes".

### B. Builder de compra — etapa fiscal

Na fila de itens (`items-queue.tsx`), cada linha passa a mostrar e permitir editar:

- **Destinação** (default do produto/mapeamento, aviso de divergência).
- **Natureza da entrada** (derivada; não editável quando vem de XML, explicada).
- **CFOP de entrada** (derivado, editável).
- **Tributos**: já com tratamento sugerido pela regra e o motivo; a pessoa só revisa. O estado
  "tributo sem tratamento" (`stage-items.tsx`) passa a ser exceção (regra não resolveu), não regra.

Nova etapa de resumo **"Obrigações"** antes da confirmação: DIFAL, antecipação, ST de entrada e
frete de CT-e calculados, com memória de cálculo, vencimento sugerido e credor. Editável
(valor e vencimento) com origem `MANUAL` registrada.

Validações bloqueantes no import (todas com mensagem em português):

- `dest/CNPJ` diferente do CNPJ da organização.
- XML sem protocolo de autorização (`protNFe/cStat = 100`) — aviso, não bloqueio, para permitir
  contingência.
- `chaveAcesso` já usada em outra compra.
- `finNFe = 2` (complementar) sem compra referenciada encontrada.

### C. Recebimento por destinação

`handlePurchaseItemStockProcessing` passa a ramificar pela destinação e natureza:

| Destinação / natureza | Estoque | Outros efeitos |
| --- | --- | --- |
| REVENDA, INSUMO | `ENTRADA_AQUISICAO` com `valorUnitarioCusto` (como hoje) | lotes por `rastro` quando houver |
| USO_CONSUMO rastreado | `ENTRADA_AQUISICAO` | consumo posterior por novo tipo `SAIDA_CONSUMO_INTERNO` (D despesa / C material de consumo) |
| USO_CONSUMO não rastreado | nenhum | lançado direto em despesa |
| ATIVO_IMOBILIZADO | nenhum | cria N `fixed_assets` + cronograma CIAP quando houver crédito |
| BONIFICACAO | `ENTRADA_AQUISICAO` com custo da regra (zero ou valor) | sem duplicata |
| CONSIGNACAO, REMESSA, TRANSFERENCIA | fora desta fase | linha exibida, não lançada |

"Desfazer recebimento" (`UNRECEIVING`) ganha a contrapartida: bens sem depreciação lançada são
removidos; com depreciação, o desfazer é recusado (mesma lógica de `assertPurchaseLotsArePristine`).

### D. Obrigações da compra

- Nascem no recebimento a partir dos modificadores com credor ≠ fornecedor (`obrigacaoRef`).
- Tela em Compras > detalhe (aba "Obrigações") e lista consolidada "Guias a pagar" no
  Financeiro, filtrável por UF, status e vencimento.
- Anexar guia (`GUIA_TRIBUTO`) muda status para `GUIA_EMITIDA`; registrar pagamento cria a
  transação financeira do lançamento da obrigação e pede comprovante (`COMPROVANTE_PAGAMENTO`).
- Geração automática de GNRE fica fora do escopo (integração própria).

### E. CT-e

- Parser determinístico `lib/purchase/import-cte.ts` (mesma barreira de XML inseguro).
- O CT-e é anexado a uma compra existente (ou a várias): as chaves de NF-e em
  `infCTeNorm/infDoc/infNFe/chave` indicam quais compras ele cobre.
- `vTPrest` vira modificador `FRETE` rateado nos itens (método configurável), credor
  `TRANSPORTADORA`, com obrigação `FRETE_CTE`; o ICMS do CT-e é reclassificação para crédito
  conforme regra.
- Se a compra já foi recebida, o CT-e entra pelo fluxo explícito de correção de custo (o
  ADR-0001 proíbe alteração silenciosa).

### F. Patrimônio

- Módulo novo em `app/dashboard/assets/` (nome a decidir): lista de bens, detalhe, anexos,
  baixa (venda, descarte, perda) com lançamento de baixa e cancelamento das parcelas CIAP
  restantes.
- Job mensal `/api/cron/fixed-assets-depreciation`: idempotente por (bem, competência), gera
  depreciação e apropria a parcela CIAP do mês.
- Cadastro manual de bens antigos (sem compra) com depreciação acumulada inicial.

### G. ST retido para a saída

O ICMS-ST pago na entrada alimenta a NF-e de saída com CSOSN 500 / CST 60 (`vBCSTRet`,
`pST`, `vICMSSTRet`), exigido por várias UFs. Guardar por lote/produto o último ST unitário
recebido (de `dadosFiscais.icmsSt`) e expor ao motor fiscal de saída (`lib/fiscal/engine`), que
hoje não tem esses campos.

---

## Fases

Cada fase é entregável sozinha e mantém o comportamento atual para quem não usa a novidade.

### Fase 0 — Decisões registradas

- ADR-0002: papel do produto vs. destinação do item, natureza da entrada, efeito
  `RECLASSIFICACAO`, credor, `purchase_obligations`, um lançamento por credor, patrimônio.
- Atualizar `docs/domain/purchase-costing.md` (chaves, fórmula, tabela de contas).
- Validar com a contabilidade parceira: presets por regime, tratamento de bonificação, base do
  DIFAL por UF, crédito de ICMS e PIS/COFINS sobre ativo.

### Fase 1 — Leitura fiscal completa e arquivos

- Parser: `dadosFiscais` por item, extensão do snapshot de documento, `naturezaEntrada` derivada,
  `rastro` → `dataValidade`.
- Validações de destinatário, chave duplicada e protocolo.
- Colunas `dadosFiscais`, `naturezaEntrada`, `cfopEntrada` (só preenchidas; o custeio não muda).
- Propósito `DOCUMENTO_FISCAL_ENTRADA`, `arquivoId` no snapshot, backfill.
- **Testes**: fixtures de XML reais anonimizados (revenda Simples, Lucro Real com ICMS/PIS/COFINS,
  ST, bonificação misturada, complementar, importação, IBS/CBS), destinatário errado.

### Fase 2 — Nota recebida → compra

- Botão "Lançar compra", `compraId`, `xmlArquivoId`/`pdfArquivoId`, problema de cancelamento,
  confirmação automática opt-in.
- **Testes**: cancelamento após vínculo; chave importada manualmente que já existe como nota
  recebida.

### Fase 3 — Papel do produto e destinação

- `products.tipoItem` + migração e relatório de revisão; padrões no cadastro.
- `purchase_items.destinacao`, memória no mapeamento fornecedor-produto.
- Contabilização por destinação (`contasDebitoPorDestinacao`), uso e consumo não rastreado
  direto em despesa, `SAIDA_CONSUMO_INTERNO`, bonificação.
- **Testes**: custo médio inalterado por uso e consumo não rastreado; bonificação a custo zero
  não gera duplicata; linhas balanceadas por destinação.

### Fase 4 — Créditos embutidos e regras

- Modificador v2 (`RECLASSIFICACAO`, `regraId`), novas chaves de crédito, `calculatePurchaseItemCost`.
- Presets por regime, `fiscal_entry_rules`, `resolveEntryTaxTreatment`, `deriveEntryCfop`, tela de
  regras em Fiscal > Configurações.
- Crédito limitado pelo CRT do emitente (fornecedor do Simples só gera `IMPOSTOS_ICMS_SN`).
- **Testes**: v1 continua lendo igual; reclassificação não muda o valor a pagar; soma fecha em
  centavos; precedência de regras.

### Fase 5 — Credor e obrigações

- `credor` no modificador, `purchase_obligations`, lançamento por obrigação, `fiscal_uf_parameters`
  + script de carga, cálculo de DIFAL (base única e dupla), antecipação parcial e ST de entrada
  (`lib/fiscal/entry/difal.ts`, puro), etapa "Obrigações" no builder, "Guias a pagar".
- Propósitos `GUIA_TRIBUTO` e `COMPROVANTE_PAGAMENTO`.
- **Testes**: tabela de casos de DIFAL por UF conferida pela contabilidade; invariante
  `custo + crédito + despesa = fornecedor + terceiros`.

### Fase 6 — CT-e

- Parser, vínculo por chaves referenciadas, rateio, obrigação `FRETE_CTE`, crédito do ICMS do
  frete, fluxo de correção para compra já recebida.

### Fase 7 — Patrimônio

- `fixed_assets`, depreciação, CIAP, baixa, anexos (`DOCUMENTO_BEM_PATRIMONIAL`), cadastro manual,
  plano de contas 1.6.
- **Testes**: job idempotente; baixa no mês 20 cancela 28 parcelas CIAP; desfazer recebimento
  recusado com depreciação lançada.

### Fase 8 — Saída e reforma

- ST retido no motor de saída; emissão de devolução de compra (CFOP 5202/6202 com `refNFe`),
  que depende de o motor fiscal de saída suportar regimes além do Simples.
- IBS/CBS: em 2026 só ficam em `dadosFiscais` (informativo); viram modificadores de crédito
  quando passarem a compor o valor devido. Revisar o cronograma de transição antes desta fase.

---

## Riscos e dependências

- **Motor fiscal de saída é Simples-only** (`fiscal_tax_groups` usa CSOSN). Organizações do
  Presumido/Real conseguem escriturar a entrada com este plano, mas a saída delas ainda não fecha
  o ciclo de crédito × débito. Isso não bloqueia as fases 1–7, mas limita o valor para esses
  regimes até a Fase 8.
- **Regime da organização** vem de `regimeTributario` na configuração fiscal. Organizações sem
  configuração fiscal (CRM puro com compras) caem no preset Simples, com aviso.
- **Dados de referência por UF** mudam com frequência. O script de carga precisa de dono e de
  vigência por linha.
- **Compras recebidas antes da Fase 4** ficam como estão (v1, sem destinação além do default).
  Não haverá reprocessamento retroativo automático.

## Decisões em aberto

1. Bonificação: custo zero ou valor da nota como padrão? (afeta custo médio e margem)
2. `retidoAte` como coluna em `files` ou dentro de `metadados`?
3. Uso e consumo: o default do produto `USO_CONSUMO` é rastrear estoque (almoxarifado) ou não?
4. Patrimônio como módulo próprio na navegação ou aba dentro de Produtos?
5. Transportadora como `suppliers` (proposta) ou cadastro próprio?
6. Um bem por unidade sempre, ou permitir bem agrupado (ex.: 20 cadeiras como um bem)?
