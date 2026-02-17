import { relations } from "drizzle-orm";
import { index, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable, users } from ".";
import { internalLeads } from "./internal-leads";

export const internalLeadNotes = newTable(
	"internal_lead_notes",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		leadId: varchar("lead_id", { length: 255 })
			.references(() => internalLeads.id, { onDelete: "cascade" })
			.notNull(),
		conteudo: text("conteudo").notNull(),
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		leadIdx: index("idx_internal_lead_notes_lead").on(table.leadId),
	}),
);

export const internalLeadNotesRelations = relations(internalLeadNotes, ({ one }) => ({
	lead: one(internalLeads, {
		fields: [internalLeadNotes.leadId],
		references: [internalLeads.id],
	}),
	autor: one(users, {
		fields: [internalLeadNotes.autorId],
		references: [users.id],
	}),
}));

export type TInternalLeadNoteEntity = typeof internalLeadNotes.$inferSelect;
export type TNewInternalLeadNoteEntity = typeof internalLeadNotes.$inferInsert;
