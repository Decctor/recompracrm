# Agentes de IA via MCP — plano e estado

Expõe o RecompraCRM a agentes de IA (Claude, ChatGPT, os agentes do Syncroniza Control, Cursor)
através de um servidor **MCP** — o protocolo que todos esses clientes falam nativamente.

**Estado: fase 1 completa.** Doze ferramentas de leitura, um recurso, dois prompts, os dois modos
de ator e a tela de Conexões de IA, sobre a fundação de acesso existente
(`docs/dev-planning/access-foundation-implementation.md`). Falta OAuth (fase 2) e as ferramentas de
escrita (fase 3).

---

## 1. Por que MCP, e por que aqui dentro

MCP é a camada; `agent-plugins.org` é formato de **empacotamento** (embrulha um servidor MCP mais
skills num `plugin.json` instalável) e `eve.dev` é framework para **construir** agentes — o lado
consumidor. Nenhum dos dois substitui o servidor; os dois entram depois dele, se entrarem.

O servidor vive neste repositório, e não num serviço à parte, porque as ferramentas precisam
chamar as funções de serviço direto — sem uma volta HTTP na própria aplicação — e porque as
guardas de tenancy já moram aqui.

**Este registro não se confunde com `lib/ai/tools/`.** Aquele serve o agente de WhatsApp falando
com o **cliente final** da loja; este serve o **lojista** e o time da plataforma. Públicos
diferentes, envelopes de segurança diferentes. O que compartilham são os primitivos de baixo nível
(`lib/search`, `lib/products/*`, `lib/sales/*`), nunca a definição de ferramenta.

---

## 2. Modo do ator — a decisão central

O modo é propriedade do **principal autenticado**, resolvido na conexão. Nunca é argumento de
ferramenta, nunca é inferido do prompt, e não existe em lugar nenhum do protocolo onde o modelo
pudesse afirmá-lo.

| Modo | Principal | Enxerga |
| --- | --- | --- |
| `ORG` | `CONTA_SERVICO` com `organizacaoId` | Uma organização. O id vem do contexto para todo `where`. |
| `PLATAFORMA` | `CONTA_PLATAFORMA`, sem organização | Todas — mas `organizacaoId` é **obrigatório** em cada chamada. |

Dois mecanismos sustentam isso:

1. **`tools/list` é filtrado por modo ∩ scopes concedidos.** Uma ferramenta que o ator não pode
   chamar não aparece. Modelos lidam bem com ferramenta ausente e mal com ferramenta proibida —
   repetem a chamada, reformulam, gastam o turno. O 403 continua existindo em `findToolForActor`
   como segunda barreira, para cliente com lista em cache.
2. **`resolveOrganizationScope()` é o único lugar onde a organização é decidida.** Nenhuma
   ferramenta lê `input.organizacaoId` direto. Existe exatamente um ponto onde a tenancy pode dar
   errado, em vez de um por ferramenta — e é por isso que `platform` reaproveita as ferramentas de
   org em vez de ter gêmeas administrativas.

Em `PLATAFORMA`, omitir `organizacaoId` **falha** em vez de agregar a base inteira: modelo omite
argumento opcional o tempo todo, e uma varredura de todas as organizações por omissão seria o pior
default possível. A agregação cross-org chega com as ferramentas `platform_*` (fase 1).

---

## 3. O que já está no ar

### Acesso

- `AccessScopeEnum` ganhou `agent:results:read`, `agent:sales:read`, `agent:clients:read`,
  `agent:clients:pii`, `agent:products:read`, `agent:campaigns:read` (grupo `AGENTE_IA`) e
  `platform:organizations:read`, `platform:metrics:read` (grupo `PLATAFORMA`) — todos com rótulos
  em `ACCESS_SCOPE_CATALOG`, que é o que a tela de permissões vai renderizar.
- Os scopes `platform:*` nunca entram no teto de uma aplicação de lojista. **Modo e scope são
  exigências independentes**: um principal de plataforma sem `platform:organizations:read` não
  enxerga as ferramentas `platform_*`, e um principal de organização com o scope também não.
- `AccessPrincipalTypeEnum` ganhou `CONTA_PLATAFORMA`.
- `access_principals.organizacao_id` virou nulo **só** para esse tipo, com CHECK constraint. A
  garantia saiu do `NOT NULL` e virou uma exceção nomeada, em vez de afrouxar.
- São **dois arquivos de migração, e a ordem importa**: `0084` cria o valor de enum e `0085` usa
  esse valor na CHECK. `ALTER TYPE ... ADD VALUE` não pode ser consumido na mesma transação que o
  criou, e `scripts/apply-sql-migration.ts` aplica cada arquivo dentro de uma transação — juntos,
  eles falhariam com *unsafe use of new value of enum type*.
- `authenticateExternalRequest` foi dividida: `verifyAccessCredentialFromRequest` verifica a
  credencial e devolve a organização possivelmente nula; o wrapper antigo exige organização e
  recusa credencial de plataforma. As oito rotas de dispositivo não mudaram uma linha.
- Aplicações no catálogo: `AGENT_CLAUDE`, `AGENT_CHATGPT`, `AGENT_CONTROL`. Uma por aplicação, e
  não um "MCP" genérico — é o que permite revogar o Claude de uma organização sem derrubar o
  ChatGPT, e o que faz a auditoria dizer quem consultou. Só `AGENT_CONTROL` tem `agent:clients:pii`
  no teto: é sistema nosso, sob nosso contrato de dados.

### Ferramentas (`lib/agent-tools/`)

| Ferramenta | Modo | Scope | Reaproveita |
| --- | --- | --- | --- |
| `get_commercial_results` | ambos | `agent:results:read` | `lib/sales/overall-stats` |
| `get_sales` | ambos | `agent:sales:read` | tabela `sales` |
| `search_clients` | ambos | `agent:clients:read` | `lib/search` + tabela `clients` |
| `get_client_context` | ambos | `agent:clients:read` | `lib/clients/context` |
| `list_segments` | ambos | `agent:campaigns:read` | `clients.analiseRFMTitulo` + `audiences` |
| `search_products` | ambos | `agent:products:read` | `lib/search`, `lib/products/sales-channels*` |
| `get_product_performance` | ambos | `agent:products:read` | `lib/products/ranking` |
| `list_campaigns` | ambos | `agent:campaigns:read` | tabela `campaigns` |
| `get_campaign_results` | ambos | `agent:campaigns:read` | `lib/campaigns/stats` |
| `get_chat_analytics` | ambos | `agent:chats:read` | `lib/chats/stats/overview` + `lib/chats/stats/agents` |
| `list_chat_attendances` | ambos | `agent:chats:read` | `chat_assignments` + janela de mensagens |
| `search_chats` | ambos | `agent:chats:read` | `chats` + atendimento corrente (`currentChatAssignmentJoin`) |
| `get_chat_messages` | ambos | `agent:chats:read` | `chat_messages` |
| `search_chat_messages` | ambos | `agent:chats:read` | `lib/search` (`unaccent_immutable`) |
| `platform_search_organizations` | plataforma | `platform:organizations:read` | `organizations` + `max(sales.dataVenda)` |
| `platform_get_organization_health` | plataforma | `platform:organizations:read` | assinatura + uso agregado |
| `platform_get_aggregate_metrics` | plataforma | `platform:metrics:read` | agregados da base |

Quatro módulos foram **extraídos, não reescritos**, para que painel e agente leiam as mesmas
funções — `lib/sales/overall-stats`, `lib/clients/context`, `lib/campaigns/stats` e
`lib/products/ranking`. Cada extração trocou `{ input, session }` por `{ input, organizacaoId }`;
as rotas passaram a derivar a organização e delegar. Número que não bate entre o painel e o agente
vale menos que número nenhum.

As estatísticas de atendimento seguiram o mesmo caminho: `lib/chats/stats/overview` e
`lib/chats/stats/agents` saíram de `GET /api/chats/stats/{overview,agents}`, e `get_chat_analytics`
devolve os números da tela Atendimentos > Estatísticas, com as mesmas coortes.

Em modo plataforma as ferramentas de organização são **as mesmas**, com `organizacaoId`
obrigatório. Não existem gêmeas administrativas: é o que `resolveOrganizationScope` compra.

Duas disciplinas valem para toda ferramenta:

- **Campo ausente, nunca nulo** (`sanitizeForModel`). `preco: null` chega ao modelo como zero, e o
  zero inventado é a origem do bug em que o agente nega um produto que existe. Vale também para os
  `NaN` que as agregações produzem em período sem venda — `JSON.stringify` os serializaria como
  `null`, ou seja, exatamente o zero que se queria evitar.
- **Toda listagem devolve `total` e `truncado`.** Sem isso o modelo trata as 20 linhas que viu como
  o conjunto completo.

PII de cliente (telefone, e-mail, CPF/CNPJ) sai mascarada sem `agent:clients:pii`. Um agente que
responde "quantos clientes em risco?" não precisa de telefone nenhum.

**Canais de venda.** `search_products` devolve `precoVendaBase`, e não `precoVenda`, porque o preço
praticado depende do canal (`product_channel_settings.preco_venda`) — ver
`docs/product-sales-channels-design.md`. O nome do campo e a descrição da ferramenta dizem isso ao
modelo, para ele não cotar em nome da loja um preço que não vale no canal do cliente. O filtro
padrão exige `ativo` **e** `vendavel`, os dois gates independentes de `resolveChannelAvailability`.
`search_products` aceita `canal` (POS, SHOP, COMANDA) e então devolve também `precoVendaEfetivo` e
`disponivelNoCanal`, resolvidos por `channelNodePrice`/`resolveChannelAvailability` e com o
catálogo do canal já aplicado no filtro. iFood fica de fora do argumento porque tem um canal por
loja (`ref_externo` = merchant): "IFOOD" sozinho seria ambíguo numa organização com mais de uma.

### Protocolo (`lib/mcp/`, `app/api/mcp/route.ts`)

Streamable HTTP **stateless**: cada POST carrega uma mensagem JSON-RPC e volta uma resposta JSON
única — o que a especificação permite explicitamente para servidor sem streaming. Sem SSE, sem
`Mcp-Session-Id`; a identidade vem do Bearer a cada requisição.

Escrito à mão em vez do `@modelcontextprotocol/sdk`: o transporte do SDK espera `req`/`res` do Node
e não encaixa em route handler do App Router, e sem streaming nem sessão ele traria dependência sem
capacidade. **O dia em que este servidor precisar de notificação servidor→cliente, amostragem ou
progresso de operação longa, a conta inverte — adote o SDK em vez de crescer `lib/mcp/protocol.ts`.**

`lib/mcp/json-schema.ts` converte os `inputSchema` de Zod para JSON Schema, para o Zod seguir como
fonte única. É deliberadamente parcial: objeto de escalares, enums e arrays, com `.optional()`,
`.nullable()`, `.default()` e `.describe()`. Fora disso vira `{}` — a validação do Zod continua
correta, mas o modelo perde a dica. **Precisou de união ou objeto profundo? Troque por
`zod-to-json-schema` em vez de esticar o subconjunto.**

Além de `tools`, o servidor anuncia `resources` e `prompts`:

- **Recurso** `recompracrm://organization/current` — identidade da organização, moeda, fuso e quais
  módulos estão habilitados. Existe só em modo ORG: em PLATAFORMA não há "organização atual", e
  forjar uma escolha seria pior que não oferecer. Módulo desligado não é "sem dados" — é uma
  sugestão que o agente não deve fazer.
- **Prompts** `revisao-comercial` e `clientes-em-risco` — roteiros que fixam a **ordem** das
  chamadas e o formato da resposta. Sem eles o modelo improvisa a sequência, chama
  `get_campaign_results` sem ter o id, e devolve tabela de números crus onde o lojista queria saber
  o que fazer na segunda. São o mesmo artefato que vira Agent Skill no bundle da fase 3.

Um desvio conhecido: a especificação manda responder 400 a um `MCP-Protocol-Version` desconhecido;
aqui o header é aceito e a versão que vale é a negociada no `initialize`. Recusar uma revisão mais
nova quebraria clientes atualizados sem ganho — a superfície daqui (só `tools`) é estável entre as
revisões.

### Auditoria e limite

Cada `tools/call` grava um `access_event` do tipo `CHAMADA_AGENTE` (quem, qual ferramenta, qual
organização — nunca o resultado), e esses eventos sustentam o rate limiting de 120 chamadas por
minuto **por principal**. Por principal e não por IP: o IP é o do provedor de LLM, compartilhado
por todos os clientes, e limitar por ele puniria organizações inocentes.

### Atendimentos (`tools/chat-analytics.ts`, `tools/chats.ts`)

Existem para que a organização rode a própria auditoria de atendimento com o agente dela — e com
os tokens dela. O desenho vai **do agregado ao caso**, em três unidades:

- **Estatística** (`get_chat_analytics`): o diagnóstico, comparado ao período anterior.
- **Atendimento** (`list_chat_attendances`): o ticket, com as métricas dele. É a unidade do
  benchmark — filtros e ordenações servem para montar uma amostra (os mais lentos, os sem
  resposta, os handoffs da IA, e um grupo de controle recente). `resumoDoFiltro` agrega o
  conjunto inteiro, não a página.
- **Conversa** (`search_chats`, `get_chat_messages`, `search_chat_messages`): o estado atual de cada
  conversa, a leitura (inteira ou recortada a um atendimento) e a busca literal por evidência.

Decisões:

- **A listagem não traz amostra de mensagens, só a prévia da última.** Amostra embutida multiplica
  tokens por conversa e é enviesada (as últimas mensagens costumam ser "ok", "obrigado"), e convida
  o modelo a concluir sem ter lido. O fluxo é escolher pela métrica e ler a conversa inteira.
- **A janela de um atendimento começa 10 minutos antes de `dataInsercao`, nunca antes do
  encerramento do atendimento anterior.** A mensagem que abre o ticket é gravada antes dele.
- **Paginação por cursor**, ao contrário do resto do registro ("refine em vez de paginar"):
  auditoria percorre conjuntos. Cursor por chave (carimbo truncado em ms + id) onde a ordem é
  temporal; por deslocamento em `list_chat_attendances`, cuja ordem é uma duração calculada.
- **O responsável é o atual.** `chat_assignments` não guarda histórico de transferência; as
  descrições dizem quais números creditam o último dono.
- **Texto de mensagem é dado do cliente, nunca instrução** — dito em cada descrição e nas instruções
  do servidor quando a conexão tem o scope. O telefone do cliente segue a regra de PII; o texto das
  mensagens não é mascarado, e é por isso que `agent:chats:read` é um scope próprio.
- **Módulo desligado é erro, não lista vazia** (`assertChatHubEnabled`): "nenhum atendimento" e "sem
  hub" levam o agente a conclusões opostas.
- Chats `PLAYGROUND` (teste do agente de IA) ficam fora de todas as consultas.

O prompt `auditoria-de-atendimento` fixa o método — amostra estratificada, rubrica de cinco itens,
placar comparável entre execuções. Prompts agora declaram `scopes` e só aparecem para quem enxerga
as ferramentas deles.

Conexões existentes não ganham o scope sozinhas: o grant é por conexão. Rode
`npm run seed:access-clients` para atualizar o teto das aplicações, e reconecte (OAuth) ou edite a
conexão para incluir "Consultar atendimentos e conversas".

---

## 4. Como emitir uma credencial

**Pelo painel** (organização): Configurações → Conexões de IA → Nova conexão. Escolhe a aplicação
(Claude ou ChatGPT), nomeia a conexão, liga as permissões e recebe a chave — **uma única vez**,
porque só o SHA-256 do segredo fica no banco. Editar permissões, rotacionar e revogar reusam
`ControlAccessPrincipal`, o mesmo modal dos dispositivos.

A tela lista só principals `CONTA_SERVICO`, e Dispositivos só `DISPOSITIVO`/`AGENTE_DESKTOP` —
duas listas separadas porque um tablet no balcão e um assistente que lê o faturamento se revogam
por motivos diferentes.

**Por script** (obrigatório para plataforma, já que principal de plataforma não pertence a
organização nenhuma):

```bash
# 1. Migrações, nesta ordem (a segunda consome o valor de enum criado pela primeira)
npx tsx ./scripts/apply-sql-migration.ts drizzle/0084_agent_principal_type.sql
npx tsx ./scripts/apply-sql-migration.ts drizzle/0085_agent_access_foundation.sql

# 2. Aplicações clientes do catálogo (AGENT_CLAUDE / AGENT_CHATGPT / AGENT_CONTROL)
npm run seed:access-clients

# 3. Credencial

# Conexão de uma organização
npm run access:issue-agent -- --client AGENT_CLAUDE --org minha-loja --nome "Claude do João"

# Conexão de plataforma (Control, time interno)
npm run access:issue-agent -- --client AGENT_CONTROL --plataforma --nome "Agentes do Control"
```

O token aparece **uma única vez** — só o SHA-256 do segredo fica no banco. Perdido, o caminho é
rotacionar (`rotatePrincipalCredential`), não recuperar.

No cliente MCP: endpoint `https://<dominio>/api/mcp`, header `Authorization: Bearer <token>`.

No Control, via `@ai-sdk/mcp` (já no `package.json` de lá):

```ts
const recompra = await createMCPClient({
  transport: { type: "http", url: `${env.RECOMPRACRM_URL}/api/mcp`,
    headers: { Authorization: `Bearer ${env.RECOMPRACRM_PLATFORM_KEY}` } },
});
const tools = { ...(await recompra.tools()), ...controlTools };
```

O ganho real aparece com os dois toolsets no mesmo agente: *"quais oportunidades em negociação
pertencem a organizações sem venda há 30 dias?"* cruza o CRM do Control com a saúde da conta no
RecompraCRM, e não existe nenhuma integração entre os dois sistemas que já permitisse isso.

---

## 5. Testes

`npm run test:agent-tools` — 56 casos, sem banco: resolvedor de tenancy, filtragem do registro por
modo **e** scope (incluindo o caso que não pode regredir — scope de plataforma concedido a um ator
ORG não revela ferramenta nenhuma), serialização (nulo/NaN), default de período, conversor de JSON
Schema e o protocolo MCP inteiro (`initialize`, `tools/list`, `resources/*`, `prompts/*`, `ping`,
notificação, método desconhecido).

`npm run test:agent-tools:db -- --org <slug>` — executa **cada ferramenta contra o banco real** e
reporta ok/pulado/falha por ferramenta. É o que cobre o que os testes acima não cobrem: se a
consulta roda. Passo obrigatório antes de apontar um cliente MCP para um ambiente novo. Somente
leitura. Adicione `--plataforma` para exercitar o modo de plataforma.

---

## 6. Próximas fases

Em aberto, por decisão e não por esquecimento: `get_campaign_results` atende **uma** campanha
por chamada. A visão "todas as campanhas do período" exigiria N execuções da mesma agregação e vale
uma consulta própria, não um laço — o modelo deve chamar `list_campaigns` primeiro.

**Fase 2 — OAuth 2.1 como resource server.** PRM (RFC 9728), authorization code com PKCE, resource
indicators (RFC 8707), CIMD. É o que transforma isto de recurso de desenvolvedor em algo que se
coloca na frente de um lojista, e o que habilita listagem nos diretórios de conector. O
`WWW-Authenticate` do endpoint já aponta para onde os metadados vão morar.

**Fase 3 — escrita e distribuição.** `create_campaign_draft` (só `RASCUNHO` — o envio continua ação
humana no painel), `upsert_client`, `log_interaction`, todas atrás de `action_approval_requests`.
Depois o bundle Agent Plugins para instalação em um passo no Cursor, Claude Code e Copilot.

---

## 7. Decisões tomadas, para não serem re-litigadas

- **Nomes de ferramenta em inglês, argumentos e descrições em português.** É a regra do
  `CLAUDE.md` aplicada com honestidade: o nome é código, o argumento viaja como dado, e a descrição
  é lida por um modelo raciocinando sobre um varejo brasileiro.
- **Período padrão: últimos 30 dias**, declarado na descrição de toda ferramenta que aceita
  período. Sem um default explícito, Claude assume "este mês", ChatGPT assume "últimos 7 dias", e o
  lojista recebe dois faturamentos para a mesma pergunta.
- **Teto de 50 linhas por listagem, default 20–25**, sempre com `total`.
- **`organizacaoId` aceita id ou slug** em modo plataforma: o modelo acabou de ler um nome numa
  lista, e um slug é muito mais recuperável para ele que um UUID.
