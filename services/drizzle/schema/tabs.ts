import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { doublePrecision, index, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { newTable } from "./common";
import { saleAttendanceStatusEnum, tabStatusEnum } from "./enums";
import { organizations } from "./organizations";
import { saleItems, sales } from "./sales";
import { sellers } from "./sellers";
import { serviceCards } from "./service-cards";
import { servicePoints } from "./service-points";
import { users } from "./users";

// ============================================================================
// TABS (Contas de Atendimento — comanda, conta, ficha...)
// Conta de consumo efemera com ciclo de vida (abre, acumula pedidos, fecha).
// O grao comercial e a conta: uma unica venda rascunho (ORCAMENTO) agrega o
// consumo e e confirmada uma unica vez no fechamento. As rodadas (tabOrders)
// sao tickets operacionais sem identidade comercial/financeira/fiscal.
// ============================================================================

export const tabs = newTable(
	"tabs",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		servicePointId: varchar("service_point_id", { length: 255 }).references(() => servicePoints.id, { onDelete: "set null" }),
		codigo: text("codigo"), // nullable em mesa; obrigatorio quando houver comanda fisica
		// Comanda fixa cadastrada; `codigo` recebe o snapshot do numero do cartao na abertura.
		serviceCardId: varchar("service_card_id", { length: 255 }).references(() => serviceCards.id, { onDelete: "set null" }),
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "set null" }),
		status: tabStatusEnum("status").notNull().default("ABERTA"),
		// Token do QR efemero da tab (papel/pulseira/cartao). Persistimos apenas o hash.
		tokenPublicoHash: varchar("token_publico_hash", { length: 64 }).notNull(),
		responsavelVendedorId: varchar("responsavel_vendedor_id", { length: 255 }).references(() => sellers.id, { onDelete: "set null" }),
		abertaPorUsuarioId: varchar("aberta_por_usuario_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		fechadaPorUsuarioId: varchar("fechada_por_usuario_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		valorTotal: doublePrecision("valor_total"), // snapshot congelado no fechamento
		observacoes: text("observacoes"),
		metadados: jsonb("metadados"),
		dataAbertura: timestamp("data_abertura").defaultNow().notNull(),
		dataFechamento: timestamp("data_fechamento"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		orgStatusIdx: index("idx_tabs_org_status").on(table.organizacaoId, table.status),
		pontoIdx: index("idx_tabs_service_point").on(table.servicePointId),
		tokenPublicoHashIdx: uniqueIndex("idx_tabs_token_publico_hash").on(table.tokenPublicoHash),
		// Impede duas comandas fisicas com o mesmo codigo abertas ao mesmo tempo; libera reuso apos fechar.
		codigoAbertaIdx: uniqueIndex("idx_tabs_org_codigo_aberta")
			.on(table.organizacaoId, table.codigo)
			.where(sql`status = 'ABERTA' AND codigo IS NOT NULL`),
		// Um cartao hospeda no maximo uma conta aberta.
		cartaoAbertaIdx: uniqueIndex("idx_tabs_org_service_card_aberta")
			.on(table.organizacaoId, table.serviceCardId)
			.where(sql`status = 'ABERTA' AND service_card_id IS NOT NULL`),
	}),
);

export const tabsRelations = relations(tabs, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [tabs.organizacaoId],
		references: [organizations.id],
	}),
	servicePoint: one(servicePoints, {
		fields: [tabs.servicePointId],
		references: [servicePoints.id],
	}),
	serviceCard: one(serviceCards, {
		fields: [tabs.serviceCardId],
		references: [serviceCards.id],
	}),
	cliente: one(clients, {
		fields: [tabs.clienteId],
		references: [clients.id],
	}),
	responsavelVendedor: one(sellers, {
		fields: [tabs.responsavelVendedorId],
		references: [sellers.id],
	}),
	abertaPorUsuario: one(users, {
		fields: [tabs.abertaPorUsuarioId],
		references: [users.id],
		relationName: "tab-aberta-por",
	}),
	fechadaPorUsuario: one(users, {
		fields: [tabs.fechadaPorUsuarioId],
		references: [users.id],
		relationName: "tab-fechada-por",
	}),
	vendas: many(sales),
	pedidos: many(tabOrders),
}));

export type TTabEntity = typeof tabs.$inferSelect;
export type TNewTabEntity = typeof tabs.$inferInsert;

// ============================================================================
// TAB ORDERS (Pedidos/rodadas de uma conta)
// Ticket operacional que a cozinha enxerga — espelha a comanda de papel.
// Reusa saleAttendanceStatusEnum e as transicoes de attendance das vendas.
// ============================================================================

export const tabOrders = newTable(
	"tab_orders",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		tabId: varchar("tab_id", { length: 255 })
			.references(() => tabs.id, { onDelete: "cascade" })
			.notNull(),
		numero: doublePrecision("numero").notNull(), // sequencial dentro da conta (Pedido 1, 2, 3...)
		status: saleAttendanceStatusEnum("status").notNull().default("EM_PREPARO"),
		observacoes: text("observacoes"), // "sem cebola", nome da pessoa da rodada
		lancadoPorUsuarioId: varchar("lancado_por_usuario_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		dataEnvio: timestamp("data_envio").defaultNow().notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		tabIdx: index("idx_tab_orders_tab").on(table.tabId),
		orgStatusIdx: index("idx_tab_orders_org_status").on(table.organizacaoId, table.status),
		tabNumeroIdx: uniqueIndex("idx_tab_orders_tab_numero").on(table.tabId, table.numero),
	}),
);

export const tabOrdersRelations = relations(tabOrders, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [tabOrders.organizacaoId],
		references: [organizations.id],
	}),
	tab: one(tabs, {
		fields: [tabOrders.tabId],
		references: [tabs.id],
	}),
	lancadoPorUsuario: one(users, {
		fields: [tabOrders.lancadoPorUsuarioId],
		references: [users.id],
	}),
	itens: many(saleItems),
}));

export type TTabOrderEntity = typeof tabOrders.$inferSelect;
export type TNewTabOrderEntity = typeof tabOrders.$inferInsert;
