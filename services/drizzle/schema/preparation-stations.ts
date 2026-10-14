// Estações de preparo: para onde vai cada item do TICKET_PREPARO (bebidas no balcão, lanches na
// cozinha). Entidade da organização, independente de dispositivo — a impressora atende estações
// via agent_printers.estacoes_preparo. Modelo e decisões: docs/dev-planning/preparation-stations-plan.md.
import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { organizations } from "./organizations";

// escopo_ticket/criterio NÃO são pgEnum de propósito (mesmo racional de desktop-agent.ts):
// varchar + z.enum no app, para que novos valores não custem migração de enum no Postgres.

export const preparationStations = newTable(
	"preparation_stations",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		nome: text("nome").notNull(),
		ordem: integer("ordem").notNull().default(0),
		// Estação inativa nunca recebe itens (o resolver a ignora).
		ativa: boolean("ativa").notNull().default(true),
		// Recebe o que nenhuma regra capturou. Com ≥1 estação ativa, exatamente uma é padrão
		// (validado no serviço, não no banco).
		padrao: boolean("padrao").notNull().default(false),
		// PEDIDO: ticket com o pedido inteiro, itens da estação em destaque. ESTACAO: só os itens dela.
		escopoTicket: varchar("escopo_ticket", { length: 30 }).$type<"PEDIDO" | "ESTACAO">().notNull().default("PEDIDO"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => ({
		organizacaoIdIdx: index("idx_preparation_stations_organizacao_id").on(table.organizacaoId),
	}),
);

// O sujeito da regra é sempre o item; canal/modalidade/horário pertencem à estação, não à regra.
// Por isso `criterio` só conhece atributos do produto (GRUPO, PRODUTO).
// Precedência entre critérios vive no resolver (PREPARATION_RULE_SPECIFICITY), não numa coluna.
// Sem FK em valor.produtoId: a exclusão de produto limpa as regras PRODUTO na mesma transação e o
// resolver tolera regra órfã. Sem unicidade no banco: o PUT da estação valida conflitos.
export const preparationStationRules = newTable(
	"preparation_station_rules",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		estacaoId: varchar("estacao_id", { length: 255 })
			.references(() => preparationStations.id, { onDelete: "cascade" })
			.notNull(),
		// Fora do jsonb para filtrar e indexar; espelha valor.criterio.
		criterio: varchar("criterio", { length: 30 }).$type<"GRUPO" | "PRODUTO">().notNull(),
		// PreparationStationRuleValueSchema (z.discriminatedUnion("criterio")).
		valor: jsonb("valor").$type<{ criterio: "GRUPO"; grupo: string } | { criterio: "PRODUTO"; produtoId: string }>().notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoIdIdx: index("idx_preparation_station_rules_organizacao_id").on(table.organizacaoId),
		organizacaoEstacaoIdx: index("idx_preparation_station_rules_org_estacao").on(table.organizacaoId, table.estacaoId),
		organizacaoCriterioIdx: index("idx_preparation_station_rules_org_criterio").on(table.organizacaoId, table.criterio),
	}),
);

export const preparationStationsRelations = relations(preparationStations, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [preparationStations.organizacaoId],
		references: [organizations.id],
	}),
	regras: many(preparationStationRules),
}));

export const preparationStationRulesRelations = relations(preparationStationRules, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [preparationStationRules.organizacaoId],
		references: [organizations.id],
	}),
	estacao: one(preparationStations, {
		fields: [preparationStationRules.estacaoId],
		references: [preparationStations.id],
	}),
}));

export type TPreparationStationEntity = typeof preparationStations.$inferSelect;
export type TNewPreparationStationEntity = typeof preparationStations.$inferInsert;
export type TPreparationStationRuleEntity = typeof preparationStationRules.$inferSelect;
export type TNewPreparationStationRuleEntity = typeof preparationStationRules.$inferInsert;
