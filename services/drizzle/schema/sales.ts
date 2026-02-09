import { relations } from "drizzle-orm";
import { boolean, doublePrecision, index, json, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { campaignConversions } from "./campaign-conversions";
import { campaigns } from "./campaigns";
import { cashbackProgramTransactions } from "./cashback-programs";
import { clients } from "./clients";
import { newTable } from "./common";
import { interactions } from "./interactions";
import { organizations } from "./organizations";
import { partners } from "./partners";
import { productAddOnOptions, productVariants, products } from "./products";
import { sellers } from "./sellers";

export const sales = newTable(
	"sales",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "set null" }), // allow nulls for non-identified clients
		idExterno: text("id_externo").notNull(),
		valorTotal: doublePrecision("valor_total").notNull(),
		custoTotal: doublePrecision("custo_total").notNull(),
		vendedorNome: text("vendedor_nome").notNull(),
		vendedorId: varchar("vendedor_id", { length: 255 }).references(() => sellers.id, { onDelete: "set null" }),
		// Partner
		parceiro: text("parceiro").notNull(),
		parceiroId: varchar("parceiro_id", { length: 255 }).references(() => partners.id, { onDelete: "set null" }),
		// Other details
		chave: text("chave").notNull(),
		documento: text("documento").notNull(),
		modelo: text("modelo").notNull(),
		movimento: text("movimento").notNull(),
		natureza: text("natureza").notNull(),
		serie: text("serie").notNull(),
		situacao: text("situacao").notNull(),
		tipo: text("tipo").notNull(),

		entregaModalidade: text("entrega_modalidade"), // ENTREGA, RETIRADA, PRESENCIAL, COMANDA
		canal: text("canal"),
		dataVenda: timestamp("data_venda"),
		// Conversion Attribution fields
		atribuicaoProcessada: boolean("atribuicao_processada").default(false),
		atribuicaoCampanhaPrincipalId: varchar("atribuicao_campanha_principal_id", { length: 255 }).references(() => campaigns.id),
		atribuicaoCampanhaConversaoId: varchar("atribuicao_campanha_conversao_id", { length: 255 }),
		atribuicaoInteracaoId: varchar("atribuicao_interacao_id", { length: 255 }).references(() => interactions.id),
		atribuicaoAplicavel: boolean("atribuicao_aplicavel").default(false),
	},
	(table) => ({
		clientIdIdx: index("idx_sales_client_id").on(table.clienteId),
		parceiroIdx: index("idx_sales_parceiro").on(table.parceiro),
		dataVendaIdx: index("idx_sales_data_venda").on(table.dataVenda),
		vendedorIdx: index("idx_sales_vendedor").on(table.vendedorNome),
		naturezaIdx: index("idx_sales_natureza").on(table.natureza),
		valorTotalIdx: index("idx_sales_valor_total").on(table.valorTotal),
	}),
);
export type TSaleEntity = typeof sales.$inferSelect;
export type TNewSaleEntity = typeof sales.$inferInsert;

export const salesRelations = relations(sales, ({ one, many }) => ({
	cliente: one(clients, {
		fields: [sales.clienteId],
		references: [clients.id],
	}),
	vendedor: one(sellers, {
		fields: [sales.vendedorId],
		references: [sellers.id],
	}),
	parceiro: one(partners, {
		fields: [sales.parceiroId],
		references: [partners.id],
	}),
	atribuicaoCampanhaPrincipal: one(campaigns, {
		fields: [sales.atribuicaoCampanhaPrincipalId],
		references: [campaigns.id],
	}),
	atribuicaoInteracao: one(interactions, {
		fields: [sales.atribuicaoInteracaoId],
		references: [interactions.id],
	}),
	atribuicaoCampanhaConversao: one(campaignConversions, {
		fields: [sales.atribuicaoCampanhaConversaoId],
		references: [campaignConversions.id],
	}),
	itens: many(saleItems),
	transacoesCashback: many(cashbackProgramTransactions),
}));

export const saleItems = newTable(
	"sale_items",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		vendaId: varchar("venda_id", { length: 255 })
			.references(() => sales.id, { onDelete: "cascade" })
			.notNull(),
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "cascade" }),
		produtoId: varchar("produto_id", { length: 255 })
			.references(() => products.id)
			.notNull(),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id),
		quantidade: doublePrecision("quantidade").notNull(),
		// NOTE: This unit price should be the (Variant Price + Sum of Modifiers)
		valorVendaUnitario: doublePrecision("valor_unitario").notNull(), // valor de venda unitário do produto
		valorCustoUnitario: doublePrecision("valor_custo_unitario").notNull(), // valor de custo unitário do produto
		valorVendaTotalBruto: doublePrecision("valor_venda_total_bruto").notNull(), // valor total do produto (sem desconto) (quantidade * valorUnitario)
		valorTotalDesconto: doublePrecision("valor_total_desconto").notNull(), // valor total em desconto
		valorVendaTotalLiquido: doublePrecision("valor_venda_total_liquido").notNull(), // valor total do produto na venda (com desconto) (quantidade * valorUnitario - valorTotalDesconto)
		valorCustoTotal: doublePrecision("valor_custo_total").notNull(), // valor total de custos,
		metadados: jsonb("metadados"), // metadados do produto (JSONB)
	},
	(table) => ({
		vendaIdIdx: index("idx_sale_items_venda_id").on(table.vendaId),
		produtoIdIdx: index("idx_sale_items_produto_id").on(table.produtoId),
		clienteIdIdx: index("idx_sale_items_cliente_id").on(table.clienteId),
		valoresIdx: index("idx_sale_items_valores").on(table.valorVendaTotalLiquido, table.valorCustoTotal),
	}),
);
export const saleItemsRelations = relations(saleItems, ({ one, many }) => ({
	produto: one(products, {
		fields: [saleItems.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [saleItems.produtoVarianteId],
		references: [productVariants.id],
	}),
	venda: one(sales, {
		fields: [saleItems.vendaId],
		references: [sales.id],
	}),
	adicionais: many(saleItemModifiers),
}));
export type TSaleItemEntity = typeof saleItems.$inferSelect;
export type TNewSaleItemEntity = typeof saleItems.$inferInsert;

export const saleItemModifiers = newTable("sale_item_modifiers", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),

	// Links to the specific line item (e.g., The "Burger" on line 3)
	itemVendaId: varchar("item_venda_id", { length: 255 })
		.references(() => saleItems.id, { onDelete: "cascade" })
		.notNull(),

	// Link to the definition (for inventory/reporting: "How much Bacon did we sell?")
	opcaoId: varchar("opcao_id", { length: 255 }).references(() => productAddOnOptions.id, { onDelete: "set null" }),

	// SNAPSHOT DATA (History preservation)
	nome: text("nome").notNull(), // "Extra Bacon"

	quantidade: doublePrecision("quantidade").default(1.0).notNull(),
	valorUnitario: doublePrecision("valor_unitario").notNull(), // Price at moment of sale
	valorTotal: doublePrecision("valor_total").notNull(), // Qty * UnitPrice
});

export const saleItemModifiersRelations = relations(saleItemModifiers, ({ one }) => ({
	itemVenda: one(saleItems, {
		fields: [saleItemModifiers.itemVendaId],
		references: [saleItems.id],
	}),
	opcao: one(productAddOnOptions, {
		fields: [saleItemModifiers.opcaoId],
		references: [productAddOnOptions.id],
	}),
}));
