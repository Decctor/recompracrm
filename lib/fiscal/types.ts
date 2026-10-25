import type {
  TFiscalDocumentEnvironmentEnum,
  TFiscalDocumentLifecycleStatusEnum,
  TFiscalDocumentStatusEnum,
  TFiscalDocumentTypeEnum,
  TPaymentMethodEnum,
} from "@/schemas/enums";
import type { TOrganizationFiscalConfig } from "@/schemas/organizations";
import type {
  TOrganizationEntity,
  TFiscalDocument,
  TFiscalIbptRateEntity,
  TFiscalOperationProfileEntity,
  TFiscalSeriesEntity,
  TProductFiscalProfileEntity,
} from "@/services/drizzle/schema";
import type { TClientEntity } from "@/services/drizzle/schema/clients";
import type {
  TSaleEntity,
  TSaleItemEntity,
} from "@/services/drizzle/schema/sales";
import type { TFiscalTaxGroupWithRules } from "./engine";

export type TSaleForFiscal = TSaleEntity & {
  itens: TSaleItemEntity[];
  cliente?: TClientEntity | null;
  entregaLocalizacao?: {
    localizacaoCep: string | null;
    localizacaoEstado: string | null;
    localizacaoCidade: string | null;
    localizacaoBairro: string | null;
    localizacaoLogradouro: string | null;
    localizacaoNumero: string | null;
    localizacaoComplemento: string | null;
  } | null;
};

export type TFiscalOrganization = TOrganizationEntity & {
  fiscalConfiguracao: TOrganizationFiscalConfig | null;
};

export type TFiscalSalePayment = {
  metodo: TPaymentMethodEnum;
  valor: number;
};

export type TFiscalSaleContext = {
  venda: TSaleForFiscal;
  organizacao: TFiscalOrganization;
  serie: TFiscalSeriesEntity;
  operacao: TFiscalOperationProfileEntity;
  perfisProdutos: TProductFiscalProfileEntity[];
  gruposTributarios: TFiscalTaxGroupWithRules[];
  ibptRates: TFiscalIbptRateEntity[];
  // ST retido por unidade, por produto, lido da ultima entrada (CSOSN 500) — ADR-0002, fluxo G.
  stRetidoPorProduto?: Record<string, { vBCSTRet: number; pST: number | null; vICMSSTRet: number }> | null;
  destinatarioSnapshot: Record<string, unknown> | null;
  pagamentos: TFiscalSalePayment[];
  classificacaoPresencaExcepcional?: {
    presencaConsumidor: "OPERACAO_PRESENCIAL";
    justificativa: string;
    autorId: string;
    dataDeclaracao: Date;
  } | null;
};

export type TEmitirDocumentoInput = {
  vendaId: string;
  tipo: Extract<TFiscalDocumentTypeEnum, "NFCE" | "NFE">;
  organizacaoId: string;
  lancamentoContabilId?: string | null;
  autorId?: string | null;
  origem: "AUTOMATICA" | "MANUAL";
  // Devolucao: perfil de operacao especifico e encadeamento ao documento original.
  operationProfileId?: string | null;
  documentoOrigemId?: string | null;
  chaveAcessoReferencia?: string | null;
  classificacaoPresencaExcepcional?: {
    presencaConsumidor: "OPERACAO_PRESENCIAL";
    justificativa: string;
    autorId: string;
    dataDeclaracao: Date;
  } | null;
};

export type TEmitirDocumentoResult = {
  documentoId: string;
  status: TFiscalDocumentStatusEnum;
  statusInterno: TFiscalDocumentLifecycleStatusEnum;
  chaveAcesso?: string | null;
  numero?: string | null;
  serie?: string | null;
  protocolo?: string | null;
};

export type TCancelDocumentInput = {
  organizationId: string;
  documentId: string;
  reason: string;
  authorId?: string | null;
};

export type TCancelDocumentResult = {
  documentoId: string;
  status: TFiscalDocumentStatusEnum;
  statusInterno: TFiscalDocumentLifecycleStatusEnum;
};

export type TSyncDocumentInput = {
  organizationId: string;
  documentId: string;
  authorId?: string | null;
  source?: "CONSULTA_MANUAL" | "CONSULTA_AUTOMATICA";
};

export type TSyncDocumentResult = {
  documentoId: string;
  status: TFiscalDocumentStatusEnum;
  statusInterno: TFiscalDocumentLifecycleStatusEnum;
};

export type TDownloadFiscalAssetInput = {
  documento: TFiscalDocument;
  asset: "xml" | "pdf";
};

export type TProviderCompanySyncResult = {
  cpfCnpj: string;
  sincronizado: boolean;
  companyId?: string | null;
  companyApiKey?: string | null;
  provedorRetorno?: Record<string, unknown> | null;
};

export type TProviderCompanyCertificateSyncInput = {
  certificate: ArrayBuffer;
  fileName: string;
  password: string;
};

export type TProviderCompanyCertificateSyncResult = {
  cpfCnpj: string;
  sincronizado: boolean;
  certificado: {
    providerManaged: true;
    serialNumber?: string | null;
    issuerName?: string | null;
    subjectName?: string | null;
    thumbprint?: string | null;
    validFrom?: string | null;
    validTo?: string | null;
    uploadedAt: string;
  };
};

export type TProviderDocumentDetails = {
  id: string;
  status: TFiscalDocumentStatusEnum;
  statusInterno: TFiscalDocumentLifecycleStatusEnum;
  ambiente: TFiscalDocumentEnvironmentEnum;
  chaveAcesso?: string | null;
  numero?: string | null;
  serie?: string | null;
  protocolo?: string | null;
  dataEmissao?: Date | null;
  dataAutorizacao?: Date | null;
  dataCancelamento?: Date | null;
  provedorProcessadoEm?: Date | null;
  codigoStatus?: string | null;
  mensagens?: unknown[];
  provedorPayload?: Record<string, unknown> | null;
  provedorRetorno?: Record<string, unknown> | null;
};

export type TFiscalCorrectionInput = {
  organizationId: string;
  documentId: string;
  correcao: string;
  authorId?: string | null;
};
export type TProviderCorrectionResult = {
  sequenciaEvento: number;
  protocolo?: string | null;
  dataEvento?: Date | null;
  mensagens?: unknown[];
  provedorRetorno?: Record<string, unknown> | null;
};

export type TFiscalInutilizationInput = {
  organizationId: string;
  documentId: string;
  justificativa: string;
  authorId?: string | null;
};
export type TProviderInutilizationResult = {
  status: TFiscalDocumentStatusEnum;
  protocolo?: string | null;
  dataEvento?: Date | null;
  mensagens?: unknown[];
  provedorRetorno?: Record<string, unknown> | null;
};

export interface IFiscalProvider {
  emitirDocumento(
    context: TFiscalSaleContext,
    documento: TFiscalDocument,
  ): Promise<TProviderDocumentDetails>;
  consultarDocumento(
    documento: TFiscalDocument,
    organizacao: TFiscalOrganization,
  ): Promise<TProviderDocumentDetails>;
  sincronizarDocumento(
    documento: TFiscalDocument,
    organizacao: TFiscalOrganization,
  ): Promise<TProviderDocumentDetails>;
  cancelarDocumento(
    input: TCancelDocumentInput,
    documento: TFiscalDocument,
    organizacao: TFiscalOrganization,
  ): Promise<TProviderDocumentDetails>;
  cartaCorrecaoDocumento(
    input: TFiscalCorrectionInput,
    documento: TFiscalDocument,
    organizacao: TFiscalOrganization,
  ): Promise<TProviderCorrectionResult>;
  inutilizarNumeracao(
    input: TFiscalInutilizationInput,
    documento: TFiscalDocument,
    organizacao: TFiscalOrganization,
  ): Promise<TProviderInutilizationResult>;
  baixarXml(
    documento: TFiscalDocument,
    organizacao: TFiscalOrganization,
  ): Promise<ArrayBuffer | null>;
  baixarPdf(
    documento: TFiscalDocument,
    organizacao: TFiscalOrganization,
  ): Promise<ArrayBuffer | null>;
  sincronizarEmpresa(
    organizacao: TFiscalOrganization,
  ): Promise<TProviderCompanySyncResult>;
  sincronizarCertificadoEmpresa(
    organizacao: TFiscalOrganization,
    input: TProviderCompanyCertificateSyncInput,
  ): Promise<TProviderCompanyCertificateSyncResult>;
}
