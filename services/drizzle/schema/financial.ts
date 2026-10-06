import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import type { TFinancialAccountConfiguration } from "@/schemas/financial";
import { newTable } from "./common";
import {
  accountChartNatureEnum,
  accountingEntryLineNatureEnum,
  accountingEntryOriginTypeEnum,
  bankAccountTypeEnum,
  financialAccountTypeEnum,
  financialTransactionTypeEnum,
  fiscalDocumentEnvironmentEnum,
  fiscalDocumentLifecycleStatusEnum,
  fiscalDocumentStatusEnum,
  fiscalDocumentTypeEnum,
  fiscalOperationConsumerPresenceEnum,
  paymentMethodEnum,
} from "./enums";
import { organizations } from "./organizations";
import { paymentAttempts } from "./payment-attempts";
import { productStockLots } from "./products";
import { sales } from "./sales";
import { salesSessions } from "./sales-sessions";
import { users } from "./users";
import { purchases } from "./purchases";

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
    natureza: accountChartNatureEnum("natureza").notNull(),
    idContaPai: varchar("id_conta_pai", { length: 255 }).references(
      (): AnyPgColumn => accountsCharts.id,
    ),
    dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
  },
  (table) => ({
    autoReferencia: foreignKey({
      columns: [table.idContaPai],
      foreignColumns: [table.id],
    }),
    organizacaoIdIdx: index("idx_accounts_charts_organizacao_id").on(
      table.organizacaoId,
    ),
    codigoIdx: index("idx_accounts_charts_codigo").on(
      table.organizacaoId,
      table.codigo,
    ),
    naturezaIdx: index("idx_accounts_charts_natureza").on(
      table.organizacaoId,
      table.natureza,
    ),
  }),
);

export const accountsChartsRelations = relations(
  accountsCharts,
  ({ one, many }) => ({
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
    lancamentosContabeisDebito: many(accountingEntries, {
      relationName: "conta-debito",
    }),
    lancamentosContabeisCredito: many(accountingEntries, {
      relationName: "conta-credito",
    }),
    linhasContabeis: many(accountingEntryLines),
    contasFinanceiras: many(financialAccounts),
  }),
);

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
    vendaId: varchar("venda_id", { length: 255 }).references(() => sales.id, {
      onDelete: "set null",
    }),
    // Lote de estoque que originou o lançamento (perdas/descartes — origem PERDA_ESTOQUE).
    loteId: varchar("lote_id", { length: 255 }).references(
      (): AnyPgColumn => productStockLots.id,
      { onDelete: "set null" },
    ),
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
    recorrenciaRegraId: varchar("recorrencia_regra_id", { length: 255 }),
    recorrenciaInstanciaData: timestamp("recorrencia_instancia_data"),
    recorrenciaGeradoEm: timestamp("recorrencia_gerado_em"),
    chaveIdempotencia: varchar("chave_idempotencia", { length: 120 }),
    autorId: varchar("autor_id", { length: 255 }).references(() => users.id),
    dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
  },
  (table) => ({
    organizacaoIdIdx: index("idx_accounting_entries_organizacao_id").on(
      table.organizacaoId,
    ),
    vendaIdIdx: index("idx_accounting_entries_venda_id").on(table.vendaId),
    loteIdIdx: index("idx_accounting_entries_lote_id").on(table.loteId),
    dataCompetenciaIdx: index("idx_accounting_entries_data_competencia").on(
      table.dataCompetencia,
    ),
    origemTipoIdx: index("idx_accounting_entries_origem_tipo").on(
      table.origemTipo,
    ),
    recurrenceInstanceUniqueIdx: uniqueIndex(
      "uq_accounting_entries_recurrence_instance",
    )
      .on(table.recorrenciaRegraId, table.recorrenciaInstanciaData)
      .where(
        sql`${table.recorrenciaRegraId} IS NOT NULL AND ${table.recorrenciaInstanciaData} IS NOT NULL`,
      ),
    idempotencyUniqueIdx: uniqueIndex(
      "uq_accounting_entries_organizacao_idempotency_key",
    ).on(table.organizacaoId, table.chaveIdempotencia),
  }),
);

// Linhas de partidas dobradas genéricas. A conta + natureza constituem a classificação contábil;
// chaves de modificadores de compra não formam uma taxonomia paralela. Consulte ADR-0001.
export const accountingEntryLines = newTable(
  "accounting_entry_lines",
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
    contaContabilId: varchar("conta_contabil_id", { length: 255 })
      .references(() => accountsCharts.id)
      .notNull(),
    natureza: accountingEntryLineNatureEnum("natureza").notNull(),
    valor: numeric("valor", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    valorPrevisto: numeric("valor_previsto", {
      precision: 14,
      scale: 2,
      mode: "number",
    }),
    descricao: text("descricao"),
    ordem: integer("ordem").default(0).notNull(),
    metadados: jsonb("metadados").$type<Record<string, unknown>>(),
    dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
  },
  (table) => ({
    organizacaoIdIdx: index("idx_accounting_entry_lines_organizacao_id").on(
      table.organizacaoId,
    ),
    lancamentoContabilIdIdx: index(
      "idx_accounting_entry_lines_lancamento_id",
    ).on(table.lancamentoContabilId),
    contaContabilIdIdx: index("idx_accounting_entry_lines_conta_id").on(
      table.contaContabilId,
    ),
  }),
);

export const accountingEntryLinesRelations = relations(
  accountingEntryLines,
  ({ one }) => ({
    organizacao: one(organizations, {
      fields: [accountingEntryLines.organizacaoId],
      references: [organizations.id],
    }),
    lancamentoContabil: one(accountingEntries, {
      fields: [accountingEntryLines.lancamentoContabilId],
      references: [accountingEntries.id],
    }),
    contaContabil: one(accountsCharts, {
      fields: [accountingEntryLines.contaContabilId],
      references: [accountsCharts.id],
    }),
  }),
);

export type TAccountingEntryLine = typeof accountingEntryLines.$inferSelect;
export type TNewAccountingEntryLine = typeof accountingEntryLines.$inferInsert;

export const accountingEntriesRelations = relations(
  accountingEntries,
  ({ one, many }) => ({
    organizacao: one(organizations, {
      fields: [accountingEntries.organizacaoId],
      references: [organizations.id],
    }),
    venda: one(sales, {
      fields: [accountingEntries.vendaId],
      references: [sales.id],
    }),
    lote: one(productStockLots, {
      fields: [accountingEntries.loteId],
      references: [productStockLots.id],
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
    linhas: many(accountingEntryLines),
    documentosFiscais: many(fiscalOutboundDocuments),
  }),
);

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
    // Contas "first-party" (criadas/gerenciadas pelo sistema, ex.: conta de repasse do iFood)
    // carregam uma chave estável ("IFOOD"); contas do usuário ficam null. O índice único
    // (organizacao, chave) garante idempotência do provisionamento automático.
    chaveSistema: varchar("chave_sistema", { length: 100 }),
    moeda: varchar("moeda", { length: 10 }).default("BRL").notNull(),
    ativo: boolean("ativo").default(true).notNull(),
    contaContabilId: varchar("conta_contabil_id", { length: 255 }).references(
      () => accountsCharts.id,
    ),
    saldoInicial: doublePrecision("saldo_inicial").default(0).notNull(),
    dataSaldoInicial: timestamp("data_saldo_inicial").notNull(),
    configuracao: jsonb("configuracao")
      .$type<TFinancialAccountConfiguration>()
      .notNull(),
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
    organizacaoIdIdx: index("idx_financial_accounts_organizacao_id").on(
      table.organizacaoId,
    ),
    tipoIdx: index("idx_financial_accounts_tipo").on(table.tipo),
    ativoIdx: index("idx_financial_accounts_ativo").on(table.ativo),
    // Uma conta first-party por chave por organização (NULLs não colidem — contas do usuário livres).
    chaveSistemaUq: uniqueIndex(
      "uq_financial_accounts_organizacao_chave_sistema",
    ).on(table.organizacaoId, table.chaveSistema),
  }),
);

export const financialAccountsRelations = relations(
  financialAccounts,
  ({ one, many }) => ({
    organizacao: one(organizations, {
      fields: [financialAccounts.organizacaoId],
      references: [organizations.id],
    }),
    contaContabil: one(accountsCharts, {
      fields: [financialAccounts.contaContabilId],
      references: [accountsCharts.id],
    }),
    transacoesFinanceiras: many(financialTransactions),
  }),
);

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
    contaFinanceiraId: varchar("conta_financeira_id", {
      length: 255,
    }).references(() => financialAccounts.id),
    // Sessão de venda que recortou este movimento (nullable). ANCHOR do cálculo de conciliação.
    sessaoVendaId: varchar("sessao_venda_id", { length: 255 }).references(
      () => salesSessions.id,
      { onDelete: "set null" },
    ),
    titulo: text("titulo").notNull(),
    tipo: financialTransactionTypeEnum("tipo").notNull(),
    valor: doublePrecision("valor").notNull(),
    valorBase: doublePrecision("valor_base").notNull().default(0),
    valorJuros: doublePrecision("valor_juros").notNull().default(0),
    valorMulta: doublePrecision("valor_multa").notNull().default(0),
    valorTaxas: doublePrecision("valor_taxas").notNull().default(0),
    valorDesconto: doublePrecision("valor_desconto").notNull().default(0),
    modificadoresMetadata: jsonb("modificadores_metadata").$type<{
      origem?: string | null;
      regra?: string | null;
      observacoes?: string | null;
      parametros?: Record<string, unknown> | null;
    } | null>(),
    metodo: paymentMethodEnum("metodo").notNull(),
    dataPrevisao: timestamp("data_previsao").notNull(),
    dataEfetivacao: timestamp("data_efetivacao"),
    parcela: integer("parcela"),
    totalParcelas: integer("total_parcelas"),
    // Payment provider tracking (nullable, only populated when a provider is involved)
    provedorReferencia: text("provedor_referencia"),
    provedorStatus: text("provedor_status"),
    // Tentativa de pagamento em terminal (payment-attempts.ts) que efetivou esta transação.
    // Unique: uma aprovação no terminal efetiva exatamente uma transação — defesa definitiva
    // contra duplo consumo, mesmo sob concorrência ou replay.
    tentativaPagamentoId: varchar("tentativa_pagamento_id", { length: 255 }).references(
      (): AnyPgColumn => paymentAttempts.id,
      { onDelete: "set null" },
    ),
    autorId: varchar("autor_id", { length: 255 }).references(() => users.id),
    dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
  },
  (table) => ({
    tentativaPagamentoIdx: uniqueIndex(
      "idx_financial_transactions_tentativa_pagamento",
    )
      .on(table.tentativaPagamentoId)
      .where(sql`${table.tentativaPagamentoId} is not null`),
    organizacaoIdIdx: index("idx_financial_transactions_organizacao_id").on(
      table.organizacaoId,
    ),
    lancamentoContabilIdIdx: index(
      "idx_financial_transactions_lancamento_id",
    ).on(table.lancamentoContabilId),
    contaFinanceiraEfetivacaoIdx: index(
      "idx_financial_transactions_conta_efetivacao",
    ).on(table.contaFinanceiraId, table.dataEfetivacao),
    dataPrevisaoIdx: index("idx_financial_transactions_data_previsao").on(
      table.dataPrevisao,
    ),
    sessaoVendaIdx: index("idx_financial_transactions_sessao").on(
      table.sessaoVendaId,
    ),
  }),
);

export const financialTransactionsRelations = relations(
  financialTransactions,
  ({ one }) => ({
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
    sessao: one(salesSessions, {
      fields: [financialTransactions.sessaoVendaId],
      references: [salesSessions.id],
    }),
    autor: one(users, {
      fields: [financialTransactions.autorId],
      references: [users.id],
    }),
  }),
);

export type TFinancialTransaction = typeof financialTransactions.$inferSelect;
export type TNewFinancialTransaction =
  typeof financialTransactions.$inferInsert;

// ============================================================================
// FISCAL DOCUMENTS (Documentos Fiscais — referências de NFCe/NFe/NFSe)
// ============================================================================

export const fiscalOutboundDocuments = newTable(
  "fiscal_outbound_documents",
  {
    id: varchar("id", { length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizacaoId: varchar("organizacao_id", { length: 255 })
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    compraId: varchar("compra_id", { length: 255 }).references(
      () => purchases.id,
      { onDelete: "set null" },
    ),
    vendaId: varchar("venda_id", { length: 255 }).references(() => sales.id, {
      onDelete: "set null",
    }),
    lancamentoContabilId: varchar("lancamento_contabil_id", {
      length: 255,
    }).references(() => accountingEntries.id, {
      onDelete: "set null",
    }),
    tipo: fiscalDocumentTypeEnum("tipo").notNull(),
    status: fiscalDocumentStatusEnum("status").notNull().default("PENDENTE"),
    statusInterno: fiscalDocumentLifecycleStatusEnum("status_interno")
      .notNull()
      .default("RASCUNHO"),
    ambiente: fiscalDocumentEnvironmentEnum("ambiente")
      .notNull()
      .default("HOMOLOGACAO"),
    referencia: text("referencia").notNull(),
    provedor: text("provedor"),
    provedorDocumentoId: text("provedor_documento_id"),
    provedorStatus: text("provedor_status"),
    chaveAcesso: varchar("chave_acesso", { length: 44 }),
    numero: varchar("numero", { length: 50 }),
    serie: varchar("serie", { length: 10 }),
    protocolo: varchar("protocolo", { length: 50 }),
    xmlStoragePath: text("xml_storage_path"),
    pdfStoragePath: text("pdf_storage_path"),
    mensagens: text("mensagens").array().default([]),
    snapshotOrigemVenda: text("snapshot_origem_venda"),
    provedorPayload: text("provedor_payload"),
    provedorRetorno: text("provedor_retorno"),
    tentativasEnvio: integer("tentativas_envio").notNull().default(0),
    // Fila/worker (outbox): proxima tentativa de envio (backoff) e lock de processamento (claim).
    proximaTentativaEm: timestamp("proxima_tentativa_em"),
    bloqueadoEm: timestamp("bloqueado_em"),
    codigoRejeicao: varchar("codigo_rejeicao", { length: 10 }),
    // Problemas estruturados da ultima falha (JSON de TFiscalProblem[]): codigo, alvo e acao.
    // `mensagens` guarda o texto bruto; isto e o que a UI transforma em CTA.
    problemas: text("problemas"),
    presencaConsumidorDeclarada: fiscalOperationConsumerPresenceEnum(
      "presenca_consumidor_declarada",
    ),
    justificativaPresencaConsumidor: text("justificativa_presenca_consumidor"),
    autorPresencaConsumidorId: varchar("autor_presenca_consumidor_id", {
      length: 255,
    }).references(() => users.id, {
      onDelete: "set null",
    }),
    dataDeclaracaoPresencaConsumidor: timestamp(
      "data_declaracao_presenca_consumidor",
    ),
    dataUltimaSincronizacao: timestamp("data_ultima_sincronizacao"),
    provedorProcessadoEm: timestamp("provedor_processado_em"),
    dataAutorizacao: timestamp("data_autorizacao"),
    dataCancelamento: timestamp("data_cancelamento"),
    // Document chaining (cancellation/return references)
    documentoOrigemId: varchar("documento_origem_id", {
      length: 255,
    }).references((): AnyPgColumn => fiscalOutboundDocuments.id, {
      onDelete: "set null",
    }),
    chaveAcessoReferencia: varchar("chave_acesso_referencia", { length: 44 }),
    dataEmissao: timestamp("data_emissao"),
    dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
  },
  (table) => ({
    organizacaoIdIdx: index("idx_fiscal_outbound_documents_organizacao_id").on(
      table.organizacaoId,
    ),
    vendaIdIdx: index("idx_fiscal_outbound_documents_venda_id").on(
      table.vendaId,
    ),
    // Filtro de período da lista e das exportações. A expressão é `fiscalDocumentReferenceDate`
    // (lib/fiscal/document-list-conditions.ts): mude as duas juntas.
    orgDataReferenciaIdx: index(
      "idx_fiscal_outbound_documents_org_data_ref",
    ).on(
      table.organizacaoId,
      sql`coalesce(${table.dataEmissao}, ${table.dataInsercao})`,
    ),
    chaveAcessoIdx: index("idx_fiscal_outbound_documents_chave_acesso").on(
      table.chaveAcesso,
    ),
    statusIdx: index("idx_fiscal_outbound_documents_status").on(table.status),
    statusInternoIdx: index("idx_fiscal_outbound_documents_status_interno").on(
      table.statusInterno,
    ),
    // Idempotencia da emissao: uma referencia (venda + tipo [+ devolucao]) por organizacao.
    referenciaUq: uniqueIndex(
      "uq_fiscal_outbound_documents_organizacao_referencia",
    ).on(table.organizacaoId, table.referencia),
    provedorDocumentoIdIdx: index(
      "idx_fiscal_outbound_documents_provedor_documento_id",
    ).on(table.provedorDocumentoId),
    documentoOrigemIdIdx: index(
      "idx_fiscal_outbound_documents_documento_origem_id",
    ).on(table.documentoOrigemId),
  }),
);

export const fiscalOutboundDocumentsRelations = relations(
  fiscalOutboundDocuments,
  ({ one, many }) => ({
    organizacao: one(organizations, {
      fields: [fiscalOutboundDocuments.organizacaoId],
      references: [organizations.id],
    }),
    venda: one(sales, {
      fields: [fiscalOutboundDocuments.vendaId],
      references: [sales.id],
    }),
    compra: one(purchases, {
      fields: [fiscalOutboundDocuments.compraId],
      references: [purchases.id],
    }),
    lancamentoContabil: one(accountingEntries, {
      fields: [fiscalOutboundDocuments.lancamentoContabilId],
      references: [accountingEntries.id],
    }),
    autorPresencaConsumidor: one(users, {
      fields: [fiscalOutboundDocuments.autorPresencaConsumidorId],
      references: [users.id],
    }),
    documentoOrigem: one(fiscalOutboundDocuments, {
      fields: [fiscalOutboundDocuments.documentoOrigemId],
      references: [fiscalOutboundDocuments.id],
      relationName: "documento-origem",
    }),
    documentosDerivados: many(fiscalOutboundDocuments, {
      relationName: "documento-origem",
    }),
  }),
);

export type TFiscalDocument = typeof fiscalOutboundDocuments.$inferSelect;
export type TNewFiscalDocument = typeof fiscalOutboundDocuments.$inferInsert;
