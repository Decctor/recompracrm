import type { TOrganizationConfiguration, TOrganizationIntegrationConfig } from "@/schemas/organizations";
import type { TUserPermissions } from "@/schemas/users";
import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable, organizationIntegrationTypeEnum, sellers, users } from ".";

export const organizations = newTable("organizations", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	nome: text("nome").notNull(),
	cnpj: text("cnpj").notNull(),
	logoUrl: text("logo_url"),
	telefone: text("telefone"),
	email: text("email"),
	localizacaoCep: text("localizacao_cep"),
	localizacaoEstado: text("localizacao_estado"),
	localizacaoCidade: text("localizacao_cidade"),
	localizacaoBairro: text("localizacao_bairro"),
	localizacaoLogradouro: text("localizacao_logradouro"),
	localizacaoNumero: text("localizacao_numero"),
	localizacaoComplemento: text("localizacao_complemento"),
	// Onboarding + Marketing + Commercial Data (for us)
	atuacaoNicho: text("atuacao_nicho"), // Alimentação, Construção, Moda, Perfumaria, etc.
	atuacaoCanais: text("atuacao_canais"), // Loja física, e-commerce, marketplaces, etc (separated by comma)
	tamanhoBaseClientes: integer("tamanho_base_clientes"),
	plataformasUtilizadas: text("plataformas_utilizadas"), // Shopify, WooCommerce, Magento, etc (separated by comma)
	origemLead: text("origem_lead"), // How did you hear about us? (Instagram, Google, Linkedin, etc)

	// Stripe
	stripeCustomerId: text("stripe_customer_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	stripeSubscriptionStatus: text("stripe_subscription_status"),

	assinaturaPlano: text("assinatura_plano").default("ESSENCIAL"),
	dadosViaERP: boolean("dados_via_erp").notNull().default(false),
	dadosViaPDI: boolean("dados_via_pdi").notNull().default(false),
	dadosViaIntegracoes: boolean("dados_via_integracoes").notNull().default(false),
	integracaoTipo: organizationIntegrationTypeEnum("integracao_tipo"),
	integracaoConfiguracao: jsonb("integracao_configuracao").$type<TOrganizationIntegrationConfig>(),
	integracaoDataUltimaSincronizacao: timestamp("integracao_data_ultima_sincronizacao"),
	periodoTesteInicio: timestamp("periodo_teste_inicio"),
	periodoTesteFim: timestamp("periodo_teste_fim"),
	// Custom Colors
	corPrimaria: text("cor_primaria"), // Primary/brand color (hex format, e.g., #FFB900)
	corPrimariaForeground: text("cor_primaria_foreground"), // Foreground for primary color (hex, e.g., #000000)
	corSecundaria: text("cor_secundaria"), // Secondary color (hex format, e.g., #15599a)
	corSecundariaForeground: text("cor_secundaria_foreground"), // Foreground for secondary color (hex, e.g., #FFFFFF)
	configuracao: jsonb("configuracao").$type<TOrganizationConfiguration>().notNull(),
	autorId: varchar("autor_id", { length: 255 })
		.references(() => users.id)
		.notNull(),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});
export const organizationsRelations = relations(organizations, ({ one, many }) => ({
	autor: one(users, {
		fields: [organizations.autorId],
		references: [users.id],
	}),
	membros: many(organizationMembers),
}));
export type TOrganizationEntity = typeof organizations.$inferSelect;
export type TNewOrganizationEntity = typeof organizations.$inferInsert;

export const organizationMembers = newTable("organization_members", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 })
		.references(() => organizations.id, {
			onDelete: "cascade",
		})
		.notNull(),
	usuarioId: varchar("usuario_id", { length: 255 }).references(() => users.id),
	usuarioVendedorId: varchar("usuario_vendedor_id", { length: 255 }).references(() => sellers.id),
	permissoes: jsonb("permissoes").$type<TUserPermissions>().notNull(),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});
export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [organizationMembers.organizacaoId],
		references: [organizations.id],
	}),
	usuario: one(users, {
		fields: [organizationMembers.usuarioId],
		references: [users.id],
	}),
	vendedor: one(sellers, {
		fields: [organizationMembers.usuarioVendedorId],
		references: [sellers.id],
	}),
}));
export type TOrganizationMemberEntity = typeof organizationMembers.$inferSelect;
export type TNewOrganizationMemberEntity = typeof organizationMembers.$inferInsert;

export const organizationMembershipInvitations = newTable("organization_membership_invitations", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 })
		.references(() => organizations.id, { onDelete: "cascade" })
		.notNull(),
	nome: text("nome").notNull(),
	email: text("email").notNull(),
	vendedorAplicavel: boolean("vendedor_aplicavel").notNull().default(false), // defines whether or not the new user should be attributed to a seller
	vendedorId: varchar("vendedor_id", { length: 255 }).references(() => sellers.id),
	permissoes: jsonb("permissoes").$type<TUserPermissions>().notNull(),
	autorId: varchar("autor_id", { length: 255 }).references(() => users.id),
	dataEfetivacao: timestamp("data_efetivacao"),
	dataExpiracao: timestamp("data_expiracao").notNull(),
});
export type TOrganizationMembershipInvitationEntity = typeof organizationMembershipInvitations.$inferSelect;
export type TNewOrganizationMembershipInvitationEntity = typeof organizationMembershipInvitations.$inferInsert;
