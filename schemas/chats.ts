import z from "zod";
import {
	ChatAssignmentPriorityEnum,
	ChatAssignmentResponsibleTypeEnum,
	ChatAssignmentStatusEnum,
	ChatMessageAuthorTypeEnum,
	ChatMessageContentTypeEnum,
	ChatMessageDeliveryStatusEnum,
} from "./enums";

export const ChatSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para o ID do cliente.",
	}),
	whatsappConexaoId: z
		.string({
			required_error: "ID da conexão do WhatsApp não informado.",
			invalid_type_error: "Tipo não válido para o ID da conexão do WhatsApp.",
		})
		.optional()
		.nullable(),
	whatsappConexaoTelefoneId: z
		.string({
			required_error: "ID do telefone da conexão do WhatsApp não informado.",
			invalid_type_error: "Tipo não válido para o ID do telefone da conexão do WhatsApp.",
		})
		.optional()
		.nullable(),
	whatsappTelefoneId: z.string({
		required_error: "ID do telefone do WhatsApp não informado.",
		invalid_type_error: "Tipo não válido para o ID do telefone do WhatsApp.",
	}),
	mensagensNaoLidas: z
		.number({
			required_error: "Número de mensagens não lidas não informado.",
			invalid_type_error: "Tipo não válido para o número de mensagens não lidas.",
		})
		.default(0),
	ultimaMensagemId: z
		.string({
			required_error: "ID da última mensagem não informado.",
			invalid_type_error: "Tipo não válido para o ID da última mensagem.",
		})
		.optional()
		.nullable(),
	ultimaMensagemData: z.date({
		required_error: "Data da última mensagem não informada.",
		invalid_type_error: "Tipo não válido para a data da última mensagem.",
	}),
	ultimaMensagemEntradaData: z
		.date({
			required_error: "Data da última mensagem recebida não informada.",
			invalid_type_error: "Tipo não válido para a data da última mensagem recebida.",
		})
		.optional()
		.nullable(),
	ultimaMensagemSaidaData: z
		.date({
			required_error: "Data da última mensagem enviada não informada.",
			invalid_type_error: "Tipo não válido para a data da última mensagem enviada.",
		})
		.optional()
		.nullable(),
	whatsappJanelaDataExpiracao: z
		.date({
			required_error: "Data de expiração da janela do WhatsApp não informada.",
			invalid_type_error: "Tipo não válido para a data de expiração da janela do WhatsApp.",
		})
		.optional()
		.nullable(),
	ultimaLeituraData: z
		.date({
			required_error: "Data da última leitura não informada.",
			invalid_type_error: "Tipo não válido para a data da última leitura.",
		})
		.optional()
		.nullable(),
	ultimaLeituraPorUsuarioId: z
		.string({
			required_error: "ID do usuário da última leitura não informado.",
			invalid_type_error: "Tipo não válido para o ID do usuário da última leitura.",
		})
		.optional()
		.nullable(),
});
export type TChat = z.infer<typeof ChatSchema>;

export const ChatAssignmentSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	chatId: z.string({
		required_error: "ID do chat não informado.",
		invalid_type_error: "Tipo não válido para o ID do chat.",
	}),
	responsavelTipo: ChatAssignmentResponsibleTypeEnum,
	responsavelUsuarioId: z
		.string({
			required_error: "ID do usuário responsável não informado.",
			invalid_type_error: "Tipo não válido para o ID do usuário responsável.",
		})
		.optional()
		.nullable(),
	responsavelAgenteId: z
		.string({
			required_error: "ID do agente responsável não informado.",
			invalid_type_error: "Tipo não válido para o ID do agente responsável.",
		})
		.optional()
		.nullable(),
	status: ChatAssignmentStatusEnum,
	atribuidoPorUsuarioId: z
		.string({
			required_error: "ID do usuário que atribuiu não informado.",
			invalid_type_error: "Tipo não válido para o ID do usuário que atribuiu.",
		})
		.optional()
		.nullable(),
	transferidoParaUsuarioId: z
		.string({
			required_error: "ID do usuário de destino da transferência não informado.",
			invalid_type_error: "Tipo não válido para o ID do usuário de destino da transferência.",
		})
		.optional()
		.nullable(),
	transferenciaMotivo: z
		.string({
			required_error: "Motivo da transferência não informado.",
			invalid_type_error: "Tipo não válido para o motivo da transferência.",
		})
		.optional()
		.nullable(),
	prioridade: ChatAssignmentPriorityEnum.optional().nullable(),
	categoria: z
		.string({
			required_error: "Categoria do atendimento não informada.",
			invalid_type_error: "Tipo não válido para a categoria do atendimento.",
		})
		.optional()
		.nullable(),
	resumo: z
		.string({
			required_error: "Resumo do atendimento não informado.",
			invalid_type_error: "Tipo não válido para o resumo do atendimento.",
		})
		.optional()
		.nullable(),
	resultado: z
		.string({
			required_error: "Resultado do atendimento não informado.",
			invalid_type_error: "Tipo não válido para o resultado do atendimento.",
		})
		.optional()
		.nullable(),
	dataAtribuicao: z.date({
		required_error: "Data de atribuição não informada.",
		invalid_type_error: "Tipo não válido para a data de atribuição.",
	}),
	dataLiberacao: z
		.date({
			required_error: "Data de liberação não informada.",
			invalid_type_error: "Tipo não válido para a data de liberação.",
		})
		.optional()
		.nullable(),
	dataUltimaEntradaCliente: z
		.date({
			required_error: "Data da última entrada do cliente não informada.",
			invalid_type_error: "Tipo não válido para a data da última entrada do cliente.",
		})
		.optional()
		.nullable(),
	dataPrimeiraResposta: z
		.date({
			required_error: "Data da primeira resposta não informada.",
			invalid_type_error: "Tipo não válido para a data da primeira resposta.",
		})
		.optional()
		.nullable(),
	dataUltimaResposta: z
		.date({
			required_error: "Data da última resposta não informada.",
			invalid_type_error: "Tipo não válido para a data da última resposta.",
		})
		.optional()
		.nullable(),
	dataResolucao: z
		.date({
			required_error: "Data de resolução não informada.",
			invalid_type_error: "Tipo não válido para a data de resolução.",
		})
		.optional()
		.nullable(),
	dataEncerramento: z
		.date({
			required_error: "Data de encerramento não informada.",
			invalid_type_error: "Tipo não válido para a data de encerramento.",
		})
		.optional()
		.nullable(),
	encerradoPorUsuarioId: z
		.string({
			required_error: "ID do usuário que encerrou não informado.",
			invalid_type_error: "Tipo não válido para o ID do usuário que encerrou.",
		})
		.optional()
		.nullable(),
});
export type TChatAssignment = z.infer<typeof ChatAssignmentSchema>;

/**
 * Referral de anúncio Meta (Click-to-WhatsApp): o anúncio que originou a conversa.
 * Shape espelhado do payload do webhook da Meta; todos os campos são opcionais porque
 * a Meta varia o que envia conforme o formato do anúncio.
 */
export const WhatsappReferralSchema = z.object({
	sourceUrl: z.string().optional().nullable(),
	sourceType: z.string().optional().nullable(),
	sourceId: z.string().optional().nullable(),
	headline: z.string().optional().nullable(),
	body: z.string().optional().nullable(),
	mediaType: z.string().optional().nullable(),
	imageUrl: z.string().optional().nullable(),
	videoUrl: z.string().optional().nullable(),
	thumbnailUrl: z.string().optional().nullable(),
	ctwaClid: z.string().optional().nullable(),
});
export type TWhatsappReferral = z.infer<typeof WhatsappReferralSchema>;

export const ChatMessageMetadataSchema = z.object({
	whatsappReferral: WhatsappReferralSchema.optional().nullable(),
	whatsappMidia: z
		.object({
			mediaId: z.string().optional(),
			downloadStatus: z.enum(["success", "failed", "skipped"]).optional(),
			uploadStatus: z.enum(["success", "failed", "skipped"]).optional(),
			processingStatus: z.enum(["processed", "stored_only", "failed"]).optional(),
			model: z.string().optional(),
			failureReason: z.string().optional(),
			storageBucket: z.string().optional(),
			storagePath: z.string().optional(),
			mimeType: z.string().optional(),
			fileName: z.string().optional(),
			fileSize: z.number().optional(),
			/** Só em figurinhas: webp animado, como informado pelo webhook da Meta. */
			animated: z.boolean().optional(),
		})
		.optional()
		.nullable(),
	/** Resposta a um botão de resposta rápida de template: texto e payload da Meta. */
	whatsappButton: z
		.object({
			text: z.string(),
			payload: z.string().optional().nullable(),
		})
		.optional()
		.nullable(),
	/**
	 * Reações do cliente à mensagem (histórico de ações; a última por emoji vence).
	 * Um "unreact" chega sem emoji. Guardado na mensagem-alvo, não em uma mensagem própria.
	 */
	whatsappReactions: z
		.array(
			z.object({
				action: z.enum(["react", "unreact"]),
				emoji: z.string().optional().nullable(),
				senderPhoneNumber: z.string().optional().nullable(),
				date: z.string().optional().nullable(),
			}),
		)
		.optional()
		.nullable(),
	/**
	 * Edições da mensagem feitas no WhatsApp (pelo cliente ou pelo app do celular). O texto
	 * vigente fica em `conteudoTexto`; aqui fica o que ele era antes de cada edição.
	 */
	whatsappEdits: z
		.array(
			z.object({
				previousText: z.string().optional().nullable(),
				date: z.string().optional().nullable(),
			}),
		)
		.optional()
		.nullable(),
	/** Mensagem que a Cloud API não sabe renderizar (enquete, gif…). Guarda o erro informado. */
	whatsappUnsupported: z
		.object({
			code: z.number().optional().nullable(),
			title: z.string().optional().nullable(),
			details: z.string().optional().nullable(),
		})
		.optional()
		.nullable(),
	/** Localização compartilhada pelo cliente; nome/endereço só em locais de negócio. */
	whatsappLocation: z
		.object({
			latitude: z.number(),
			longitude: z.number(),
			name: z.string().optional().nullable(),
			address: z.string().optional().nullable(),
			url: z.string().optional().nullable(),
		})
		.optional()
		.nullable(),
	/** Cartões de contato (vCard) compartilhados pelo cliente. */
	whatsappContacts: z
		.array(
			z.object({
				formattedName: z.string().optional().nullable(),
				phones: z.array(z.object({ phone: z.string(), waId: z.string().optional().nullable(), type: z.string().optional().nullable() })).optional(),
				emails: z.array(z.object({ email: z.string(), type: z.string().optional().nullable() })).optional(),
				org: z.string().optional().nullable(),
			}),
		)
		.optional()
		.nullable(),
	gatewayInterno: z
		.object({
			sessaoId: z.string().optional(),
			gatewayTimestamp: z.string().optional(),
			jobId: z.string().optional(),
			echo: z.boolean().optional(),
			queueFailure: z
				.object({
					error: z.string(),
					attemptsUsed: z.number().optional(),
					maxAttempts: z.number().optional(),
					errorClass: z.string().optional(),
					retriable: z.boolean().optional(),
				})
				.optional(),
		})
		.optional()
		.nullable(),
	// Vínculo denormalizado mensagem → execução do agente. O canônico é
	// `ai_agent_runs.mensagemEnviadaId`; este espelho evita join no hub.
	aiAgente: z
		.object({
			runId: z.string(),
			agenteId: z.string(),
			// Mensagem produzida por uma retomada programada (`ai_agent_follow_ups`).
			retomadaId: z.string().optional().nullable(),
		})
		.optional()
		.nullable(),
});
export type TChatMessageMetadata = z.infer<typeof ChatMessageMetadataSchema>;

export const ChatMessageSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	chatId: z.string({
		required_error: "ID do chat não informado.",
		invalid_type_error: "Tipo não válido para o ID do chat.",
	}),
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para o ID do cliente.",
	}),
	whatsappTemplateId: z
		.string({
			required_error: "ID do template do WhatsApp não informado.",
			invalid_type_error: "Tipo não válido para o ID do template do WhatsApp.",
		})
		.optional()
		.nullable(),
	autorTipo: ChatMessageAuthorTypeEnum,
	autorUsuarioId: z
		.string({
			required_error: "ID do usuário não informado.",
			invalid_type_error: "Tipo não válido para o ID do usuário.",
		})
		.optional()
		.nullable(),
	autorClienteId: z
		.string({
			required_error: "ID do cliente não informado.",
			invalid_type_error: "Tipo não válido para o ID do cliente.",
		})
		.optional()
		.nullable(),
	conteudoTexto: z
		.string({
			required_error: "Conteúdo da mensagem não informado.",
			invalid_type_error: "Tipo não válido para o conteúdo da mensagem.",
		})
		.optional()
		.nullable(),
	// Media content fields
	conteudoMidiaUrl: z
		.string({
			required_error: "URL do conteúdo da mensagem não informado.",
			invalid_type_error: "Tipo não válido para a URL do conteúdo da mensagem.",
		})
		.optional()
		.nullable(),
	conteudoMidiaTipo: ChatMessageContentTypeEnum,
	conteudoMidiaStorageId: z
		.string({
			required_error: "ID do conteúdo da mensagem não informado.",
			invalid_type_error: "Tipo não válido para o ID do conteúdo da mensagem.",
		})
		.optional()
		.nullable(),
	conteudoMidiaMimeType: z
		.string({
			required_error: "MIME type do conteúdo da mensagem não informado.",
			invalid_type_error: "Tipo não válido para o MIME type do conteúdo da mensagem.",
		})
		.optional()
		.nullable(),
	conteudoMidiaArquivoNome: z
		.string({
			required_error: "Nome do arquivo do conteúdo da mensagem não informado.",
			invalid_type_error: "Tipo não válido para o nome do arquivo do conteúdo da mensagem.",
		})
		.optional()
		.nullable(),
	conteudoMidiaArquivoTamanho: z
		.number({
			required_error: "Tamanho do arquivo do conteúdo da mensagem não informado.",
			invalid_type_error: "Tipo não válido para o tamanho do arquivo do conteúdo da mensagem.",
		})
		.optional()
		.nullable(),
	conteudoMidiaTextoProcessado: z
		.string({
			required_error: "Texto processado do conteúdo da mensagem não informado.",
			invalid_type_error: "Tipo não válido para o texto processado do conteúdo da mensagem.",
		})
		.optional()
		.nullable(),
	conteudoMidiaTextoProcessadoResumo: z
		.string({
			required_error: "Resumo do texto processado do conteúdo da mensagem não informado.",
			invalid_type_error: "Tipo não válido para o resumo do texto processado do conteúdo da mensagem.",
		})
		.optional()
		.nullable(),
	conteudoMidiaWhatsappId: z
		.string({
			required_error: "ID do conteúdo da mensagem no WhatsApp não informado.",
			invalid_type_error: "Tipo não válido para o ID do conteúdo da mensagem no WhatsApp.",
		})
		.optional()
		.nullable(),
	clienteMensagemId: z
		.string({
			required_error: "ID da mensagem gerado no cliente não informado.",
			invalid_type_error: "Tipo não válido para o ID da mensagem gerado no cliente.",
		})
		.optional()
		.nullable(),
	whatsappMessageId: z
		.string({
			required_error: "ID da mensagem no WhatsApp não informado.",
			invalid_type_error: "Tipo não válido para o ID da mensagem no WhatsApp.",
		})
		.optional()
		.nullable(),
	whatsappEcho: z
		.boolean({
			required_error: "Indicação de echo da mensagem não informada.",
			invalid_type_error: "Tipo não válido para a indicação de echo da mensagem.",
		})
		.default(false),
	metadados: ChatMessageMetadataSchema.optional().nullable(),
	statusEntrega: ChatMessageDeliveryStatusEnum,
	provedorStatusDataAtualizacao: z
		.date({
			required_error: "Data de atualização do status pelo provedor não informada.",
			invalid_type_error: "Tipo não válido para a data de atualização do status pelo provedor.",
		})
		.optional()
		.nullable(),
	dataEnvio: z.date({
		required_error: "Data de envio da mensagem não informada.",
		invalid_type_error: "Tipo não válido para a data de envio da mensagem.",
	}),
});
export type TChatMessage = z.infer<typeof ChatMessageSchema>;
