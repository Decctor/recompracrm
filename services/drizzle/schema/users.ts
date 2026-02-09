import type { TUserPermissions } from "@/schemas/users";
import { relations } from "drizzle-orm";
import { boolean, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { organizationMembers } from "./organizations";

export const users = newTable("users", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	admin: boolean("admin").notNull().default(false),
	nome: text("nome").notNull(),
	email: text("email").notNull(),
	telefone: text("telefone").notNull(),
	avatarUrl: text("avatar_url"),
	// Location
	localizacaoCep: text("localizacao_cep"),
	localizacaoEstado: text("localizacao_estado"),
	localizacaoCidade: text("localizacao_cidade"),
	localizacaoBairro: text("localizacao_bairro"),
	localizacaoLogradouro: text("localizacao_logradouro"),
	localizacaoNumero: text("localizacao_numero"),
	localizacaoComplemento: text("localizacao_complemento"),
	localizacaoLatitude: text("localizacao_latitude"),
	localizacaoLongitude: text("localizacao_longitude"),
	// Auth related
	usuario: text("usuario").notNull(),
	senha: text("senha").notNull(),
	googleId: text("google_id"),
	googleRefreshToken: text("google_refresh_token"),
	googleAccessToken: text("google_access_token"),
	// Others
	dataNascimento: timestamp("data_nascimento"),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});
export const usersRelations = relations(users, ({ one, many }) => ({
	associacoes: many(organizationMembers),
}));
export type TUserEntity = typeof users.$inferSelect;
export type TNewUserEntity = typeof users.$inferInsert;
