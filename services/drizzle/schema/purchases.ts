import type { TPurchaseCostModifiersSnapshot, TPurchaseImportedDocumentsSnapshot } from "@/schemas/purchases";
import { doublePrecision, integer, jsonb, numeric, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { organizations } from "./organizations";
import { accountingEntries, fiscalOutboundDocuments } from "./financial";
import { fiscalInboundDocuments } from "./fiscal";
import { users } from "./users";
import { relations } from "drizzle-orm";
import { products, productStockLots, productStockTransactions, productVariants } from "./products";
import { suppliers } from "./suppliers";
import { purchaseStatusEnum } from "./enums";

export const purchases = newTable("purchases", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
	idExterno: varchar("id_externo", { length: 255 }),

	status: purchaseStatusEnum("status").default("RASCUNHO").notNull(),
	titulo: text("titulo").notNull(),
	anotacoes: text("anotacoes"),
	// Snapshot documental pertencente à compra. Consulte docs/adr/0001 e docs/domain/purchase-costing.md.
	documentosImportados: jsonb("documentos_importados").$type<TPurchaseImportedDocumentsSnapshot>(),

	lancamentoContabilId: varchar("lancamento_contabil_id", { length: 255 }).references(() => accountingEntries.id, { onDelete: "set null" }),

	pedidoData: timestamp("pedido_data"),
	// Entity link; the pedidoFornecedor* fields below stay as a per-purchase snapshot (still editable).
	fornecedorId: varchar("fornecedor_id", { length: 255 }).references(() => suppliers.id, { onDelete: "set null" }),
	pedidoFornecedorNome: text("pedido_fornecedor_nome"),
	pedidoFornecedorCnpj: text("pedido_fornecedor_cnpj"),
	pedidoFornecedorTelefone: text("pedido_fornecedor_telefone"),
	pedidoFornecedorEmail: text("pedido_fornecedor_email"),

	transporteTransportadoraNome: text("transporte_transportadora_nome"),
	transporteTransportadoraCnpj: text("transporte_transportadora_cnpj"),
	transporteTransportadoraTelefone: text("transporte_transportadora_telefone"),
	transporteTransportadoraEmail: text("transporte_transportadora_email"),
	transporteLinkRastreio: text("transporte_link_rastreio"),

	entregaDataEnvio: timestamp("entrega_data_envio"),
	entregaDataRecebimentoPrevisao: timestamp("entrega_data_recebimento_previsao"),
	entregaDataRecebimentoEfetivacao: timestamp("entrega_data_recebimento_efetivacao"),

	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	dataEfetivacao: timestamp("data_efetivacao"),
	dataUltimaAtualizacao: timestamp("data_ultima_atualizacao").defaultNow().notNull(),

	autorId: varchar("autor_id", { length: 255 }).references(() => users.id),
});

export const purchaseRelations = relations(purchases, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [purchases.organizacaoId],
		references: [organizations.id],
	}),
	lancamentoContabil: one(accountingEntries, {
		fields: [purchases.lancamentoContabilId],
		references: [accountingEntries.id],
	}),
	fornecedor: one(suppliers, {
		fields: [purchases.fornecedorId],
		references: [suppliers.id],
	}),
	itens: many(purchaseItems),
	documentosFiscais: many(fiscalOutboundDocuments),
	// Notas recebidas (DF-e ou XML enviado) que originaram a compra — ADR-0002, decisao 1.
	notasRecebidas: many(fiscalInboundDocuments),
	autor: one(users, {
		fields: [purchases.autorId],
		references: [users.id],
	}),
}));

export type TPurchaseEntity = typeof purchases.$inferSelect;
export type TNewPurchaseEntity = typeof purchases.$inferInsert;

export const purchaseItems = newTable("purchase_items", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
	compraId: varchar("compra_id", { length: 255 })
		.references(() => purchases.id, { onDelete: "cascade" })
		.notNull(),
	produtoId: varchar("produto_id", { length: 255 })
		.references(() => products.id)
		.notNull(),
	produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id),

	// product related snapshots
	snapshotProdutoDescricao: text("snapshot_produto_descricao").notNull(),
	snapshotProdutoCodigo: text("snapshot_produto_codigo").notNull(),

	quantidade: doublePrecision("quantidade").notNull(),
	valorUnitarioBruto: doublePrecision("valor_unitario_bruto").notNull(),
	valorUnitarioLiquido: doublePrecision("valor_unitario_liquido"),
	valorTotalBruto: doublePrecision("valor_total_bruto").notNull(),
	valorTotalLiquido: doublePrecision("valor_total_liquido"),

	// Value modifiers
	descontosTotal: doublePrecision("descontos_total"), // sum of everything that reduces the total "expected" value
	acrescimosTotal: doublePrecision("acrescimos_total"), // sum of everything that increases the total "expected" value
	// Snapshot versionado dos valores que explicam a diferença entre mercadoria, financeiro e custo.
	// Não inferir tratamento pela chave: IMPOSTOS_IPI, por exemplo, pode ser crédito ou custo de estoque.
	modificadoresCusto: jsonb("modificadores_custo").$type<TPurchaseCostModifiersSnapshot>(),
	// Projeções exatas consumidas pelo estoque; o downstream não deve interpretar o JSONB.
	valorTotalCusto: numeric("valor_total_custo", { precision: 14, scale: 2, mode: "number" }),
	valorUnitarioCusto: numeric("valor_unitario_custo", { precision: 18, scale: 6, mode: "number" }),

	// External values (suppliers, etc)
	externoQtde: doublePrecision("externo_qtde"),
	externoValor: doublePrecision("externo_valor"),
	externoUnidade: varchar("externo_unidade", { length: 255 }),
	externoFatorConversao: doublePrecision("externo_fator_conversao"),

	anotacoes: text("anotacoes"),

	// Ponteiro para o documento de origem: `documentoRef` é a referência em
	// `purchases.documentosImportados`, `documentoItem` é o `det/@nItem` do XML. Os fatos fiscais
	// do item (CFOP, CST, bases) não são copiados — são lidos do XML por `readNfeItemFacts`
	// (ADR-0002, decisão 2).
	documentoRef: varchar("documento_ref", { length: 255 }),
	documentoItem: integer("documento_item"),

	// Perishable control: when informed, receiving this item generates a traceable stock lot.
	dataValidade: timestamp("data_validade"),

	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});

export const purchaseItemsRelations = relations(purchaseItems, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [purchaseItems.organizacaoId],
		references: [organizations.id],
	}),
	compra: one(purchases, {
		fields: [purchaseItems.compraId],
		references: [purchases.id],
	}),
	produto: one(products, {
		fields: [purchaseItems.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [purchaseItems.produtoVarianteId],
		references: [productVariants.id],
	}),
	transacoes: many(productStockTransactions),
	lotes: many(productStockLots),
}));

export type TPurchaseItemEntity = typeof purchaseItems.$inferSelect;
export type TNewPurchaseItemEntity = typeof purchaseItems.$inferInsert;
