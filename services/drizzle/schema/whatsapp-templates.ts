import type { TWhatsappTemplateComponents } from "@/schemas/whatsapp-templates";
import { relations } from "drizzle-orm";
import { index, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable, users } from ".";
import { whatsappTemplateCategoryEnum, whatsappTemplateQualityEnum, whatsappTemplateStatusEnum } from "./enums";
import { organizations } from "./organizations";
import { whatsappConnectionPhones } from "./whatsapp-connections";

export const whatsappTemplates = newTable("whatsapp_templates", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
	nome: text("nome").notNull(),
	categoria: whatsappTemplateCategoryEnum("categoria").notNull(),
	componentes: jsonb("componentes").$type<TWhatsappTemplateComponents>().notNull(),
	autorId: varchar("autor_id", { length: 255 })
		.references(() => users.id)
		.notNull(),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});
export const whatsappTemplateRelations = relations(whatsappTemplates, ({ one, many }) => ({
	autor: one(users, {
		fields: [whatsappTemplates.autorId],
		references: [users.id],
	}),
	telefones: many(whatsappTemplatePhones),
}));
export type TWhatsappTemplate = typeof whatsappTemplates.$inferSelect;
export type TNewWhatsappTemplate = typeof whatsappTemplates.$inferInsert;

export const whatsappTemplatePhones = newTable(
	"whatsapp_template_phones",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		templateId: varchar("template_id", { length: 255 })
			.references(() => whatsappTemplates.id, { onDelete: "cascade" })
			.notNull(),
		telefoneId: varchar("telefone_id", { length: 255 })
			.references(() => whatsappConnectionPhones.id, { onDelete: "cascade" })
			.notNull(),
		whatsappTemplateId: varchar("whatsapp_template_id", { length: 255 }),
		status: whatsappTemplateStatusEnum("status").notNull().default("PENDENTE"),
		qualidade: whatsappTemplateQualityEnum("qualidade").notNull().default("PENDENTE"),
		rejeicao: text("rejeicao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").defaultNow().notNull(),
	},
	(table) => [index("whatsapp_template_phones_whatsapp_template_id_idx").on(table.whatsappTemplateId)],
);
export const whatsappTemplatePhonesRelations = relations(whatsappTemplatePhones, ({ one }) => ({
	template: one(whatsappTemplates, {
		fields: [whatsappTemplatePhones.templateId],
		references: [whatsappTemplates.id],
	}),
	telefone: one(whatsappConnectionPhones, {
		fields: [whatsappTemplatePhones.telefoneId],
		references: [whatsappConnectionPhones.id],
	}),
}));

export type TWhatsappTemplatePhone = typeof whatsappTemplatePhones.$inferSelect;
export type TNewWhatsappTemplatePhone = typeof whatsappTemplatePhones.$inferInsert;
