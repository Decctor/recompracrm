import type { TInternalLeadActivityStatusEnum, TInternalLeadActivityTypeEnum } from "@/schemas/enums";
import { relations } from "drizzle-orm";
import { index, integer, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable, users } from ".";
import { internalLeadActivityTemplates } from "./internal-lead-activity-templates";
import { internalLeads } from "./internal-leads";

export type TActivityRecurrence = {
	tipo: "DIARIO" | "SEMANAL" | "MENSAL";
	intervalo: number;
	dataFim: string | null;
};

export type TActivityReminder = {
	minutosAntes: number;
	notificado: boolean;
};

export const internalLeadActivities = newTable(
	"internal_lead_activities",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		leadId: varchar("lead_id", { length: 255 })
			.references(() => internalLeads.id, { onDelete: "cascade" })
			.notNull(),
		tipo: text("tipo").$type<TInternalLeadActivityTypeEnum>().notNull(),
		titulo: text("titulo").notNull(),
		descricao: text("descricao"),
		status: text("status").$type<TInternalLeadActivityStatusEnum>().notNull().default("PENDENTE"),
		dataAgendada: timestamp("data_agendada").notNull(),
		dataConclusao: timestamp("data_conclusao"),
		duracaoMinutos: integer("duracao_minutos"),
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		recorrencia: jsonb("recorrencia").$type<TActivityRecurrence>(),
		templateId: varchar("template_id", { length: 255 }).references(() => internalLeadActivityTemplates.id, {
			onDelete: "set null",
		}),
		lembrete: jsonb("lembrete").$type<TActivityReminder>(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		leadIdx: index("idx_internal_lead_activities_lead").on(table.leadId),
		statusIdx: index("idx_internal_lead_activities_status").on(table.status),
		dataAgendadaIdx: index("idx_internal_lead_activities_data_agendada").on(table.dataAgendada),
		autorIdx: index("idx_internal_lead_activities_autor").on(table.autorId),
	}),
);

export const internalLeadActivitiesRelations = relations(internalLeadActivities, ({ one }) => ({
	lead: one(internalLeads, {
		fields: [internalLeadActivities.leadId],
		references: [internalLeads.id],
	}),
	autor: one(users, {
		fields: [internalLeadActivities.autorId],
		references: [users.id],
	}),
	template: one(internalLeadActivityTemplates, {
		fields: [internalLeadActivities.templateId],
		references: [internalLeadActivityTemplates.id],
	}),
}));

export type TInternalLeadActivityEntity = typeof internalLeadActivities.$inferSelect;
export type TNewInternalLeadActivityEntity = typeof internalLeadActivities.$inferInsert;
