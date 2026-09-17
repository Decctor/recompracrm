import type { TInteractionMetadata } from "@/schemas/interactions";
import { relations } from "drizzle-orm";
import { index, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { campaigns } from "./campaigns";
import { clients } from "./clients";
import { newTable } from "./common";
import {
	interactionChannelEnum,
	interactionDirectionEnum,
	interactionInitiatorEnum,
	interactionLifecycleStatusEnum,
	interactionDeliveryStatusEnum,
	interactionTypeEnum,
} from "./enums";
import { organizations } from "./organizations";
import { sellers } from "./sellers";
import { users } from "./users";

export const interactions = newTable(
	"interactions",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		clienteId: varchar("cliente_id", { length: 255 })
			.references(() => clients.id, { onDelete: "cascade" })
			.notNull(),
		campanhaId: varchar("campanha_id", { length: 255 }).references(() => campaigns.id),
		titulo: text("titulo").notNull(),
		descricao: text("descricao"),
		tipo: interactionTypeEnum("tipo").notNull(),
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id),

		// Primitivo de relacionamento (docs/seller-routine-hub-design.md). Todas nullable:
		// linhas legadas são backfilladas; código novo classifica por canal/direção/iniciador
		// em vez de sobrecarregar `tipo` (que segue como legado da máquina de entrega).
		canal: interactionChannelEnum("canal"),
		direcao: interactionDirectionEnum("direcao"),
		iniciadoPor: interactionInitiatorEnum("iniciado_por"),
		vendedorId: varchar("vendedor_id", { length: 255 }).references(() => sellers.id),
		// Âncora canônica de cadência e ordenação de relacionamento: quando a interação
		// aconteceu (≠ dataInsercao = quando foi registrada; ≠ dataExecucao = claim de entrega).
		dataInteracao: timestamp("data_interacao"),
		// Ciclo de vida de interações manuais/planejadas. `statusEnvio` segue sendo só entrega.
		status: interactionLifecycleStatusEnum("status"),

		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		// Envios de campanha: momento do envio (âncora de quota e de atribuição). A fila que antes
		// vivia aqui (agendamento*, dataExecucao como claim) mora em campaign_dispatch_recipients;
		// uma interação de campanha só nasce quando a mensagem sai.
		dataExecucao: timestamp("data_execucao"),
		metadados: jsonb("metadados").$type<TInteractionMetadata>(),

		// Rastreio de entrega (ENVIADO -> ENTREGUE -> LIDO via webhooks; FALHOU quando o provedor
		// reporta falha após o envio). Bloqueios e falhas pré-provedor nunca chegam aqui.
		dataEnvio: timestamp("data_envio"),
		statusEnvio: interactionDeliveryStatusEnum("status_envio"),
		erroEnvio: text("erro_envio"),
	},
	(table) => ({
		// Backfill preguiçoso dos contadores de quota e atribuição de conversão (por cliente).
		orgQuotaIdx: index("idx_interactions_org_weekly_quota").on(table.organizacaoId, table.tipo, table.dataExecucao),
		campaignQuotaIdx: index("idx_interactions_campaign_weekly_quota").on(table.organizacaoId, table.campanhaId, table.tipo, table.dataExecucao),
		// Estatísticas de campanha: status por período.
		campaignStatsIdx: index("idx_interactions_org_campanha_status_data").on(
			table.organizacaoId,
			table.campanhaId,
			table.statusEnvio,
			table.dataInsercao,
		),
		// Frequência (cap por cliente/campanha).
		campaignClientIdx: index("idx_interactions_campanha_cliente_data").on(table.campanhaId, table.clienteId, table.dataInsercao),
		// Cadência/timeline: última interação por cliente.
		clientRelationshipIdx: index("idx_interactions_org_cliente_data_interacao").on(table.organizacaoId, table.clienteId, table.dataInteracao),
		// Carteira do vendedor: interações e follow-ups (PLANEJADA) do dia.
		sellerPortfolioIdx: index("idx_interactions_org_vendedor_status_data").on(table.organizacaoId, table.vendedorId, table.status, table.dataInteracao),
	}),
);
export const interactionRelations = relations(interactions, ({ one }) => ({
	cliente: one(clients, {
		fields: [interactions.clienteId],
		references: [clients.id],
	}),
	campanha: one(campaigns, {
		fields: [interactions.campanhaId],
		references: [campaigns.id],
	}),
	autor: one(users, {
		fields: [interactions.autorId],
		references: [users.id],
	}),
	vendedor: one(sellers, {
		fields: [interactions.vendedorId],
		references: [sellers.id],
	}),
}));
export type TInteractionEntity = typeof interactions.$inferSelect;
export type TNewInteractionEntity = typeof interactions.$inferInsert;
