// Tentativas de pagamento em terminal SmartPOS (RecompraCRM POS). Modelo e decisões em
// recompracrm-pos-android/docs/03-tentativa-de-pagamento.md e 05-persistencia-backend.md.
//
// A tentativa é uma cobrança externa, não uma transação contábil: nasce no backend (no Fluxo B,
// dentro da transação que confirma a venda), vinculada à transação financeira PENDENTE que ela
// efetiva quando aprovada, e atribuída ao dispositivo que vai executá-la. O terminal reporta
// evidência; somente o backend deriva o estado. `payment_attempts` é a projeção autoritativa;
// `payment_attempt_events` é append-only para auditoria e diagnóstico de resultados incertos.
import { relations, sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, index, integer, jsonb, numeric, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { accessPrincipals } from "./access";
import { newTable } from "./common";
import {
	paymentAttemptNotApprovedReasonEnum,
	paymentAttemptOperationEnum,
	paymentAttemptProviderEnum,
	paymentAttemptStatusEnum,
	paymentInstallmentPartyEnum,
	paymentMethodEnum,
} from "./enums";
import { financialTransactions } from "./financial";
import { organizations } from "./organizations";
import { sales } from "./sales";
import { salesSessions } from "./sales-sessions";
import { users } from "./users";

// Projeção allowlisted e versionada do que o terminal reportou (docs/07). Nunca contém PAN
// completo, nome do portador, URI bruta ou payload externo não revisado.
export type TPaymentAttemptSanitizedResult = {
	versao: 1;
	tipo: string;
	provedorStatus?: string | null;
	itk?: string | null;
	atk?: string | null;
	codigoAutorizacao?: string | null;
	codigoResposta?: string | null;
	bandeira?: string | null;
	panMascarado?: string | null;
	modoEntrada?: string | null;
	valorAutorizado?: number | null;
	totalParcelas?: number | null;
	dataAutorizacao?: string | null;
	ordemProvedorId?: string | null;
	mensagem?: string | null;
};

export const paymentAttempts = newTable(
	"payment_attempts",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		vendaId: varchar("venda_id", { length: 255 })
			.references(() => sales.id, { onDelete: "cascade" })
			.notNull(),
		// Dispositivo responsável pela execução: atribuído pelo operador no Fluxo B; criador no Fluxo A.
		dispositivoId: varchar("dispositivo_id", { length: 255 })
			.references(() => accessPrincipals.id, { onDelete: "restrict" })
			.notNull(),
		// Derivada da venda no momento da criação (a venda pode trocar de sessão depois; a tentativa não).
		sessaoVendaId: varchar("sessao_venda_id", { length: 255 }).references(() => salesSessions.id, { onDelete: "set null" }),
		// Cancelamento externo (marco 2) nasce como nova tentativa apontando para a cobrança original.
		tentativaOrigemId: varchar("tentativa_origem_id", { length: 255 }).references((): AnyPgColumn => paymentAttempts.id, {
			onDelete: "restrict",
		}),
		operacao: paymentAttemptOperationEnum("operacao").notNull().default("COBRANCA"),
		provedor: paymentAttemptProviderEnum("provedor").notNull(),
		metodo: paymentMethodEnum("metodo").notNull(),
		// Imutáveis após a criação: valor, método e parcelamento ficam congelados por construção.
		valor: numeric("valor", { precision: 14, scale: 2, mode: "number" }).notNull(),
		moeda: varchar("moeda", { length: 3 }).notNull().default("BRL"),
		totalParcelas: integer("total_parcelas"),
		parcelamentoResponsavel: paymentInstallmentPartyEnum("parcelamento_responsavel"),
		status: paymentAttemptStatusEnum("status").notNull().default("CRIADA"),
		motivoNaoAprovacao: paymentAttemptNotApprovedReasonEnum("motivo_nao_aprovacao"),
		// Preenchidas apenas quando a tentativa nasce de um comando externo (Fluxo A). No Fluxo B a
		// idempotência da criação é herdada da confirmação da venda.
		chaveIdempotencia: varchar("chave_idempotencia", { length: 255 }),
		fingerprintEntrada: varchar("fingerprint_entrada", { length: 128 }),
		// `order_id` enviado à adquirente: sequência numérica do backend (decisão 6 de docs/10),
		// serializada como string na API. Identity global — a unicidade por provedor é consequência.
		ordemProvedorId: bigint("ordem_provedor_id", { mode: "number" }).generatedAlwaysAsIdentity(),
		// Evidência sanitizada do provedor — projeção conveniente dos campos que participam de
		// conciliação. O payload allowlisted completo fica em `resultadoSanitizado`.
		provedorStatus: text("provedor_status"),
		itkProvedor: varchar("itk_provedor", { length: 128 }),
		atkProvedor: varchar("atk_provedor", { length: 128 }),
		codigoResposta: varchar("codigo_resposta", { length: 32 }),
		codigoAutorizacao: varchar("codigo_autorizacao", { length: 64 }),
		bandeira: varchar("bandeira", { length: 64 }),
		panMascarado: varchar("pan_mascarado", { length: 32 }),
		modoEntrada: varchar("modo_entrada", { length: 32 }),
		valorAutorizado: numeric("valor_autorizado", { precision: 14, scale: 2, mode: "number" }),
		dataAutorizacaoProvedor: timestamp("data_autorizacao_provedor"),
		erroCodigo: varchar("erro_codigo", { length: 64 }),
		erroMensagem: text("erro_mensagem"),
		resultadoSanitizado: jsonb("resultado_sanitizado").$type<TPaymentAttemptSanitizedResult | null>(),
		// Transação financeira pendente que esta tentativa efetiva ao ser consumida. Sempre preenchida
		// na criação (Fluxo B cria ambas na mesma transação); fica nula só quando a plataforma
		// cancela a tentativa e a edição da venda apaga a transação pendente — uma tentativa aberta
		// bloqueia a edição, então o vínculo nunca se perde enquanto importa. A FK unique inversa em
		// financial_transactions (`tentativa_pagamento_id`) é a defesa definitiva contra duplo consumo.
		transacaoFinanceiraId: varchar("transacao_financeira_id", { length: 255 }).references(() => financialTransactions.id, { onDelete: "set null" }),
		// Compare-and-set: toda transição exige `versao` igual à lida; o perdedor da corrida recebe 409.
		versao: integer("versao").notNull().default(1),
		dataInicio: timestamp("data_inicio"),
		dataConclusao: timestamp("data_conclusao"),
		dataConsumo: timestamp("data_consumo"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => ({
		// Listagem de cobranças do terminal: tentativas abertas atribuídas ao dispositivo.
		dispositivoStatusIdx: index("idx_payment_attempts_dispositivo_status").on(table.dispositivoId, table.status),
		organizacaoVendaStatusIdx: index("idx_payment_attempts_organizacao_venda_status").on(table.organizacaoId, table.vendaId, table.status),
		atkProvedorIdx: index("idx_payment_attempts_atk_provedor").on(table.atkProvedor),
		// Uma transação pendente só pode ter UMA tentativa viva (aberta ou consumida); reatribuir o
		// terminal cancela a anterior (NAO_APROVADA) e cria outra para a mesma transação.
		transacaoFinanceiraIdx: uniqueIndex("idx_payment_attempts_transacao_financeira")
			.on(table.transacaoFinanceiraId)
			.where(sql`${table.status} <> 'NAO_APROVADA'`),
		provedorOrdemIdx: uniqueIndex("idx_payment_attempts_provedor_ordem").on(table.provedor, table.ordemProvedorId),
		chaveIdempotenciaIdx: uniqueIndex("idx_payment_attempts_chave_idempotencia")
			.on(table.organizacaoId, table.dispositivoId, table.chaveIdempotencia)
			.where(sql`${table.chaveIdempotencia} is not null`),
	}),
);

// Append-only. Não é fonte primária do estado nem event store: `payment_attempts` continua
// autoritativa. Criação, cancelamento pela plataforma, evidências (inclusive repetidas e
// conflitantes) e consumo geram eventos. `chave_idempotencia` + `fingerprint_entrada` dão a
// idempotência do comando de outcome: mesma chave e mesmo payload = replay; payload diferente = 409.
export const paymentAttemptEvents = newTable(
	"payment_attempt_events",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		tentativaId: varchar("tentativa_id", { length: 255 })
			.references(() => paymentAttempts.id, { onDelete: "cascade" })
			.notNull(),
		principalId: varchar("principal_id", { length: 255 }).references(() => accessPrincipals.id, { onDelete: "set null" }),
		usuarioId: varchar("usuario_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		// Varchar + z.enum no app (PaymentAttemptEventOriginEnum / PaymentAttemptEventTypeEnum):
		// novos valores não custam migração de enum no Postgres.
		origem: varchar("origem", { length: 30 }).notNull(),
		tipo: varchar("tipo", { length: 50 }).notNull(),
		statusAnterior: paymentAttemptStatusEnum("status_anterior"),
		statusPosterior: paymentAttemptStatusEnum("status_posterior").notNull(),
		evidenciaSanitizada: jsonb("evidencia_sanitizada").$type<TPaymentAttemptSanitizedResult | null>(),
		chaveIdempotencia: varchar("chave_idempotencia", { length: 255 }),
		fingerprintEntrada: varchar("fingerprint_entrada", { length: 128 }),
		descricao: text("descricao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		tentativaIdx: index("idx_payment_attempt_events_tentativa").on(table.tentativaId, table.dataInsercao),
		organizacaoIdx: index("idx_payment_attempt_events_organizacao").on(table.organizacaoId),
		chaveIdempotenciaIdx: uniqueIndex("idx_payment_attempt_events_chave_idempotencia")
			.on(table.tentativaId, table.chaveIdempotencia)
			.where(sql`${table.chaveIdempotencia} is not null`),
	}),
);

export const paymentAttemptsRelations = relations(paymentAttempts, ({ one, many }) => ({
	organizacao: one(organizations, { fields: [paymentAttempts.organizacaoId], references: [organizations.id] }),
	venda: one(sales, { fields: [paymentAttempts.vendaId], references: [sales.id] }),
	dispositivo: one(accessPrincipals, { fields: [paymentAttempts.dispositivoId], references: [accessPrincipals.id] }),
	sessaoVenda: one(salesSessions, { fields: [paymentAttempts.sessaoVendaId], references: [salesSessions.id] }),
	tentativaOrigem: one(paymentAttempts, {
		fields: [paymentAttempts.tentativaOrigemId],
		references: [paymentAttempts.id],
		relationName: "payment_attempt_origin",
	}),
	transacaoFinanceira: one(financialTransactions, {
		fields: [paymentAttempts.transacaoFinanceiraId],
		references: [financialTransactions.id],
		relationName: "payment_attempt_financial_transaction",
	}),
	eventos: many(paymentAttemptEvents),
}));

export const paymentAttemptEventsRelations = relations(paymentAttemptEvents, ({ one }) => ({
	tentativa: one(paymentAttempts, { fields: [paymentAttemptEvents.tentativaId], references: [paymentAttempts.id] }),
	principal: one(accessPrincipals, { fields: [paymentAttemptEvents.principalId], references: [accessPrincipals.id] }),
	usuario: one(users, { fields: [paymentAttemptEvents.usuarioId], references: [users.id] }),
}));

export type TPaymentAttemptEntity = typeof paymentAttempts.$inferSelect;
export type TNewPaymentAttemptEntity = typeof paymentAttempts.$inferInsert;
export type TPaymentAttemptEventEntity = typeof paymentAttemptEvents.$inferSelect;
export type TNewPaymentAttemptEventEntity = typeof paymentAttemptEvents.$inferInsert;
