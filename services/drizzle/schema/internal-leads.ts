import { text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable, organizations, users } from ".";

export const internalLeads = newTable("internal_leads", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),

	statusCRM: text("status_crm").notNull().default("PENDENTE"),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "set null" }),
	organizacaoNome: text("organizacao_nome").notNull(),
	organizacaoCnpj: text("organizacao_cnpj").notNull(),
	organizacaoLogoUrl: text("organizacao_logo_url"),
	organizacaoTelefone: text("organizacao_telefone"),
	organizacaoEmail: text("organizacao_email"),
	organizacaoSite: text("organizacao_site"),

	contatoNome: text("contato_nome").notNull(),
	contatoEmail: text("contato_email").notNull(),
	contatoTelefone: text("contato_telefone"),
	contatoCargo: text("contato_cargo"),
	contatoUsuarioId: varchar("contato_usuario_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),

	autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
	dataUltimaAtualizacao: timestamp("data_ultima_atualizacao").defaultNow().notNull(),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});

export type TInternalLeadEntity = typeof internalLeads.$inferSelect;
export type TNewInternalLeadEntity = typeof internalLeads.$inferInsert;
