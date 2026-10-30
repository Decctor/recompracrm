# Guia para integradores — views de banco de dados para coleta de dados

> **Público:** equipes técnicas de ERPs, PDVs e sistemas de gestão que não expõem uma API e vão
> disponibilizar os dados do lojista ao RecompraCRM por meio de **views SQL somente leitura**.
>
> **Objetivo:** descrever, de forma independente de fornecedor, como essas views devem ser
> construídas para alimentar o fluxo de coleta de dados (vendas, itens, clientes, produtos,
> vendedores). Este documento é a especificação-padrão para qualquer integrador que siga esse
> modelo; particularidades de um fornecedor específico são combinadas à parte, sempre dentro
> deste contrato.

Versão resumida para enviar ao integrador: [`INTEGRATOR-DB-VIEWS-COMPACT.md`](./INTEGRATOR-DB-VIEWS-COMPACT.md).

Referência interna (equipe RecompraCRM): o pipeline que consome as views é o mesmo de todas as
fontes de dados, documentado em [`DATA-COLLECTING-INTEGRATION.md`](./DATA-COLLECTING-INTEGRATION.md).
A seção [Mapeamento para o modelo canônico](#mapeamento-para-o-modelo-canônico) relaciona cada
coluna ao campo que o conector preenche.

---

## Sumário

1. [Como o RecompraCRM consome os dados](#como-o-recompracrm-consome-os-dados)
2. [Princípios do contrato](#princípios-do-contrato)
3. [Views exigidas](#views-exigidas)
   - [`vw_recompra_metadados`](#vw_recompra_metadados)
   - [`vw_recompra_vendas`](#vw_recompra_vendas)
   - [`vw_recompra_venda_itens`](#vw_recompra_venda_itens)
   - [`vw_recompra_venda_pagamentos`](#vw_recompra_venda_pagamentos-opcional) (opcional)
   - [`vw_recompra_clientes`](#vw_recompra_clientes)
   - [`vw_recompra_produtos`](#vw_recompra_produtos)
   - [`vw_recompra_vendedores`](#vw_recompra_vendedores)
   - [`vw_recompra_parceiros`](#vw_recompra_parceiros-opcional) (opcional)
4. [Regras de dados](#regras-de-dados)
5. [Padrões de consulta e desempenho](#padrões-de-consulta-e-desempenho)
6. [Acesso, segurança e privacidade](#acesso-segurança-e-privacidade)
7. [Entrega, homologação e mudanças](#entrega-homologação-e-mudanças)
8. [Mapeamento para o modelo canônico](#mapeamento-para-o-modelo-canônico)
9. [Apêndice A — DDL de exemplo (PostgreSQL)](#apêndice-a--ddl-de-exemplo-postgresql)
10. [Apêndice B — consultas de validação](#apêndice-b--consultas-de-validação)

---

## Como o RecompraCRM consome os dados

O RecompraCRM é um CRM de retenção. Ele **não** altera nada no sistema do integrador: apenas lê
vendas e cadastros, e a partir deles alimenta a base de clientes, calcula cashback, dispara
campanhas (primeira compra, recompra, aniversário, inatividade) e gera indicadores.

Há dois modos de leitura, e as views precisam atender aos dois:

| Modo | Frequência | Janela consultada | Para quê |
| --- | --- | --- | --- |
| **Contínuo** | a cada 5 minutos | vendas com `data_venda` no dia corrente (fuso do lojista) **e** qualquer venda com `data_atualizacao` desde a última leitura | manter o CRM atualizado quase em tempo real; capturar cancelamentos e correções de vendas antigas |
| **Histórico** | sob demanda, ao conectar | intervalos de datas em blocos (tipicamente 7 a 31 dias por consulta), percorrendo meses ou anos para trás | carregar a base de clientes e o histórico de compras ao ativar a integração |

Cada leitura é **idempotente** do nosso lado: uma venda já importada que chega de novo sem
alterações não gera efeito nenhum; uma venda que mudou (valor, itens, status) é atualizada; uma
venda que passou a `CANCELADA` tem o cashback estornado. Para isso funcionar, o integrador precisa
garantir principalmente três coisas: **identificadores estáveis**, **cancelamentos visíveis** e
**data de atualização confiável**. O restante deste documento detalha isso.

---

## Princípios do contrato

1. **Somente leitura.** O RecompraCRM recebe um usuário de banco com permissão apenas de `SELECT`
   nas views do contrato. Nenhuma tabela base é exposta; nenhuma escrita acontece.
2. **Schema dedicado.** Todas as views ficam em um schema próprio (sugestão: `recompra`), separado
   dos objetos do produto. Isso delimita exatamente o que é visível e facilita o `GRANT`.
3. **Contrato estável e versionado.** Nomes e tipos de colunas não mudam. Adicionar coluna é
   permitido a qualquer momento. Remover ou renomear coluna, mudar tipo ou mudar semântica exige
   uma nova versão da view (`vw_recompra_vendas_v2`) mantendo a anterior funcionando até a
   migração ser combinada. Ver [Entrega, homologação e mudanças](#entrega-homologação-e-mudanças).
4. **Uma linha por entidade, formato plano.** Nada de JSON, XML ou listas concatenadas em uma
   coluna. Itens, pagamentos e clientes ficam em views próprias ligadas por chave.
5. **Identificadores imutáveis.** `venda_id`, `item_id`, `cliente_id`, `produto_id` e
   `vendedor_id` nunca mudam para o mesmo registro e nunca são reutilizados para outro. Se o
   sistema reaproveita números (por exemplo, numeração de cupom reinicia por loja ou por ano), o
   integrador compõe um identificador único na view (`loja_id || '-' || ano || '-' || numero`).
6. **Nenhuma linha some.** Venda cancelada, cliente inativado e produto descontinuado continuam
   aparecendo, com o status correspondente. Exclusão física no sistema de origem deve, se
   possível, ser refletida como um status (`CANCELADA`/`ativo = false`) e não como ausência.
7. **Tipos explícitos.** Valores monetários em `NUMERIC(14,2)`, quantidades em `NUMERIC(14,4)`,
   datas em `TIMESTAMP WITH TIME ZONE` (ou equivalente do SGBD com fuso declarado), booleanos em
   `BOOLEAN`. Nunca dinheiro ou data como texto.
8. **Codificação UTF-8**, sem caracteres de controle. Textos sem espaços à direita.
9. **Fuso horário declarado.** O fuso em que as datas são expressas é informado em
   `vw_recompra_metadados.fuso_horario` e é o mesmo em todas as views.
10. **Desempenho previsível.** As consultas descritas em
    [Padrões de consulta](#padrões-de-consulta-e-desempenho) precisam responder em segundos, não
    em minutos, com índices nas tabelas base que sustentam os filtros das views.

---

## Views exigidas

Convenções das tabelas abaixo:

- **Obrig.**: `S` = obrigatória e não nula; `S*` = coluna obrigatória, valor pode ser nulo;
  `N` = coluna opcional (pode não existir na view).
- Tipos descritos em PostgreSQL; use o equivalente no seu SGBD.

### `vw_recompra_metadados`

Uma única linha. Descreve o contrato e serve de *heartbeat* para diagnóstico.

| Coluna | Tipo | Obrig. | Descrição |
| --- | --- | --- | --- |
| `contrato_versao` | `TEXT` | S | Versão deste contrato implementada (ex.: `1.0`). |
| `sistema_nome` | `TEXT` | S | Nome e versão do sistema de origem (ex.: `MeuERP 7.3`). |
| `fuso_horario` | `TEXT` | S | Fuso IANA das datas em todas as views (ex.: `America/Sao_Paulo`). |
| `ultima_venda_em` | `TIMESTAMPTZ` | S* | Maior `data_venda` existente. Usado para detectar origem parada. |
| `ultima_atualizacao_em` | `TIMESTAMPTZ` | S* | Maior `data_atualizacao` entre as vendas. |
| `gerado_em` | `TIMESTAMPTZ` | S | `now()` do banco no momento da consulta. Detecta relógio e fuso errados. |

### `vw_recompra_vendas`

Uma linha por venda (cupom, pedido, nota, comanda fechada). É a view central: o RecompraCRM só
cria ou atualiza um cliente a partir das vendas em que ele aparece.

| Coluna | Tipo | Obrig. | Descrição |
| --- | --- | --- | --- |
| `venda_id` | `TEXT` | S | Identificador **único e imutável** da venda em toda a origem (todas as lojas). Chave de deduplicação. |
| `venda_numero` | `TEXT` | S* | Número legível para o operador (número do cupom/pedido). Pode repetir. |
| `loja_id` | `TEXT` | S* | Identificador da loja/filial/unidade. Obrigatório quando a base atende mais de uma loja; o RecompraCRM pode filtrar por ele. |
| `data_venda` | `TIMESTAMPTZ` | S | Momento em que a venda foi realizada/concluída. É a data da compra para campanhas e cashback. |
| `data_atualizacao` | `TIMESTAMPTZ` | S | Última alteração **em qualquer coisa** da venda: status, valores, itens, pagamentos, cliente. Monotônica (nunca retrocede). |
| `status_codigo` | `TEXT` | S | Um de: `CONCLUIDA`, `CANCELADA`, `PENDENTE`. Ver [Status](#status-da-venda). |
| `status_original` | `TEXT` | S* | Status como existe no sistema de origem (ex.: `Faturada`, `Devolvida`). Guardado para auditoria. |
| `data_cancelamento` | `TIMESTAMPTZ` | S* | Preenchida quando `status_codigo = 'CANCELADA'`. |
| `valor_total` | `NUMERIC(14,2)` | S | Valor final pago pelo cliente (após descontos e acréscimos, incluindo frete se cobrado do cliente). |
| `valor_desconto` | `NUMERIC(14,2)` | S | Total de descontos da venda (itens + cabeçalho). `0` quando não houver. |
| `valor_acrescimo` | `NUMERIC(14,2)` | S | Total de acréscimos (frete, taxa de serviço, juros). `0` quando não houver. |
| `valor_custo` | `NUMERIC(14,2)` | S* | Custo total da mercadoria vendida, se o sistema calcular. Nulo se desconhecido (nunca `0` por padrão). |
| `cliente_id` | `TEXT` | S* | Chave para `vw_recompra_clientes`. Nulo em venda sem identificação do cliente ("consumidor final"). |
| `cliente_nome` | `TEXT` | S* | Nome do cliente **no momento da venda**. Redundante com o cadastro, de propósito: garante o nome mesmo quando `cliente_id` é nulo ou o cadastro foi alterado. |
| `cliente_telefone` | `TEXT` | S* | Telefone informado na venda (ex.: CPF/telefone na nota, pedido delivery). Ver [Telefones](#telefones). |
| `cliente_cpf_cnpj` | `TEXT` | S* | Documento informado na venda, só dígitos. |
| `vendedor_id` | `TEXT` | S* | Chave para `vw_recompra_vendedores`. |
| `vendedor_nome` | `TEXT` | S* | Nome do vendedor no momento da venda. |
| `parceiro_id` | `TEXT` | N | Chave para `vw_recompra_parceiros` (indicador, afiliado, profissional que indicou). |
| `canal` | `TEXT` | S* | Origem comercial: `LOJA`, `DELIVERY`, `SITE`, `WHATSAPP`, `MARKETPLACE`, `TELEVENDAS` ou outro valor documentado no dicionário entregue. |
| `modalidade_entrega` | `TEXT` | S* | Um de: `PRESENCIAL`, `RETIRADA`, `ENTREGA`, `COMANDA`. Nulo se o sistema não distingue. |
| `observacoes` | `TEXT` | N | Observações livres da venda. |
| `documento_fiscal_numero` | `TEXT` | N | Número da NF-e/NFC-e, se emitida. |
| `documento_fiscal_serie` | `TEXT` | N | Série do documento fiscal. |
| `documento_fiscal_modelo` | `TEXT` | N | Modelo fiscal (`55`, `65`, `SAT`, etc.). |
| `documento_fiscal_chave` | `TEXT` | N | Chave de acesso (44 dígitos). |
| `natureza_operacao` | `TEXT` | N | Natureza/CFOP predominante. Útil para excluir operações que não são venda (ver [Escopo](#escopo-o-que-é-uma-venda)). |

### `vw_recompra_venda_itens`

Uma linha por item de venda. **Sempre o conjunto completo e atual** dos itens da venda: a cada
leitura o RecompraCRM substitui os itens que tinha pelos que a view devolve. Itens removidos de uma
venda em edição devem simplesmente deixar de aparecer (e a `data_atualizacao` da venda avançar).

| Coluna | Tipo | Obrig. | Descrição |
| --- | --- | --- | --- |
| `item_id` | `TEXT` | S | Identificador único e imutável do item. |
| `venda_id` | `TEXT` | S | Chave para `vw_recompra_vendas`. Todo item pertence a uma venda presente na view de vendas. |
| `sequencia` | `INTEGER` | N | Ordem do item na venda. |
| `produto_id` | `TEXT` | S | Chave para `vw_recompra_produtos`. |
| `produto_codigo` | `TEXT` | S | Código do produto como aparece para o lojista (SKU/código interno). Ver [Produtos](#produtos-e-códigos). |
| `produto_descricao` | `TEXT` | S | Descrição do produto **no momento da venda**. |
| `variante_codigo` | `TEXT` | N | Código da variação (cor/tamanho), quando o produto é vendido por variante. |
| `quantidade` | `NUMERIC(14,4)` | S | Quantidade vendida, positiva. |
| `unidade` | `TEXT` | N | Unidade de medida do item (`UN`, `KG`, `L`). |
| `valor_unitario` | `NUMERIC(14,4)` | S | Preço unitário de tabela praticado. |
| `valor_bruto` | `NUMERIC(14,2)` | S | `quantidade × valor_unitario`, antes de descontos. |
| `valor_desconto` | `NUMERIC(14,2)` | S | Desconto do item (incluindo rateio de desconto de cabeçalho, se o sistema rateia). `0` quando não houver. |
| `valor_liquido` | `NUMERIC(14,2)` | S | `valor_bruto − valor_desconto` (+ acréscimo rateado, se houver). |
| `custo_unitario` | `NUMERIC(14,4)` | S* | Custo unitário no momento da venda. Nulo se desconhecido. |
| `custo_total` | `NUMERIC(14,2)` | S* | `quantidade × custo_unitario`. Nulo se desconhecido. |
| `observacoes` | `TEXT` | N | Observações do item (ex.: "sem cebola"). |

### `vw_recompra_venda_pagamentos` (opcional)

Uma linha por forma de pagamento da venda. Recomendada: habilita análises por meio de pagamento e,
no futuro, conciliação. Se o sistema não guarda pagamentos por venda, a view pode ser omitida.

| Coluna | Tipo | Obrig. | Descrição |
| --- | --- | --- | --- |
| `pagamento_id` | `TEXT` | S | Identificador único do lançamento. |
| `venda_id` | `TEXT` | S | Chave para `vw_recompra_vendas`. |
| `forma_pagamento` | `TEXT` | S | Um de: `DINHEIRO`, `PIX`, `CARTAO_CREDITO`, `CARTAO_DEBITO`, `BOLETO`, `TRANSFERENCIA`, `CASHBACK`, `VALE`, `FIADO_NOTA`, `OUTRO`. |
| `forma_pagamento_original` | `TEXT` | S* | Descrição no sistema de origem (ex.: `Visa Crédito 3x`). |
| `valor` | `NUMERIC(14,2)` | S | Valor pago nessa forma. A soma por venda deve bater com `valor_total`. |
| `parcelas` | `INTEGER` | N | Número de parcelas, se aplicável. |
| `pago_online` | `BOOLEAN` | N | `true` quando pago antecipadamente pelo canal (site/app); `false` no caixa ou na entrega. |
| `troco_para` | `NUMERIC(14,2)` | N | Dinheiro na entrega: nota com que o cliente pagará. |

### `vw_recompra_clientes`

Uma linha por cliente cadastrado. O RecompraCRM identifica o cliente por `cliente_id`; quando não
há cadastro, usa o telefone. Por isso o telefone é o dado mais importante desta view.

| Coluna | Tipo | Obrig. | Descrição |
| --- | --- | --- | --- |
| `cliente_id` | `TEXT` | S | Identificador único e imutável. |
| `nome` | `TEXT` | S | Nome completo / razão social. |
| `nome_fantasia` | `TEXT` | N | Nome fantasia ou apelido. |
| `telefone` | `TEXT` | S* | Telefone principal, de preferência celular com DDD. Ver [Telefones](#telefones). |
| `telefone_secundario` | `TEXT` | N | Segundo telefone. |
| `email` | `TEXT` | S* | E-mail. |
| `cpf_cnpj` | `TEXT` | S* | Só dígitos. |
| `inscricao_estadual` | `TEXT` | N | Para pessoa jurídica. |
| `data_nascimento` | `DATE` | S* | Usada em campanhas de aniversário. |
| `sexo` | `TEXT` | N | Valor livre documentado (`F`, `M`, `OUTRO`), se o cadastro tiver. |
| `cep` | `TEXT` | N | Só dígitos. |
| `estado` | `TEXT` | N | UF com duas letras. |
| `cidade` | `TEXT` | N | |
| `bairro` | `TEXT` | N | |
| `logradouro` | `TEXT` | N | |
| `numero` | `TEXT` | N | |
| `complemento` | `TEXT` | N | |
| `aceita_marketing` | `BOOLEAN` | N | Consentimento registrado na origem. Quando presente, o RecompraCRM respeita `false`. |
| `ativo` | `BOOLEAN` | S | `false` para cadastro inativado/excluído logicamente. |
| `data_cadastro` | `TIMESTAMPTZ` | S* | |
| `data_atualizacao` | `TIMESTAMPTZ` | S | Última alteração do cadastro. |

### `vw_recompra_produtos`

Uma linha por produto (ou por variante, quando o sistema trabalha com grade). O RecompraCRM cria
o produto na primeira vez que ele aparece em uma venda e usa o cadastro para enriquecer a descrição
e a categoria.

| Coluna | Tipo | Obrig. | Descrição |
| --- | --- | --- | --- |
| `produto_id` | `TEXT` | S | Identificador único e imutável. |
| `codigo` | `TEXT` | S | Código do produto como o lojista o conhece (SKU). Único entre produtos ativos. |
| `codigo_barras` | `TEXT` | N | EAN/GTIN. |
| `descricao` | `TEXT` | S | Nome/descrição comercial. |
| `unidade` | `TEXT` | S* | `UN`, `KG`, `L`, etc. |
| `grupo` | `TEXT` | S* | Categoria/grupo/departamento. Um nível; se houver hierarquia, concatenar com ` > `. |
| `marca` | `TEXT` | N | |
| `ncm` | `TEXT` | N | Só dígitos. |
| `tipo` | `TEXT` | S* | `PRODUTO`, `SERVICO`, `KIT`, `INSUMO` ou outro valor documentado. |
| `produto_pai_id` | `TEXT` | N | Para variantes: id do produto base. |
| `variante_descricao` | `TEXT` | N | Para variantes: eixos legíveis (`Cor: Preto; Tamanho: G`). |
| `preco_venda` | `NUMERIC(14,2)` | N | Preço de tabela atual. |
| `custo` | `NUMERIC(14,4)` | N | Custo atual. |
| `ativo` | `BOOLEAN` | S | |
| `data_atualizacao` | `TIMESTAMPTZ` | S | |

### `vw_recompra_vendedores`

| Coluna | Tipo | Obrig. | Descrição |
| --- | --- | --- | --- |
| `vendedor_id` | `TEXT` | S | Identificador único e imutável. |
| `nome` | `TEXT` | S | |
| `loja_id` | `TEXT` | N | Loja principal, quando houver mais de uma. |
| `ativo` | `BOOLEAN` | S | |
| `data_atualizacao` | `TIMESTAMPTZ` | S | |

### `vw_recompra_parceiros` (opcional)

Para sistemas com programa de indicação, afiliados ou profissionais parceiros (ex.: arquitetos,
médicos, cabeleireiros) vinculados a vendas.

| Coluna | Tipo | Obrig. | Descrição |
| --- | --- | --- | --- |
| `parceiro_id` | `TEXT` | S | Identificador único e imutável. |
| `nome` | `TEXT` | S | |
| `codigo_afiliacao` | `TEXT` | N | Código/cupom de indicação. |
| `cpf_cnpj` | `TEXT` | N | Só dígitos. |
| `cliente_id` | `TEXT` | N | Quando o parceiro também é cliente cadastrado. |
| `ativo` | `BOOLEAN` | S | |
| `data_atualizacao` | `TIMESTAMPTZ` | S | |

---

## Regras de dados

### Escopo: o que é uma venda

Entram em `vw_recompra_vendas` apenas operações de **venda ao cliente final** concluídas ou em
andamento: cupons, pedidos, notas de venda, comandas fechadas. Devem ficar **fora** da view (ou,
se for inviável separar, claramente identificáveis por `natureza_operacao` e documentadas):

- orçamentos e pré-vendas que nunca se tornaram venda;
- devoluções, trocas e notas de entrada (uma devolução é refletida como cancelamento ou como
  redução de valor na venda original, com `data_atualizacao` atualizada);
- transferências entre lojas, remessas, bonificações, consumo interno;
- vendas de teste/treinamento.

Quando uma troca gera uma nova venda com valor positivo, ela entra normalmente como venda.

### Status da venda

`status_codigo` resume o ciclo de vida em três valores. O RecompraCRM só processa efeitos
(cashback, campanhas, métricas do cliente) quando a venda está `CONCLUIDA`, e estorna quando
ela passa a `CANCELADA`.

| `status_codigo` | Significado | O que o RecompraCRM faz |
| --- | --- | --- |
| `CONCLUIDA` | Venda efetivada: paga, faturada ou entregue conforme a regra do sistema. | Registra a compra, acumula cashback, dispara campanhas. |
| `PENDENTE` | Venda aberta: pedido não confirmado, comanda em andamento, pagamento não aprovado. | Guarda a venda sem efeitos. Quando virar `CONCLUIDA`, os efeitos acontecem. |
| `CANCELADA` | Venda cancelada, estornada ou devolvida integralmente. | Marca como cancelada e estorna cashback e métricas. |

Regras:

- A transição `CONCLUIDA → CANCELADA` **precisa** ser visível na view, com `data_atualizacao`
  avançando. É o único mecanismo de estorno. Uma venda cancelada que desaparece da view é tratada
  como se continuasse válida.
- `PENDENTE` é opcional: sistemas que só registram vendas fechadas podem expor apenas `CONCLUIDA`
  e `CANCELADA`.
- Devolução parcial: manter `CONCLUIDA`, reduzir `valor_total` e os itens, avançar
  `data_atualizacao`. Devolução integral: `CANCELADA`.
- O mapeamento de cada status do sistema de origem para esses três valores é entregue junto com
  as views (ver [Entrega](#entrega-homologação-e-mudanças)) e preservado em `status_original`.

### Datas e fuso horário

- `data_venda` é a data/hora em que a venda aconteceu para o lojista, não a data de sincronização,
  faturamento posterior ou emissão fiscal tardia. Para pedidos com ciclo longo (delivery, encomenda)
  use a data de confirmação do pedido.
- Todas as colunas de data usam o mesmo fuso, declarado em `vw_recompra_metadados.fuso_horario`.
  Preferência: `TIMESTAMP WITH TIME ZONE`. Em SGBDs sem esse tipo, armazene em hora local do
  lojista e declare o fuso; nunca misture UTC e hora local.
- `data_atualizacao` deve mudar sempre que **qualquer** coluna da venda, de seus itens ou de seus
  pagamentos mudar. Se o sistema de origem não tem essa coluna nas tabelas base, o integrador
  precisa criá-la (trigger ou `GREATEST` entre as datas de alteração das tabelas envolvidas). Sem
  ela, o RecompraCRM não enxerga cancelamentos de vendas de dias anteriores.
- `data_atualizacao >= data_venda` sempre.

### Valores monetários

- Tipo numérico com duas casas; ponto decimal; sem símbolo, sem separador de milhar, sem texto.
- Para cada venda `CONCLUIDA`: `SUM(itens.valor_liquido) + valor_acrescimo − desconto_de_cabeçalho_não_rateado ≈ valor_total`,
  com tolerância de R$ 0,05 por arredondamento. O ideal é ratear descontos e acréscimos nos itens
  para que `SUM(itens.valor_liquido) = valor_total`.
- `valor_total` é o que o cliente pagou (base do cashback). Não deduzir taxas de cartão,
  comissões de marketplace ou impostos.
- Custo: nulo quando desconhecido. `0` significa "custou zero" e distorce a margem.

### Telefones

O telefone é a chave de identificação do cliente quando não há `cliente_id`, e é o destino das
campanhas por WhatsApp. O RecompraCRM normaliza o número removendo tudo que não é dígito, o
prefixo `55` quando presente e o nono dígito de celulares, e **descarta números com menos de 10
dígitos** (DDD + número). Portanto:

- Sempre inclua o DDD. Um número sem DDD é inutilizável.
- Priorize o celular sobre o fixo em `telefone`; coloque o fixo em `telefone_secundario`.
- Pode manter a formatação de origem (`(34) 99662-6855`); ela é removida na leitura.
- Não envie telefones de preenchimento (`00000000000`, `99999999999`, o telefone da própria loja).
  Prefira nulo.

### Clientes e deduplicação

- O RecompraCRM procura o cliente por `cliente_id`; se não encontra, pelo telefone normalizado; só
  então cria um cliente novo. Dois cadastros diferentes na origem com o mesmo telefone resultam em
  um único cliente no CRM.
- Venda sem `cliente_id` mas com `cliente_telefone` cria/atualiza o cliente pelo telefone.
  Venda sem nenhum dos dois é importada sem cliente (conta para faturamento, não para CRM).
- Quando a origem funde cadastros duplicados, o `cliente_id` sobrevivente deve passar a aparecer
  nas vendas antigas do cadastro absorvido, com `data_atualizacao` avançando, para que o histórico
  siga o cliente.

### Produtos e códigos

- O RecompraCRM casa o item da venda com o produto pelo `produto_codigo` (e, quando existir, pelo
  `variante_codigo`). O código precisa ser **estável e único entre produtos ativos**. Se o sistema
  permite reutilizar código após excluir um produto, use o `produto_id` como `produto_codigo`.
- `produto_descricao` do item é a descrição **da época da venda**; `descricao` do cadastro é a atual.
- Itens que não são mercadoria (taxa de entrega, taxa de serviço, embalagem cobrada) podem
  aparecer como item com `tipo = 'SERVICO'` no cadastro, ou ser somados em `valor_acrescimo` da
  venda. Documente a escolha.
- Kits/combos: exponha o item como vendido (o kit) e, se o sistema explodir componentes, não
  duplique o valor: ou o kit com valor e os componentes com valor zero, ou só os componentes.

### Múltiplas lojas

Quando uma mesma base atende várias lojas do mesmo lojista, exponha `loja_id` em vendas e
vendedores e garanta que `venda_id` seja único **entre lojas**. Cada loja pode ser conectada como
uma unidade separada no RecompraCRM, filtrando por `loja_id`, ou todas juntas; isso é decidido na
ativação, não na view. Bases multiempresa (vários CNPJs sem relação entre si) nunca compartilham
as mesmas views: cada empresa recebe um schema, um usuário ou um filtro fixo próprio.

---

## Padrões de consulta e desempenho

O RecompraCRM executa, em essência, estas consultas. As views e os índices das tabelas base devem
ser pensados para elas.

**Leitura contínua (a cada 5 minutos):**

```sql
-- 1. Vendas do dia corrente e qualquer venda alterada desde o último ciclo
SELECT * FROM recompra.vw_recompra_vendas
WHERE (data_venda >= :inicio_do_dia AND data_venda < :fim_do_dia)
   OR data_atualizacao >= :ultima_leitura;

-- 2. Itens e pagamentos das vendas retornadas acima
SELECT * FROM recompra.vw_recompra_venda_itens      WHERE venda_id IN (:ids);
SELECT * FROM recompra.vw_recompra_venda_pagamentos WHERE venda_id IN (:ids);

-- 3. Cadastros referenciados por essas vendas (ou alterados desde o último ciclo)
SELECT * FROM recompra.vw_recompra_clientes   WHERE cliente_id  IN (:ids) OR data_atualizacao >= :ultima_leitura;
SELECT * FROM recompra.vw_recompra_produtos   WHERE produto_id  IN (:ids) OR data_atualizacao >= :ultima_leitura;
SELECT * FROM recompra.vw_recompra_vendedores WHERE vendedor_id IN (:ids);

-- 4. Heartbeat
SELECT * FROM recompra.vw_recompra_metadados;
```

**Carga histórica (ao conectar, em blocos):**

```sql
SELECT * FROM recompra.vw_recompra_vendas
WHERE data_venda >= :inicio_bloco AND data_venda < :fim_bloco
ORDER BY data_venda, venda_id
LIMIT :tamanho_pagina OFFSET :deslocamento;
-- seguido das consultas 2 e 3 para cada página
```

Requisitos:

| Requisito | Alvo |
| --- | --- |
| Índices nas tabelas base | `data_venda`, `data_atualizacao`, `venda_id` (vendas); `venda_id` (itens, pagamentos); `data_atualizacao` (clientes, produtos). |
| Tempo da leitura contínua | < 10 s para um dia típico de vendas, incluindo itens. |
| Tempo de um bloco histórico | < 60 s para 31 dias. Se não for viável, informe o tamanho máximo de bloco suportado. |
| Limite por consulta | O RecompraCRM aplica `statement_timeout` de 60 s e pagina em até 1.000 vendas. |
| Views sem efeitos colaterais | Nenhuma view executa procedures, escreve em tabelas ou depende de tabelas temporárias de sessão. |
| Views determinísticas | A mesma consulta, sem mudanças na base, devolve as mesmas linhas. Evite `random()`, `now()` fora de `vw_recompra_metadados` e dependências de sessão (`SET` de idioma/fuso). |

Evite nas views: `DISTINCT` sobre junções largas, subconsultas correlacionadas por linha,
funções não indexáveis sobre as colunas de filtro (`DATE(data_venda)`, `CAST`) e junções com
tabelas de log. Se a tabela base guarda a data como texto ou em partes, materialize uma coluna
tipada (coluna gerada, trigger ou tabela auxiliar) em vez de converter dentro da view.

Bases com muito volume ou servidor compartilhado podem entregar as views sobre uma **réplica de
leitura**, desde que o atraso de replicação fique abaixo de 5 minutos e seja informado.

---

## Acesso, segurança e privacidade

- **Usuário dedicado** (ex.: `recompra_leitura`) com `SELECT` apenas no schema das views. Sem
  acesso a tabelas base, sem `CREATE`, sem `EXECUTE`. No PostgreSQL, `GRANT USAGE ON SCHEMA` +
  `GRANT SELECT ON ALL TABLES IN SCHEMA` e `ALTER DEFAULT PRIVILEGES` para views futuras.
- **Transporte cifrado** (TLS) obrigatório. Certificado válido ou CA fornecida pelo integrador.
- **Restrição de origem**: liberar o acesso apenas para os endereços IP de saída informados pela
  equipe RecompraCRM na ativação. Alternativas aceitas: túnel SSH com chave dedicada, VPN
  site-to-site ou agente de replicação combinado caso a caso.
- **SGBDs suportados diretamente**: PostgreSQL, MySQL/MariaDB e SQL Server. Firebird, Oracle,
  SQL Anywhere e bases de arquivo (Access, DBF) precisam de replicação para um dos três acima ou
  de alinhamento prévio com a equipe.
- **Credenciais**: entregues por canal seguro (não por e-mail aberto), rotacionáveis sem
  indisponibilidade (dois usuários válidos durante a troca). O RecompraCRM armazena as credenciais
  cifradas e as usa exclusivamente para este fim.
- **Dados pessoais (LGPD)**: as views expõem somente o necessário para o CRM (nome, contato,
  documento, endereço, histórico de compras). Não incluir senhas, dados bancários completos,
  dados de cartão ou dados de saúde. O RecompraCRM atua como operador em nome do lojista
  (controlador); o integrador permanece responsável pelo que coloca na view.
- **Dados de teste**: para homologação, uma base com dados fictícios ou anonimizados é bem-vinda,
  desde que estruturalmente idêntica à de produção.

---

## Entrega, homologação e mudanças

### O que o integrador entrega

1. **DDL das views** (`CREATE VIEW ...`) e dos índices de apoio.
2. **Dicionário de dados** cobrindo: o mapeamento `status_original → status_codigo`, os valores
   possíveis de `canal`, `tipo` de produto, `forma_pagamento_original`, e a regra usada para
   compor identificadores quando houve composição.
3. **Dados de acesso**: host, porta, banco, schema, usuário, modo TLS e método de restrição de
   origem.
4. **Amostra**: resultado de `SELECT * ... LIMIT 50` de cada view e o resultado das
   [consultas de validação](#apêndice-b--consultas-de-validação) rodadas sobre um mês real.
5. **Contato técnico** responsável pelas views e um canal para avisos de mudança.

### Critérios de homologação

A equipe RecompraCRM conecta na base, executa as consultas do contrato e confere:

- [ ] `vw_recompra_metadados` responde; `gerado_em` bate com o relógio real (tolerância 2 min) e
      `fuso_horario` está coerente com `data_venda` de vendas conhecidas.
- [ ] Colunas obrigatórias presentes com os tipos certos; nenhuma obrigatória com nulos.
- [ ] `venda_id` único; nenhum item órfão; nenhuma venda `CONCLUIDA` sem item.
- [ ] Totais fecham dentro da tolerância em ≥ 99,5% das vendas de um mês.
- [ ] Um cancelamento feito durante o teste aparece na view em até 5 minutos, com
      `status_codigo = 'CANCELADA'` e `data_atualizacao` avançada.
- [ ] Uma venda nova feita durante o teste aparece em até 5 minutos.
- [ ] Uma edição de item em venda existente reflete na view com `data_atualizacao` avançada.
- [ ] ≥ 90% das vendas com `cliente_id` ou `cliente_telefone` válido (≥ 10 dígitos) nos segmentos
      em que o lojista identifica o cliente. Abaixo disso, o CRM funciona mas com alcance reduzido;
      o lojista é avisado.
- [ ] Leitura contínua e bloco histórico dentro dos tempos-alvo.
- [ ] Carga histórica de ao menos 12 meses concluída sem erro.

### Mudanças no contrato

- **Compatíveis** (não exigem aviso prévio, mas peça para registrar): adicionar coluna; adicionar
  valor novo em campos livres documentados (`canal`, `tipo`) com atualização do dicionário;
  melhorar desempenho sem mudar resultado.
- **Incompatíveis** (exigem aviso com **15 dias** de antecedência e período de convivência):
  remover ou renomear coluna; mudar tipo; mudar o significado de uma coluna; mudar a regra de
  composição de um identificador; mudar o fuso horário; migrar de servidor/SGBD. Publique a nova
  versão como view com sufixo (`vw_recompra_vendas_v2`), atualize `contrato_versao` e mantenha a
  anterior até a confirmação de migração.
- **Nunca**: reutilizar `venda_id`/`cliente_id`/`produto_id` para registros diferentes; apagar
  vendas da view; alterar `data_venda` de vendas antigas em massa (uma reindexação de datas
  reprocessa o histórico inteiro do lojista).
- **Indisponibilidade planejada** (manutenção, migração) deve ser comunicada; a leitura contínua
  tolera falhas transitórias e retoma sozinha, mas janelas longas sem leitura atrasam campanhas.

---

## Mapeamento para o modelo canônico

Para a equipe RecompraCRM. O conector genérico de views preenche `TCanonicalConnectorBatch`
(`lib/data-connectors/types.ts`) a partir das colunas acima; as políticas do batch são
`saleItemRewritePolicy: "REPLACE_ON_EVERY_SYNC"` e `clientResolutionStrategy: "EXTERNAL_ID_THEN_PHONE"`,
as mesmas do conector ERP-FLEX, cuja estrutura (cliente → mappers → canonical) serve de modelo.

| View / coluna | Campo canônico | Observação |
| --- | --- | --- |
| `vendas.venda_id` | `sale.sourceSaleId`, `sale.key` | Vira `sales.idExterno`; colisão entre integrações é fail-closed. |
| `vendas.venda_numero` | `sale.displayId`, `sale.document` | `document` cai para `venda_id` quando nulo. |
| `vendas.data_venda` | `sale.occurredAt` | Interpretada no fuso de `metadados.fuso_horario`. |
| `vendas.data_atualizacao` | — | Só filtro de leitura (`OR data_atualizacao >= última leitura`). |
| `vendas.status_codigo` | `sale.isValidSale` (`CONCLUIDA`), `sale.isCanceled` (`CANCELADA`) | `PENDENTE` → ambos `false` → `statusVenda` nulo via `mapCanonicalSaleCommercialStatus`. |
| `vendas.status_original` | `sale.statusText` | |
| `vendas.valor_total` / `valor_desconto` / `valor_acrescimo` / `valor_custo` | `sale.totalValue` / `totalDiscount` / `totalSurcharge` / `totalCost` | `valor_custo` nulo → `totalCost` = soma de `itens.custo_total` ou `0`. |
| `vendas.cliente_*` + `clientes.*` | `sale.client` (`TCanonicalClient`) | `externalId = cliente_id`; `basePhone` por `formatPhoneAsBase`; `location` dos campos de endereço. |
| `vendas.vendedor_id` / `vendedor_nome` | `sale.seller`, `sale.sellerName` | `identifier = vendedor_id`. |
| `vendas.parceiro_id` + `parceiros.*` | `sale.partner`, `sale.partnerIdentifier` | |
| `vendas.canal` | `sale.channel` | |
| `vendas.modalidade_entrega` | `sale.deliveryMode` | Mesmo domínio de `TCanonicalDeliveryMode`. |
| `vendas.documento_fiscal_*`, `natureza_operacao` | `sale.model`, `series`, `nature` | `movement = "VENDA"`, `type = "VENDA"`. |
| `itens.*` | `sale.items[]` (`TCanonicalSaleItem`) | `productCode = produto_codigo`, `productExternalId = produto_id`; `variante_codigo` tenta `variantsByCode` antes. |
| `pagamentos.*` | `sale.payments[]` (`TCanonicalSalePayment`) | `forma_pagamento` já no domínio de `PaymentMethodEnum`; `pago_online` nulo → `false`. |
| `produtos.*` | `batch.products[]` (`TCanonicalProduct`) | `group` recebe `grupo`; `ncm` nulo → `"N/A"`. |
| `vendedores.*` | `batch.sellers[]` | |
| `parceiros.*` | `batch.partners[]` | |
| `metadados.*` | — | Validação na ativação e no diagnóstico (`ultimoErro` da integração). |

Colunas marcadas como opcionais e ainda sem campo canônico (`data_nascimento`, `aceita_marketing`,
`codigo_barras`, `preco_venda`) devem ser pedidas desde já: evitam uma segunda rodada com o
integrador quando o conector passar a consumi-las.

---

## Apêndice A — DDL de exemplo (PostgreSQL)

Exemplo ilustrativo sobre um sistema hipotético com tabelas `vendas`, `vendas_itens`, `clientes`,
`produtos` e `usuarios`. Adapte nomes, junções e regras de status ao seu modelo.

```sql
CREATE SCHEMA IF NOT EXISTS recompra;

CREATE OR REPLACE VIEW recompra.vw_recompra_metadados AS
SELECT
  '1.0'::text                                   AS contrato_versao,
  'MeuERP 7.3'::text                            AS sistema_nome,
  'America/Sao_Paulo'::text                     AS fuso_horario,
  (SELECT max(data_emissao)   FROM vendas)      AS ultima_venda_em,
  (SELECT max(atualizado_em)  FROM vendas)      AS ultima_atualizacao_em,
  now()                                         AS gerado_em;

CREATE OR REPLACE VIEW recompra.vw_recompra_vendas AS
SELECT
  v.filial_id::text || '-' || v.id::text        AS venda_id,
  v.numero_cupom::text                          AS venda_numero,
  v.filial_id::text                             AS loja_id,
  v.data_emissao                                AS data_venda,
  GREATEST(v.atualizado_em,
           COALESCE(v.cancelado_em, v.atualizado_em),
           COALESCE((SELECT max(i.atualizado_em) FROM vendas_itens i WHERE i.venda_id = v.id), v.atualizado_em)
  )                                             AS data_atualizacao,
  CASE
    WHEN v.situacao IN ('C', 'D')               THEN 'CANCELADA'
    WHEN v.situacao IN ('F', 'E')               THEN 'CONCLUIDA'
    ELSE                                             'PENDENTE'
  END                                           AS status_codigo,
  v.situacao::text                              AS status_original,
  v.cancelado_em                                AS data_cancelamento,
  v.valor_liquido                               AS valor_total,
  COALESCE(v.valor_desconto, 0)                 AS valor_desconto,
  COALESCE(v.valor_frete, 0) + COALESCE(v.valor_acrescimo, 0) AS valor_acrescimo,
  NULLIF(v.custo_total, 0)                      AS valor_custo,
  v.cliente_id::text                            AS cliente_id,
  COALESCE(c.nome, v.nome_consumidor)           AS cliente_nome,
  COALESCE(c.celular, c.telefone, v.telefone_consumidor) AS cliente_telefone,
  regexp_replace(COALESCE(c.cpf_cnpj, v.cpf_consumidor, ''), '\D', '', 'g') AS cliente_cpf_cnpj,
  v.vendedor_id::text                           AS vendedor_id,
  u.nome                                        AS vendedor_nome,
  NULL::text                                    AS parceiro_id,
  CASE v.origem WHEN 1 THEN 'LOJA' WHEN 2 THEN 'DELIVERY' WHEN 3 THEN 'SITE' ELSE 'OUTRO' END AS canal,
  CASE v.tipo_entrega WHEN 'B' THEN 'PRESENCIAL' WHEN 'R' THEN 'RETIRADA' WHEN 'E' THEN 'ENTREGA' END AS modalidade_entrega,
  v.observacao                                  AS observacoes,
  v.nfe_numero::text                            AS documento_fiscal_numero,
  v.nfe_serie::text                             AS documento_fiscal_serie,
  v.nfe_modelo::text                            AS documento_fiscal_modelo,
  v.nfe_chave                                   AS documento_fiscal_chave,
  v.cfop::text                                  AS natureza_operacao
FROM vendas v
LEFT JOIN clientes c ON c.id = v.cliente_id
LEFT JOIN usuarios u ON u.id = v.vendedor_id
WHERE v.tipo_operacao = 'VENDA';          -- exclui orçamentos, devoluções, transferências

CREATE OR REPLACE VIEW recompra.vw_recompra_venda_itens AS
SELECT
  i.id::text                                    AS item_id,
  v.filial_id::text || '-' || v.id::text        AS venda_id,
  i.sequencia                                   AS sequencia,
  i.produto_id::text                            AS produto_id,
  p.codigo                                      AS produto_codigo,
  COALESCE(i.descricao, p.descricao)            AS produto_descricao,
  i.grade_codigo                                AS variante_codigo,
  i.quantidade                                  AS quantidade,
  p.unidade                                     AS unidade,
  i.preco_unitario                              AS valor_unitario,
  i.quantidade * i.preco_unitario               AS valor_bruto,
  COALESCE(i.desconto, 0)                       AS valor_desconto,
  i.quantidade * i.preco_unitario - COALESCE(i.desconto, 0) AS valor_liquido,
  NULLIF(i.custo_unitario, 0)                   AS custo_unitario,
  NULLIF(i.custo_unitario, 0) * i.quantidade    AS custo_total,
  i.observacao                                  AS observacoes
FROM vendas_itens i
JOIN vendas v   ON v.id = i.venda_id AND v.tipo_operacao = 'VENDA'
JOIN produtos p ON p.id = i.produto_id;

CREATE OR REPLACE VIEW recompra.vw_recompra_clientes AS
SELECT
  c.id::text                                    AS cliente_id,
  c.nome                                        AS nome,
  c.fantasia                                    AS nome_fantasia,
  COALESCE(c.celular, c.telefone)               AS telefone,
  CASE WHEN c.celular IS NOT NULL THEN c.telefone END AS telefone_secundario,
  c.email                                       AS email,
  regexp_replace(COALESCE(c.cpf_cnpj, ''), '\D', '', 'g') AS cpf_cnpj,
  c.data_nascimento                             AS data_nascimento,
  regexp_replace(COALESCE(c.cep, ''), '\D', '', 'g') AS cep,
  c.uf                                          AS estado,
  c.cidade                                      AS cidade,
  c.bairro                                      AS bairro,
  c.endereco                                    AS logradouro,
  c.numero                                      AS numero,
  c.complemento                                 AS complemento,
  c.aceita_marketing                            AS aceita_marketing,
  NOT c.inativo                                 AS ativo,
  c.criado_em                                   AS data_cadastro,
  c.atualizado_em                               AS data_atualizacao
FROM clientes c;

CREATE OR REPLACE VIEW recompra.vw_recompra_produtos AS
SELECT
  p.id::text                                    AS produto_id,
  p.codigo                                      AS codigo,
  p.ean                                         AS codigo_barras,
  p.descricao                                   AS descricao,
  p.unidade                                     AS unidade,
  g.nome                                        AS grupo,
  p.marca                                       AS marca,
  regexp_replace(COALESCE(p.ncm, ''), '\D', '', 'g') AS ncm,
  CASE p.tipo WHEN 'S' THEN 'SERVICO' WHEN 'K' THEN 'KIT' ELSE 'PRODUTO' END AS tipo,
  p.preco_venda                                 AS preco_venda,
  NULLIF(p.custo, 0)                            AS custo,
  p.ativo                                       AS ativo,
  p.atualizado_em                               AS data_atualizacao
FROM produtos p
LEFT JOIN grupos g ON g.id = p.grupo_id;

CREATE OR REPLACE VIEW recompra.vw_recompra_vendedores AS
SELECT
  u.id::text                                    AS vendedor_id,
  u.nome                                        AS nome,
  u.filial_id::text                             AS loja_id,
  u.ativo                                       AS ativo,
  u.atualizado_em                               AS data_atualizacao
FROM usuarios u
WHERE u.perfil IN ('VENDEDOR', 'CAIXA');

-- Índices de apoio nas tabelas base
CREATE INDEX IF NOT EXISTS ix_vendas_data_emissao  ON vendas (data_emissao);
CREATE INDEX IF NOT EXISTS ix_vendas_atualizado_em ON vendas (atualizado_em);
CREATE INDEX IF NOT EXISTS ix_vendas_itens_venda   ON vendas_itens (venda_id);
CREATE INDEX IF NOT EXISTS ix_clientes_atualizado  ON clientes (atualizado_em);
CREATE INDEX IF NOT EXISTS ix_produtos_atualizado  ON produtos (atualizado_em);

-- Usuário somente leitura
CREATE ROLE recompra_leitura LOGIN PASSWORD '<senha-forte>';
GRANT CONNECT ON DATABASE meuerp TO recompra_leitura;
GRANT USAGE ON SCHEMA recompra TO recompra_leitura;
GRANT SELECT ON ALL TABLES IN SCHEMA recompra TO recompra_leitura;
ALTER DEFAULT PRIVILEGES IN SCHEMA recompra GRANT SELECT ON TABLES TO recompra_leitura;
ALTER ROLE recompra_leitura SET statement_timeout = '60s';
```

> Views em PostgreSQL executam com os privilégios de quem consulta por padrão; se as tabelas base
> não forem legíveis pelo usuário `recompra_leitura`, crie as views com
> `security_invoker = false` (padrão) e garanta que o **dono** da view tenha acesso às tabelas.
> Em SQL Server, use *ownership chaining*; em MySQL, `SQL SECURITY DEFINER`.

---

## Apêndice B — consultas de validação

Rode sobre um mês real antes de entregar. Todas devem retornar zero linhas (ou o indicador
descrito).

```sql
-- B1. venda_id duplicado
SELECT venda_id, count(*) FROM recompra.vw_recompra_vendas GROUP BY venda_id HAVING count(*) > 1;

-- B2. Colunas obrigatórias nulas
SELECT venda_id FROM recompra.vw_recompra_vendas
WHERE data_venda IS NULL OR data_atualizacao IS NULL OR status_codigo IS NULL
   OR valor_total IS NULL OR valor_desconto IS NULL OR valor_acrescimo IS NULL;

-- B3. status_codigo fora do domínio
SELECT DISTINCT status_codigo FROM recompra.vw_recompra_vendas
WHERE status_codigo NOT IN ('CONCLUIDA', 'CANCELADA', 'PENDENTE');

-- B4. Cancelada sem data de cancelamento / data_atualizacao anterior à venda
SELECT venda_id FROM recompra.vw_recompra_vendas
WHERE (status_codigo = 'CANCELADA' AND data_cancelamento IS NULL)
   OR data_atualizacao < data_venda;

-- B5. Itens órfãos
SELECT i.item_id FROM recompra.vw_recompra_venda_itens i
LEFT JOIN recompra.vw_recompra_vendas v ON v.venda_id = i.venda_id
WHERE v.venda_id IS NULL;

-- B6. Venda concluída sem item
SELECT v.venda_id FROM recompra.vw_recompra_vendas v
LEFT JOIN recompra.vw_recompra_venda_itens i ON i.venda_id = v.venda_id
WHERE v.status_codigo = 'CONCLUIDA' AND i.item_id IS NULL;

-- B7. Totais que não fecham (tolerância R$ 0,05)
SELECT v.venda_id, v.valor_total, s.soma_itens, v.valor_acrescimo
FROM recompra.vw_recompra_vendas v
JOIN (SELECT venda_id, sum(valor_liquido) AS soma_itens FROM recompra.vw_recompra_venda_itens GROUP BY venda_id) s
  ON s.venda_id = v.venda_id
WHERE v.status_codigo = 'CONCLUIDA'
  AND abs(v.valor_total - (s.soma_itens + v.valor_acrescimo)) > 0.05;

-- B8. Pagamentos que não fecham com o total (se a view existir)
SELECT v.venda_id, v.valor_total, p.soma_pagamentos
FROM recompra.vw_recompra_vendas v
JOIN (SELECT venda_id, sum(valor) AS soma_pagamentos FROM recompra.vw_recompra_venda_pagamentos GROUP BY venda_id) p
  ON p.venda_id = v.venda_id
WHERE v.status_codigo = 'CONCLUIDA' AND abs(v.valor_total - p.soma_pagamentos) > 0.05;

-- B9. Cobertura de identificação do cliente (indicador: quanto maior, melhor)
SELECT
  count(*)                                                                             AS vendas,
  count(*) FILTER (WHERE cliente_id IS NOT NULL)                                       AS com_cadastro,
  count(*) FILTER (WHERE length(regexp_replace(COALESCE(cliente_telefone, ''), '\D', '', 'g')) >= 10) AS com_telefone_valido
FROM recompra.vw_recompra_vendas
WHERE status_codigo = 'CONCLUIDA' AND data_venda >= now() - interval '30 days';

-- B10. Telefones de preenchimento
SELECT cliente_id, telefone FROM recompra.vw_recompra_clientes
WHERE regexp_replace(COALESCE(telefone, ''), '\D', '', 'g') ~ '^(\d)\1+$';

-- B11. Códigos de produto duplicados entre ativos
SELECT codigo, count(*) FROM recompra.vw_recompra_produtos WHERE ativo GROUP BY codigo HAVING count(*) > 1;

-- B12. Itens cujo produto não está no cadastro
SELECT DISTINCT i.produto_id FROM recompra.vw_recompra_venda_itens i
LEFT JOIN recompra.vw_recompra_produtos p ON p.produto_id = i.produto_id
WHERE p.produto_id IS NULL;

-- B13. Tempo da leitura contínua (deve ficar abaixo de 10 s)
EXPLAIN ANALYZE
SELECT * FROM recompra.vw_recompra_vendas
WHERE (data_venda >= current_date AND data_venda < current_date + 1)
   OR data_atualizacao >= now() - interval '10 minutes';
```
