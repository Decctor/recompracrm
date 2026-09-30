import { relations } from "drizzle-orm";
import { boolean, doublePrecision, index, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { salesChannelCatalogModeEnum, salesChannelTypeEnum } from "./enums";
import { integrations } from "./integrations";
import { organizations } from "./organizations";
import { productAddOnOptions, products, productVariants } from "./products";

// ATENÇÃO: os dois uniques abaixo são criados como NULLS NOT DISTINCT em
// drizzle/0082_product_sales_channels.sql — sem isso, canais internos (integracao_id/ref_externo
// nulos) e linhas de nível produto (produto_variante_id nulo) duplicariam, porque o Postgres
// trata cada NULL como distinto. Esta versão do drizzle-orm não expressa NULLS NOT DISTINCT no
// schema, então um `drizzle-kit generate` que toque nesses índices vai propor recriá-los SEM a
// cláusula: revise o SQL gerado antes de aplicar.

export const salesChannels = newTable(
	"sales_channels",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		canal: salesChannelTypeEnum("canal").notNull(),
		integracaoId: varchar("integracao_id", { length: 255 }).references(() => integrations.id, { onDelete: "cascade" }),
		refExterno: varchar("ref_externo", { length: 255 }),
		catalogoModo: salesChannelCatalogModeEnum("catalogo_modo").default("TODOS").notNull(),
		// Se os mínimos dos grupos de adicionais (`product_add_ons.min_opcoes`) valem NESTE canal.
		// Nasce true — o cadastro do produto continua sendo a regra —, e desligar é uma decisão de
		// operação do canal: no balcão o atendente monta o item no ritmo da fila, enquanto o
		// autoatendimento (SHOP/iFood) não tem ninguém para completar o que faltou.
		exigirAdicionaisMinimos: boolean("exigir_adicionais_minimos").default(true).notNull(),
		// Ordem dos grupos (`products.grupo`) na vitrine deste canal; grupos ausentes da lista vão
		// depois, em ordem alfabética. Os nomes são texto livre do cadastro do produto, então uma
		// entrada pode ficar órfã quando o grupo é renomeado — a leitura poda contra os grupos que
		// realmente existem, em vez de tentar manter a lista sincronizada a cada edição de produto.
		ordemGrupos: text("ordem_grupos").array().notNull().default([]),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$onUpdate(() => new Date()),
	},
	(table) => ({
		identityUnique: uniqueIndex("unq_sales_channels_identity").on(table.organizacaoId, table.canal, table.integracaoId, table.refExterno),
		organizacaoIdx: index("idx_sales_channels_organizacao").on(table.organizacaoId),
	}),
);

export const productChannelSettings = newTable(
	"product_channel_settings",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		canalVendaId: varchar("canal_venda_id", { length: 255 })
			.notNull()
			.references(() => salesChannels.id, { onDelete: "cascade" }),
		produtoId: varchar("produto_id", { length: 255 })
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, { onDelete: "cascade" }),
		disponivel: boolean("disponivel"),
		precoVenda: doublePrecision("preco_venda"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$onUpdate(() => new Date()),
	},
	(table) => ({
		nodeUnique: uniqueIndex("unq_product_channel_settings_node").on(table.canalVendaId, table.produtoId, table.produtoVarianteId),
		canalIdx: index("idx_product_channel_settings_canal").on(table.canalVendaId),
		produtoIdx: index("idx_product_channel_settings_org_produto").on(table.organizacaoId, table.produtoId),
	}),
);

// Irmã de `productChannelSettings` para as opções de adicional: preço e disponibilidade da opção
// num canal. Tabela própria em vez de linhas polimórficas na de produto porque a semântica difere —
// `precoDelta` é acréscimo (não preço cheio) e `disponivel` só pausa a opção (não decide presença
// no catálogo) — e porque toda leitura da tabela de produto supõe linha de produto.
// Linha esparsa: os dois campos nulos não se guardam (o PUT remove a linha).
export const productAddOnOptionChannelSettings = newTable(
	"product_add_on_option_channel_settings",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		canalVendaId: varchar("canal_venda_id", { length: 255 })
			.notNull()
			.references(() => salesChannels.id, { onDelete: "cascade" }),
		produtoAddOnOpcaoId: varchar("produto_add_on_opcao_id", { length: 255 })
			.notNull()
			.references(() => productAddOnOptions.id, { onDelete: "cascade" }),
		// null = herda `product_add_on_options.preco_delta`.
		precoDelta: doublePrecision("preco_delta"),
		// null = herda. Só RESTRINGE: uma opção inativa no cadastro não volta por um `true` aqui.
		disponivel: boolean("disponivel"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$onUpdate(() => new Date()),
	},
	(table) => ({
		nodeUnique: uniqueIndex("unq_add_on_option_channel_settings_node").on(table.canalVendaId, table.produtoAddOnOpcaoId),
		opcaoIdx: index("idx_add_on_option_channel_settings_org_opcao").on(table.organizacaoId, table.produtoAddOnOpcaoId),
	}),
);

export const salesChannelsRelations = relations(salesChannels, ({ many, one }) => ({
	organizacao: one(organizations, { fields: [salesChannels.organizacaoId], references: [organizations.id] }),
	integracao: one(integrations, { fields: [salesChannels.integracaoId], references: [integrations.id] }),
	configuracoesProdutos: many(productChannelSettings),
	configuracoesOpcoes: many(productAddOnOptionChannelSettings),
}));
export const productAddOnOptionChannelSettingsRelations = relations(productAddOnOptionChannelSettings, ({ one }) => ({
	canalVenda: one(salesChannels, { fields: [productAddOnOptionChannelSettings.canalVendaId], references: [salesChannels.id] }),
	opcao: one(productAddOnOptions, { fields: [productAddOnOptionChannelSettings.produtoAddOnOpcaoId], references: [productAddOnOptions.id] }),
}));
export const productChannelSettingsRelations = relations(productChannelSettings, ({ one }) => ({
	canalVenda: one(salesChannels, { fields: [productChannelSettings.canalVendaId], references: [salesChannels.id] }),
	produto: one(products, { fields: [productChannelSettings.produtoId], references: [products.id] }),
	produtoVariante: one(productVariants, { fields: [productChannelSettings.produtoVarianteId], references: [productVariants.id] }),
}));

export type TSalesChannelEntity = typeof salesChannels.$inferSelect;
export type TProductChannelSettingEntity = typeof productChannelSettings.$inferSelect;
export type TProductAddOnOptionChannelSettingEntity = typeof productAddOnOptionChannelSettings.$inferSelect;
