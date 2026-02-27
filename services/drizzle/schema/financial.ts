import { relations } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	doublePrecision,
	foreignKey,
	index,
	integer,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { newTable } from "./common";
import {
	accountingEntryOriginTypeEnum,
	bankAccountTypeEnum,
	financialAccountTypeEnum,
	financialTransactionTypeEnum,
	fiscalDocumentStatusEnum,
	fiscalDocumentTypeEnum,
} from "./enums";
import { organizations } from "./organizations";
import { sales } from "./sales";
import { users } from "./users";

// ============================================================================
// ACCOUNTS CHARTS (Plano de Contas)
// ============================================================================

export const accountsCharts = newTable(
	"accounts_charts",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		nome: varchar("nome", { length: 255 }).notNull(),
		codigo: varchar("codigo", { length: 50 }),
		idContaPai: varchar("id_conta_pai", { length: 255 }).references((): AnyPgColumn => accountsCharts.id),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		autoReferencia: foreignKey({ columns: [table.idContaPai], foreignColumns: [table.id] }),
		organizacaoIdIdx: index("idx_accounts_charts_organizacao_id").on(table.organizacaoId),
		codigoIdx: index("idx_accounts_charts_codigo").on(table.organizacaoId, table.codigo),
	}),
);

export const accountsChartsRelations = relations(accountsCharts, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [accountsCharts.organizacaoId],
		references: [organizations.id],
	}),
	contaPai: one(accountsCharts, {
		fields: [accountsCharts.idContaPai],
		references: [accountsCharts.id],
		relationName: "conta-pai",
	}),
	subContas: many(accountsCharts, {
		relationName: "conta-pai",
	}),
	lancamentosContabeisDebito: many(accountingEntries, { relationName: "conta-debito" }),
	lancamentosContabeisCredito: many(accountingEntries, { relationName: "conta-credito" }),
	contasFinanceiras: many(financialAccounts),
}));

export type TAccountChart = typeof accountsCharts.$inferSelect;
export type TNewAccountChart = typeof accountsCharts.$inferInsert;

// ============================================================================
// ACCOUNTING ENTRIES (Lançamentos Contábeis)
// ============================================================================

export const accountingEntries = newTable(
	"accounting_entries",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		vendaId: varchar("venda_id", { length: 255 }).references(() => sales.id, { onDelete: "set null" }),
		origemTipo: accountingEntryOriginTypeEnum("origem_tipo").notNull(),
		titulo: text("titulo").notNull(),
		anotacoes: text("anotacoes"),
		idContaDebito: varchar("id_conta_debito", { length: 255 })
			.references(() => accountsCharts.id)
			.notNull(),
		idContaCredito: varchar("id_conta_credito", { length: 255 })
			.references(() => accountsCharts.id)
			.notNull(),
		valor: doublePrecision("valor").notNull(),
		valorPrevisto: doublePrecision("valor_previsto"),
		dataCompetencia: timestamp("data_competencia").notNull(),
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoIdIdx: index("idx_accounting_entries_organizacao_id").on(table.organizacaoId),
		vendaIdIdx: index("idx_accounting_entries_venda_id").on(table.vendaId),
		dataCompetenciaIdx: index("idx_accounting_entries_data_competencia").on(table.dataCompetencia),
		origemTipoIdx: index("idx_accounting_entries_origem_tipo").on(table.origemTipo),
	}),
);

export const accountingEntriesRelations = relations(accountingEntries, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [accountingEntries.organizacaoId],
		references: [organizations.id],
	}),
	venda: one(sales, {
		fields: [accountingEntries.vendaId],
		references: [sales.id],
	}),
	contaDebito: one(accountsCharts, {
		fields: [accountingEntries.idContaDebito],
		references: [accountsCharts.id],
		relationName: "conta-debito",
	}),
	contaCredito: one(accountsCharts, {
		fields: [accountingEntries.idContaCredito],
		references: [accountsCharts.id],
		relationName: "conta-credito",
	}),
	autor: one(users, {
		fields: [accountingEntries.autorId],
		references: [users.id],
	}),
	transacoesFinanceiras: many(financialTransactions),
	documentosFiscais: many(fiscalDocuments),
}));

export type TAccountingEntry = typeof accountingEntries.$inferSelect;
export type TNewAccountingEntry = typeof accountingEntries.$inferInsert;

// ============================================================================
// FINANCIAL ACCOUNTS (Contas Financeiras: Caixa, Banco, Carteira Digital)
// ============================================================================

export const financialAccounts = newTable(
	"financial_accounts",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		nome: varchar("nome", { length: 255 }).notNull(),
		descricao: varchar("descricao", { length: 500 }),
		tipo: financialAccountTypeEnum("tipo").notNull(),
		moeda: varchar("moeda", { length: 10 }).default("BRL").notNull(),
		ativo: boolean("ativo").default(true).notNull(),
		contaContabilId: varchar("conta_contabil_id", { length: 255 }).references(() => accountsCharts.id),
		saldoInicial: doublePrecision("saldo_inicial").default(0).notNull(),
		dataSaldoInicial: timestamp("data_saldo_inicial").notNull(),
		// Bank details (optional)
		codigoBanco: varchar("codigo_banco", { length: 10 }),
		nomeBanco: varchar("nome_banco", { length: 255 }),
		agencia: varchar("agencia", { length: 20 }),
		numeroConta: varchar("numero_conta", { length: 30 }),
		digitoConta: varchar("digito_conta", { length: 5 }),
		tipoConta: bankAccountTypeEnum("tipo_conta"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		atualizadoEm: timestamp("atualizado_em").$onUpdate(() => new Date()),
	},
	(table) => ({
		organizacaoIdIdx: index("idx_financial_accounts_organizacao_id").on(table.organizacaoId),
		tipoIdx: index("idx_financial_accounts_tipo").on(table.tipo),
		ativoIdx: index("idx_financial_accounts_ativo").on(table.ativo),
	}),
);

export const financialAccountsRelations = relations(financialAccounts, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [financialAccounts.organizacaoId],
		references: [organizations.id],
	}),
	contaContabil: one(accountsCharts, {
		fields: [financialAccounts.contaContabilId],
		references: [accountsCharts.id],
	}),
	transacoesFinanceiras: many(financialTransactions),
}));

export type TFinancialAccount = typeof financialAccounts.$inferSelect;
export type TNewFinancialAccount = typeof financialAccounts.$inferInsert;

// ============================================================================
// FINANCIAL TRANSACTIONS (Transações Financeiras)
// ============================================================================

export const financialTransactions = newTable(
	"financial_transactions",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		lancamentoContabilId: varchar("lancamento_contabil_id", { length: 255 })
			.references(() => accountingEntries.id, { onDelete: "cascade" })
			.notNull(),
		contaFinanceiraId: varchar("conta_financeira_id", { length: 255 }).references(() => financialAccounts.id),
		titulo: text("titulo").notNull(),
		tipo: financialTransactionTypeEnum("tipo").notNull(),
		valor: doublePrecision("valor").notNull(),
		metodo: varchar("metodo", { length: 255 }).notNull(),
		dataPrevisao: timestamp("data_previsao").notNull(),
		dataEfetivacao: timestamp("data_efetivacao"),
		parcela: integer("parcela"),
		totalParcelas: integer("total_parcelas"),
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoIdIdx: index("idx_financial_transactions_organizacao_id").on(table.organizacaoId),
		lancamentoContabilIdIdx: index("idx_financial_transactions_lancamento_id").on(table.lancamentoContabilId),
		contaFinanceiraEfetivacaoIdx: index("idx_financial_transactions_conta_efetivacao").on(
			table.contaFinanceiraId,
			table.dataEfetivacao,
		),
		dataPrevisaoIdx: index("idx_financial_transactions_data_previsao").on(table.dataPrevisao),
	}),
);

export const financialTransactionsRelations = relations(financialTransactions, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [financialTransactions.organizacaoId],
		references: [organizations.id],
	}),
	lancamentoContabil: one(accountingEntries, {
		fields: [financialTransactions.lancamentoContabilId],
		references: [accountingEntries.id],
	}),
	contaFinanceira: one(financialAccounts, {
		fields: [financialTransactions.contaFinanceiraId],
		references: [financialAccounts.id],
	}),
	autor: one(users, {
		fields: [financialTransactions.autorId],
		references: [users.id],
	}),
}));

export type TFinancialTransaction = typeof financialTransactions.$inferSelect;
export type TNewFinancialTransaction = typeof financialTransactions.$inferInsert;

// ============================================================================
// FISCAL DOCUMENTS (Documentos Fiscais — referências de NFCe/NFe/NFSe)
// ============================================================================

export const fiscalDocuments = newTable(
	"fiscal_documents",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		vendaId: varchar("venda_id", { length: 255 }).references(() => sales.id, { onDelete: "set null" }),
		lancamentoContabilId: varchar("lancamento_contabil_id", { length: 255 }).references(() => accountingEntries.id, {
			onDelete: "set null",
		}),
		tipo: fiscalDocumentTypeEnum("tipo").notNull(),
		status: fiscalDocumentStatusEnum("status").notNull().default("PENDENTE"),
		chaveAcesso: varchar("chave_acesso", { length: 44 }),
		numero: varchar("numero", { length: 50 }),
		serie: varchar("serie", { length: 10 }),
		protocolo: varchar("protocolo", { length: 50 }),
		xmlUrl: text("xml_url"),
		pdfUrl: text("pdf_url"),
		emissorReferencia: text("emissor_referencia"),
		emissorServico: text("emissor_servico"),
		// Document chaining (cancellation/return references)
		documentoOrigemId: varchar("documento_origem_id", { length: 255 }).references((): AnyPgColumn => fiscalDocuments.id, { onDelete: "set null" }),
		chaveAcessoReferencia: varchar("chave_acesso_referencia", { length: 44 }),
		dataEmissao: timestamp("data_emissao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoIdIdx: index("idx_fiscal_documents_organizacao_id").on(table.organizacaoId),
		vendaIdIdx: index("idx_fiscal_documents_venda_id").on(table.vendaId),
		chaveAcessoIdx: index("idx_fiscal_documents_chave_acesso").on(table.chaveAcesso),
		statusIdx: index("idx_fiscal_documents_status").on(table.status),
		documentoOrigemIdIdx: index("idx_fiscal_documents_documento_origem_id").on(table.documentoOrigemId),
	}),
);

export const fiscalDocumentsRelations = relations(fiscalDocuments, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [fiscalDocuments.organizacaoId],
		references: [organizations.id],
	}),
	venda: one(sales, {
		fields: [fiscalDocuments.vendaId],
		references: [sales.id],
	}),
	lancamentoContabil: one(accountingEntries, {
		fields: [fiscalDocuments.lancamentoContabilId],
		references: [accountingEntries.id],
	}),
	documentoOrigem: one(fiscalDocuments, {
		fields: [fiscalDocuments.documentoOrigemId],
		references: [fiscalDocuments.id],
		relationName: "documento-origem",
	}),
	documentosDerivados: many(fiscalDocuments, {
		relationName: "documento-origem",
	}),
}));

export type TFiscalDocument = typeof fiscalDocuments.$inferSelect;
export type TNewFiscalDocument = typeof fiscalDocuments.$inferInsert;
