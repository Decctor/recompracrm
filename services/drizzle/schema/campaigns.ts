import { relations, sql } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { messageTemplates, newTable, users, whatsappConnectionPhones } from ".";
import {
	attributionModelEnum,
	campaignExecutionDelayDirectionEnum,
	campaignTriggerTypeEnum,
	cashbackProgramAccumulationTypeEnum,
	interactionsCronJobTimeBlocksEnum,
	recurrenceFrequencyEnum,
	timeDurationUnitsEnum,
} from "./enums";
import { organizations } from "./organizations";
import type { TCampaignFilters, TCampaignPromotionProduct } from "@/schemas/campaigns";

export const campaigns = newTable(
	"campaigns",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		ativo: boolean("ativo").notNull().default(true),
		titulo: text("titulo").notNull(),
		descricao: text("descricao"),
		// Chave do preset que originou a campanha (onboarding hoje; biblioteca de campanhas no
		// futuro). Identifica campanhas gerenciadas sem depender do título, que o usuário pode
		// renomear. Null = campanha criada manualmente.
		chavePreset: varchar("chave_preset", { length: 64 }),
		gatilhoTipo: campaignTriggerTypeEnum("gatilho_tipo").notNull(),

		// specific for "NOVA-COMPRA"
		gatilhoNovaCompraValorMinimo: doublePrecision("gatilho_nova_compra_valor_minimo"), // defines the minimum required of new sale value for trigger to fire

		// specific for "PERMANÊNCIA-SEGMENTAÇÃO"
		gatilhoTempoPermanenciaMedida: timeDurationUnitsEnum("gatilho_tempo_permanencia_medida"),
		gatilhoTempoPermanenciaValor: integer("gatilho_tempo_permanencia_valor"),

		// specific for "CASHBACK-ACUMULADO"
		gatilhoNovoCashbackAcumuladoValorMinimo: integer("gatilho_cashback_acumulado_valor_minimo"), // defines the minimum required of new cashback accumulation for trigger to fire
		gatilhoTotalCashbackAcumuladoValorMinimo: integer("gatilho_total_cashback_acumulado_valor_minimo"), // defines the minimum required of total cummulated cashback for trigger to fire

		// specific for "CASHBACK-EXPIRANDO"
		gatilhoCashbackExpirandoAntecedenciaValor: integer("gatilho_cashback_expirando_antecedencia_valor"),
		gatilhoCashbackExpirandoAntecedenciaMedida: timeDurationUnitsEnum("gatilho_cashback_expirando_antecedencia_medida"),
		gatilhoCashbackExpirandoValorMinimo: doublePrecision("gatilho_cashback_expirando_valor_minimo"),

		// specific for "QUANTIDADE-TOTAL-COMPRAS"
		gatilhoQuantidadeTotalCompras: integer("gatilho_quantidade_total_compras"), // defines the minimum required all-time purchase count for trigger to fire

		// specific for "VALOR-TOTAL-COMPRAS"
		gatilhoValorTotalCompras: doublePrecision("gatilho_valor_total_compras"), // defines the minimum required all-time total purchase value for trigger to fire
		// specific for "USO-UNICO"
		gatilhoUsoUnicoDataReferencia: text("gatilho_uso_unico_data_referencia"), // YYYY-MM-DD in the interactions cron timezone

		// specific for "PROMOCAO-PRODUTOS"
		gatilhoPromocaoDataReferencia: text("gatilho_promocao_data_referencia"), // YYYY-MM-DD in the interactions cron timezone
		// Lista curada (até 10) de produtos promovidos. jsonb em vez de tabela filha: a estrutura é
		// pequena, limitada e sempre lida/escrita por inteiro. A ORDEM DO ARRAY é a prioridade de
		// fallback quando o cliente não tem sinal de afinidade (ver lib/campaigns/promotion-suggestion.ts).
		// Guarda apenas configuração: nome/preço/imagem são resolvidos no enfileiramento, para que um
		// produto renomeado ou reprecificado nunca deixe a campanha desatualizada.
		gatilhoPromocaoProdutos: jsonb("gatilho_promocao_produtos").$type<TCampaignPromotionProduct[]>(),

		execucaoAgendadaMedida: timeDurationUnitsEnum("execucao_agendada_medida").notNull().default("DIAS"),
		execucaoAgendadaValor: integer("execucao_agendada_valor").notNull().default(0),
		execucaoAgendadaDirecao: campaignExecutionDelayDirectionEnum("execucao_agendada_direcao").notNull().default("DEPOIS"),
		execucaoAgendadaBloco: interactionsCronJobTimeBlocksEnum("execucao_agendada_bloco").notNull(),

		// Configs for recurring interactions and intervals
		permitirRecorrencia: boolean("permitir_recorrencia").notNull().default(true),
		limiteEnviosSemanais: integer("limite_envios_semanais"),

		// Minimum time required between interactions of this specific campaign
		frequenciaIntervaloValor: integer("frequencia_intervalo_valor").default(0),
		frequenciaIntervaloMedida: timeDurationUnitsEnum("frequencia_intervalo_medida").default("DIAS"),

		// Whatsapp specific
		whatsappConexaoTelefoneId: varchar("whatsapp_conexao_telefone_id", { length: 255 }).references(() => whatsappConnectionPhones.id, {
			onDelete: "set null",
		}),
		whatsappTemplateId: varchar("whatsapp_template_id", { length: 255 })
			.references(() => messageTemplates.id)
			.notNull(),
		autorId: varchar("autor_id", { length: 255 })
			.references(() => users.id)
			.notNull(),
		filtros: jsonb("filtros").$type<TCampaignFilters>(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),

		// Attribution settings
		atribuicaoModelo: attributionModelEnum("atribuicao_modelo").default("LAST_TOUCH").notNull(),
		atribuicaoJanelaDias: integer("atribuicao_janela_dias").default(7).notNull(),

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

		// Coupon generation configuration: atribui um cupom INDIVIDUAL ao cliente quando a campanha dispara.
		// FK lógico para coupons.id (sem .references para evitar import circular campaigns <-> coupons;
		// couponGrants.campanhaId já referencia campaigns pelo outro lado).
		cupomGeracaoAtivo: boolean("cupom_geracao_ativo").notNull().default(false),
		cupomGeracaoCupomId: varchar("cupom_geracao_cupom_id", { length: 255 }),
		cupomGeracaoExpiracaoMedida: timeDurationUnitsEnum("cupom_geracao_expiracao_medida"),
		cupomGeracaoExpiracaoValor: integer("cupom_geracao_expiracao_valor"),
	},
	(table) => [
		// Busca da lista de campanhas (app/api/campaigns/route.ts) e o relógio de disparos
		// (campanhas ativas por organização e gatilho).
		index("idx_campaigns_titulo_search").using("gin", sql`to_tsvector('portuguese', ${table.titulo})`),
		index("idx_campaigns_org_ativo_gatilho").on(table.organizacaoId, table.ativo, table.gatilhoTipo),
	],
);
export const campaignRelations = relations(campaigns, ({ many, one }) => ({
	segmentacoes: many(campaignSegmentations),
	whatsappTemplate: one(messageTemplates, {
		fields: [campaigns.whatsappTemplateId],
		references: [messageTemplates.id],
	}),
	messageTemplate: one(messageTemplates, {
		fields: [campaigns.whatsappTemplateId],
		references: [messageTemplates.id],
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
export type TCampaignSegmentationEntity = typeof campaignSegmentations.$inferSelect;
export type TNewCampaignSegmentationEntity = typeof campaignSegmentations.$inferInsert;
