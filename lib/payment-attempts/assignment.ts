import type { TPaymentSplit } from "@/lib/payments/types";
import { PaymentTerminalError } from "./errors";
import { PAYMENT_TERMINAL_METHODS } from "./create-assigned";

export type TPaymentTerminalAssignment = {
	index: number;
	dispositivoId: string;
	payment: TPaymentSplit;
};

const AMOUNT_TOLERANCE = 0.01;
/** Cartões cobrados um depois do outro na mesma maquininha: o balcão raramente divide em mais. */
export const MAX_TERMINAL_LEGS_PER_SALE = 4;

/**
 * Pernas da venda cobradas na maquininha. Cada perna em cartão com `dispositivoId` vira uma
 * tentativa própria, vinculada à sua transação pendente, e as pernas se combinam com dinheiro,
 * Pix, fiado e outras formas: o que a maquininha cobra é a parte de cada cartão, não o total.
 *
 * Regras: só cartão vai para a maquininha; todas as pernas na mesma maquininha (o app cobra uma
 * depois da outra); cartão nunca passa do total — excesso só sai do dinheiro, como troco.
 */
export function resolvePaymentTerminalAssignments({
	payments,
	saleTotal,
}: {
	payments: TPaymentSplit[];
	saleTotal: number;
}): TPaymentTerminalAssignment[] {
	const assigned = payments.map((payment, index) => ({ payment, index })).filter(({ payment }) => Boolean(payment.dispositivoId));
	if (assigned.length === 0) return [];
	if (assigned.length > MAX_TERMINAL_LEGS_PER_SALE) {
		throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", `A venda aceita até ${MAX_TERMINAL_LEGS_PER_SALE} cobranças na maquininha.`);
	}
	const devices = new Set(assigned.map(({ payment }) => payment.dispositivoId));
	if (devices.size > 1) {
		throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "As cobranças em cartão de uma venda vão para a mesma maquininha.");
	}
	for (const { payment } of assigned) {
		if (!(PAYMENT_TERMINAL_METHODS as readonly string[]).includes(payment.metodo)) {
			throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "A maquininha só executa cobranças em cartão de débito ou crédito.");
		}
		if (!Number.isFinite(payment.valor) || payment.valor <= 0) {
			throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "Cada cobrança na maquininha precisa de valor maior que zero.");
		}
	}
	const cardTotal = assigned.reduce((sum, { payment }) => sum + payment.valor, 0);
	if (cardTotal > saleTotal + AMOUNT_TOLERANCE) {
		throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "O cartão não pode passar do total da venda: o troco só sai do dinheiro.");
	}
	return assigned.map(({ payment, index }) => ({ index, dispositivoId: payment.dispositivoId as string, payment }));
}

// A confirmação persiste o pagamento atribuído como pendente, sem data futura: a previsão é "agora,
// assim que a maquininha aprovar".
export function normalizePaymentsForTerminal(payments: TPaymentSplit[]): TPaymentSplit[] {
	return payments.map((payment) => (payment.dispositivoId ? { ...payment, efetivacaoTipo: "PENDENTE", dataPrevisao: new Date() } : payment));
}
