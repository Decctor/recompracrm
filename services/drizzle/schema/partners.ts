import { relations } from "drizzle-orm";
import { text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { organizations } from "./organizations";
import { sales } from "./sales";

export const partners = newTable("partners", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
	identificador: text("identificador").notNull(),
	nome: text("nome").notNull(),
	avatarUrl: text("avatar_url"),
	cpfCnpj: text("cpf_cnpj"),
	telefone: text("telefone"),
	telefoneBase: text("telefone_base"),
	email: text("email"),
	// Location
	localizacaoCep: text("localizacao_cep"),
	localizacaoEstado: text("localizacao_estado"),
	localizacaoCidade: text("localizacao_cidade"),
	localizacaoBairro: text("localizacao_bairro"),
	localizacaoLogradouro: text("localizacao_logradouro"),
	localizacaoNumero: text("localizacao_numero"),
	localizacaoComplemento: text("localizacao_complemento"),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});

export const partnersRelations = relations(partners, ({ many }) => ({
	sales: many(sales),
}));
