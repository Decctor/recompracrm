# ADR-0001 — Composição do custo de compras e linhas contábeis

- Status: Aceito
- Data: 2026-08-10
- Estendido por: [ADR-0002](./0002-purchase-fiscal-entry-primitives.md) (contrapartida dos modificadores, destinação do item, lançamentos por credor, patrimônio)

## Contexto

Os itens de compra registram valor bruto, descontos, acréscimos e valor líquido, mas não preservam a discriminação de frete, seguro, IPI, ICMS-ST, FCP-ST e despesas acessórias. O recebimento usa o valor unitário líquido como custo de entrada, portanto qualquer classificação incorreta afeta custo médio móvel, margem, produção e perdas de estoque.

O lançamento contábil atual representa apenas um débito, um crédito e um valor. Isso impede partidas com múltiplas contas, como estoque, tributos recuperáveis, despesas do período e fornecedores.

## Decisão

### Composição do item de compra

Os modificadores pertencem ao item e serão persistidos em um snapshot JSONB versionado, `purchase_items.modificadores_custo`. Não haverá tabelas específicas para documentos, componentes ou rateios de compra.

O JSONB guarda valores em centavos e contém chave, efeito, tratamento, origem documental e informação de rateio. Os totais usados por estoque e consultas frequentes permanecem em colunas escalares exatas: `valor_total_custo` e `valor_unitario_custo`.

`MERCADORIA` não é modificador: o valor-base continua nos campos monetários do item. As chaves tributárias usam o prefixo `IMPOSTOS_`:

- `IMPOSTOS_IPI`
- `IMPOSTOS_ICMS_ST`
- `IMPOSTOS_FCP_ST`

O tratamento é independente da chave:

- `CUSTO_ESTOQUE`
- `CREDITO_TRIBUTARIO`
- `DESPESA_PERIODO`

Assim, o mesmo IPI pode ser capitalizado ou reconhecido como crédito conforme o contexto fiscal. Nenhum imposto é capitalizado ou excluído universalmente apenas por sua chave.

### Origem documental

A compra preserva seus documentos de origem em `purchases.documentos_importados`, um snapshot JSONB versionado. Cada documento recebe uma referência local usada pelos modificadores dos itens. O arquivo original, quando retido, é privado e identificado por referência e hash — nunca por um caminho gravado no snapshot, que o cliente poderia forjar para alcançar objetos de outra organização.

### Contabilidade

O par fixo débito/crédito será substituído gradualmente por `accounting_entry_lines`, uma primitiva genérica para todas as origens contábeis. Cada linha contém conta, natureza, valor, descrição, ordem e metadados opcionais.

Todas as origens gravam linhas: compra (composição por tratamento), lançamento manual (partida de N linhas pela UI), e as origens de par único — venda, estorno, transferência, movimento de sessão, conciliação, recorrência, pagamento de cartão e perda de estoque — via `writeDefaultAccountingEntryLines`. Não há flag de ambiente — o balanceamento é validado na mesma chamada que persiste, então uma linha só existe se fecha.

Os leitores agregados (DRE e stats financeiros) consultam exclusivamente `accounting_entry_lines`; um lançamento sem linhas não aparece nos relatórios, e o backfill (`scripts/backfill-purchase-cost-composition.ts --only=lines`) é o que garante que não exista nenhum. `idContaDebito`/`idContaCredito` viraram sombra derivada — no lançamento manual, a primeira linha de cada natureza — mantida apenas porque as colunas são NOT NULL e a lista de lançamentos, o template de recorrência e o estorno ainda as leem. Removê-las é um passo pequeno e isolado: migrar esses três leitores pontuais, tornar as colunas anuláveis e então dropá-las.

Não haverá enum global de chaves para linhas contábeis. A classificação efetiva é `contaContabilId + natureza`; a chave de um modificador explica origem econômica e não deve competir com o plano de contas.

Para todo lançamento:

```text
soma dos débitos = soma dos créditos = valor do lançamento
```

As transações financeiras continuam representando parcelas e liquidações e devem reconciliar com o valor de face do lançamento.

## Motivos

- Modificadores e documentos são snapshots pertencentes à compra, sem ciclo de vida independente; JSONB preserva sua localidade sem criar tabelas rasas.
- Colunas escalares evitam que estoque e relatórios críticos precisem interpretar JSON.
- Linhas contábeis são uma primitiva durável e eliminam a limitação estrutural do par débito/crédito em todas as origens.
- Separar chave, tratamento e conta impede que regras fiscais sejam embutidas em nomes técnicos.
- Um módulo profundo de cálculo concentra rateio, arredondamento, validação e geração contábil atrás de uma interface pequena e testável.

## Alternativas rejeitadas

### Tabelas específicas de custos e rateios da compra

Rejeitadas porque cada linha teria o mesmo ciclo de vida do item e seria sempre carregada e atualizada em conjunto. A complexidade relacional não produziria alavancagem suficiente.

### Guardar apenas o valor líquido final

Rejeitada porque perde proveniência, tratamento fiscal, capacidade de auditoria e reconciliação com XML.

### Usar chaves como `MERCADORIA` e `DESPESA_ACESSORIA` nas linhas contábeis

Rejeitada porque mistura origem da compra com classificação contábil. Uma despesa acessória capitalizada desaparece na conta de estoque; uma despesa do período ganha sua própria conta.

### Capitalizar IPI e ICMS-ST incondicionalmente

Rejeitada porque tributos recuperáveis não compõem custo de estoque. O padrão deve ser orientado pelo contexto fiscal e revisável pelo operador.

## Consequências

- O recebimento congela composição e totais de custo do item.
- Alterações após recebimento exigem o fluxo explícito de correção que reprocesse estoque.
- Relatórios por conta usam linhas contábeis; relatórios por origem fiscal podem expandir o JSONB por uma view quando houver demanda comprovada.
- Implementações que alterem chaves, tratamentos, fórmulas ou invariantes devem atualizar este ADR, o guia de domínio e os testes no mesmo conjunto de mudanças.

## Referências

- [CPC 16 (R1) — Estoques](https://conteudo.cvm.gov.br/export/sites/cvm/menu/regulados/normascontabeis/cpc/CPC_16_R1_rev_12.pdf)
- [Documentação da NF-e](https://dfe-portal.svrs.rs.gov.br/NFe/Documentos)
- [`docs/domain/purchase-costing.md`](../domain/purchase-costing.md)
