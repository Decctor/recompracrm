import { relations } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, primaryKey, text, timestamp, varchar, vector } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { organizations } from "./organizations";
import { saleItems } from "./sales";

export const products = newTable(
	"products",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		ativo: boolean("ativo").default(true),
		descricao: text("descricao").notNull(),
		imagemCapaUrl: text("imagem_capa_url"),
		codigo: text("codigo").notNull(),
		unidade: text("unidade").notNull(),
		quantidade: doublePrecision("quantidade"),
		precoVenda: doublePrecision("preco_venda"),
		precoCusto: doublePrecision("preco_custo"),
		ncm: text("ncm").notNull(),
		tipo: text("tipo").notNull(),
		grupo: text("grupo").notNull(),
		dataUltimaSincronizacao: timestamp("data_ultima_sincronizacao"),
		// valorUnitario: doublePrecision("valor_unitario").notNull(),
	},
	(table) => ({
		// ...existing indices...
		grupoIdx: index("idx_products_grupo").on(table.grupo),
		organizacaoIdx: index("idx_products_organizacao").on(table.organizacaoId),
		codigoIdx: index("idx_products_codigo").on(table.codigo),
	}),
);
export const productsRelations = relations(products, ({ one, many }) => ({
	pedidos: many(saleItems),
	variantes: many(productVariants),
	addOnsReferencias: many(productAddOnReferences),
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
}));

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

	ativo: boolean("ativo").default(true),
});
export const productAddOnOptionsRelations = relations(productAddOnOptions, ({ one, many }) => ({
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
