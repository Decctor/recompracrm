import { relations } from "drizzle-orm";
import { index, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { newTable } from "./common";
import { organizations } from "./organizations";
import { sales } from "./sales";

export const partners = newTable(
	"partners",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "set null" }),
		identificador: text("identificador").notNull(),
		codigoAfiliacao: text("codigo_afiliacao"),
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
	},
	(table) => ({
		identificadorOrgIdx: index("idx_partners_org_identificador").on(table.organizacaoId, table.identificador),
		codigoAfiliacaoOrgIdx: uniqueIndex("uniq_partners_org_codigo_afiliacao").on(table.organizacaoId, table.codigoAfiliacao),
		clienteIdIdx: index("idx_partners_cliente_id").on(table.clienteId),
	}),
);

export const partnersRelations = relations(partners, ({ many, one }) => ({
	cliente: one(clients, {
		fields: [partners.clienteId],
		references: [clients.id],
	}),
	sales: many(sales),
}));
