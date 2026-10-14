import { relations } from "drizzle-orm";
import { index, integer, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { newTable } from "./common";
import { poiTransactionRequestStatusEnum, poiTransactionRequestTypeEnum } from "./enums";
import { organizations, organizationMembers } from "./organizations";
import { sales } from "./sales";
import { sellers } from "./sellers";
import { cashbackProgramTransactions } from "./cashback-programs";
import { couponRedemptions } from "./coupons";

export const poiTransactionRequests = newTable(
	"poi_transaction_requests",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "set null" }),
		tipoSolicitacao: poiTransactionRequestTypeEnum("tipo_solicitacao").notNull().default("NOVA_TRANSACAO"),
		status: poiTransactionRequestStatusEnum("status").notNull().default("PENDENTE"),
		tokenPublico: varchar("token_publico", { length: 255 }).notNull(),
		payloadSolicitacao: jsonb("payload_solicitacao").notNull(),
		resumoSolicitacao: jsonb("resumo_solicitacao"),
		operadorAprovadorId: varchar("operador_aprovador_id", { length: 255 }).references(() => organizationMembers.id, { onDelete: "set null" }),
		operadorAprovadorVendedorId: varchar("operador_aprovador_vendedor_id", { length: 255 }).references(() => sellers.id, { onDelete: "set null" }),
		motivoInternoRejeicao: text("motivo_interno_rejeicao"),
		erroProcessamento: text("erro_processamento"),
		vendaId: varchar("venda_id", { length: 255 }).references(() => sales.id, { onDelete: "set null" }),
		transacaoAcumuloId: varchar("transacao_acumulo_id", { length: 255 }),
		transacaoResgateId: varchar("transacao_resgate_id", { length: 255 }),
		cupomResgateId: varchar("cupom_resgate_id", { length: 255 }),
		dataAprovacao: timestamp("data_aprovacao"),
		dataRejeicao: timestamp("data_rejeicao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoIdIdx: index("idx_poi_transaction_requests_organizacao_id").on(table.organizacaoId),
		statusIdx: index("idx_poi_transaction_requests_status").on(table.status),
		tokenPublicoIdx: index("idx_poi_transaction_requests_token_publico").on(table.tokenPublico),
		clienteIdIdx: index("idx_poi_transaction_requests_cliente_id").on(table.clienteId),
		vendaIdIdx: index("idx_poi_transaction_requests_venda_id").on(table.vendaId),
		dataInsercaoIdx: index("idx_poi_transaction_requests_data_insercao").on(table.dataInsercao),
	}),
);

export const poiTransactionRequestsRelations = relations(poiTransactionRequests, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [poiTransactionRequests.organizacaoId],
		references: [organizations.id],
	}),
	cliente: one(clients, {
		fields: [poiTransactionRequests.clienteId],
		references: [clients.id],
	}),
	venda: one(sales, {
		fields: [poiTransactionRequests.vendaId],
		references: [sales.id],
	}),
	operadorAprovador: one(organizationMembers, {
		fields: [poiTransactionRequests.operadorAprovadorId],
		references: [organizationMembers.id],
	}),
	operadorAprovadorVendedor: one(sellers, {
		fields: [poiTransactionRequests.operadorAprovadorVendedorId],
		references: [sellers.id],
	}),
	transacaoAcumulo: one(cashbackProgramTransactions, {
		fields: [poiTransactionRequests.transacaoAcumuloId],
		references: [cashbackProgramTransactions.id],
		relationName: "transacaoAcumulo",
	}),
	transacaoResgate: one(cashbackProgramTransactions, {
		fields: [poiTransactionRequests.transacaoResgateId],
		references: [cashbackProgramTransactions.id],
		relationName: "transacaoResgate",
	}),
	cupomResgate: one(couponRedemptions, {
		fields: [poiTransactionRequests.cupomResgateId],
		references: [couponRedemptions.id],
	}),
}));

export type TPoiTransactionRequestEntity = typeof poiTransactionRequests.$inferSelect;
export type TNewPoiTransactionRequestEntity = typeof poiTransactionRequests.$inferInsert;

// Idempotência de new-transaction (plano §11): a chave nasce no dispositivo antes da primeira
// tentativa; repetição com a mesma chave devolve a resposta original em vez de criar outra venda.
// Mesmo padrão de shop_order_requests: unicidade por constraint, hash do payload, semântica de
// concorrência via status PROCESSANDO.
export const poiTransactionIdempotencyRequests = newTable(
	"poi_transaction_idempotency_requests",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		// Nullable: chamadas legadas do POI web podem adotar idempotência sem principal.
		principalId: varchar("principal_id", { length: 255 }),
		idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
		payloadHash: varchar("payload_hash", { length: 255 }).notNull(),
		status: varchar("status", { length: 30 }).$type<"PROCESSANDO" | "CONCLUIDO" | "ERRO_REPETIVEL">().notNull().default("PROCESSANDO"),
		tentativaId: varchar("tentativa_id", { length: 255 }).notNull(),
		leaseExpiraEm: timestamp("lease_expira_em").notNull(),
		numeroTentativas: integer("numero_tentativas").notNull().default(1),
		resposta: jsonb("resposta"),
		erro: text("erro"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$onUpdate(() => new Date()),
	},
	(table) => ({
		organizacaoIdempotencyKeyUnique: uniqueIndex("idx_poi_transaction_idempotency_org_key_unique").on(table.organizacaoId, table.idempotencyKey),
	}),
);

export type TPoiTransactionIdempotencyRequestEntity = typeof poiTransactionIdempotencyRequests.$inferSelect;
