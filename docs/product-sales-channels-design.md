# Canais de Venda — Vendabilidade e Preço por Canal

> Design doc. **Fases 1 a 4 implementadas** (a 4 no doc irmão de iFood; ver lá os fatos da API descobertos ao vivo). Antes: **fases 1, 2 e 3** — coluna `vendavel` + gate em todas as superfícies; tabelas de canal e
> overrides, resolver, rotas; cutover do shop com dual-read/dual-write (§4); disponibilidade E preço por canal
> aplicados em SHOP/POS/COMANDA (catálogos devolvem o preço resolvido; `validateSaleItemsPricing`/
> `computeSaleItemsPricingDrift` aceitam `canal` e conferem contra o preço do canal da venda); matriz "Canais de
> venda" na página do produto com disponibilidade e preço por nó. Pendente: fase 4 (iFood via `catalog_links`).
> A migração `drizzle/0082_product_sales_channels.sql` é aplicada manualmente.
>
> Decisão da fase 3: pedidos de comanda usam o canal COMANDA independentemente de quem digita — o composer do
> operador (`TabOrderComposer`) consome os endpoints de POS com `channel=COMANDA`, e `launchTabOrder` valida com esse
> canal; o pedido da mesa custa o mesmo venha do QR do cliente ou do balcão. O drift do checkout usa o canal da
> própria venda (`toSalesChannelType(sale.canal)`) — um orçamento do shop confere contra os preços do SHOP.
> O gate `precoVenda > 0` da loja roda sobre o preço RESOLVIDO (um override pode tornar vendável um produto de
> preço base zerado). Fora do canal: `resolve-sale-items.ts` (cotações da IA) segue no preço base.
> Contexto: organizações ERP vendem pelas superfícies internas (PDV, loja digital, comanda/QR) e por integrações (iFood). Hoje cada superfície inventou sua própria regra de visibilidade de produto, não existe distinção entre produto vendável e matéria-prima, e não existe preço por canal. Este documento desenha a primitiva nativa que unifica isso.
> Documento irmão: `docs/ifood-catalog-linking-sync-design.md` (mecanismo de sincronização com catálogos remotos — consome a primitiva desenhada aqui, ver §5).

---

## 1. Problema e princípios

### Estado atual

| | Loja digital (SHOP) | PDV (POS) | Comanda QR | POI |
|---|---|---|---|---|
| Lista in/out de produtos | sim — `shop_settings.configuracoes.produtos.{modo, produtoIds}` | não | não | n/a (não lista produtos) |
| Exige `ativo` | sim | sim | sim | n/a |
| Exige `precoVenda > 0` | sim (`lib/shop/catalog.ts:9`) | não | não | n/a |
| Esconde sem estoque | sim | não | não | n/a |
| Fonte de preço | `variant.precoVenda ?? product.precoVenda` + `precoDelta` | idem | idem | valor digitado |
| `sales.canal` gravado | `"SHOP"` | `"POS"` | `"COMANDA"` | *null* |

- **Não existe distinção vendável vs matéria-prima.** Água, açúcar e leite aparecem no PDV e na comanda QR junto dos produtos finais. Os proxies existentes (`baixaEstoqueModo`, `tipo` texto livre, presença em `production_recipe_inputs`) não servem: leite pode ser insumo E vendável ao mesmo tempo.
- **Preço vive em exatamente três lugares** — `products.precoVenda/precoCusto`, `product_variants.precoVenda/precoCusto`, `product_add_on_options.precoDelta`. Nenhum mecanismo de preço por canal.
- **iFood é um universo paralelo**: catálogo remoto com preços próprios (inclusive `contextModifiers` por contexto), nunca reconciliado com o cadastro interno.
- A validação de preço de venda (`lib/sales/sale-pricing-validation.ts`) compara sempre contra o preço base — não conhece canal.

### Princípios do design

1. **Duas perguntas ortogonais, nunca misturadas**: *"este produto pode ser vendido?"* é propriedade do **produto** (`vendavel`); *"onde e por quanto?"* é propriedade do **par (produto, canal)**.
2. **Ausência de linha = herança.** A configuração por canal é esparsa: só existe registro onde o comportamento desvia do padrão. Mudança no preço base propaga para todo canal sem override — exatamente o controle de drift desejado. (Mesma semântica dos `contextModifiers` do iFood: "campo em branco herda o valor da raiz".)
3. **Um único ponto de resolução.** Toda superfície (leitura de catálogo E validação de pedido) responde disponibilidade e preço pelo mesmo módulo. Nenhuma superfície reinventa filtro.
4. **Canais internos leem o estado desejado em query time; canais externos recebem por reconciliação.** iFood não é arquiteturalmente especial: consome a mesma primitiva, via `catalog_links` (push/sync), em vez de render direto.
5. **Registro de canal com identidade própria** (tabela, não enum solto): é o lar do modo de catálogo por canal — o que mata a config `INCLUIR/EXCLUIR` do jsonb da loja — e absorve multi-merchant iFood e política comercial futura sem mudança de schema.

---

## 2. Modelo de dados

### 2.1 `products.vendavel` (nova coluna)

```
vendavel   boolean, default true, notNull
```

- `false` = matéria-prima / item interno: some de **todas** as superfícies de venda (PDV, shop, comanda, sync iFood) de uma vez, mas permanece visível em gestão de catálogo, compras, estoque e fichas técnicas.
- Boolean, não enum: o *porquê* de não ser vendável (insumo, embalagem, revenda…) é classificação e continua em `grupo`/`tipo`; a primitiva só precisa do gate.
- Ortogonal a `baixaEstoqueModo` e a presença em receitas (leite: `vendavel=true` + insumo).
- Backfill: tudo `true` (seguro). Assistente opcional de uma vez: sugerir `false` para produtos que só aparecem como insumo de receita e têm `precoVenda` nulo.
- No `ProductSchema` o campo é **opcional sem default** (mesmo padrão de `baixaEstoqueModo`): payload sem o campo não
  altera o valor persistido. Com `.default(true)`, qualquer client que omitisse o campo — inclusive o menu de edição
  do produto — reativaria a venda de uma matéria-prima numa edição não relacionada, sem erro e sem sinal na UI.
- Interação com o doc de iFood: `vendavel=false` bloqueia publish/vínculo em `catalog_links` (torna o princípio 1 daquele doc — "matéria-prima nunca é vinculada" — verificável por flag, não por convenção).

### 2.2 Nova tabela: `sales_channels` (prefixo `ampmais_`)

Uma linha = um canal de venda da organização. **Provisionamento na primeira leitura**: `ensureSalesChannels`
(`lib/products/sales-channels-store.ts`) materializa os canais internos com `catalogoModo: "TODOS"` e devolve
todas as linhas da org. Devolver linhas sintéticas (`id: null`) foi descartado na implementação: a matriz por
produto grava overrides contra o id do canal, então o id precisa existir antes de a tela salvar — senão a UI
depende de um PUT prévio que nada garante. O insert é idempotente pelo unique de identidade.

```
sales_channels
├── id                 varchar(255) PK uuid
├── organizacao_id     FK organizations (cascade), notNull
├── canal              pgEnum sales_channel_type: "POS" | "SHOP" | "COMANDA" | "IFOOD"
├── integracao_id      FK integrations (cascade), nullable   -- null p/ canais internos; preenchido p/ IFOOD
├── ref_externo        varchar(255) nullable                 -- merchantId do iFood (multi-loja); null p/ internos
├── catalogo_modo      pgEnum sales_channel_catalog_mode: "TODOS" | "SELECIONADOS", default "TODOS"
├── data_insercao / data_atualizacao
└── índices:
    unique (organizacao_id, canal, integracao_id, ref_externo) nullsNotDistinct
    index  (organizacao_id)
```

- `catalogo_modo` substitui o `produtos.modo` do jsonb da loja: `"TODOS"` = tudo que é `ativo && vendavel` entra por padrão (exclusões via linhas `disponivel=false`); `"SELECIONADOS"` = cardápio curado, só entra quem tem linha `disponivel=true` (workflow do antigo `INCLUIR`).
- Escopo deliberadamente restrito a **política de catálogo/comercial**. Configuração operacional continua onde está (`shop_settings`, `service_settings`, `integrations.configuracao`) — esta tabela não vira um saco de settings.
- Os valores do enum são os mesmos já canônicos em `sales.canal` e em `resolvePrintPolicyChannel` (`lib/desktop-agent/auto-print.ts:19`).

### 2.3 Nova tabela: `product_channel_settings` (prefixo `ampmais_`)

Uma linha = um desvio do padrão para (produto-ou-variante × canal). **Tabela esparsa** — a maioria dos produtos não terá linha nenhuma.

```
product_channel_settings
├── id                    varchar(255) PK uuid
├── organizacao_id        FK organizations (cascade), notNull
├── canal_venda_id        FK sales_channels (cascade), notNull
├── produto_id            FK products (cascade), notNull
├── produto_variante_id   FK product_variants (cascade), nullable  -- null = nível produto
├── disponivel            boolean nullable       -- null = herda o padrão do canal (catalogo_modo)
├── preco_venda           doublePrecision nullable  -- null = herda o preço base
├── data_insercao / data_atualizacao
└── índices:
    unique (canal_venda_id, produto_id, produto_variante_id) nullsNotDistinct
    index  (canal_venda_id)
    index  (organizacao_id, produto_id)
```

**Por que não colunas em `products`?** Multiplicaria colunas por canal (o problema atual, generalizado); a tabela esparsa suporta N canais (inclusive N merchants iFood) sem mudança de schema, e a linha carrega os dois eixos (disponibilidade + preço) do mesmo desvio.

### 2.4 Schemas Zod

- `schemas/sales-channels.ts`: `SalesChannelSchema`, `ProductChannelSettingSchema` (validadores de runtime).
  Os tipos de entidade NÃO são duplicados aqui: `TSalesChannelEntity`/`TProductChannelSettingEntity` vêm do
  `$inferSelect` em `services/drizzle/schema/sales-channels.ts`, como no resto do repo — dois tipos com o mesmo
  nome resolvendo diferente conforme o import é fonte garantida de drift.
- Enums (`SalesChannelTypeEnum`, `SalesChannelCatalogModeEnum`) em `schemas/enums.ts`; pgEnums em `services/drizzle/schema/enums.ts` (convenção do repo).
- Tabelas Drizzle em `services/drizzle/schema/sales-channels.ts`, barrel-export em `schema/index.ts`.

---

## 3. Semântica de resolução

Módulo único: `lib/products/sales-channels.ts`. Duas funções, e **nenhuma superfície implementa filtro próprio**:

```
resolveChannelAvailability({ product, variant?, channel, overrides: { product?, variant? } }):
  product.ativo && product.vendavel
  && (overrides.product.disponivel ?? (channel.catalogoModo === "TODOS"))   -- presença do PRODUTO no canal
  && (variant ? variant.ativo && overrides.variant.disponivel !== false : true)
  && gates específicos do canal          -- SHOP mantém precoVenda > 0 e gate de estoque
                                         --     (política do canal, aplicada AQUI, não em catalog.ts)

resolveChannelPrice(product, variant?, overrides):
  variant ? (overrides.variant.precoVenda ?? variant.precoVenda)
          : (overrides.product.precoVenda ?? product.precoVenda)
```

Regras que ficam explícitas:

- **Disponibilidade herda em cadeia**: o override do produto (senão o `catalogo_modo`) decide a presença do produto no
  canal; a linha da variante só RESTRINGE dentro de um produto visível. Uma variante `disponivel=true` não ressuscita um
  produto excluído — e num produto incluído em modo `SELECIONADOS`, as variantes seguem sem precisar de linha própria.
  (Sem esta cadeia, incluir um produto no cardápio curado esconderia todas as suas variantes.)
- **Override de preço é node-scoped**: override de variante vale para a variante; override nível-produto vale só para produto sem variantes. Sem fallback cruzado (produto-com-variantes + override nível-produto seria ambíguo — proibido na validação de escrita).
- **Preço final do item** continua `resolveChannelPrice(...) + Σ precoDelta` dos modificadores. `precoDelta` por canal fica fora da v1 (ver D3).
- `disponivel` do override tem precedência sobre `catalogo_modo` nos dois sentidos: em modo `TODOS` uma linha `false` exclui; em modo `SELECIONADOS` só linhas `true` incluem.
- A resolução em lote (catálogo inteiro de um canal) carrega o canal + linhas esparsas em duas queries indexadas — a tabela esparsa mantém isso barato.

---

## 4. Consumo por superfície

| Superfície | Mudança |
|---|---|
| **Loja digital** | `lib/shop/catalog.ts` troca a lógica de `configuracoes.produtos.{modo, produtoIds}` pelo resolver; `app/api/shop/[orgId]/orders/route.ts` valida disponibilidade E precifica (`:141-143`) via resolver |
| **PDV** | `app/api/pos/products/route.ts` (+ `hydrate-pos-products.ts`, `top-products`, `cross-sell`) ganham filtro `vendavel` + disponibilidade do canal POS. **Decidido: PDV honra `disponivel=false` desde o dia um** — o padrão é tudo visível, então nada muda até alguém desligar um produto |
| **Comanda QR** | `app/(external)/service-point/[token]/page.tsx` + `app/api/public/tab-order-requests/route.ts` + `lib/tabs/launch-tab-order.ts` usam o resolver (hoje têm zero filtro além de `ativo`) |
| **Validação de preço** | `validateSaleItemsPricing` e `computeSaleItemsPricingDrift` (`lib/sales/sale-pricing-validation.ts`) recebem o canal e comparam contra o preço **do canal**, não o base — drift passa a ser medido contra a verdade certa |
| **POI** | Fora de escopo — não lista produtos (venda por valor digitado). Se um dia listar, vira canal `"POI"` no enum sem mudança estrutural |

Edição de venda existente: filtros valem para **adicionar** itens; itens já lançados de produto que ficou indisponível permanecem na venda (snapshot em `valorVendaUnitario` já protege o histórico).

### Migração do jsonb da loja

`shop_settings.configuracoes.produtos`:

- `modo: "ATIVOS"` → `sales_channels(SHOP).catalogoModo = "TODOS"`, sem linhas.
- `modo: "INCLUIR"` → `catalogoModo = "SELECIONADOS"` + uma linha `disponivel=true` por `produtoId`.
- `modo: "EXCLUIR"` → `catalogoModo = "TODOS"` + uma linha `disponivel=false` por `produtoId`.
- **`destaqueIds` fica em `shop_settings`** (decidido): é merchandising/apresentação, não disponibilidade, e não generaliza para outros canais.
- **IMPLEMENTADO (dual-read; dual-write APOSENTADO)**: `getShopCatalogProducts` lê o canal SHOP quando a linha existe e
  cai no jsonb quando não (proteção para organizações ainda não materializadas). O PUT de `/api/shop/settings` **não**
  sincroniza mais o canal: a curadoria edita o canal diretamente (hoje pela matriz de canais em Produtos,
  `PUT /api/sales-channels/matrix` — ver `docs/catalog-channels-matrix-design.md`; a vitrine da loja e seu
  `PUT /api/sales-channels/showcase` foram aposentados), e um sync a cada save apagaria essa curadoria. `syncShopSalesChannel` sobrevive apenas como tradução única, chamada por
  `ensureSalesChannels` ao materializar o canal de uma organização antiga — o provisionamento continua shop-aware, nunca
  com default cego. O bloco `modo/produtoIds` do jsonb virou legado tolerado (ninguém escreve, só essa migração lê);
  `destaqueIds` continua ativo. Backfill/verificação `npm run backfill:shop-sales-channels` compara jsonb × canal e, por
  isso, só faz sentido em organizações que ainda não usaram a vitrine — as duas fontes divergem por desenho agora.
- **Ordem dos grupos**: `sales_channels.ordem_grupos` (text[]) guarda os nomes de `products.grupo` na ordem em que a
  vitrine os exibe. `getShopCatalogData` ordena com `sortGroupsByChannelOrder`; grupos fora da lista vão depois, em
  ordem alfabética, e entradas órfãs (grupo renomeado) são podadas na leitura.

---

## 5. Relação com `catalog_links` (iFood)

Camadas distintas, complementares:

| Camada | Responde | Onde |
|---|---|---|
| **Primitiva de canal** (este doc) | *O que* a org deseja: produto disponível no canal iFood? A que preço? | `sales_channels` + `product_channel_settings` |
| **Vínculo/sync** (`ifood-catalog-linking-sync-design.md`) | *Como* esse desejo chega lá: mapeamento produto↔item remoto, política por campo, snapshot, divergência, push | `catalog_links` |

- A política `sincronizar.preco: true` de um vínculo passa a significar "push do **preço resolvido do canal**" (`resolveChannelPrice(..., canal IFOOD do merchant)`) — o caso canônico daquele doc ("mesmo produto, preço diferente no iFood") deixa de ser um opt-out e vira um override de canal com sync ligado. `preco: false` continua existindo para quem quer gerir o preço só no Portal/aba Catálogo.
- `sincronizar.disponibilidade: true` faz push do `resolveChannelAvailability` → `item.status`.
- Uma linha `sales_channels` por merchant iFood (`integracao_id` + `ref_externo = merchantId`) — casa com o `merchant_id` do `catalog_links`.
- **Ingestão de pedidos** (`lib/data-connectors/ifood/`) permanece intacta nas fases 1–3; na fase 4, `catalog_links` melhora o matching (hoje `externalCode ↔ codigo`, frágil), conforme já previsto lá.

---

## 6. Arquitetura de código

```
lib/products/sales-channels.ts   -- resolver (availability + price), tipos, defaults de canal
services/drizzle/schema/sales-channels.ts
schemas/sales-channels.ts
```

### Rotas API (padrão 4 partes, `appApiHandler`)

```
app/api/sales-channels/route.ts            GET (canais da org, internos materializados na leitura) /
                                           PUT (catalogo_modo; upsert pela identidade do canal)
app/api/products/channel-settings/route.ts GET (por produto: matriz canal × disponibilidade/preço) /
                                           PUT (patch esparso dos nós enviados)
```

- `PUT /api/products/channel-settings` é um **patch esparso**, não um replace: cada item do payload endereça um nó
  (canal + variante). Nó com `disponivel` e `precoVenda` nulos volta a herdar (a linha é removida); nós ausentes do
  payload ficam intactos — sem isso, uma tela por canal apagaria os overrides dos outros canais do mesmo produto.
  Nós repetidos no payload são rejeitados com 400 (dois inserts do mesmo nó violariam o unique e virariam 500).
- `PUT /api/products/channel-settings` valida: override de preço nível-produto proibido quando há variantes; `produtoId`/`produtoVarianteId`/`canalVendaId` pertencem à org (padrão `validateShopProductIds`).
- `PUT /api/sales-channels` valida que `integracaoId` pertence à organização: a FK só prova que a integração existe em
  alguma org, e o `onDelete: cascade` faria a exclusão da integração de outra org apagar o canal (e seus overrides).
- `vendavel` entra no `ProductSchema` (`schemas/products.ts`) e trafega no PUT/POST existentes de `/api/products` — não ganha rota própria.
- Escrita exige permissão de produtos; leitura dos canais, sessão da org.

---

## 7. UI

### 7.1 Página do produto (aba CADASTRO)

- Toggle **"Produto vendável"** na seção geral (junto de `ativo`), com hint: "Desligue para matéria-prima e itens internos — o produto some de todas as superfícies de venda".
- Nova seção **"Canais de venda"** (mesmo padrão de seção das demais): matriz por canal — coluna de disponibilidade (herdar / disponível / indisponível, ciclo à la `ProductChannelsBlock` do iFood) e coluna de preço do canal (vazio = herda o base, mostrando o valor efetivo resolvido ao lado). Por variante quando o produto tem variantes. A seção do iFood neste bloco converge com a seção "Canais de venda" prevista no doc de vínculos (§6.1 lá) — mesma casa.

### 7.2 Configurações da loja (`ShopSettingsPanel`)

O picker de três modos passa a editar `sales_channels(SHOP).catalogoModo` + linhas, mantendo o mesmo UX (a mudança é de storage, não de workflow). `destaqueIds` intocado.

### 7.3 Listagem de catálogo

Filtro/badge por `vendavel` na listagem de produtos (`app/dashboard/catalog/products`), para separar cadastro comercial de insumos.

---

## 8. Fases de implementação

> DDL segue o fluxo do repo: migração SQL gerada e aplicada manualmente via `scripts/apply-sql-migration.ts` — uma migração por fase.

1. **`vendavel`** — coluna + `ProductSchema` + toggle na página do produto + filtro em **todas** as superfícies de venda.
   A lista completa (a primeira passada cobriu só parte dela): `app/api/pos/products`, `lib/pos/hydrate-pos-products`
   (cobre `top-products`), `app/api/pos/cross-sell` (passou a reusar o hidratador em vez da query duplicada),
   `lib/shop/catalog`, as duas páginas públicas de QR (`service-point/[token]`, `tab/[token]`) e os dois gates de
   escrita da comanda (`api/public/tab-order-requests`, `api/tabs/order-requests`). Valor imediato (insumos somem do
   PDV), zero risco (default `true`).
   Fora do gate por ora: `POST /api/tabs/orders` (garçom autenticado) não valida produto nenhum hoje — os preços vêm
   do client e `launchTabOrder` só busca custo. Fechar isso é uma validação nova, não um filtro, e fica para a fase 3
   junto da precificação channel-aware.
2. **Disponibilidade por canal** — tabelas `sales_channels` + `product_channel_settings`, resolver, rotas, migração do jsonb da loja, matriz de canais na página do produto. PDV e comanda ganham toggle por produto de graça.
3. **Preço por canal** — `preco_venda` nos overrides + `resolveChannelPrice` em todos os pontos de precificação + validação de preço channel-aware + coluna de preço na matriz.
4. **iFood via `catalog_links`** — implementação do doc irmão consumindo o estado do canal (push de preço/disponibilidade resolvidos), matching de ingestão por vínculo.

Cada fase é entregável de forma independente.

---

## 9. Decisões

### Tomadas

- **Registro de canal em tabela** (`sales_channels`), não enum solto nos overrides: é o lar do `catalogo_modo` (mata o jsonb da loja) e do multi-merchant iFood. O custo é um join e provisionamento lazy — aceito.
- **PDV honra `disponivel=false` desde o dia um** (fase 2). Default é tudo visível; nada muda até uma org desligar um produto no canal POS.
- **`destaqueIds` permanece em `shop_settings`** — merchandising, não disponibilidade.
- **Override de preço é absoluto e node-scoped** (variante ou produto-sem-variante). Sem fallback cruzado.

### Em aberto

- **D1 — Gates do shop como política configurável**: `precoVenda > 0` e ocultar-sem-estoque ficam hardcoded como política do canal SHOP na v1. Promover a colunas de `sales_channels` (ex.: `ocultarSemEstoque`) só se outro canal pedir.
- **D2 — Ajuste percentual por canal** ("shop é sempre +10%"): caberia como coluna em `sales_channels` aplicada antes dos overrides absolutos. Fora até haver demanda.
- **D3 — `precoDelta` de add-on por canal (DECIDIDO 2026-08-28: adiado)**: iFood tem preço próprio de option; internamente o delta é único. Fica fora das fases 3–4; se necessário no futuro, `product_channel_settings` ganha `produto_add_on_opcao_id` nullable ou tabela irmã.
- **D4 — `sales.canal` (texto livre) → FK `sales_channels`**: normalização desejável mas invasiva (todo writer de venda). Fica para depois; o enum já garante vocabulário comum.

---

## 10. Riscos e mitigação

- **Regressão de visibilidade no shop na migração do jsonb** → dual-read por um release + script de verificação comparando o catálogo resolvido antes/depois por org.
- **Superfície esquecida sem o resolver** (novo endpoint listando produtos direto) → o resolver é o único export com essa responsabilidade; grep de guarda em review por `eq(products.ativo, true)` fora de `lib/products/sales-channels.ts` nas superfícies de venda.
- **Custo de query no catálogo** → left join em tabela esparsa indexada por `canal_venda_id`; catálogos grandes já são paginados no PDV.
- **Unique com colunas nullable** → `nullsNotDistinct` nos dois uniques (Postgres 15+; Supabase ok).
- **Divergência entre matriz local e catálogo remoto do iFood nas fases 2–3** (antes do sync da fase 4): a matriz do canal IFOOD deve deixar claro que é *estado desejado* ainda não sincronizado — badge "sem vínculo/sync" até a fase 4, para não parecer que o toggle já afeta o iFood.
