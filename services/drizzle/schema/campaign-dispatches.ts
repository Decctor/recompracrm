import type { TInteractionContextMetadados } from "@/lib/message-templates";
import { relations } from "drizzle-orm";
import { index, integer, jsonb, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { campaigns } from "./campaigns";
import { clients } from "./clients";
import { newTable } from "./common";
import {
	campaignDispatchOriginEnum,
	campaignDispatchRecipientStatusEnum,
	campaignDispatchSkipReasonEnum,
	campaignDispatchStatusEnum,
	sendCounterWindowEnum,
} from "./enums";
import { interactions } from "./interactions";
import { organizations } from "./organizations";
import { sales } from "./sales";

/**
 * Pipeline de campanhas (docs/dev-planning/campaigns-interactions-redesign-plan.md, Parte 2).
 *
 * O pipeline (o que enviar, para quem, sob qual orçamento) vive aqui. `interactions` é só o
 * registro do que realmente aconteceu — uma linha por mensagem enviada, criada no envio.
 */

// Uma "rodada" de campanha. A chave única (campanha, janela) É o claim: o relógio faz
// INSERT ... ON CONFLICT DO NOTHING e quem inseriu publica o trabalho. Substitui o antigo
// `UPDATE campaigns SET ativo = false` antes da audiência, que deixava campanhas desligadas em
// runs interrompidos.
export const campaignDispatches = newTable(
	"campaign_dispatches",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		campanhaId: varchar("campanha_id", { length: 255 })
			.references(() => campaigns.id, { onDelete: "cascade" })
			.notNull(),
		origem: campaignDispatchOriginEnum("origem").notNull(),
		// AGENDADA/RECORRENTE: 'YYYY-MM-DD@HH:00' (timezone do cron). EVENTO: id da venda ou outra
		// chave natural do gatilho ('aniversario:2026-09-17', 'entrada:<cliente>:<segmento>:...').
		janelaReferencia: text("janela_referencia").notNull(),
		status: campaignDispatchStatusEnum("status").notNull().default("PENDENTE"),
		// Quando o disparo deve começar. NULL = imediato. Preenchido pelos gatilhos de evento com
		// atraso configurado (execucaoAgendada*); o relógio publica quando chega a hora.
		dataAgendada: timestamp("data_agendada"),
		totalDestinatarios: integer("total_destinatarios").notNull().default(0),
		totalEnviados: integer("total_enviados").notNull().default(0),
		totalFalhados: integer("total_falhados").notNull().default(0),
		totalPulados: integer("total_pulados").notNull().default(0),
		erro: text("erro"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").defaultNow().notNull(),
		dataConclusao: timestamp("data_conclusao"),
	},
	(table) => [
		unique("uq_campaign_dispatches_campanha_janela").on(table.campanhaId, table.janelaReferencia),
		index("idx_campaign_dispatches_org_status").on(table.organizacaoId, table.status, table.dataInsercao),
		// Relógio: disparos pendentes cuja hora chegou, e varredura de disparos parados.
		index("idx_campaign_dispatches_status_agendada").on(table.status, table.dataAgendada),
	],
);
export const campaignDispatchRelations = relations(campaignDispatches, ({ one, many }) => ({
	campanha: one(campaigns, { fields: [campaignDispatches.campanhaId], references: [campaigns.id] }),
	destinatarios: many(campaignDispatchRecipients),
}));
export type TCampaignDispatchEntity = typeof campaignDispatches.$inferSelect;
export type TNewCampaignDispatchEntity = typeof campaignDispatches.$inferInsert;

// O outbox: uma linha por cliente por disparo. Responde "por que o cliente X não recebeu a
// campanha Y?" com uma linha (PULADA/QUOTA_ORG_DIARIO, PULADA/SEM_CONTATO...), sem poluir a
// timeline do cliente — nenhuma interação é criada para quem não recebeu.
export const campaignDispatchRecipients = newTable(
	"campaign_dispatch_recipients",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		dispatchId: varchar("dispatch_id", { length: 255 })
			.references(() => campaignDispatches.id, { onDelete: "cascade" })
			.notNull(),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		campanhaId: varchar("campanha_id", { length: 255 })
			.references(() => campaigns.id, { onDelete: "cascade" })
			.notNull(),
		clienteId: varchar("cliente_id", { length: 255 })
			.references(() => clients.id, { onDelete: "cascade" })
			.notNull(),
		status: campaignDispatchRecipientStatusEnum("status").notNull().default("AGUARDANDO"),
		motivoPulo: campaignDispatchSkipReasonEnum("motivo_pulo"),
		tentativas: integer("tentativas").notNull().default(0),
		erro: text("erro"),
		// Preenchido quando o envio acontece — a interação é o registro, o destinatário é a fila.
		interacaoId: varchar("interacao_id", { length: 255 }).references(() => interactions.id, { onDelete: "set null" }),
		// Venda que disparou o gatilho (cashback PERCENTUAL e atribuição precisam dela no envio).
		vendaId: varchar("venda_id", { length: 255 }).references(() => sales.id, { onDelete: "set null" }),
		// Chave passada ao provedor (clientMessageId no gateway interno): torna o reenvio após uma
		// queda entre o envio e o registro seguro onde o provedor deduplica.
		chaveIdempotencia: varchar("chave_idempotencia", { length: 255 }).notNull(),
		// Contexto congelado no enfileiramento (valor da compra, saldo no momento do gatilho,
		// produto sugerido da promoção). O bônus da campanha NÃO entra aqui: é concedido no envio.
		contexto: jsonb("contexto").$type<TInteractionContextMetadados>(),
		// Descrição do motivo do envio, copiada para a interação registrada ("Cliente realizou sua
		// primeira compra.", "Feliz aniversário, Ana!").
		descricao: text("descricao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataReserva: timestamp("data_reserva"),
		dataEnvio: timestamp("data_envio"),
	},
	(table) => [
		unique("uq_campaign_dispatch_recipients_dispatch_cliente").on(table.dispatchId, table.clienteId),
		// Claim em lote: FOR UPDATE SKIP LOCKED sobre os AGUARDANDO do disparo, em ordem de inserção.
		index("idx_campaign_dispatch_recipients_dispatch_status").on(table.dispatchId, table.status, table.dataInsercao),
		// Frequência (cap por cliente/campanha) e histórico do cliente.
		index("idx_campaign_dispatch_recipients_org_campanha_cliente").on(table.organizacaoId, table.campanhaId, table.clienteId, table.dataInsercao),
		// Saúde do dia (dashboard) e varredura de reservas paradas.
		index("idx_campaign_dispatch_recipients_org_status_data").on(table.organizacaoId, table.status, table.dataInsercao),
	],
);
export const campaignDispatchRecipientRelations = relations(campaignDispatchRecipients, ({ one }) => ({
	dispatch: one(campaignDispatches, { fields: [campaignDispatchRecipients.dispatchId], references: [campaignDispatches.id] }),
	campanha: one(campaigns, { fields: [campaignDispatchRecipients.campanhaId], references: [campaigns.id] }),
	cliente: one(clients, { fields: [campaignDispatchRecipients.clienteId], references: [clients.id] }),
	interacao: one(interactions, { fields: [campaignDispatchRecipients.interacaoId], references: [interactions.id] }),
}));
export type TCampaignDispatchRecipientEntity = typeof campaignDispatchRecipients.$inferSelect;
export type TNewCampaignDispatchRecipientEntity = typeof campaignDispatchRecipients.$inferInsert;

// Ledger O(1) de quota de envios, agnóstico de janela (reshape de weekly_send_counters).
// campanha_id NULL = contador agregado da organização. `tipo` + `periodo_chave` identificam a
// janela: DIARIO 'YYYY-MM-DD', SEMANAL 'YYYY-Www' (timezone do cron de interações).
// A reserva incrementa `usados` atomicamente; falhas terminais decrementam nas chaves da reserva.
export const sendCounters = newTable(
	"send_counters",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		campanhaId: varchar("campanha_id", { length: 255 }).references(() => campaigns.id, { onDelete: "cascade" }),
		tipo: sendCounterWindowEnum("tipo").notNull(),
		periodoChave: varchar("periodo_chave", { length: 10 }).notNull(),
		usados: integer("usados").notNull().default(0),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	// No banco esta constraint é UNIQUE NULLS NOT DISTINCT (PG15+): garante um único contador de
	// organização (campanha_id NULL) por janela, viabilizando o upsert idempotente via ON CONFLICT
	// de lib/interactions/send-counters.ts. O `.nullsNotDistinct()` está OMITIDO aqui de propósito:
	// a introspecção do drizzle-kit (0.31.x) hardcoda nullsNotDistinct=false ao ler UNIQUEs do
	// banco, então declará-lo gera drift permanente e todo `db:push` aborta tentando recriar a
	// constraint (42P07). DDL verdadeira: drizzle/0109_campaign_dispatch_pipeline.sql — banco novo
	// criado só por push precisa dela aplicada à mão, senão o contador agregado duplica.
	(table) => [unique("uq_send_counters_org_campanha_tipo_periodo").on(table.organizacaoId, table.campanhaId, table.tipo, table.periodoChave)],
);
export type TSendCounterEntity = typeof sendCounters.$inferSelect;
export type TNewSendCounterEntity = typeof sendCounters.$inferInsert;
