import { relations, sql } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import {
	productClientReferenceWindowEnum,
	productStockDeductionModeEnum,
	stockLotStatusEnum,
	stockMovementTypeEnum,
	variantOptionTypeEnum,
} from "./enums";
import { organizations } from "./organizations";
import { saleItems, sales } from "./sales";
import { users } from "./users";
import { purchaseItems, purchases } from "./purchases";
import { productFiscalProfiles } from "./fiscal";
import { accountingEntries } from "./financial";
import { clients } from "./clients";
import { productionInputs, productionOutputs, productions } from "./productions";

export const products = newTable(
	"products",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, {
			onDelete: "cascade",
		}),
		ativo: boolean("ativo").default(true),
		vendavel: boolean("vendavel").default(true).notNull(),
		nome: text("nome").notNull(),
		descricao: text("descricao"),
		imagemCapaUrl: text("imagem_capa_url"),
		codigo: text("codigo").notNull(),
		unidade: text("unidade").notNull(),
		quantidade: doublePrecision("quantidade"),
		precoVenda: doublePrecision("preco_venda"),
		precoCusto: doublePrecision("preco_custo"),
		ncm: text("ncm").notNull(),
		tipo: text("tipo").notNull(),
		grupo: text("grupo").notNull(),
		rastreamentoEstoqueAtivo: boolean("rastreamento_estoque_ativo").default(false),
		// Como a venda baixa estoque: ESTOQUE_PROPRIO (saldo do produto) ou COMPOSICAO
		// (explosao da ficha tecnica — pratos). Explosao e fiada na Fase 2 de tabs.
		baixaEstoqueModo: productStockDeductionModeEnum("baixa_estoque_modo").default("ESTOQUE_PROPRIO").notNull(),
		// FK para productionRecipes criada apenas na migracao SQL (evita import circular com productions.ts).
		fichaTecnicaReceitaId: varchar("ficha_tecnica_receita_id", { length: 255 }),
		dataUltimaSincronizacao: timestamp("data_ultima_sincronizacao"),
		// valorUnitario: doublePrecision("valor_unitario").notNull(),
	},
	(table) => ({
		// ...existing indices...
		grupoIdx: index("idx_products_grupo").on(table.grupo),
		organizacaoIdx: index("idx_products_organizacao").on(table.organizacaoId),
		codigoIdx: index("idx_products_codigo").on(table.codigo),
		// Shortlist por similaridade na conciliação de itens de nota fiscal: a descrição impressa
		// raramente bate o nome do catálogo palavra por palavra. Mesmo padrão de `idx_clients_nome`.
		nomeIdx: index("idx_products_nome").using("gist", sql`unaccent_immutable(lower(${table.nome})) gist_trgm_ops`),
	}),
);
export const productsRelations = relations(products, ({ many }) => ({
	pedidos: many(saleItems),
	variantes: many(productVariants),
	opcoes: many(productOptions),
	addOnsReferencias: many(productAddOnReferences),
	perfisFiscais: many(productFiscalProfiles),
	referenciasClientes: many(productClientReferences),
}));

export type TProductEntity = typeof products.$inferSelect;
export type TNewProductEntity = typeof products.$inferInsert;

// -----------------------------------------------------------------------------
// PRODUCT VARIANTS
// -----------------------------------------------------------------------------
//
export const productVariants = newTable(
	"product_variants",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		produtoId: varchar("produto_id", { length: 255 })
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		idExterno: text("id_externo"),
		// Identity
		nome: text("nome").notNull(), // "350ml", "G", "Preta"
		codigo: text("codigo"), // Specific SKU for this variant (overrides product.codigo)
		imagemCapaUrl: text("imagem_capa_url"), // Overrides main product image if defined,
		// Price Override
		precoVenda: doublePrecision("preco_venda").notNull(),
		precoCusto: doublePrecision("preco_custo"), // Optional: distinct cost per variant

		// Stock Control (Optional, for tracking variant stock independently)
		quantidade: doublePrecision("quantidade"),

		ativo: boolean("ativo").default(true),
		rastreamentoEstoqueAtivo: boolean("rastreamento_estoque_ativo").default(false),
	},
	(table) => ({
		produtoIdx: index("idx_variantes_produto").on(table.produtoId),
	}),
);
export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
	produto: one(products, {
		fields: [productVariants.produtoId],
		references: [products.id],
	}),
	addOnsReferencias: many(productAddOnReferences),
	perfisFiscais: many(productFiscalProfiles),
	valoresOpcoes: many(productVariantOptionValues),
}));

export type TProductVariantEntity = typeof productVariants.$inferSelect;
export type TNewProductVariantEntity = typeof productVariants.$inferInsert;

// -----------------------------------------------------------------------------
// PRODUCT OPTIONS (eixos de variacao: "Tamanho", "Cor", "Material")
// -----------------------------------------------------------------------------
//
export const productOptions = newTable(
	"product_options",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		produtoId: varchar("produto_id", { length: 255 })
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		idExterno: text("id_externo"),
		nome: text("nome").notNull(), // "Tamanho", "Cor"
		tipo: variantOptionTypeEnum("tipo").default("TEXTO").notNull(), // drive a UI: texto, swatch de cor, numero
		ordem: integer("ordem").default(0).notNull(), // "Tamanho" antes de "Cor"?
	},
	(table) => ({
		produtoIdx: index("idx_product_options_produto").on(table.produtoId),
	}),
);
export const productOptionsRelations = relations(productOptions, ({ one, many }) => ({
	produto: one(products, {
		fields: [productOptions.produtoId],
		references: [products.id],
	}),
	valores: many(productOptionValues),
}));

export type TProductOptionEntity = typeof productOptions.$inferSelect;
export type TNewProductOptionEntity = typeof productOptions.$inferInsert;

// -----------------------------------------------------------------------------
// PRODUCT OPTION VALUES (valores de cada eixo: "P", "M", "G" / "Preto", "Branco")
// -----------------------------------------------------------------------------
//
export const productOptionValues = newTable(
	"product_option_values",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		opcaoId: varchar("opcao_id", { length: 255 })
			.notNull()
			.references(() => productOptions.id, { onDelete: "cascade" }),
		idExterno: text("id_externo"),
		nome: text("nome").notNull(), // "G", "Preto"
		valorAuxiliar: text("valor_auxiliar"), // hex "#000000" quando tipo = COR
		imagemCapaUrl: text("imagem_capa_url"), // foto compartilhada por todos os tamanhos dessa cor
		ordem: integer("ordem").default(0).notNull(),
	},
	(table) => ({
		opcaoIdx: index("idx_product_option_values_opcao").on(table.opcaoId),
	}),
);
export const productOptionValuesRelations = relations(productOptionValues, ({ one, many }) => ({
	opcao: one(productOptions, {
		fields: [productOptionValues.opcaoId],
		references: [productOptions.id],
	}),
	variantesAtribuicoes: many(productVariantOptionValues),
}));

export type TProductOptionValueEntity = typeof productOptionValues.$inferSelect;
export type TNewProductOptionValueEntity = typeof productOptionValues.$inferInsert;

// -----------------------------------------------------------------------------
// PRODUCT VARIANT OPTION VALUES (juncao variante <-> valor de eixo)
// -----------------------------------------------------------------------------
// A variante "Camiseta Preta G" tem duas linhas aqui: {Cor: Preto} e {Tamanho: G}.
export const productVariantOptionValues = newTable(
	"product_variant_option_values",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 })
			.notNull()
			.references(() => productVariants.id, { onDelete: "cascade" }),
		// opcaoId redundante (derivavel via valor) para sustentar o indice unico por eixo
		opcaoId: varchar("opcao_id", { length: 255 })
			.notNull()
			.references(() => productOptions.id, { onDelete: "cascade" }),
		opcaoValorId: varchar("opcao_valor_id", { length: 255 })
			.notNull()
			.references(() => productOptionValues.id, { onDelete: "cascade" }),
	},
	(table) => ({
		// 1 valor por eixo por variante: impede "G" e "M" na mesma variante
		varianteOpcaoUnq: uniqueIndex("unq_variant_option").on(table.produtoVarianteId, table.opcaoId),
		varianteIdx: index("idx_variant_option_values_variante").on(table.produtoVarianteId),
		opcaoValorIdx: index("idx_variant_option_values_valor").on(table.opcaoValorId),
	}),
);
export const productVariantOptionValuesRelations = relations(productVariantOptionValues, ({ one }) => ({
	variante: one(productVariants, {
		fields: [productVariantOptionValues.produtoVarianteId],
		references: [productVariants.id],
	}),
	opcao: one(productOptions, {
		fields: [productVariantOptionValues.opcaoId],
		references: [productOptions.id],
	}),
	valor: one(productOptionValues, {
		fields: [productVariantOptionValues.opcaoValorId],
		references: [productOptionValues.id],
	}),
}));

export type TProductVariantOptionValueEntity = typeof productVariantOptionValues.$inferSelect;
export type TNewProductVariantOptionValueEntity = typeof productVariantOptionValues.$inferInsert;

// -----------------------------------------------------------------------------
// PRODUCT ADDONS
// -----------------------------------------------------------------------------
//
export const productAddOns = newTable("product_add_ons", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 })
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" }),
	idExterno: text("id_externo"),
	nome: text("nome").notNull(), // "Ponto da Carne", "Borda", "Extras"
	internoNome: text("interno_nome"), // Helpful for management: "Extras de Lanche" vs "Extras de Pizza"

	// Logic Rules
	minOpcoes: integer("min_opcoes").default(0).notNull(), // 0 = Optional
	maxOpcoes: integer("max_opcoes").default(1).notNull(), // 1 = Radio, >1 = Checkbox

	ativo: boolean("ativo").default(true),
});
export const productAddOnsRelations = relations(productAddOns, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [productAddOns.organizacaoId],
		references: [organizations.id],
	}),
	opcoes: many(productAddOnOptions),
	produtos: many(productAddOnReferences),
}));

export const productAddOnOptions = newTable("product_add_on_options", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 })
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" }),
	produtoAddOnId: varchar("produto_add_on_id", { length: 255 })
		.notNull()
		.references(() => productAddOns.id, { onDelete: "cascade" }),

	idExterno: text("id_externo"),
	nome: text("nome").notNull(), // "Bacon Extra"
	// ---------------------------------------------------------
	// STOCK LINKING
	// ---------------------------------------------------------

	// 1. Refers to a generic product for stock deduction (e.g., "Coke Can")
	produtoId: varchar("produto_id", { length: 255 }).references(() => products.id), // Nullable: Not all modifiers use stock (e.g., "No Ice")

	// 2. Refers to a specific variant for stock deduction (e.g., "Heineken Long Neck" variant of "Beer")
	produtoVarianteId: varchar("product_variant_id", { length: 255 }).references(() => productVariants.id),

	// 3. How much to deduct? (Default 1.0)
	// If I add "Extra Cheese", do I deduct 1 slice or 2?
	quantidadeConsumo: doublePrecision("quantidade_consumo").default(1.0).notNull(),

	// ---------------------------------------------------------

	codigo: text("codigo"), // Optional: if the bacon itself has an SKU for inventory

	precoDelta: doublePrecision("preco_delta").default(0.0).notNull(),
	maxQtdePorItem: integer("max_qtde_por_item").default(1), // Can I select "Bacon" 3 times?

	// "ativo" is availability (pausable/reactivatable in management screens);
	// "dataExclusao" is the tombstone (removed from the registry, hidden everywhere).
	ativo: boolean("ativo").default(true),
	dataExclusao: timestamp("data_exclusao"),
});
export const productAddOnOptionsRelations = relations(productAddOnOptions, ({ one }) => ({
	produtoAddOn: one(productAddOns, {
		fields: [productAddOnOptions.produtoAddOnId],
		references: [productAddOns.id],
	}),
	// Relation to Product (for Inventory Deduction)
	produto: one(products, {
		fields: [productAddOnOptions.produtoId],
		references: [products.id],
	}),
	// Relation to Variant (for Inventory Deduction)
	produtoVariante: one(productVariants, {
		fields: [productAddOnOptions.produtoVarianteId],
		references: [productVariants.id],
	}),
}));

export const productAddOnReferences = newTable("product_add_on_references", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	produtoId: varchar("produto_id", { length: 255 })
		.notNull()
		.references(() => products.id, { onDelete: "cascade" }),
	produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id),
	produtoAddOnId: varchar("produto_add_on_id", { length: 255 })
		.notNull()
		.references(() => productAddOns.id, { onDelete: "cascade" }),

	ordem: integer("ordem").default(0), // Does "Size" come before "Sauce"?

	// Per-product rule overrides: the flavor list lives on the group, but how many picks a
	// product allows varies (e.g. gelato sizes). null = inherit the group's rule. Resolved by
	// resolveAddOnReferenceRules in lib/products/add-on-rules.ts before reaching any client.
	minOpcoes: integer("min_opcoes"),
	maxOpcoes: integer("max_opcoes"),
});
export const productAddOnReferencesRelations = relations(productAddOnReferences, ({ one }) => ({
	produto: one(products, {
		fields: [productAddOnReferences.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [productAddOnReferences.produtoVarianteId],
		references: [productVariants.id],
	}),
	grupo: one(productAddOns, {
		fields: [productAddOnReferences.produtoAddOnId],
		references: [productAddOns.id],
	}),
}));

export const productStockLots = newTable(
	"product_stock_lots",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		produtoId: varchar("produto_id", { length: 255 })
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, { onDelete: "set null" }),
		codigoLote: text("codigo_lote"),
		dataFabricacao: timestamp("data_fabricacao"),
		dataValidade: timestamp("data_validade"),
		quantidadeInicial: doublePrecision("quantidade_inicial").notNull(),
		quantidadeAtual: doublePrecision("quantidade_atual").notNull(),
		status: stockLotStatusEnum("status").default("ATIVO").notNull(),
		producaoId: varchar("producao_id", { length: 255 }).references(() => productions.id, { onDelete: "set null" }),
		compraId: varchar("compra_id", { length: 255 }).references(() => purchases.id, { onDelete: "set null" }),
		compraItemId: varchar("compra_item_id", { length: 255 }).references(() => purchaseItems.id, { onDelete: "set null" }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoIdx: index("idx_product_stock_lots_organizacao").on(table.organizacaoId),
		produtoIdx: index("idx_product_stock_lots_produto").on(table.produtoId),
		varianteIdx: index("idx_product_stock_lots_variante").on(table.produtoVarianteId),
		statusIdx: index("idx_product_stock_lots_status").on(table.status),
		validadeIdx: index("idx_product_stock_lots_validade").on(table.dataValidade),
		producaoIdx: index("idx_product_stock_lots_producao").on(table.producaoId),
		compraItemIdx: index("idx_product_stock_lots_compra_item").on(table.compraItemId),
	}),
);

export const productStockLotsRelations = relations(productStockLots, ({ one, many }) => ({
	lancamentosContabeis: many(accountingEntries),
	organizacao: one(organizations, {
		fields: [productStockLots.organizacaoId],
		references: [organizations.id],
	}),
	produto: one(products, {
		fields: [productStockLots.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [productStockLots.produtoVarianteId],
		references: [productVariants.id],
	}),
	producao: one(productions, {
		fields: [productStockLots.producaoId],
		references: [productions.id],
	}),
	compra: one(purchases, {
		fields: [productStockLots.compraId],
		references: [purchases.id],
	}),
	compraItem: one(purchaseItems, {
		fields: [productStockLots.compraItemId],
		references: [purchaseItems.id],
	}),
}));

export type TProductStockLot = typeof productStockLots.$inferSelect;
export type TNewProductStockLot = typeof productStockLots.$inferInsert;

export const productStockTransactions = newTable(
	"product_stock_transactions",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, {
			onDelete: "cascade",
		}),
		produtoId: varchar("produto_id", { length: 255 })
			.references(() => products.id, {
				onDelete: "cascade",
			})
			.notNull(),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, {
			onDelete: "cascade",
		}),

		compraId: varchar("compra_id", { length: 255 }).references(() => purchases.id, { onDelete: "set null" }),
		compraItemId: varchar("compra_item_id", { length: 255 }).references(() => purchaseItems.id, { onDelete: "set null" }),

		vendaId: varchar("venda_id", { length: 255 }).references(() => sales.id, {
			onDelete: "set null",
		}),
		vendaItemId: varchar("venda_item_id", { length: 255 }).references(() => saleItems.id, {
			onDelete: "set null",
		}),

		producaoId: varchar("producao_id", { length: 255 }).references(() => productions.id, { onDelete: "set null" }),
		producaoEntradaId: varchar("producao_entrada_id", { length: 255 }).references(() => productionInputs.id, { onDelete: "set null" }),
		producaoSaidaId: varchar("producao_saida_id", { length: 255 }).references(() => productionOutputs.id, { onDelete: "set null" }),
		loteId: varchar("lote_id", { length: 255 }).references(() => productStockLots.id, { onDelete: "set null" }),

		tipo: stockMovementTypeEnum("tipo").default("SAIDA").notNull(),

		// Quantity related fields
		quantidade: doublePrecision("quantidade").notNull(), // quantidade movimentada
		saldoAnterior: doublePrecision("saldo_anterior"), // saldo de estoque anterior
		saldoPosterior: doublePrecision("saldo_posterior"), // saldo de estoque posterior

		// Cost related fields
		custoUnitarioMovimentado: doublePrecision("custo_unitario_movimentado"),
		custoUnitarioAnterior: doublePrecision("custo_unitario_anterior"),
		custoUnitarioPosterior: doublePrecision("custo_unitario_posterior"),

		motivo: text("motivo"),

		operadorId: varchar("operador_id", { length: 255 }).references(() => users.id, {
			onDelete: "set null",
		}),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		produtoIdIdx: index("idx_product_stock_transactions_produto_id").on(table.produtoId),
		produtoVarianteIdIdx: index("idx_product_stock_transactions_variante_id").on(table.produtoVarianteId),
		vendaIdIdx: index("idx_product_stock_transactions_venda_id").on(table.vendaId),
		producaoIdIdx: index("idx_product_stock_transactions_producao_id").on(table.producaoId),
		loteIdIdx: index("idx_product_stock_transactions_lote_id").on(table.loteId),
		tipoIdx: index("idx_product_stock_transactions_tipo").on(table.tipo),
	}),
);

export const productStockTransactionsRelations = relations(productStockTransactions, ({ one }) => ({
	produto: one(products, {
		fields: [productStockTransactions.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [productStockTransactions.produtoVarianteId],
		references: [productVariants.id],
	}),
	venda: one(sales, {
		fields: [productStockTransactions.vendaId],
		references: [sales.id],
	}),
	vendaItem: one(saleItems, {
		fields: [productStockTransactions.vendaItemId],
		references: [saleItems.id],
	}),
	compra: one(purchases, {
		fields: [productStockTransactions.compraId],
		references: [purchases.id],
	}),
	compraItem: one(purchaseItems, {
		fields: [productStockTransactions.compraItemId],
		references: [purchaseItems.id],
	}),
	producao: one(productions, {
		fields: [productStockTransactions.producaoId],
		references: [productions.id],
	}),
	producaoEntrada: one(productionInputs, {
		fields: [productStockTransactions.producaoEntradaId],
		references: [productionInputs.id],
	}),
	producaoSaida: one(productionOutputs, {
		fields: [productStockTransactions.producaoSaidaId],
		references: [productionOutputs.id],
	}),
	lote: one(productStockLots, {
		fields: [productStockTransactions.loteId],
		references: [productStockLots.id],
	}),
	operador: one(users, {
		fields: [productStockTransactions.operadorId],
		references: [users.id],
	}),
}));

export type TProductStockTransaction = typeof productStockTransactions.$inferSelect;
export type TNewProductStockTransaction = typeof productStockTransactions.$inferInsert;

export const productClientReferences = newTable(
	"product_client_references",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, {
				onDelete: "cascade",
			})
			.notNull(),
		produtoId: varchar("produto_id", { length: 255 })
			.references(() => products.id, {
				onDelete: "cascade",
			})
			.notNull(),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, {
			onDelete: "set null",
		}),
		clienteId: varchar("cliente_id", { length: 255 })
			.references(() => clients.id, {
				onDelete: "cascade",
			})
			.notNull(),

		// stats
		totalComprasQuantidade: integer("total_compras_quantidade").default(0).notNull(),
		totalComprasValor: doublePrecision("total_compras_valor").default(0).notNull(),
		rankingValor: integer("ranking_valor").default(0).notNull(),

		janela: productClientReferenceWindowEnum("janela").default("GERAL").notNull(),

		primeiraCompraData: timestamp("primeira_compra_data"),
		ultimaCompraData: timestamp("ultima_compra_data"),

		dataUltimaAtualizacao: timestamp("data_ultima_atualizacao").defaultNow().notNull(),
	},
	(table) => ({
		orgJanelaIdx: index("idx_product_client_references_org_janela").on(table.organizacaoId, table.janela),
		produtoJanelaRankingIdx: index("idx_product_client_references_produto_janela_ranking").on(
			table.organizacaoId,
			table.produtoId,
			table.janela,
			table.rankingValor,
		),
		produtoVarianteJanelaRankingIdx: index("idx_product_client_references_variante_janela_ranking").on(
			table.organizacaoId,
			table.produtoVarianteId,
			table.janela,
			table.rankingValor,
		),
		clienteJanelaIdx: index("idx_product_client_references_cliente_janela").on(table.organizacaoId, table.clienteId, table.janela),
		atualizacaoIdx: index("idx_product_client_references_data_atualizacao").on(table.organizacaoId, table.dataUltimaAtualizacao),
	}),
);
export const productClientReferencesRelations = relations(productClientReferences, ({ one }) => ({
	produto: one(products, {
		fields: [productClientReferences.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [productClientReferences.produtoVarianteId],
		references: [productVariants.id],
	}),
	cliente: one(clients, {
		fields: [productClientReferences.clienteId],
		references: [clients.id],
	}),
}));

export type TProductClientReference = typeof productClientReferences.$inferSelect;
