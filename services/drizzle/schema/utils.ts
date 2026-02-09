import type { TUtilsValue } from "@/schemas/utils";
import { jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { organizations } from "./organizations";

export const utils = newTable("utils", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
	identificador: text("identificador").notNull(),
	valor: jsonb("valor").$type<TUtilsValue>().notNull(),
	dataUltimaAtualizacao: timestamp("data_ultima_atualizacao").defaultNow().notNull(),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});
export type TUtilEntity = typeof utils.$inferSelect;
export type TNewUtilEntity = typeof utils.$inferInsert;
