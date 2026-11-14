# Produções v2 — plano de implementação

Fonte: designs "Produções e Receitas v2" e "Produção Tablet v2" (Claude Design, 2026-11-14).

## Navegação

`Produções` vira grupo no sidebar, com quatro sub-itens. As abas da página antiga somem.

| Sub-item      | Rota                                   | Substitui                     |
| ------------- | -------------------------------------- | ----------------------------- |
| Nova produção | `/dashboard/production/new[?recipeId]` | modal `NewProduction`         |
| Histórico     | `/dashboard/production`                | aba "produções"               |
| —             | `/dashboard/production/[productionId]` | modal `ControlProduction`     |
| Receitas      | `/dashboard/production/recipes`        | aba "receitas"                |
| Estatísticas  | `/dashboard/production/stats`          | —                             |

O detalhe pertence ao Histórico no sidebar (`activeExclude` no item). Todas as páginas passam por
`app/dashboard/production/_lib/require-production-access.tsx`.

## Decisões

1. **Capa da receita**: `imagemCapaUrl` (foto) desde o início, mais `capaIcone` + `capaCor` (matiz
   0–359) como capa desenhada quando não há foto. Receitas antigas caem num ícone padrão e numa matiz
   derivada do id (`lib/productions/recipe-cover.ts`). Componente: `_components/recipe-cover.tsx`.
2. **Conferido = `quantidadeReal` preenchida.** Não existe flag nem timestamp de conferência. O
   construtor grava só `quantidadePrevista`; a pesagem grava `quantidadeReal`; "Redefinir" volta a nulo.
3. **Saídas sempre exigem conferência.** Concluir falha se alguma saída não foi pesada. Insumos não
   conferidos são baixados pela quantidade prevista, e ela é gravada como real.
4. **Reincorporar saldo**: linha de insumo com `reincorporado = true` e, opcionalmente, `loteId`. A
   conclusão baixa primeiro o lote escolhido (`consumeStockLotById`), depois FEFO, depois saldo geral.
5. **Receitas com várias saídas**: tudo escala pelo mesmo fator; "quanto produzir" é na unidade da
   saída principal (a primeira, por id); só a saída principal pode ser reincorporada.
   Matemática pura e testada em `lib/productions/builder-math.ts`.
6. **Volume nas estatísticas nunca soma unidades diferentes**: `volumes` por unidade; o painel mostra a
   unidade principal (a de mais produções no período).
7. **Rascunhos (RASCUNHO)** abrem o detalhe e se comportam como planejadas (iniciar). O construtor só
   cria PLANEJADA ou EM_PRODUCAO.
8. **Produção manual** no construtor: a etapa 2 usa o bloco de itens livres (`ProductionItems`).
9. **Planejada**: `dataInicio` guarda o início previsto; iniciar sobrescreve com o real e desloca a
   previsão de conclusão mantendo a duração.

## Banco (`npm run db:push`)

- `production_recipes`: `imagem_capa_url`, `capa_icone`, `capa_cor`.
- `production_inputs`: `reincorporado` (default false), `lote_id` (→ `product_stock_lots`, set null).

## API

| Rota                                  | Mudança                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/productions`                | filtros `recipeIds`, `compositions` (RECEITA/MANUAL/SALDO_REINCORPORADO), busca por receita e autor, `orderBy`/`orderByDirection`, `pageSize`; byId traz lote das entradas e lotes gerados |
| `POST/PUT /api/productions`           | valida `loteId` das entradas; criada EM_PRODUCAO começa a contar agora                          |
| `POST /api/productions/start`         | novo — RASCUNHO/PLANEJADA → EM_PRODUCAO                                                         |
| `PATCH /api/productions/items`        | novo — pesagem de um item (`quantidadeReal` ou `null`)                                          |
| `POST /api/productions/complete`      | saídas obrigatórias; insumos caem no previsto; lote escolhido primeiro                          |
| `GET /api/productions/recipes`        | capa, nº de produções, última produção, saldo em lotes, ordenação; byId traz `saldo` (lotes + saldo geral) |
| `GET /api/productions/stats`          | novo — resumo e comparação, série, faixas de rendimento, ranking com posição anterior, insumos  |

Cancelar continua sendo `DELETE /api/productions` (marca CANCELADA).
