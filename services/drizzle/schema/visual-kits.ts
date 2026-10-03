import type { TVisualKitConfig, TVisualKitPieceConfig } from "@/schemas/visual-kits";
import { relations } from "drizzle-orm";
import { doublePrecision, index, integer, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { files } from "./files";
import { visualKitFormatEnum, visualKitOutputEnum, visualKitStatusEnum } from "./enums";
import { organizations } from "./organizations";
import { products, productVariants } from "./products";
import { salesChannels } from "./sales-channels";
import { users } from "./users";

// -----------------------------------------------------------------------------
// COMUNICAÇÃO VISUAL — KITS
// -----------------------------------------------------------------------------
// Um kit agrupa peças (etiquetas, encarte, posts…) geradas dos MESMOS produtos, preços e validade.
// Formatos não são entidade: são o registro em código `lib/visual-kits/formats.ts`; aqui só a chave.

export const visualKits = newTable(
	"visual_kits",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		nome: text("nome").notNull(), // "Oferta da semana · outubro" (Meus kits)
		chamada: text("chamada").notNull(), // título impresso nas peças ("Ofertas da semana")
		validadeFim: timestamp("validade_fim"),
		// Nulo = preço base. Com canal, as peças usam o preço do canal comparado ao anterior do base.
		canalVendaId: varchar("canal_venda_id", { length: 255 }).references(() => salesChannels.id, { onDelete: "set null" }),
		configuracao: jsonb("configuracao").$type<TVisualKitConfig>().notNull(),
		status: visualKitStatusEnum("status").default("RASCUNHO").notNull(),
		dataUltimaGeracao: timestamp("data_ultima_geracao"),
		autorId: varchar("autor_id", { length: 255 })
			.references(() => users.id)
			.notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$onUpdate(() => new Date()),
	},
	(table) => ({
		organizacaoIdx: index("idx_visual_kits_organizacao").on(table.organizacaoId),
	}),
);
export const visualKitsRelations = relations(visualKits, ({ one, many }) => ({
	canalVenda: one(salesChannels, { fields: [visualKits.canalVendaId], references: [salesChannels.id] }),
	autor: one(users, { fields: [visualKits.autorId], references: [users.id] }),
	pecas: many(visualKitPieces),
	itens: many(visualKitItems),
}));
export type TVisualKitEntity = typeof visualKits.$inferSelect;
export type TNewVisualKitEntity = typeof visualKits.$inferInsert;

export const visualKitPieces = newTable(
	"visual_kit_pieces",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		kitId: varchar("kit_id", { length: 255 })
			.references(() => visualKits.id, { onDelete: "cascade" })
			.notNull(),
		formato: visualKitFormatEnum("formato").notNull(),
		modelo: text("modelo").default("PADRAO").notNull(), // um modelo por formato hoje
		saida: visualKitOutputEnum("saida").notNull(),
		ordem: integer("ordem").default(0).notNull(),
		configuracao: jsonb("configuracao").$type<TVisualKitPieceConfig>(),
		dataGeracao: timestamp("data_geracao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		kitFormatoIdx: uniqueIndex("uq_visual_kit_pieces_kit_formato").on(table.kitId, table.formato),
	}),
);
export const visualKitPiecesRelations = relations(visualKitPieces, ({ one, many }) => ({
	kit: one(visualKits, { fields: [visualKitPieces.kitId], references: [visualKits.id] }),
	arquivos: many(visualKitPieceFiles),
}));
export type TVisualKitPieceEntity = typeof visualKitPieces.$inferSelect;

export const visualKitItems = newTable(
	"visual_kit_items",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		kitId: varchar("kit_id", { length: 255 })
			.references(() => visualKits.id, { onDelete: "cascade" })
			.notNull(),
		produtoId: varchar("produto_id", { length: 255 })
			.references(() => products.id, { onDelete: "cascade" })
			.notNull(),
		// Produto com variantes entra por variante: cada uma tem preço, foto e conteúdo próprios.
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, { onDelete: "cascade" }),
		ordem: integer("ordem").default(0).notNull(),
		// Preços efetivamente impressos na última geração (Fase 2): base do aviso "Preço mudou".
		precoGerado: doublePrecision("preco_gerado"),
		precoDeGerado: doublePrecision("preco_de_gerado"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		kitIdx: index("idx_visual_kit_items_kit").on(table.kitId),
		// Unicidade (kit, produto, variante) com NULLS NOT DISTINCT só existe na migração SQL — o
		// drizzle-orm não expressa NULLS NOT DISTINCT. Mesmo padrão de product_channel_settings.
		produtoIdx: index("idx_visual_kit_items_produto").on(table.produtoId),
	}),
);
export const visualKitItemsRelations = relations(visualKitItems, ({ one }) => ({
	kit: one(visualKits, { fields: [visualKitItems.kitId], references: [visualKits.id] }),
	produto: one(products, { fields: [visualKitItems.produtoId], references: [products.id] }),
	produtoVariante: one(productVariants, { fields: [visualKitItems.produtoVarianteId], references: [productVariants.id] }),
}));
export type TVisualKitItemEntity = typeof visualKitItems.$inferSelect;

/**
 * Arquivos da última geração de cada peça. PDFs são um arquivo por peça; imagens, um por página
 * (selo/post/story: um por produto, com `produtoId`). O .zip nunca é guardado: é montado no
 * navegador na hora do download, a partir destes arquivos.
 */
export const visualKitPieceFiles = newTable(
	"visual_kit_piece_files",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		pecaId: varchar("peca_id", { length: 255 })
			.references(() => visualKitPieces.id, { onDelete: "cascade" })
			.notNull(),
		arquivoId: varchar("arquivo_id", { length: 255 })
			.references(() => files.id, { onDelete: "cascade" })
			.notNull(),
		nome: text("nome").notNull(), // nome do arquivo dentro do .zip ("01-dipirona-1g.png")
		produtoId: varchar("produto_id", { length: 255 }).references(() => products.id, { onDelete: "set null" }),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, { onDelete: "set null" }),
		ordem: integer("ordem").default(0).notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		pecaIdx: index("idx_visual_kit_piece_files_peca").on(table.pecaId),
	}),
);
export const visualKitPieceFilesRelations = relations(visualKitPieceFiles, ({ one }) => ({
	peca: one(visualKitPieces, { fields: [visualKitPieceFiles.pecaId], references: [visualKitPieces.id] }),
	arquivo: one(files, { fields: [visualKitPieceFiles.arquivoId], references: [files.id] }),
}));
export type TVisualKitPieceFileEntity = typeof visualKitPieceFiles.$inferSelect;
