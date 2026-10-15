import { relations } from "drizzle-orm";
import { boolean, doublePrecision, index, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { productionOriginEnum, productionStatusEnum, timeDurationUnitsEnum } from "./enums";
import { organizations } from "./organizations";
import { productVariants, products } from "./products";
import { saleItems, sales } from "./sales";
import { users } from "./users";

export const productionRecipes = newTable(
	"production_recipes",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		titulo: text("titulo").notNull(),
		descricao: text("descricao"),
		/** Modo de preparo em Markdown (listas, ênfase, títulos) — renderizado na tela de produção. */
		modoPreparo: text("modo_preparo"),
		previsaoTempoMedida: timeDurationUnitsEnum("previsao_tempo_medida"),
		previsaoTempoValor: doublePrecision("previsao_tempo_valor"),
		ativo: boolean("ativo").default(true).notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoIdx: index("idx_production_recipes_organizacao").on(table.organizacaoId),
		ativoIdx: index("idx_production_recipes_ativo").on(table.ativo),
	}),
);

export const productionRecipesRelations = relations(productionRecipes, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [productionRecipes.organizacaoId],
		references: [organizations.id],
	}),
	insumos: many(productionRecipeInputs),
	saidas: many(productionRecipeOutputs),
}));

export type TProductionRecipeEntity = typeof productionRecipes.$inferSelect;
export type TNewProductionRecipeEntity = typeof productionRecipes.$inferInsert;

export const productionRecipeInputs = newTable(
	"production_recipe_inputs",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		receitaId: varchar("receita_id", { length: 255 })
			.notNull()
			.references(() => productionRecipes.id, { onDelete: "cascade" }),
		produtoId: varchar("produto_id", { length: 255 })
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, { onDelete: "set null" }),
		quantidade: doublePrecision("quantidade").notNull(),
	},
	(table) => ({
		receitaIdx: index("idx_production_recipe_inputs_receita").on(table.receitaId),
		produtoIdx: index("idx_production_recipe_inputs_produto").on(table.produtoId),
	}),
);

export const productionRecipeInputsRelations = relations(productionRecipeInputs, ({ one }) => ({
	receita: one(productionRecipes, {
		fields: [productionRecipeInputs.receitaId],
		references: [productionRecipes.id],
	}),
	produto: one(products, {
		fields: [productionRecipeInputs.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [productionRecipeInputs.produtoVarianteId],
		references: [productVariants.id],
	}),
}));

export type TProductionRecipeInputEntity = typeof productionRecipeInputs.$inferSelect;
export type TNewProductionRecipeInputEntity = typeof productionRecipeInputs.$inferInsert;

export const productionRecipeOutputs = newTable(
	"production_recipe_outputs",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		receitaId: varchar("receita_id", { length: 255 })
			.notNull()
			.references(() => productionRecipes.id, { onDelete: "cascade" }),
		produtoId: varchar("produto_id", { length: 255 })
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, { onDelete: "set null" }),
		quantidade: doublePrecision("quantidade").notNull(),
		prazoValidadeMedida: timeDurationUnitsEnum("prazo_validade_medida"),
		prazoValidadeValor: doublePrecision("prazo_validade_valor"),
	},
	(table) => ({
		receitaIdx: index("idx_production_recipe_outputs_receita").on(table.receitaId),
		produtoIdx: index("idx_production_recipe_outputs_produto").on(table.produtoId),
	}),
);

export const productionRecipeOutputsRelations = relations(productionRecipeOutputs, ({ one }) => ({
	receita: one(productionRecipes, {
		fields: [productionRecipeOutputs.receitaId],
		references: [productionRecipes.id],
	}),
	produto: one(products, {
		fields: [productionRecipeOutputs.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [productionRecipeOutputs.produtoVarianteId],
		references: [productVariants.id],
	}),
}));

export type TProductionRecipeOutputEntity = typeof productionRecipeOutputs.$inferSelect;
export type TNewProductionRecipeOutputEntity = typeof productionRecipeOutputs.$inferInsert;

export const productions = newTable(
	"productions",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		receitaId: varchar("receita_id", { length: 255 }).references(() => productionRecipes.id, { onDelete: "set null" }),
		titulo: text("titulo").notNull(),
		origem: productionOriginEnum("origem").default("MANUAL").notNull(),
		status: productionStatusEnum("status").default("RASCUNHO").notNull(),
		vendaId: varchar("venda_id", { length: 255 }).references(() => sales.id, { onDelete: "set null" }),
		vendaItemId: varchar("venda_item_id", { length: 255 }).references(() => saleItems.id, { onDelete: "set null" }),
		dataInicio: timestamp("data_inicio"),
		dataPrevisaoConclusao: timestamp("data_previsao_conclusao"),
		dataConclusao: timestamp("data_conclusao"),
		observacoes: text("observacoes"),
		// Snapshot de valoração congelado na conclusão da produção. Custo e preço de venda variam ao
		// longo do tempo — recalcular a partir do catálogo atual distorceria o histórico. Enquanto a
		// produção não é concluída estes campos são nulos e a tela mostra uma projeção pelo catálogo.
		custoTotal: doublePrecision("custo_total"),
		retornoEsperado: doublePrecision("retorno_esperado"),
		dataSnapshotValores: timestamp("data_snapshot_valores"),
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoIdx: index("idx_productions_organizacao").on(table.organizacaoId),
		vendaIdIdx: index("idx_productions_venda_id").on(table.vendaId),
		vendaItemIdIdx: index("idx_productions_venda_item_id").on(table.vendaItemId),
		statusIdx: index("idx_productions_status").on(table.status),
		receitaIdx: index("idx_productions_receita").on(table.receitaId),
		dataInsercaoIdx: index("idx_productions_data_insercao").on(table.dataInsercao),
	}),
);

export const productionsRelations = relations(productions, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [productions.organizacaoId],
		references: [organizations.id],
	}),
	receita: one(productionRecipes, {
		fields: [productions.receitaId],
		references: [productionRecipes.id],
	}),
	venda: one(sales, {
		fields: [productions.vendaId],
		references: [sales.id],
	}),
	vendaItem: one(saleItems, {
		fields: [productions.vendaItemId],
		references: [saleItems.id],
	}),
	autor: one(users, {
		fields: [productions.autorId],
		references: [users.id],
	}),
	entradas: many(productionInputs),
	saidas: many(productionOutputs),
}));

export type TProductionEntity = typeof productions.$inferSelect;
export type TNewProductionEntity = typeof productions.$inferInsert;

export const productionInputs = newTable(
	"production_inputs",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		producaoId: varchar("producao_id", { length: 255 })
			.notNull()
			.references(() => productions.id, { onDelete: "cascade" }),
		produtoId: varchar("produto_id", { length: 255 })
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, { onDelete: "set null" }),
		quantidadePrevista: doublePrecision("quantidade_prevista"),
		quantidadeReal: doublePrecision("quantidade_real"),
		/** Custo unitário congelado na conclusão — lotes consumidos quando há rastreio, catálogo no resto. */
		custoUnitario: doublePrecision("custo_unitario"),
	},
	(table) => ({
		producaoIdx: index("idx_production_inputs_producao").on(table.producaoId),
		produtoIdx: index("idx_production_inputs_produto").on(table.produtoId),
	}),
);

export const productionInputsRelations = relations(productionInputs, ({ one }) => ({
	producao: one(productions, {
		fields: [productionInputs.producaoId],
		references: [productions.id],
	}),
	produto: one(products, {
		fields: [productionInputs.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [productionInputs.produtoVarianteId],
		references: [productVariants.id],
	}),
}));

export type TProductionInputEntity = typeof productionInputs.$inferSelect;
export type TNewProductionInputEntity = typeof productionInputs.$inferInsert;

export const productionOutputs = newTable(
	"production_outputs",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		producaoId: varchar("producao_id", { length: 255 })
			.notNull()
			.references(() => productions.id, { onDelete: "cascade" }),
		produtoId: varchar("produto_id", { length: 255 })
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, { onDelete: "set null" }),
		quantidadePrevista: doublePrecision("quantidade_prevista"),
		quantidadeReal: doublePrecision("quantidade_real"),
		prazoValidadeMedida: timeDurationUnitsEnum("prazo_validade_medida"),
		prazoValidadeValor: doublePrecision("prazo_validade_valor"),
		dataValidade: timestamp("data_validade"),
		/** Preço de venda unitário congelado na conclusão — base do retorno esperado da produção. */
		valorUnitarioVenda: doublePrecision("valor_unitario_venda"),
	},
	(table) => ({
		producaoIdx: index("idx_production_outputs_producao").on(table.producaoId),
		produtoIdx: index("idx_production_outputs_produto").on(table.produtoId),
		dataValidadeIdx: index("idx_production_outputs_data_validade").on(table.dataValidade),
	}),
);

export const productionOutputsRelations = relations(productionOutputs, ({ one }) => ({
	producao: one(productions, {
		fields: [productionOutputs.producaoId],
		references: [productions.id],
	}),
	produto: one(products, {
		fields: [productionOutputs.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [productionOutputs.produtoVarianteId],
		references: [productVariants.id],
	}),
}));

export type TProductionOutputEntity = typeof productionOutputs.$inferSelect;
export type TNewProductionOutputEntity = typeof productionOutputs.$inferInsert;
