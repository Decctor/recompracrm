import { relations } from "drizzle-orm";
import { integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable, users } from ".";
import type { TInternalLeadActivityTypeEnum } from "@/schemas/enums";

export const internalLeadActivityTemplates = newTable("internal_lead_activity_templates", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	nome: text("nome").notNull(),
	tipo: text("tipo").$type<TInternalLeadActivityTypeEnum>().notNull(),
	descricaoPadrao: text("descricao_padrao"),
	duracaoPadraoMinutos: integer("duracao_padrao_minutos"),
	autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});

export const internalLeadActivityTemplatesRelations = relations(internalLeadActivityTemplates, ({ one }) => ({
	autor: one(users, {
		fields: [internalLeadActivityTemplates.autorId],
		references: [users.id],
	}),
}));

export type TInternalLeadActivityTemplateEntity = typeof internalLeadActivityTemplates.$inferSelect;
export type TNewInternalLeadActivityTemplateEntity = typeof internalLeadActivityTemplates.$inferInsert;
