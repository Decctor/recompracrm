import type { TFiscalDocumentStatusEnum, TFiscalDocumentTypeEnum } from "@/schemas/enums";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import type { TSaleEntity, TSaleItemEntity } from "@/services/drizzle/schema/sales";

// ============================================================================
// Fiscal Provider Interface
// ============================================================================

export type TEmitirDocumentoInput = {
	venda: TSaleEntity & { itens: TSaleItemEntity[] };
	tipo: TFiscalDocumentTypeEnum;
	organizacao: TOrganizationEntity;
	lancamentoContabilId?: string;
};

export type TEmitirDocumentoResult = {
	documentoId: string;
	chaveAcesso?: string;
	numero?: string;
	serie?: string;
	protocolo?: string;
	status: TFiscalDocumentStatusEnum;
};

export type TCancelarDocumentoResult = {
	documentoId: string;
	status: TFiscalDocumentStatusEnum;
};

export interface IFiscalProvider {
	/**
	 * Emit a fiscal document (NFCe, NFe, NFSe) for a sale.
	 */
	emitirDocumento(input: TEmitirDocumentoInput): Promise<TEmitirDocumentoResult>;

	/**
	 * Check the current status of a fiscal document.
	 */
	consultarStatus(documentoId: string): Promise<TFiscalDocumentStatusEnum>;

	/**
	 * Cancel an emitted fiscal document.
	 */
	cancelarDocumento(documentoId: string, motivo: string): Promise<TCancelarDocumentoResult>;
}
