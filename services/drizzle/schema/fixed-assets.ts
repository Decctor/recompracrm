import { relations } from "drizzle-orm";
import { index, integer, numeric, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { fixedAssetStatusEnum } from "./enums";
import { organizations } from "./organizations";
import { products, productVariants } from "./products";
import { purchaseItems, purchases } from "./purchases";
import { users } from "./users";

/**
 * Bem do ativo imobilizado (ADR-0002, decisão 8): a única tabela nova do plano de entrada fiscal.
 * O produto é o catálogo (o que o bem é); este registro é a unidade — ou o grupo de unidades
 * fungíveis — que existe, se deprecia e um dia é baixada. Depreciação acumulada e cronograma do
 * CIAP são funções dos campos e da data (lib/fixed-assets/depreciation.ts), não tabelas; o
 * lançamento mensal PATRIMONIO guarda o resultado de cada mês.
 */
export const fixedAssets = newTable(
	"fixed_assets",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		// O que o bem é. Nulo em cadastros antigos sem produto correspondente.
		produtoId: varchar("produto_id", { length: 255 }).references(() => products.id, { onDelete: "set null" }),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, { onDelete: "set null" }),
		// De qual aquisição nasceu; nulo = cadastro manual.
		compraId: varchar("compra_id", { length: 255 }).references(() => purchases.id, { onDelete: "set null" }),
		compraItemId: varchar("compra_item_id", { length: 255 }).references(() => purchaseItems.id, { onDelete: "set null" }),

		codigoPatrimonio: varchar("codigo_patrimonio", { length: 60 }),
		descricao: text("descricao").notNull(),
		numeroSerie: varchar("numero_serie", { length: 120 }),
		localizacao: varchar("localizacao", { length: 255 }),
		responsavelId: varchar("responsavel_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		status: fixedAssetStatusEnum("status").notNull().default("EM_USO"),

		// Bens fungíveis entram agrupados (20 cadeiras = 1 registro). Bem com número de série tem quantidade 1.
		quantidade: integer("quantidade").notNull().default(1),
		// Valor do registro inteiro (quantidade × unitário). Depreciação e CIAP são calculados sobre ele.
		valorAquisicao: numeric("valor_aquisicao", { precision: 14, scale: 2, mode: "number" }).notNull(),
		dataInicioUso: timestamp("data_inicio_uso").notNull(),
		vidaUtilMeses: integer("vida_util_meses").notNull(),
		valorResidual: numeric("valor_residual", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
		// Bens cadastrados já em uso: o que já estava depreciado antes de entrar no sistema.
		depreciacaoAcumuladaInicial: numeric("depreciacao_acumulada_inicial", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
		// Crédito de ICMS a apropriar em 48 meses (LC 87/96, art. 20 §5º); nulo = sem CIAP.
		creditoIcmsCiap: numeric("credito_icms_ciap", { precision: 14, scale: 2, mode: "number" }),

		dataBaixa: timestamp("data_baixa"),
		motivoBaixa: text("motivo_baixa"),
		valorBaixa: numeric("valor_baixa", { precision: 14, scale: 2, mode: "number" }),

		anotacoes: text("anotacoes"),
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoIdIdx: index("idx_fixed_assets_organizacao_id").on(table.organizacaoId),
		statusIdx: index("idx_fixed_assets_status").on(table.organizacaoId, table.status),
		compraIdIdx: index("idx_fixed_assets_compra_id").on(table.compraId),
		compraItemIdIdx: index("idx_fixed_assets_compra_item_id").on(table.compraItemId),
	}),
);

export const fixedAssetsRelations = relations(fixedAssets, ({ one }) => ({
	organizacao: one(organizations, { fields: [fixedAssets.organizacaoId], references: [organizations.id] }),
	produto: one(products, { fields: [fixedAssets.produtoId], references: [products.id] }),
	produtoVariante: one(productVariants, { fields: [fixedAssets.produtoVarianteId], references: [productVariants.id] }),
	compra: one(purchases, { fields: [fixedAssets.compraId], references: [purchases.id] }),
	compraItem: one(purchaseItems, { fields: [fixedAssets.compraItemId], references: [purchaseItems.id] }),
	responsavel: one(users, { fields: [fixedAssets.responsavelId], references: [users.id], relationName: "fixedAssetResponsible" }),
	autor: one(users, { fields: [fixedAssets.autorId], references: [users.id], relationName: "fixedAssetAuthor" }),
}));

export type TFixedAssetEntity = typeof fixedAssets.$inferSelect;
export type TNewFixedAssetEntity = typeof fixedAssets.$inferInsert;
