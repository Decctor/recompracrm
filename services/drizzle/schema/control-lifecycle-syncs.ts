import { relations } from "drizzle-orm";
import { jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { organizations } from "./organizations";

/**
 * Estado da sincronização do ciclo de vida da organização com o Syncroniza Control.
 *
 * O Control é o motor das mensagens de ativação (docs/onboarding/revenue-centric-activation-analysis.md
 * §9): cada organização vira uma oportunidade lá, que avança nos quadros conforme os marcos daqui.
 * Esta linha lembra o que já foi enviado, para que cada sincronização mande só o que mudou — sem ela,
 * o cron reenviaria todos os marcos de todas as organizações a cada hora e estouraria o limite de
 * chamadas da chave. A verdade sobre a prontidão continua em `getOnboardingReadiness`; aqui fica só o
 * registro de entrega.
 */
export const controlLifecycleSyncs = newTable("control_lifecycle_syncs", {
	organizacaoId: varchar("organizacao_id", { length: 255 })
		.primaryKey()
		.references(() => organizations.id, { onDelete: "cascade" }),
	controlOportunidadeId: varchar("control_oportunidade_id", { length: 255 }),
	/** Chaves dos marcos já entregues ao Control (estágio, evento e interação). */
	marcosEnviados: jsonb("marcos_enviados").$type<string[]>().default([]).notNull(),
	/** Hash dos campos personalizados enviados por último, para só reenviar quando mudarem. */
	camposHash: varchar("campos_hash", { length: 64 }),
	dataUltimaSincronizacao: timestamp("data_ultima_sincronizacao"),
	ultimoErro: text("ultimo_erro"),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});

export const controlLifecycleSyncsRelations = relations(controlLifecycleSyncs, ({ one }) => ({
	organizacao: one(organizations, { fields: [controlLifecycleSyncs.organizacaoId], references: [organizations.id] }),
}));

export type TControlLifecycleSyncEntity = typeof controlLifecycleSyncs.$inferSelect;
