import type { TInteractionsStatusEnum } from "@/schemas/interactions";
import { relations } from "drizzle-orm";
import { jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { campaigns } from "./campaigns";
import { clients } from "./clients";
import { newTable } from "./common";
import { interactionTypeEnum, interactionsCronJobTimeBlocksEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

export const interactions = newTable("interactions", {
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

	// Scheduling specific
	agendamentoDataReferencia: text("agendamento_data_referencia"), // ISO 8601 format YYYY-MM-DDTHH:MM:SSZ
	agendamentoBlocoReferencia: interactionsCronJobTimeBlocksEnum("agendamento_bloco_referencia"),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	dataExecucao: timestamp("data_execucao"),
	metadados: jsonb("metadados"),

	// Delivery status tracking
	dataEnvio: timestamp("data_envio"), // When message was actually sent
	statusEnvio: text("status_envio").$type<TInteractionsStatusEnum>(), // PENDING, SENT, DELIVERED, READ, FAILED
	erroEnvio: text("erro_envio"), // Error message if status is FALHOU
});
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
}));
export type TInteractionEntity = typeof interactions.$inferSelect;
export type TNewInteractionEntity = typeof interactions.$inferInsert;
