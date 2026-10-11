import { relations } from "drizzle-orm";
import { boolean, doublePrecision, index, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { servicePointTypeEnum } from "./enums";
import { organizations } from "./organizations";
import { tabs } from "./tabs";

// ============================================================================
// SERVICE POINTS (Pontos de Atendimento — mesa, balcao, quiosque...)
// Ancora operacional duravel do atendimento. Um QR impresso na mesa aponta para
// o ponto, que sobrevive a abertura e fechamento de contas (tabs).
// ============================================================================

export const servicePoints = newTable(
	"service_points",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		rotulo: text("rotulo").notNull(), // "Mesa 12", "Quarto 3", "Box 2"
		grupo: text("grupo"), // texto livre opcional: "Salao", "Varanda", "Terreo"
		tipo: servicePointTypeEnum("tipo").notNull().default("MESA"),
		capacidade: doublePrecision("capacidade"), // lugares/ocupacao (opcional)
		// Token do QR duravel do ponto. Fica legivel (diferente do QR da tab) para o
		// painel reexibir/reimprimir o QR a qualquer momento: ele ja esta impresso na
		// mesa e so abre cardapio + solicitacao aprovada pelo operador, nunca consumo.
		// A busca publica continua pelo hash (sha256 hex). Rotacionar = regenerar.
		tokenPublico: varchar("token_publico", { length: 64 }).notNull(),
		tokenPublicoHash: varchar("token_publico_hash", { length: 64 }).notNull(),
		ativo: boolean("ativo").default(true).notNull(),
		metadados: jsonb("metadados"), // extensoes; nao guarda regras centrais de atendimento
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoAtivoIdx: index("idx_service_points_org_ativo").on(table.organizacaoId, table.ativo),
		tokenPublicoHashIdx: uniqueIndex("idx_service_points_token_publico_hash").on(table.tokenPublicoHash),
	}),
);

export const servicePointsRelations = relations(servicePoints, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [servicePoints.organizacaoId],
		references: [organizations.id],
	}),
	tabs: many(tabs),
}));

export type TServicePointEntity = typeof servicePoints.$inferSelect;
export type TNewServicePointEntity = typeof servicePoints.$inferInsert;
