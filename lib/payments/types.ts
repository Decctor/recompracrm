import type { TPaymentMethodEnum } from "@/schemas/enums";
import type { DBTransaction } from "@/services/drizzle";

export type TPaymentSplit = {
	metodo: TPaymentMethodEnum;
	valor: number;
	totalParcelas?: number;
	efetivacaoTipo: "IMEDIATA" | "PENDENTE";
	dataPrevisao?: string | Date | null;
	observacoes?: string | null;
	// Conta já resolvida (escolha do operador ou padrão do método) — ver resolvePaymentFinancialAccounts.
	contaFinanceiraId?: string | null;
};

export type TProcessPaymentsInput = {
	vendaId: string;
	lancamentoContabilId: string;
	organizacaoId: string;
	pagamentos: TPaymentSplit[];
	autorId: string | null;
	// Sessão de venda que recortou estes pagamentos (nullable). Carimbada em cada financialTransaction.
	sessaoVendaId?: string | null;
	// Título da venda para compor os títulos das transações (ex.: "VENDA - JOÃO - R$ 25,00 - 08/09 18:51").
	saleLabel?: string | null;
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
	processPayments(input: TProcessPaymentsInput, tx: DBTransaction): Promise<TPaymentIntentResult[]>;
	refundPayment(transacaoId: string, valor?: number): Promise<TRefundResult>;
	getPaymentStatus(provedorReferencia: string): Promise<string>;
}
