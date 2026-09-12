import { z } from "zod";

export const SaleNatureEnum = z.enum([
  "SN08",
  "SN03",
  "SN11",
  "SN20",
  "SN04",
  "SN09",
  "SN02",
  "COND",
  "SN99",
  "SN01",
  "SN05",
]);

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
  "PIOR-DIA-VENDAS",
  "USO-UNICO",
]);
export type TCampaignTriggerTypeEnum = z.infer<typeof CampaignTriggerTypeEnum>;
export const CampaignExecutionDelayDirectionEnum = z.enum(["ANTES", "DEPOIS"]);
export type TCampaignExecutionDelayDirectionEnum = z.infer<
  typeof CampaignExecutionDelayDirectionEnum
>;
export const RecurrenceFrequencyEnum = z.enum(["DIARIO", "SEMANAL", "MENSAL"]);
export type TRecurrenceFrequencyEnum = z.infer<typeof RecurrenceFrequencyEnum>;
export const TimeDurationUnitsEnum = z.enum([
  "MINUTOS",
  "HORAS",
  "DIAS",
  "SEMANAS",
  "MESES",
  "ANOS",
]);
export type TTimeDurationUnitsEnum = z.infer<typeof TimeDurationUnitsEnum>;
export const InteractionTypeEnum = z.enum([
  "ENVIO-MENSAGEM",
  "ENVIO-EMAIL",
  "LIGAÇÃO",
  "ATENDIMENTO",
]);
export type TInteractionTypeEnum = z.infer<typeof InteractionTypeEnum>;
export const InteractionChannelEnum = z.enum([
  "WHATSAPP",
  "EMAIL",
  "LIGACAO",
  "PRESENCIAL",
  "VISITA",
  "SMS",
  "OUTRO",
]);
export type TInteractionChannelEnum = z.infer<typeof InteractionChannelEnum>;
export const InteractionDirectionEnum = z.enum(["SAIDA", "ENTRADA"]);
export type TInteractionDirectionEnum = z.infer<
  typeof InteractionDirectionEnum
>;
export const InteractionInitiatorEnum = z.enum([
  "AUTOMACAO",
  "USUARIO",
  "AGENTE_IA",
  "CLIENTE",
]);
export type TInteractionInitiatorEnum = z.infer<
  typeof InteractionInitiatorEnum
>;
export const InteractionLifecycleStatusEnum = z.enum([
  "PLANEJADA",
  "REALIZADA",
  "CANCELADA",
]);
export type TInteractionLifecycleStatusEnum = z.infer<
  typeof InteractionLifecycleStatusEnum
>;
export const InteractionsCronJobTimeBlocksEnum = z.enum([
  "00:00",
  "01:00",
  "02:00",
  "03:00",
  "04:00",
  "05:00",
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
  "23:00",
]);
export type TInteractionsCronJobTimeBlocksEnum = z.infer<
  typeof InteractionsCronJobTimeBlocksEnum
>;
// Status e qualidade que a Meta reporta para cada telefone em que o template foi submetido.
// Vivem em `message_templates.metadados.porNumeroTelefone`, não em coluna própria.
export const MessageTemplatePhoneStatusEnum = z.enum(
  ["RASCUNHO", "PENDENTE", "APROVADO", "REJEITADO", "PAUSADO", "DESABILITADO"],
  {
    required_error: "Status do template não informado.",
    invalid_type_error: "Tipo não válido para o status do template.",
  },
);
export type TMessageTemplatePhoneStatusEnum = z.infer<
  typeof MessageTemplatePhoneStatusEnum
>;
export const MessageTemplatePhoneQualityEnum = z.enum(
  ["PENDENTE", "ALTA", "MEDIA", "BAIXA"],
  {
    required_error: "Qualidade do template não informada.",
    invalid_type_error: "Tipo não válido para a qualidade do template.",
  },
);
export type TMessageTemplatePhoneQualityEnum = z.infer<
  typeof MessageTemplatePhoneQualityEnum
>;
export const CashbackProgramAccumulationTypeEnum = z.enum([
  "FIXO",
  "PERCENTUAL",
]);
export type TCashbackProgramAccumulationTypeEnum = z.infer<
  typeof CashbackProgramAccumulationTypeEnum
>;
export const CashbackProgramTerminologyEnum = z.enum(["DINHEIRO", "PONTOS"]);
export type TCashbackProgramTerminologyEnum = z.infer<
  typeof CashbackProgramTerminologyEnum
>;
export const CashbackProgramRedemptionLimitTypeEnum = z.enum([
  "FIXO",
  "PERCENTUAL",
]);
export type TCashbackProgramRedemptionLimitTypeEnum = z.infer<
  typeof CashbackProgramRedemptionLimitTypeEnum
>;

// Superfície onde um benefício (cashback, recompensa, cupom) é PEDIDO — não o canal da venda
// (`sales.canal`, POS|SHOP|COMANDA|IFOOD). Os dois conjuntos não coincidem: o ponto de
// interação resgata sem ser canal de venda, e iFood/comanda são canais sem resgate. Um
// orçamento da loja confirmado no PDV continua LOJA_DIGITAL para os benefícios que herdou.
// Fechar comanda é operação do atendente e conta como POS.
export const BenefitRedemptionSurfaceEnum = z.enum([
  "POS",
  "PONTO_INTERACAO",
  "LOJA_DIGITAL",
]);
export type TBenefitRedemptionSurface = z.infer<
  typeof BenefitRedemptionSurfaceEnum
>;
export const CashbackProgramTransactionTypeEnum = z.enum([
  "ACÚMULO",
  "RESGATE",
  "EXPIRAÇÃO",
  "CANCELAMENTO",
]);
export type TCashbackProgramTransactionTypeEnum = z.infer<
  typeof CashbackProgramTransactionTypeEnum
>;
export const CashbackProgramTransactionStatusEnum = z.enum([
  "ATIVO",
  "CONSUMIDO",
  "EXPIRADO",
]);
export type TCashbackProgramTransactionStatusEnum = z.infer<
  typeof CashbackProgramTransactionStatusEnum
>;
export const OrganizationIntegrationTypeEnum = z.enum([
  "ONLINE-SOFTWARE",
  "CARDAPIO-WEB",
  "NUVEM-SHOP",
  "IFOOD",
  "BLING",
]);
export type TOrganizationIntegrationTypeEnum = z.infer<
  typeof OrganizationIntegrationTypeEnum
>;
export const ChatMessageContentTypeEnum = z.enum([
  "TEXTO",
  "IMAGEM",
  "VIDEO",
  "AUDIO",
  "DOCUMENTO",
  "FIGURINHA",
  "LOCALIZACAO",
]);
export type TChatMessageContentTypeEnum = z.infer<
  typeof ChatMessageContentTypeEnum
>;
export const ChatMessageAuthorTypeEnum = z.enum([
  "CLIENTE",
  "USUÁRIO",
  "AI",
  "BUSINESS-APP",
]);
export type TChatMessageAuthorTypeEnum = z.infer<
  typeof ChatMessageAuthorTypeEnum
>;

// ─── Atendimento (chat_assignments) ──────────────────────────────────────────
// Note que os valores de `autor_tipo` da mensagem e de `responsavel_tipo` do atendimento
// são conjuntos distintos: AI ↔ AGENTE e BUSINESS-APP ↔ EXTERNO. O enum de autor não muda
// nesta iniciativa para não exigir ALTER TYPE em uma coluna com histórico.
export const ChatAssignmentResponsibleTypeEnum = z.enum(
  ["USUARIO", "AGENTE", "EXTERNO", "NAO_ATRIBUIDO"],
  {
    required_error: "Tipo de responsável pelo atendimento não informado.",
    invalid_type_error:
      "Tipo não válido para o tipo de responsável pelo atendimento.",
  },
);
export type TChatAssignmentResponsibleType = z.infer<
  typeof ChatAssignmentResponsibleTypeEnum
>;

export const ChatAssignmentStatusEnum = z.enum(
  [
    "ABERTO",
    "EM_ATENDIMENTO",
    "AGUARDANDO_CLIENTE",
    "AGUARDANDO_INTERNO",
    "RESOLVIDO",
    "ENCERRADO",
    "CANCELADO",
  ],
  {
    required_error: "Status do atendimento não informado.",
    invalid_type_error: "Tipo não válido para o status do atendimento.",
  },
);
export type TChatAssignmentStatus = z.infer<typeof ChatAssignmentStatusEnum>;

export const ChatAssignmentPriorityEnum = z.enum(
  ["BAIXA", "MEDIA", "ALTA", "URGENTE"],
  {
    required_error: "Prioridade do atendimento não informada.",
    invalid_type_error: "Tipo não válido para a prioridade do atendimento.",
  },
);
export type TChatAssignmentPriority = z.infer<
  typeof ChatAssignmentPriorityEnum
>;

export const ChatInboxViewEnum = z.enum(
  ["MINHAS", "NAO_ATRIBUIDAS", "COM_AGENTE", "TODAS"],
  {
    required_error: "Visão da caixa de entrada não informada.",
    invalid_type_error: "Tipo não válido para a visão da caixa de entrada.",
  },
);
export type TChatInboxView = z.infer<typeof ChatInboxViewEnum>;

export const ChatMessageDeliveryStatusEnum = z.enum(
  ["PENDENTE", "ENVIADA", "ENTREGUE", "LIDA", "FALHA", "CANCELADA"],
  {
    required_error: "Status de entrega da mensagem não informado.",
    invalid_type_error: "Tipo não válido para o status de entrega da mensagem.",
  },
);
export type TChatMessageDeliveryStatus = z.infer<
  typeof ChatMessageDeliveryStatusEnum
>;

// TODO 0053: remover junto com o DROP TYPE dos enums legados de chat.
export const ChatStatusEnum = z.enum(["ABERTA", "FECHADA"]);
export type TChatStatusEnum = z.infer<typeof ChatStatusEnum>;
export const ChatServiceStatusEnum = z.enum([
  "PENDENTE",
  "EM_ANDAMENTO",
  "CONCLUIDO",
]);
export type TChatServiceStatusEnum = z.infer<typeof ChatServiceStatusEnum>;
export const ChatServiceResponsibleTypeEnum = z.enum([
  "USUÁRIO",
  "AI",
  "BUSINESS-APP",
  "CLIENTE",
]);
export type TChatServiceResponsibleTypeEnum = z.infer<
  typeof ChatServiceResponsibleTypeEnum
>;
export const ChatMessageStatusEnum = z.enum([
  "CANCELADO",
  "ENVIADO",
  "RECEBIDO",
  "LIDO",
]);
export type TChatMessageStatusEnum = z.infer<typeof ChatMessageStatusEnum>;
export const ChatMessageWhatsappStatusEnum = z.enum([
  "PENDENTE",
  "ENVIADO",
  "ENTREGUE",
  "LIDO",
  "FALHOU",
]);
export type TChatMessageWhatsappStatusEnum = z.infer<
  typeof ChatMessageWhatsappStatusEnum
>;
export const AttributionModelEnum = z.enum([
  "LAST_TOUCH",
  "FIRST_TOUCH",
  "LINEAR",
]);
export type TAttributionModelEnum = z.infer<typeof AttributionModelEnum>;
export const ConversionTypeEnum = z.enum([
  "AQUISICAO",
  "REATIVACAO",
  "ACELERACAO",
  "REGULAR",
  "ATRASADA",
]);
export type TConversionTypeEnum = z.infer<typeof ConversionTypeEnum>;
export const CommunityCourseAccessLevelEnum = z.enum([
  "PUBLICO",
  "AUTENTICADO",
  "ASSINATURA",
]);
export type TCommunityCourseAccessLevelEnum = z.infer<
  typeof CommunityCourseAccessLevelEnum
>;
export const CommunityCourseStatusEnum = z.enum([
  "RASCUNHO",
  "PUBLICADO",
  "ARQUIVADO",
]);
export type TCommunityCourseStatusEnum = z.infer<
  typeof CommunityCourseStatusEnum
>;
export const CommunityLessonContentTypeEnum = z.enum([
  "VIDEO",
  "TEXTO",
  "VIDEO_TEXTO",
]);
export type TCommunityLessonContentTypeEnum = z.infer<
  typeof CommunityLessonContentTypeEnum
>;
export const CommunityMuxAssetStatusEnum = z.enum([
  "AGUARDANDO",
  "PROCESSANDO",
  "PRONTO",
  "ERRO",
]);
export type TCommunityMuxAssetStatusEnum = z.infer<
  typeof CommunityMuxAssetStatusEnum
>;

export const CommunityAssetTypeEnum = z.enum([
  "VIDEO",
  "IMAGE",
  "DOCUMENT",
  "AUDIO",
  "TEXT",
]);
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
export type TCommunityAssetPipelineStatusEnum = z.infer<
  typeof CommunityAssetPipelineStatusEnum
>;
export const CommunityAssetReviewVerdictEnum = z.enum([
  "APROVADO",
  "NECESSITA_AJUSTE",
  "REJEITADO",
]);
export type TCommunityAssetReviewVerdictEnum = z.infer<
  typeof CommunityAssetReviewVerdictEnum
>;
export const CommunityAssetDerivationStatusEnum = z.enum([
  "SUGERIDO",
  "APROVADO",
  "GERANDO",
  "GERADO",
  "DESCARTADO",
]);
export type TCommunityAssetDerivationStatusEnum = z.infer<
  typeof CommunityAssetDerivationStatusEnum
>;
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
export type TCommunityAssetDerivationTypeEnum = z.infer<
  typeof CommunityAssetDerivationTypeEnum
>;
export const CommunityMaterialTypeEnum = z.enum([
  "EBOOK",
  "PLAYBOOK",
  "PLANILHA",
  "TEMPLATE",
  "GUIA",
  "CHECKLIST",
  "INFOGRAFICO",
  "DOCUMENTO",
]);
export type TCommunityMaterialTypeEnum = z.infer<
  typeof CommunityMaterialTypeEnum
>;
export const CommunityTutorialNivelEnum = z.enum([
  "INICIANTE",
  "INTERMEDIARIO",
  "AVANCADO",
]);
export type TCommunityTutorialNivelEnum = z.infer<
  typeof CommunityTutorialNivelEnum
>;
export const CommunityContentStatusEnum = z.enum([
  "RASCUNHO",
  "PUBLICADO",
  "ARQUIVADO",
]);
export type TCommunityContentStatusEnum = z.infer<
  typeof CommunityContentStatusEnum
>;

// ============================================================================
// FINANCIAL / ERP
// ============================================================================

export const FinancialAccountTypeEnum = z.enum([
  "CAIXA",
  "BANCO",
  "CARTEIRA_DIGITAL",
  "CARTAO_CREDITO",
  "INVESTIMENTO",
  "OUTRO",
]);
export type TFinancialAccountTypeEnum = z.infer<
  typeof FinancialAccountTypeEnum
>;
export const BankAccountTypeEnum = z.enum([
  "CORRENTE",
  "POUPANCA",
  "PAGAMENTO",
]);
export type TBankAccountTypeEnum = z.infer<typeof BankAccountTypeEnum>;
export const FinancialTransactionTypeEnum = z.enum(["ENTRADA", "SAIDA"]);
export type TFinancialTransactionTypeEnum = z.infer<
  typeof FinancialTransactionTypeEnum
>;
export const AccountingEntryOriginTypeEnum = z.enum([
  "VENDA",
  "COMPRA",
  "MANUAL",
  "ESTORNO",
  "TRANSFERENCIA",
  "CONCILIACAO",
  "PERDA_ESTOQUE",
  "RECORRENCIA",
  "PAGAMENTO_CARTAO",
]);
export type TAccountingEntryOriginTypeEnum = z.infer<
  typeof AccountingEntryOriginTypeEnum
>;

export const AccountingEntryLineNatureEnum = z.enum(["DEBITO", "CREDITO"]);
export type TAccountingEntryLineNatureEnum = z.infer<
  typeof AccountingEntryLineNatureEnum
>;
export const FinancialStatementOriginEnum = z.enum(["ARQUIVO", "OPEN_FINANCE"]);
export type TFinancialStatementOriginEnum = z.infer<
  typeof FinancialStatementOriginEnum
>;
export const FinancialStatementImportStatusEnum = z.enum([
  "PROCESSANDO",
  "PROCESSADO",
  "ERRO",
]);
export type TFinancialStatementImportStatusEnum = z.infer<
  typeof FinancialStatementImportStatusEnum
>;
export const FinancialStatementTransactionStatusEnum = z.enum([
  "PENDENTE",
  "CONCILIADA",
  "IGNORADA",
]);
export type TFinancialStatementTransactionStatusEnum = z.infer<
  typeof FinancialStatementTransactionStatusEnum
>;
export const FinancialReconciliationMatchTypeEnum = z.enum([
  "AUTOMATICO",
  "HEURISTICO",
  "IA",
  "MANUAL",
]);
export type TFinancialReconciliationMatchTypeEnum = z.infer<
  typeof FinancialReconciliationMatchTypeEnum
>;
export const FinancialReconciliationMatchStatusEnum = z.enum([
  "SUGERIDO",
  "CONFIRMADO",
  "REJEITADO",
]);
export type TFinancialReconciliationMatchStatusEnum = z.infer<
  typeof FinancialReconciliationMatchStatusEnum
>;
export const FinancialReconciliationActionEnum = z.enum([
  "VINCULADO",
  "EFETIVADO",
  "LANCAMENTO_CRIADO",
]);
export type TFinancialReconciliationActionEnum = z.infer<
  typeof FinancialReconciliationActionEnum
>;
export const FinancialOpenFinanceProviderEnum = z.enum([
  "MOCK",
  "PLUGGY",
  "BELVO",
]);
export type TFinancialOpenFinanceProviderEnum = z.infer<
  typeof FinancialOpenFinanceProviderEnum
>;
export const FinancialOpenFinanceConnectionStatusEnum = z.enum([
  "CONECTADO",
  "EXPIRADO",
  "ERRO",
  "DESATIVADO",
]);
export type TFinancialOpenFinanceConnectionStatusEnum = z.infer<
  typeof FinancialOpenFinanceConnectionStatusEnum
>;
export const FiscalDocumentTypeEnum = z.enum(["NFCE", "NFE", "NFSE"]);
export type TFiscalDocumentTypeEnum = z.infer<typeof FiscalDocumentTypeEnum>;
export const FiscalDocumentStatusEnum = z.enum([
  "PENDENTE",
  "AUTORIZADA",
  "CANCELADA",
  "INUTILIZADA",
]);
export type TFiscalDocumentStatusEnum = z.infer<
  typeof FiscalDocumentStatusEnum
>;
export const FiscalDocumentEnvironmentEnum = z.enum([
  "HOMOLOGACAO",
  "PRODUCAO",
]);
export type TFiscalDocumentEnvironmentEnum = z.infer<
  typeof FiscalDocumentEnvironmentEnum
>;
export const FiscalDocumentLifecycleStatusEnum = z.enum([
  "RASCUNHO",
  "PRONTO_PARA_ENVIO",
  "EM_PROCESSAMENTO",
  "AUTORIZADO",
  "REJEITADO",
  "CANCELAMENTO_PENDENTE",
  "CANCELADO",
  "INUTILIZADO",
  "ERRO",
]);
export type TFiscalDocumentLifecycleStatusEnum = z.infer<
  typeof FiscalDocumentLifecycleStatusEnum
>;
export const FiscalDocumentEventTypeEnum = z.enum([
  "CRIADO",
  "ENVIO_SOLICITADO",
  "PROCESSAMENTO_INICIADO",
  "AUTORIZADO",
  "REJEITADO",
  "SINCRONIZADO",
  "CANCELAMENTO_SOLICITADO",
  "CANCELADO",
  "CARTA_CORRECAO",
  "INUTILIZACAO",
  "CLASSIFICACAO_PRESENCA_EXCEPCIONAL",
  "ERRO",
]);
export type TFiscalDocumentEventTypeEnum = z.infer<
  typeof FiscalDocumentEventTypeEnum
>;
export const FiscalOperationConsumerPresenceEnum = z.enum([
  "NAO_SE_APLICA",
  "OPERACAO_PRESENCIAL",
  "INTERNET",
  "TELEATENDIMENTO",
  "ENTREGA_DOMICILIO",
]);
export type TFiscalOperationConsumerPresenceEnum = z.infer<
  typeof FiscalOperationConsumerPresenceEnum
>;
export const FiscalOperationFinalityEnum = z.enum([
  "NORMAL",
  "COMPLEMENTAR",
  "AJUSTE",
  "DEVOLUCAO",
]);
export type TFiscalOperationFinalityEnum = z.infer<
  typeof FiscalOperationFinalityEnum
>;
export const FiscalProductOriginEnum = z.enum([
  "NACIONAL",
  "ESTRANGEIRA_IMPORTACAO_DIRETA",
  "ESTRANGEIRA_ADQUIRIDA_BRASIL",
  "NACIONAL_CONTEUDO_IMPORTACAO_SUPERIOR_40",
  "NACIONAL_PROCESSOS_BASICOS",
  "NACIONAL_CONTEUDO_IMPORTACAO_INFERIOR_IGUAL_40",
  "ESTRANGEIRA_IMPORTACAO_DIRETA_SEM_SIMILAR",
  "ESTRANGEIRA_ADQUIRIDA_BRASIL_SEM_SIMILAR",
]);
export type TFiscalProductOriginEnum = z.infer<typeof FiscalProductOriginEnum>;
export const FiscalClientTaxIndicatorEnum = z.enum([
  "CONTRIBUINTE_ICMS",
  "CONTRIBUINTE_ISENTO",
  "NAO_CONTRIBUINTE",
]);
export type TFiscalClientTaxIndicatorEnum = z.infer<
  typeof FiscalClientTaxIndicatorEnum
>;
// CSOSN (Codigo de Situacao da Operacao no Simples Nacional) usado no ICMS de optantes do Simples Nacional.
export const FiscalIcmsCsosnEnum = z.enum([
  "101",
  "102",
  "103",
  "201",
  "202",
  "203",
  "300",
  "400",
  "500",
  "900",
]);
export type TFiscalIcmsCsosnEnum = z.infer<typeof FiscalIcmsCsosnEnum>;
// CST de PIS/COFINS para operacoes de saida (no Simples Nacional normalmente 49 com valor zero).
export const FiscalPisCofinsCstEnum = z.enum([
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "49",
  "99",
]);
export type TFiscalPisCofinsCstEnum = z.infer<typeof FiscalPisCofinsCstEnum>;
// Escopo de uma regra de excecao do grupo tributario por cenario de UF.
export const FiscalTaxRuleScopeEnum = z.enum([
  "INTRAESTADUAL",
  "INTERESTADUAL",
]);
export type TFiscalTaxRuleScopeEnum = z.infer<typeof FiscalTaxRuleScopeEnum>;
// Eventos de manifestacao do destinatario (DF-e / notas recebidas).
export const FiscalInboundManifestEventEnum = z.enum([
  "CIENCIA",
  "CONFIRMACAO",
  "DESCONHECIMENTO",
  "NAO_REALIZADA",
]);
export type TFiscalInboundManifestEventEnum = z.infer<
  typeof FiscalInboundManifestEventEnum
>;
// Situacao de uma nota recebida na SEFAZ (antes varchar livre vindo do provedor).
export const FiscalInboundSituacaoEnum = z.enum([
  "AUTORIZADA",
  "DENEGADA",
  "CANCELADA",
]);
export type TFiscalInboundSituacaoEnum = z.infer<
  typeof FiscalInboundSituacaoEnum
>;
export const StockMovementTypeEnum = z.enum([
  "ENTRADA_AQUISICAO",
  "SAIDA",
  "AJUSTE",
  "ENTRADA_DEVOLUCAO",
  "SAIDA_PRODUCAO",
  "ENTRADA_PRODUCAO",
  "DESCARTE",
]);
export type TStockMovementTypeEnum = z.infer<typeof StockMovementTypeEnum>;
export const ProductionStatusEnum = z.enum([
  "RASCUNHO",
  "PLANEJADA",
  "EM_PRODUCAO",
  "CONCLUIDA",
  "CANCELADA",
]);
export type TProductionStatusEnum = z.infer<typeof ProductionStatusEnum>;
export const ProductionOriginEnum = z.enum(["MANUAL", "PEDIDO", "AGENDADA"]);
export type TProductionOriginEnum = z.infer<typeof ProductionOriginEnum>;
export const StockLotStatusEnum = z.enum([
  "ATIVO",
  "ESGOTADO",
  "VENCIDO",
  "DESCARTADO",
]);
export type TStockLotStatusEnum = z.infer<typeof StockLotStatusEnum>;
// Tipo de eixo de variante (TEXTO simples, COR com swatch, NUMERO).
export const VariantOptionTypeEnum = z.enum(["TEXTO", "COR", "NUMERO"]);
export type TVariantOptionTypeEnum = z.infer<typeof VariantOptionTypeEnum>;
export const SaleProcessingSourceEnum = z.enum(["EXTERNO", "INTERNO"]);
export type TSaleProcessingSourceEnum = z.infer<
  typeof SaleProcessingSourceEnum
>;
// Status comercial da venda. FATURADA foi removido: o faturamento e derivado dos documentos fiscais relacionados.
export const SaleStatusEnum = z.enum([
  "ORCAMENTO",
  "CONDICIONAL",
  "CONFIRMADA",
  "CANCELADA",
]);
export type TSaleStatusEnum = z.infer<typeof SaleStatusEnum>;
// Status operacional de atendimento/fulfillment da venda.
export const SaleAttendanceStatusEnum = z.enum([
  "NAO_INICIADO",
  "EM_PREPARO",
  "PRONTO",
  "EM_ENTREGA",
  "ENTREGUE",
  "PARCIALMENTE_ENTREGUE",
  "CANCELADO",
]);
export type TSaleAttendanceStatusEnum = z.infer<
  typeof SaleAttendanceStatusEnum
>;
// Status financeiro DERIVADO das transacoes financeiras da venda (nao persistido em sales).
export const SaleFinancialDerivedStatusEnum = z.enum([
  "NAO_GERADO",
  "PENDENTE",
  "PARCIALMENTE_RECEBIDA",
  "RECEBIDA",
  "EM_ATRASO",
]);
export type TSaleFinancialDerivedStatusEnum = z.infer<
  typeof SaleFinancialDerivedStatusEnum
>;
// Status fiscal DERIVADO dos documentos fiscais da venda (nao persistido em sales). Apenas apresentacional.
export const SaleFiscalDerivedStatusEnum = z.enum([
  "NAO_EMITIDO",
  "PENDENTE",
  "EM_PROCESSAMENTO",
  "AUTORIZADO",
  "REJEITADO",
  "CANCELADO",
  "INUTILIZADO",
  "ERRO",
]);
export type TSaleFiscalDerivedStatusEnum = z.infer<
  typeof SaleFiscalDerivedStatusEnum
>;
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
  "A_DEFINIR",
  "FIADO_NOTA",
  "OUTRO",
]);
export type TPaymentMethodEnum = z.infer<typeof PaymentMethodEnum>;

export const DeliveryModeEnum = z.enum([
  "PRESENCIAL",
  "RETIRADA",
  "ENTREGA",
  "COMANDA",
]);
export type TDeliveryModeEnum = z.infer<typeof DeliveryModeEnum>;

export const PurchaseStatusEnum = z.enum([
  "RASCUNHO",
  "CONFIRMADA",
  "RECEBIMENTO_PARCIAL",
  "RECEBIDA",
  "CANCELADA",
]);
export type TPurchaseStatusEnum = z.infer<typeof PurchaseStatusEnum>;

export const PurchaseCostModifierKeyEnum = z.enum([
  "DESCONTO",
  "FRETE",
  "SEGURO",
  "DESPESA_ACESSORIA",
  "IMPOSTOS_IPI",
  "IMPOSTOS_ICMS_ST",
  "IMPOSTOS_FCP_ST",
  "OUTRO",
]);
export type TPurchaseCostModifierKeyEnum = z.infer<
  typeof PurchaseCostModifierKeyEnum
>;

export const PurchaseCostModifierEffectEnum = z.enum(["ACRESCIMO", "REDUCAO"]);
export type TPurchaseCostModifierEffectEnum = z.infer<
  typeof PurchaseCostModifierEffectEnum
>;

export const PurchaseCostTreatmentEnum = z.enum([
  "CUSTO_ESTOQUE",
  "CREDITO_TRIBUTARIO",
  "DESPESA_PERIODO",
]);
export type TPurchaseCostTreatmentEnum = z.infer<
  typeof PurchaseCostTreatmentEnum
>;

export const PurchaseCostModifierOriginEnum = z.enum(["XML", "IA", "MANUAL"]);
export type TPurchaseCostModifierOriginEnum = z.infer<
  typeof PurchaseCostModifierOriginEnum
>;

export const PurchaseCostAllocationMethodEnum = z.enum([
  "INFORMADO_ITEM",
  "PROPORCIONAL_VALOR",
  "PROPORCIONAL_QUANTIDADE",
  "MANUAL",
]);
export type TPurchaseCostAllocationMethodEnum = z.infer<
  typeof PurchaseCostAllocationMethodEnum
>;

export const PurchaseImportedDocumentOriginEnum = z.enum([
  "XML",
  "PDF",
  "IMAGEM",
  "MANUAL",
  "DFE",
]);
export type TPurchaseImportedDocumentOriginEnum = z.infer<
  typeof PurchaseImportedDocumentOriginEnum
>;

export const FiscalProviderEnum = z.enum(["MANUAL", "SPEDY"]);
export type TFiscalProviderEnum = z.infer<typeof FiscalProviderEnum>;

export const PaymentProviderEnum = z.enum([
  "LOCAL",
  "MERCADO_PAGO",
  "STRIPE_CONNECT",
  "PAGARME",
]);
export type TPaymentProviderEnum = z.infer<typeof PaymentProviderEnum>;

export const PoiTransactionRequestStatusEnum = z.enum([
  "PENDENTE",
  "PROCESSANDO",
  "APROVADO",
  "REJEITADO",
  "ERRO",
]);
export type TPoiTransactionRequestStatusEnum = z.infer<
  typeof PoiTransactionRequestStatusEnum
>;

export const PoiTransactionRequestTypeEnum = z.enum(["NOVA_TRANSACAO"]);
export type TPoiTransactionRequestTypeEnum = z.infer<
  typeof PoiTransactionRequestTypeEnum
>;

export const AccountChartNatureEnum = z.enum([
  "ATIVO",
  "PASSIVO",
  "PATRIMONIO_LIQUIDO",
  "RECEITA",
  "CUSTO",
  "DESPESA",
]);
export type TAccountChartNatureEnum = z.infer<typeof AccountChartNatureEnum>;

export const ShopModeEnum = z.enum(["CARDAPIO", "CATALOGO"]);
export type TShopModeEnum = z.infer<typeof ShopModeEnum>;

export const ShopProductsModeEnum = z.enum(["ATIVOS", "INCLUIR", "EXCLUIR"]);
export type TShopProductsModeEnum = z.infer<typeof ShopProductsModeEnum>;

export const ShopHeaderCoverTypeEnum = z.enum(["IMAGEM", "VIDEO"]);
export type TShopHeaderCoverTypeEnum = z.infer<typeof ShopHeaderCoverTypeEnum>;

export const ShopCompositionBlockTypeEnum = z.enum([
  "GRUPOS_PRODUTOS",
  "EM_DESTAQUE",
  "MAIS_PEDIDOS",
]);
export type TShopCompositionBlockTypeEnum = z.infer<
  typeof ShopCompositionBlockTypeEnum
>;

export const ShopWeekdayEnum = z.enum([
  "DOMINGO",
  "SEGUNDA",
  "TERCA",
  "QUARTA",
  "QUINTA",
  "SEXTA",
  "SABADO",
]);
export type TShopWeekdayEnum = z.infer<typeof ShopWeekdayEnum>;

export const SalesChannelTypeEnum = z.enum(["POS", "SHOP", "COMANDA", "IFOOD"]);
export type TSalesChannelTypeEnum = z.infer<typeof SalesChannelTypeEnum>;

export const SalesChannelCatalogModeEnum = z.enum(["TODOS", "SELECIONADOS"]);
export type TSalesChannelCatalogModeEnum = z.infer<
  typeof SalesChannelCatalogModeEnum
>;

export const CatalogLinkProviderEnum = z.enum(["IFOOD"]);
export type TCatalogLinkProviderEnum = z.infer<typeof CatalogLinkProviderEnum>;

export const CatalogLinkTypeEnum = z.enum([
  "PRODUTO",
  "VARIANTE",
  "ADD_ON",
  "ADD_ON_OPCAO",
  "CATEGORIA",
]);
export type TCatalogLinkTypeEnum = z.infer<typeof CatalogLinkTypeEnum>;

export const CatalogLinkStatusEnum = z.enum([
  "PENDENTE",
  "SINCRONIZADO",
  "DIVERGENTE",
  "ERRO",
  "DESVINCULADO",
]);
export type TCatalogLinkStatusEnum = z.infer<typeof CatalogLinkStatusEnum>;

export const PlatformPartnerStatusEnum = z.enum([
  "PENDENTE_APROVACAO",
  "ATIVO",
  "SUSPENSO",
  "REJEITADO",
]);
export type TPlatformPartnerStatusEnum = z.infer<
  typeof PlatformPartnerStatusEnum
>;

export const PlatformPartnerReferralStatusEnum = z.enum([
  "CAPTURADO",
  "ORGANIZACAO_CRIADA",
  "PAGAMENTO_CONFIRMADO",
  "CANCELADO",
]);
export type TPlatformPartnerReferralStatusEnum = z.infer<
  typeof PlatformPartnerReferralStatusEnum
>;

export const PlatformPartnerCommissionStatusEnum = z.enum([
  "PENDENTE",
  "APROVADA",
  "CANCELADA",
  "PAGA",
]);
export type TPlatformPartnerCommissionStatusEnum = z.infer<
  typeof PlatformPartnerCommissionStatusEnum
>;

export const PlatformPartnerPayoutStatusEnum = z.enum([
  "RASCUNHO",
  "APROVADO",
  "PAGO",
  "CANCELADO",
]);
export type TPlatformPartnerPayoutStatusEnum = z.infer<
  typeof PlatformPartnerPayoutStatusEnum
>;

export const ClientTagIconEnum = z.enum([
  "Tag",
  "Tags",
  "Store",
  "Utensils",
  "ShoppingBag",
  "Truck",
  "Building2",
  "BriefcaseBusiness",
  "Star",
  "Heart",
  "BadgeCheck",
  "Sparkles",
  "MessageCircle",
  "Mail",
  "Users",
]);
export type TClientTagIconEnum = z.infer<typeof ClientTagIconEnum>;

export const CouponScopeEnum = z.enum(["GLOBAL", "INDIVIDUAL"]);
export type TCouponScopeEnum = z.infer<typeof CouponScopeEnum>;

export const CouponValidationModeEnum = z.enum(["AUTOMATICA", "MANUAL"]);
export type TCouponValidationModeEnum = z.infer<
  typeof CouponValidationModeEnum
>;

export const CouponBenefitTypeEnum = z.enum([
  "DESCONTO_FIXO",
  "DESCONTO_PERCENTUAL",
  "PRECO_FIXO",
  "COMPRE_X_LEVE_Y",
  "BRINDE",
]);
export type TCouponBenefitTypeEnum = z.infer<typeof CouponBenefitTypeEnum>;

export const CouponBenefitScopeEnum = z.enum([
  "VENDA_TOTAL",
  "ITENS_ELEGIVEIS",
]);
export type TCouponBenefitScopeEnum = z.infer<typeof CouponBenefitScopeEnum>;

export const CouponTargetOperatorEnum = z.enum(["QUALQUER", "TODOS"]);
export type TCouponTargetOperatorEnum = z.infer<
  typeof CouponTargetOperatorEnum
>;

export const CouponTargetRoleEnum = z.enum(["ELEGIVEL", "BENEFICIADO"]);
export type TCouponTargetRoleEnum = z.infer<typeof CouponTargetRoleEnum>;

export const CouponGrantOriginEnum = z.enum(["MANUAL", "CAMPANHA", "SISTEMA"]);
export type TCouponGrantOriginEnum = z.infer<typeof CouponGrantOriginEnum>;

export const CouponRedemptionStatusEnum = z.enum(["UTILIZADO", "CANCELADO"]);
export type TCouponRedemptionStatusEnum = z.infer<
  typeof CouponRedemptionStatusEnum
>;

export const CouponRedemptionSourceEnum = z.enum([
  "POS",
  "PONTO_INTERACAO",
  "LOJA_DIGITAL",
]);
export type TCouponRedemptionSourceEnum = z.infer<
  typeof CouponRedemptionSourceEnum
>;

export const SalesSessionStatusEnum = z.enum([
  "ABERTA",
  "FECHADA",
  "CONFERIDA",
  "CANCELADA",
]);
export type TSalesSessionStatusEnum = z.infer<typeof SalesSessionStatusEnum>;

// Escopo da sessão de venda: como resolver "qual sessão?". Nesta versão só OPERADOR (responsável).
export const SalesSessionPolicyEnum = z.enum(["VENDEDOR_UNICO", "VENDEDORES_MULTIPLOS"]);
export type TSalesSessionPolicyEnum = z.infer<typeof SalesSessionPolicyEnum>;

// Movimento manual de caixa dentro de uma sessão.
export const SalesSessionMovementTypeEnum = z.enum(["SANGRIA", "SUPRIMENTO"]);
export type TSalesSessionMovementTypeEnum = z.infer<
  typeof SalesSessionMovementTypeEnum
>;

// Fundação de integrations. Espelha os enums Drizzle integrationTypeEnum/integrationStatusEnum.
// Inclui marketing/parceiros e as fontes de dados ERP/marketplace (grafia hifenizada legada — D1).
export const IntegrationTipoEnum = z.enum([
  "META_ADS",
  "META_CAPI",
  "TRACKING",
  "ONLINE-SOFTWARE",
  "CARDAPIO-WEB",
  "NUVEM-SHOP",
  "IFOOD",
  "BLING",
  "ERP-FLEX",
]);
// Subconjunto de fonte de dados — espelha DATA_SOURCE_INTEGRATION_TYPES em lib/integrations/data-sources.ts.
export const DataSourceIntegrationTipoEnum = z.enum([
  "ONLINE-SOFTWARE",
  "CARDAPIO-WEB",
  "NUVEM-SHOP",
  "IFOOD",
  "BLING",
  "ERP-FLEX",
]);
export type TDataSourceIntegrationTipoEnum = z.infer<
  typeof DataSourceIntegrationTipoEnum
>;
export type TIntegrationTipoEnum = z.infer<typeof IntegrationTipoEnum>;

export const IntegrationStatusEnum = z.enum(["CONECTADO", "EXPIRADO", "ERRO"]);
export type TIntegrationStatusEnum = z.infer<typeof IntegrationStatusEnum>;

// ============================================================================
// DESCONTOS / APROVAÇÕES DE AÇÕES
// ============================================================================

// Forma do teto de desconto de um membro (mesmo par FIXO/PERCENTUAL do resgate de cashback).
export const DiscountLimitTypeEnum = z.enum(["FIXO", "PERCENTUAL"]);
export type TDiscountLimitTypeEnum = z.infer<typeof DiscountLimitTypeEnum>;

// Espelha o pgEnum actionApprovalStatusEnum.
export const ActionApprovalStatusEnum = z.enum([
  "PENDENTE",
  "APROVADA",
  "REJEITADA",
  "CANCELADA",
  "EXPIRADA",
  "CONSUMIDA",
]);
export type TActionApprovalStatusEnum = z.infer<
  typeof ActionApprovalStatusEnum
>;

// Espelha o pgEnum actionApprovalDecisionMethodEnum.
export const ActionApprovalDecisionMethodEnum = z.enum([
  "PLATAFORMA",
  "SENHA_OPERADOR",
]);
export type TActionApprovalDecisionMethodEnum = z.infer<
  typeof ActionApprovalDecisionMethodEnum
>;

// Tipos de ação aprovável. Deliberadamente NÃO é pgEnum: a coluna `tipo` é varchar para que novos
// cenários de aprovação não custem migração de enum no Postgres.
export const ActionApprovalTypeEnum = z.enum([
  "VENDA_DESCONTO",
  "AGENTE_ATIVAR_CAMPANHA",
  "AGENTE_SUBMETER_TEMPLATE",
]);
export type TActionApprovalTypeEnum = z.infer<typeof ActionApprovalTypeEnum>;

// ============================================================================
// AGENTES DE IA
// ============================================================================
//
// Deliberadamente NÃO são pgEnum (mesmo desvio consciente de chat_assignments): as colunas
// são varchar + `$type<...>` + validação Zod, para que novos status/gatilhos/ferramentas não
// custem `ALTER TYPE` em migration manual.

// Um agente PAUSADO continua configurável, mas o runtime recusa executá-lo.
export const AiAgentStatusEnum = z.enum(["ATIVO", "PAUSADO"]);
export type TAiAgentStatusEnum = z.infer<typeof AiAgentStatusEnum>;

// Quem o agente atende. A assimetria da lista vazia é deliberada: INCLUIR sem ninguém marcado
// não atende ninguém (lista de permissão vazia), enquanto EXCLUIR sem ninguém marcado atende
// todo mundo. Em ambos os casos a lista quer dizer exatamente o que está escrito nela.
export const AiAgentScopeTypeEnum = z.enum(["TODOS", "INCLUIR", "EXCLUIR"]);
export type TAiAgentScopeTypeEnum = z.infer<typeof AiAgentScopeTypeEnum>;

// Ciclo de vida de uma execução (run) do agente.
// CANCELADO = o turno concluiu, mas a entrega foi abortada pela revalidação (run supersedida).
export const AiAgentRunStatusEnum = z.enum([
  "PENDENTE",
  "RODANDO",
  "CONCLUIDO",
  "FALHA",
  "CANCELADO",
]);
export type TAiAgentRunStatusEnum = z.infer<typeof AiAgentRunStatusEnum>;

// O que originou a execução. PLAYGROUND roda o mesmo pipeline, sem envio externo.
// ATRIBUICAO_HUB é a execução disparada por um humano que entregou a conversa ao agente pelo
// hub — separa, na análise de runs, o que a IA pegou da fila do que lhe foi passado de mão.
export const AiAgentRunTriggerEnum = z.enum([
  "CHAT_MENSAGEM",
  "PLAYGROUND",
  "ATRIBUICAO_HUB",
]);
export type TAiAgentRunTriggerEnum = z.infer<typeof AiAgentRunTriggerEnum>;

// Ciclo de vida de uma chamada de ferramenta dentro de uma execução.
export const AiAgentToolCallStatusEnum = z.enum([
  "EXECUTANDO",
  "CONCLUIDO",
  "FALHA",
]);
export type TAiAgentToolCallStatusEnum = z.infer<
  typeof AiAgentToolCallStatusEnum
>;

// Patamar de custo/capacidade de um modelo no catálogo do agente (`lib/ai/providers/model-catalog.ts`).
export const AiAgentModelProfileEnum = z.enum([
  "ECONOMICO",
  "EQUILIBRADO",
  "AVANCADO",
]);
export type TAiAgentModelProfileEnum = z.infer<typeof AiAgentModelProfileEnum>;

// Ferramentas disponíveis ao agente. O nome é `dominio.acao`; a tradução para o formato do
// AI SDK (que não aceita ponto) acontece em `lib/ai/tools/registry.ts`.
export const AiAgentToolNameEnum = z.enum([
  "clientes.consultar_compras",
  "produtos.consultar",
  "orcamentos.criar",
  "cashback.consultar",
  "cupons.consultar",
  "atendimento.transferir_para_humano",
]);
export type TAiAgentToolNameEnum = z.infer<typeof AiAgentToolNameEnum>;

// Tipos de arquivo que o agente pode anexar à resposta. É um subconjunto de
// `ChatMessageContentTypeEnum`: AUDIO fica de fora porque o WhatsApp não aceita legenda em
// áudio, e a mensagem do turno é justamente a legenda do anexo.
export const AiAgentAttachmentTypeEnum = z.enum(["IMAGEM", "VIDEO", "DOCUMENTO"]);
export type TAiAgentAttachmentTypeEnum = z.infer<
  typeof AiAgentAttachmentTypeEnum
>;

// Operações mutáveis e duráveis iniciadas por ferramentas do agente. Permanecem varchar no
// banco: novos tipos de operação/recurso não devem exigir ALTER TYPE em produção.
export const AiAgentOperationStatusEnum = z.enum([
  "PROCESSANDO",
  "CONCLUIDA",
  "FALHA_REPETIVEL",
  "FALHA_FINAL",
]);
export type TAiAgentOperationStatusEnum = z.infer<
  typeof AiAgentOperationStatusEnum
>;
export const AiAgentOperationTypeEnum = z.enum(["ORCAMENTO_CRIAR"]);
export type TAiAgentOperationTypeEnum = z.infer<
  typeof AiAgentOperationTypeEnum
>;
export const AiAgentOperationResourceTypeEnum = z.enum(["VENDA"]);
export type TAiAgentOperationResourceTypeEnum = z.infer<
  typeof AiAgentOperationResourceTypeEnum
>;

// Origem do chat. PLAYGROUND é chat sintético de teste do agente e é filtrado do hub.
export const ChatOriginEnum = z.enum(["WHATSAPP", "PLAYGROUND"]);
export type TChatOriginEnum = z.infer<typeof ChatOriginEnum>;

// Espelha o pgEnum dealStatusEnum.
export const DealStatusEnum = z.enum([
  "PENDENTE",
  "ATIVO",
  "INADIMPLENTE",
  "CANCELADO",
]);
export type TDealStatusEnum = z.infer<typeof DealStatusEnum>;

// Espelha o pgEnum dealIntervaloEnum.
export const DealIntervaloEnum = z.enum(["MENSAL", "ANUAL"]);
export type TDealIntervaloEnum = z.infer<typeof DealIntervaloEnum>;

// Espelha o pgEnum dealOnboardingFormStatusEnum. "CONCLUIDO" não existe aqui de propósito:
// é derivado de deal.status === "ATIVO" (ver DealOnboardingFormSituationEnum).
export const DealOnboardingFormStatusEnum = z.enum([
  "EMITIDO",
  "PREENCHIDO",
  "CANCELADO",
]);
export type TDealOnboardingFormStatusEnum = z.infer<
  typeof DealOnboardingFormStatusEnum
>;

// Tipos de campo do formulário de onboarding. Deliberadamente NÃO é pgEnum: os campos vivem
// só no JSONB `estrutura`, e novos tipos não devem custar migração de enum no Postgres.
export const DealOnboardingFieldTypeEnum = z.enum([
  "TEXTO",
  "TEXTO_LONGO",
  "EMAIL",
  "TELEFONE",
  "CNPJ",
]);
export type TDealOnboardingFieldTypeEnum = z.infer<
  typeof DealOnboardingFieldTypeEnum
>;

// Escopo do campo: GERAL (uma resposta por formulário) ou ORGANIZACAO (uma resposta por licença).
export const DealOnboardingFieldScopeEnum = z.enum(["GERAL", "ORGANIZACAO"]);
export type TDealOnboardingFieldScopeEnum = z.infer<
  typeof DealOnboardingFieldScopeEnum
>;

// Situação derivada do formulário (status persistido + status do deal + expiração), usada no
// branching da página pública e na exibição do admin.
export const DealOnboardingFormSituationEnum = z.enum([
  "EMITIDO",
  "EXPIRADO",
  "PREENCHIDO",
  "CONCLUIDO",
  "CANCELADO",
]);
export type TDealOnboardingFormSituationEnum = z.infer<
  typeof DealOnboardingFormSituationEnum
>;

// ============================================================================
// TABS / PONTOS DE ATENDIMENTO (docs/tabs/implementation-plan.md)
// ============================================================================

// Espelha o pgEnum tabStatusEnum.
export const TabStatusEnum = z.enum(["ABERTA", "FECHADA", "CANCELADA"]);
export type TTabStatusEnum = z.infer<typeof TabStatusEnum>;

// Espelha o pgEnum servicePointTypeEnum.
export const ServicePointTypeEnum = z.enum([
  "MESA",
  "BALCAO",
  "QUIOSQUE",
  "OUTRO",
]);
export type TServicePointTypeEnum = z.infer<typeof ServicePointTypeEnum>;

// Espelha o pgEnum productStockDeductionModeEnum.
export const ProductStockDeductionModeEnum = z.enum([
  "ESTOQUE_PROPRIO",
  "COMPOSICAO",
]);
export type TProductStockDeductionModeEnum = z.infer<
  typeof ProductStockDeductionModeEnum
>;

// Politicas de serviceSettings (apenas app-level, nao sao pgEnum: vivem no jsonb de configuracoes).
export const TabIdentificationModeEnum = z.enum([
  "AUTOMATICA",
  "CODIGO_MANUAL",
]);
export type TTabIdentificationModeEnum = z.infer<
  typeof TabIdentificationModeEnum
>;

export const PublicTabOpeningModeEnum = z.enum([
  "DESABILITADA",
  "SOLICITACAO",
  "AUTOMATICA",
]);
export type TPublicTabOpeningModeEnum = z.infer<
  typeof PublicTabOpeningModeEnum
>;

export const TabCustomerOrderingModeEnum = z.enum([
  "DESABILITADO",
  "SOLICITACAO",
  "DIRETO",
]);
export type TTabCustomerOrderingModeEnum = z.infer<
  typeof TabCustomerOrderingModeEnum
>;

// Status da solicitacao publica de pedido (QR). Deliberadamente NAO e pgEnum:
// a coluna e varchar para novos estados nao custarem migracao (padrao shopOrderRequests).
export const TabOrderRequestStatusEnum = z.enum([
  "PENDENTE",
  "APROVADA",
  "REJEITADA",
  "PROCESSANDO",
  "CONCLUIDA",
  "ERRO",
]);
export type TTabOrderRequestStatusEnum = z.infer<
  typeof TabOrderRequestStatusEnum
>;

// ============================================================================
// ACCESS (fundação de acesso externo — docs/dev-planning/poi-mobile-react-native-plan.md §9)
// ============================================================================

export const AccessClientCategoryEnum = z.enum([
  "NATIVO_MOBILE",
  "NATIVO_WEB_KIOSK",
  "NATIVO_DESKTOP",
  "TERMINAL_PAGAMENTO",
  "SERVIDOR_EXTERNO",
  "APLICACAO_PARCEIRA",
]);
export type TAccessClientCategoryEnum = z.infer<
  typeof AccessClientCategoryEnum
>;

export const AccessClientStatusEnum = z.enum(["ATIVO", "INATIVO"]);
export type TAccessClientStatusEnum = z.infer<typeof AccessClientStatusEnum>;

// CONTA_PLATAFORMA é o único tipo sem organização: representa nós mesmos (Control, time interno)
// falando com a plataforma inteira. Todo o resto é sempre uma instalação em UMA organização.
export const AccessPrincipalTypeEnum = z.enum([
  "DISPOSITIVO",
  "AGENTE_DESKTOP",
  "CONTA_SERVICO",
  "CONTA_PLATAFORMA",
]);
export type TAccessPrincipalTypeEnum = z.infer<typeof AccessPrincipalTypeEnum>;

export const AccessPrincipalStatusEnum = z.enum([
  "ATIVO",
  "INATIVO",
  "REVOGADO",
]);
export type TAccessPrincipalStatusEnum = z.infer<
  typeof AccessPrincipalStatusEnum
>;

export const AccessCredentialTypeEnum = z.enum([
  "TOKEN_DISPOSITIVO",
  "CHAVE_API",
]);
export type TAccessCredentialTypeEnum = z.infer<
  typeof AccessCredentialTypeEnum
>;

// Scopes existentes na plataforma. Correspondência sempre por igualdade exata — sem wildcards (§9.4 do plano).
// Prefixo "desktop-agent:" (e não "agent:") de propósito: "agent" puro fica reservado para um
// eventual agente de IA/MCP da plataforma.
export const AccessScopeEnum = z.enum([
  "poi:configuration:read",
  "poi:clients:read",
  "poi:clients:create",
  "poi:transactions:create",
  "poi:coupons:read",
  "poi:prizes:read",
  "poi:sellers:read",
  "desktop-agent:configuration:read",
  "desktop-agent:printers:sync",
  "desktop-agent:print-jobs:read",
  "desktop-agent:print-jobs:update",
  // Agentes de IA (MCP). Leitura por domínio, no mesmo grão em que o lojista pensa no painel:
  // quem concede "resultados" está liberando faturamento e metas, não a base de clientes.
  "agent:results:read",
  "agent:clients:read",
  // Separado de `agent:clients:read` de propósito: telefone, e-mail e CPF/CNPJ saem mascarados
  // sem este scope. Um agente que responde "quantos clientes em risco?" não precisa de PII.
  "agent:clients:pii",
  "agent:products:read",
  "agent:campaigns:read",
  "agent:sales:read",
  // Financeiro separado de vendas: quem concede "vendas" não está concedendo contas, extratos e
  // fluxo de caixa. `reconcile` só cria SUGESTÕES de conciliação — a confirmação é sempre humana.
  "agent:finances:read",
  "agent:finances:reconcile",
  "agent:members:read",
  "agent:campaigns:write",
  "agent:campaigns:activate",
  "agent:message-templates:read",
  "agent:message-templates:write",
  "agent:message-templates:submit",
  "agent:message-template-media:write",
  // Prefixo `platform:` só existe para principal CONTA_PLATAFORMA — são as ferramentas que
  // atravessam organizações. Nenhuma aplicação de lojista tem esses scopes no teto.
  "platform:organizations:read",
  "platform:metrics:read",
]);
export type TAccessScopeEnum = z.infer<typeof AccessScopeEnum>;

// ============================================================================
// DESKTOP AGENT — impressão (docs/dev-planning/desktop-agent-printing-plan.md)
// Todos varchar no banco + z.enum no app (mesmo racional de access_events):
// novos valores não custam migração de enum no Postgres.
// ============================================================================

export const AgentPrinterDriverEnum = z.enum(["DRIVER_SO", "ZPL_REDE"]);
export type TAgentPrinterDriverEnum = z.infer<typeof AgentPrinterDriverEnum>;

// Roteamento por finalidade: a impressora declara o que atende; o job nasce com uma finalidade.
// TESTE sempre carrega impressoraId fixado (bypassa o roteamento) — valida o pipeline fim-a-fim.
export const PrintJobFinalidadeEnum = z.enum([
  "CUPOM_VENDA",
  "ETIQUETA_LOTE",
  "DANFE_NFCE",
  "DANFE_NFE",
  "TESTE",
]);
export type TPrintJobFinalidadeEnum = z.infer<typeof PrintJobFinalidadeEnum>;

export const PrintJobFormatoEnum = z.enum(["HTML", "PDF_URL", "ZPL"]);
export type TPrintJobFormatoEnum = z.infer<typeof PrintJobFormatoEnum>;

export const PrintJobStatusEnum = z.enum([
  "PENDENTE",
  "PROCESSANDO",
  "IMPRESSO",
  "ERRO",
  "CANCELADO",
  "EXPIRADO",
]);
export type TPrintJobStatusEnum = z.infer<typeof PrintJobStatusEnum>;

export const PrintJobOrigemTipoEnum = z.enum([
  "VENDA",
  "LOTE",
  "NOTA_FISCAL",
  "MANUAL",
]);
export type TPrintJobOrigemTipoEnum = z.infer<typeof PrintJobOrigemTipoEnum>;

// `tipo` de access_events é varchar no banco; este enum é a fonte de verdade no app
// (novos eventos não custam migração de enum no Postgres).
export const AccessEventTypeEnum = z.enum([
  "ENROLLMENT_CONCLUIDO",
  "ENROLLMENT_FALHA",
  "AUTENTICACAO_FALHA",
  "CREDENCIAL_CRIADA",
  "CREDENCIAL_ROTACIONADA",
  "CREDENCIAL_REVOGADA",
  "SCOPE_CONCEDIDO",
  "SCOPE_REMOVIDO",
  "PRINCIPAL_REVOGADO",
  "CHAMADA_POI_LEGADO",
  "CHAMADA_AGENTE",
  "MUTACOES_AGENTE_CONFIGURADAS",
  "OPERACAO_AGENTE",
  // Fluxo OAuth das conexões MCP (registro dinâmico + authorization code).
  "OAUTH_CLIENTE_REGISTRADO",
  "OAUTH_CODIGO_EMITIDO",
  "OAUTH_TOKEN_EMITIDO",
  "OAUTH_FALHA",
]);
export type TAccessEventTypeEnum = z.infer<typeof AccessEventTypeEnum>;

// Origem de um evento externo arquivado no inbox (ampmais_external_events). Espelha o
// varchar do schema — nova origem entra aqui sem migração de enum no Postgres.
export const ExternalEventSourceEnum = z.enum([
  "META-WHATSAPP",
  "WHATSAPP-GATEWAY",
  "STRIPE",
  "SPEDY",
]);
export type TExternalEventSourceEnum = z.infer<typeof ExternalEventSourceEnum>;

export const ExternalEventProcessingStatusEnum = z.enum([
  "RECEBIDO",
  "PROCESSADO",
  "FALHOU",
]);
export type TExternalEventProcessingStatusEnum = z.infer<
  typeof ExternalEventProcessingStatusEnum
>;

// Vocabulário da Catalog API v2.0 do iFood, não do domínio da casa: estes valores viajam para a API
// deles, então ficam em inglês (a regra de enum em PT vale para o que é nosso). A homologação exige
// que o cliente rejeite qualquer status fora deste par antes de chamar o iFood.
export const IfoodCatalogStatusEnum = z.enum(["AVAILABLE", "UNAVAILABLE"], {
  required_error: "Status não informado.",
  invalid_type_error: "Tipo inválido para o status.",
});
export type TIfoodCatalogStatusEnum = z.infer<typeof IfoodCatalogStatusEnum>;

/** Limites de tamanho de campo cobrados na homologação do Catalog. */
export const IFOOD_CATALOG_TITLE_MAX_LENGTH = 100;
export const IFOOD_CATALOG_DESCRIPTION_MAX_LENGTH = 500;

// Todo grupo de complementos precisa declarar seu tipo. Os quatro aqui valem para itens DEFAULT;
// pizza usa SIZE/CRUST/EDGE/TOPPING, que só fazem sentido dentro de uma categoria PIZZA e entram
// junto com o suporte a pizza — deixar de fora aqui é o que impede marcar "borda" num hambúrguer.
/**
 * Tipo do item. `PIZZA` exige os quatro grupos SIZE/CRUST/EDGE/TOPPING (422 sem eles) e a loja
 * aceita no máximo uma categoria PIZZA. `COMBO_V2` exige exatamente um grupo `associationType: MAIN`.
 */
export const IfoodItemTypeEnum = z.enum(["DEFAULT", "PIZZA", "COMBO_V2"], {
  required_error: "Tipo do item não informado.",
  invalid_type_error: "Tipo inválido para o item.",
});
export type TIfoodItemTypeEnum = z.infer<typeof IfoodItemTypeEnum>;

export const IFOOD_ITEM_TYPE_LABELS: Record<TIfoodItemTypeEnum, string> = {
  DEFAULT: "Item comum",
  PIZZA: "Pizza",
  COMBO_V2: "Combo",
};

/** Os quatro tipos de grupo que só existem dentro de uma pizza, na ordem em que o cliente escolhe. */
export const IFOOD_PIZZA_GROUP_TYPES = [
  "SIZE",
  "CRUST",
  "EDGE",
  "TOPPING",
] as const;

export const IfoodOptionGroupTypeEnum = z.enum(
  [
    "OFFER_UNIT",
    "SPECIFICATION",
    "INGREDIENTS",
    "CUTLERY",
    ...IFOOD_PIZZA_GROUP_TYPES,
  ],
  {
    required_error: "Tipo do grupo de complementos não informado.",
    invalid_type_error: "Tipo inválido para o grupo de complementos.",
  },
);
export type TIfoodOptionGroupTypeEnum = z.infer<
  typeof IfoodOptionGroupTypeEnum
>;

/** Rótulos em PT dos tipos de grupo, para os seletores da UI. */
export const IFOOD_OPTION_GROUP_TYPE_LABELS: Record<
  TIfoodOptionGroupTypeEnum,
  string
> = {
  OFFER_UNIT: "Venda adicional",
  SPECIFICATION: "Especificação de preparo",
  INGREDIENTS: "Alteração de ingredientes",
  CUTLERY: "Utensílios",
  SIZE: "Tamanho",
  CRUST: "Massa",
  EDGE: "Borda",
  TOPPING: "Sabor",
};

/** Tipos de grupo oferecidos num item comum — os de pizza só existem dentro de um item PIZZA. */
export const IFOOD_DEFAULT_OPTION_GROUP_TYPES = [
  "OFFER_UNIT",
  "SPECIFICATION",
  "INGREDIENTS",
  "CUTLERY",
] as const;

/** Contextos (canais de venda) de um catálogo do iFood. */
export const IfoodCatalogContextEnum = z.enum(
  ["DEFAULT", "WHITELABEL", "INDOOR"],
  {
    required_error: "Contexto do catálogo não informado.",
    invalid_type_error: "Tipo inválido para o contexto do catálogo.",
  },
);
export type TIfoodCatalogContextEnum = z.infer<typeof IfoodCatalogContextEnum>;

export const IFOOD_CATALOG_CONTEXT_LABELS: Record<
  TIfoodCatalogContextEnum,
  string
> = {
  DEFAULT: "Entrega",
  WHITELABEL: "Cardápio Digital",
  INDOOR: "Consumo no Local",
};

// ============================================================================
// CAMPOS PERSONALIZADOS
// ============================================================================

export const CustomFieldEntityEnum = z.enum(["CLIENTE"], {
  required_error: "Entidade do campo personalizado não informada.",
  invalid_type_error: "Tipo não válido para a entidade do campo personalizado.",
});
export type TCustomFieldEntityEnum = z.infer<typeof CustomFieldEntityEnum>;

export const CustomFieldTypeEnum = z.enum(
  ["ESCOLHA_UNICA", "ESCOLHA_MULTIPLA", "TEXTO", "NUMERO", "DATA"],
  {
    required_error: "Tipo do campo personalizado não informado.",
    invalid_type_error: "Tipo não válido para o tipo do campo personalizado.",
  },
);
export type TCustomFieldTypeEnum = z.infer<typeof CustomFieldTypeEnum>;

export const CUSTOM_FIELD_TYPE_LABELS: Record<TCustomFieldTypeEnum, string> = {
  ESCOLHA_UNICA: "Escolha única",
  ESCOLHA_MULTIPLA: "Escolha múltipla",
  TEXTO: "Texto",
  NUMERO: "Número",
  DATA: "Data",
};

// ============================================================================
// PONTO DE INTERAÇÃO
// ============================================================================

/**
 * Fluxo de cadastro do ponto de interação, por superfície (celular/totem).
 * RAPIDO = só o essencial (nome, telefone) — o cadastro que sempre existiu.
 * COMPLETO = o essencial mais os campos personalizados configurados pela organização.
 */
export const PoiRegistrationFlowEnum = z.enum(["RAPIDO", "COMPLETO"], {
  required_error: "Fluxo de cadastro do ponto de interação não informado.",
  invalid_type_error:
    "Tipo não válido para o fluxo de cadastro do ponto de interação.",
});
export type TPoiRegistrationFlowEnum = z.infer<typeof PoiRegistrationFlowEnum>;

export const POI_REGISTRATION_FLOW_LABELS: Record<
  TPoiRegistrationFlowEnum,
  string
> = {
  RAPIDO: "Rápido",
  COMPLETO: "Completo",
};

// -- Arquivos e uploads (primitivo de intake; ver lib/files/README.md) --

export const StorageProviderEnum = z.enum(["SUPABASE"], {
  invalid_type_error: "Tipo não válido para o provedor de armazenamento.",
});
export type TStorageProviderEnum = z.infer<typeof StorageProviderEnum>;

export const FileVisibilityEnum = z.enum(["PUBLICO", "PRIVADO"], {
  invalid_type_error: "Tipo não válido para a visibilidade do arquivo.",
});
export type TFileVisibilityEnum = z.infer<typeof FileVisibilityEnum>;

export const UploadStatusEnum = z.enum(
  ["AGUARDANDO", "RECEBIDO", "CONSUMIDO", "EXPIRADO"],
  {
    invalid_type_error: "Tipo não válido para o status do upload.",
  },
);
export type TUploadStatusEnum = z.infer<typeof UploadStatusEnum>;

// Espelha as chaves do registro em lib/files/intake.ts — o registro é a fonte da verdade; o enum
// existe para que registrar um propósito sem declará-lo aqui vire erro de tipo.
export const UploadPurposeEnum = z.enum(["MIDIA_TEMPLATE_MENSAGEM"], {
  invalid_type_error: "Tipo não válido para o propósito do upload.",
});
export type TUploadPurposeEnum = z.infer<typeof UploadPurposeEnum>;

// ============================================================================
// PDV — CATÁLOGO DE VENDA
// ============================================================================

/**
 * Ordenação da grade de produtos do PDV.
 * VALOR_VENDIDO e QUANTIDADE_VENDIDA olham a janela recente de vendas confirmadas — o que a loja
 * realmente gira fica na primeira página, sem precisar de uma faixa separada de "mais pedidos".
 * NOME é a ordem de catálogo, para quem procura um item específico na grade.
 */
export const POSProductOrderingEnum = z.enum(
  ["VALOR_VENDIDO", "QUANTIDADE_VENDIDA", "NOME"],
  {
    invalid_type_error: "Tipo não válido para a ordenação dos produtos do PDV.",
  },
);
export type TPOSProductOrderingEnum = z.infer<typeof POSProductOrderingEnum>;

export const POS_PRODUCT_ORDERING_DEFAULT: TPOSProductOrderingEnum =
  "VALOR_VENDIDO";

export const POS_PRODUCT_ORDERING_LABELS: Record<
  TPOSProductOrderingEnum,
  string
> = {
  VALOR_VENDIDO: "Mais faturados",
  QUANTIDADE_VENDIDA: "Mais vendidos",
  NOME: "Nome (A-Z)",
};

export const ClientDuplicateSignalTypeEnum = z.enum(["TELEFONE", "EMAIL", "CPF_CNPJ", "INSTAGRAM_USERNAME"], {
	required_error: "Tipo do sinal de duplicidade não informado.",
	invalid_type_error: "Tipo não válido para o sinal de duplicidade.",
});
export type TClientDuplicateSignalTypeEnum = z.infer<typeof ClientDuplicateSignalTypeEnum>;

export const ClientDuplicateStatusEnum = z.enum(["PENDENTE", "DESCARTADO", "MESCLADO"], {
	required_error: "Status do par de duplicidade não informado.",
	invalid_type_error: "Tipo não válido para o status do par de duplicidade.",
});
export type TClientDuplicateStatusEnum = z.infer<typeof ClientDuplicateStatusEnum>;

export const OnboardingProductEnum = z.enum(["CRM", "ERP"], {
	required_error: "Produto do onboarding não informado.",
	invalid_type_error: "Tipo não válido para o produto do onboarding.",
});
export type TOnboardingProductEnum = z.infer<typeof OnboardingProductEnum>;

export const OnboardingIntentOriginEnum = z.enum(["LINK", "PARCEIRO", "DEAL", "PERGUNTA", "SEGUNDO_PRODUTO"], {
	required_error: "Origem da intenção do onboarding não informada.",
	invalid_type_error: "Tipo não válido para a origem da intenção do onboarding.",
});
export type TOnboardingIntentOriginEnum = z.infer<typeof OnboardingIntentOriginEnum>;

// Estado derivado de uma campanha semeada por preset. PREPARADA = existe e não envia; PRONTA =
// dependências satisfeitas; HABILITADA = o usuário liberou; ATIVA = o motor de campanhas considera.
export const OnboardingCampaignStateEnum = z.enum(["PREPARADA", "PRONTA", "HABILITADA", "ATIVA"], {
	required_error: "Estado da campanha não informado.",
	invalid_type_error: "Tipo não válido para o estado da campanha.",
});
export type TOnboardingCampaignStateEnum = z.infer<typeof OnboardingCampaignStateEnum>;

export const OnboardingDependencyTypeEnum = z.enum(["CANAL", "TEMPLATE", "PAGAMENTO", "DADOS", "CASHBACK", "LIBERACAO"], {
	required_error: "Tipo da dependência não informado.",
	invalid_type_error: "Tipo não válido para a dependência.",
});
export type TOnboardingDependencyTypeEnum = z.infer<typeof OnboardingDependencyTypeEnum>;

export const OnboardingDependencyStatusEnum = z.enum(["OK", "PENDENTE", "EM_ANALISE", "FALHOU", "NAO_APLICAVEL"], {
	required_error: "Status da dependência não informado.",
	invalid_type_error: "Tipo não válido para o status da dependência.",
});
export type TOnboardingDependencyStatusEnum = z.infer<typeof OnboardingDependencyStatusEnum>;

// Estado de pagamento da conta WhatsApp Cloud API. A Meta não expõe isso de forma confiável:
// nasce DESCONHECIDO, o usuário confirma no onboarding, a primeira entrega verifica e o erro
// 131042 nos webhooks de status rebaixa para PENDENTE.
export const WhatsappPaymentStatusEnum = z.enum(["DESCONHECIDO", "CONFIRMADO_PELO_USUARIO", "VERIFICADO", "PENDENTE"], {
	required_error: "Status do pagamento do WhatsApp não informado.",
	invalid_type_error: "Tipo não válido para o status do pagamento do WhatsApp.",
});
export type TWhatsappPaymentStatusEnum = z.infer<typeof WhatsappPaymentStatusEnum>;
export const ImportJobStateEnum = z.enum(["AGUARDANDO", "EM_ANDAMENTO", "PAUSADO_LIMITE", "AGUARDANDO_RECONEXAO", "CONCLUIDO", "CONCLUIDO_COM_LACUNAS", "FALHOU", "CANCELADO"]);
export type TImportJobStateEnum = z.infer<typeof ImportJobStateEnum>;
export const ImportJobTypeEnum = z.enum(["HISTORICO"]);
