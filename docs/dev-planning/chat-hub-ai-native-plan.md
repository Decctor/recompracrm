# Hub de Atendimentos — IA nativa — Plano de Implementação

> **Status**: em implementação nesta branch (Fases 0 e 1 concluídas). Pendência operacional da Fase 1: adicionar `ampmais_ai_agent_runs` à publicação realtime do Supabase (`alter publication supabase_realtime add table ampmais_ai_agent_runs;`) — sem isso a presença da IA só atualiza no refetch.
> **Origem**: a IA de atendimento funciona, mas o hub a trata como um atendente invisível: ninguém vê que ela está respondendo, o resumo fica escondido numa aba, as execuções só existem em Configurações e uma conversa que o cliente abandona depois de receber preços morre em silêncio. Ao mesmo tempo, cada mensagem elegível vira uma run completa de LLM, e o único freio de custo é `maxRunsDiarios`.
> **Princípio norteador**: **a decisão mais barata é a que se pega carona numa run que já vai acontecer.** Antes de acrescentar uma chamada de modelo, perguntar se a informação pode sair da saída estruturada do turno que já pagamos; antes de chamar um modelo de linguagem, perguntar se uma classificação calibrada (Jev) resolve; antes de classificar, perguntar se um fato do banco já responde.
> **Escopo desta iniciativa**: (1) presença da IA no hub — estado de execução em tempo real, resumo em destaque, histórico de execuções por atendimento com progressive disclosure; (2) retomadas de conversa decididas pelo agente, com execução programada e guarda da janela de 24h; (3) modo assistência — a IA ajuda o humano que detém o atendimento sem nunca enviar nada; (4) custo — medição em moeda por run e por organização, enforcement de `limiteCreditos`, triagem pré-run com Jev e contexto compacto. **Fora de escopo**: múltiplos agentes por organização, RAG sobre a base de conhecimento, HITL para mutações, migração para Vercel Workflows, envio de template pelo agente fora da retomada (ver [Decisões](#2-decisões-fechadas)).
> **Como ler este documento**: as seções 1–2 são diagnóstico e contrato; 3–7 são as fases, cada uma deployável de forma independente e na ordem em que aparecem; 8–11 são riscos, validação, rollback e decisões em aberto. Blocos de código são a forma-alvo; `// …` é elisão de trecho mecânico, não de decisão.

---

## Índice

1. [Diagnóstico](#1-diagnóstico)
2. [Decisões fechadas](#2-decisões-fechadas)
3. [Fase 0 — Custo visível e limite por organização](#fase-0--custo-visível-e-limite-por-organização)
4. [Fase 1 — Presença da IA no hub](#fase-1--presença-da-ia-no-hub)
5. [Fase 2 — Retomadas de conversa](#fase-2--retomadas-de-conversa)
6. [Fase 3 — Modo assistência](#fase-3--modo-assistência)
7. [Fase 4 — Triagem pré-run com Jev e contexto compacto](#fase-4--triagem-pré-run-com-jev-e-contexto-compacto)
8. [Riscos e mitigações](#8-riscos-e-mitigações)
9. [Plano de validação](#9-plano-de-validação)
10. [Rollback](#10-rollback)
11. [Decisões em aberto](#11-decisões-em-aberto)
12. [Ordem de commits](#12-ordem-de-commits)

---

## 1. Diagnóstico

### 1.1 O que existe (e funciona)

O pipeline de atendimento por IA está sólido e não é objeto deste plano:

- **Roteamento** (`lib/chats/ai-trigger.ts`, `ai-turn-runner.ts`, `ai-turn-dispatch.ts`): debounce → escopo → claim por compare-and-set → confirmação → run → revalidação pré-entrega. Transporte inline ou Vercel Queues (`AI_TURN_TRANSPORT`).
- **Runtime** (`lib/ai/agent/runtime.ts`): `ToolLoopAgent` com saída estruturada `{mensagem, anexo, resumoAtendimento}`, abort de run obsoleta, fallback de modelo para saída estruturada, guarda contra promessa sem execução.
- **Observabilidade** (`ai_agent_runs`, `ai_agent_tool_calls`, `ai_agent_operations`): snapshot de config e de contexto, uso de tokens, erro, timeline de ferramentas. UI em Configurações → Agente de IA → Execuções (`components/Settings/AiAgent/AgentRunsList.tsx`, `AgentRunDrawer.tsx`).
- **Resumo do atendimento**: o agente grava `chat_assignments.resumo` a cada turno (`respond-to-chat.ts` → `updateChatAttendanceSummary`). O board e a aba Atendimento do painel de contexto exibem.
- **Modos de entrada**: `IMEDIATO` e `RESERVA` (a IA espera `esperaHumanoMs` pela equipe antes de entrar).
- **Handoff**: ferramenta `atendimento.transferir_para_humano` encerra o episódio da IA com `resultado: HUMAN_HANDOFF`.

### 1.2 O que falta para "parecer nativo"

| Lacuna | Onde dói | Evidência |
| --- | --- | --- |
| **Nenhum sinal de execução em andamento.** O hub não assina `ai_agent_runs`; a única "digitando…" é a do playground, por polling. | Atendente abre a conversa, vê pendência do cliente, assume — e a run que estava a 2s de entregar é cancelada. Ou pior: não assume porque acha que a IA vai responder, e ela já falhou. | `ChatThread.tsx:212-263` assina só `chat_messages`, `chat_assignments`, `chats`. |
| **Falha silenciosa.** Run `FALHA` grava erro em `ai_agent_runs` e nada mais. O atendimento continua `AGENTE`, o cliente sem resposta. | A conversa aparece em "IA" na caixa de entrada como se estivesse atendida. | `ai-turn-runner.ts:80-84`; nenhuma leitura de `FALHA` fora de Configurações. |
| **Resumo escondido.** Só na aba Atendimento do painel lateral (fechado por padrão em telas menores) e no card do board. | Quem assume da IA lê 40 mensagens para descobrir que o cliente quer 3 rolos do cabo 2,5mm e perguntou prazo. | `ChatContextPanel.tsx:182`. |
| **Sem vínculo mensagem → execução no hub.** `metadados.aiAgente.runId` é gravado em toda mensagem do agente e ignorado pelo `ChatMessageBubble`. | "Por que a IA disse isso?" exige ir a Configurações e procurar a run pelo horário. | `delivery.ts:127`; `AgentPlayground.tsx:86` usa; `ChatMessageBubble.tsx` não. |
| **Histórico de runs sem filtro por chat.** `GET /api/ai-agents/runs` não aceita `chatId` e exige `empresa.visualizar`. | O atendente comum não pode ver o que a IA fez na conversa que ele acabou de assumir. | `app/api/ai-agents/runs/route.ts:294-311, 403-408`. |
| **Retomada inexistente.** Nem programática nem por decisão do agente. `closeStaleChatAttendances` encerra em 36h sem nenhum gancho. | Cliente pergunta preço às 10h, recebe, some. A conversa morre `INATIVIDADE`. É a venda mais barata de recuperar da plataforma inteira e ninguém a toca. | `attendance-state.ts:461`; §9.2 de `chats-ai-reliability-plan.md` é só ideia. |
| **Janela de 24h bloqueia o agente.** A entrega via Meta descarta a resposta fora da janela; o agente nunca envia template. | Qualquer retomada além de 24h da última mensagem do cliente é impossível na Cloud API hoje. | `delivery.ts:102-104`. |
| **Modo assistência inexistente.** Nenhum "sugerir resposta", "resumir", "reescrever". A IA ou é dona do atendimento ou não existe. | Lojas com atendente ativo (o público do modo `RESERVA`) não ganham nada da IA enquanto o humano atende. | Relatório de exploração; `ChatInputArea.appendText` existe e só recebe orçamentos. |

### 1.3 Onde o custo vaza

| Vazamento | Tamanho | Evidência |
| --- | --- | --- |
| **Toda mensagem elegível vira run completa.** "Ok", "obrigado", "👍", figurinha, "tá bom então" passam pelo debounce, claim, montagem de contexto e um turno de `gpt-5` com ferramentas para produzir "De nada!". | Estimativa a confirmar na replay da Fase 4; em suporte de varejo, 20–35% das mensagens de cliente são de encerramento ou reconhecimento. | `ai-turn-runner.ts` não tem nenhum gate semântico. |
| **Contexto de 100 mensagens por turno, e o mesmo snapshot gravado em cada run.** | Tokens de entrada crescem linearmente com a conversa; `contexto_entrada_snapshot` duplica a conversa inteira em cada run. | `context.ts:14` (`HISTORY_MESSAGE_LIMIT = 100`); `runtime.ts:138`. |
| **`limiteCreditos` não é aplicado.** A configuração existe, a UI de admin edita, o runtime nunca lê. | O único freio real é `maxRunsDiarios = 500` — 500 runs de `gpt-5` com 100 mensagens de contexto é um dia caro. | `schemas/organizations.ts:282`; nenhuma leitura em `lib/`. |
| **Custo em moeda não existe.** Tokens são gravados, preço por modelo está no catálogo, ninguém multiplica. | Impossível responder "quanto a organização X gastou este mês" sem SQL manual. | `AI_AGENT_MODEL_CATALOG` tem `precoEntrada/precoSaida`; `uso` tem só tokens. |
| **Sem cache de prefixo.** O system prompt (instruções + regras + base de conhecimento) é estável por organização e vai inteiro em cada chamada, incluindo cada passo do loop de ferramentas. | Em provedores com cache de prefixo (OpenAI automático ≥1024 tokens, Anthropic com `cache_control`), o prompt estável deveria custar 10–50% do preço. Hoje depende de sorte do provedor. | `runtime.ts:170-181`: `instructions` fixas — bom — mas sem `providerOptions` de cache. |

### 1.4 Jev, em uma frase

Jev (TypeSafe AI, `typesafe-ai/jev` no AI Gateway) **não gera texto**: responde perguntas de escolha, nota ou booleano sobre um estado, com distribuição de probabilidade calibrada, em 70–500ms, a US$ 0,042 por milhão de tokens de entrada e saída gratuita. Contexto de 64k tokens (32k para o estado). No AI SDK é `experimental_evaluate` (a partir de `ai@7.0.103`; resolução de id string pelo Gateway a partir de `7.0.105` — o repositório está em `7.0.93`). É, exatamente, a ferramenta para os "ifs inteligentes" deste plano: *precisa de resposta?*, *é para humano?*, *é pedido de preço ou reclamação?*, *o cliente sumiu com pendência?*. Nunca substitui o turno do agente; decide se e como ele acontece.

---

## 2. Decisões fechadas

1. **A decisão de retomar é do agente, tomada no turno em que ele responde — não numa chamada separada.** `TurnOutputSchema` ganha `retomada: {aguardarHoras, objetivo} | null`. Custa zero chamadas extras e o modelo decide com todo o contexto na mão ("dei preço de 3 itens e o cliente disse que ia ver com a esposa" → retomar em 20h; "cliente perguntou o horário" → não retomar). A programática entra como **guarda** (janela de 24h, horário, limite por atendimento, pausa de comunicação), nunca como decisora.
2. **A retomada é uma run comum, com gatilho `RETOMADA`.** Passa pelo mesmo `respondToChatWithAgent`, mesma revalidação pré-entrega, mesmo registro em `ai_agent_runs`. Uma retomada que o cliente atropela (mandou mensagem antes) vira `CANCELADO` pelo mecanismo que já existe.
3. **Retomada dentro da janela de 24h da Cloud API, em v1.** O agendamento é *clampado* a `janelaExpiracao − margem`. Fora da janela só template aprovado passa, e escolher, aprovar e parametrizar template de retomada é uma iniciativa própria (Decisão em aberto 11.1). Conexões `INTERNAL_GATEWAY` não têm janela e aceitam qualquer horário.
4. **Modo assistência nunca envia.** Produz texto para `ChatInputArea.appendText` e resumo para `chat_assignments.resumo`. A garantia é estrutural, como a do envio do agente: o deliverer da assistência é o do playground (só persiste), e o texto sugerido nem vira mensagem — vai direto ao rascunho.
5. **Assistência é uma run com gatilho `SUGESTAO_HUB`.** Mesma tabela, mesma UI de execuções, mesmo custo contabilizado, mesmo `maxRunsDiarios`. Um modo que não aparece no histórico e não conta no limite seria um buraco de custo.
6. **Custo em moeda é calculado no fechamento da run e gravado em `uso.custoUsd`.** Preço vem do catálogo curado (fallback) ou da consulta ao Gateway já existente em `/api/ai-agents/models`; o valor é *estimativa*, e a UI diz isso. Não há migration: `uso` é jsonb.
7. **`iaAtendimento.limiteCreditos` passa a ser limite mensal em USD por organização** (rótulo de UI: "créditos"), somado de `uso.custoUsd` no mês corrente. Ao atingir, `resolveAiAssignmentAvailability` e o runner recusam com motivo `LIMITE_CREDITOS`, e o hub mostra a razão. Não bloqueia a assistência? **Bloqueia.** Limite é limite.
8. **Jev decide gates, nunca conteúdo.** Toda decisão de Jev tem um *fallback seguro* que é o comportamento de hoje (rodar o turno completo). Limiar por ação: pular resposta exige confiança ≥ 0,85; encaminhar direto a humano ≥ 0,9; escolher modelo econômico ≥ 0,7. Abaixo do limiar, turno completo no modelo configurado.
9. **Jev entra atrás de replay offline.** `ai_agent_runs.contexto_entrada_snapshot` guarda o contexto de todas as runs passadas; antes de ligar qualquer gate em produção, um script roda a triagem sobre as últimas N semanas e mede quantas runs seriam puladas/encaminhadas e o que elas de fato produziram. Sem esse número, não liga.
10. **Presença da IA no hub sai de fatos do banco, não de um estado novo.** "IA vai responder" = atendimento `AGENTE` (ou `NAO_ATRIBUIDO` com IA disponível) + pendência do cliente + nenhuma run ativa; "IA respondendo" = run `PENDENTE|RODANDO` no chat; "IA falhou" = última run do chat `FALHA` e pendência ainda aberta. O hub assina `ai_agent_runs` por `chat_id`. Nenhuma coluna nova em `chats`.
11. **Histórico por atendimento reusa o drawer de Configurações.** `GET /api/ai-agents/runs` ganha `chatId` e passa a aceitar quem tem acesso ao chat (`assertChatAccess`), não só `empresa.visualizar`. `AgentRunDrawer` é montado a partir do hub sem alteração.
12. **Enums novos continuam `varchar` + Zod**, como o módulo já faz: `RETOMADA` e `SUGESTAO_HUB` em `AiAgentRunTriggerEnum`; `AiAgentFollowUpStatusEnum` novo. Nenhum `ALTER TYPE`.

---

## Fase 0 — Custo visível e limite por organização

Pequena, sem migration, e pré-requisito de tudo: sem número não se otimiza nem se limita.

### 0.1 Custo por run

```typescript
// lib/ai/providers/pricing.ts
export type TModelPrice = { precoEntrada: number; precoSaida: number }; // USD por 1M tokens

/** Catálogo curado como fallback; Gateway quando disponível (cache em memória por 1h). */
export async function resolveModelPrice(modelId: string): Promise<TModelPrice | null> { /* … */ }

export function estimateRunCostUsd(usage: TAiAgentUsage, price: TModelPrice | null): number | null {
	if (!price || usage.tokensEntrada == null || usage.tokensSaida == null) return null;
	return (usage.tokensEntrada * price.precoEntrada + usage.tokensSaida * price.precoSaida) / 1_000_000;
}
```

`AiAgentUsageSchema` ganha `custoUsd: z.number().optional()` e `modelosUsados: z.array(z.string()).optional()` (o runtime já concatena `usedModels` com `" -> "`; a lista tipada permite precificar cada trecho). `completeAgentRun` grava. Quando a run usa mais de um modelo (fallback), o custo é calculado por trecho — o runtime já tem `usages[]` alinhado a `usedModels[]`.

### 0.2 Agregação e limite

```typescript
// lib/ai/agent/spend.ts
export async function getOrganizationAiSpend(db, { organizacaoId, since }): Promise<{ custoUsd: number; runs: number }> {
	// SUM((uso->>'custoUsd')::numeric) sobre ai_agent_runs no período. Índice existente idx_ai_agent_runs_organizacao_data cobre.
}

export async function assertAiSpendWithinLimit(db, { organizacaoId, configuracao }): Promise<void> {
	const limite = configuracao?.recursos?.iaAtendimento?.limiteCreditos;
	if (limite == null) return;
	const { custoUsd } = await getOrganizationAiSpend(db, { organizacaoId, since: startOfMonthSaoPaulo() });
	if (custoUsd >= limite) throw new AgentSpendLimitError(`Limite mensal de créditos de IA atingido (US$ ${limite}).`);
}
```

Chamado em `prepareAgentExecution` (ao lado de `countAgentRunsToday`) e em `resolveAiAssignmentAvailability` (novo motivo `LIMITE_CREDITOS` em `TAiAssignmentBlockReason`, mensagem "A organização atingiu o limite mensal de créditos de IA."). O webhook não consulta — o runner recusa e o log diz por quê; consultar no webhook seria uma query a mais por mensagem para poupar um `prepare` que já recusa cedo.

### 0.3 UI

- Configurações → Execuções: cabeçalho com "Este mês: US$ 12,40 · 318 execuções · limite US$ 50" e uma barra; cada linha ganha o custo ao lado dos tokens.
- Admin → Organização → Recursos: o campo `limiteCreditos` já existe; só o rótulo muda para "Limite mensal (US$)".
- Rota nova `GET /api/ai-agents/spend` (`{ mes: { custoUsd, runs, limite } }`), hook `useAiAgentSpend` em `lib/queries/ai-agents.ts`.

### 0.4 Alerta

`credit-alert.ts` cobre crédito global do Gateway. Aqui, ao cruzar 80% do limite da organização, um e-mail para os administradores da organização via Resend, silenciado por 7 dias com a mesma tabela `ampmais_utils`. Reusa o padrão de `notifyAiGatewayCreditExhausted`.

---

## Fase 1 — Presença da IA no hub

Sem migration de schema. Uma pendência operacional: adicionar `ampmais_ai_agent_runs` à publicação realtime do Supabase (mesmo procedimento usado para `ampmais_chat_assignments`).

### 1.1 Estado da IA na thread

```typescript
// lib/chats/ai-presence.ts
export type TAiPresence =
	| { estado: "ausente" }
	| { estado: "aguardando"; motivo: "debounce" | "reserva"; previstoEm: Date | null }
	| { estado: "respondendo"; runId: string; desde: Date }
	| { estado: "falhou"; runId: string; erro: string; em: Date }
	| { estado: "limite"; motivo: "LIMITE_CREDITOS" | "LIMITE_DIARIO" };

/** Pura. Recebe o chat (com atendimentoAtivo e atendimentoIa) e a run ativa/última do chat. */
export function resolveAiPresence(input: {
	atendimento: { responsavelTipo: string } | null;
	atendimentoIa: TAiAssignmentAvailability;
	pendente: boolean;
	capacidades: Pick<TAiAgentCapabilities["atendimento"], "modo" | "atrasoRespostaMs" | "esperaHumanoMs">;
	ultimaEntradaEm: Date | null;
	run: { id: string; status: TAiAgentRunStatusEnum; erro: string | null; dataInicio: Date | null; dataFim: Date | null } | null;
	now: Date;
}): TAiPresence { /* … */ }
```

Regras, na ordem:

1. Run `PENDENTE|RODANDO` no chat → `respondendo`.
2. Atendimento `USUARIO` ou `EXTERNO` → `ausente` (a IA não fala).
3. Última run do chat é `FALHA`, `dataFim` posterior à última entrada do cliente, e o chat ainda está pendente → `falhou`.
4. Pendente, IA disponível, atendimento `AGENTE` ou `NAO_ATRIBUIDO` → `aguardando` com `previstoEm = ultimaEntradaEm + delay` (delay = `resolveAiResponseDelayMs`). Se `now > previstoEm + 60s` e nenhuma run apareceu, o estado cai para `ausente` (algo abortou — escopo, claim perdido, número da equipe — e o hub não deve prometer resposta).
5. Senão `ausente`.

**Dados**: `GET /api/chats/messages` passa a devolver `chat.aiRun` (a run mais recente do chat: `id, status, erro, dataInicio, dataFim`) e `chat.aiCapacidades.atendimento` (só o trio acima). Uma query a mais, indexada por `idx_ai_agent_runs_chat`.

**Realtime**: `ChatThread` assina `ampmais_ai_agent_runs` (`INSERT`, `UPDATE`) filtrado por `chat_id=eq.${chatId}` no canal `chat-thread-${chatId}` já existente e faz patch de `chat.aiRun` no cache de `["chat-messages", chatId]`. Sem refetch: a linha da run já traz tudo que `resolveAiPresence` precisa.

**UI** (`components/Chats/AiPresenceBar.tsx`, renderizado entre a lista e o composer):

- `aguardando`: linha discreta "✦ A IA responde em instantes" (modo `RESERVA`: "✦ A IA responde às 14:32 se ninguém assumir"). Botão "Responder eu mesmo" = `assumir`.
- `respondendo`: os três pontos animados com "✦ IA escrevendo…" — o mesmo componente da bolha de digitação do playground, promovido a `components/Chats/TypingIndicator.tsx`. O composer, se o usuário não é dono, mostra "Assumir agora" com o aviso "a resposta em andamento será descartada" (é o que acontece: `watchForStaleRun` aborta).
- `falhou`: faixa `destructive` "A IA não conseguiu responder · ver detalhes" (abre o drawer da run) + "Assumir". É a única forma de o atendimento não ficar preso em `AGENTE` sem ninguém saber.
- `limite`: "Limite de IA atingido este mês" + "Assumir".

### 1.2 Sinal na caixa de entrada

`ChatInboxListItem` mostra, na linha do responsável, "✦ respondendo" quando há run ativa no chat. Para isso, `GET /api/chats` traz `aiRunAtiva: boolean` (subquery `EXISTS` em `ai_agent_runs` com `status IN ('PENDENTE','RODANDO')`) e a sidebar assina `ampmais_ai_agent_runs` por `organizacao_id`, invalidando `["chats"]` com o mesmo debounce de 800ms dos contadores. É uma assinatura por organização, como as demais da sidebar.

### 1.3 Resumo em destaque

`components/Chats/AttendanceSummaryCard.tsx` no topo da thread, abaixo do cabeçalho, **colapsado por padrão a uma linha** ("Resumo: cliente quer 3 rolos de cabo 2,5mm; pediu prazo…") e expansível. Aparece quando `atendimentoAtivo.resumo` existe. Quando o atendimento veio de handoff (`resultado: HUMAN_HANDOFF` no episódio anterior ou `transferenciaMotivo` preenchido), o card abre expandido e mostra o motivo em primeiro lugar — é o momento em que o humano mais precisa dele. O `resumo` continua sendo gravado só pelo agente nesta fase (a edição humana e a geração sob demanda entram na Fase 3).

O `[CATALOGO_INTERNO]` que `run-memory.ts` anexa ao resumo **nunca** chega à UI: o card usa `stripCatalogMemory`. Hoje o painel de contexto exibe o resumo cru — corrigir de passagem.

### 1.4 Mensagem → execução

`ChatMessageBubble`, para `autorTipo === "AI"` com `metadados.aiAgente.runId`: link "ver o que a IA consultou" no rodapé da bolha, abrindo `AgentRunDrawer` (mesmo comportamento do playground). Permissão: a rota de runs passa a aceitar acesso ao chat (1.5).

### 1.5 Histórico de execuções por atendimento

- `GET /api/ai-agents/runs` ganha `chatId` (string, opcional). Com `chatId`, a autorização é `assertChatAccess` (mesma do hub) em vez de `empresa.visualizar`. Sem `chatId`, comportamento atual.
- `useAiAgentRuns` ganha o parâmetro; chave `["ai-agent-runs", page, gatilho, status, chatId]`.
- `ChatContextPanel` → aba Atendimento, abaixo do resumo, seção colapsada **"Execuções da IA (4)"**: fechada mostra "4 execuções · última há 3 min · US$ 0,03"; aberta lista as runs do chat (status, gatilho, horário, custo, primeira linha do resumo) com clique abrindo `AgentRunDrawer`. Paginação de 20, "ver mais". É o *progressive disclosure*: contagem → lista → drawer com timeline e snapshots.

---

## Fase 2 — Retomadas de conversa

### 2.1 Schema (migration)

```typescript
// services/drizzle/schema/ai-agents.ts
export const aiAgentFollowUps = newTable(
	"ai_agent_follow_ups",
	{
		id: varchar("id", { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }).notNull(),
		agenteId: varchar("agente_id", { length: 255 }).references(() => aiAgents.id, { onDelete: "cascade" }).notNull(),
		chatId: varchar("chat_id", { length: 255 }).references(() => chats.id, { onDelete: "cascade" }).notNull(),
		// Episódio de atendimento em que a retomada foi decidida. Se ele encerrar, a retomada morre.
		atendimentoId: varchar("atendimento_id", { length: 255 }).references(() => chatAssignments.id, { onDelete: "cascade" }).notNull(),
		// Run que decidiu retomar e run que executou a retomada.
		runOrigemId: varchar("run_origem_id", { length: 255 }).references(() => aiAgentRuns.id, { onDelete: "set null" }),
		runExecucaoId: varchar("run_execucao_id", { length: 255 }).references(() => aiAgentRuns.id, { onDelete: "set null" }),
		status: varchar("status", { length: 32 }).$type<TAiAgentFollowUpStatusEnum>().notNull().default("AGENDADA"),
		// O que o agente quer conseguir com a retomada. Vira o prompt do turno de retomada.
		objetivo: text("objetivo").notNull(),
		agendadaPara: timestamp("agendada_para").notNull(),
		// O que o agente pediu, antes da guarda de janela/horário. Auditoria.
		solicitadaPara: timestamp("solicitada_para").notNull(),
		tentativa: integer("tentativa").notNull().default(1),
		motivoCancelamento: varchar("motivo_cancelamento", { length: 64 }),
		leaseAte: timestamp("lease_ate"),
		dataExecucao: timestamp("data_execucao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$onUpdate(() => new Date()),
	},
	(table) => [
		// Uma retomada agendada por chat. Índice parcial: histórico não conflita.
		uniqueIndex("ai_agent_follow_ups_chat_agendada_idx").on(table.chatId).where(sql`status = 'AGENDADA'`),
		index("idx_ai_agent_follow_ups_due").on(table.status, table.agendadaPara),
	],
);
```

Enums (`schemas/enums.ts`): `AiAgentFollowUpStatusEnum = z.enum(["AGENDADA", "EXECUTADA", "CANCELADA", "EXPIRADA"])`; `AiAgentRunTriggerEnum` ganha `"RETOMADA"`. Motivos de cancelamento (constantes, não enum): `CLIENTE_RESPONDEU`, `HUMANO_ASSUMIU`, `ATENDIMENTO_ENCERRADO`, `COMUNICACAO_PAUSADA`, `JANELA_FECHADA`, `CANCELADA_PELO_HUB`, `SUBSTITUIDA`.

### 2.2 Configuração

```typescript
// schemas/ai-agents.ts — dentro de AiAgentCapabilitiesSchema
retomadas: z.object({
	habilitadas: z.boolean().default(false),
	maxPorAtendimento: z.number().int().min(1).max(3).default(1),
	// Janela de horário em que uma retomada pode sair (São Paulo). Fora dela, adia para a próxima abertura.
	horarioInicio: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
	horarioFim: z.string().regex(/^\d{2}:\d{2}$/).default("20:00"),
	// Teto do que o agente pode pedir; a janela de 24h ainda clampa por cima.
	maxAguardarHoras: z.number().int().min(1).max(72).default(24),
}).default({}),
```

Bloco novo em `AgentConfigForm`: "Retomadas" (habilitar, máximo por atendimento, horário). Desabilitado por padrão: é uma mensagem *proativa* ao cliente, e a organização precisa optar.

### 2.3 A decisão, no turno

`TurnOutputSchema` (runtime) ganha:

```typescript
retomada: z
	.object({
		aguardarHoras: z.number().int().min(1).max(72).describe("Quantas horas esperar em silêncio do cliente antes de retomar."),
		objetivo: z.string().describe("O que a retomada deve conseguir, em uma frase. Ex.: 'Perguntar se o cliente decidiu sobre os 3 rolos de cabo 2,5mm e oferecer fechar o orçamento.'"),
	})
	.nullable()
	.describe("null na maioria dos turnos. Preencha só quando a conversa tem uma pendência comercial concreta que vale um lembrete se o cliente sumir: preço informado, orçamento criado, produto sugerido. Nunca para saudação, dúvida respondida ou reclamação."),
```

E o prompt (`prompts.ts`), condicional a `retomadas.habilitadas`:

> ## Retomadas
> Se esta conversa tiver uma pendência comercial concreta (você informou preços, criou um orçamento, sugeriu produtos) e o cliente puder sumir sem decidir, preencha "retomada" com quantas horas esperar e o objetivo do lembrete. A retomada só acontece se o cliente ficar em silêncio; se ele responder, ela é cancelada sozinha. Não preencha para saudações, dúvidas já resolvidas, reclamações, nem quando o cliente disse que não quer.

`AiAgentTurnOutputSchema` (schemas) espelha o campo. Nenhuma chamada a mais: é um campo a mais na saída que o turno já produz.

### 2.4 Guarda programática (`lib/ai/agent/follow-ups.ts`)

```typescript
export async function scheduleFollowUpFromTurn(db, input: {
	organizacaoId: string; chatId: string; agenteId: string; runId: string;
	atendimentoId: string; retomada: { aguardarHoras: number; objetivo: string };
	capacidades: TAiAgentCapabilities; now: Date;
}): Promise<{ agendada: true; para: Date } | { agendada: false; motivo: string }> {
	const cfg = input.capacidades.retomadas;
	if (!cfg.habilitadas) return { agendada: false, motivo: "DESABILITADAS" };

	const existentes = await countFollowUpsForAttendance(db, input.atendimentoId); // qualquer status exceto CANCELADA por SUBSTITUIDA
	if (existentes >= cfg.maxPorAtendimento) return { agendada: false, motivo: "LIMITE_ATENDIMENTO" };

	const solicitada = addHours(input.now, Math.min(input.retomada.aguardarHoras, cfg.maxAguardarHoras));
	let agendada = clampToBusinessHours(solicitada, cfg); // adia para a próxima abertura, nunca antecipa para antes de `solicitada`

	// Cloud API: sem template, a retomada só sai dentro da janela. Clampa com margem de 1h.
	const chat = await loadChatWindow(db, input.chatId);
	if (chat.tipoConexao === "META_CLOUD_API") {
		if (!chat.janelaExpiracao) return { agendada: false, motivo: "JANELA_FECHADA" };
		const limite = subHours(chat.janelaExpiracao, 1);
		if (limite <= input.now) return { agendada: false, motivo: "JANELA_FECHADA" };
		if (agendada > limite) agendada = limite; // antecipa: melhor um lembrete 18h depois que nenhum
	}

	// Substitui a agendada anterior do mesmo chat, se houver (o turno mais novo sabe mais).
	await db.transaction(async (tx) => {
		await cancelScheduledFollowUp(tx, { chatId: input.chatId, motivo: "SUBSTITUIDA" });
		await tx.insert(aiAgentFollowUps).values({ /* … */ });
	});
	return { agendada: true, para: agendada };
}
```

Chamado em `respondToChatWithAgent`, **depois** da entrega bem-sucedida e no mesmo bloco do resumo (acessório: falha aqui não derruba o turno). Só no gatilho `CHAT_MENSAGEM`/`ATRIBUICAO_HUB`; uma retomada nunca agenda outra retomada em v1 (`maxPorAtendimento` também impede).

Ao agendar, o status do atendimento muda para `AGUARDANDO_CLIENTE` via `changeChatAttendanceStatus` — o board passa a refletir "a bola está com o cliente", que é a verdade.

### 2.5 Cancelamento automático

Uma retomada `AGENDADA` morre quando:

| Evento | Onde | Motivo |
| --- | --- | --- |
| Cliente manda mensagem | `persistIncomingClientMessage` (`incoming-message.ts`), uma linha após `markChatNeedsResponse` | `CLIENTE_RESPONDEU` |
| Humano assume/é atribuído/transferido | `assumeChatAttendanceForUser`, `assignChatAttendance`, `transferChatAttendance` (para USUARIO), `markChatAttendedExternally` | `HUMANO_ASSUMIU` |
| Atendimento encerra | `closeChatAttendance`, `changeChatAttendanceStatus` (terminal), `closeStaleChatAttendances` | `ATENDIMENTO_ENCERRADO` |
| Pausa de comunicação | `app/api/clients/communication-pause` | `COMUNICACAO_PAUSADA` |

Tudo através de `cancelScheduledFollowUp(db, { chatId, motivo })` em `follow-ups.ts` — um `UPDATE … WHERE chat_id = $1 AND status = 'AGENDADA'`, idempotente. A concentração em `attendance-state.ts` é natural: toda mutação de `chat_assignments` já passa por lá.

**Cinto e suspensório**: o executor (2.6) reconfirma todos esses fatos antes de rodar. O cancelamento em linha é para a UI refletir na hora; a correção não depende dele.

### 2.6 Execução

Cron `GET /api/cron/ai-follow-ups`, `*/5 * * * *`, `maxDuration` 300:

```typescript
async function runDueFollowUps() {
	const due = await claimDueFollowUps(db, { now, limit: 25, leaseMs: 5 * 60_000 }); // UPDATE … SET lease_ate … WHERE status='AGENDADA' AND agendada_para <= now AND (lease_ate IS NULL OR lease_ate < now) RETURNING
	for (const followUp of due) {
		if (process.env.AI_TURN_TRANSPORT === "queue") await sendFollowUpToQueue(followUp); // tópico `ai-chat-follow-ups`, consumer em app/api/queues/ai-chat-follow-up
		else await runFollowUp(followUp);
	}
}
```

`runFollowUp` (`lib/chats/ai-follow-up-runner.ts`), espelho de `runAiTurnForMessage`:

1. Recarrega a retomada; se não está `AGENDADA`, sai.
2. Agente `ATIVO`; escopo (`confirmClientInAgentScope`); atendimento atual **é** `atendimentoId` e continua `AGENTE` (se mudou de mão ou encerrou → `CANCELADA` com o motivo certo); nenhuma mensagem do cliente após `dataInsercao` da retomada (→ `CLIENTE_RESPONDEU`); pausa de comunicação; janela aberta (→ `EXPIRADA`, motivo `JANELA_FECHADA`); limite de gastos (Fase 0).
3. `respondToChatWithAgent({ gatilho: "RETOMADA", mensagemGatilhoId: null, deliver, turnPromptOverride })`. O turno de retomada usa **contexto compacto** (Fase 4.4): resumo + últimas 12 mensagens, e o prompt do turno termina com:

   > O cliente está em silêncio há {h} horas. Objetivo desta retomada: "{objetivo}". Escreva uma única mensagem curta e natural que retome a conversa sem pressionar. Se, lendo a conversa, retomar não fizer sentido (cliente já comprou, já recusou, reclamou), devolva mensagem null.

   `mensagem: null` → retomada `EXECUTADA` sem envio, run `CONCLUIDO`. Isso é a "inteligência situação por situação" no momento da execução, além da decisão no agendamento.
4. `confirmAiDeliveryStillValid` já cobre `RETOMADA` pelo ramo não-`CHAT_MENSAGEM` (ancora em `runStartedAt`).
5. Marca `EXECUTADA` com `runExecucaoId`, `dataExecucao`. A mensagem entregue carrega `metadados.aiAgente.retomadaId` para a bolha rotular "retomada".

### 2.7 UI

- **Thread / painel Atendimento**: card "Retomada agendada para sáb, 14:00 · *objetivo*" com botão "Cancelar" (`DELETE /api/chats/follow-ups?id=`, motivo `CANCELADA_PELO_HUB`; exige posse ou gestão como as demais ações). Aparece também em `AiPresenceBar` no estado `aguardando` quando a pendência é da IA e há retomada — "✦ IA retoma às 14:00 se o cliente não responder".
- **Caixa de entrada / board**: ícone de relógio com "retoma 14:00" no card, dado `retomadaAgendada: { agendadaPara } | null` em `GET /api/chats` e `/api/chats/board`.
- **Bolha**: mensagem de retomada rotulada "Assistente IA · retomada".
- **Execuções**: filtro de gatilho ganha UI (hoje existe na rota e não na tela) com "Retomadas".
- **Estatísticas**: em `ChatsAutomationBlock`, "Retomadas: 41 enviadas · 12 responderam (29%) · 3 orçamentos". "Responderam" = mensagem do cliente após `dataExecucao` no mesmo chat dentro de 48h.

### 2.8 Programática de encerramento (complemento barato)

Quando `closeStaleChatAttendances` encerra um atendimento `AGENTE` ou `NAO_ATRIBUIDO` com `resultado = INATIVIDADE`, e o cliente tem vendedor de carteira (`client-seller-references`), Jev (Fase 4) responde `clienteSumiuComPendencia: boolean` sobre o resumo + últimas mensagens; com probabilidade ≥ 0,8, cria uma `interaction` `PLANEJADA` na agenda do vendedor com o resumo — exatamente o §9.2 do plano de confiabilidade, mas a custo de centavos. Não é retomada por IA: é a IA entregando a pendência a quem pode ligar. Entra depois da Fase 4, como item de 1 dia.

---

## Fase 3 — Modo assistência

A IA a serviço do humano que detém o atendimento. Três ações, todas iniciadas por clique, nenhuma envia.

### 3.1 Contrato

`AiAgentRunTriggerEnum` ganha `"SUGESTAO_HUB"`. Rota nova `POST /api/chats/assist`:

```typescript
const ChatAssistInputSchema = z.object({
	chatId: z.string(),
	acao: z.enum(["SUGERIR_RESPOSTA", "RESUMIR", "REESCREVER"]),
	// REESCREVER: o rascunho atual do composer.
	texto: z.string().max(4000).optional().nullable(),
	// SUGERIR_RESPOSTA: orientação opcional do atendente ("diz que o frete é grátis acima de 300").
	orientacao: z.string().max(500).optional().nullable(),
});
// Saída: { data: { sugestao: string | null; resumo: string | null; runId: string }, message }
```

Permissão: acesso ao chat + posse do atendimento (ou gestão). Sem posse, o composer nem mostra o botão — mesmo gate de "ASSUMIR".

### 3.2 Runtime

`prepareAgentExecution` ganha `modo: "ATENDIMENTO" | "ASSISTENCIA"`. Em `ASSISTENCIA`:

- **Ferramentas**: só as de leitura (`clientes.consultar_compras`, `produtos.consultar`, `cashback.consultar`, `cupons.consultar`). `orcamentos.criar` e `transferir_para_humano` ficam fora do toolset — o humano cria orçamento pelo builder do hub.
- **Modelo**: alias `agent-fast` por padrão (`modeloConfig.assistencia?.modelo` opcional para quem quiser o modelo principal). Sugestão é rascunho; o humano corrige.
- **Passos**: `maxSteps = min(configurado, 4)`.
- **Saída**: `{ sugestao, resumoAtendimento }` — sem `anexo`, sem `retomada`.
- **Prompt do turno**: o mesmo `formatChatRunContext`, com o fecho trocado: "Você está ajudando o atendente humano {nome}. Escreva a resposta que ele deve enviar, na primeira pessoa dele, no tom das instruções. Orientação do atendente: {orientacao}." Para `RESUMIR`: "Escreva só o resumo interno." Para `REESCREVER`: "Reescreva o rascunho abaixo mantendo o sentido: {texto}."
- **Deliverer**: o do playground (persistência sem envio) — e nem isso: a sugestão **não vira mensagem**. A run grava `outputResumo` e `mensagemEnviadaId` fica nulo.
- **Cache**: `SUGERIR_RESPOSTA` sem `orientacao` é memoizado por `(chatId, ultimaMensagemId)` em `ai_agent_runs` — se já existe run `SUGESTAO_HUB` `CONCLUIDO` para esse par, devolve o `outputResumo` dela sem chamar modelo. Dois cliques, uma cobrança.

### 3.3 UI

- `ChatInputArea`, quando o usuário é dono: botão "✦" ao lado dos anexos com menu "Sugerir resposta", "Reescrever rascunho" (habilitado com texto), "Resumir atendimento". Atalho: `/ia` no início do textarea abre o menu.
- Sugestão chega via `appendText` (já existe) **substituindo** o rascunho vazio ou **inserindo** ao final de um não vazio; enquanto gera, o botão vira spinner e o textarea fica editável (não bloqueia quem prefere digitar).
- `RESUMIR` grava `resumo` via `updateChatAttendanceSummary` e o card da Fase 1.3 atualiza por realtime. O card ganha, para o dono do atendimento, "Editar" (textarea inline, `PATCH /api/chats/assignments` com `acao: "alterar_resumo"`) e "Regenerar".
- Após handoff IA → humano, se `resumo` estiver vazio, o card oferece "Gerar resumo" em vez de ficar vazio.

### 3.4 Custo

Bounded por clique, modelo rápido, 4 passos, memoização. Ainda assim conta em `maxRunsDiarios` e no limite mensal (Decisão 5/7). O histórico por atendimento (Fase 1.5) lista as sugestões com gatilho "Assistência".

---

## Fase 4 — Triagem pré-run com Jev e contexto compacto

### 4.1 Pré-requisitos

- `npm i ai@^7.0.111` (e `@ai-sdk/gateway` compatível). Rodar a suíte; `ToolLoopAgent`, `Output.object` e `gateway()` não mudaram de contrato entre 7.0.93 e 7.0.111 pelo changelog, mas o build decide.
- Confirmar no Gateway que `typesafe-ai/jev` está disponível para o time e o preço vigente.
- Adicionar `Experimental_EvaluationMockModelV4` (`ai/test`) aos testes de `lib/ai/triage`.

### 4.2 Módulo de triagem

```typescript
// lib/ai/triage/message-triage.ts
import { experimental_evaluate as evaluate } from "ai";

export const TRIAGE_INTENTS = {
	PRECO_OU_PRODUTO: "Pergunta preço, disponibilidade, ou pede indicação de produto",
	ORCAMENTO_OU_PEDIDO: "Quer fechar, pede orçamento, confirma quantidade, pergunta como pagar",
	STATUS_OU_ENTREGA: "Pergunta sobre pedido feito, prazo, entrega, retirada",
	CASHBACK_OU_CUPOM: "Saldo, pontos, cupom, promoção",
	RECLAMACAO: "Insatisfação, problema com produto ou pedido, pede reembolso",
	DIRIGIDA_A_PESSOA: "Fala com alguém da equipe pelo nome ou responde ao que um atendente humano disse",
	SAUDACAO_OU_INICIO: "Abre a conversa sem pedido concreto ainda",
	ENCERRAMENTO_OU_RECONHECIMENTO: "Obrigado, ok, combinado, tá bom, emoji, figurinha, sem pergunta nova",
	OUTRO: "Não se encaixa",
} as const;

export type TMessageTriage = {
	intencao: keyof typeof TRIAGE_INTENTS;
	precisaResposta: number;      // probabilidade
	exigeHumano: number;          // probabilidade
	confianca: { intencao: number };
};

export async function triageIncomingMessage(input: {
	ultimasMensagens: Array<{ autor: string; texto: string }>; // últimas 8, cronológicas
	resumo: string | null;
	agenteTemHandoff: boolean;
}): Promise<TMessageTriage | null> {
	try {
		const result = await evaluate({
			model: "typesafe-ai/jev",
			state: { conversa: input.ultimasMensagens, resumoAtendimento: input.resumo },
			questions: {
				intencao: { type: "choice", instructions: "Qual a intenção da ÚLTIMA mensagem do cliente?", criteria: TRIAGE_INTENTS },
				precisaResposta: { type: "boolean", instructions: "A última mensagem do cliente exige uma resposta da loja agora?" },
				exigeHumano: { type: "boolean", instructions: "Um atendente humano precisa assumir esta conversa (reclamação, negociação, pergunta dirigida a alguém da equipe)?" },
			},
		});
		// …mapear answers/providerMetadata.typesafe.confidence
	} catch (error) {
		console.warn("[AI_TRIAGE] Falha na triagem; seguindo com turno completo:", error);
		return null; // fallback: comportamento de hoje
	}
}
```

Custo por triagem: ~1–2k tokens de estado → ~US$ 0,00006. Latência sob 0,5s, dentro do debounce que já existe.

### 4.3 Onde entra e o que decide

Em `runAiTurnForMessage`, **depois** do claim e da confirmação (não gastar nem centavos numa mensagem que um humano já respondeu) e **antes** de `respondToChatWithAgent`:

| Sinal | Limiar | Ação | Registro |
| --- | --- | --- | --- |
| `precisaResposta < 0.15` e intenção `ENCERRAMENTO_OU_RECONHECIMENTO` com confiança ≥ 0.85 | — | **Não roda o turno.** Cria run `CONCLUIDO` com `uso.custoUsd ≈ 0`, `outputResumo: "Triagem: sem resposta necessária (…)"`, `mensagemEnviadaId` nulo. O atendimento fica como está. | Run visível no histórico; a organização vê que a IA *decidiu* não responder. |
| `exigeHumano ≥ 0.9` e `agenteTemHandoff` | — | **Handoff direto**, sem turno: `closeChatAttendance` com `HUMAN_HANDOFF` + a mesma mensagem de aviso que a ferramenta de transferência usa hoje (texto fixo da ferramenta, não gerado). | Run `CONCLUIDO` com resumo "Triagem: encaminhado a humano (reclamação)". |
| Intenção em {`SAUDACAO_OU_INICIO`, `STATUS_OU_ENTREGA`, `CASHBACK_OU_CUPOM`} com confiança ≥ 0.7 | — | Turno completo no **modelo econômico** (`modeloConfig.modeloEconomico ?? "agent-fast"`). | `uso.modelo` diz qual rodou. |
| Qualquer outra coisa, ou triagem nula | — | Turno completo no modelo configurado — **comportamento de hoje**. | — |

Tudo atrás de `capacidades.triagem.habilitada` (default `false` até a replay aprovar) e de três flags individuais (`pularSemResposta`, `handoffDireto`, `modeloEconomico`) para ligar uma de cada vez.

### 4.4 Contexto compacto

Independente de Jev e vale sozinho:

- `HISTORY_MESSAGE_LIMIT` deixa de ser 100 fixos: o turno leva as últimas **30** mensagens **mais** o `resumo` acumulado (que já é a memória de longo prazo — `run-memory.ts` mantém até o catálogo consultado nele). Runs de `RETOMADA` e `SUGESTAO_HUB` levam 12.
- `contextoEntradaSnapshot` grava a conversa **truncada ao que entrou no prompt** (é isso que ele deveria auditar) — a redução vem de graça com a anterior.
- **Cache de prefixo**: `instructions` já é o bloco estável. Acrescentar `providerOptions` de cache quando o provedor suporta (`anthropic: { cacheControl: { type: "ephemeral" } }` no bloco de instruções; OpenAI cacheia prefixos ≥1024 tokens automaticamente desde que o prefixo seja byte-idêntico — garantir que `productGroups` e `knowledge` não mudem de ordem entre turnos: ordenar por `id`). Medir com `usage.cachedInputTokens` que o SDK expõe e gravar em `uso.tokensEntradaCache`.

### 4.5 Replay offline (antes de ligar 4.3)

`scripts/replay-ai-triage.ts` (ao lado de `analyze-ai-agent-runs.ts`): para cada run `CHAT_MENSAGEM` das últimas 4 semanas, monta o estado a partir de `contexto_entrada_snapshot`, chama Jev e cruza com o que a run produziu:

- Quantas seriam puladas, e qual foi a `mensagem` delas (uma amostra manual de 50 diz se "De nada!" era mesmo tudo).
- Quantas iriam a handoff direto, e quantas dessas de fato chamaram `atendimento.transferir_para_humano`.
- Quantas iriam ao modelo econômico, com custo estimado antes/depois.
- Distribuição de `intencao` → também alimenta `chat_assignments.categoria`, hoje vazia (4.6).

Saída: tabela em Markdown. Critério para ligar `pularSemResposta`: precisão ≥ 95% na amostra manual. Para `handoffDireto`: ≥ 90% de concordância com a ferramenta.

### 4.6 `categoria` do atendimento

A intenção dominante do episódio (moda das triagens, ou a última não-`ENCERRAMENTO`) é gravada em `chat_assignments.categoria` — coluna que existe desde o redesign e nunca foi preenchida. Estatísticas ganham "atendimentos por categoria" sem nenhuma chamada a mais.

---

## 8. Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Retomada percebida como spam pelo cliente | Desabilitada por padrão; 1 por atendimento; horário comercial; o turno de retomada pode devolver `null`; cancelamento automático em qualquer sinal do cliente; pausa de comunicação respeitada. Métrica de resposta às retomadas nas estatísticas para a organização ver se funciona. |
| Retomada dispara em conversa que um humano já pegou pelo celular | `markChatAttendedExternally` cancela; o executor reconfirma posse antes de rodar; `confirmAiDeliveryStillValid` corta antes de enviar. Três barreiras, como no turno comum. |
| Janela de 24h fecha entre o agendamento e a execução (o clamp usa a expiração do momento) | A janela só **estende** com mensagem do cliente — e mensagem do cliente cancela a retomada. Logo, a expiração usada no clamp é a que vale na execução. O executor ainda checa. |
| Jev classifica mal em português coloquial de varejo | Replay offline com amostra manual antes de ligar; limiares altos; cada gate atrás de flag própria; fallback é sempre o turno completo. |
| `experimental_evaluate` muda de assinatura | Isolado em `lib/ai/triage/`; um único ponto de import; o resto do código só vê `TMessageTriage`. |
| Bump do `ai` quebra o runtime | Fase 4 é a última; o bump entra em commit próprio com a suíte verde e o playground testado à mão. |
| Assinatura realtime de `ai_agent_runs` gera ruído (uma linha por run, `UPDATE` a cada transição) | Filtro por `chat_id` na thread; na sidebar, por organização com debounce de 800ms já existente. O volume é o de runs, ordens de grandeza abaixo do de mensagens. |
| Custo em USD diverge da fatura do Gateway | A UI diz "estimado". Preço regional (`deepseek-v4-pro` em `us`) já é documentado no catálogo; aceitar a divergência e revisar o catálogo mensalmente. |
| Limite mensal bloqueia no meio de uma conversa | O hub mostra o motivo e oferece "Assumir"; o e-mail de 80% avisa antes. |
| Assistência sugere algo que a ferramenta não confirmou | Mesmo system prompt, mesmas regras ("nunca afirme o que não confirmou"). É rascunho: o humano lê antes de enviar. |

## 9. Plano de validação

- **Fase 0**: teste unitário de `estimateRunCostUsd` (modelo único, dois modelos, uso sem tokens); teste de `assertAiSpendWithinLimit` com limite nulo/abaixo/acima; conferir no playground que o custo aparece na run.
- **Fase 1**: testes de `resolveAiPresence` cobrindo as cinco regras e a transição `aguardando → ausente` por timeout; à mão: abrir a thread num segundo navegador, mandar mensagem como cliente, ver "escrevendo…", assumir no meio e ver a run `CANCELADO`; forçar `FALHA` (pausar o Gateway no `.env` de dev) e ver a faixa. Publicação realtime confirmada em staging.
- **Fase 2**: testes de `scheduleFollowUpFromTurn` (desabilitada, limite, clamp de horário, clamp de janela, gateway sem janela, substituição); testes do executor cobrindo cada motivo de cancelamento; à mão no playground (chat `PLAYGROUND` com retomada agendada e cron chamado manualmente); piloto com 2 organizações que já usam o agente, retomadas em `maxPorAtendimento: 1`, 2 semanas, ler a taxa de resposta.
- **Fase 3**: à mão: sugerir, reescrever, resumir; conferir que nenhuma mensagem é criada; duplo clique não gera segunda run; sem posse, botão ausente.
- **Fase 4**: replay offline com relatório anexado ao PR; ligar `modeloEconomico` primeiro (menor risco: ainda responde), depois `pularSemResposta`, depois `handoffDireto`, uma organização de cada vez, uma semana entre flags.

## 10. Rollback

- Fase 0: `limiteCreditos` nulo desliga o enforcement; o cálculo de custo é só gravação.
- Fase 1: componentes atrás de nada — remover é um revert de UI; a rota de runs com `chatId` é aditiva.
- Fase 2: `retomadas.habilitadas = false` para a organização, ou remover o cron do `vercel.json`. Retomadas `AGENDADA` param de executar e podem ser canceladas em lote. A tabela fica.
- Fase 3: remover o botão; a rota continua inofensiva.
- Fase 4: `triagem.habilitada = false`; reverter o bump do `ai` é um commit.

## 11. Decisões em aberto

1. **Retomada fora da janela de 24h (Cloud API).** v1 clampa para dentro da janela. Opção v2: template aprovado de retomada por número (`message_templates` com categoria `RETOMADA`, variáveis `{{nome}}` e `{{resumo}}`), parametrizado pelo turno de retomada (o agente preenche as variáveis, não o corpo). Vale a pena quando as organizações-piloto mostrarem retomadas perdidas por `JANELA_FECHADA` acima de, digamos, 30%.
2. **Quem decide o horário comercial.** Este plano põe em `capacidades.retomadas`. Se a organização já tiver horário de funcionamento em outro lugar (não encontrado), usar o dela.
3. **Jev no caminho quente.** Adotar uma API `experimental_` num fluxo de produção é uma aposta. A alternativa sem Jev para o gate de "não precisa de resposta" é uma heurística (mensagem curta, sem `?`, no vocabulário de encerramento) com precisão pior, e para intenção é um `generateObject` num modelo econômico a ~50x o custo. Recomendação: fazer a replay (4.5) antes de decidir — ela custa um dia e responde com números.
4. **Modelo da assistência.** Padrão `agent-fast` (`gpt-5-mini`). Se as sugestões saírem fracas no piloto, promover ao modelo do agente e absorver o custo — é bounded por clique.
5. **Resumo no encerramento automático** (§9.2 do plano de confiabilidade). Fica de fora: com o resumo gravado a cada turno e a triagem preenchendo `categoria`, o que o encerramento adicionaria é marginal.

## 12. Ordem de commits

1. `feat(ai): custo estimado por run e gasto mensal por organização` (Fase 0.1–0.2)
2. `feat(ai): limite mensal de créditos e alerta de 80%` (Fase 0.2–0.4)
3. `feat(chats): presença da IA na thread e na caixa de entrada` (Fase 1.1–1.2)
4. `feat(chats): card de resumo do atendimento e vínculo mensagem → execução` (Fase 1.3–1.4)
5. `feat(chats): histórico de execuções da IA por atendimento` (Fase 1.5)
6. `feat(ai): schema e configuração de retomadas` (Fase 2.1–2.2, migration)
7. `feat(ai): decisão de retomada na saída do turno e guarda de agendamento` (Fase 2.3–2.5)
8. `feat(ai): executor de retomadas (cron + fila) e gatilho RETOMADA` (Fase 2.6)
9. `feat(chats): retomadas na UI e nas estatísticas` (Fase 2.7)
10. `feat(chats): modo assistência — sugerir, reescrever, resumir` (Fase 3)
11. `chore(ai): bump ai para 7.0.111` (Fase 4.1)
12. `feat(ai): contexto compacto e cache de prefixo` (Fase 4.4)
13. `feat(ai): triagem pré-run com Jev atrás de flags + replay offline` (Fase 4.2–4.6)
14. `feat(ai): pendência de cliente inativo para a agenda do vendedor` (Fase 2.8)
