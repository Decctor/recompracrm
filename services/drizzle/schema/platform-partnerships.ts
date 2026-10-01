import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, text, timestamp, uniqueIndex, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import {
	platformPartnerCommissionStatusEnum,
	platformPartnerPayoutStatusEnum,
	platformPartnerPersonTypeEnum,
	platformPartnerPixKeyTypeEnum,
	platformPartnerReferralStatusEnum,
	platformPartnerStatusEnum,
} from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

export type TPlatformPartnerFiles = {
	cpf?: string;
	cnpj?: string;
};

/** Pedido de alteração de dados de um parceiro ativo; só os campos que mudam. */
export type TPlatformPartnerChangeRequest = {
	email?: string;
	telefone?: string;
	chavePix?: string;
	chavePixTipo?: "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";
	arquivos?: TPlatformPartnerFiles;
	motivo?: string;
	motivoRecusa?: string;
};

export type TPlatformPartnerReferralMetadata = Record<string, unknown>;
export type TPlatformPartnerRuleSnapshot = Record<string, unknown>;
export type TPlatformPartnerInvoiceSnapshot = Record<string, unknown>;

export const platformPartners = newTable(
	"platform_partners",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		usuarioId: varchar("usuario_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		status: platformPartnerStatusEnum("status").notNull().default("PENDENTE_APROVACAO"),
		codigo: text("codigo").notNull(),
		nome: text("nome").notNull(),
		email: text("email").notNull(),
		telefone: text("telefone").notNull(),
		tipoPessoa: platformPartnerPersonTypeEnum("tipo_pessoa"),
		cpfCnpj: text("cpf_cnpj").notNull(),
		chavePix: text("chave_pix").notNull(),
		chavePixTipo: platformPartnerPixKeyTypeEnum("chave_pix_tipo"),
		// Autodeclaração: não há consulta ao DICT — o parceiro confirma que a chave está no próprio CPF/CNPJ.
		dataConfirmacaoTitularPix: timestamp("data_confirmacao_titular_pix"),
		// Caminhos no bucket privado (nunca URL pública); o admin lê por URL assinada.
		arquivos: jsonb("arquivos").$type<TPlatformPartnerFiles>().notNull().default({}),
		aceiteTermos: boolean("aceite_termos").notNull().default(false),
		dataAceiteTermos: timestamp("data_aceite_termos"),
		// Mensagem do kit de divulgação editada pelo parceiro; nulo usa o modelo padrão.
		mensagemDivulgacao: text("mensagem_divulgacao"),
		// Primeira vez que o parceiro viu o cartão emitido após a aprovação — a animação roda uma vez só.
		dataCartaoVisualizado: timestamp("data_cartao_visualizado"),
		// Lido pelo parceiro na tela de cadastro não aprovado; observacoesInternas continua interno.
		motivoRejeicao: text("motivo_rejeicao"),
		// Pedido de troca de dados de parceiro ativo, aprovado pelo financeiro. Um por vez.
		alteracaoSolicitada: jsonb("alteracao_solicitada").$type<TPlatformPartnerChangeRequest>(),
		dataSolicitacaoAlteracao: timestamp("data_solicitacao_alteracao"),
		observacoesInternas: text("observacoes_internas"),
		dataAprovacao: timestamp("data_aprovacao"),
		aprovadoPorId: varchar("aprovado_por_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$defaultFn(() => new Date()),
	},
	(table) => ({
		codigoIdx: uniqueIndex("uniq_platform_partners_codigo").on(table.codigo),
		usuarioIdIdx: index("idx_platform_partners_usuario_id").on(table.usuarioId),
		statusIdx: index("idx_platform_partners_status").on(table.status),
		emailIdx: index("idx_platform_partners_email").on(table.email),
		cpfCnpjIdx: index("idx_platform_partners_cpf_cnpj").on(table.cpfCnpj),
	}),
);

export const platformPartnerReferralEvents = newTable(
	"platform_partner_referral_events",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		partnerId: varchar("partner_id", { length: 255 })
			.references(() => platformPartners.id, { onDelete: "cascade" })
			.notNull(),
		codigoUsado: text("codigo_usado").notNull(),
		origemUrl: text("origem_url"),
		utmSource: text("utm_source"),
		utmMedium: text("utm_medium"),
		utmCampaign: text("utm_campaign"),
		ipHash: text("ip_hash"),
		userAgentHash: text("user_agent_hash"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		partnerIdIdx: index("idx_platform_partner_referral_events_partner_id").on(table.partnerId),
		codigoUsadoIdx: index("idx_platform_partner_referral_events_codigo_usado").on(table.codigoUsado),
		dataInsercaoIdx: index("idx_platform_partner_referral_events_data_insercao").on(table.dataInsercao),
	}),
);

export const platformPartnerReferrals = newTable(
	"platform_partner_referrals",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		partnerId: varchar("partner_id", { length: 255 })
			.references(() => platformPartners.id, { onDelete: "cascade" })
			.notNull(),
		// set null + snapshot do nome: o histórico de indicação sobrevive à exclusão da organização
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "set null" }),
		organizacaoNomeSnapshot: text("organizacao_nome_snapshot"),
		usuarioId: varchar("usuario_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		codigoUsado: text("codigo_usado").notNull(),
		origem: text("origem").notNull(),
		status: platformPartnerReferralStatusEnum("status").notNull().default("ORGANIZACAO_CRIADA"),
		dataCaptura: timestamp("data_captura"),
		dataOnboarding: timestamp("data_onboarding").defaultNow().notNull(),
		dataPrimeiroPagamento: timestamp("data_primeiro_pagamento"),
		metadata: jsonb("metadata").$type<TPlatformPartnerReferralMetadata>().notNull().default({}),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		partnerIdIdx: index("idx_platform_partner_referrals_partner_id").on(table.partnerId),
		organizacaoIdIdx: uniqueIndex("uniq_platform_partner_referrals_organizacao_id").on(table.organizacaoId),
		usuarioIdIdx: index("idx_platform_partner_referrals_usuario_id").on(table.usuarioId),
		statusIdx: index("idx_platform_partner_referrals_status").on(table.status),
	}),
);

export const platformPartnerPayouts = newTable(
	"platform_partner_payouts",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		partnerId: varchar("partner_id", { length: 255 })
			.references(() => platformPartners.id, { onDelete: "cascade" })
			.notNull(),
		status: platformPartnerPayoutStatusEnum("status").notNull().default("RASCUNHO"),
		competenciaInicio: timestamp("competencia_inicio").notNull(),
		competenciaFim: timestamp("competencia_fim").notNull(),
		valorTotalCentavos: integer("valor_total_centavos").notNull().default(0),
		metodo: text("metodo"),
		chavePixSnapshot: text("chave_pix_snapshot"),
		comprovanteUrl: text("comprovante_url"),
		dataPrevista: timestamp("data_prevista"),
		dataPagamento: timestamp("data_pagamento"),
		observacoes: text("observacoes"),
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$defaultFn(() => new Date()),
	},
	(table) => ({
		partnerIdIdx: index("idx_platform_partner_payouts_partner_id").on(table.partnerId),
		statusIdx: index("idx_platform_partner_payouts_status").on(table.status),
		competenciaIdx: index("idx_platform_partner_payouts_competencia").on(table.competenciaInicio, table.competenciaFim),
	}),
);

export const platformPartnerCommissions = newTable(
	"platform_partner_commissions",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		partnerId: varchar("partner_id", { length: 255 })
			.references(() => platformPartners.id, { onDelete: "cascade" })
			.notNull(),
		referralId: varchar("referral_id", { length: 255 })
			.references(() => platformPartnerReferrals.id, { onDelete: "cascade" })
			.notNull(),
		// set null: comissões preservam o histórico mesmo após a exclusão da organização
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "set null" }),
		payoutId: varchar("payout_id", { length: 255 }).references(() => platformPartnerPayouts.id, { onDelete: "set null" }),
		stripeInvoiceId: text("stripe_invoice_id"),
		stripeSubscriptionId: text("stripe_subscription_id"),
		stripeCustomerId: text("stripe_customer_id"),
		numeroInvoiceAssinatura: integer("numero_invoice_assinatura").notNull(),
		valorInvoiceBrutoCentavos: integer("valor_invoice_bruto_centavos").notNull(),
		valorConsultoriaCentavos: integer("valor_consultoria_centavos").notNull().default(0),
		valorBaseComissionavelCentavos: integer("valor_base_comissionavel_centavos").notNull(),
		percentualComissaoBps: integer("percentual_comissao_bps").notNull(),
		valorComissaoCentavos: integer("valor_comissao_centavos").notNull(),
		regraVersao: text("regra_versao").notNull(),
		regraSnapshot: jsonb("regra_snapshot").$type<TPlatformPartnerRuleSnapshot>().notNull().default({}),
		invoiceSnapshot: jsonb("invoice_snapshot").$type<TPlatformPartnerInvoiceSnapshot>().notNull().default({}),
		ajusteOrigemCommissionId: varchar("ajuste_origem_commission_id", { length: 255 }).references((): AnyPgColumn => platformPartnerCommissions.id, {
			onDelete: "set null",
		}),
		ajusteMotivo: text("ajuste_motivo"),
		status: platformPartnerCommissionStatusEnum("status").notNull().default("PENDENTE"),
		dataElegibilidade: timestamp("data_elegibilidade").notNull(),
		dataAprovacao: timestamp("data_aprovacao"),
		aprovadoPorId: varchar("aprovado_por_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		partnerIdIdx: index("idx_platform_partner_commissions_partner_id").on(table.partnerId),
		referralIdIdx: index("idx_platform_partner_commissions_referral_id").on(table.referralId),
		organizacaoIdIdx: index("idx_platform_partner_commissions_organizacao_id").on(table.organizacaoId),
		payoutIdIdx: index("idx_platform_partner_commissions_payout_id").on(table.payoutId),
		stripeInvoiceIdIdx: uniqueIndex("uniq_platform_partner_commissions_stripe_invoice_id").on(table.stripeInvoiceId),
		statusIdx: index("idx_platform_partner_commissions_status").on(table.status),
		dataElegibilidadeIdx: index("idx_platform_partner_commissions_data_elegibilidade").on(table.dataElegibilidade),
	}),
);

export const platformPartnersRelations = relations(platformPartners, ({ one, many }) => ({
	usuario: one(users, {
		fields: [platformPartners.usuarioId],
		references: [users.id],
	}),
	aprovadoPor: one(users, {
		fields: [platformPartners.aprovadoPorId],
		references: [users.id],
	}),
	referrals: many(platformPartnerReferrals),
	referralEvents: many(platformPartnerReferralEvents),
	commissions: many(platformPartnerCommissions),
	payouts: many(platformPartnerPayouts),
}));

export const platformPartnerReferralEventsRelations = relations(platformPartnerReferralEvents, ({ one }) => ({
	partner: one(platformPartners, {
		fields: [platformPartnerReferralEvents.partnerId],
		references: [platformPartners.id],
	}),
}));

export const platformPartnerReferralsRelations = relations(platformPartnerReferrals, ({ one, many }) => ({
	partner: one(platformPartners, {
		fields: [platformPartnerReferrals.partnerId],
		references: [platformPartners.id],
	}),
	organizacao: one(organizations, {
		fields: [platformPartnerReferrals.organizacaoId],
		references: [organizations.id],
	}),
	usuario: one(users, {
		fields: [platformPartnerReferrals.usuarioId],
		references: [users.id],
	}),
	commissions: many(platformPartnerCommissions),
}));

export const platformPartnerPayoutsRelations = relations(platformPartnerPayouts, ({ one, many }) => ({
	partner: one(platformPartners, {
		fields: [platformPartnerPayouts.partnerId],
		references: [platformPartners.id],
	}),
	autor: one(users, {
		fields: [platformPartnerPayouts.autorId],
		references: [users.id],
	}),
	commissions: many(platformPartnerCommissions),
}));

export const platformPartnerCommissionsRelations = relations(platformPartnerCommissions, ({ one }) => ({
	partner: one(platformPartners, {
		fields: [platformPartnerCommissions.partnerId],
		references: [platformPartners.id],
	}),
	referral: one(platformPartnerReferrals, {
		fields: [platformPartnerCommissions.referralId],
		references: [platformPartnerReferrals.id],
	}),
	organizacao: one(organizations, {
		fields: [platformPartnerCommissions.organizacaoId],
		references: [organizations.id],
	}),
	payout: one(platformPartnerPayouts, {
		fields: [platformPartnerCommissions.payoutId],
		references: [platformPartnerPayouts.id],
	}),
	aprovadoPor: one(users, {
		fields: [platformPartnerCommissions.aprovadoPorId],
		references: [users.id],
	}),
	ajusteOrigem: one(platformPartnerCommissions, {
		fields: [platformPartnerCommissions.ajusteOrigemCommissionId],
		references: [platformPartnerCommissions.id],
	}),
}));

export type TPlatformPartnerEntity = typeof platformPartners.$inferSelect;
export type TNewPlatformPartnerEntity = typeof platformPartners.$inferInsert;
export type TPlatformPartnerReferralEventEntity = typeof platformPartnerReferralEvents.$inferSelect;
export type TNewPlatformPartnerReferralEventEntity = typeof platformPartnerReferralEvents.$inferInsert;
export type TPlatformPartnerReferralEntity = typeof platformPartnerReferrals.$inferSelect;
export type TNewPlatformPartnerReferralEntity = typeof platformPartnerReferrals.$inferInsert;
export type TPlatformPartnerCommissionEntity = typeof platformPartnerCommissions.$inferSelect;
export type TNewPlatformPartnerCommissionEntity = typeof platformPartnerCommissions.$inferInsert;
export type TPlatformPartnerPayoutEntity = typeof platformPartnerPayouts.$inferSelect;
export type TNewPlatformPartnerPayoutEntity = typeof platformPartnerPayouts.$inferInsert;
