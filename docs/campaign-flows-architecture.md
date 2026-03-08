# Campaign Flows — Arquitetura de Workflows

## 1. Visao Geral

O Campaign Flows transforma o sistema de campanhas "flat" (1 trigger -> 1 action) em um **motor de workflows visuais** com grafos de nos (nodes) e arestas (edges), suportando:

- **Workflows multi-step**: trigger -> delay -> condition -> action -> delay -> action
- **Multiplas acoes por campanha**: WhatsApp, cashback, notificacao interna (e futuras: email, webhook)
- **3 modos de campanha**: Event-driven, Recorrente (cron), e Unica (one-time blast)
- **Publicos reutilizaveis**: filtros composiveis (RFM, localizacao, idade, top N compradores, etc.)
- **Delays longos**: via Vercel Workflows (`context.sleep()`)
- **Condicoes/branching**: caminhos "sim/nao" baseados em atributos do cliente ou resultado de acoes anteriores

A V1 continua rodando em paralelo — sem migracao destrutiva. O Campaign Flows e um sistema novo e separado.

---

## 2. Data Model

### 2.1. `campaign_flows` — Fluxo de campanha (raiz)

```
campaign_flows
├── id (PK, UUID)
├── organizacao_id (FK -> organizations)
├── titulo (text, NOT NULL)
├── descricao (text)
├── status (enum: RASCUNHO | ATIVO | PAUSADO | ARQUIVADO)
├── tipo (enum: EVENTO | RECORRENTE | UNICA)
│
│   # Configuracao de recorrencia (quando tipo = RECORRENTE)
├── recorrencia_tipo (enum: DIARIO | SEMANAL | MENSAL)
├── recorrencia_intervalo (integer, default 1)        -- a cada N unidades
├── recorrencia_dias_semana (jsonb, ex: [1,3,5])      -- para SEMANAL
├── recorrencia_dias_mes (jsonb, ex: [1,15])           -- para MENSAL
├── recorrencia_bloco_horario (enum: time_blocks)      -- hora de disparo
│
│   # Configuracao de campanha unica (quando tipo = UNICA)
├── unica_data_execucao (timestamp)                    -- quando disparar
├── unica_executada (boolean, default false)            -- ja foi disparada?
│
│   # Atribuicao
├── atribuicao_modelo (text: LAST_TOUCH | FIRST_TOUCH | LINEAR)
├── atribuicao_janela_dias (integer, default 14)
│
│   # Publico-alvo
├── publico_id (FK -> campaign_audiences, nullable)    -- publico reutilizavel
│
│   # Meta
├── autor_id (FK -> users)
├── data_insercao (timestamp, default now())
├── data_atualizacao (timestamp)
```

**Decisoes de design:**
- `tipo` determina como a campanha e ativada (evento externo, cron, ou disparo manual unico)
- `publico_id` referencia um publico reutilizavel; se null, aplica a todos os clientes da org
- O grafo do workflow (nos + arestas) e armazenado separadamente para manter a tabela raiz limpa

---

### 2.2. `campaign_flow_nodes` — Nos do grafo

```
campaign_flow_nodes
├── id (PK, UUID)
├── campanha_id (FK -> campaign_flows, CASCADE)
├── tipo (enum: GATILHO | ACAO | DELAY | CONDICAO | FILTRO)
├── subtipo (text, NOT NULL)          -- tipo especifico (ver secao 3)
├── rotulo (text)                     -- label para exibir no builder
├── configuracao (jsonb, NOT NULL)    -- config especifica por subtipo
│
│   # Posicao no React Flow canvas
├── posicao_x (double precision)
├── posicao_y (double precision)
│
├── data_insercao (timestamp, default now())
```

**Regras:**
- Todo workflow tem exatamente **1 no GATILHO** (o ponto de entrada)
- Campanhas UNICA e RECORRENTE: o GATILHO e implicitamente "inicio do fluxo" (sem evento externo)
- Campanhas EVENTO: o GATILHO define qual evento inicia o workflow

---

### 2.3. `campaign_flow_edges` — Arestas do grafo

```
campaign_flow_edges
├── id (PK, UUID)
├── campanha_id (FK -> campaign_flows, CASCADE)
├── no_origem_id (FK -> campaign_flow_nodes, CASCADE)
├── no_destino_id (FK -> campaign_flow_nodes, CASCADE)
├── condicao_label (text, nullable)   -- "SIM", "NAO", ou null para fluxo linear
├── ordem (integer, default 0)        -- quando um no tem multiplas saidas
├── data_insercao (timestamp, default now())
```

**Regras:**
- Nos CONDICAO sempre tem exatamente 2 arestas de saida: "SIM" e "NAO"
- Nos de ACAO/DELAY podem ter 0 ou 1 aresta de saida (0 = fim do workflow)
- Nos GATILHO tem exatamente 1 aresta de saida

---

### 2.4. `campaign_audiences` — Publicos reutilizaveis

```
campaign_audiences
├── id (PK, UUID)
├── organizacao_id (FK -> organizations, CASCADE)
├── titulo (text, NOT NULL)
├── descricao (text)
├── filtros (jsonb, NOT NULL)         -- arvore de filtros (ver secao 4)
├── autor_id (FK -> users)
├── data_insercao (timestamp, default now())
├── data_atualizacao (timestamp)
```

---

### 2.5. `campaign_flow_executions` — Execucoes de campanha

Uma "execucao" representa **uma rodada do workflow**. Para campanhas de evento, cada evento cria uma execucao por cliente afetado. Para campanhas recorrentes, cada rodada do cron cria uma execucao-mae ("batch").

```
campaign_flow_executions
├── id (PK, UUID)
├── campanha_id (FK -> campaign_flows, CASCADE)
├── organizacao_id (FK -> organizations, CASCADE)
├── tipo (enum: INDIVIDUAL | LOTE)
│
│   # Para execucoes individuais (evento)
├── cliente_id (FK -> clients, nullable)
├── evento_tipo (text, nullable)                -- qual evento disparou
├── evento_metadados (jsonb, nullable)          -- dados do evento (venda_id, valor, etc)
│
│   # Para execucoes em lote (recorrente/unica)
├── lote_total_clientes (integer, nullable)
├── lote_clientes_processados (integer, default 0)
│
├── status (enum: PENDENTE | EM_EXECUCAO | CONCLUIDA | FALHOU | CANCELADA)
├── data_inicio (timestamp)
├── data_conclusao (timestamp, nullable)
├── erro (text, nullable)
├── data_insercao (timestamp, default now())
│
│   # Vercel Workflow tracking
├── vercel_workflow_run_id (text, nullable)      -- ID da run do Vercel Workflow
```

---

### 2.6. `campaign_flow_execution_steps` — Passos por cliente

Rastreia em qual no cada cliente esta dentro do workflow.

```
campaign_flow_execution_steps
├── id (PK, UUID)
├── execucao_id (FK -> campaign_flow_executions, CASCADE)
├── no_id (FK -> campaign_flow_nodes, CASCADE)
├── cliente_id (FK -> clients, CASCADE)
│
├── status (enum: PENDENTE | EM_EXECUCAO | CONCLUIDO | FALHOU | AGUARDANDO_DELAY | PULADO)
├── resultado (jsonb, nullable)                  -- output do no (ex: interaction_id, cashback_id, condicao_resultado: true/false)
├── erro (text, nullable)
│
├── delay_ate (timestamp, nullable)              -- se AGUARDANDO_DELAY, quando retomar
├── data_inicio (timestamp)
├── data_conclusao (timestamp, nullable)
├── data_insercao (timestamp, default now())
```

---

### 2.7. Diagrama ER Resumido

```
campaign_flows ──1:N──> campaign_flow_nodes
campaign_flows ──1:N──> campaign_flow_edges
campaign_flows ──N:1──> campaign_audiences
campaign_flows ──1:N──> campaign_flow_executions

campaign_flow_executions ──1:N──> campaign_flow_execution_steps
campaign_flow_execution_steps ──N:1──> campaign_flow_nodes
campaign_flow_execution_steps ──N:1──> clients

campaign_flow_edges ──N:1──> campaign_flow_nodes (origem)
campaign_flow_edges ──N:1──> campaign_flow_nodes (destino)
```

---

## 3. Tipos de Nos (Node Types)

### 3.1. GATILHO (Trigger)

O no de entrada do workflow. Define **quando** a campanha dispara.

| Subtipo | Descricao | Configuracao (JSONB) |
|---|---|---|
| `NOVA-COMPRA` | Cliente fez uma compra | `{ valorMinimo?: number }` |
| `PRIMEIRA-COMPRA` | Primeira compra do cliente | `{}` |
| `ENTRADA-SEGMENTACAO` | Cliente entrou em segmento RFM | `{ segmentos: string[] }` |
| `PERMANENCIA-SEGMENTACAO` | Cliente permanece em segmento RFM por tempo X | `{ segmentos: string[], tempoValor: number, tempoMedida: "DIAS"\|"SEMANAS"\|"MESES" }` |
| `CASHBACK-ACUMULADO` | Cashback acumulou acima de X | `{ valorMinimoNovo?: number, valorMinimoTotal?: number }` |
| `CASHBACK-EXPIRANDO` | Cashback esta prestes a expirar | `{ diasAntecedencia: number }` |
| `ANIVERSARIO-CLIENTE` | Aniversario do cliente | `{ diasAntecedencia?: number }` |
| `QUANTIDADE-TOTAL-COMPRAS` | Total de compras atingiu N | `{ quantidade: number }` |
| `VALOR-TOTAL-COMPRAS` | Valor total de compras atingiu X | `{ valor: number }` |
| `INICIO-RECORRENTE` | Ponto de entrada para cron (nao e evento) | `{}` |
| `INICIO-UNICO` | Ponto de entrada para one-time blast | `{}` |

---

### 3.2. ACAO (Action)

Executa algo concreto.

| Subtipo | Descricao | Configuracao (JSONB) |
|---|---|---|
| `ENVIAR-WHATSAPP` | Envia template WhatsApp | `{ whatsappTemplateId: string, whatsappConexaoTelefoneId: string }` |
| `GERAR-CASHBACK` | Gera cashback para o cliente | `{ tipo: "FIXO"\|"PERCENTUAL", valor: number, expiracaoMedida?: "DIAS"\|"SEMANAS"\|"MESES", expiracaoValor?: number }` |
| `NOTIFICACAO-INTERNA` | Notifica equipe interna | `{ mensagem: string, destinatarioIds?: string[] }` |

**Futuro (nao precisa implementar agora, mas o schema suporta):**
- `ENVIAR-EMAIL` — `{ assunto: string, templateId: string }`
- `WEBHOOK` — `{ url: string, metodo: "POST"\|"PUT", headers?: object }`

---

### 3.3. DELAY (Wait)

Pausa o workflow por um periodo.

| Subtipo | Descricao | Configuracao (JSONB) |
|---|---|---|
| `ESPERAR-DURACAO` | Espera X horas/dias/semanas | `{ valor: number, medida: "HORAS"\|"DIAS"\|"SEMANAS"\|"MESES" }` |
| `ESPERAR-ATE-HORARIO` | Espera ate proximo horario especifico | `{ horario: "09:00"\|"12:00"\|... , diaSemana?: number[] }` |
| `ESPERAR-ATE-DATA` | Espera ate data especifica | `{ data: "YYYY-MM-DD" }` |

**Implementacao:** usa `context.sleep()` do Vercel Workflows para delays longos.

---

### 3.4. CONDICAO (Condition/Branch)

Avalia uma condicao e segue para "SIM" ou "NAO".

| Subtipo | Descricao | Configuracao (JSONB) |
|---|---|---|
| `VERIFICAR-ATRIBUTO-CLIENTE` | Checa atributo do cliente | `{ campo: string, operador: "IGUAL"\|"DIFERENTE"\|"MAIOR"\|"MENOR"\|"CONTEM", valor: any }` |
| `VERIFICAR-COMPRA-RECENTE` | Cliente comprou nos ultimos X dias? | `{ diasAtras: number, valorMinimo?: number }` |
| `VERIFICAR-INTERACAO-ANTERIOR` | A acao anterior foi entregue/lida? | `{ statusEsperado: "ENTREGUE"\|"LIDO"\|"FALHOU" }` |
| `VERIFICAR-SEGMENTO-RFM` | Cliente esta em segmento X? | `{ segmentos: string[] }` |
| `VERIFICAR-CASHBACK-SALDO` | Cliente tem saldo de cashback >= X? | `{ valorMinimo: number }` |

---

### 3.5. FILTRO (Audience Filter)

Filtra clientes no meio do workflow. Clientes que nao passam sao removidos (step marcado como PULADO).

| Subtipo | Descricao | Configuracao (JSONB) |
|---|---|---|
| `FILTRAR-POR-PUBLICO` | Aplica um publico reutilizavel | `{ publicoId: string }` |
| `FILTRAR-INLINE` | Filtro ad-hoc dentro do workflow | `{ filtros: FilterTree }` (mesma estrutura de campaign_audiences.filtros) |

---

## 4. Sistema de Publicos (Audience System)

### 4.1. Estrutura de Filtros

Os filtros sao arvores composiveis usando logica AND/OR:

```typescript
type FilterTree = {
  logica: "AND" | "OR";
  condicoes: FilterCondition[];
  grupos?: FilterTree[];  // sub-grupos aninhados
};

type FilterCondition = {
  tipo: FilterType;
  configuracao: Record<string, unknown>;
};
```

### 4.2. Tipos de Filtro Disponiveis

| FilterType | Descricao | Configuracao |
|---|---|---|
| `SEGMENTO-RFM` | Segmentacao RFM do cliente | `{ segmentos: ["CAMPEOES", "CLIENTES LEAIS", ...] }` |
| `LOCALIZACAO-CIDADE` | Cidade do cliente | `{ cidades: string[] }` |
| `LOCALIZACAO-ESTADO` | Estado do cliente | `{ estados: string[] }` |
| `FAIXA-ETARIA` | Idade entre X e Y | `{ idadeMinima?: number, idadeMaxima?: number }` |
| `TOTAL-COMPRAS-QUANTIDADE` | Numero de compras | `{ operador: "MAIOR"\|"MENOR"\|"IGUAL"\|"ENTRE", valor: number, valorMax?: number }` |
| `TOTAL-COMPRAS-VALOR` | Valor total gasto | `{ operador: "MAIOR"\|"MENOR"\|"IGUAL"\|"ENTRE", valor: number, valorMax?: number }` |
| `TOP-N-COMPRADORES` | Top N compradores | `{ quantidade: number, criterio: "VALOR"\|"QUANTIDADE" }` |
| `TOP-N-PRODUTO` | Top N compradores de produto X | `{ quantidade: number, produtoId: string, criterio: "VALOR"\|"QUANTIDADE" }` |
| `ULTIMA-COMPRA` | Data da ultima compra | `{ operador: "ANTES"\|"DEPOIS"\|"ENTRE"\|"ULTIMOS_N_DIAS", valor: string\|number, valorMax?: string }` |
| `PRIMEIRA-COMPRA` | Data da primeira compra | `{ operador: "ANTES"\|"DEPOIS"\|"ENTRE"\|"ULTIMOS_N_DIAS", valor: string\|number, valorMax?: string }` |
| `TEM-TELEFONE` | Cliente tem telefone cadastrado | `{}` |
| `TEM-EMAIL` | Cliente tem email cadastrado | `{}` |
| `PRODUTO-COMPRADO` | Ja comprou produto X | `{ produtoId: string }` |
| `GRUPO-PRODUTO-COMPRADO` | Ja comprou do grupo X | `{ grupo: string }` |
| `SALDO-CASHBACK` | Saldo de cashback | `{ operador: "MAIOR"\|"MENOR"\|"IGUAL", valor: number }` |

### 4.3. Exemplo de Filtro Composto

"Mulheres entre 25-40 anos, que moram em Sao Paulo, e que sao CAMPEOES ou CLIENTES LEAIS":

```json
{
  "logica": "AND",
  "condicoes": [
    { "tipo": "FAIXA-ETARIA", "configuracao": { "idadeMinima": 25, "idadeMaxima": 40 } },
    { "tipo": "LOCALIZACAO-CIDADE", "configuracao": { "cidades": ["Sao Paulo"] } }
  ],
  "grupos": [
    {
      "logica": "OR",
      "condicoes": [
        { "tipo": "SEGMENTO-RFM", "configuracao": { "segmentos": ["CAMPEOES"] } },
        { "tipo": "SEGMENTO-RFM", "configuracao": { "segmentos": ["CLIENTES LEAIS"] } }
      ]
    }
  ]
}
```

### 4.4. Resolucao de Publico

A funcao `resolveAudience(orgId, filtros)` converte a arvore de filtros em uma query SQL dinamica:

```typescript
async function resolveAudience(
  orgId: string,
  filtros: FilterTree,
  tx?: DBTransaction
): Promise<string[]> {
  // Retorna array de client IDs que passam nos filtros
  // Constroi WHERE clauses dinamicamente com Drizzle
  // Para TOP-N: usa subquery com ORDER BY + LIMIT
  // Para FAIXA-ETARIA: calcula idade a partir de data_nascimento
}
```

---

## 5. Motor de Execucao (Execution Engine)

### 5.1. Visao Geral do Fluxo

```
[Evento/Cron/Manual]
        │
        v
┌─────────────────────┐
│  Criar Execucao     │  campaign_flow_executions (PENDENTE)
│  + Resolver Publico │  Filtra clientes aplicaveis
└─────────┬───────────┘
          │
          v
┌─────────────────────┐
│  Vercel Workflow     │  Inicia workflow run
│  (por cliente ou    │
│   batch)            │
└─────────┬───────────┘
          │
          v
┌─────────────────────┐
│  Processar No       │  Para cada no no grafo:
│  (walk the graph)   │  - Executa logica do no
│                     │  - Registra step
│                     │  - Segue arestas
└─────────┬───────────┘
          │
          v
┌─────────────────────┐
│  Fim do Workflow    │  Marca execucao como CONCLUIDA
└─────────────────────┘
```

### 5.2. Entry Points (Como execucoes sao criadas)

#### A. Campanhas de EVENTO

Disparadas no mesmo local que a V1 (`new-transaction` route, crons de RFM, etc.), mas agora consultam `campaign_flows` em vez de (ou alem de) `campaigns`:

```typescript
// Em app/api/point-of-interaction/new-transaction/route.ts
// Apos processar campanhas V1, processar campaign flows:
const flowCampaigns = await getActiveCampaignFlowsByTrigger(orgId, "NOVA-COMPRA");
for (const campaign of flowCampaigns) {
  // 1. Verificar se cliente passa no publico
  const passesAudience = await checkClientInAudience(clientId, campaign.publicoId);
  if (!passesAudience) continue;

  // 2. Criar execucao individual
  const execution = await createFlowExecution({
    campanhaId: campaign.id,
    clienteId: clientId,
    tipo: "INDIVIDUAL",
    eventoTipo: "NOVA-COMPRA",
    eventoMetadados: { vendaId, valor },
  });

  // 3. Disparar Vercel Workflow
  await startFlowRun(execution.id);
}
```

#### B. Campanhas RECORRENTES

Um novo cron job (`process-recurrent-campaign-flows.ts`) roda nos mesmos time blocks:

```typescript
// 1. Buscar campaign flows RECORRENTES ativos para o time block atual
// 2. Filtrar por shouldCampaignRunToday() (mesma logica V1)
// 3. Para cada campanha:
//    a. Resolver publico -> lista de client IDs
//    b. Aplicar frequency cap por cliente
//    c. Criar execucao tipo LOTE
//    d. Para cada cliente: disparar Vercel Workflow
```

#### C. Campanhas UNICAS (One-time)

Disparadas por acao do usuario na UI (botao "Disparar Campanha"):

```typescript
// POST /api/campaign-flows/execute
// 1. Verificar que campanha e tipo UNICA e ainda nao foi executada
// 2. Resolver publico -> lista de client IDs
// 3. Criar execucao tipo LOTE
// 4. Marcar campanha como unica_executada = true
// 5. Para cada cliente: disparar Vercel Workflow
```

### 5.3. Vercel Workflow Runner

O workflow runner e uma funcao Vercel Workflow que "caminha" pelo grafo para um cliente especifico:

```typescript
// app/api/workflows/campaign-flow/route.ts
import { serve } from "@vercel/workflow";

export const POST = serve<CampaignFlowRunInput>(async (context) => {
  const { executionId, clientId, campaignId } = context.requestPayload;

  // Carregar grafo do workflow (nos + arestas)
  const graph = await loadFlowGraph(campaignId);

  // Encontrar no de entrada (GATILHO)
  const entryNode = graph.nodes.find(n => n.tipo === "GATILHO");

  // Caminhar pelo grafo
  let currentNodeId = entryNode.id;

  while (currentNodeId) {
    const node = graph.getNode(currentNodeId);

    // Registrar step como EM_EXECUCAO
    const stepId = await createExecutionStep({
      execucaoId: executionId,
      noId: currentNodeId,
      clienteId: clientId,
      status: "EM_EXECUCAO",
    });

    // Processar no baseado no tipo
    let result: NodeResult;

    switch (node.tipo) {
      case "GATILHO":
        result = { sucesso: true };
        break;

      case "ACAO":
        result = await processActionNode(context, node, clientId, executionId);
        break;

      case "DELAY":
        result = await processDelayNode(context, node);
        break;

      case "CONDICAO":
        result = await processConditionNode(node, clientId);
        break;

      case "FILTRO":
        result = await processFilterNode(node, clientId);
        break;
    }

    // Registrar resultado
    await updateExecutionStep(stepId, {
      status: result.pulado ? "PULADO" : result.sucesso ? "CONCLUIDO" : "FALHOU",
      resultado: result,
    });

    // Se falhou ou foi filtrado, encerrar
    if (!result.sucesso || result.pulado) break;

    // Determinar proximo no
    currentNodeId = getNextNode(graph, currentNodeId, result);
  }

  // Marcar execucao como concluida
  await completeExecution(executionId);
});
```

### 5.4. Processadores de Nos

#### Action: ENVIAR-WHATSAPP
```typescript
async function processActionWhatsapp(node, clientId, executionId) {
  const { whatsappTemplateId, whatsappConexaoTelefoneId } = node.configuracao;
  // Buscar template, telefone do cliente, conexao
  // Criar interaction (mesma tabela de interactions existente, com referencia ao campaign flow)
  // Enviar mensagem via WhatsApp API
  // Retornar { sucesso: true, interactionId }
}
```

#### Action: GERAR-CASHBACK
```typescript
async function processActionCashback(node, clientId) {
  const { tipo, valor, expiracaoMedida, expiracaoValor } = node.configuracao;
  // Gerar transacao de cashback no programa do cliente
  // Retornar { sucesso: true, transacaoId, valorGerado }
}
```

#### Delay: ESPERAR-DURACAO
```typescript
async function processDelayNode(context, node) {
  const { valor, medida } = node.configuracao;
  const sleepMs = convertToMs(valor, medida);

  // context.sleep() persiste o estado e retoma apos o tempo
  await context.sleep("delay-step", sleepMs);

  return { sucesso: true };
}
```

#### Condition: Routing
```typescript
function getNextNode(graph, currentNodeId, result) {
  const edges = graph.getOutgoingEdges(currentNodeId);

  if (edges.length === 0) return null; // fim do workflow
  if (edges.length === 1) return edges[0].noDestinoId; // fluxo linear

  // Branching: escolher baseado no resultado da condicao
  if (result.condicaoResultado === true) {
    return edges.find(e => e.condicaoLabel === "SIM")?.noDestinoId;
  } else {
    return edges.find(e => e.condicaoLabel === "NAO")?.noDestinoId;
  }
}
```

---

## 6. Frequency Cap & Deduplication

Para evitar que um cliente receba a mesma campanha repetidamente:

```typescript
async function canExecuteForClient(
  campanhaId: string,
  clienteId: string,
  config: { permitirRecorrencia: boolean, frequenciaIntervaloValor?: number, frequenciaIntervaloMedida?: string }
): Promise<boolean> {
  // 1. Se nao permite recorrencia, verificar se ja existe execucao concluida
  // 2. Se permite, verificar frequency cap (mesmo padrao V1)
  // 3. Verificar se nao existe execucao EM_EXECUCAO (evitar duplicatas)
}
```

---

## 7. Novos Enums (Drizzle pgEnum)

Adicionar em `schema/enums.ts`:

```typescript
// Status do campaign flow
export const campaignFlowStatusEnum = pgEnum("campaign_flow_status", [
  "RASCUNHO", "ATIVO", "PAUSADO", "ARQUIVADO"
]);

// Tipo do campaign flow
export const campaignFlowTypeEnum = pgEnum("campaign_flow_type", [
  "EVENTO", "RECORRENTE", "UNICA"
]);

// Tipo de no no workflow
export const campaignFlowNodeTypeEnum = pgEnum("campaign_flow_node_type", [
  "GATILHO", "ACAO", "DELAY", "CONDICAO", "FILTRO"
]);

// Status de execucao
export const campaignFlowExecutionStatusEnum = pgEnum("campaign_flow_execution_status", [
  "PENDENTE", "EM_EXECUCAO", "CONCLUIDA", "FALHOU", "CANCELADA"
]);

// Tipo de execucao
export const campaignFlowExecutionTypeEnum = pgEnum("campaign_flow_execution_type", [
  "INDIVIDUAL", "LOTE"
]);

// Status de step
export const campaignFlowExecutionStepStatusEnum = pgEnum("campaign_flow_execution_step_status", [
  "PENDENTE", "EM_EXECUCAO", "CONCLUIDO", "FALHOU", "AGUARDANDO_DELAY", "PULADO"
]);
```

---

## 8. API Routes

### 8.1. CRUD de Campaign Flows

```
GET    /api/campaign-flows          -- Listar/buscar por ID
POST   /api/campaign-flows          -- Criar (campanha + nos + arestas)
PUT    /api/campaign-flows          -- Atualizar (campanha + nos + arestas)
DELETE /api/campaign-flows          -- Deletar
```

O payload de create/update segue o padrao nested do codebase:

```typescript
const CreateCampaignFlowInputSchema = z.object({
  campanha: CampaignFlowSchema.omit({ dataInsercao: true, autorId: true }),
  nos: z.array(CampaignFlowNodeSchema.omit({ campanhaId: true, dataInsercao: true })),
  arestas: z.array(CampaignFlowEdgeSchema.omit({ campanhaId: true, dataInsercao: true })),
});
```

### 8.2. CRUD de Publicos

```
GET    /api/campaign-audiences     -- Listar/buscar por ID
POST   /api/campaign-audiences     -- Criar
PUT    /api/campaign-audiences     -- Atualizar
DELETE /api/campaign-audiences     -- Deletar
GET    /api/campaign-audiences/preview -- Preview: retorna contagem e amostra de clientes
```

### 8.3. Execucao

```
POST   /api/campaign-flows/execute   -- Disparar campanha UNICA
GET    /api/campaign-flows/executions -- Listar execucoes de uma campanha
GET    /api/campaign-flows/executions/steps -- Listar steps de uma execucao
```

### 8.4. Vercel Workflow Endpoint

```
POST   /api/workflows/campaign-flow       -- Vercel Workflow handler (serve())
```

---

## 9. Estrategia de Migracao

**V1 e Campaign Flows rodam em paralelo.** Sem migracao automatica.

1. Manter todas as tabelas, crons e logica V1 intactos
2. No `new-transaction` route, adicionar processamento de flows **apos** o V1
3. Crons de campaign flows sao novos arquivos separados (nao modificam os existentes)
4. A UI do admin tera uma nova secao "Campaign Flows" ao lado da existente
5. Ao longo do tempo, usuarios migram manualmente suas campanhas para flows
6. Quando V1 nao tiver mais campanhas ativas, pode ser deprecada

---

## 10. Consideracoes de Escalabilidade

### 10.1. Vercel Workflows
- Cada cliente no workflow = 1 Vercel Workflow run
- Para campanhas em lote com 10k clientes, serao 10k workflow runs
- Vercel Workflows suportam isso nativamente (sao stateless entre steps)
- Considerar batching: agrupar clientes em lotes de 50-100 por workflow run para reduzir overhead

### 10.2. Rate Limiting
- WhatsApp tem limites de envio (tipicamente 1k-10k/dia dependendo do tier)
- O processamento em lote deve respeitar esses limites
- Adicionar `delay(100)` entre envios (mesma abordagem V1)

### 10.3. Observabilidade
- `campaign_flow_executions` + `campaign_flow_execution_steps` dao visibilidade total
- Dashboard de campanha mostra: quantos clientes entraram, em qual no estao, quantos concluiram, quantos falharam
- Logs estruturados em cada step para debugging

### 10.4. Indexes Recomendados
```sql
-- Busca rapida de execucoes por campanha
CREATE INDEX idx_cf_executions_campanha ON campaign_flow_executions(campanha_id, status);

-- Busca rapida de steps por execucao
CREATE INDEX idx_cf_steps_execucao ON campaign_flow_execution_steps(execucao_id, status);

-- Busca de steps por cliente (para frequency cap)
CREATE INDEX idx_cf_steps_cliente ON campaign_flow_execution_steps(cliente_id, no_id);

-- Busca de campanhas ativas por org e tipo
CREATE INDEX idx_campaign_flows_org_status ON campaign_flows(organizacao_id, status, tipo);
```

---

## 11. Exemplo: Workflow Completo

**Cenario:** "Quando um cliente fizer uma compra acima de R$100, esperar 2 dias, verificar se ele e CAMPEAO ou LEAL, se sim enviar WhatsApp de agradecimento com cashback de 5%, se nao enviar WhatsApp generico."

```
[GATILHO: NOVA-COMPRA]           config: { valorMinimo: 100 }
        │
        v
[DELAY: ESPERAR-DURACAO]         config: { valor: 2, medida: "DIAS" }
        │
        v
[CONDICAO: VERIFICAR-SEGMENTO-RFM]  config: { segmentos: ["CAMPEOES", "CLIENTES LEAIS"] }
      /     \
    SIM      NAO
    │          │
    v          v
[ACAO:       [ACAO:
 ENVIAR-      ENVIAR-
 WHATSAPP]    WHATSAPP]
    │         config: template generico
    v
[ACAO: GERAR-CASHBACK]
config: { tipo: "PERCENTUAL", valor: 5, expiracaoMedida: "MESES", expiracaoValor: 1 }
```

Grafo armazenado:
- 6 nos na tabela `campaign_flow_nodes`
- 5 arestas na tabela `campaign_flow_edges` (a da condicao tem 2: SIM e NAO)
