import { relations } from "drizzle-orm";
import { index, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable, users } from ".";
import { internalLeads } from "./internal-leads";

export const internalLeadStageHistory = newTable(
	"internal_lead_stage_history",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		leadId: varchar("lead_id", { length: 255 })
			.references(() => internalLeads.id, { onDelete: "cascade" })
			.notNull(),
		statusAnterior: text("status_anterior"),
		statusNovo: text("status_novo").notNull(),
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		dataTransicao: timestamp("data_transicao").defaultNow().notNull(),
	},
	(table) => ({
		leadIdx: index("idx_internal_lead_stage_history_lead").on(table.leadId),
	}),
);

export const internalLeadStageHistoryRelations = relations(internalLeadStageHistory, ({ one }) => ({
	lead: one(internalLeads, {
		fields: [internalLeadStageHistory.leadId],
		references: [internalLeads.id],
	}),
	autor: one(users, {
		fields: [internalLeadStageHistory.autorId],
		references: [users.id],
	}),
}));

export type TInternalLeadStageHistoryEntity = typeof internalLeadStageHistory.$inferSelect;
export type TNewInternalLeadStageHistoryEntity = typeof internalLeadStageHistory.$inferInsert;
