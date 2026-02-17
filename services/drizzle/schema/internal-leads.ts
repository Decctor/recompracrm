import type { TInternalLeadOriginEnum, TInternalLeadStatusCRMEnum } from "@/schemas/enums";
import { relations } from "drizzle-orm";
import { doublePrecision, index, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable, organizations, users } from ".";
import { internalLeadActivities } from "./internal-lead-activities";
import { internalLeadNotes } from "./internal-lead-notes";
import { internalLeadStageHistory } from "./internal-lead-stage-history";

export const internalLeads = newTable(
	"internal_leads",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),

		// Pipeline
		statusCRM: text("status_crm").$type<TInternalLeadStatusCRMEnum>().notNull().default("NOVO"),
		posicaoKanban: integer("posicao_kanban").notNull().default(0),

		// Opportunity
		titulo: text("titulo"),
		descricao: text("descricao"),
		valor: doublePrecision("valor"),
		probabilidade: integer("probabilidade"),
		origemLead: text("origem_lead").$type<TInternalLeadOriginEnum>(),
		motivoPerda: text("motivo_perda"),

		// Organization Information
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "set null" }),
		organizacaoNome: text("organizacao_nome").notNull(),
		organizacaoCnpj: text("organizacao_cnpj").notNull(),
		organizacaoLogoUrl: text("organizacao_logo_url"),
		organizacaoTelefone: text("organizacao_telefone"),
		organizacaoEmail: text("organizacao_email"),
		organizacaoSite: text("organizacao_site"),

		// Contact Information
		contatoNome: text("contato_nome").notNull(),
		contatoEmail: text("contato_email").notNull(),
		contatoTelefone: text("contato_telefone"),
		contatoCargo: text("contato_cargo"),
		contatoUsuarioId: varchar("contato_usuario_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),

		// Assignment
		responsavelId: varchar("responsavel_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),

		// Dates
		dataProximaAtividade: timestamp("data_proxima_atividade"),
		dataUltimaAtualizacao: timestamp("data_ultima_atualizacao").defaultNow().notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		statusCrmIdx: index("idx_internal_leads_status_crm").on(table.statusCRM),
		responsavelIdx: index("idx_internal_leads_responsavel").on(table.responsavelId),
		autorIdx: index("idx_internal_leads_autor").on(table.autorId),
	}),
);

export const internalLeadsRelations = relations(internalLeads, ({ many, one }) => ({
	organizacao: one(organizations, {
		fields: [internalLeads.organizacaoId],
		references: [organizations.id],
	}),
	responsavel: one(users, {
		fields: [internalLeads.responsavelId],
		references: [users.id],
		relationName: "leadResponsavel",
	}),
	autor: one(users, {
		fields: [internalLeads.autorId],
		references: [users.id],
		relationName: "leadAutor",
	}),
	atividades: many(internalLeadActivities),
	notas: many(internalLeadNotes),
	historicoEtapas: many(internalLeadStageHistory),
}));

export type TInternalLeadEntity = typeof internalLeads.$inferSelect;
export type TNewInternalLeadEntity = typeof internalLeads.$inferInsert;
