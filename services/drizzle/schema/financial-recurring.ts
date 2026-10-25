import { relations } from "drizzle-orm";
import { index, jsonb, timestamp, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";
import type {
	TFinancialRecurringRuleConfig,
	TFinancialRecurringRuleAccountingEntryTemplate,
	TFinancialRecurringRuleTransactionTemplate,
} from "@/schemas/financial-recurring";
import { accountingEntries } from "./financial";
import { clients } from "./clients";
import { suppliers } from "./suppliers";
import { newTable } from "./common";
import { organizations } from "./organizations";
import { users } from "./users";

export const financialRecurringRules = newTable(
	"financial_recurring_rules",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id),
		lancamentoContabilOrigemId: varchar("lancamento_contabil_origem_id", { length: 255 })
			.references(() => accountingEntries.id, { onDelete: "cascade" })
			.notNull(),
		status: varchar("status", { length: 20 }).notNull().default("ATIVA"),
		// Contraparte herdada por cada lançamento gerado (ADR-0002, decisão 6).
		clienteId: varchar("cliente_id", { length: 255 }).references((): AnyPgColumn => clients.id, { onDelete: "set null" }),
		fornecedorId: varchar("fornecedor_id", { length: 255 }).references((): AnyPgColumn => suppliers.id, { onDelete: "set null" }),
		config: jsonb("config").$type<TFinancialRecurringRuleConfig>().notNull(),
		templateLancamento: jsonb("template_lancamento").$type<TFinancialRecurringRuleAccountingEntryTemplate>().notNull(),
		templateTransacoes: jsonb("template_transacoes").$type<TFinancialRecurringRuleTransactionTemplate[]>().notNull(),
		proximaGeracaoEm: timestamp("proxima_geracao_em"),
		ultimaGeracaoEm: timestamp("ultima_geracao_em"),
		gerarAte: timestamp("gerar_ate"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		atualizadoEm: timestamp("atualizado_em").$onUpdate(() => new Date()),
	},
	(table) => ({
		organizacaoStatusIdx: index("idx_financial_recurring_rules_organizacao_status").on(table.organizacaoId, table.status),
		proximaGeracaoIdx: index("idx_financial_recurring_rules_proxima_geracao").on(table.proximaGeracaoEm),
		origemIdx: index("idx_financial_recurring_rules_origem").on(table.lancamentoContabilOrigemId),
	}),
);

export const financialRecurringRulesRelations = relations(financialRecurringRules, ({ one }) => ({
	organizacao: one(organizations, { fields: [financialRecurringRules.organizacaoId], references: [organizations.id] }),
	autor: one(users, { fields: [financialRecurringRules.autorId], references: [users.id] }),
	lancamentoContabilOrigem: one(accountingEntries, {
		fields: [financialRecurringRules.lancamentoContabilOrigemId],
		references: [accountingEntries.id],
	}),
}));

export type TFinancialRecurringRule = typeof financialRecurringRules.$inferSelect;
export type TNewFinancialRecurringRule = typeof financialRecurringRules.$inferInsert;
