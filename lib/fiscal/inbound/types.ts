import type { TFiscalInboundManifestEventEnum, TFiscalInboundSituacaoEnum } from "@/schemas/enums";
import type { TFiscalOrganization } from "../types";

// Estado de manifestacao como confirmado pelo provedor/SEFAZ (readback), nunca o valor otimista.
export type TInboundManifestState = {
	evento: TFiscalInboundManifestEventEnum | null;
	protocolo?: string | null;
	data?: Date | null;
	justificativa?: string | null;
	// SEFAZ recusou o registro da manifestacao (estado exclusivo do provedor, sem enum interno).
	rejeitada?: boolean;
};

// Snapshot normalizado de uma nota recebida, como vista pelo provedor em um instante.
// A chave de acesso e a identidade universal; o id do provedor e um handle operacional.
export type TInboundDocumentSnapshot = {
	chaveAcesso: string;
	provedorDocumentoId?: string | null;
	completo: boolean;
	situacao?: TFiscalInboundSituacaoEnum | null;
	emitenteCpfCnpj?: string | null;
	emitenteNome?: string | null;
	valorTotal?: number | null;
	dataEmissao?: Date | null;
	manifestacao?: TInboundManifestState | null;
	// Eventos SEFAZ vinculados (cancelamento, carta de correcao...), payload cru do provedor.
	eventos?: unknown[] | null;
	// Retorno cru do provedor, para auditoria/reprocessamento.
	resumoPayload?: Record<string, unknown> | null;
};

export type TInboundListResult = {
	documentos: TInboundDocumentSnapshot[];
	// Blob opaco do provedor: o core persiste e devolve, nunca interpreta.
	checkpoint: string | null;
	hasMore: boolean;
};

export type TInboundManifestInput = {
	evento: TFiscalInboundManifestEventEnum;
	justificativa?: string | null;
};

export type TInboundManifestResult = {
	registrado: boolean;
	manifestacao: TInboundManifestState | null;
	mensagens?: string[];
};

export type TInboundSyncStatus = {
	lastSyncAt: Date | null;
	nextAllowedSyncAt: Date | null;
	// Vocabulario do provedor, persistido como telemetria (sem enum interno).
	outcome: string | null;
	mensagem: string | null;
};

export type TInboundSyncRequestResult = {
	accepted: boolean;
	retryAfterSeconds?: number | null;
	nextAllowedSyncAt?: Date | null;
};

// Referencia minima para operar um documento junto ao provedor.
export type TInboundProviderRef = {
	provedorDocumentoId?: string | null;
	chaveAcesso: string;
};

export interface IFiscalInboundProvider {
	listDocuments(input: { checkpoint: string | null }, organization: TFiscalOrganization): Promise<TInboundListResult>;
	manifest(input: TInboundManifestInput, doc: TInboundProviderRef, organization: TFiscalOrganization): Promise<TInboundManifestResult>;

	// Capacidades opcionais — o core degrada graciosamente quando ausentes.
	getDocument?(doc: TInboundProviderRef, organization: TFiscalOrganization): Promise<TInboundDocumentSnapshot | null>;
	downloadXml?(doc: TInboundProviderRef, organization: TFiscalOrganization): Promise<ArrayBuffer | null>;
	downloadPdf?(doc: TInboundProviderRef, organization: TFiscalOrganization): Promise<ArrayBuffer | null>;
	requestSync?(organization: TFiscalOrganization): Promise<TInboundSyncRequestResult>;
	getSyncStatus?(organization: TFiscalOrganization): Promise<TInboundSyncStatus | null>;
}

// Mapeamento dos eventos internos para os codigos de evento da SEFAZ.
export const MANIFEST_EVENT_CODES: Record<TFiscalInboundManifestEventEnum, string> = {
	CIENCIA: "210210",
	CONFIRMACAO: "210200",
	DESCONHECIMENTO: "210220",
	NAO_REALIZADA: "210240",
};
