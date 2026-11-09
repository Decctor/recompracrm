import type {
	TOrganizationConfiguration,
	TOrganizationIntegrationConfig,
	TOrganizationMemberPermissions,
	TOrganizationFiscalConfig,
	TOrganizationPoiConfig,
} from "@/schemas/organizations";
import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { deals } from "./deals";
import { defaultDataSourceEnum, fiscalProviderEnum, organizationIntegrationTypeEnum, paymentProviderEnum, stripeAccountEnum } from "./enums";
import { sellers } from "./sellers";
import { users } from "./users";

export const organizations = newTable(
	"organizations",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		nome: text("nome").notNull(),
		// Endereço público da loja (/shop/{slug}). Único e obrigatório: a rota pública resolve a
		// organização exclusivamente por ele (docs/dev-planning/org-slug-shop-links-plan.md).
		slug: text("slug").notNull(),
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
		// Marks the moment the deep onboarding flow was concluded. Null = onboarding in progress (dashboard is gated, user is bounced back).
		dataOnboardingConclusao: timestamp("data_onboarding_conclusao"),
		// Stripe
		// Conta Stripe dona do customer/assinatura abaixo. Toda chamada sobre eles usa o client
		// dessa conta (services/stripe). Nulo enquanto não há customer.
		stripeConta: stripeAccountEnum("stripe_conta"),
		stripeCustomerId: text("stripe_customer_id"),
		stripeSubscriptionId: text("stripe_subscription_id"),
		stripeSubscriptionStatus: text("stripe_subscription_status"),
		stripeSubscriptionStatusUltimaAlteracao: timestamp("stripe_subscription_status_ultima_alteracao"),
		// Até quando pagamentos confirmados (invoice.paid) garantem acesso — period.end da linha
		// recorrente do invoice. Só avança (GREATEST), nunca recua por evento atrasado.
		assinaturaPeriodoPagoFim: timestamp("assinatura_periodo_pago_fim"),
		// Até quando uma cobrança pendente (boleto emitido / PIX aguardando) libera acesso otimista.
		// Nenhum evento revoga: o acesso expira sozinho quando a data passa.
		assinaturaAcessoProvisorioFim: timestamp("assinatura_acesso_provisorio_fim"),

		assinaturaPlano: text("assinatura_plano").default("ESSENCIAL"),
		// Deal (venda B2B multi-licença): quando presente, a assinatura desta org é governada
		// pelo deal — o webhook replica o status para cá e os campos stripe* acima ficam nulos.
		dealId: varchar("deal_id", { length: 255 }).references(() => deals.id, { onDelete: "set null" }),
		dadosViaERP: boolean("dados_via_erp").notNull().default(false),
		dadosViaPDI: boolean("dados_via_pdi").notNull().default(false),
		dadosViaIntegracoes: boolean("dados_via_integracoes").notNull().default(false),
		// ERP: modo padrão de processamento de dados
		origemDadosPadrao: defaultDataSourceEnum("origem_dados_padrao").default("RECEPTOR"),
		integracaoTipo: organizationIntegrationTypeEnum("integracao_tipo"),
		integracaoConfiguracao: jsonb("integracao_configuracao").$type<TOrganizationIntegrationConfig>(),
		integracaoDataUltimaSincronizacao: timestamp("integracao_data_ultima_sincronizacao"),
		periodoTesteInicio: timestamp("periodo_teste_inicio"),
		periodoTesteFim: timestamp("periodo_teste_fim"),
		// Consultoria / FDE (add-on à plataforma — não altera capabilities do plano).
		// consultoriaAtiva: a conta é operada por nós (gestor de crescimento dedicado).
		consultoriaAtiva: boolean("consultoria_ativa").notNull().default(false),
		// baselineInicio: marco a partir do qual passamos a operar a conta.
		// Dados anteriores a esta data = baseline; posteriores = resultado da nossa gestão.
		baselineInicio: timestamp("baseline_inicio"),
		// Custom Colors
		corPrimaria: text("cor_primaria"), // Primary/brand color (hex format, e.g., #FFB900)
		corPrimariaForeground: text("cor_primaria_foreground"), // Foreground for primary color (hex, e.g., #000000)
		corSecundaria: text("cor_secundaria"), // Secondary color (hex format, e.g., #15599a)
		corSecundariaForeground: text("cor_secundaria_foreground"), // Foreground for secondary color (hex, e.g., #FFFFFF)
		poiQrCodeKioskDataUrl: text("poi_qr_code_kiosk_data_url"),
		poiQrCodeMobileDataUrl: text("poi_qr_code_mobile_data_url"),
		poiConfirmacaoValorObrigatoria: boolean("poi_confirmacao_valor_obrigatoria").notNull().default(false),
		// Config própria do POI (D8): registro de vendas explícito, não derivado das integrações.
		// Null = org criada antes do backfill — leitores tratam como "sem fonte ativa ⇒ registra".
		poiConfiguracao: jsonb("poi_configuracao").$type<TOrganizationPoiConfig>(),
		configuracao: jsonb("configuracao").$type<TOrganizationConfiguration>().notNull(),

		// Fiscal config
		fiscalProvedor: fiscalProviderEnum("fiscal_provedor"),
		fiscalEmissaoAutomatica: boolean("fiscal_emissao_automatica").default(false).notNull(),
		fiscalConfiguracao: jsonb("fiscal_configuracao").$type<TOrganizationFiscalConfig>(),

		// Payment provider config
		pagamentoProvedor: paymentProviderEnum("pagamento_provedor"),
		pagamentoConfiguracao: jsonb("pagamento_configuracao"),

		autorId: varchar("autor_id", { length: 255 })
			.references(() => users.id)
			.notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		slugIdx: uniqueIndex("idx_organizations_slug").on(table.slug),
	}),
);
export const organizationsRelations = relations(organizations, ({ one, many }) => ({
	autor: one(users, {
		fields: [organizations.autorId],
		references: [users.id],
	}),
	deal: one(deals, {
		fields: [organizations.dealId],
		references: [deals.id],
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
	permissoes: jsonb("permissoes").$type<TOrganizationMemberPermissions>().notNull(),
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
	telefone: text("telefone"), // opcional — quando preenchido, o convite também é entregue por WhatsApp
	vendedorAplicavel: boolean("vendedor_aplicavel").notNull().default(false), // defines whether or not the new user should be attributed to a seller
	vendedorId: varchar("vendedor_id", { length: 255 }).references(() => sellers.id),
	permissoes: jsonb("permissoes").$type<TOrganizationMemberPermissions>().notNull(),
	autorId: varchar("autor_id", { length: 255 }).references(() => users.id),
	dataEfetivacao: timestamp("data_efetivacao"),
	dataExpiracao: timestamp("data_expiracao").notNull(),
});
export type TOrganizationMembershipInvitationEntity = typeof organizationMembershipInvitations.$inferSelect;
export type TNewOrganizationMembershipInvitationEntity = typeof organizationMembershipInvitations.$inferInsert;
