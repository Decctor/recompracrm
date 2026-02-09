import { relations } from "drizzle-orm";
import { boolean, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { whatsappConnectionTypeEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

export const whatsappConnections = newTable("whatsapp_connections", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 })
		.references(() => organizations.id, { onDelete: "cascade" })
		.notNull(),
	// Connection type - defaults to META_CLOUD_API for backwards compatibility
	tipoConexao: whatsappConnectionTypeEnum("tipo_conexao").notNull().default("META_CLOUD_API"),
	// Meta Cloud API fields (nullable for Internal Gateway connections)
	token: text("token"),
	dataExpiracao: timestamp("data_expiracao"),
	metaEscopo: text("meta_escopo"),
	// Internal Gateway fields (nullable for Meta Cloud API connections)
	gatewaySessaoId: varchar("gateway_sessao_id", { length: 255 }),
	gatewayStatus: varchar("gateway_status", { length: 50 }), // disconnected, connecting, qr, connected
	gatewayUltimaConexao: timestamp("gateway_ultima_conexao"),
	// Common fields
	autorId: varchar("autor_id", { length: 255 })
		.references(() => users.id)
		.notNull(),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});
export const whatsappConnectionsRelations = relations(whatsappConnections, ({ one, many }) => ({
	telefones: many(whatsappConnectionPhones),
	organizacao: one(organizations, {
		fields: [whatsappConnections.organizacaoId],
		references: [organizations.id],
	}),
}));
export type TWhatsappConnection = typeof whatsappConnections.$inferSelect;
export type TNewWhatsappConnection = typeof whatsappConnections.$inferInsert;

export const whatsappConnectionPhones = newTable("whatsapp_connection_phones", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	conexaoId: varchar("conexao_id", { length: 255 })
		.references(() => whatsappConnections.id, { onDelete: "cascade" })
		.notNull(),
	nome: text("nome").notNull(),
	// Meta Cloud API fields (nullable for Internal Gateway connections)
	whatsappBusinessAccountId: varchar("whatsapp_business_account_id", { length: 255 }),
	whatsappTelefoneId: varchar("whatsapp_telefone_id", { length: 255 }),
	// Common fields
	numero: text("numero").notNull(),
	permitirAtendimentoIa: boolean("permitir_atendimento_ia").notNull().default(false),
});
export const whatsappConnectionPhonesRelations = relations(whatsappConnectionPhones, ({ one }) => ({
	conexao: one(whatsappConnections, {
		fields: [whatsappConnectionPhones.conexaoId],
		references: [whatsappConnections.id],
	}),
}));

export type TWhatsappConnectionPhone = typeof whatsappConnectionPhones.$inferSelect;
export type TNewWhatsappConnectionPhone = typeof whatsappConnectionPhones.$inferInsert;
