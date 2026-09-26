# Agente desktop — impressão (plano)

Plano de arquitetura e implementação do primeiro periférico do `recompra-local-agent` (repositório separado): impressoras. Constrói sobre a fundação de acesso externo (`access-foundation-implementation.md`) — o agent é um principal `AGENTE_DESKTOP` do cliente `RECOMPRA_LOCAL_AGENT`, com scopes `desktop-agent:*`.

## Escopo

Casos de uso atendidos:

1. **Cupom não fiscal de venda** — demanda de food-services, em especial pedidos de delivery. O objetivo final é impressão automática em novos pedidos; **o wiring em vendas/delivery e sua configuração ficam fora deste plano** — este plano entrega a fila e o `enqueuePrintJob()` que esse wiring chamará.
2. **Etiquetas de produção/lote.**
3. **DANFE de NFC-e e eventualmente NF-e** — apenas a entrega ao papel; a emissão fiscal já existe no CRM e nada de lógica fiscal entra no agent.

Múltiplas impressoras por organização/agent, com roteamento por finalidade.

Fora de escopo: pagamentos (pin pad/TEF, módulo reservado no agent), wiring automático de vendas, configuração de auto-impressão por organização.

## Estado do protótipo do agent (o que aproveita, o que morre)

O `recompra-local-agent` (Electron + TypeScript + Vite + React, Windows-first) tem um protótipo que **antecede a fundação de acesso**:

- **Morre**: pareamento via `POST /api/local-agents/pair` (nunca existiu no CRM) → substituído pelo enrollment da fundação (`/api/access/enrollments/consume`, token `rcm_` em `safeStorage`).
- **Morre**: recebimento do job completo via WebSocket (`print.job` com payload) → o WS vira canal de nudge (ver decisões).
- **Aproveita quase inteiro**: o módulo `printing/printers.ts` — impressão HTML via janela oculta + driver do SO (com fallbacks), ZPL via TCP 9100 para térmicas de rede, teste de impressão. O shape `{jobId, format: HTML|PDF|ZPL, payload, printerName}` é exatamente o que o CRM produzirá.
- **Aproveita a estrutura**: `AgentWebSocketClient` (reconexão, ping, máquina de estados) vira o cliente do canal de nudge; falta backoff exponencial de reconexão.

## Decisões de arquitetura

### 1. Fila durável no Postgres; WebSocket como wake-up; HTTP como caminho de verdade

O CRM é a fonte da verdade (diretriz do próprio AGENTS.md do agent). O coração é a tabela `print_jobs`; o transporte só acorda o agent.

A Vercel suporta WebSocket em Functions (no Next.js via `experimental_upgradeWebSocket()` do `@vercel/functions`), mas a conexão é **efêmera por design**: fecha no limite de duração da function e a cada deploy, e reconexões podem cair em outra instância. Além disso, a instância que segura o socket não é a que processa o `POST` que enfileira o job — não há memória compartilhada. Logo o socket não pode ser canal de correção; é otimização de latência:

```
enqueue (venda/delivery/manual)        agent desktop
      │                                     ▲
      ▼                                     │ 3. nudge "tem job" (WS, sem payload)
  print_jobs (Postgres) ◄───── 2. poll interno da instância WS (~2s,
      ▲                          só p/ orgs com socket conectado)
      │ 4. POST claim (HTTP, atômico + lease)
      │ 5. imprime (driver SO / ZPL TCP)
      │ 6. PATCH report (HTTP, ack explícito)
      └───────────────────────── agent
```

- O nudge não carrega o job → não existe problema de garantia de entrega no WS. Perdeu o nudge, o fallback pega.
- **Fallback integral por polling HTTP** (15–30s): sem socket (WS caiu, deploy, regressão da API experimental), o sistema continua correto, só mais lento. Latência com WS: ~2–3s do enqueue ao papel; sem WS: até o intervalo de polling.
- Por que não entregar o job pelo socket: exigiria ack de entrega, dedupe de reenvio e lease semantics por mensagem — reimplementando o que o claim HTTP resolve com request/response atômico.

Premissas de infra (confirmadas): o deploy já roda em **Fluid compute** (pré-requisito de WS) e as functions já usam por padrão a duração máxima do plano — **não é necessário `maxDuration` explícito** na rota WS. O agent trata o fechamento periódico como rotina (reconexão com backoff).

### 2. Renderização no servidor; agent burro

O CRM renderiza o conteúdo final (HTML do cupom, ZPL da etiqueta, URL do PDF da DANFE); o agent só entrega ao driver. Razões: sem regra de negócio no agent (diretriz do AGENTS.md), templates evoluem sem release/instalador no Windows do cliente, e o código de impressão existente já consome exatamente isso. O job guarda também os `dados` estruturados (snapshot) para reimpressão e debug.

### 3. Roteamento por finalidade, com late binding

Cada impressora declara quais **finalidades** atende (`CUPOM_VENDA`, `ETIQUETA_LOTE`, `DANFE_NFCE`, `DANFE_NFE`). O job nasce com finalidade e, em regra, sem impressora fixa — no claim, o agent leva jobs cuja finalidade casa com alguma impressora **ativa e disponível** dele (e cuja `loja_id`, se houver, casa com a do principal). Troca de impressora/agent não órfã jobs pendentes; o claim atômico resolve concorrência entre múltiplos agents. Reimpressão manual pode fixar `impressora_id` como override.

### 4. Identidade e permissões via fundação de acesso

Enrollment padrão (código no dashboard → consume → token `rcm_`). Scopes:

| Scope                             | Uso                                        |
| --------------------------------- | ------------------------------------------ |
| `desktop-agent:configuration:read`| bootstrap (org, impressoras, intervalos)   |
| `desktop-agent:printers:sync`     | **novo** — upsert das impressoras do SO    |
| `desktop-agent:print-jobs:read`   | consulta de jobs (diagnóstico)             |
| `desktop-agent:print-jobs:update` | claim + report                             |

O scope novo entra no enum + teto do catálogo (`RECOMPRA_LOCAL_AGENT`); agents já ativados o recebem pela UI de permissões por scope.

## Modelo de dados

Duas tabelas novas (prefixo `ampmais_`, convenções do repo). `finalidade`, `formato`, `driver` e `status` são `varchar` + `z.enum` no app (padrão de `access_events.tipo` — extensível sem migração de enum no Postgres).

### `agent_printers`

Impressoras sincronizadas pelo agent, gerenciadas no dashboard.

| Coluna                 | Tipo/Notas                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| `id`                   | uuid                                                                     |
| `organizacao_id`       | FK organizations, NOT NULL                                               |
| `principal_id`         | FK access_principals (o agent dono), NOT NULL                            |
| `nome_sistema`         | nome no SO; **unique por `(principal_id, nome_sistema)`**                |
| `apelido`              | editável no dashboard                                                    |
| `driver`               | `DRIVER_SO` \| `ZPL_REDE`                                                |
| `finalidades`          | jsonb `string[]` — roteamento                                            |
| `ativa`                | boolean, controle do dashboard                                           |
| `disponivel`           | boolean, reportado no sync (sumiu do SO → false)                         |
| `metadados`            | jsonb — `tcpHost`/`tcpPort` (ZPL rede), `larguraPapel` (58/80mm) etc.    |
| `ultima_sincronizacao` | timestamp                                                                |
| `data_insercao` / `data_atualizacao` | timestamps padrão                                          |

### `print_jobs`

A fila durável. Lease espelha o padrão de `poi_transaction_idempotency_requests`.

| Coluna                  | Tipo/Notas                                                                     |
| ----------------------- | ------------------------------------------------------------------------------ |
| `id`                    | uuid                                                                            |
| `organizacao_id`        | FK organizations, NOT NULL                                                      |
| `loja_id`               | nullable — agent só claima jobs da sua loja ou sem loja                         |
| `finalidade`            | `CUPOM_VENDA` \| `ETIQUETA_LOTE` \| `DANFE_NFCE` \| `DANFE_NFE`                 |
| `formato`               | `HTML` \| `PDF_URL` \| `ZPL`                                                    |
| `conteudo`              | text nullable (HTML/ZPL renderizado)                                            |
| `conteudo_url`          | nullable (PDF da DANFE)                                                         |
| `copias`                | int default 1                                                                   |
| `dados`                 | jsonb — snapshot estruturado p/ reimpressão/debug                               |
| `origem_tipo` / `origem_id` | polimórfico: `VENDA`, `LOTE`, `NOTA_FISCAL`, `MANUAL`                       |
| `chave_idempotencia`    | **unique `(organizacao_id, chave_idempotencia)`** — auto-print nunca duplica    |
| `status`                | `PENDENTE` → `PROCESSANDO` → `IMPRESSO` \| `ERRO` \| `CANCELADO` \| `EXPIRADO`  |
| `tentativa_id`          | uuid da tentativa vigente (guarda de posse do lease)                            |
| `lease_expira_em`       | timestamp nullable                                                              |
| `numero_tentativas`     | int default 0                                                                   |
| `impressora_id`         | FK agent_printers nullable — override de reimpressão, ou carimbada no claim     |
| `principal_id`          | FK access_principals nullable — quem imprimiu, carimbado no claim               |
| `erro`                  | text nullable                                                                   |
| `expira_em`             | TTL por finalidade (ver ciclo de vida)                                          |
| `solicitado_por_id`     | FK users nullable (jobs manuais/reimpressão)                                    |
| `data_insercao` / `data_atualizacao` / `data_conclusao` | timestamps                                      |

Índices: `(organizacao_id, status, data_insercao)` para claim e listagem.

## Ciclo de vida do job

- **Enqueue**: `enqueuePrintJob()` renderiza o conteúdo (template por finalidade), define `expira_em` e insere `PENDENTE`. Conflito na `chave_idempotencia` → retorna o job existente (no-op).
- **TTL por finalidade**: cupom ~30 min (imprimir com horas de atraso é pior que não imprimir); etiqueta e DANFE ~24h. Claim ignora expirados.
- **Claim**: transição atômica `PENDENTE → PROCESSANDO` (ou `PROCESSANDO` com lease vencida → re-claim) com `tentativa_id` novo, `lease_expira_em` (~2 min) e `numero_tentativas++`. Carimba `principal_id` e `impressora_id` resolvida.
- **Report**: `PATCH` com `tentativa_id` — sem posse do lease, o report é rejeitado (a tentativa foi tomada por outra). `IMPRESSO` ou `ERRO` + mensagem.
- **Retentativas**: lease vencida sem report → job volta a ser claimável. **Máximo 2 tentativas automáticas** — o modo de falha perigoso é *imprimiu mas não reportou* (reimprimir cupom em dobro no balcão); acima disso vira `ERRO` e reimpressão é decisão humana no dashboard.
- **Expiração/purga**: cron diário marca `EXPIRADO` e purga concluídos com mais de 90 dias.

## Endpoints

### Lado agent (Bearer `rcm_` + scope)

| Endpoint                                   | Scope                              | Função                                                             |
| ------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| `GET /api/desktop-agent/configuration`     | `desktop-agent:configuration:read` | bootstrap: org, impressoras + finalidades, intervalos de polling   |
| `POST /api/desktop-agent/printers/sync`    | `desktop-agent:printers:sync`      | upsert por `nome_sistema`; ausentes → `disponivel=false`           |
| `POST /api/desktop-agent/print-jobs/claim` | `desktop-agent:print-jobs:update`  | claim atômico de até N jobs roteáveis a este agent                 |
| `PATCH /api/desktop-agent/print-jobs`      | `desktop-agent:print-jobs:update`  | report `IMPRESSO`/`ERRO`, guardado por `tentativa_id`              |
| `GET /api/desktop-agent/print-jobs`        | `desktop-agent:print-jobs:read`    | consulta/diagnóstico                                               |
| `GET /api/desktop-agent/ws`                | autenticação (sem scope extra)     | upgrade WebSocket — canal de nudge                                 |

### Lado dashboard (sessão, permissão `empresa.*`)

- Gestão de impressoras: apelido, finalidades, ativa (`empresa.editar`); listagem (`empresa.visualizar`). UI junto da aba DISPOSITIVOS de Configurações.
- Listagem de jobs para troubleshooting + `POST` de job manual/reimpressão (`empresa.editar`).

### Interno

`lib/desktop-agent/print-jobs.ts` → `enqueuePrintJob({ organizacaoId, lojaId?, finalidade, dados, chaveIdempotencia, impressoraId?, solicitadoPorId? })`, renderização em `lib/desktop-agent/templates/`. É o ponto de entrada do futuro wiring de vendas/delivery.

## Canal WebSocket (nudge)

- Rota `GET /api/desktop-agent/ws` com `experimental_upgradeWebSocket()` do `@vercel/functions` (verificar necessidade de bump da versão — o repo já usa o pacote para `waitUntil`).
- O upgrade é um GET normal: `authenticateExternalRequest` roda no handshake sem adaptação (o Bearer `rcm_` viaja no header, como o protótipo do agent já faz).
- A instância WS mantém um poll interno (~2s) sobre `print_jobs` **apenas para as orgs dos sockets que ela segura** — uma query indexada por instância. Achou `PENDENTE` roteável → nudge sem payload.
- Ping do agent pelo socket alimenta `ultimo_acesso` do principal (substitui o heartbeat HTTP enquanto conectado).
- A rota fica **fora do `appApiHandler`** (retorna a response de upgrade, não `NextResponse.json`) — desvio consciente do padrão, documentado no código.
- Fechamentos periódicos (limite de duração da function, deploys) são rotina: o agent reconecta com backoff exponencial. Não usamos `maxDuration` explícito — as functions já usam o teto do plano por padrão.
- **Desligado por padrão desde 2026-09** (`DESKTOP_AGENT_WS_ENABLED=true` religa). A premissa "Fluid cobra CPU ativa; barato" da tabela de riscos estava errada para memória: a function fica provisionada (2 GB) enquanto o socket está aberto, e o agent reabre assim que a Vercel fecha aos 300 s — a rota respondia por ~75% das GB-hora do projeto. Sem o socket, a latência é a cadência de polling servida por `/configuration` (5 s por padrão, `DESKTOP_AGENT_POLLING_SEGUNDOS`). O substituto de baixa latência fora da Vercel (Supabase Realtime via protocolo Phoenix no `websocket.zig` do agent, ou polling adaptativo) é decisão pendente.

## Fases de implementação

1. **Schema + scopes (CRM)** — `agent_printers`, `print_jobs`, scope `desktop-agent:printers:sync` no enum + catálogo, `db:push` + seed.
2. **Rotas HTTP agent-facing (CRM)** — configuration, printers/sync, claim, report, list + `enqueuePrintJob` + templates (cupom HTML, etiqueta HTML/ZPL; DANFE entra como `PDF_URL` quando o wiring fiscal chegar).
3. **Canal WS (CRM)** — rota de nudge sobre a base já funcional da fase 2.
4. **Dashboard (CRM)** — impressoras (apelido, finalidades, ativa), lista de jobs, reimpressão manual.
5. **Cron `print-jobs-maintenance` (CRM)** — expiração diária + purga de 90 dias.
6. **Agent (repo `recompra-local-agent`)** — enrollment via fundação, poller híbrido (nudge WS + fallback polling), sync de impressoras, report; atualizar o AGENTS.md de lá (WebSocket deixa de ser transporte obrigatório e vira otimização).

O lado CRM (fases 1–5) é testável por completo antes de tocar o Electron: os endpoints aceitam qualquer cliente com credencial de teste.

## Riscos e decisões conscientes

| Risco/Decisão | Tratamento |
| --- | --- |
| `experimental_upgradeWebSocket` é experimental | Confinada ao nudge; regressão degrada para polling, nunca quebra correção |
| Impressão silenciosa de PDF no Electron não é nativa como HTML | Formato `PDF_URL` entra no modelo desde já; a entrega pode exigir `pdf-to-printer`/SumatraPDF embutido no agent — risco isolado lá |
| Conexões 24/7 × custo | Fluid cobra CPU ativa; barato na escala atual (modelo FDE). Se um dia forem centenas de agents, desligar a rota WS degrada para polling puro |
| Dupla impressão (imprimiu mas não reportou) | Máximo 2 tentativas automáticas; acima disso, decisão humana |
| Job sem impressora roteável | Fica `PENDENTE` até expirar; dashboard mostra o motivo (nenhuma impressora ativa atende à finalidade) |

## Perguntas em aberto

- Config de auto-impressão por organização (quais eventos disparam `CUPOM_VENDA`) — pertence ao plano do wiring de vendas/delivery.
- Layout definitivo dos templates de cupom/etiqueta (largura 58 vs 80mm, logo da organização) — decidir na fase 2 com um food-service piloto.
- Reimpressão de DANFE direto do módulo fiscal do dashboard — natural, mas fora deste escopo.
