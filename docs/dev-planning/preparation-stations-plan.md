# Estações de preparo — roteamento de tickets de preparo por impressora

Demanda: organizações de alimentação precisam que o TICKET_PREPARO saia em impressoras diferentes
conforme o produto (bebidas no balcão, hambúrguer na cozinha). Pedido com itens das duas sai nas
duas, com **realce** nos itens daquela estação.

Leitura do estado atual (não alterar o espírito):

- Roteamento hoje é por `finalidade` com late binding no claim (`lib/desktop-agent/print-jobs.ts`,
  `docs/dev-planning/desktop-agent-printing-plan.md` §3). Mantido; ganha uma dimensão a mais.
- O ticket é um job só com todos os itens (`lib/desktop-agent/ticket-preparo-data.ts`,
  template `lib/desktop-agent/templates/ticket-preparo.ts`, mapeamento de itens compartilhado com o
  board em `lib/sales/preparation-tickets.ts`).
- `products.grupo` é texto livre, sem entidade. Serve como critério de regra, não como chave.
- O agent é burro (plano §2): split e realce acontecem no servidor.

## Primitivo: estação de preparo

Entidade da organização, independente de dispositivo. Impressora é infraestrutura (sincronizada do
SO, trocada); finalidade é tipo de documento, não destino. A estação sobrevive à troca de hardware e
é reutilizável pelo board de preparo (filtro por estação) numa fase futura.

## Modelo de dados (aditivo; org sem estação mantém o comportamento atual)

```
ampmais_preparation_stations
  id, organizacao_id (FK cascade), nome text, ordem integer, ativa boolean default true,
  padrao boolean default false,            -- recebe o que nenhuma regra capturou
  escopo_ticket varchar(30) default 'PEDIDO', -- "PEDIDO" | "ESTACAO" (varchar + z.enum, sem pgEnum)
  data_insercao, data_atualizacao

ampmais_preparation_station_rules
  id, organizacao_id (FK cascade), estacao_id (FK cascade),
  criterio varchar(30),                     -- "GRUPO" | "PRODUTO"  (fora do jsonb: filtra e indexa)
  valor jsonb,                              -- z.discriminatedUnion("criterio"): {criterio:"GRUPO", grupo} | {criterio:"PRODUTO", produtoId}
  data_insercao

ampmais_print_jobs      + estacao_preparo_id varchar(255) NULL (FK set null)
ampmais_agent_printers  + estacoes_preparo jsonb string[] NOT NULL default '[]'
```

Decisões fechadas com o usuário:

- `escopoTicket`: `"PEDIDO"` = ticket mostra o pedido inteiro, itens da estação em destaque, os
  demais em corpo menor sob "Também neste pedido". `"ESTACAO"` = só os itens da estação. O realce
  não é opção; é consequência do escopo PEDIDO.
- **O sujeito da regra é sempre o item.** Canal, modalidade, horário NÃO entram em `criterio`
  (pertencem à estação numa v2). Deixar isso em comentário no schema.
- Regras em jsonb com união discriminada, não predicado livre. Sem FK em `produtoId`: o serviço
  de exclusão de produto limpa regras PRODUTO na mesma transação; a UI filtra regras cujo produto
  sumiu; o resolver tolera.
- Sem unicidade no banco: a estação é salva por um único PUT com a lista inteira de regras; o
  serviço valida conflito (mesmo grupo/produto em duas estações da org) na transação.
- Precedência vive em constante no resolver: `PREPARATION_RULE_SPECIFICITY = ["PRODUTO", "GRUPO"]`.
  Nada de `prioridade` numérica na linha.
- Quando a org tem ≥1 estação ativa, exatamente uma deve ser `padrao` (validação no serviço).
- Adicionais não roteiam sozinhos: seguem o item pai.

## Resolver puro

`lib/sales/preparation-stations.ts`:

- `resolvePreparationStation({ item: { produtoId, grupo }, rules, stations })` → estação ou a padrão.
- `splitPreparationTicketByStation({ itens, rules, stations })` → `Array<{ estacao, itens: (item & { destaque: boolean })[] }>`,
  uma entrada por estação com ≥1 item; respeita `escopoTicket`. Org sem estação → `[]` (chamador
  mantém o caminho atual, ticket único sem estação).
- Testado com `node --test` (`lib/sales/preparation-stations.test.ts`), adicionado ao script
  `test:print-templates` do package.json.

## Pipeline de impressão

- Builders `buildTicketPreparoDadosFrom{Sale,TabOrder}` passam a devolver `Array<{ estacaoId: string | null, dados }>`.
  Sem estação: um elemento com `estacaoId: null` e dados idênticos aos de hoje.
- `TTicketPreparoDados` ganha `estacao: { id, nome } | null` e cada item ganha `destaque: boolean`
  (default true para compatibilidade com jobs antigos). Template realça `destaque` e agrupa os
  não-destaque sob "Também neste pedido". Testes do template atualizados.
- Chave de idempotência: `TICKET_PREPARO:VENDA:{saleId}:{estacaoId}` quando há estação; a chave
  atual quando não há. Mesmo para `PEDIDO_CONTA`.
- `enqueuePrintJob` aceita `estacaoPreparoId`; grava em `print_jobs.estacao_preparo_id`.
- Guarda anti-lixo por estação: `organizationHasActivePrinterForFinalidade` ganha variante por
  estação (impressora ativa com `TICKET_PREPARO` em `finalidades` E `estacaoId` em
  `estacoesPreparo`). Estação sem impressora não gera job (razão `SEM_IMPRESSORA_ESTACAO`).
- Claim: job com `estacaoPreparoId` casa só com impressora cuja `estacoesPreparo` contém a estação.
  Job sem estação casa com qualquer impressora com a finalidade. `estacoesPreparo` vazio atende SÓ
  jobs sem estação (mesmo contrato "vazio = nada" de `finalidades`).
- Rota de gestão (`app/api/desktop-agent/print-jobs/management/route.ts`) usa os mesmos builders:
  reimpressão manual sai por estação, idêntica à automática. Override `impressoraId` continua valendo.

## API, queries, mutations

- `GET/POST/PUT/DELETE /api/preparation-stations` (App Router, `appApiHandler`, padrão do CLAUDE.md).
  PUT recebe `{ station, rules }` com a lista inteira de regras (soft-delete não é necessário aqui:
  substituição completa dentro da transação).
- `app/api/desktop-agent/printers/route.ts` aceita `estacoesPreparo` no update (valida ids da org).
- `lib/queries/preparation-stations.ts`, `lib/mutations/preparation-stations.ts`.
- Exclusão de produto limpa regras PRODUTO da org.

## UI (fase 1)

- `components/Settings/SettingsDevices.tsx` ganha seção "Estações de preparo" abaixo do auto-print
  (`SettingsPreparationStations.tsx`): lista, criar, editar, excluir; marcar padrão; escopo do
  ticket; multi-select de grupos alimentado pelo DISTINCT de grupos já existente em
  `lib/queries/products.ts`; busca de produtos para regra PRODUTO. Aviso quando uma estação ativa
  não tem impressora que a atenda.
- `components/Modals/Internal/Access/Blocks/AgentPrinterCard.tsx`: ao marcar `TICKET_PREPARO`,
  chips das estações da org.

## Migração

`drizzle/0129_preparation_stations.sql`, idempotente, puramente aditiva, com cabeçalho igual ao
de `0128_service_cards.sql`. **NÃO aplicar no banco**: o usuário aplica manualmente via
`npx tsx ./scripts/apply-sql-migration.ts`.

## Fases futuras (fora deste trabalho)

Override por produto no modal de produto; filtro por estação no board de preparo; tempos por
estação; estação por loja quando loja virar entidade.
