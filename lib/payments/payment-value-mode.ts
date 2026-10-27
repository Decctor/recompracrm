import type { TPaymentValueModeEnum } from "@/schemas/enums";

// Valor dos pagamentos do checkout: RESTANTE ou FIXO (ver PaymentValueModeEnum).
//
// O clique em "PIX" quer dizer "o restante vai no PIX", não "PIX de R$ 189,90". Guardar o número
// congelava a intenção: um desconto lançado depois deixava o pagamento acima do total e o excesso
// virava troco. Aqui a intenção é guardada e o valor é derivado na leitura, como o ajuste
// percentual (lib/sales/sale-adjustments.ts): nenhuma mudança do total precisa lembrar dos
// pagamentos.
//
// Invariante: no máximo um pagamento RESTANTE, e ele absorve qualquer diferença. FIXO não muda
// sozinho; no dinheiro ele é a nota entregue, e o excesso é troco de verdade.

type TValueModedPayment = { valor: number; valorModo: TPaymentValueModeEnum };

const PAYMENT_TOLERANCE = 0.01;
const roundCents = (value: number) => Math.round(value * 100) / 100;

/** Índice do pagamento que absorve a diferença. Mais de um RESTANTE (dado corrompido): vale o primeiro. */
function findRemainingIndex(payments: TValueModedPayment[]) {
	return payments.findIndex((payment) => payment.valorModo === "RESTANTE");
}

/**
 * Deriva o valor do pagamento RESTANTE: o total a cobrar menos os demais. Devolve o mesmo array
 * quando nada muda, para quem memoiza sobre o estado não re-renderizar à toa.
 */
export function resolvePaymentValues<T extends TValueModedPayment>(payments: T[], totalToCollect: number): T[] {
	const remainingIndex = findRemainingIndex(payments);
	if (remainingIndex === -1) return payments;
	const others = payments.reduce((sum, payment, index) => (index === remainingIndex ? sum : sum + payment.valor), 0);
	const valor = roundCents(Math.max(0, totalToCollect - others));
	if (payments[remainingIndex].valor === valor) return payments;
	return payments.map((payment, index) => (index === remainingIndex ? { ...payment, valor } : payment));
}

/** Pagamento novo cobre o restante só se nenhum outro já cobre; senão nasce FIXO, pronto para digitar. */
export function nextPaymentValueMode(payments: TValueModedPayment[]): TPaymentValueModeEnum {
	return findRemainingIndex(payments) === -1 ? "RESTANTE" : "FIXO";
}

/**
 * Promove um pagamento a RESTANTE. O que cobria o restante antes vira FIXO com o valor que estava
 * mostrando, para nada saltar na tela. `payments` precisa vir resolvido (valores derivados).
 */
export function promotePaymentToRemaining<T extends TValueModedPayment>(payments: T[], isTarget: (payment: T) => boolean): T[] {
	return payments.map((payment) => {
		if (isTarget(payment)) return payment.valorModo === "RESTANTE" ? payment : { ...payment, valorModo: "RESTANTE" };
		return payment.valorModo === "RESTANTE" ? { ...payment, valorModo: "FIXO" } : payment;
	});
}

/**
 * Pagamentos que de fato cobram algo. Zerado não carrega dinheiro: é o RESTANTE quando os demais já
 * cobrem tudo, ou o FIXO recém-adicionado que ainda não foi digitado. A cobertura do total segue
 * conferida pela soma, então descartá-los nunca deixa a venda descoberta.
 */
export function getPaymentsToCharge<T extends Pick<TValueModedPayment, "valor">>(payments: T[]): T[] {
	return payments.filter((payment) => payment.valor > PAYMENT_TOLERANCE);
}

/**
 * Excesso que não é troco (cartão, PIX acima do total): quando um único pagamento FIXO fora do
 * dinheiro pode absorvê-lo, devolve-o com o valor que ele passaria a ter. Dinheiro fica de fora: nele
 * o excesso é a nota entregue, e o troco é legítimo.
 */
export function resolveExcessAdjustment<T extends TValueModedPayment & { metodo: string }>(
	payments: T[],
	excess: number,
): { payment: T; valor: number } | null {
	if (excess <= PAYMENT_TOLERANCE) return null;
	const candidates = getPaymentsToCharge(payments).filter((payment) => payment.valorModo === "FIXO" && payment.metodo !== "DINHEIRO");
	if (candidates.length !== 1) return null;
	const valor = roundCents(candidates[0].valor - excess);
	return valor > PAYMENT_TOLERANCE ? { payment: candidates[0], valor } : null;
}
