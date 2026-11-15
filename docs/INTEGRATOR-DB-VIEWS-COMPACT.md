# Views de banco para o RecompraCRM — guia compacto

> Para integradores sem API que vão disponibilizar os dados do lojista por **views SQL somente
> leitura**. Este é o resumo; a especificação completa, com DDL de exemplo e consultas de validação,
> está em [`INTEGRATOR-DB-VIEWS.md`](./INTEGRATOR-DB-VIEWS.md).

## Como lemos os dados

O RecompraCRM só lê. A cada **5 minutos** busca as vendas do dia e qualquer venda alterada desde
a última leitura; ao conectar, carrega o **histórico** em blocos de datas (7 a 31 dias). A leitura
é idempotente: venda repetida sem mudança não gera efeito, venda alterada é atualizada, venda que
virou `CANCELADA` tem o cashback estornado.

Para isso funcionar, três coisas são inegociáveis:

1. **Identificadores imutáveis** (`venda_id`, `cliente_id`, `produto_id`), únicos em toda a base,
   nunca reutilizados. Se a numeração reinicia por loja ou ano, componha (`loja-ano-numero`).
2. **Cancelamento visível**: a venda cancelada continua na view com `status_codigo = 'CANCELADA'`.
   Linha que some é tratada como venda válida.
3. **`data_atualizacao` confiável**: avança sempre que status, valores, itens, pagamentos ou cliente
   da venda mudam. Sem ela não enxergamos cancelamentos de dias anteriores.

## Regras gerais

- Views em um schema dedicado (`recompra`), usuário com `SELECT` só nesse schema, TLS, acesso
  restrito aos IPs que informarmos. PostgreSQL, MySQL/MariaDB ou SQL Server.
- Linhas planas, uma por entidade. Sem JSON, listas concatenadas ou colunas calculadas por sessão.
- Dinheiro em `NUMERIC(14,2)`, quantidade em `NUMERIC(14,4)`, datas com fuso (ou hora local com o
  fuso declarado em `vw_recompra_metadados`). Nunca dinheiro ou data como texto.
- Telefone **sempre com DDD**; celular antes de fixo. Menos de 10 dígitos é descartado. Sem
  números de preenchimento (`00000000000`).
- Custo desconhecido é `NULL`, nunca `0`.
- Contrato versionado: adicionar coluna é livre; remover, renomear ou mudar tipo/significado exige
  nova view com sufixo (`_v2`) e aviso com 15 dias.

## Views e colunas obrigatórias

Colunas opcionais úteis entre parênteses. Tipos em notação PostgreSQL.

**`vw_recompra_metadados`** (1 linha): `contrato_versao`, `sistema_nome`, `fuso_horario` (IANA,
ex.: `America/Sao_Paulo`), `ultima_venda_em`, `ultima_atualizacao_em`, `gerado_em` (`now()`).

**`vw_recompra_vendas`** (1 linha por venda ao cliente final; fora: orçamentos, devoluções,
transferências, bonificações)

| Coluna | Tipo | Observação |
| --- | --- | --- |
| `venda_id` | `TEXT` | Único e imutável. |
| `venda_numero` | `TEXT` | Número legível (pode repetir). |
| `loja_id` | `TEXT` | Obrigatório em base com várias lojas. |
| `data_venda` | `TIMESTAMPTZ` | Momento da venda, não da sincronização. |
| `data_atualizacao` | `TIMESTAMPTZ` | Última alteração em qualquer dado da venda. |
| `status_codigo` | `TEXT` | `CONCLUIDA`, `CANCELADA` ou `PENDENTE`. |
| `status_original` | `TEXT` | Status do sistema de origem. |
| `data_cancelamento` | `TIMESTAMPTZ` | Quando `CANCELADA`. |
| `valor_total` | `NUMERIC(14,2)` | O que o cliente pagou, após descontos e acréscimos. |
| `valor_desconto`, `valor_acrescimo` | `NUMERIC(14,2)` | `0` quando não houver. |
| `valor_custo` | `NUMERIC(14,2)` | `NULL` se desconhecido. |
| `cliente_id`, `cliente_nome`, `cliente_telefone`, `cliente_cpf_cnpj` | `TEXT` | Dados **no momento da venda**; nulos em consumidor final. |
| `vendedor_id`, `vendedor_nome` | `TEXT` | |
| `canal` | `TEXT` | `LOJA`, `DELIVERY`, `SITE`, `WHATSAPP`, `MARKETPLACE`, ... (documentar). |
| `modalidade_entrega` | `TEXT` | `PRESENCIAL`, `RETIRADA`, `ENTREGA`, `COMANDA` ou nulo. |

(Opcionais: `parceiro_id`, `observacoes`, `documento_fiscal_numero/serie/modelo/chave`,
`natureza_operacao`.)

**`vw_recompra_venda_itens`** (1 linha por item; **sempre o conjunto completo e atual**, pois
substituímos os itens a cada leitura)

| Coluna | Tipo | Observação |
| --- | --- | --- |
| `item_id`, `venda_id` | `TEXT` | Todo item pertence a uma venda da view de vendas. |
| `produto_id`, `produto_codigo`, `produto_descricao` | `TEXT` | Código estável e único entre ativos; descrição da época da venda. |
| `quantidade` | `NUMERIC(14,4)` | Positiva. |
| `valor_unitario` | `NUMERIC(14,4)` | |
| `valor_bruto`, `valor_desconto`, `valor_liquido` | `NUMERIC(14,2)` | `liquido = bruto − desconto`; a soma dos líquidos (+ acréscimo da venda) fecha com `valor_total` em ±R$ 0,05. |
| `custo_unitario`, `custo_total` | `NUMERIC` | `NULL` se desconhecido. |

(Opcionais: `sequencia`, `variante_codigo`, `unidade`, `observacoes`.)

**`vw_recompra_venda_pagamentos`** (opcional, 1 linha por forma de pagamento): `pagamento_id`,
`venda_id`, `forma_pagamento` (`DINHEIRO`, `PIX`, `CARTAO_CREDITO`, `CARTAO_DEBITO`, `BOLETO`,
`TRANSFERENCIA`, `CASHBACK`, `VALE`, `FIADO_NOTA`, `OUTRO`), `forma_pagamento_original`, `valor`
(soma por venda = `valor_total`). Opcionais: `parcelas`, `pago_online`, `troco_para`.

**`vw_recompra_clientes`** (1 linha por cadastro): `cliente_id`, `nome`, `telefone`, `email`,
`cpf_cnpj` (só dígitos), `data_nascimento`, `ativo`, `data_cadastro`, `data_atualizacao`.
Opcionais: `nome_fantasia`, `telefone_secundario`, `inscricao_estadual`, `sexo`, endereço
(`cep`, `estado`, `cidade`, `bairro`, `logradouro`, `numero`, `complemento`), `aceita_marketing`.

**`vw_recompra_produtos`** (1 linha por produto ou variante): `produto_id`, `codigo`, `descricao`,
`unidade`, `grupo`, `tipo` (`PRODUTO`, `SERVICO`, `KIT`, `INSUMO`), `ativo`, `data_atualizacao`.
Opcionais: `codigo_barras`, `marca`, `ncm`, `produto_pai_id`, `variante_descricao`, `preco_venda`,
`custo`.

**`vw_recompra_vendedores`**: `vendedor_id`, `nome`, `ativo`, `data_atualizacao`. Opcional: `loja_id`.

**`vw_recompra_parceiros`** (opcional; indicadores/afiliados): `parceiro_id`, `nome`, `ativo`,
`data_atualizacao`. Opcionais: `codigo_afiliacao`, `cpf_cnpj`, `cliente_id`.

## Status da venda

| `status_codigo` | Quando | Efeito no CRM |
| --- | --- | --- |
| `CONCLUIDA` | paga, faturada ou entregue | registra compra, cashback e campanhas |
| `PENDENTE` | pedido aberto / pagamento não aprovado (opcional) | guarda sem efeito até virar `CONCLUIDA` |
| `CANCELADA` | cancelada, estornada ou devolvida integralmente | estorna cashback e métricas |

Devolução parcial: mantém `CONCLUIDA`, reduz valores e itens, avança `data_atualizacao`.

## O que consultamos

```sql
-- contínuo (a cada 5 min)
SELECT * FROM recompra.vw_recompra_vendas
WHERE (data_venda >= :inicio_do_dia AND data_venda < :fim_do_dia)
   OR data_atualizacao >= :ultima_leitura;
-- depois: itens, pagamentos, clientes, produtos e vendedores das vendas retornadas

-- histórico (blocos de datas, paginado)
SELECT * FROM recompra.vw_recompra_vendas
WHERE data_venda >= :inicio AND data_venda < :fim
ORDER BY data_venda, venda_id LIMIT 1000 OFFSET :n;
```

Índices nas tabelas base em `data_venda`, `data_atualizacao` e `venda_id` (vendas), `venda_id`
(itens, pagamentos) e `data_atualizacao` (clientes, produtos). Alvo: dia corrente em < 10 s,
bloco de 31 dias em < 60 s. Aplicamos `statement_timeout` de 60 s. Réplica de leitura é aceita com
atraso < 5 min.

## Entrega

1. DDL das views e dos índices.
2. Dicionário: mapeamento `status_original → status_codigo`, valores de `canal`, `tipo` e
   `forma_pagamento_original`, regra de composição de ids.
3. Acesso: host, porta, banco, schema, usuário, modo TLS, restrição de origem. Credenciais por
   canal seguro.
4. Amostra de 50 linhas por view e resultado das consultas de validação do
   [Apêndice B](./INTEGRATOR-DB-VIEWS.md#apêndice-b--consultas-de-validação) sobre um mês real.
5. Contato técnico responsável.

Homologamos conectando na base: metadados coerentes, ids únicos, sem itens órfãos, totais fechando
em ≥ 99,5% das vendas, venda nova e cancelamento de teste visíveis em até 5 minutos, histórico de
12 meses carregado sem erro.
