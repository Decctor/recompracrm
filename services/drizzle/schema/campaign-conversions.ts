import { relations } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { campaigns } from "./campaigns";
import { clients } from "./clients";
import { newTable } from "./common";
import { conversionTypeEnum } from "./enums";
import { interactions } from "./interactions";
import { organizations } from "./organizations";
import { sales } from "./sales";

export const campaignConversions = newTable(
	"campaign_conversions",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		vendaId: varchar("venda_id", { length: 255 })
			.references(() => sales.id)
			.notNull(),
		interacaoId: varchar("interacao_id", { length: 255 })
			.references(() => interactions.id)
			.notNull(),
		campanhaId: varchar("campanha_id", { length: 255 })
			.references(() => campaigns.id)
			.notNull(),
		clienteId: varchar("cliente_id", { length: 255 })
			.references(() => clients.id)
			.notNull(),

		// Attribution
		atribuicaoModelo: text("atribuicao_modelo").notNull().default("LAST_TOUCH"), // LAST_TOUCH, FIRST_TOUCH, LINEAR
		atribuicaoPeso: doublePrecision("atribuicao_peso").notNull().default(1.0),
		atribuicaoReceita: doublePrecision("atribuicao_receita").notNull(),

		// Timing
		dataInteracao: timestamp("data_interacao").notNull(),
		dataConversao: timestamp("data_conversao").notNull(),
		tempoParaConversaoMinutos: integer("tempo_para_conversao_minutos").notNull(),

		// Client Profile Snapshot (at time of conversion)
		clienteTicketMedioSnapshot: doublePrecision("cliente_ticket_medio_ss"),
		clienteCicloCompraMedioSnapshot: integer("cliente_ciclo_compra_medio_ss"), // in days
		clienteQtdeComprasSnapshot: integer("cliente_qtde_compras_ss"),
		cicloCompraConfiavel: boolean("ciclo_compra_confiavel").default(false),

		// Timing context
		diasDesdeUltimaCompra: integer("dias_desde_ultima_compra"),

		// Conversion classification
		tipoConversao: conversionTypeEnum("tipo_conversao"),

		// Deltas (stored for immutability)
		deltaFrequencia: integer("delta_frequencia"), // positive = faster than cycle
		deltaMonetarioAbsoluto: doublePrecision("delta_monetario_absoluto"), // valorVenda - ticketMedio
		deltaMonetarioPercentual: doublePrecision("delta_monetario_percentual"), // percentage difference

		// Denormalized for easier queries
		vendaValor: doublePrecision("venda_valor"),

		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		vendaIdIdx: index("idx_campaign_conversions_venda_id").on(table.vendaId),
		campanhaIdIdx: index("idx_campaign_conversions_campanha_id").on(table.campanhaId),
		clienteIdIdx: index("idx_campaign_conversions_cliente_id").on(table.clienteId),
		dataConversaoIdx: index("idx_campaign_conversions_data_conversao").on(table.dataConversao),
	}),
);

export const campaignConversionRelations = relations(campaignConversions, ({ one }) => ({
	venda: one(sales, {
		fields: [campaignConversions.vendaId],
		references: [sales.id],
	}),
	interacao: one(interactions, {
		fields: [campaignConversions.interacaoId],
		references: [interactions.id],
	}),
	campanha: one(campaigns, {
		fields: [campaignConversions.campanhaId],
		references: [campaigns.id],
	}),
	cliente: one(clients, {
		fields: [campaignConversions.clienteId],
		references: [clients.id],
	}),
}));

export type TCampaignConversion = typeof campaignConversions.$inferSelect;
export type TNewCampaignConversion = typeof campaignConversions.$inferInsert;
