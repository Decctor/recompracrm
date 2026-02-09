import { relations } from "drizzle-orm";
import { boolean, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { newTable } from "./common";
import {
	chatMessageAuthorTypeEnum,
	chatMessageContentTypeEnum,
	chatMessageStatusEnum,
	chatMessageWhatsappStatusEnum,
	chatServiceResponsibleTypeEnum,
	chatServiceStatusEnum,
	chatStatusEnum,
} from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";
import { whatsappConnectionPhones, whatsappConnections } from "./whatsapp-connections";
import { whatsappTemplates } from "./whatsapp-templates";

export const chats = newTable("chats", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 })
		.references(() => organizations.id, { onDelete: "cascade" })
		.notNull(),
	clienteId: varchar("cliente_id", { length: 255 })
		.references(() => clients.id, { onDelete: "cascade" })
		.notNull(),
	whatsappConexaoId: varchar("whatsapp_conexao_id", { length: 255 }).references(() => whatsappConnections.id, {
		onDelete: "set null",
	}),
	whatsappConexaoTelefoneId: varchar("whatsapp_conexao_telefone_id", { length: 255 }).references(() => whatsappConnectionPhones.id, {
		onDelete: "set null",
	}),
	whatsappTelefoneId: varchar("whatsapp_telefone_id", { length: 255 }),
	mensagensNaoLidas: integer("mensagens_nao_lidas").notNull().default(0),
	ultimaMensagemId: varchar("ultima_mensagem_id", { length: 255 }),
	ultimaMensagemData: timestamp("ultima_mensagem_data").notNull(),
	ultimaMensagemConteudoTipo: chatMessageContentTypeEnum("ultima_mensagem_conteudo_tipo").notNull(),
	ultimaMensagemConteudoTexto: text("ultima_mensagem_conteudo_texto"),
	status: chatStatusEnum("status").notNull().default("ABERTA"),
	ultimaInteracaoClienteData: timestamp("ultima_interacao_cliente_data"),
	aiAgendamentoRespostaData: timestamp("ai_agendamento_resposta_data"),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});
export const chatsRelations = relations(chats, ({ one, many }) => ({
	cliente: one(clients, {
		fields: [chats.clienteId],
		references: [clients.id],
	}),
	whatsappConexao: one(whatsappConnections, {
		fields: [chats.whatsappConexaoId],
		references: [whatsappConnections.id],
	}),
	whatsappConexaoTelefone: one(whatsappConnectionPhones, {
		fields: [chats.whatsappConexaoTelefoneId],
		references: [whatsappConnectionPhones.id],
	}),
	ultimaMensagem: one(chatMessages, {
		fields: [chats.ultimaMensagemId],
		references: [chatMessages.id],
	}),
	mensagens: many(chatMessages),
	servicos: many(chatServices),
}));
export type TChatEntity = typeof chats.$inferSelect;
export type TNewChatEntity = typeof chats.$inferInsert;
export const chatServices = newTable("chat_services", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 })
		.references(() => organizations.id)
		.notNull(),
	chatId: varchar("chat_id", { length: 255 })
		.references(() => chats.id, { onDelete: "cascade" })
		.notNull(),
	clienteId: varchar("cliente_id", { length: 255 })
		.references(() => clients.id, { onDelete: "cascade" })
		.notNull(),
	responsavelTipo: chatServiceResponsibleTypeEnum("responsavel_tipo").notNull().default("USUÁRIO"), // User, AI, Business-App or Client
	responsavelUsuarioId: varchar("responsavel_usuario_id", { length: 255 }).references(() => users.id, {
		onDelete: "set null",
	}),
	descricao: text("descricao").notNull(),
	status: chatServiceStatusEnum("status").notNull().default("PENDENTE"),
	dataInicio: timestamp("data_inicio").defaultNow().notNull(),
	dataFim: timestamp("data_fim"),
});
export const chatServicesRelations = relations(chatServices, ({ one, many }) => ({
	chat: one(chats, {
		fields: [chatServices.chatId],
		references: [chats.id],
	}),
	cliente: one(clients, {
		fields: [chatServices.clienteId],
		references: [clients.id],
	}),
	mensagens: many(chatMessages),
	responsavelUsuario: one(users, {
		fields: [chatServices.responsavelUsuarioId],
		references: [users.id],
	}),
}));
export type TChatServiceEntity = typeof chatServices.$inferSelect;
export type TNewChatServiceEntity = typeof chatServices.$inferInsert;
export const chatMessages = newTable("chat_messages", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 })
		.references(() => organizations.id)
		.notNull(),
	chatId: varchar("chat_id", { length: 255 })
		.references(() => chats.id, { onDelete: "cascade" })
		.notNull(),
	whatsappTemplateId: varchar("whatsapp_template_id", { length: 255 }).references(() => whatsappTemplates.id, {
		onDelete: "set null",
	}),
	autorTipo: chatMessageAuthorTypeEnum("autor_tipo").notNull().default("USUÁRIO"), // User, AI, Business-App or Client
	autorUsuarioId: varchar("autor_usuario_id", { length: 255 }).references(() => users.id, {
		onDelete: "set null",
	}),
	autorClienteId: varchar("autor_cliente_id", { length: 255 }).references(() => clients.id, {
		onDelete: "set null",
	}),
	conteudoTexto: text("conteudo_texto").notNull(),
	// Media content fields
	conteudoMidiaUrl: text("conteudo_midia_url"),
	conteudoMidiaTipo: chatMessageContentTypeEnum("conteudo_midia_tipo").notNull(),
	conteudoMidiaStorageId: varchar("conteudo_midia_storage_id", { length: 255 }),
	conteudoMidiaMimeType: text("conteudo_midia_mime_type"),
	conteudoMidiaArquivoNome: text("conteudo_midia_arquivo_nome"),
	conteudoMidiaArquivoTamanho: integer("conteudo_midia_arquivo_tamanho"),
	conteudoMidiaTextoProcessado: text("conteudo_midia_texto_processado"),
	conteudoMidiaTextoProcessadoResumo: text("conteudo_midia_texto_processado_resumo"),
	conteudoMidiaWhatsappId: text("conteudo_midia_whatsapp_id"),
	status: chatMessageStatusEnum("status").notNull().default("ENVIADO"),
	whatsappMessageId: text("whatsapp_message_id"),
	whatsappMessageStatus: chatMessageWhatsappStatusEnum("whatsapp_message_status").notNull().default("PENDENTE"),
	servicoId: varchar("servico_id", { length: 255 }).references(() => chatServices.id, {
		onDelete: "set null",
	}),
	dataEnvio: timestamp("data_envio").defaultNow().notNull(),
	isEcho: boolean("is_echo").notNull().default(false), // True for messages sent from the WhatsApp Business phone app (Coexistence)
});
export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
	chat: one(chats, {
		fields: [chatMessages.chatId],
		references: [chats.id],
	}),
	autorUsuario: one(users, {
		fields: [chatMessages.autorUsuarioId],
		references: [users.id],
	}),
	autorCliente: one(clients, {
		fields: [chatMessages.autorClienteId],
		references: [clients.id],
	}),
	servico: one(chatServices, {
		fields: [chatMessages.servicoId],
		references: [chatServices.id],
	}),
}));
export type TChatMessageEntity = typeof chatMessages.$inferSelect;
export type TNewChatMessageEntity = typeof chatMessages.$inferInsert;
