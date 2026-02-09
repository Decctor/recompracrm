import { relations, sql } from "drizzle-orm";
import { doublePrecision, index, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { cashbackProgramBalances } from "./cashback-programs";
import { newTable } from "./common";
import { organizations } from "./organizations";
import { sales } from "./sales";

export const clients = newTable(
	"clients",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		idExterno: varchar("id_externo", { length: 255 }),
		nome: text("nome").notNull(),
		// cpfCnpj: text("cpf_cnpj"),
		// Communication
		telefone: text("telefone").notNull().default(""),
		telefoneBase: text("telefone_base").notNull().default(""),
		email: text("email"),
		// Location
		localizacaoCep: text("localizacao_cep"),
		localizacaoEstado: text("localizacao_estado"),
		localizacaoCidade: text("localizacao_cidade"),
		localizacaoBairro: text("localizacao_bairro"),
		localizacaoLogradouro: text("localizacao_logradouro"),
		localizacaoNumero: text("localizacao_numero"),
		localizacaoComplemento: text("localizacao_complemento"),
		// Others
		canalAquisicao: text("canal_aquisicao"),
		primeiraCompraData: timestamp("primeira_compra_data"),
		primeiraCompraId: varchar("primeira_compra_id"),
		ultimaCompraData: timestamp("ultima_compra_data"),
		ultimaCompraId: varchar("ultima_compra_id"),
		// RFM
		analiseRFMTitulo: text("analise_rfm_titulo"),
		analiseRFMNotasRecencia: text("analise_rfm_notas_recencia"),
		analiseRFMNotasFrequencia: text("analise_rfm_notas_frequencia"),
		analiseRFMNotasMonetario: text("analise_rfm_notas_monetario"),
		analiseRFMUltimaAtualizacao: timestamp("analise_rfm_ultima_atualizacao"),
		analiseRFMUltimaAlteracao: timestamp("analise_rfm_ultima_alteracao"),

		// Client Metadata (computed by cron, used for campaign triggers)
		metadataTotalCompras: integer("metadata_total_compras").default(0), // All-time purchase count
		metadataValorTotalCompras: doublePrecision("metadata_valor_total_compras").default(0), // All-time total purchase value
		metadataProdutoMaisCompradoId: varchar("metadata_produto_mais_comprado_id", { length: 255 }), // Most purchased product ID
		metadataGrupoProdutoMaisComprado: text("metadata_grupo_produto_mais_comprado"), // Most purchased product group
		metadataUltimaAtualizacao: timestamp("metadata_ultima_atualizacao"), // Last metadata update timestamp

		dataNascimento: timestamp("data_nascimento"),
		dataInsercao: timestamp("data_insercao").defaultNow(),
	},
	(table) => ({
		// ...existing indices...
		nomeIndex: index("idx_clients_nome").using("gist", sql`unaccent_immutable(lower(${table.nome})) gist_trgm_ops`),
		telefoneIndex: index("idx_clients_telefone").using("gist", sql`${table.telefoneBase} gist_trgm_ops`),
		emailIndex: index("idx_clients_email").using("gist", sql`lower(${table.email}) gist_trgm_ops`),
		rfmTituloIdx: index("idx_clients_rfm_titulo").on(table.analiseRFMTitulo),
	}),
);
export const clientsRelations = relations(clients, ({ one, many }) => ({
	compras: many(sales),
	saldos: many(cashbackProgramBalances),
}));
export type TClientEntity = typeof clients.$inferSelect;
export type TNewClientEntity = typeof clients.$inferInsert;
