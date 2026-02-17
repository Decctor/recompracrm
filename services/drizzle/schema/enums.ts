import { pgEnum } from "drizzle-orm/pg-core";

export const campaignTriggerTypeEnum = pgEnum("campaign_trigger_type", [
	"NOVA-COMPRA",
	"PRIMEIRA-COMPRA",
	"PERMANÊNCIA-SEGMENTAÇÃO",
	"ENTRADA-SEGMENTAÇÃO",
	"CASHBACK-ACUMULADO",
	"CASHBACK-EXPIRANDO",
	"ANIVERSARIO_CLIENTE",
	"QUANTIDADE-TOTAL-COMPRAS",
	"VALOR-TOTAL-COMPRAS",
	"RECORRENTE",
]);

export const recurrenceFrequencyEnum = pgEnum("recurrence_frequency", ["DIARIO", "SEMANAL", "MENSAL"]);

export const timeDurationUnitsEnum = pgEnum("time_duration_units", ["DIAS", "SEMANAS", "MESES", "ANOS"]);

export const interactionTypeEnum = pgEnum("interaction_type", ["ENVIO-MENSAGEM", "ENVIO-EMAIL", "LIGAÇÃO", "ATENDIMENTO"]);
export const interactionsCronJobTimeBlocksEnum = pgEnum("interactions_cron_time_blocks", [
	"00:00",
	"03:00",
	"06:00",
	"09:00",
	"12:00",
	"15:00",
	"18:00",
	"21:00",
]);

export const whatsappTemplateCategoryEnum = pgEnum("whatsapp_template_category", ["AUTENTICAÇÃO", "MARKETING", "UTILIDADE"]);
export const whatsappTemplateParametersTypeEnum = pgEnum("whatsapp_template_parameters_type", ["NOMEADO", "POSICIONAL"]);
export const whatsappTemplateStatusEnum = pgEnum("whatsapp_template_status", [
	"RASCUNHO",
	"PENDENTE",
	"APROVADO",
	"REJEITADO",
	"PAUSADO",
	"DESABILITADO",
]);
export const whatsappTemplateQualityEnum = pgEnum("whatsapp_template_quality", ["PENDENTE", "ALTA", "MEDIA", "BAIXA"]);

export const cashbackProgramAccumulationTypeEnum = pgEnum("cashback_program_accumulation_type", ["FIXO", "PERCENTUAL"]);

export const cashbackProgramRedemptionLimitTypeEnum = pgEnum("cashback_program_redemption_limit_type", ["FIXO", "PERCENTUAL"]);

export const cashbackProgramTransactionTypeEnum = pgEnum("cashback_program_transaction_type", ["ACÚMULO", "RESGATE", "EXPIRAÇÃO", "CANCELAMENTO"]);

export const cashbackProgramTransactionStatusEnum = pgEnum("cashback_program_transaction_status", ["ATIVO", "CONSUMIDO", "EXPIRADO"]);

export const organizationIntegrationTypeEnum = pgEnum("organization_integration_type", ["ONLINE-SOFTWARE", "CARDAPIO-WEB"]);

export const chatStatusEnum = pgEnum("chat_status", ["ABERTA", "FECHADA"]);

export const chatMessageContentTypeEnum = pgEnum("chat_message_content_type", ["TEXTO", "IMAGEM", "VIDEO", "AUDIO", "DOCUMENTO"]);

export const chatServiceStatusEnum = pgEnum("chat_service_status", ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDO"]);

export const chatServiceResponsibleTypeEnum = pgEnum("chat_service_responsible_type", ["USUÁRIO", "AI", "BUSINESS-APP", "CLIENTE"]);

export const chatMessageAuthorTypeEnum = pgEnum("chat_message_author_type", ["CLIENTE", "USUÁRIO", "AI", "BUSINESS-APP"]);

export const chatMessageStatusEnum = pgEnum("chat_message_status", ["CANCELADO", "ENVIADO", "RECEBIDO", "LIDO"]);

export const chatMessageWhatsappStatusEnum = pgEnum("chat_message_whatsapp_status", ["PENDENTE", "ENVIADO", "ENTREGUE", "FALHOU"]);

export const conversionTypeEnum = pgEnum("conversion_type", ["AQUISICAO", "REATIVACAO", "ACELERACAO", "REGULAR", "ATRASADA"]);

export const whatsappConnectionTypeEnum = pgEnum("whatsapp_connection_type", ["META_CLOUD_API", "INTERNAL_GATEWAY"]);

export const communityCourseAccessLevelEnum = pgEnum("community_course_access_level", ["PUBLICO", "AUTENTICADO", "ASSINATURA"]);

export const communityCourseStatusEnum = pgEnum("community_course_status", ["RASCUNHO", "PUBLICADO", "ARQUIVADO"]);

export const communityLessonContentTypeEnum = pgEnum("community_lesson_content_type", ["VIDEO", "TEXTO", "VIDEO_TEXTO"]);

export const communityMuxAssetStatusEnum = pgEnum("community_mux_asset_status", ["AGUARDANDO", "PROCESSANDO", "PRONTO", "ERRO"]);
