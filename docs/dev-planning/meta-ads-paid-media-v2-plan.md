# Planejamento — Mídia paga v2 (Meta Ads)

**Status:** Planejado, não iniciado
**Data:** 30/10/2026
**Origem:** porte da nova UI de marketing do Syncroniza Control (`src/app/(main)/dashboard/marketing`, `src/components/marketing/**`, `src/lib/integrations/meta/ads/**`, `src/server/media-ads/**`), reescrita na linguagem visual e nas convenções do RecompraCRM.

## Objetivo

Trocar a página atual de mídia paga (`app/dashboard/channels/paid-media/`) por uma página de análise de Meta Ads no nível da do Control:

- período com comparação, deltas e sparklines;
- níveis de campanha, conjunto e anúncio;
- recortes por público, região, posicionamento e horário;
- painel lateral navegável de campanha e anúncio.

Além disso, passar a manter um **catálogo persistido de anúncios**. Ele é a base da listagem, e as métricas do período são buscadas ao vivo e cruzadas com ele.

## Decisões acordadas

- **Escopo: só a "fase 1"**, ou seja, dados, UI e catálogo. As outras frentes do Control ficam fora:
  - atribuição first-party (anúncio → cliente → venda);
  - agente de marketing;
  - exportação em PNG;
  - Google Ads.
- O agente, quando vier, será feito **por ferramentas MCP** (`lib/agent-tools/`), não com um agente interno como o do Control.
- A página continua como **"Mídia paga"** na sidebar (grupo Canais), sob a capability `paidMedia`.
- **A tabela `media_ads` entra, e o uso dela vai além do que o Control faz.** No Control ela só alimenta a jornada do visitante, e a biblioteca de anúncios continua ao vivo. Aqui ela passa a ser a fonte da listagem de anúncios, da identidade (nomes, status, objetivo) e do criativo.
- **A linguagem visual é a do RecompraCRM.** O porte segue o comportamento e a arquitetura da informação do Control, mas usa os primitivos daqui (`Section`, `StatUnitCard`, `Ranking`, `hub-table`, `useOrgColors`) e as regras do `DESIGN.md`.

## O que existe hoje

| Peça | Estado |
|---|---|
| OAuth (`app/api/integrations/meta/ads/auth/**`) | Pronto; grava uma linha em `integrations` por conta de anúncios. Fica como está. |
| `lib/integrations/meta/ads/{client,config,insights,library,types}.ts` | Base boa. A deduplicação de compras e leads está **mais correta que a do Control** (o normalizador base do Control soma `omni_purchase` + `purchase` + pixel). |
| Rotas `insights`, `spend-series`, `library`, `ad` | Ao vivo e sem cache. `insights?level=campaign` e `library` não paginam. Há um `console.log` esquecido em `insights/route.ts`. |
| `marketing-page.tsx` | 8 KPIs, um gráfico de investimento e uma grade de anúncios. Sem campanhas, sem comparação, sem recortes. Fora do padrão `Section`, com cor fixa `#ffb900` e verdes crus. |
| `MetaAdDetailModal.tsx` | `Dialog` simples. O criativo é buscado mas nunca exibido. |
| `MetaCapiSettingsModal.tsx` | Mantido; continua acessível pelo cabeçalho. |
| `markMetaAdsIntegrationStatus` | Existe, mas nunca é chamado. Token expirado não muda o `status` da integração. |

## Arquitetura: catálogo persistido + métricas ao vivo

A divisão é a seguinte:

- **No banco fica o que muda devagar e precisa ser consultável:** quais anúncios existem, como se chamam, onde estão na árvore e qual é o criativo.
- **Ao vivo fica o que depende do período:** métricas, séries diárias, recortes e rankings de qualidade.

Guardar insights diários seria uma réplica do Ads Manager, com problemas de reprocessamento (a Meta revisa números por até 28 dias). Por isso fica fora desta fase.

### Tabela `media_ads`

Arquivo `services/drizzle/schema/media-ads.ts`, criado com `newTable` (prefixo `ampmais_`) e exportado no barrel. Os campos seguem o Control, com o tenant trocado:

| Campo (Drizzle / coluna) | Observação |
|---|---|
| `id` / `id` | uuid |
| `organizacaoId` / `organizacao_id` | FK `organizations`, cascade |
| `integracaoId` / `integracao_id` | FK `integrations`, cascade |
| `plataforma` / `plataforma` | `pgEnum` `mediaAdPlatformEnum` em `enums.ts`: `"META"` (Google cabe depois sem migração de dados) |
| `contaExternaId` | `act_…` |
| `campanhaId`, `campanhaNome`, `campanhaObjetivo`, `campanhaStatus` | Desnormalizados. `campanhaStatus` é novo em relação ao Control. |
| `conjuntoId`, `conjuntoNome`, `conjuntoStatus` | Idem; `conjuntoStatus` também é novo. |
| `anuncioId`, `anuncioNome`, `status` (efetivo), `statusConfigurado` | `statusConfigurado` é novo: separa "pausado por você" de "pausado pela campanha". |
| `criativoId`, `titulo`, `corpo`, `tipoMidia` (`IMAGEM`/`VIDEO`/`CARROSSEL`/`DESCONHECIDO`), `cta`, `urlDestino`, `permalink`, `urlTags`, `videoId` | O criativo vem do banco. Só a URL tocável do vídeo continua ao vivo, porque expira. |
| `capaUrl`, `capaOrigemUrl`, `capaCriativoId` | Capa copiada para o Supabase Storage, porque a URL da Meta é assinada e expira. Só é baixada de novo quando o criativo muda. |
| `nomesAnteriores` | jsonb `{ anuncio[], conjunto[], campanha[] }`. Barato de manter e pronto para atribuição futura por UTM. |
| `criadoNaPlataformaEm`, `atualizadoNaPlataformaEm`, `sincronizadoEm`, `removidoEm`, `dataInsercao`, `dataAtualizacao` | `removidoEm` faz soft delete: anúncios que saem da conta não são apagados. |

Índices:

- único em `(organizacaoId, plataforma, anuncioId)`;
- `(integracaoId, status)`;
- `(integracaoId, campanhaId)`;
- `lower(anuncioNome)`, para a busca da biblioteca.

O schema Zod da entidade fica em `schemas/media-ads.ts`, e os enums em `schemas/enums.ts`.

**Estado da sincronização.** Usa as colunas que `integrations` já tem: `dataUltimaSincronizacao`, `ultimoErro` e `status`. O que falta vai em `configuracao.catalogo`:

```ts
{ ultimaCompletaEm, ultimaTentativaEm, anuncios, truncado }
```

Isso é um campo opcional novo em `MetaAdsIntegrationConfigSchema`; o `mask.ts` não precisa mudar.

### Sincronização (`lib/integrations/meta/ads/catalog-sync.ts`)

O porte é de `src/server/media-ads/sync.ts` e `lib/integrations/meta/ads/catalog.ts` do Control.

**Modo `auto`:**
- faz uma sincronização **completa** se passaram 24h desde a última completa;
- caso contrário faz uma **incremental**, filtrando `updated_time > última sincronização − 15min`.

**Leituras na Graph API:**
- `/{act}/ads` com todos os status exceto `DELETED`, paginado até um teto de 10 mil anúncios (com `truncado` registrado);
- uma lista leve de campanhas e conjuntos (`id, name, objective, effective_status`). Ela é necessária porque renomear ou pausar uma campanha não muda o `updated_time` dos anúncios.

**Gravação:**
- upsert em lotes de 200 com histórico de nomes;
- propagação de nome e status de campanha e conjunto;
- `removidoEm` marcado só em sincronização completa que não foi truncada;
- capas: até 150 por rodada, 5 em paralelo.

**Gatilhos:**
1. Cron `app/api/cron/meta-ads-catalog/route.ts`, no padrão de `meta-audiences-sync` (`assertCronAuthorized`, laço por integração, erro isolado por conta), agendado em `vercel.json` a cada 6h com minuto deslocado das outras rotinas.
2. Callback do OAuth: depois de criar as integrações, roda uma completa por conta, sem bloquear o redirect quando passar do tempo.
3. Botão "Sincronizar agora" na página: `POST /api/integrations/meta/ads/catalog/sync` (`canManageIntegrations`).

**Token:**
- Erro 190 ou token expirado chama `markMetaAdsIntegrationStatus(EXPIRADO)`, que hoje não é usado.
- A página então mostra um `Callout` de reconexão em vez de falhar seção por seção.

**Vercel Queue?** Não por enquanto. Com o teto de 300s e o laço por conta, o cron é suficiente para o volume atual. Se uma organização tiver dezenas de contas, aí passa para uma fila por integração, no padrão de `app/api/queues/*`.

### O que lê do banco e o que segue ao vivo

| Uso | Fonte |
|---|---|
| Lista da biblioteca: filtros (status, campanha, tipo de mídia), busca por nome, paginação, contagem | **Banco** |
| Identidade no painel lateral (nome, campanha, conjunto, status, objetivo, CTA, destino, textos, capa) | **Banco** |
| Esqueleto da árvore campanha → conjunto → anúncio, incluindo anúncios **sem entrega no período**, que hoje não aparecem | **Banco** |
| Status e objetivo das campanhas na tabela de campanhas (substitui a chamada extra a `/{act}/campaigns` que o Control faz) | **Banco** |
| Métricas do período e da comparação, séries diárias, recortes, rankings de qualidade, URL do vídeo | **Ao vivo** |

**Cruzamento na biblioteca:**

- `GET /library` lê do banco as linhas filtradas e faz **uma** chamada de insights em nível de anúncio para o período, paginada (ela traz todos os anúncios com entrega).
- As métricas são cruzadas por `anuncioId` no servidor.
- Ordenar por métrica (investimento, CPL, ROAS) funciona do lado do servidor: o conjunto filtrado cabe em memória e a ordenação vem antes de paginar.
- Ordenar por nome ou data dispensa a chamada de insights quando a métrica não é pedida (`withMetrics=false`).
- Anúncio sem entrega aparece com "—" nas métricas, nunca com 0.
- O cabeçalho da biblioteca mostra "Catálogo sincronizado há X" e o botão de sincronizar. O status no banco pode estar até 6h atrasado, e isso fica explícito.

Enquanto uma conta recém-conectada não tem catálogo, a rota responde `catalogoPendente: true` e a UI mostra um estado de carregamento próprio, sem cair na consulta ao vivo.

## Camada de dados (`lib/integrations/meta/ads/`)

Porte dos blocos do Control, adaptado:

| Arquivo | Conteúdo | Origem no Control |
|---|---|---|
| `insights-query.ts` | `fetchMetaAdsInsightsRaw` (nível, `time_range`, breakdowns, `time_increment`, filtros, `use_unified_attribution_setting`) e paginação até o fim | `insights-query.ts` |
| `fields.ts` | Campos por nível e por recorte: rankings só em anúncio sem breakdown; sem reach/frequency no recorte horário | `fields.ts` |
| `breakdowns.ts` | Presets: `[age,gender]`, `[region]` + `[country]`, `[publisher_platform,platform_position,impression_device]`, `[hourly_stats_aggregated_by_advertiser_time_zone]` | `breakdowns.ts` |
| `mappers.ts` | `normalizeMetaAdsRich` (funil, vídeo, engajamento, rankings) e `aggregateRichMetrics`, que soma o que é aditivo e recalcula as razões | `mappers.ts` |
| `action-metrics.ts` (+ teste) | Uma família de ação por métrica. **A regra de compras daqui prevalece sobre a do Control.** | `action-metrics.ts` |
| `hierarchy.ts` | Conta/campanha/conjunto/anúncio em paralelo; métricas do pai vêm do agregado real, nunca da soma dos filhos | `hierarchy.ts` |
| `comparison.ts` | Merge por id entre os dois períodos; `getDelta` com as mesmas regras do Control (sem base → null; base 0 → +100%; \|Δ\| < 0,5% → estável; `lowerIsBetter`) | `marketing-format.ts` |
| `catalog.ts`, `catalog-sync.ts` | Ver acima | `catalog.ts`, `server/media-ads/sync.ts` |

O `insights.ts` e o `library.ts` atuais são absorvidos por esses módulos. O `library.ts` fica só com o que o catálogo usa, incluindo o fallback de `asset_feed_spec`.

**Regras do Control que entram junto:**
- intervalo máximo de 90 dias;
- datas `YYYY-MM-DD` interpretadas no **fuso da conta** (`timezoneName` já está na config);
- moeda da conta (`currency`) em toda formatação monetária, em vez de BRL fixo.

## Rotas (`app/api/integrations/meta/ads/**`)

Todas seguem o padrão do `CLAUDE.md`:

- quatro partes: schema → serviço → handler → `appApiHandler`;
- query params como string;
- `canViewIntegrations` + `resolveMetaAdsIntegration`;
- resposta `{ data, message }`;
- envelope em inglês e entidades em português.

| Rota | Entrada | Saída |
|---|---|---|
| `GET insights` (reescrita) | `integrationId, level (account\|campaign\|adset\|ad), since, until, comparingSince?, comparingUntil?, campaignId?` | `{ account \| rows }`, cada um com `comparativo` |
| `GET series` (substitui `spend-series`) | `integrationId, level, entityId?, since, until, comparingSince?, comparingUntil?` | `{ atual: [{ data, metricas }], comparativo: [...] }`, com dias vazios preenchidos |
| `GET funnel` | período | funil de conversão (`ConversionFunnelPanel`), vídeo, engajamento |
| `GET breakdowns` | `type (demographics\|geography\|placements\|dayparting), período, adId?` | linhas + pivôs |
| `GET hierarchy` | período, `campaignId?` | árvore com esqueleto do banco e métricas ao vivo |
| `GET library` (reescrita) | `integrationId, status, campaignId?, mediaType?, search?, sort, page, withMetrics, período?` | `{ ads, pagination, catalogo: { sincronizadoEm, pendente } }` |
| `GET ad` (reescrita) | `id, período, comparativo?` | `{ byId: { anuncio (banco), resumo, diario, comparativo, rankings, video? } }` |
| `POST catalog/sync` | `integrationId` | resumo da sincronização |

O `level=campaign` atual passa a paginar, e o `console.log` sai.

Os hooks ficam em `lib/queries/meta-ads.ts`, um por rota, no formato `{ ...useQuery, queryKey }` e com `enabled` amarrado ao `integrationId`. `staleTime` de 60s, e **chaves compartilhadas** entre a página e o painel lateral, para que abrir um item não refaça a busca. A mutação de sincronização vai em `lib/mutations/meta-ads.ts`.

## UI (`app/dashboard/channels/paid-media/`)

### Estrutura da página

A ordem segue o Control. As referências de layout no RecompraCRM são:

- `growth/campaigns/_module/overview/stats/campaigns-stats-view.tsx`, para período com comparação automática;
- `finance/overview-page.tsx`, para a linha de KPIs com sparkline;
- `sales/results/_components/comparison-chart-block.tsx`, para o gráfico de comparação.

1. **Cabeçalho:** título "Mídia paga", seletor de conta, `DateIntervalInput` de período e de comparação (padrão: mês corrente vs. anterior, com legenda sólida/tracejada) e o botão de configuração do CAPI. O estado vai na URL com `nuqs`, como em resultados de vendas.
2. **Resumo:**
   - quatro `StatUnitCard` com sparkline (`KpiSparkline`) e comparação: Investimento, Resultados, Custo por resultado (`lowerIsBetter`) e ROAS (Meta);
   - "Resultado" segue `pickMetaResultKey`: compras, senão leads, senão conversas;
   - abaixo, o **gráfico comparativo**: área do período e linha tracejada da comparação, alinhadas pelo n-ésimo dia, com seletor de métrica e alternância diário/acumulado (alcance só diário).
3. **Grupos de métricas:** Entrega (impressões, alcance, frequência, CPM), Tráfego (cliques, CTR, CPC) e Resultados Meta (compras, receita, leads, CPL, conversas, custo por conversa), cada linha com delta. O quarto grupo do Control, "Atividade CRM", sai, porque depende de atribuição.
4. **Ranking de campanhas** (`components/ui/ranking.tsx`, top 10, por investimento/resultados/CPL) ao lado da **distribuição do investimento** (donut com `getChartColors()` + "outros").
5. **Funil de conversão** e **recortes** (abas Público / Região / Posicionamento / Horário). Montados só quando entram na tela (porte do `LazyMount`), para não disputar limite de chamadas com o topo.
6. **Biblioteca de anúncios** (banco + métricas): visão em cards e em tabela, filtros de status, campanha e tipo, busca, ordenação, paginação do servidor e o indicador de sincronização.
7. **Tabela de campanhas:** nome, status, investimento, resultados, cliques, CTR, custo por resultado e ROAS, com delta por célula. Usa `hub-table`, que vira lista rotulada abaixo de `sm`, mais ordenação.

Estados:

- **Sem conta conectada:** o `ConnectEmptyState` atual, já no padrão `Empty`.
- **Token expirado:** `Callout` de reconexão no topo.
- **Erro em um bloco:** cada bloco é dono da sua query, então uma falha apaga só aquele bloco (regra do hub).

### Painel lateral (substitui `MetaAdDetailModal`)

Porte de `MarketingDetailSheet` e `marketing-sheet-context`:

- **Navegação:** pilha de `{ entrada, irmãos }`. Abrir a partir de uma lista da página reinicia a pilha; navegar dentro do painel empilha. Tem voltar, anterior/próxima com "3 / 6" e fechar.
- **Componente:** `components/ui/sheet.tsx` (Base UI) à direita no desktop, até 800px; no mobile, drawer de baixo (`vaul`), na mesma lógica do `ResponsiveMenu`. O corpo é chaveado por `tipo:id`.
- **Campanha:**
  - KPIs e gráfico diário (investimento em área + resultado em linha);
  - árvore conjunto → anúncio vinda do `hierarchy`, com os anúncios sem entrega visíveis;
  - clicar num anúncio empilha o painel do anúncio;
  - link para o Gerenciador de Anúncios.
- **Anúncio:**
  - identidade e **criativo** do banco (imagem, vídeo ou carrossel, textos, CTA, destino);
  - KPIs com comparação, rankings de qualidade e gráfico diário;
  - recortes do anúncio (as mesmas quatro visões com `adId`);
  - "Ver campanha" empilha o painel da campanha.

### Mapeamento de primitivos

| Control | RecompraCRM |
|---|---|
| `Section`, `Chip`, `Callout`, `Metric` | Componentes de mesmo nome em `components/ui/` |
| `HeroTiles` + `DeltaChip` + `Sparkline` | `StatUnitCard` + `KpiSparkline` (`finance/_components/finance-chart-kit.tsx`). Se faltar um delta em linha para tabelas, extrair um `DeltaText` pequeno para `components/ui/`. |
| `--chart-1..5` | `useOrgColors().getChartColors()`. O `#ffb900` fixo sai. |
| `MktTable` | `app/dashboard/_hub/hub-table.tsx` + cabeçalho ordenável. Se a ordenação não couber, promover uma variante para `components/ui/`, sem criar uma tabela própria do módulo. |
| `RankingBars` | `components/ui/ranking.tsx` |
| `Segmented` | `TabsList` |
| `StatusChip` | `Chip` com tons semânticos. `meta-ad-status.ts` passa a mapear para tons, sem `bg-green-100`. |
| `InfoHint` | `Tooltip` existente |
| `text-label` / `text-numeric` / `text-micro` | Os mesmos utilitários. Nada de `tabular-nums` solto nem de `h1` como rótulo. |
| Imagens | `next/image` com fallback `<img>`. Capas do Storage entram sem mexer em `remotePatterns`. |

### Organização dos arquivos

```
app/dashboard/channels/paid-media/
  page.tsx                      (sem mudança)
  paid-media-page.tsx           (substitui marketing-page.tsx)
  _components/
    paid-media-header.tsx
    summary-section.tsx         (KPIs + gráfico comparativo)
    metric-groups-section.tsx
    campaign-ranking-section.tsx
    spend-distribution-section.tsx
    conversion-funnel-section.tsx
    breakdowns-section.tsx      (+ views/demographics|geography|placements|dayparting)
    ad-library-section.tsx
    campaigns-table-section.tsx
    lazy-mount.tsx
    meta-ad-status.ts
    MetaCapiSettingsModal.tsx   (mantido)
  _sheet/
    paid-media-sheet-context.tsx
    PaidMediaDetailSheet.tsx
    CampaignSheetBody.tsx
    AdSheetBody.tsx
    daily-performance-chart.tsx
lib/paid-media/format.ts        (getDelta, formatRoas, rótulos de status/objetivo/CTA)
```

## Incidentais

- Listar Meta Ads em `/dashboard/integrations`. Hoje só dá para conectar pelo estado vazio da página.
- Remover o código morto de `marketing-page.tsx` (`today`, `dayjsSubtract`).
- Remover `spend-series/route.ts` quando o `series` estiver no ar. Não há outros consumidores (conferir com grep antes).

## Entrega

Quatro PRs, cada um utilizável sozinho:

1. **Dados:** módulos de `lib/integrations/meta/ads/`, rotas novas e reescritas e hooks. A página atual continua funcionando nas rotas mantidas.
2. **Catálogo:** schema e migration de `media_ads`, sincronização, cron, gatilhos no OAuth e no botão, e a rota `library` lendo do banco.
3. **Página:** cabeçalho, resumo, grupos, ranking, distribuição, funil, recortes, biblioteca e campanhas.
4. **Painel lateral:** campanha e anúncio; remove o `MetaAdDetailModal`.

## Testes

- `action-metrics.test.ts` (porte), com um caso de compras repetidas em três famílias que deve contar uma vez.
- `mappers`: `aggregateRichMetrics` recalcula CTR, CPC e CPL a partir das somas.
- `comparison`: regras de `getDelta` e merge por id com entidade presente em só um período.
- `catalog-sync`: escolha do modo, histórico de nomes e a garantia de que uma sincronização truncada não marca removidos.
- Validação manual com uma conta real: totais da página batendo com o Gerenciador no mesmo período e com a mesma atribuição.

## Riscos

- **Limite de chamadas da Meta (BUC).** A página faz muito mais chamadas que hoje. As mitigações são as do Control: montagem tardia, deduplicação por chave, painel reaproveitando a cache e enriquecimentos que falham sem derrubar o bloco. O banco agora tira do caminho a biblioteca sem métricas, os nomes e status das campanhas e os criativos. Se ainda assim aparecer `429`, o próximo passo é um cache curto no servidor por `(integração, nível, período)`.
- **Status defasado.** O catálogo pode ficar até 6h atrás para status e nomes. Isso é sinalizado na UI, e a sincronização manual resolve.
- **Contas grandes.** Acima de 10 mil anúncios, o catálogo trunca e não marca removidos; isso fica registrado em `configuracao.catalogo.truncado`.
