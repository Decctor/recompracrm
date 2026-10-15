import { relations } from "drizzle-orm";
import { boolean, index, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { organizations } from "./organizations";
import { tabs } from "./tabs";

// ============================================================================
// SERVICE CARDS (Comandas fixas — cartao fisico reutilizavel)
// Ancora duravel como o ponto, mas carregada pelo cliente: hospeda no maximo uma
// tab aberta por vez e o seu QR mostra o consumo da conta em andamento.
// "Em uso" e derivado da tab aberta — nunca persistido. Ver docs/tabs/service-cards.md.
// ============================================================================

export const serviceCards = newTable(
	"service_cards",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		codigo: text("codigo").notNull(), // como impresso: "007", "A12"
		// Chave de comparacao (normalizeServiceCardCode): "7", "07" e "007" sao o mesmo cartao.
		codigoNormalizado: text("codigo_normalizado").notNull(),
		// Mesmo modelo do QR do ponto: bruto legivel para reexportar o arquivo da grafica;
		// a busca publica e pelo hash. Rotacionar = regenerar (invalida o cartao impresso).
		tokenPublico: varchar("token_publico", { length: 64 }).notNull(),
		tokenPublicoHash: varchar("token_publico_hash", { length: 64 }).notNull(),
		ativo: boolean("ativo").default(true).notNull(),
		metadados: jsonb("metadados"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		orgCodigoIdx: uniqueIndex("idx_service_cards_org_codigo").on(table.organizacaoId, table.codigoNormalizado),
		tokenPublicoHashIdx: uniqueIndex("idx_service_cards_token_publico_hash").on(table.tokenPublicoHash),
		orgAtivoIdx: index("idx_service_cards_org_ativo").on(table.organizacaoId, table.ativo),
	}),
);

export const serviceCardsRelations = relations(serviceCards, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [serviceCards.organizacaoId],
		references: [organizations.id],
	}),
	tabs: many(tabs),
}));

export type TServiceCardEntity = typeof serviceCards.$inferSelect;
export type TNewServiceCardEntity = typeof serviceCards.$inferInsert;
