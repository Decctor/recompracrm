import { relations } from "drizzle-orm";
import { boolean, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { organizations } from "./organizations";

export const sellers = newTable("sellers", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
	ativo: boolean("ativo").notNull().default(true),
	nome: text("nome").notNull(),
	identificador: text("identificador").notNull(),
	telefone: text("telefone"),
	email: text("email"),
	avatarUrl: text("avatar_url"),
	senhaOperador: text("senha_operador").notNull().default("0000"),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});
export const sellerRelations = relations(sellers, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [sellers.organizacaoId],
		references: [organizations.id],
	}),
}));
