import { relations, sql } from "drizzle-orm";
import { doublePrecision, index, integer, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { cashbackProgramBalances, cashbackProgramTransactions } from "./cashback-programs";
import { newTable } from "./common";
import { organizations } from "./organizations";
import { sales } from "./sales";
import { fiscalClientTaxIndicatorEnum } from "./enums";
import { sellers } from "./sellers";
import { users } from "./users";
import { TClientTagMetadata } from "@/schemas/clients";

export const clients = newTable(
	"clients",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		idExterno: varchar("id_externo", { length: 255 }),
		nome: text("nome").notNull(),
		cpfCnpj: text("cpf_cnpj"),
		anotacoes: text("anotacoes"),
		inscricaoEstadual: text("inscricao_estadual"),
		indicadorInscricaoEstadual: fiscalClientTaxIndicatorEnum("indicador_inscricao_estadual").default("NAO_CONTRIBUINTE"),
		suframa: text("suframa"),
		// Communication
		telefone: text("telefone").notNull().default(""),
		telefoneBase: text("telefone_base").notNull().default(""),
		// Business-scoped user ID (BSUID) da Meta (0058): identidade garantida do contato no
		// WhatsApp — `from`/`wa_id` podem ser omitidos dos webhooks, o BSUID nunca. Escopo por
		// portfólio de negócios; regenera se o usuário trocar de número.
		whatsappUserId: varchar("whatsapp_user_id", { length: 255 }),
		email: text("email"),
		// Socials
		websiteUrl: text("website_url"),
		instagram: text("instagram"),
		linkedin: text("linkedin"),
		twitter: text("twitter"),
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
		metadataProdutoSugeridoId: varchar("metadata_produto_sugerido_id", { length: 255 }), // Cross-sell suggestion (computed by cron)
		metadataUltimaAtualizacao: timestamp("metadata_ultima_atualizacao"), // Last metadata update timestamp

		// Opt-out de comunicação (pedido do cliente): suprime campanhas e fila da carteira
		// até a data. Null = sem pausa. Gravada por ação manual explícita.
		comunicacaoPausadaAte: timestamp("comunicacao_pausada_ate"),

		// Consentimento EXPLÍCITO de marketing (LGPD): guarda QUANDO o cliente aceitou, não um
		// booleano — a data é a prova de auditoria. Null = nunca consentiu (nenhum cadastro
		// anterior ao aceite explícito é retroativamente convertido em consentimento). Uma
		// retirada de consentimento zera a coluna; opt-out temporário é `comunicacaoPausadaAte`.
		consentimentoMarketingData: timestamp("consentimento_marketing_data"),

		// Autoria do cadastro (imutável, gravada na criação). Null = criação de sistema
		// (webhooks, cron, loja digital, scripts) ou registro legado. Nas integrações,
		// autorVendedorId guarda o primeiro vendedor conhecido da venda que originou o cliente.
		autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		autorVendedorId: varchar("autor_vendedor_id", { length: 255 }).references(() => sellers.id, { onDelete: "set null" }),

		dataNascimento: timestamp("data_nascimento"),
		dataFundacao: timestamp("data_fundacao"),
		profissao: text("profissao"),
		ondeTrabalha: text("onde_trabalha"),
		estadoCivil: text("estado_civil"),
		deficiencia: text("deficiencia"),
		dataSincronizacaoExterna: timestamp("data_sincronizacao_externa"),
		dataInsercao: timestamp("data_insercao").defaultNow(),
	},
	(table) => ({
		// ...existing indices...
		// Trigram em GIN, não GiST (0137): a busca de clientes (lib/clients/search.ts) só usa LIKE e `%>`,
		// que o GIN responde em milissegundos; o GiST percorria boa parte do índice a cada busca.
		nomeIndex: index("idx_clients_nome_gin").using("gin", sql`unaccent_immutable(lower(${table.nome})) gin_trgm_ops`),
		documentoIndex: index("idx_clients_documento_gin").using(
			"gin",
			sql`regexp_replace(coalesce(${table.cpfCnpj}, ''), '[^0-9]', '', 'g') gin_trgm_ops`,
		),
		// Lookup do webhook quando `from`/`wa_id` vêm omitidos, e unicidade da identidade (0058).
		orgWhatsappUserIdUnique: uniqueIndex("idx_clients_org_whatsapp_user_id")
			.on(table.organizacaoId, table.whatsappUserId)
			.where(sql`${table.whatsappUserId} is not null`),
		telefoneIndex: index("idx_clients_telefone_gin").using("gin", sql`${table.telefoneBase} gin_trgm_ops`),
		emailIndex: index("idx_clients_email_gin").using("gin", sql`lower(${table.email}) gin_trgm_ops`),
		rfmTituloIdx: index("idx_clients_rfm_titulo").on(table.analiseRFMTitulo),
		orgPrimeiraCompraIdx: index("idx_clients_org_primeira_compra").on(table.organizacaoId, table.primeiraCompraData),
	}),
);

export const clientTags = newTable(
	"client_tags",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		titulo: varchar("titulo", { length: 50 }).notNull(),
		tituloNormalizado: varchar("titulo_normalizado", { length: 80 }).notNull(),
		icone: varchar("icone", { length: 64 }).notNull().default("Tag"),
		cor: varchar("cor", { length: 15 }).notNull(),
		corForeground: varchar("cor_foreground", { length: 15 }).notNull(),
		metadados: jsonb("metadados")
			.$type<TClientTagMetadata>()
			.notNull()
			.default(sql`'{"tipo":"MANUAL"}'::jsonb`),
		autorId: varchar("autor_id", { length: 255 })
			.references(() => users.id)
			.notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao", { mode: "date" }).$onUpdate(() => new Date()),
	},
	(table) => ({
		organizacaoTituloUnique: uniqueIndex("client_tags_organizacao_titulo_normalizado_unique").on(table.organizacaoId, table.tituloNormalizado),
		organizacaoTituloIdx: index("client_tags_organizacao_titulo_idx").on(table.organizacaoId, table.tituloNormalizado),
	}),
);
export const clientTagsRelations = relations(clientTags, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [clientTags.organizacaoId],
		references: [organizations.id],
	}),
	autor: one(users, {
		fields: [clientTags.autorId],
		references: [users.id],
	}),
	referenciasClientes: many(clientTagReferences),
}));
export const clientTagReferences = newTable(
	"client_tag_references",
	{
		id: varchar("id", { length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		clienteId: varchar("cliente_id", { length: 255 })
			.references(() => clients.id, { onDelete: "cascade" })
			.notNull(),
		clienteTagId: varchar("cliente_tag_id", { length: 255 })
			.references(() => clientTags.id, { onDelete: "cascade" })
			.notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		clienteTagUnique: uniqueIndex("client_tag_refs_cliente_tag_unique").on(table.clienteId, table.clienteTagId),
		organizacaoIdTagIdx: index("client_tag_refs_organizacao_id_tag_idx").on(table.organizacaoId, table.clienteTagId),
		clienteIdx: index("client_tag_refs_cliente_idx").on(table.clienteId),
	}),
);
export const clientTagReferencesRelations = relations(clientTagReferences, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [clientTagReferences.organizacaoId],
		references: [organizations.id],
	}),
	tag: one(clientTags, {
		fields: [clientTagReferences.clienteTagId],
		references: [clientTags.id],
	}),
	cliente: one(clients, {
		fields: [clientTagReferences.clienteId],
		references: [clients.id],
	}),
}));

export const clientLocations = newTable(
	"client_locations",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }),
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "cascade" }),
		titulo: text("titulo").notNull(),
		localizacaoCep: text("localizacao_cep"),
		localizacaoEstado: text("localizacao_estado"),
		localizacaoCidade: text("localizacao_cidade"),
		localizacaoBairro: text("localizacao_bairro"),
		localizacaoLogradouro: text("localizacao_logradouro"),
		localizacaoNumero: text("localizacao_numero"),
		localizacaoComplemento: text("localizacao_complemento"),
		localizacaoLatitude: text("localizacao_latitude"),
		localizacaoLongitude: text("localizacao_longitude"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		clienteIdIdx: index("idx_client_locations_cliente_id").on(table.clienteId),
		organizacaoIdIdx: index("idx_client_locations_organizacao_id").on(table.organizacaoId),
	}),
);

export const clientsRelations = relations(clients, ({ one, many }) => ({
	compras: many(sales),
	saldos: many(cashbackProgramBalances),
	transacoesCashback: many(cashbackProgramTransactions),
	localizacoes: many(clientLocations),
	tagReferencias: many(clientTagReferences),
	autor: one(users, {
		fields: [clients.autorId],
		references: [users.id],
	}),
	autorVendedor: one(sellers, {
		fields: [clients.autorVendedorId],
		references: [sellers.id],
	}),
}));
export type TClientEntity = typeof clients.$inferSelect;
export type TNewClientEntity = typeof clients.$inferInsert;
export type TClientTagEntity = typeof clientTags.$inferSelect;
export type TNewClientTagEntity = typeof clientTags.$inferInsert;
export type TClientTagReferenceEntity = typeof clientTagReferences.$inferSelect;
export type TNewClientTagReferenceEntity = typeof clientTagReferences.$inferInsert;

export const clientLocationsRelations = relations(clientLocations, ({ one }) => ({
	cliente: one(clients, {
		fields: [clientLocations.clienteId],
		references: [clients.id],
	}),
	organizacao: one(organizations, {
		fields: [clientLocations.organizacaoId],
		references: [organizations.id],
	}),
}));
export type TClientLocationEntity = typeof clientLocations.$inferSelect;
export type TNewClientLocationEntity = typeof clientLocations.$inferInsert;
