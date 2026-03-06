import { relations } from "drizzle-orm";
import { index, integer, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { campaignFlowNodes, campaignFlows } from "./campaign-flows";
import { clients } from "./clients";
import { newTable } from "./common";
import { campaignFlowExecutionStatusEnum, campaignFlowExecutionStepStatusEnum, campaignFlowExecutionTypeEnum } from "./enums";
import { organizations } from "./organizations";

// ============================================================================
// CAMPAIGN FLOW EXECUTIONS
// ============================================================================

export const campaignFlowExecutions = newTable(
	"campaign_flow_executions",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		campanhaId: varchar("campanha_id", { length: 255 })
			.references(() => campaignFlows.id, { onDelete: "cascade" })
			.notNull(),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		tipo: campaignFlowExecutionTypeEnum("tipo").notNull(),

		// Individual execution (event-driven)
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "cascade" }),
		eventoTipo: text("evento_tipo"),
		eventoMetadados: jsonb("evento_metadados"),

		// Batch execution (recurrent/one-time)
		loteTotalClientes: integer("lote_total_clientes"),
		loteClientesProcessados: integer("lote_clientes_processados").default(0),

		// Status
		status: campaignFlowExecutionStatusEnum("status").notNull().default("PENDENTE"),
		dataInicio: timestamp("data_inicio"),
		dataConclusao: timestamp("data_conclusao"),
		erro: text("erro"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),

		// Vercel Workflow tracking
		vercelWorkflowRunId: text("vercel_workflow_run_id"),
	},
	(table) => ({
		campanhaStatusIdx: index("idx_cf_executions_campanha").on(table.campanhaId, table.status),
	}),
);

export const campaignFlowExecutionRelations = relations(campaignFlowExecutions, ({ one, many }) => ({
	campanha: one(campaignFlows, {
		fields: [campaignFlowExecutions.campanhaId],
		references: [campaignFlows.id],
	}),
	cliente: one(clients, {
		fields: [campaignFlowExecutions.clienteId],
		references: [clients.id],
	}),
	steps: many(campaignFlowExecutionSteps),
}));

export type TCampaignFlowExecutionEntity = typeof campaignFlowExecutions.$inferSelect;
export type TNewCampaignFlowExecutionEntity = typeof campaignFlowExecutions.$inferInsert;

// ============================================================================
// CAMPAIGN FLOW EXECUTION STEPS
// ============================================================================

export const campaignFlowExecutionSteps = newTable(
	"campaign_flow_execution_steps",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		execucaoId: varchar("execucao_id", { length: 255 })
			.references(() => campaignFlowExecutions.id, { onDelete: "cascade" })
			.notNull(),
		noId: varchar("no_id", { length: 255 })
			.references(() => campaignFlowNodes.id, { onDelete: "cascade" })
			.notNull(),
		clienteId: varchar("cliente_id", { length: 255 })
			.references(() => clients.id, { onDelete: "cascade" })
			.notNull(),

		// Status
		status: campaignFlowExecutionStepStatusEnum("status").notNull().default("PENDENTE"),
		resultado: jsonb("resultado"),
		erro: text("erro"),

		// Delay tracking
		delayAte: timestamp("delay_ate"),

		// Timestamps
		dataInicio: timestamp("data_inicio"),
		dataConclusao: timestamp("data_conclusao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		execucaoStatusIdx: index("idx_cf_steps_execucao").on(table.execucaoId, table.status),
		clienteNoIdx: index("idx_cf_steps_cliente").on(table.clienteId, table.noId),
	}),
);

export const campaignFlowExecutionStepRelations = relations(campaignFlowExecutionSteps, ({ one }) => ({
	execucao: one(campaignFlowExecutions, {
		fields: [campaignFlowExecutionSteps.execucaoId],
		references: [campaignFlowExecutions.id],
	}),
	no: one(campaignFlowNodes, {
		fields: [campaignFlowExecutionSteps.noId],
		references: [campaignFlowNodes.id],
	}),
	cliente: one(clients, {
		fields: [campaignFlowExecutionSteps.clienteId],
		references: [clients.id],
	}),
}));

export type TCampaignFlowExecutionStepEntity = typeof campaignFlowExecutionSteps.$inferSelect;
export type TNewCampaignFlowExecutionStepEntity = typeof campaignFlowExecutionSteps.$inferInsert;
