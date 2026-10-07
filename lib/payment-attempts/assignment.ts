import type { TPaymentSplit } from "@/lib/payments/types";
import { PaymentTerminalError } from "./errors";
import { PAYMENT_TERMINAL_METHODS } from "./create-assigned";

export type TPaymentTerminalAssignment = {
	index: number;
	dispositivoId: string;
	payment: TPaymentSplit;
};

const AMOUNT_TOLERANCE = 0.01;

// Regras do MVP para atribuir uma cobrança ao terminal (docs/10, decisão 4): um único pagamento,
// em cartão, cobrindo o total da venda. Split misto fica para depois do happy path. O pagamento
// atribuído é normalizado como PENDENTE: a transação só efetiva quando a maquininha aprovar.
export function resolvePaymentTerminalAssignment({ payments, saleTotal }: { payments: TPaymentSplit[]; saleTotal: number }): TPaymentTerminalAssignment | null {
	const assigned = payments.map((payment, index) => ({ payment, index })).filter(({ payment }) => Boolean(payment.dispositivoId));
	if (assigned.length === 0) return null;
	if (assigned.length > 1) {
		throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "Apenas um pagamento pode ser cobrado na maquininha por venda.");
	}
	if (payments.length > 1) {
		throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "A cobrança na maquininha exige um único pagamento cobrindo o total da venda, sem divisão com outros métodos.");
	}
	const [{ payment, index }] = assigned;
	if (!(PAYMENT_TERMINAL_METHODS as readonly string[]).includes(payment.metodo)) {
		throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "A maquininha só executa cobranças em cartão de débito ou crédito.");
	}
	if (Math.abs(payment.valor - saleTotal) > AMOUNT_TOLERANCE) {
		throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "O pagamento na maquininha precisa cobrir exatamente o total da venda.");
	}
	return { index, dispositivoId: payment.dispositivoId as string, payment };
}

// A confirmação persiste o pagamento atribuído como pendente, sem data futura: a previsão é "agora,
// assim que a maquininha aprovar".
export function normalizePaymentsForTerminal(payments: TPaymentSplit[]): TPaymentSplit[] {
	return payments.map((payment) => (payment.dispositivoId ? { ...payment, efetivacaoTipo: "PENDENTE", dataPrevisao: new Date() } : payment));
}
