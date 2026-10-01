import { relations, sql } from "drizzle-orm";
import { doublePrecision, index, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { boolean, text, varchar } from "drizzle-orm/pg-core";
import { campaigns } from "./campaigns";
import { clients } from "./clients";
import { newTable } from "./common";
import {
	cashbackProgramAccumulationTypeEnum,
	cashbackProgramRedemptionLimitTypeEnum,
	cashbackProgramTerminologyEnum,
	cashbackProgramTransactionStatusEnum,
	cashbackProgramTransactionTypeEnum,
} from "./enums";
import { organizations } from "./organizations";
import { productVariants, products } from "./products";
import { sales } from "./sales";
import { sellers } from "./sellers";
import { users } from "./users";

export const cashbackPrograms = newTable("cashback_programs", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 })
		.references(() => organizations.id, { onDelete: "cascade" })
		.notNull(),
	ativo: boolean("ativo").notNull().default(true),
	titulo: text("titulo").notNull(),
	descricao: text("descricao"),
	terminologia: cashbackProgramTerminologyEnum("terminologia").notNull().default("DINHEIRO"),
	modalidadeDescontosPermitida: boolean("modalidade_descontos_permitida").notNull().default(true),
	modalidadeRecompensasPermitida: boolean("modalidade_recompensas_permitida").notNull().default(false),
	acumuloTipo: cashbackProgramAccumulationTypeEnum().notNull().default("FIXO"),
	acumuloValor: doublePrecision("acumulo_valor").notNull().default(0),
	acumuloValorParceiro: doublePrecision("acumulo_valor_parceiro").notNull().default(0),
	acumuloRegraValorMinimo: doublePrecision("acumulo_regra_valor_minimo").notNull().default(0),
	// Configurations for accumulation source
	acumuloPermitirViaIntegracao: boolean("acumulo_permitir_via_integracao").notNull().default(false),
	acumuloPermitirViaPontoIntegracao: boolean("acumulo_permitir_via_ponto_integracao").notNull().default(false),
	// Superfícies de resgate (desconto em cashback E recompensa): o programa decide onde o cliente
	// pode resgatar — mesmo desenho dos cupons (`coupons.resgate_permitir_via_*`). Mora no
	// programa, e não em `sales_channels`, porque superfície ≠ canal de venda (o POI resgata sem
	// ser canal; iFood/comanda são canais sem resgate) e porque canais de venda são só do tier ERP,
	// enquanto loja digital e cashback não são. Default true = comportamento vigente antes do gate.
	// O nome da coluna do POI ("integracao") é histórico — não corrigir sem migração.
	resgatePermitirViaPos: boolean("resgate_permitir_via_pos").notNull().default(true),
	resgatePermitirViaPontoIntegracao: boolean("resgate_permitir_via_ponto_integracao").notNull().default(true),
	resgatePermitirViaLojaDigital: boolean("resgate_permitir_via_loja_digital").notNull().default(true),
	expiracaoRegraValidadeValor: doublePrecision("expiracao_regra_validade_valor").notNull().default(0),
	resgateLimiteTipo: cashbackProgramRedemptionLimitTypeEnum(),
	resgateLimiteValor: doublePrecision("resgate_limite_valor"),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	dataAtualizacao: timestamp("data_atualizacao"),
});
export const cashbackProgramRelations = relations(cashbackPrograms, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [cashbackPrograms.organizacaoId],
		references: [organizations.id],
	}),
	saldos: many(cashbackProgramBalances),
	recompensas: many(cashbackProgramPrizes),
	transacoes: many(cashbackProgramTransactions),
}));
export type TCashbackProgramEntity = typeof cashbackPrograms.$inferSelect;
export type TNewCashbackProgramEntity = typeof cashbackPrograms.$inferInsert;
export const cashbackProgramPrizes = newTable("cashback_program_prizes", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
	programaId: varchar("programa_id", { length: 255 })
		.references(() => cashbackPrograms.id)
		.notNull(),
	ativo: boolean("ativo").notNull().default(true),
	produtoId: varchar("produto_id", { length: 255 }).references(() => products.id),
	produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id),
	titulo: text("titulo").notNull(),
	descricao: text("descricao"),
	imagemCapaUrl: text("imagem_capa_url"),
	valor: doublePrecision("valor").notNull(), // defines the prize value in cashback "currency"
	// Recompensa já resgatada não pode ser excluída (o resgate a referencia): é arquivada. Arquivada
	// implica `ativo = false`, então toda superfície que já filtra por `ativo` a esconde sem mudança.
	dataArquivamento: timestamp("data_arquivamento"),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	dataAtualizacao: timestamp("data_atualizacao").$defaultFn(() => new Date()),
});
export const cashbackProgramPrizeRelations = relations(cashbackProgramPrizes, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [cashbackProgramPrizes.organizacaoId],
		references: [organizations.id],
	}),
	programa: one(cashbackPrograms, {
		fields: [cashbackProgramPrizes.programaId],
		references: [cashbackPrograms.id],
	}),
	produto: one(products, {
		fields: [cashbackProgramPrizes.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [cashbackProgramPrizes.produtoVarianteId],
		references: [productVariants.id],
	}),
}));
export type TCashbackProgramPrizeEntity = typeof cashbackProgramPrizes.$inferSelect;
export type TNewCashbackProgramPrizeEntity = typeof cashbackProgramPrizes.$inferInsert;
export const cashbackProgramBalances = newTable(
	"cashback_program_balances",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		clienteId: varchar("cliente_id", { length: 255 })
			.references(() => clients.id, { onDelete: "cascade" })
			.notNull(),
		programaId: varchar("programa_id", { length: 255 })
			.references(() => cashbackPrograms.id)
			.notNull(),
		saldoValorDisponivel: doublePrecision("saldo_valor_disponivel").notNull().default(0),
		saldoValorAcumuladoTotal: doublePrecision("saldo_valor_acumulado_total").notNull().default(0),
		saldoValorResgatadoTotal: doublePrecision("saldo_valor_resgatado_total").notNull().default(0),
		// Momento explícito de adesão ao clube ("Membro desde").
		dataAdesao: timestamp("data_adesao").defaultNow().notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$defaultFn(() => new Date()),
	},
	(table) => ({
		// ensureCashbackBalanceForClient sempre assumiu "no máximo uma linha por
		// (org, cliente, programa)"; o índice torna a suposição verdadeira e dá à
		// consolidação de saldo do merge de clientes contra o que se defender.
		// Migration 0096 deduplica as linhas existentes antes de criar o índice.
		orgClienteProgramaUnique: uniqueIndex("idx_cashback_balances_org_cliente_programa").on(table.organizacaoId, table.clienteId, table.programaId),
	}),
);
export const cashbackProgramBalanceRelations = relations(cashbackProgramBalances, ({ one }) => ({
	cliente: one(clients, {
		fields: [cashbackProgramBalances.clienteId],
		references: [clients.id],
	}),
	programa: one(cashbackPrograms, {
		fields: [cashbackProgramBalances.programaId],
		references: [cashbackPrograms.id],
	}),
}));

export const cashbackProgramTransactions = newTable(
	"cashback_program_transactions",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		clienteId: varchar("cliente_id", { length: 255 })
			.references(() => clients.id, { onDelete: "cascade" })
			.notNull(),
		vendaId: varchar("venda_id", { length: 255 }).references(() => sales.id),
		vendaValor: doublePrecision("venda_valor").notNull().default(0),
		programaId: varchar("programa_id", { length: 255 })
			.references(() => cashbackPrograms.id)
			.notNull(),
		status: cashbackProgramTransactionStatusEnum("status").notNull().default("ATIVO"),
		tipo: cashbackProgramTransactionTypeEnum("tipo").notNull(),
		valor: doublePrecision("valor").notNull(),
		valorRestante: doublePrecision("valor_restante").notNull(),

		saldoValorAnterior: doublePrecision("saldo_valor_anterior").notNull(),
		saldoValorPosterior: doublePrecision("saldo_valor_posterior").notNull(),

		expiracaoData: timestamp("expiracao_data"),

		// Fields to track the reward given for the redemption
		resgateRecompensaId: varchar("resgate_recompensa_id", { length: 255 }).references(() => cashbackProgramPrizes.id),
		resgateRecompensaValor: doublePrecision("resgate_recompensa_valor"),

		operadorId: varchar("operador_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		operadorVendedorId: varchar("operador_vendedor_id", { length: 255 }).references(() => sellers.id, { onDelete: "set null" }),
		campanhaId: varchar("campanha_id", { length: 255 }).references(() => campaigns.id),
		metadados: jsonb("metadados"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$defaultFn(() => new Date()),
	},
	(table) => ({
		// FK sem índice: a listagem de vendas hidrata `transacoesCashback` por venda (LATERAL) e cada
		// lookup era um seq scan da tabela inteira.
		vendaIdIdx: index("idx_cashback_program_transactions_venda_id").on(table.vendaId),
		// Parcial: só resgates de recompensa. Serve a contagem de resgates por recompensa e a decisão
		// excluir-ou-arquivar.
		resgateRecompensaIdIdx: index("idx_cashback_program_transactions_resgate_recompensa_id")
			.on(table.resgateRecompensaId)
			.where(sql`${table.resgateRecompensaId} IS NOT NULL`),
	}),
);
export const cashbackProgramTransactionRelations = relations(cashbackProgramTransactions, ({ one }) => ({
	venda: one(sales, {
		fields: [cashbackProgramTransactions.vendaId],
		references: [sales.id],
	}),
	cliente: one(clients, {
		fields: [cashbackProgramTransactions.clienteId],
		references: [clients.id],
	}),
	operador: one(users, {
		fields: [cashbackProgramTransactions.operadorId],
		references: [users.id],
	}),
	operadorVendedor: one(sellers, {
		fields: [cashbackProgramTransactions.operadorVendedorId],
		references: [sellers.id],
	}),
	programa: one(cashbackPrograms, {
		fields: [cashbackProgramTransactions.programaId],
		references: [cashbackPrograms.id],
	}),
	campanha: one(campaigns, {
		fields: [cashbackProgramTransactions.campanhaId],
		references: [campaigns.id],
	}),
	resgateRecompensa: one(cashbackProgramPrizes, {
		fields: [cashbackProgramTransactions.resgateRecompensaId],
		references: [cashbackProgramPrizes.id],
	}),
}));
