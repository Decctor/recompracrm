import { relations, sql } from "drizzle-orm";
import { boolean, doublePrecision, index, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { organizations } from "./organizations";
import { products, productVariants } from "./products";

// Entidade de fornecedores: dedup por CNPJ, ancora o de-para e liga inbound (DF-e) -> compra -> financeiro.
export const suppliers = newTable(
	"suppliers",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		nome: varchar("nome", { length: 255 }).notNull(),
		cpfCnpj: varchar("cpf_cnpj", { length: 20 }),
		email: varchar("email", { length: 255 }),
		telefone: varchar("telefone", { length: 30 }),
		inscricaoEstadual: varchar("inscricao_estadual", { length: 30 }),
		ativo: boolean("ativo").notNull().default(true),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoIdIdx: index("idx_suppliers_organizacao_id").on(table.organizacaoId),
		cpfCnpjIdx: index("idx_suppliers_cpf_cnpj").on(table.organizacaoId, table.cpfCnpj),
	}),
);

// De-para de produto do fornecedor -> produto interno (reutilizavel em entrada manual/DF-e/importacao).
export const supplierProductMappings = newTable(
	"supplier_product_mappings",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		fornecedorId: varchar("fornecedor_id", { length: 255 })
			.references(() => suppliers.id, { onDelete: "cascade" })
			.notNull(),
		codigoFornecedor: varchar("codigo_fornecedor", { length: 100 }),
		ean: varchar("ean", { length: 20 }),
		produtoId: varchar("produto_id", { length: 255 })
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, { onDelete: "cascade" }),
		// Unidade comercial do fornecedor e o fator para converter a unidade interna do produto.
		// Aprendidos junto do de-para: a proxima nota do mesmo fornecedor ja chega convertida.
		unidadeExterna: varchar("unidade_externa", { length: 25 }),
		fatorConversao: doublePrecision("fator_conversao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoIdIdx: index("idx_supplier_product_mappings_organizacao_id").on(table.organizacaoId),
		fornecedorCodigoIdx: index("idx_supplier_product_mappings_fornecedor_codigo").on(table.fornecedorId, table.codigoFornecedor),
		fornecedorEanIdx: index("idx_supplier_product_mappings_fornecedor_ean").on(table.fornecedorId, table.ean),
		// Um codigo (ou EAN) do fornecedor aponta para um unico produto. Sem isso o de-para aceita
		// duplicatas e o Estagio A do matching passa a escolher um vencedor arbitrario entre elas.
		// Parciais porque cada linha pode ser chaveada por codigo, por EAN, ou por ambos.
		fornecedorCodigoUnq: uniqueIndex("unq_supplier_product_mappings_fornecedor_codigo")
			.on(table.fornecedorId, table.codigoFornecedor)
			.where(sql`${table.codigoFornecedor} IS NOT NULL`),
		fornecedorEanUnq: uniqueIndex("unq_supplier_product_mappings_fornecedor_ean")
			.on(table.fornecedorId, table.ean)
			.where(sql`${table.ean} IS NOT NULL`),
	}),
);

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [suppliers.organizacaoId],
		references: [organizations.id],
	}),
	mapeamentos: many(supplierProductMappings),
	produtosPrincipais: many(products),
}));

export const supplierProductMappingsRelations = relations(supplierProductMappings, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [supplierProductMappings.organizacaoId],
		references: [organizations.id],
	}),
	fornecedor: one(suppliers, {
		fields: [supplierProductMappings.fornecedorId],
		references: [suppliers.id],
	}),
	produto: one(products, {
		fields: [supplierProductMappings.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [supplierProductMappings.produtoVarianteId],
		references: [productVariants.id],
	}),
}));

export type TSupplierEntity = typeof suppliers.$inferSelect;
export type TNewSupplierEntity = typeof suppliers.$inferInsert;
export type TSupplierProductMappingEntity = typeof supplierProductMappings.$inferSelect;
export type TNewSupplierProductMappingEntity = typeof supplierProductMappings.$inferInsert;
