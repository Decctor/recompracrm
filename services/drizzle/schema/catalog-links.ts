import { relations } from "drizzle-orm";
import { index, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import type { TCatalogLinkDivergence, TCatalogLinkSnapshot, TCatalogLinkSyncPolicy } from "@/schemas/catalog-links";
import { newTable } from "./common";
import { catalogLinkProviderEnum, catalogLinkStatusEnum, catalogLinkTypeEnum } from "./enums";
import { organizations } from "./organizations";
import { productAddOnOptions, productAddOns, products, productVariants } from "./products";
import { users } from "./users";

// ATENÇÃO: o unique de identidade abaixo é criado como NULLS NOT DISTINCT em
// drizzle/0083_catalog_links.sql — as colunas de referência interna são mutuamente exclusivas
// (só uma é preenchida por tipo), então sem a cláusula o Postgres trataria cada NULL como
// distinto e permitiria vínculos duplicados. Esta versão do drizzle-orm não expressa NULLS NOT
// DISTINCT no schema: revise o SQL de qualquer `drizzle-kit generate` que toque este índice.
//
// Há ainda um SEGUNDO índice único que existe só em SQL (0083 + 0114), sem declaração aqui:
// `unq_catalog_links_externo_item` em (organizacao_id, provider, merchant_id, externo_item_id)
// WHERE externo_item_id IS NOT NULL AND status <> 'DESVINCULADO' — um item remoto pertence a no
// máximo um vínculo ATIVO por loja. Predicado de índice também não é expressável neste drizzle-orm;
// um `drizzle-kit generate` pode propor derrubá-lo. Não aceite. `upsertCatalogLink` faz a
// pré-checagem com mensagem amigável; o índice fecha a corrida.

/**
 * Um vínculo entre uma entidade interna e sua contraparte no catálogo remoto, POR MERCHANT
 * (o iFood é multi-loja por organização). O vínculo é a unidade de opt-in: matéria-prima e itens
 * internos simplesmente nunca são vinculados.
 */
export const catalogLinks = newTable(
	"catalog_links",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		provider: catalogLinkProviderEnum("provider").notNull(),
		merchantId: varchar("merchant_id", { length: 255 }).notNull(),
		tipo: catalogLinkTypeEnum("tipo").notNull(),

		// Referência interna — exatamente uma preenchida, conforme o tipo.
		produtoId: varchar("produto_id", { length: 255 }).references(() => products.id, { onDelete: "cascade" }),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, { onDelete: "cascade" }),
		produtoAddOnId: varchar("produto_add_on_id", { length: 255 }).references(() => productAddOns.id, { onDelete: "cascade" }),
		produtoAddOnOpcaoId: varchar("produto_add_on_opcao_id", { length: 255 }).references(() => productAddOnOptions.id, { onDelete: "cascade" }),
		/** Para CATEGORIA: `products.grupo` é texto livre, não tabela. */
		grupoInterno: text("grupo_interno"),

		// Referência externa (iFood). O item carrega preço/status; o produto carrega nome/imagem.
		externoProdutoId: varchar("externo_produto_id", { length: 255 }),
		externoItemId: varchar("externo_item_id", { length: 255 }),
		externoCategoriaId: varchar("externo_categoria_id", { length: 255 }),
		externoOptionGroupId: varchar("externo_option_group_id", { length: 255 }),
		externoOptionId: varchar("externo_option_id", { length: 255 }),

		/** Quais campos este vínculo sincroniza — o coração do "parcial por campo". */
		sincronizar: jsonb("sincronizar").$type<TCatalogLinkSyncPolicy>().notNull(),

		status: catalogLinkStatusEnum("status").default("PENDENTE").notNull(),
		/** Valores no último push bem-sucedido — base para detectar drift sem reler tudo. */
		ultimoSnapshot: jsonb("ultimo_snapshot").$type<TCatalogLinkSnapshot | null>(),
		divergencias: jsonb("divergencias").$type<TCatalogLinkDivergence[] | null>(),
		ultimoErro: text("ultimo_erro"),
		dataUltimaSincronizacao: timestamp("data_ultima_sincronizacao"),
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$onUpdate(() => new Date()),
	},
	(table) => ({
		identityUnique: uniqueIndex("unq_catalog_links_identity").on(
			table.organizacaoId,
			table.provider,
			table.merchantId,
			table.tipo,
			table.produtoId,
			table.produtoVarianteId,
			table.produtoAddOnId,
			table.produtoAddOnOpcaoId,
		),
		organizacaoStatusIdx: index("idx_catalog_links_org_status").on(table.organizacaoId, table.provider, table.merchantId, table.status),
		produtoIdx: index("idx_catalog_links_produto").on(table.organizacaoId, table.produtoId),
	}),
);

export const catalogLinksRelations = relations(catalogLinks, ({ one }) => ({
	organizacao: one(organizations, { fields: [catalogLinks.organizacaoId], references: [organizations.id] }),
	produto: one(products, { fields: [catalogLinks.produtoId], references: [products.id] }),
	produtoVariante: one(productVariants, { fields: [catalogLinks.produtoVarianteId], references: [productVariants.id] }),
	produtoAddOn: one(productAddOns, { fields: [catalogLinks.produtoAddOnId], references: [productAddOns.id] }),
	produtoAddOnOpcao: one(productAddOnOptions, { fields: [catalogLinks.produtoAddOnOpcaoId], references: [productAddOnOptions.id] }),
	autor: one(users, { fields: [catalogLinks.autorId], references: [users.id] }),
}));

export type TCatalogLinkEntity = typeof catalogLinks.$inferSelect;
export type TNewCatalogLinkEntity = typeof catalogLinks.$inferInsert;
