import { relations } from "drizzle-orm";
import { jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { organizations } from "./organizations";
import { users } from "./users";

export const campaignAudiences = newTable("campaign_audiences", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 })
		.references(() => organizations.id, { onDelete: "cascade" })
		.notNull(),
	titulo: text("titulo").notNull(),
	descricao: text("descricao"),
	filtros: jsonb("filtros").notNull(),
	autorId: varchar("autor_id", { length: 255 })
		.references(() => users.id)
		.notNull(),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	dataAtualizacao: timestamp("data_atualizacao"),
});

export const campaignAudienceRelations = relations(campaignAudiences, ({ one }) => ({
	autor: one(users, {
		fields: [campaignAudiences.autorId],
		references: [users.id],
	}),
}));

export type TCampaignAudienceEntity = typeof campaignAudiences.$inferSelect;
export type TNewCampaignAudienceEntity = typeof campaignAudiences.$inferInsert;
