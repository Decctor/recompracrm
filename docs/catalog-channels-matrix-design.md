# Matriz de Canais — Cardápio centralizado em Produtos

> Design doc — **PLANEJADO** (2026-09-27). Nenhuma fase implementada ainda.
> Documentos irmãos: `docs/product-sales-channels-design.md` (a primitiva `sales_channels` +
> `product_channel_settings`, fases 1–4 implementadas) e `docs/ifood-catalog-linking-sync-design.md`
> (`catalog_links`, publish/import/push/reconcile — backend implementado, **UI nunca construída**).
>
> Decisões tomadas com o produto antes deste doc (ver §8): aba dentro de Produtos; variantes sempre
> expandidas; ordem de grupos continua por canal; "Publicar como novo" no iFood entra junto do vínculo;
> adicionais editados por diálogo a partir da grade.

---

## 1. Problema

A pergunta "onde este produto aparece e por quanto?" já tem UMA resposta no modelo (`sales_channels` ×
`product_channel_settings`, resolvida por `lib/products/sales-channels.ts`), mas TRÊS telas escrevem nela
com escopos diferentes e nenhuma cobre o todo:

| Tela | Escopo | Escrita | O que não faz |
|---|---|---|---|
| Página do produto › "Preços e canais" (`PricesAndChannelsSection`) | 1 produto × todos os canais, nós de produto e variante | patch esparso `PUT /api/products/channel-settings` + push iFood | é o ÚNICO lugar que edita preço/disponibilidade do canal iFood; um produto por vez |
| Loja digital › "Vitrine" (`ShopShowcaseSection`) | 1 canal (SHOP) × todos os produtos, só nível produto | bulk `PUT /api/sales-channels/showcase` (modo + ordem de grupos + lista) | variantes são beco sem saída ("Por variante"); iFood excluído por desenho; POS/COMANDA nunca ganharam tela apesar de a rota aceitar |
| Integrações › iFood › Catálogo (`catalog-page.tsx`) | catálogo REMOTO da loja | edita o iFood direto | **não sabe que `catalog_links` existe**: nada em `app/`, `components/`, `lib/queries/` ou `lib/mutations/` importa as rotas de `sync/*` |

Consequências práticas hoje:

- Para deixar um produto indisponível no iFood e no PDV ao mesmo tempo, o usuário abre o produto, edita a
  matriz, salva, e repete para cada produto. Não existe visão de cardápio por canal.
- Vincular um produto interno a um item do iFood é impossível pela UI. `POST /api/integrations/ifood/sync/links`,
  `suggestions`, `publish`, `import` e `reconcile` estão prontos e sem chamador.
- A matriz da página do produto rotula todo merchant iFood como "iFood" (`SALES_CHANNEL_LABELS[canal]`),
  sem `refExterno`: uma org com duas lojas não distingue as colunas.

Três defeitos latentes do backend de vínculos aparecem no minuto em que ele ganhar UI (todos verificados
no código):

1. **Dupla atribuição** é garantida só pelo índice parcial `unq_catalog_links_externo_item`, que existe
   apenas em `drizzle/0083_catalog_links.sql` (não no schema Drizzle). Uma violação chega ao cliente como
   500 "Oops, algo deu errado!" (`lib/app-api.ts` não traduz 23505). E `unlinkCatalogLink` é soft
   (`status: DESVINCULADO`) mantendo `externoItemId`, então um item desvinculado **nunca mais** pode ser
   vinculado a outro produto — o índice continua bloqueando.
2. **O cron de reconciliação não está registrado** em `vercel.json` (`app/api/cron/ifood-catalog-reconciliation`
   existe, nunca dispara). Badges de status nunca se atualizam sozinhos.
3. As rotas `sync/*` usam `requireERPSession` mas não passam por `canViewIntegrations`/`canManageIntegrations`,
   ao contrário das rotas `catalog/*`.

### Princípios

1. **Uma tela, uma primitiva.** A matriz é uma UI sobre `product_channel_settings`; não nasce nenhum modelo
   novo. Toda regra de resolução continua em `lib/products/sales-channels.ts`.
2. **A matriz subsume a vitrine.** "Tirar da vitrine" em modo TODOS é exatamente "disponível = não"; "listar"
   em SELECIONADOS é "disponível = sim". O helper `resolveShowcaseChannelRows` não é necessário no caminho novo.
3. **Rascunho único, um apply.** Mesmo padrão de `SectionApplyBar` + `useDirtyFlag` das seções do produto e da
   vitrine. A matriz grava UMA mutation; o que precisa de outra mutation (adicionais, vínculo iFood) vive em
   diálogo com save próprio.
4. **iFood não é especial na grade.** Uma coluna-grupo por merchant, com as mesmas células de disponibilidade e
   preço (que gravam no canal IFOOD daquele merchant), mais o estado do vínculo. O push acontece por
   `schedulePushForProduct`, como já acontece na página do produto.

---

## 2. Onde fica

Quarta aba de `/dashboard/catalog/products` (`products-page.tsx`), no mesmo `useQueryState("view")`:
`stats | database | add-ons | channels`. Rótulo **"Canais"**, ícone `Store`/`LayoutGrid`.

- A seção "Vitrine" em Loja digital › Produtos vira um card com link para `?view=channels&channel=SHOP`
  (o modo CARDÁPIO/CATÁLOGO da loja e `destaqueIds` continuam lá — são apresentação, não disponibilidade).
- A seção "Preços e canais" da página do produto **permanece**: é a visão profunda de um produto, bate na
  mesma API. Ganha só a correção de rótulo por merchant.
- A aba Catálogo do iFood permanece como editor do catálogo remoto. Ganha badge "Vinculado a X" por item
  (fase 2), lendo `GET /sync/links?merchantId`.

---

## 3. A grade

### 3.1 Linhas

- Agrupadas por `products.grupo`, com o balde `UNGROUPED_PRODUCTS_LABEL` ("Outros") por último. Reusa
  `groupShowcaseProducts` + `sortGroupsByChannelOrder`.
- **Todo produto `ativo && vendavel` é uma linha.** Não existe "adicionar à vitrine": a presença é uma célula.
- Produto com variantes ativas: a linha do produto carrega só disponibilidade (nível produto); cada variante é
  uma sub-linha **sempre expandida** com preço e disponibilidade próprios. Regra da primitiva: preço é
  node-scoped, e preço nível-produto com variantes é rejeitado em `validateChannelSettingNodes` — a célula
  de preço da linha-pai fica desabilitada quando há variantes.
- Busca por nome/código e filtro por grupo, client-side (a vitrine já carrega o catálogo inteiro; este
  domínio tem centenas de produtos, não dezenas de milhares — ver risco R3).

### 3.2 Colunas

Fixas: **Produto** (thumb, nome, código; na sub-linha, nome da variante) e **Preço base** (somente leitura;
`precoVenda` do nó).

Uma **coluna-grupo por canal**, na ordem POS, SHOP, COMANDA, depois um grupo por merchant iFood (rótulo =
nome do merchant, obtido de `useIfoodMerchants`; fallback "iFood · {refExterno}"):

| Célula | Componente | Semântica |
|---|---|---|
| Disponível | `AvailabilityCycleButton` (`components/SalesChannels/ProductChannelControls.tsx`) | herda → sim → não → herda; o hint de "herda" mostra o efeito do `catalogoModo` |
| Preço no canal | `ChannelPriceInput` (mesmo arquivo) dentro de `EditableNumberCell` (`components/Spreadsheet/`) | vazio = herda; placeholder = preço efetivo; destaque azul + reset quando há override (igual `ShowcasePriceCell`) |
| Status | badge | SHOP: "Na loja" / "Sem preço" / "Sem estoque" (`resolveChannelAvailability` com os gates do SHOP). iFood: badge do vínculo (— / PENDENTE / SINCRONIZADO / DIVERGENTE / ERRO) com `divergencias` no tooltip |

**Chips de canal** acima da grade mostram/ocultam coluna-grupos (persistido em `localStorage`; o chip do canal
em `?channel=` nasce ligado). Com 3 internos + N merchants a grade passa de 10 colunas; o chip é o que mantém
o caso comum (focar um canal) tão simples quanto a vitrine de hoje.

Navegação por teclado: `SPREADSHEET_TABLE_ATTR` + `SpreadsheetGridBounds` (`lib/spreadsheet-navigation`),
como `ShowcaseProductTable`, com uma coluna editável por canal visível.

Abaixo de `lg`: o card por produto com `MobileEditableField`, mesma degradação da vitrine — um canal por vez
(o chip vira select).

### 3.3 Cabeçalho do canal

Cada coluna-grupo tem um menu (ícone de engrenagem):

- **Modo do catálogo** (todos / selecionados) — `PUT /api/sales-channels` (já existe; faz parte do apply, não
  grava na hora, para o rascunho ser consistente com as células).
- **Ordenar grupos** — diálogo com a lista de grupos e setas, gravando `ordemGrupos` do canal. Continua POR
  CANAL (decisão): só o SHOP consome hoje (`getShopCatalogData`), mas o modelo já é por canal e um PDV que
  ordenar categorias amanhã não precisa de migração. A grade em si ordena os grupos pela ordem do canal
  **focado** (`?channel=`), alfabético quando não há.
- iFood: **Reconciliar agora** (`POST /sync/reconcile`) e contadores por status do merchant.

`exigirAdicionaisMinimos` fica onde está (Configurações › Canais de venda): é regra de operação, não de
cardápio.

### 3.4 Célula de adicionais (fase 3)

Coluna fixa **Adicionais** com chip de contagem ("3 grupos"; nomes no tooltip). Clique abre diálogo
(`ResponsiveMenu`) que monta `ProductStateAddOnsBlock` embutido + `useProductAddOnsSectionEditor` do próprio
produto — o mesmo bloco da página do produto, com **save próprio** (`PUT /api/products`). Não entra no
rascunho da matriz: adicionais não são por canal (D3 do doc de canais adiou `precoDelta` por canal), e misturar
duas mutations num apply bar cria estados parciais impossíveis de explicar. O `onSettled` do diálogo invalida
`["product-by-id", id]` e a query da matriz; o rascunho da matriz não re-hidrata se estiver sujo
(`useDirtyFlag` já protege).

Vínculo de adicionais ao iFood (`ADD_ON`/`ADD_ON_OPCAO`) **fica fora**: esses tipos não têm caminho de
criação em `POST /sync/links` nem validação em `assertNodeIsLinkable`.

---

## 4. Vínculo iFood a partir da grade (fase 2)

Na coluna-grupo do merchant, o menu da linha (produto sem variantes, ou cada sub-linha de variante — D2 do doc
de iFood: um item por variante) oferece:

- **Vincular a item existente** → diálogo que lista os itens do catálogo do merchant (`useIfoodCategories`),
  pré-ordenados por `GET /sync/suggestions?merchantId&catalogId` (FORTE por código, FRACA por nome), com os
  itens já vinculados ocultos e o candidato sugerido pré-selecionado. Confirmar chama `POST /sync/links`
  com `tipo: PRODUTO | VARIANTE`, `externoItemId`, `externoProdutoId`, `externoCategoriaId`.
- **Publicar como novo** → diálogo com seletor de categoria (`useIfoodCategories`) e prévia via
  `POST /sync/publish { simular: true }` (mostra nome, preço resolvido e disponibilidade de cada nó que seria
  criado); confirmar repete sem `simular`. Um produto com variantes publica N itens de uma vez — o diálogo diz
  isso antes.
- Linha vinculada: **Desvincular** (`DELETE /sync/links?linkId`), **Ver divergências** (painel com
  `divergencias` e as ações `APLICAR_NOSSO` / `ADOTAR_IFOOD` de `PATCH /sync/reconcile`) e a política por campo
  (`PATCH /sync/links`).

As células de disponibilidade e preço do grupo iFood gravam `product_channel_settings` no canal
`IFOOD/refExterno=merchantId` — exatamente o que `resolvePublishNodes` lê e empurra. Sem vínculo, a célula
grava igual (estado desejado) e o status mostra "sem vínculo": o mesmo aviso que o doc de canais pediu (§10).

### 4.1 Correções de backend que entram junto

| Defeito | Correção |
|---|---|
| Violação de `unq_catalog_links_externo_item` vira 500 | `upsertCatalogLink` consulta antes e lança `409 Conflict` "Este item do iFood já está vinculado a {produto}". A dupla checagem (pré-check + índice) é intencional: o índice fecha a corrida, o pré-check dá a mensagem. |
| Linha `DESVINCULADO` segura o `externoItemId` | Índice parcial passa a `WHERE externo_item_id IS NOT NULL AND status <> 'DESVINCULADO'` (migração `drizzle/00XX_catalog_links_externo_item_active.sql`, aplicada por `scripts/apply-sql-migration.ts`). A linha mantém o id para "revincular"; só deixa de competir. O `onConflictDoUpdate` de identidade continua revivendo a linha. |
| Índice parcial só no SQL | Comentário no schema Drizzle ao lado de `identityUnique` (mesmo padrão do aviso NULLS NOT DISTINCT já presente) — este drizzle-orm não expressa predicado de índice. |
| Cron não agendado | Entrada em `vercel.json` `crons` para `/api/cron/ifood-catalog-reconciliation` (diário, madrugada). |
| Permissões | Rotas `sync/*`: GET passa por `canViewIntegrations`, escritas por `canManageIntegrations`; publish/import também exigem permissão de produtos (como o doc de iFood já previa). |

---

## 5. API

Padrão de 4 partes, `appApiHandler`, `requireERPSession` (a matriz é recurso ERP como a matriz do produto).

### 5.1 `GET /api/sales-channels/matrix`

Uma leitura, tudo que a grade precisa:

```ts
{
  data: {
    channels: Array<TSalesChannelEntity & { rotulo: string }>,   // internos + iFood por merchant (ensureSalesChannels)
    products: Array<{
      id, nome, codigo, grupo, imagemCapaUrl, precoVenda,
      rastreamentoEstoqueAtivo, quantidade,                       // gates do SHOP
      variantes: Array<{ id, nome, codigo, precoVenda, ativo, rastreamentoEstoqueAtivo, quantidade }>,
      adicionais: Array<{ id, nome }>,                            // só nome/contagem para o chip (fase 3)
    }>,
    settings: TProductChannelSettingEntity[],                     // linhas esparsas de TODOS os canais
    links: Array<Pick<TCatalogLinkEntity, "id"|"merchantId"|"tipo"|"produtoId"|"produtoVarianteId"|"externoItemId"|"status"|"divergencias"|"sincronizar"|"ultimoErro">>,
  },
  message
}
```

- Sem paginação (R3). Sem os gates de preço/estoque no filtro, pelo mesmo motivo da vitrine: a grade mostra
  o produto sem preço com o badge "Sem preço", em vez de escondê-lo.
- Variantes incluem as inativas com `ativo: false`? **Não** — só ativas viram sub-linha, como a página do produto
  (`useProductPricingSectionEditor` só trata variantes ativas). `temVariantesAtivas` deriva no cliente.
- O rótulo do merchant vem do `merchant-types` já carregado em `resolveIfoodManagementContext`; se a integração
  estiver desconectada, o canal continua listado (override invisível é pior) com rótulo de fallback.

### 5.2 `PUT /api/sales-channels/matrix`

```ts
{
  channels: Array<{ canalVendaId: string; catalogoModo?: TSalesChannelCatalogModeEnum; ordemGrupos?: string[] }>,
  products: Array<{ produtoId: string; settings: TChannelSettingNode[] }>,   // patch esparso por produto
}
```

- Reusa `validateChannelSettingNodes` + `splitChannelSettingNodes` **por produto**, dentro de UMA transação —
  a mesma regra do PUT unitário e do POST de produto, para que a grade recuse o mesmo payload pelo mesmo motivo.
- O rascunho envia só os nós que mudaram (diff contra o snapshot carregado), não a matriz inteira: com 300
  produtos × 5 canais o payload inteiro é inútil e o patch esparso já é a semântica da rota unitária.
- Após o commit: `schedulePushForProduct` **só** para os produtos cujos nós de canal IFOOD mudaram. Push por
  produto abre `resolveIfoodManagementContext` por merchant; disparar para 300 produtos por causa de uma edição
  no PDV é desperdício e ruído de status.
- Responde `{ data: { updated: number }, message }`. Invalida no cliente: `["sales-channel-matrix"]`,
  `["sales-channels"]`, `["sales-channel-showcase", *]`, `["product-channel-settings", *]`.

### 5.3 O que NÃO muda

- `PUT /api/products/channel-settings` e `PUT /api/sales-channels/showcase` continuam existindo (página do
  produto; compatibilidade até a vitrine virar link). Nenhuma mudança de schema além do predicado do índice.

---

## 6. Arquitetura de código

```
app/api/sales-channels/matrix/route.ts                 GET / PUT (§5)
lib/products/sales-channels-matrix.ts                  puro: diff do rascunho → patches esparsos; agrupamento por canal
lib/products/sales-channels-matrix.test.ts
lib/queries/sales-channels.ts                          + useSalesChannelMatrix()  (key ["sales-channel-matrix"])
lib/mutations/sales-channels.ts                        + updateSalesChannelMatrix()
lib/queries/catalog-links.ts                           NOVO: useCatalogLinks, useCatalogLinkSuggestions   (não existem hoje)
lib/mutations/catalog-links.ts                         NOVO: createCatalogLink, updateCatalogLinkPolicy, deleteCatalogLink,
                                                             publishProductToIfood, reconcileMerchant, resolveDivergence
state-hooks/use-sales-channel-matrix-state.tsx         rascunho: choices/prices por nodeKey (reusa productChannelNodeKey),
                                                       channels (modo/ordem), dirty, redefine/reset
app/dashboard/catalog/products/_components/channels/
├── ProductsChannelsView.tsx                           aba: chips de canal, busca, grupos, apply bar
├── ChannelMatrixGroupPanel.tsx                        cabeçalho do grupo (badge de posição, contagem)
├── ChannelMatrixTable.tsx                             grid CSS + navegação de planilha; linhas de produto e variante
├── ChannelMatrixCells.tsx                             célula de disponibilidade, preço, status (SHOP/iFood)
├── ChannelHeaderMenu.tsx                              modo, ordenar grupos, reconciliar
├── ReorderChannelGroups.tsx                           diálogo de ordem (ResponsiveMenu)
├── LinkIfoodItem.tsx                                  fase 2: vincular a item existente
├── PublishIfoodProduct.tsx                            fase 2: publicar como novo (simular → confirmar)
├── IfoodLinkDivergences.tsx                           fase 2: painel de divergências
└── ProductAddOnsDialog.tsx                            fase 3: adicionais do produto (reusa ProductStateAddOnsBlock)
components/SalesChannels/SalesChannelMark.tsx          rótulo por merchant (refExterno → nome) — corrige a página do produto também
```

Convenções que se aplicam: hooks expõem `queryKey`; mutations são wrappers Axios; tipos de cliente importam de
`@/app/api/**/route`; nomes de código em inglês, campos de entidade em português (`disponivel`, `precoVenda`,
`ordemGrupos`), envelope de API em inglês (`channels`, `products`, `settings`, `links`).

---

## 7. Fases

1. **Matriz de canais internos.** Rota GET/PUT, helper puro + testes, hook/mutation, state hook, aba
   "Canais" com grade agrupada, variantes expandidas, chips de canal, disponibilidade e preço editáveis,
   cabeçalho com modo e ordem de grupos, apply bar. Rótulo por merchant em `SalesChannelMark`. A vitrine em
   Loja digital vira link. iFood aparece na grade **somente leitura** com badge "sem vínculo" (o estado
   desejado já grava, o push já existe — mas sem a fase 2 o usuário não tem como criar vínculo).
2. **iFood.** Correções de backend (§4.1) primeiro. Depois queries/mutations de `catalog-links`, células iFood
   editáveis, badge de status, Vincular a existente, Publicar como novo, Desvincular, painel de divergências,
   Reconciliar agora. Badge "Vinculado" na aba Catálogo do iFood.
3. **Adicionais.** Coluna de contagem + diálogo com o bloco de adicionais e save próprio.
4. **Aposentadoria.** Remover `ShopShowcaseSection`/`ShowcaseProductTable`/`ShowcaseDraftRow` e
   `use-sales-channel-showcase-state`; `PUT /api/sales-channels/showcase` sai quando nenhum cliente restar.

Cada fase é um PR; a 1 já entrega a centralização para POS/SHOP/COMANDA.

---

## 8. Decisões

### Tomadas (com o produto, 2026-09-27)

- **Aba dentro de Produtos**, não item de sidebar: cardápio é uma visão do cadastro, e a aba "Adicionais"
  (grupos compartilhados) já mora lá.
- **Variantes sempre expandidas.** Preço é por variante; esconder a sub-linha esconderia a única célula
  editável de preço e recriaria o "Por variante" da vitrine.
- **Ordem de grupos por canal**, como o modelo já é. Um global exigiria migrar `ordemGrupos` e decidir o que
  fazer quando o SHOP e o PDV divergem — sem demanda.
- **Publicar como novo entra na fase 2**, junto do vínculo. O publish já existe com `simular`; o custo é um
  diálogo.
- **Adicionais em diálogo a partir da grade**, com save próprio (não no rascunho da matriz).

### Em aberto

- **D1 — Chip "Adicionais" para variantes.** Referências por variante existem no modelo mas o fluxo de
  variante ainda edita min/max do grupo direto (`upsertScopedProductAddOn`). O diálogo da fase 3 mostra só
  as referências nível produto até isso ser unificado.
- **D2 — Reconciliação ao abrir a aba.** Disparar `reconcile` do merchant ao montar a grade dá status fresco,
  mas custa leitura do catálogo remoto inteiro a cada abertura. Proposta: não; botão manual + cron diário, e um
  aviso "última verificação há X h" no cabeçalho.
- **D3 — Ajuste em lote** ("+10% em tudo neste canal", "indisponibilizar o grupo Sobremesas no iFood").
  Cabe como ação no cabeçalho do grupo/canal operando no rascunho; fica para depois da fase 1, quando houver
  uso real.

---

## 9. Riscos

- **R1 — Largura.** 2 fixas + 1 adicionais + 3×(2..3) + N×3 colunas. Mitigação: chips de canal com um canal
  ligado por padrão (`?channel=`), colunas fixas com `sticky`, e o card mobile abaixo de `lg`.
- **R2 — Apply parcial.** Uma transação para `product_channel_settings` e `sales_channels`; o push iFood é
  best-effort fora da transação, como hoje. O rascunho só limpa `dirty` no sucesso.
- **R3 — Catálogo grande.** Sem paginação na v1 (a vitrine já carrega tudo). Guarda: medir em produção; se um
  catálogo passar de ~2.000 nós, paginar por grupo no GET (o agrupamento já é a unidade natural).
- **R4 — Duas telas, um dado.** Página do produto e matriz editando o mesmo nó em abas diferentes: última
  escrita vence, sem lock. Igual ao que já acontece entre vitrine e página do produto; a invalidação cruzada
  de queries (§5.2) reduz a janela.
- **R5 — Índice parcial fora do Drizzle.** Um `drizzle-kit generate` futuro pode propor derrubar
  `unq_catalog_links_externo_item`. Mesma mitigação já em uso: comentário no schema + revisão do SQL gerado.
