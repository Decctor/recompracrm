import type { TAIHintContent } from "@/schemas/ai-hints";
import { relations } from "drizzle-orm";
import { doublePrecision, index, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable, organizations, users } from ".";

// ═══════════════════════════════════════════════════════════════
// AI HINTS TABLE
// ═══════════════════════════════════════════════════════════════

export const aiHints = newTable(
	"ai_hints",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),

		// Subject/Context where this hint applies
		assunto: varchar("assunto", { length: 50 }).notNull(), // "campaigns" | "clients" | "sales" | "sellers" | "dashboard"

		// The hint content - discriminated union stored as JSONB
		tipo: varchar("tipo", { length: 50 }).notNull(), // Denormalized for filtering: "campaign-suggestion", "rfm-action", etc.
		conteudo: jsonb("conteudo").$type<TAIHintContent>().notNull(),

		// AI metadata
		modeloUtilizado: varchar("modelo_utilizado", { length: 100 }),
		tokensUtilizados: doublePrecision("tokens_utilizados"),

		// Relevance score for sorting (0-1)
		relevancia: doublePrecision("relevancia").default(0.5),

		// Status
		status: varchar("status", { length: 20 }).notNull().default("active"), // "active" | "dismissed" | "expired"

		// Dismissal tracking (nullable - filled when dismissed)
		descartadaPor: varchar("descartada_por", { length: 255 }).references(() => users.id),
		dataDescarte: timestamp("data_descarte"),

		// Expiration (hints can become stale)
		dataExpiracao: timestamp("data_expiracao"),

		// Timestamps
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => [
		index("ai_hints_org_id_idx").on(table.organizacaoId),
		index("ai_hints_assunto_idx").on(table.assunto),
		index("ai_hints_status_idx").on(table.status),
		index("ai_hints_org_assunto_status_idx").on(table.organizacaoId, table.assunto, table.status),
	],
);

export const aiHintsRelations = relations(aiHints, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [aiHints.organizacaoId],
		references: [organizations.id],
	}),
	descartadaPorUsuario: one(users, {
		fields: [aiHints.descartadaPor],
		references: [users.id],
	}),
	feedbacks: many(aiHintFeedback),
}));

export type TAIHintEntity = typeof aiHints.$inferSelect;
export type TNewAIHintEntity = typeof aiHints.$inferInsert;

// ═══════════════════════════════════════════════════════════════
// AI HINT FEEDBACK TABLE (like/dislike tracking)
// ═══════════════════════════════════════════════════════════════

export const aiHintFeedback = newTable(
	"ai_hint_feedback",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		hintId: varchar("hint_id", { length: 255 })
			.references(() => aiHints.id, { onDelete: "cascade" })
			.notNull(),
		usuarioId: varchar("usuario_id", { length: 255 })
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),

		// Feedback type
		tipo: varchar("tipo", { length: 20 }).notNull(), // "like" | "dislike"

		// Optional feedback text
		comentario: text("comentario"),

		// Timestamps
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => [index("ai_hint_feedback_hint_id_idx").on(table.hintId), index("ai_hint_feedback_usuario_id_idx").on(table.usuarioId)],
);

export const aiHintFeedbackRelations = relations(aiHintFeedback, ({ one }) => ({
	hint: one(aiHints, {
		fields: [aiHintFeedback.hintId],
		references: [aiHints.id],
	}),
	usuario: one(users, {
		fields: [aiHintFeedback.usuarioId],
		references: [users.id],
	}),
}));

export type TAIHintFeedbackEntity = typeof aiHintFeedback.$inferSelect;
export type TNewAIHintFeedbackEntity = typeof aiHintFeedback.$inferInsert;
