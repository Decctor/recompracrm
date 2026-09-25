import type { TAiAgentCapabilities, TAiAgentConfigSnapshot, TAiAgentModelConfig, TAiAgentScope, TAiAgentUsage } from "@/schemas/ai-agents";
import type {
	TAiAgentFollowUpStatusEnum,
	TAiAgentRunTriggerEnum,
	TAiAgentRunStatusEnum,
	TAiAgentStatusEnum,
	TAiAgentOperationResourceTypeEnum,
	TAiAgentOperationStatusEnum,
	TAiAgentOperationTypeEnum,
	TAiAgentToolCallStatusEnum,
	TAiAgentToolNameEnum,
} from "@/schemas/enums";
import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { chatAssignments, chatMessages, chats } from "./chats";
import { newTable } from "./common";
import { organizations } from "./organizations";

/**
 * Agentes de IA de atendimento.
 *
 * Direção de import deliberada: este arquivo importa `chats.ts`, nunca o contrário. É por isso
 * que `chat_assignments.responsavelAgenteId` não tem FK para `aiAgents` — a FK inversa criaria
 * um ciclo entre os módulos de schema.
 *
 * Mesmo desvio consciente de `chat_assignments` quanto a enums: status, gatilho e nome de
 * ferramenta são varchar + `$type<...>` + validação Zod (`schemas/enums.ts`). `ALTER TYPE` em
 * migration manual é doloroso e novos valores devem ser baratos.
 */

// ============================================================================
// AGENTE
// ============================================================================

/**
 * Um agente por organização (garantido pelo índice único). O runtime lê **esta** configuração
 * — não há versionamento; cada execução grava o snapshot da config que a produziu.
 */
export const aiAgents = newTable(
	"ai_agents",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		nome: varchar("nome", { length: 255 }).notNull().default("Agente de Atendimento"),
		// PAUSADO continua editável; o runtime recusa executar.
		status: varchar("status", { length: 32 }).$type<TAiAgentStatusEnum>().notNull().default("ATIVO"),
		// Persona, tom e regras da organização. Vira a primeira camada do system prompt.
		instrucoes: text("instrucoes").notNull(),
		modeloConfig: jsonb("modelo_config").$type<TAiAgentModelConfig>().notNull(),
		capacidades: jsonb("capacidades").$type<TAiAgentCapabilities>().notNull(),
		// Quem o agente atende. Config viva de implantação: fica FORA de `configSnapshot` de
		// propósito — uma lista de clientes copiada em toda run inflaria `ai_agent_runs` sem
		// nenhum ganho de auditoria. Vale imediatamente, sem republicar nada.
		escopo: jsonb("escopo").$type<TAiAgentScope>().notNull().default({ tipo: "TODOS", clienteIds: [] }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$onUpdate(() => new Date()),
	},
	(table) => [uniqueIndex("ai_agents_organizacao_unica_idx").on(table.organizacaoId)],
);
export const aiAgentsRelations = relations(aiAgents, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [aiAgents.organizacaoId],
		references: [organizations.id],
	}),
	conhecimento: many(aiAgentKnowledge),
	execucoes: many(aiAgentRuns),
	operacoes: many(aiAgentOperations),
	retomadas: many(aiAgentFollowUps),
}));
export type TAiAgentEntity = typeof aiAgents.$inferSelect;
export type TNewAiAgentEntity = typeof aiAgents.$inferInsert;

// ============================================================================
// BASE DE CONHECIMENTO
// ============================================================================

/**
 * Blocos de texto injetados no system prompt (políticas, horários, FAQ, diferenciais).
 *
 * Modelados em tabela — e não como um campo `text` no agente — para permitir ativar/desativar
 * individualmente e, quando o volume justificar, virar a unidade de chunking/embedding de um
 * RAG sem mudança conceitual.
 */
export const aiAgentKnowledge = newTable(
	"ai_agent_knowledge",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		agenteId: varchar("agente_id", { length: 255 })
			.references(() => aiAgents.id, { onDelete: "cascade" })
			.notNull(),
		titulo: varchar("titulo", { length: 255 }).notNull(),
		conteudo: text("conteudo").notNull(),
		ativo: boolean("ativo").notNull().default(true),
		ordem: integer("ordem").notNull().default(0),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$onUpdate(() => new Date()),
	},
	(table) => [index("idx_ai_agent_knowledge_agente_ativo").on(table.agenteId, table.ativo)],
);
export const aiAgentKnowledgeRelations = relations(aiAgentKnowledge, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [aiAgentKnowledge.organizacaoId],
		references: [organizations.id],
	}),
	agente: one(aiAgents, {
		fields: [aiAgentKnowledge.agenteId],
		references: [aiAgents.id],
	}),
}));
export type TAiAgentKnowledgeEntity = typeof aiAgentKnowledge.$inferSelect;
export type TNewAiAgentKnowledgeEntity = typeof aiAgentKnowledge.$inferInsert;

// ============================================================================
// EXECUÇÕES
// ============================================================================

/**
 * Uma execução do agente sobre um chat. É a fonte primária de observabilidade: o que foi
 * decidido, com qual configuração, gastando quantos tokens, e o que falhou.
 */
export const aiAgentRuns = newTable(
	"ai_agent_runs",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		agenteId: varchar("agente_id", { length: 255 })
			.references(() => aiAgents.id, { onDelete: "cascade" })
			.notNull(),
		status: varchar("status", { length: 32 }).$type<TAiAgentRunStatusEnum>().notNull().default("PENDENTE"),
		gatilho: varchar("gatilho", { length: 32 }).$type<TAiAgentRunTriggerEnum>().notNull(),
		chatId: varchar("chat_id", { length: 255 })
			.references(() => chats.id, { onDelete: "cascade" })
			.notNull(),
		// Denormalizado (sem FK): o run sobrevive à troca de cliente do chat.
		clienteId: varchar("cliente_id", { length: 255 }),
		// Mensagem do cliente que disparou a execução.
		mensagemGatilhoId: varchar("mensagem_gatilho_id", { length: 255 }),
		// Mensagem que a execução produziu — vínculo canônico run → mensagem.
		mensagemEnviadaId: varchar("mensagem_enviada_id", { length: 255 }).references(() => chatMessages.id, { onDelete: "set null" }),
		configSnapshot: jsonb("config_snapshot").$type<TAiAgentConfigSnapshot>().notNull(),
		contextoEntradaSnapshot: jsonb("contexto_entrada_snapshot"),
		outputResumo: text("output_resumo"),
		uso: jsonb("uso").$type<TAiAgentUsage>(),
		erro: text("erro"),
		dataInicio: timestamp("data_inicio"),
		dataFim: timestamp("data_fim"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => [
		index("idx_ai_agent_runs_organizacao_data").on(table.organizacaoId, table.dataInsercao.desc()),
		index("idx_ai_agent_runs_agente_status").on(table.agenteId, table.status),
		index("idx_ai_agent_runs_chat").on(table.chatId),
	],
);
export const aiAgentRunsRelations = relations(aiAgentRuns, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [aiAgentRuns.organizacaoId],
		references: [organizations.id],
	}),
	agente: one(aiAgents, {
		fields: [aiAgentRuns.agenteId],
		references: [aiAgents.id],
	}),
	chat: one(chats, {
		fields: [aiAgentRuns.chatId],
		references: [chats.id],
	}),
	mensagemEnviada: one(chatMessages, {
		fields: [aiAgentRuns.mensagemEnviadaId],
		references: [chatMessages.id],
	}),
	chamadasFerramentas: many(aiAgentToolCalls),
	operacoes: many(aiAgentOperations),
}));
export type TAiAgentRunEntity = typeof aiAgentRuns.$inferSelect;
export type TNewAiAgentRunEntity = typeof aiAgentRuns.$inferInsert;

// ============================================================================
// OPERAÇÕES DURÁVEIS
// ============================================================================

/**
 * Uma operação lógica mutável iniciada pelo agente. Diferente de uma tool call: retries e runs
 * distintos podem apontar para a mesma operação sem repetir o efeito de negócio.
 */
export const aiAgentOperations = newTable(
	"ai_agent_operations",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		agenteId: varchar("agente_id", { length: 255 })
			.references(() => aiAgents.id, { onDelete: "cascade" })
			.notNull(),
		runId: varchar("run_id", { length: 255 }).references(() => aiAgentRuns.id, { onDelete: "set null" }),
		tipo: varchar("tipo", { length: 64 }).$type<TAiAgentOperationTypeEnum>().notNull(),
		chave: varchar("chave", { length: 255 }).notNull(),
		inputHash: varchar("input_hash", { length: 64 }).notNull(),
		status: varchar("status", { length: 32 }).$type<TAiAgentOperationStatusEnum>().notNull().default("PROCESSANDO"),
		input: jsonb("input"),
		output: jsonb("output"),
		recursoTipo: varchar("recurso_tipo", { length: 64 }).$type<TAiAgentOperationResourceTypeEnum>(),
		recursoId: varchar("recurso_id", { length: 255 }),
		erro: text("erro"),
		leaseAte: timestamp("lease_ate").notNull(),
		dataInicio: timestamp("data_inicio").defaultNow().notNull(),
		dataFim: timestamp("data_fim"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("ai_agent_operations_org_tipo_chave_idx").on(table.organizacaoId, table.tipo, table.chave),
		index("ai_agent_operations_agent_status_idx").on(table.agenteId, table.status),
		index("ai_agent_operations_resource_idx").on(table.recursoTipo, table.recursoId),
	],
);
export const aiAgentOperationsRelations = relations(aiAgentOperations, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [aiAgentOperations.organizacaoId],
		references: [organizations.id],
	}),
	agente: one(aiAgents, {
		fields: [aiAgentOperations.agenteId],
		references: [aiAgents.id],
	}),
	run: one(aiAgentRuns, {
		fields: [aiAgentOperations.runId],
		references: [aiAgentRuns.id],
	}),
	chamadas: many(aiAgentToolCalls),
}));
export type TAiAgentOperationEntity = typeof aiAgentOperations.$inferSelect;
export type TNewAiAgentOperationEntity = typeof aiAgentOperations.$inferInsert;

/**
 * Auditoria de cada chamada de ferramenta. A linha nasce **antes** da execução (status
 * EXECUTANDO), de modo que uma ferramenta que trave ou derrube o processo ainda deixa rastro.
 */
export const aiAgentToolCalls = newTable(
	"ai_agent_tool_calls",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		runId: varchar("run_id", { length: 255 })
			.references(() => aiAgentRuns.id, { onDelete: "cascade" })
			.notNull(),
		agenteId: varchar("agente_id", { length: 255 })
			.references(() => aiAgents.id, { onDelete: "cascade" })
			.notNull(),
		operacaoId: varchar("operacao_id", { length: 255 }).references(() => aiAgentOperations.id, { onDelete: "set null" }),
		ferramentaNome: varchar("ferramenta_nome", { length: 128 }).$type<TAiAgentToolNameEnum>().notNull(),
		status: varchar("status", { length: 32 }).$type<TAiAgentToolCallStatusEnum>().notNull().default("EXECUTANDO"),
		// Input já validado pelo schema Zod da ferramenta.
		input: jsonb("input"),
		output: jsonb("output"),
		erro: text("erro"),
		dataExecucao: timestamp("data_execucao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => [index("idx_ai_agent_tool_calls_run_status").on(table.runId, table.status)],
);
export const aiAgentToolCallsRelations = relations(aiAgentToolCalls, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [aiAgentToolCalls.organizacaoId],
		references: [organizations.id],
	}),
	run: one(aiAgentRuns, {
		fields: [aiAgentToolCalls.runId],
		references: [aiAgentRuns.id],
	}),
	agente: one(aiAgents, {
		fields: [aiAgentToolCalls.agenteId],
		references: [aiAgents.id],
	}),
	operacao: one(aiAgentOperations, {
		fields: [aiAgentToolCalls.operacaoId],
		references: [aiAgentOperations.id],
	}),
}));
export type TAiAgentToolCallEntity = typeof aiAgentToolCalls.$inferSelect;
export type TNewAiAgentToolCallEntity = typeof aiAgentToolCalls.$inferInsert;

// ============================================================================
// RETOMADAS
// ============================================================================

/**
 * Retomada de conversa decidida pelo agente (`retomada` na saída do turno) e executada por
 * cron quando o cliente fica em silêncio até `agendadaPara`.
 *
 * Amarrada ao episódio de atendimento (`atendimentoId`, cascade): se o ticket encerra, a
 * retomada morre com ele. Um chat tem no máximo uma retomada AGENDADA (índice parcial) — o turno
 * mais novo sabe mais e substitui a anterior.
 */
export const aiAgentFollowUps = newTable(
	"ai_agent_follow_ups",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		agenteId: varchar("agente_id", { length: 255 })
			.references(() => aiAgents.id, { onDelete: "cascade" })
			.notNull(),
		chatId: varchar("chat_id", { length: 255 })
			.references(() => chats.id, { onDelete: "cascade" })
			.notNull(),
		atendimentoId: varchar("atendimento_id", { length: 255 })
			.references(() => chatAssignments.id, { onDelete: "cascade" })
			.notNull(),
		// Run que decidiu retomar e run que executou a retomada.
		runOrigemId: varchar("run_origem_id", { length: 255 }).references(() => aiAgentRuns.id, { onDelete: "set null" }),
		runExecucaoId: varchar("run_execucao_id", { length: 255 }).references(() => aiAgentRuns.id, { onDelete: "set null" }),
		status: varchar("status", { length: 32 }).$type<TAiAgentFollowUpStatusEnum>().notNull().default("AGENDADA"),
		// O que o agente quer conseguir com o lembrete. Vira o prompt do turno de retomada.
		objetivo: text("objetivo").notNull(),
		agendadaPara: timestamp("agendada_para").notNull(),
		// O que o agente pediu, antes das guardas de janela e horário. Auditoria.
		solicitadaPara: timestamp("solicitada_para").notNull(),
		// Quantas vezes o executor reivindicou esta retomada; três falhas a cancelam.
		tentativa: integer("tentativa").notNull().default(0),
		motivoCancelamento: varchar("motivo_cancelamento", { length: 64 }),
		leaseAte: timestamp("lease_ate"),
		dataExecucao: timestamp("data_execucao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("ai_agent_follow_ups_chat_agendada_idx")
			.on(table.chatId)
			.where(sql`${table.status} = 'AGENDADA'`),
		index("idx_ai_agent_follow_ups_due").on(table.status, table.agendadaPara),
		index("idx_ai_agent_follow_ups_atendimento").on(table.atendimentoId),
	],
);
export const aiAgentFollowUpsRelations = relations(aiAgentFollowUps, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [aiAgentFollowUps.organizacaoId],
		references: [organizations.id],
	}),
	agente: one(aiAgents, {
		fields: [aiAgentFollowUps.agenteId],
		references: [aiAgents.id],
	}),
	chat: one(chats, {
		fields: [aiAgentFollowUps.chatId],
		references: [chats.id],
	}),
	atendimento: one(chatAssignments, {
		fields: [aiAgentFollowUps.atendimentoId],
		references: [chatAssignments.id],
	}),
	runOrigem: one(aiAgentRuns, {
		fields: [aiAgentFollowUps.runOrigemId],
		references: [aiAgentRuns.id],
	}),
	runExecucao: one(aiAgentRuns, {
		fields: [aiAgentFollowUps.runExecucaoId],
		references: [aiAgentRuns.id],
	}),
}));
export type TAiAgentFollowUpEntity = typeof aiAgentFollowUps.$inferSelect;
export type TNewAiAgentFollowUpEntity = typeof aiAgentFollowUps.$inferInsert;
