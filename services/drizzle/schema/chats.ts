import type { TChatMessageMetadata } from "@/schemas/chats";
import type { TChatAssignmentPriority, TChatAssignmentResponsibleType, TChatAssignmentStatus, TChatOriginEnum } from "@/schemas/enums";
import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { newTable } from "./common";
import {
	chatMessageAuthorTypeEnum,
	chatMessageContentTypeEnum,
	chatMessageDeliveryStatusEnum,
	chatMessageStatusEnum,
	chatMessageWhatsappStatusEnum,
	chatServiceResponsibleTypeEnum,
	chatServiceStatusEnum,
	chatStatusEnum,
} from "./enums";
import { messageTemplates } from "./message-templates";
import { organizations } from "./organizations";
import { users } from "./users";
import { whatsappConnectionPhones, whatsappConnections } from "./whatsapp-connections";

export const chats = newTable(
	"chats",
	{
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
		// PLAYGROUND = chat sintético de teste do agente de IA: não tem conexão WhatsApp, nunca
		// envia nada para fora e é filtrado do hub de atendimentos.
		origem: varchar("origem", { length: 16 }).$type<TChatOriginEnum>().notNull().default("WHATSAPP"),
		mensagensNaoLidas: integer("mensagens_nao_lidas").notNull().default(0),
		ultimaMensagemId: varchar("ultima_mensagem_id", { length: 255 }),
		ultimaMensagemData: timestamp("ultima_mensagem_data").notNull(),
		// Última mensagem recebida do cliente e última enviada para ele. Juntas definem
		// se o chat tem pendência (entrada mais recente que a saída).
		ultimaMensagemEntradaData: timestamp("ultima_mensagem_entrada_data"),
		ultimaMensagemSaidaData: timestamp("ultima_mensagem_saida_data"),
		// Janela de 24h do WhatsApp; null = sem janela ativa. Conexões INTERNAL_GATEWAY nunca têm janela.
		whatsappJanelaDataExpiracao: timestamp("whatsapp_janela_data_expiracao"),
		ultimaLeituraData: timestamp("ultima_leitura_data"),
		ultimaLeituraPorUsuarioId: varchar("ultima_leitura_por_usuario_id", { length: 255 }).references(() => users.id, {
			onDelete: "set null",
		}),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),

		/** @deprecated removido na migration 0053 — a janela de 24h substitui o status do chat. */
		status: chatStatusEnum("status").default("ABERTA"),
		/** @deprecated removido na migration 0053 — preview resolvido via join com ultimaMensagemId. */
		ultimaMensagemConteudoTipo: chatMessageContentTypeEnum("ultima_mensagem_conteudo_tipo"),
		/** @deprecated removido na migration 0053 — preview resolvido via join com ultimaMensagemId. */
		ultimaMensagemConteudoTexto: text("ultima_mensagem_conteudo_texto"),
		/** @deprecated removido na migration 0053 — substituída por ultimaMensagemEntradaData. */
		ultimaInteracaoClienteData: timestamp("ultima_interacao_cliente_data"),
		/** @deprecated removido na migration 0053 — o debounce da IA não vive mais em coluna. */
		aiAgendamentoRespostaData: timestamp("ai_agendamento_resposta_data"),
	},
	(table) => [
		index("idx_chats_organizacao_ultima_mensagem").on(table.organizacaoId, table.ultimaMensagemData.desc()),
		index("idx_chats_conexao_telefone_ultima_mensagem").on(table.whatsappConexaoTelefoneId, table.ultimaMensagemData.desc()),
		// Chave natural do chat. Parcial porque whatsappTelefoneId é nullable e NULL nunca conflita
		// no Postgres — deixar explícito evita a falsa impressão de que chats sem número estão protegidos.
		uniqueIndex("idx_chats_chave_natural")
			.on(table.organizacaoId, table.clienteId, table.whatsappTelefoneId)
			.where(sql`${table.whatsappTelefoneId} is not null`),
	],
);
export const chatsRelations = relations(chats, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [chats.organizacaoId],
		references: [organizations.id],
	}),
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
		relationName: "chat_ultima_mensagem",
	}),
	ultimaLeituraPorUsuario: one(users, {
		fields: [chats.ultimaLeituraPorUsuarioId],
		references: [users.id],
		relationName: "chat_ultima_leitura_por_usuario",
	}),
	mensagens: many(chatMessages, { relationName: "chat_mensagens" }),
	atribuicoes: many(chatAssignments),
	/** @deprecated removido na Fase 3 junto com a tabela. */
	servicos: many(chatServices),
}));
export type TChatEntity = typeof chats.$inferSelect;
export type TNewChatEntity = typeof chats.$inferInsert;

/**
 * Ticket de atendimento de um chat: quem é o responsável, em que estado o atendimento
 * está e as métricas de resposta/resolução.
 *
 * O índice único parcial `idx_chat_assignments_one_current_per_chat` garante **um único
 * atendimento ativo por chat** (status ∉ ENCERRADO/CANCELADO). É essa garantia que torna
 * seguros o `onConflictDoNothing()` dos webhooks concorrentes e os compare-and-set de
 * `assumeChatAttendanceForUser`/`claimChatAttendanceForAgent` em `lib/chats/attendance-state.ts`.
 *
 * Desvio consciente da convenção de pgEnum do CLAUDE.md: status, tipo de responsável e
 * prioridade são varchar + `$type<...>` + validação Zod. `ALTER TYPE` em migrations manuais
 * é doloroso e o formato foi provado no módulo equivalente do Control.
 */
export const chatAssignments = newTable(
	"chat_assignments",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		chatId: varchar("chat_id", { length: 255 })
			.references(() => chats.id, { onDelete: "cascade" })
			.notNull(),
		responsavelTipo: varchar("responsavel_tipo", { length: 32 }).$type<TChatAssignmentResponsibleType>().notNull().default("NAO_ATRIBUIDO"),
		responsavelUsuarioId: varchar("responsavel_usuario_id", { length: 255 }).references(() => users.id, {
			onDelete: "set null",
		}),
		// Id do agente em `ampmais_ai_agents`. Sem FK de propósito: a FK inversa criaria ciclo de
		// import entre os módulos de schema (`ai-agents.ts` já importa este arquivo).
		responsavelAgenteId: varchar("responsavel_agente_id", { length: 255 }),
		status: varchar("status", { length: 32 }).$type<TChatAssignmentStatus>().notNull().default("ABERTO"),
		atribuidoPorUsuarioId: varchar("atribuido_por_usuario_id", { length: 255 }).references(() => users.id, {
			onDelete: "set null",
		}),
		transferidoParaUsuarioId: varchar("transferido_para_usuario_id", { length: 255 }).references(() => users.id, {
			onDelete: "set null",
		}),
		transferenciaMotivo: text("transferencia_motivo"),
		prioridade: varchar("prioridade", { length: 16 }).$type<TChatAssignmentPriority>(),
		categoria: varchar("categoria", { length: 64 }),
		resumo: text("resumo"),
		resultado: text("resultado"),
		dataAtribuicao: timestamp("data_atribuicao").defaultNow().notNull(),
		dataLiberacao: timestamp("data_liberacao"),
		dataUltimaEntradaCliente: timestamp("data_ultima_entrada_cliente"),
		dataPrimeiraResposta: timestamp("data_primeira_resposta"),
		dataUltimaResposta: timestamp("data_ultima_resposta"),
		dataResolucao: timestamp("data_resolucao"),
		dataEncerramento: timestamp("data_encerramento"),
		encerradoPorUsuarioId: varchar("encerrado_por_usuario_id", { length: 255 }).references(() => users.id, {
			onDelete: "set null",
		}),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => [
		index("idx_chat_assignments_chat_status").on(table.chatId, table.status),
		index("idx_chat_assignments_organizacao_usuario").on(table.organizacaoId, table.responsavelUsuarioId),
		// Estatísticas e quadro (0055): varredura por organização + janela de datas. A abertura
		// é `dataInsercao` — `dataAtribuicao` é reescrita a cada assumir/atribuir/transferir.
		index("idx_chat_assignments_org_data_insercao").on(table.organizacaoId, table.dataInsercao.desc()),
		index("idx_chat_assignments_org_data_encerramento")
			.on(table.organizacaoId, table.dataEncerramento.desc())
			.where(sql`${table.dataEncerramento} is not null`),
		index("idx_chat_assignments_org_status").on(table.organizacaoId, table.status),
		uniqueIndex("idx_chat_assignments_one_current_per_chat")
			.on(table.chatId)
			.where(sql`${table.status} not in ('ENCERRADO', 'CANCELADO')`),
	],
);
export const chatAssignmentsRelations = relations(chatAssignments, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [chatAssignments.organizacaoId],
		references: [organizations.id],
	}),
	chat: one(chats, {
		fields: [chatAssignments.chatId],
		references: [chats.id],
	}),
	responsavelUsuario: one(users, {
		fields: [chatAssignments.responsavelUsuarioId],
		references: [users.id],
		relationName: "chat_assignment_responsavel_usuario",
	}),
	atribuidoPorUsuario: one(users, {
		fields: [chatAssignments.atribuidoPorUsuarioId],
		references: [users.id],
		relationName: "chat_assignment_atribuido_por_usuario",
	}),
	transferidoParaUsuario: one(users, {
		fields: [chatAssignments.transferidoParaUsuarioId],
		references: [users.id],
		relationName: "chat_assignment_transferido_para_usuario",
	}),
	encerradoPorUsuario: one(users, {
		fields: [chatAssignments.encerradoPorUsuarioId],
		references: [users.id],
		relationName: "chat_assignment_encerrado_por_usuario",
	}),
}));
export type TChatAssignmentEntity = typeof chatAssignments.$inferSelect;
export type TNewChatAssignmentEntity = typeof chatAssignments.$inferInsert;

/**
 * @deprecated Substituída por `chatAssignments`. A tabela é dropada na migration 0053.
 * Mantida no schema apenas para os backfills e para o código legado compilar até a Fase 3.
 */
export const chatServices = newTable(
	"chat_services",
	{
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
		responsavelTipo: chatServiceResponsibleTypeEnum("responsavel_tipo").notNull().default("USUÁRIO"),
		responsavelUsuarioId: varchar("responsavel_usuario_id", { length: 255 }).references(() => users.id, {
			onDelete: "set null",
		}),
		descricao: text("descricao").notNull(),
		status: chatServiceStatusEnum("status").notNull().default("PENDENTE"),
		dataInicio: timestamp("data_inicio").defaultNow().notNull(),
		dataFim: timestamp("data_fim"),
	},
	(table) => [index("idx_chat_services_organizacao_id").on(table.organizacaoId)],
);
export const chatServicesRelations = relations(chatServices, ({ one }) => ({
	chat: one(chats, {
		fields: [chatServices.chatId],
		references: [chats.id],
	}),
	cliente: one(clients, {
		fields: [chatServices.clienteId],
		references: [clients.id],
	}),
	responsavelUsuario: one(users, {
		fields: [chatServices.responsavelUsuarioId],
		references: [users.id],
	}),
}));
export type TChatServiceEntity = typeof chatServices.$inferSelect;
export type TNewChatServiceEntity = typeof chatServices.$inferInsert;

export const chatMessages = newTable(
	"chat_messages",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id)
			.notNull(),
		chatId: varchar("chat_id", { length: 255 })
			.references(() => chats.id, { onDelete: "cascade" })
			.notNull(),
		// Denormalizado a partir do chat: simplifica dedupe e consultas por cliente.
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, {
			onDelete: "cascade",
		}),
		whatsappTemplateId: varchar("whatsapp_template_id", { length: 255 }).references(() => messageTemplates.id, {
			onDelete: "set null",
		}),
		autorTipo: chatMessageAuthorTypeEnum("autor_tipo").notNull().default("USUÁRIO"),
		autorUsuarioId: varchar("autor_usuario_id", { length: 255 }).references(() => users.id, {
			onDelete: "set null",
		}),
		autorClienteId: varchar("autor_cliente_id", { length: 255 }).references(() => clients.id, {
			onDelete: "set null",
		}),
		conteudoTexto: text("conteudo_texto"),
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
		// Id gerado no cliente: chave de reconciliação do envio otimista do hub.
		clienteMensagemId: text("cliente_mensagem_id"),
		whatsappMessageId: text("whatsapp_message_id"),
		// True quando a mensagem saiu do app WhatsApp Business no celular (Coexistence).
		whatsappEcho: boolean("whatsapp_echo").notNull().default(false),
		metadados: jsonb("metadados").$type<TChatMessageMetadata>(),
		statusEntrega: chatMessageDeliveryStatusEnum("status_entrega").notNull().default("PENDENTE"),
		provedorStatusDataAtualizacao: timestamp("provedor_status_data_atualizacao"),
		dataEnvio: timestamp("data_envio").defaultNow().notNull(),

		/** @deprecated removido na migration 0053 — substituído por statusEntrega. */
		status: chatMessageStatusEnum("status").default("ENVIADO"),
		/** @deprecated removido na migration 0053 — substituído por statusEntrega. */
		whatsappMessageStatus: chatMessageWhatsappStatusEnum("whatsapp_message_status").default("PENDENTE"),
		/** @deprecated removido na migration 0053 — substituído por whatsappEcho. */
		isEcho: boolean("is_echo").default(false),
		/** @deprecated removido na migration 0053 — o vínculo agora é com o chat, não com o serviço. */
		servicoId: varchar("servico_id", { length: 255 }).references(() => chatServices.id, {
			onDelete: "set null",
		}),
	},
	(table) => [
		index("idx_chat_messages_chat_timeline").on(table.chatId, table.dataEnvio.desc(), table.id.desc()),
		// Idempotência de webhook (0057): reentregas da Meta conflitam em vez de duplicar a
		// mensagem. wamid na frente para servir também os lookups por wamid puro dos status.
		uniqueIndex("idx_chat_messages_whatsapp_message_id_org")
			.on(table.whatsappMessageId, table.organizacaoId)
			.where(sql`${table.whatsappMessageId} is not null`),
		index("idx_chat_messages_cliente_mensagem_id").on(table.clienteMensagemId),
		index("idx_chat_messages_organizacao_data_envio").on(table.organizacaoId, table.dataEnvio.desc()),
	],
);
export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
	chat: one(chats, {
		fields: [chatMessages.chatId],
		references: [chats.id],
		relationName: "chat_mensagens",
	}),
	cliente: one(clients, {
		fields: [chatMessages.clienteId],
		references: [clients.id],
		relationName: "chat_message_cliente",
	}),
	autorUsuario: one(users, {
		fields: [chatMessages.autorUsuarioId],
		references: [users.id],
	}),
	autorCliente: one(clients, {
		fields: [chatMessages.autorClienteId],
		references: [clients.id],
		relationName: "chat_message_autor_cliente",
	}),
	whatsappTemplate: one(messageTemplates, {
		fields: [chatMessages.whatsappTemplateId],
		references: [messageTemplates.id],
	}),
	/** @deprecated removido na Fase 3 junto com a coluna. */
	servico: one(chatServices, {
		fields: [chatMessages.servicoId],
		references: [chatServices.id],
	}),
}));
export type TChatMessageEntity = typeof chatMessages.$inferSelect;
export type TNewChatMessageEntity = typeof chatMessages.$inferInsert;
