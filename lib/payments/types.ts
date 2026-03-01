import type { TPaymentMethodEnum } from "@/schemas/enums";

// ============================================================================
// Payment Split — represents a single payment method in a sale
// ============================================================================

export type TPaymentSplit = {
	metodo: TPaymentMethodEnum;
	valor: number;
	parcela?: number;
	totalParcelas?: number;
};

// ============================================================================
// Payment Provider Interface
// ============================================================================

export type TProcessPaymentsInput = {
	vendaId: string;
	lancamentoContabilId: string;
	organizacaoId: string;
	pagamentos: TPaymentSplit[];
	autorId: string;
};

export type TPaymentIntentResult = {
	transacaoId: string;
	provedorReferencia: string | null;
	provedorStatus: string;
	efetivado: boolean;
};

export type TRefundResult = {
	provedorReferencia: string | null;
	provedorStatus: string;
};

export interface IPaymentProvider {
	/**
	 * Process all payment splits for a sale.
	 * Creates financialTransaction records for each split.
	 */
	processPayments(input: TProcessPaymentsInput): Promise<TPaymentIntentResult[]>;

	/**
	 * Refund a specific financial transaction (full or partial).
	 */
	refundPayment(transacaoId: string, valor?: number): Promise<TRefundResult>;

	/**
	 * Check the status of a payment via its provider reference.
	 */
	getPaymentStatus(provedorReferencia: string): Promise<string>;
}
