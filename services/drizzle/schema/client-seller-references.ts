import { relations } from "drizzle-orm";
import { doublePrecision, index, integer, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { newTable } from "./common";
import { organizations } from "./organizations";
import { sellers } from "./sellers";

// Carteira derivada vendedor × cliente (docs/seller-routine-hub-design.md §9.3).
// Não existe atribuição manual: o vínculo é derivado do histórico de vendas
// (frequência com decay de recência sobre sales.vendedorId × clienteId), recomputado
// por cron no mesmo padrão de product_client_references. rankingVinculo = 1 indica o
// vendedor "dono" do vínculo com aquele cliente.
export const clientSellerReferences = newTable(
	"client_seller_references",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		clienteId: varchar("cliente_id", { length: 255 })
			.references(() => clients.id, { onDelete: "cascade" })
			.notNull(),
		vendedorId: varchar("vendedor_id", { length: 255 })
			.references(() => sellers.id, { onDelete: "cascade" })
			.notNull(),
		totalVendas: integer("total_vendas").notNull().default(0),
		valorTotalVendas: doublePrecision("valor_total_vendas").notNull().default(0),
		// Frequência ponderada por decay de recência — base do ranking do vínculo.
		scoreVinculo: doublePrecision("score_vinculo").notNull().default(0),
		// 1 = vendedor com o vínculo mais forte com o cliente.
		rankingVinculo: integer("ranking_vinculo").notNull().default(0),
		primeiraVendaData: timestamp("primeira_venda_data"),
		ultimaVendaData: timestamp("ultima_venda_data"),
		dataUltimaAtualizacao: timestamp("data_ultima_atualizacao").defaultNow().notNull(),
	},
	(table) => ({
		clienteVendedorUnique: uniqueIndex("client_seller_refs_cliente_vendedor_unique").on(table.organizacaoId, table.clienteId, table.vendedorId),
		// Carteira do vendedor: clientes onde ele é o dono do vínculo.
		vendedorRankingIdx: index("idx_client_seller_refs_org_vendedor_ranking").on(table.organizacaoId, table.vendedorId, table.rankingVinculo),
		clienteIdx: index("idx_client_seller_refs_org_cliente").on(table.organizacaoId, table.clienteId),
		// FK ON DELETE CASCADE por cliente_id sozinho (0163): o índice acima começa por organizacao_id.
		clienteIdIdx: index("idx_client_seller_references_cliente_id").on(table.clienteId),
	}),
);
export const clientSellerReferenceRelations = relations(clientSellerReferences, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [clientSellerReferences.organizacaoId],
		references: [organizations.id],
	}),
	cliente: one(clients, {
		fields: [clientSellerReferences.clienteId],
		references: [clients.id],
	}),
	vendedor: one(sellers, {
		fields: [clientSellerReferences.vendedorId],
		references: [sellers.id],
	}),
}));
export type TClientSellerReferenceEntity = typeof clientSellerReferences.$inferSelect;
export type TNewClientSellerReferenceEntity = typeof clientSellerReferences.$inferInsert;
