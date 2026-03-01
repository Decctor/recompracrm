import { z } from "zod";

export const SaleNatureEnum = z.enum(["SN08", "SN03", "SN11", "SN20", "SN04", "SN09", "SN02", "COND", "SN99", "SN01", "SN05"]);

export const CampaignTriggerTypeEnum = z.enum([
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
export type TCampaignTriggerTypeEnum = z.infer<typeof CampaignTriggerTypeEnum>;
export const RecurrenceFrequencyEnum = z.enum(["DIARIO", "SEMANAL", "MENSAL"]);
export type TRecurrenceFrequencyEnum = z.infer<typeof RecurrenceFrequencyEnum>;
export const TimeDurationUnitsEnum = z.enum(["DIAS", "SEMANAS", "MESES", "ANOS"]);
export type TTimeDurationUnitsEnum = z.infer<typeof TimeDurationUnitsEnum>;
export const InteractionTypeEnum = z.enum(["ENVIO-MENSAGEM", "ENVIO-EMAIL", "LIGAÇÃO", "ATENDIMENTO"]);
export type TInteractionTypeEnum = z.infer<typeof InteractionTypeEnum>;
export const InteractionsCronJobTimeBlocksEnum = z.enum(["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"]);
export type TInteractionsCronJobTimeBlocksEnum = z.infer<typeof InteractionsCronJobTimeBlocksEnum>;
export const WhatsappTemplateCategoryEnum = z.enum(["AUTENTICAÇÃO", "MARKETING", "UTILIDADE"]);
export type TWhatsappTemplateCategoryEnum = z.infer<typeof WhatsappTemplateCategoryEnum>;
export const WhatsappTemplateParametersTypeEnum = z.enum(["NOMEADO", "POSICIONAL"]);
export type TWhatsappTemplateParametersTypeEnum = z.infer<typeof WhatsappTemplateParametersTypeEnum>;
export const WhatsappTemplateStatusEnum = z.enum(["RASCUNHO", "PENDENTE", "APROVADO", "REJEITADO", "PAUSADO", "DESABILITADO"]);
export type TWhatsappTemplateStatusEnum = z.infer<typeof WhatsappTemplateStatusEnum>;
export const WhatsappTemplateQualityEnum = z.enum(["PENDENTE", "ALTA", "MEDIA", "BAIXA"]);
export type TWhatsappTemplateQualityEnum = z.infer<typeof WhatsappTemplateQualityEnum>;
export const CashbackProgramAccumulationTypeEnum = z.enum(["FIXO", "PERCENTUAL"]);
export type TCashbackProgramAccumulationTypeEnum = z.infer<typeof CashbackProgramAccumulationTypeEnum>;
export const CashbackProgramRedemptionLimitTypeEnum = z.enum(["FIXO", "PERCENTUAL"]);
export type TCashbackProgramRedemptionLimitTypeEnum = z.infer<typeof CashbackProgramRedemptionLimitTypeEnum>;
export const CashbackProgramTransactionTypeEnum = z.enum(["ACÚMULO", "RESGATE", "EXPIRAÇÃO"]);
export type TCashbackProgramTransactionTypeEnum = z.infer<typeof CashbackProgramTransactionTypeEnum>;
export const CashbackProgramTransactionStatusEnum = z.enum(["ATIVO", "CONSUMIDO", "EXPIRADO"]);
export type TCashbackProgramTransactionStatusEnum = z.infer<typeof CashbackProgramTransactionStatusEnum>;
export const OrganizationIntegrationTypeEnum = z.enum(["ONLINE-SOFTWARE", "CARDAPIO-WEB"]);
export type TOrganizationIntegrationTypeEnum = z.infer<typeof OrganizationIntegrationTypeEnum>;
export const ChatStatusEnum = z.enum(["ABERTA", "FECHADA"]);
export type TChatStatusEnum = z.infer<typeof ChatStatusEnum>;
export const ChatMessageContentTypeEnum = z.enum(["TEXTO", "IMAGEM", "VIDEO", "AUDIO", "DOCUMENTO"]);
export type TChatMessageContentTypeEnum = z.infer<typeof ChatMessageContentTypeEnum>;
export const ChatServiceStatusEnum = z.enum(["PENDENTE", "EM_ANDAMENTO", "CONCLUIDO"]);
export type TChatServiceStatusEnum = z.infer<typeof ChatServiceStatusEnum>;
export const ChatServiceResponsibleTypeEnum = z.enum(["USUÁRIO", "AI", "BUSINESS-APP", "CLIENTE"]);
export type TChatServiceResponsibleTypeEnum = z.infer<typeof ChatServiceResponsibleTypeEnum>;
export const ChatMessageAuthorTypeEnum = z.enum(["CLIENTE", "USUÁRIO", "AI", "BUSINESS-APP"]);
export type TChatMessageAuthorTypeEnum = z.infer<typeof ChatMessageAuthorTypeEnum>;
export const ChatMessageStatusEnum = z.enum(["CANCELADO", "ENVIADO", "RECEBIDO", "LIDO"]);
export type TChatMessageStatusEnum = z.infer<typeof ChatMessageStatusEnum>;
export const ChatMessageWhatsappStatusEnum = z.enum(["PENDENTE", "ENVIADO", "ENTREGUE", "LIDO", "FALHOU"]);
export type TChatMessageWhatsappStatusEnum = z.infer<typeof ChatMessageWhatsappStatusEnum>;
export const AttributionModelEnum = z.enum(["LAST_TOUCH", "FIRST_TOUCH", "LINEAR"]);
export type TAttributionModelEnum = z.infer<typeof AttributionModelEnum>;
export const ConversionTypeEnum = z.enum(["AQUISICAO", "REATIVACAO", "ACELERACAO", "REGULAR", "ATRASADA"]);
export type TConversionTypeEnum = z.infer<typeof ConversionTypeEnum>;
export const InternalLeadStatusCRMEnum = z.enum(["NOVO", "CONTATO_INICIAL", "QUALIFICADO", "PROPOSTA", "NEGOCIACAO", "GANHO", "PERDIDO"]);
export type TInternalLeadStatusCRMEnum = z.infer<typeof InternalLeadStatusCRMEnum>;
export const InternalLeadOriginEnum = z.enum(["INDICACAO", "SITE", "COLD_CALL", "COLD_EMAIL", "LINKEDIN", "EVENTO", "INBOUND", "OUTRO"]);
export type TInternalLeadOriginEnum = z.infer<typeof InternalLeadOriginEnum>;
export const InternalLeadActivityTypeEnum = z.enum(["LIGACAO", "EMAIL", "REUNIAO", "TAREFA", "WHATSAPP"]);
export type TInternalLeadActivityTypeEnum = z.infer<typeof InternalLeadActivityTypeEnum>;
export const InternalLeadActivityStatusEnum = z.enum(["PENDENTE", "CONCLUIDA", "CANCELADA"]);
export type TInternalLeadActivityStatusEnum = z.infer<typeof InternalLeadActivityStatusEnum>;
export const CommunityCourseAccessLevelEnum = z.enum(["PUBLICO", "AUTENTICADO", "ASSINATURA"]);
export type TCommunityCourseAccessLevelEnum = z.infer<typeof CommunityCourseAccessLevelEnum>;
export const CommunityCourseStatusEnum = z.enum(["RASCUNHO", "PUBLICADO", "ARQUIVADO"]);
export type TCommunityCourseStatusEnum = z.infer<typeof CommunityCourseStatusEnum>;
export const CommunityLessonContentTypeEnum = z.enum(["VIDEO", "TEXTO", "VIDEO_TEXTO"]);
export type TCommunityLessonContentTypeEnum = z.infer<typeof CommunityLessonContentTypeEnum>;
export const CommunityMuxAssetStatusEnum = z.enum(["AGUARDANDO", "PROCESSANDO", "PRONTO", "ERRO"]);
export type TCommunityMuxAssetStatusEnum = z.infer<typeof CommunityMuxAssetStatusEnum>;

export const CommunityAssetTypeEnum = z.enum(["VIDEO", "IMAGE", "DOCUMENT", "AUDIO", "TEXT"]);
export type TCommunityAssetTypeEnum = z.infer<typeof CommunityAssetTypeEnum>;
export const CommunityAssetPipelineStatusEnum = z.enum([
	"PENDENTE",
	"EXTRAINDO",
	"EM_REVISAO",
	"AGUARDANDO_AJUSTE",
	"ANALISANDO",
	"DERIVANDO",
	"CONCLUIDO",
	"REJEITADO",
	"ERRO",
]);
export type TCommunityAssetPipelineStatusEnum = z.infer<typeof CommunityAssetPipelineStatusEnum>;
export const CommunityAssetReviewVerdictEnum = z.enum(["APROVADO", "NECESSITA_AJUSTE", "REJEITADO"]);
export type TCommunityAssetReviewVerdictEnum = z.infer<typeof CommunityAssetReviewVerdictEnum>;
export const CommunityAssetDerivationStatusEnum = z.enum(["SUGERIDO", "APROVADO", "GERANDO", "GERADO", "DESCARTADO"]);
export type TCommunityAssetDerivationStatusEnum = z.infer<typeof CommunityAssetDerivationStatusEnum>;
export const CommunityAssetDerivationTypeEnum = z.enum([
	"POST_INSTAGRAM",
	"POST_TWITTER",
	"POST_LINKEDIN",
	"VIDEO_CURTO",
	"ARTIGO_BLOG",
	"EBOOK",
	"PLAYBOOK",
	"NEWSLETTER",
	"CARROSSEL",
	"THUMBNAIL",
	"TRANSCRICAO",
]);
export type TCommunityAssetDerivationTypeEnum = z.infer<typeof CommunityAssetDerivationTypeEnum>;
export const CommunityMaterialTypeEnum = z.enum(["EBOOK", "PLAYBOOK", "PLANILHA", "TEMPLATE", "GUIA", "CHECKLIST", "INFOGRAFICO", "DOCUMENTO"]);
export type TCommunityMaterialTypeEnum = z.infer<typeof CommunityMaterialTypeEnum>;
export const CommunityTutorialNivelEnum = z.enum(["INICIANTE", "INTERMEDIARIO", "AVANCADO"]);
export type TCommunityTutorialNivelEnum = z.infer<typeof CommunityTutorialNivelEnum>;
export const CommunityContentStatusEnum = z.enum(["RASCUNHO", "PUBLICADO", "ARQUIVADO"]);
export type TCommunityContentStatusEnum = z.infer<typeof CommunityContentStatusEnum>;

// ============================================================================
// FINANCIAL / ERP
// ============================================================================

export const FinancialAccountTypeEnum = z.enum(["CAIXA", "BANCO", "CARTEIRA_DIGITAL"]);
export type TFinancialAccountTypeEnum = z.infer<typeof FinancialAccountTypeEnum>;
export const BankAccountTypeEnum = z.enum(["CORRENTE", "POUPANCA"]);
export type TBankAccountTypeEnum = z.infer<typeof BankAccountTypeEnum>;
export const FinancialTransactionTypeEnum = z.enum(["ENTRADA", "SAIDA"]);
export type TFinancialTransactionTypeEnum = z.infer<typeof FinancialTransactionTypeEnum>;
export const AccountingEntryOriginTypeEnum = z.enum(["VENDA", "MANUAL", "ESTORNO"]);
export type TAccountingEntryOriginTypeEnum = z.infer<typeof AccountingEntryOriginTypeEnum>;
export const FiscalDocumentTypeEnum = z.enum(["NFCE", "NFE", "NFSE"]);
export type TFiscalDocumentTypeEnum = z.infer<typeof FiscalDocumentTypeEnum>;
export const FiscalDocumentStatusEnum = z.enum(["PENDENTE", "AUTORIZADA", "CANCELADA", "INUTILIZADA"]);
export type TFiscalDocumentStatusEnum = z.infer<typeof FiscalDocumentStatusEnum>;
export const StockMovementTypeEnum = z.enum(["ENTRADA", "SAIDA", "AJUSTE", "DEVOLUCAO"]);
export type TStockMovementTypeEnum = z.infer<typeof StockMovementTypeEnum>;
export const SaleProcessingSourceEnum = z.enum(["EXTERNO", "INTERNO"]);
export type TSaleProcessingSourceEnum = z.infer<typeof SaleProcessingSourceEnum>;
export const SaleStatusEnum = z.enum(["ORCAMENTO", "CONDICIONAL", "CONFIRMADA", "FATURADA", "CANCELADA"]);
export type TSaleStatusEnum = z.infer<typeof SaleStatusEnum>;
export const DefaultDataSourceEnum = z.enum(["RECEPTOR", "ERP"]);
export type TDefaultDataSourceEnum = z.infer<typeof DefaultDataSourceEnum>;

export const PaymentMethodEnum = z.enum([
	"DINHEIRO",
	"PIX",
	"CARTAO_CREDITO",
	"CARTAO_DEBITO",
	"BOLETO",
	"TRANSFERENCIA",
	"CASHBACK",
	"VALE",
	"OUTRO",
]);
export type TPaymentMethodEnum = z.infer<typeof PaymentMethodEnum>;

export const DeliveryModeEnum = z.enum(["PRESENCIAL", "RETIRADA", "ENTREGA", "COMANDA"]);
export type TDeliveryModeEnum = z.infer<typeof DeliveryModeEnum>;

export const FiscalProviderEnum = z.enum(["MANUAL", "NUVEM_FISCAL"]);
export type TFiscalProviderEnum = z.infer<typeof FiscalProviderEnum>;

export const PaymentProviderEnum = z.enum(["LOCAL", "MERCADO_PAGO", "STRIPE_CONNECT", "PAGARME"]);
export type TPaymentProviderEnum = z.infer<typeof PaymentProviderEnum>;
