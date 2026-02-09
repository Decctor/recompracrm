import type { TAttributionModelEnum } from "@/schemas/enums";
import { relations } from "drizzle-orm";
import { boolean, doublePrecision, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable, users, whatsappConnectionPhones, whatsappTemplates } from ".";
import {
	campaignTriggerTypeEnum,
	cashbackProgramAccumulationTypeEnum,
	interactionsCronJobTimeBlocksEnum,
	recurrenceFrequencyEnum,
	timeDurationUnitsEnum,
} from "./enums";
import { organizations } from "./organizations";

export const campaigns = newTable("campaigns", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
	ativo: boolean("ativo").notNull().default(true),
	titulo: text("titulo").notNull(),
	descricao: text("descricao"),
	gatilhoTipo: campaignTriggerTypeEnum("gatilho_tipo").notNull(),

	// specific for "NOVA-COMPRA"
	gatilhoNovaCompraValorMinimo: doublePrecision("gatilho_nova_compra_valor_minimo"), // defines the minimum required of new sale value for trigger to fire

	// specific for "PERMANÊNCIA-SEGMENTAÇÃO"
	gatilhoTempoPermanenciaMedida: timeDurationUnitsEnum("gatilho_tempo_permanencia_medida"),
	gatilhoTempoPermanenciaValor: integer("gatilho_tempo_permanencia_valor"),

	// specific for "CASHBACK-ACUMULADO"
	gatilhoNovoCashbackAcumuladoValorMinimo: integer("gatilho_cashback_acumulado_valor_minimo"), // defines the minimum required of new cashback accumulation for trigger to fire
	gatilhoTotalCashbackAcumuladoValorMinimo: integer("gatilho_total_cashback_acumulado_valor_minimo"), // defines the minimum required of total cummulated cashback for trigger to fire

	// specific for "QUANTIDADE-TOTAL-COMPRAS"
	gatilhoQuantidadeTotalCompras: integer("gatilho_quantidade_total_compras"), // defines the minimum required all-time purchase count for trigger to fire

	// specific for "VALOR-TOTAL-COMPRAS"
	gatilhoValorTotalCompras: doublePrecision("gatilho_valor_total_compras"), // defines the minimum required all-time total purchase value for trigger to fire

	execucaoAgendadaMedida: timeDurationUnitsEnum("execucao_agendada_medida").notNull().default("DIAS"),
	execucaoAgendadaValor: integer("execucao_agendada_valor").notNull().default(0),
	execucaoAgendadaBloco: interactionsCronJobTimeBlocksEnum("execucao_agendada_bloco").notNull(),

	// Configs for recurring interactions and intervals
	permitirRecorrencia: boolean("permitir_recorrencia").notNull().default(true),

	// Minimum time required between interactions of this specific campaign
	frequenciaIntervaloValor: integer("frequencia_intervalo_valor").default(0),
	frequenciaIntervaloMedida: timeDurationUnitsEnum("frequencia_intervalo_medida").default("DIAS"),

	// Whatsapp specific
	whatsappConexaoTelefoneId: varchar("whatsapp_conexao_telefone_id", { length: 255 }).references(() => whatsappConnectionPhones.id, {
		onDelete: "set null",
	}),
	whatsappTemplateId: varchar("whatsapp_template_id", { length: 255 })
		.references(() => whatsappTemplates.id)
		.notNull(),
	autorId: varchar("autor_id", { length: 255 })
		.references(() => users.id)
		.notNull(),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),

	// Attribution settings
	atribuicaoModelo: text("atribuicao_modelo").$type<TAttributionModelEnum>().default("LAST_TOUCH").notNull(), // LAST_TOUCH, FIRST_TOUCH, LINEAR
	atribuicaoJanelaDias: integer("atribuicao_janela_dias").default(14).notNull(),

	// Recurrent campaign schedule configuration (only used when gatilhoTipo === "RECORRENTE")
	recorrenciaTipo: recurrenceFrequencyEnum("recorrencia_tipo"), // DIARIO, SEMANAL, MENSAL
	recorrenciaIntervalo: integer("recorrencia_intervalo").default(1), // every N units (e.g., every 2 weeks)
	recorrenciaDiasSemana: text("recorrencia_dias_semana"), // JSON array of day numbers [0-6] (0=Sunday, 6=Saturday)
	recorrenciaDiasMes: text("recorrencia_dias_mes"), // JSON array of day numbers [1-31]

	// Cashback generation configuration
	cashbackGeracaoAtivo: boolean("cashback_geracao_ativo").notNull().default(false),
	cashbackGeracaoTipo: cashbackProgramAccumulationTypeEnum("cashback_geracao_tipo"), // FIXO or PERCENTUAL
	cashbackGeracaoValor: doublePrecision("cashback_geracao_valor"),
	cashbackGeracaoExpiracaoMedida: timeDurationUnitsEnum("cashback_geracao_expiracao_medida"),
	cashbackGeracaoExpiracaoValor: integer("cashback_geracao_expiracao_valor"),
});
export const campaignRelations = relations(campaigns, ({ many, one }) => ({
	segmentacoes: many(campaignSegmentations),
	whatsappTemplate: one(whatsappTemplates, {
		fields: [campaigns.whatsappTemplateId],
		references: [whatsappTemplates.id],
	}),
	whatsappConexaoTelefone: one(whatsappConnectionPhones, {
		fields: [campaigns.whatsappConexaoTelefoneId],
		references: [whatsappConnectionPhones.id],
	}),
	autor: one(users, {
		fields: [campaigns.autorId],
		references: [users.id],
	}),
}));
export type TCampaignEntity = typeof campaigns.$inferSelect;
export type TNewCampaignEntity = typeof campaigns.$inferInsert;
export const campaignSegmentations = newTable("campaign_segmentations", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
	campanhaId: varchar("campanha_id", { length: 255 })
		.references(() => campaigns.id)
		.notNull(),
	segmentacao: text("segmentacao").notNull(),
});
export const campaignSegmentationRelations = relations(campaignSegmentations, ({ one }) => ({
	campanha: one(campaigns, {
		fields: [campaignSegmentations.campanhaId],
		references: [campaigns.id],
	}),
}));
