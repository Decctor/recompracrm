import { bigserial, boolean, index, integer, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { organizations } from "./organizations";
import { clients } from "./clients";
import { campaignEventStatusEnum } from "./enums";

export const campaignEvents = newTable(
	"campaign_events",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		fonteTipo: text("fonte_tipo").notNull(),
		fonteId: varchar("fonte_id", { length: 255 }).notNull(),
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "cascade" }),
		publicacaoPermitida: boolean("publicacao_permitida").notNull().default(true),
		sequencia: bigserial("sequencia", { mode: "number" }).notNull(),
		tipo: text("tipo").notNull(),
		versao: integer("versao").notNull(),
		chaveIdempotencia: text("chave_idempotencia").notNull(),
		status: campaignEventStatusEnum("status").notNull().default("PENDENTE"),
		contexto: jsonb("contexto").$type<Record<string, unknown>>().notNull(),
		dataEvento: timestamp("data_evento").notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataProcessamento: timestamp("data_processamento"),
		proximaTentativa: timestamp("proxima_tentativa").defaultNow().notNull(),
		tentativas: integer("tentativas").notNull().default(0),
		erro: text("erro"),
	},
	(table) => [
		uniqueIndex("idx_campaign_events_key").on(table.organizacaoId, table.tipo, table.chaveIdempotencia),
		index("idx_campaign_events_pending").on(table.status, table.proximaTentativa),
		index("idx_campaign_events_source").on(table.organizacaoId, table.fonteTipo, table.fonteId),
		index("idx_campaign_events_client").on(table.clienteId),
		index("idx_campaign_events_order").on(table.organizacaoId, table.clienteId, table.status, table.sequencia),
	],
);

export type TCampaignEventEntity = typeof campaignEvents.$inferSelect;
