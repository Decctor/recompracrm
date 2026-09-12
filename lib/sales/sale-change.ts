import type { TPaymentMethodEnum } from "@/schemas/enums";

/**
 * Troco do PDV — modelo "bruto entra, troco sai".
 *
 * Os pagamentos ficam registrados pelo valor ENTREGUE pelo cliente (R$ 50 em dinheiro numa venda de
 * R$ 37) e o troco vira uma transação de SAÍDA em DINHEIRO ligada ao mesmo lançamento da venda.
 * Assim o líquido do lançamento fecha com o valorTotal, o esperado de gaveta da sessão de caixa
 * (Σ ENTRADA − Σ SAÍDA por método) bate com o que está fisicamente na gaveta e o valor que a
 * maquininha realmente cobrou nunca é "recortado" para caber na venda.
 *
 * Este módulo é client-safe (sem banco): o PDV e o servidor aplicam as mesmas regras.
 */

export const SALE_CHANGE_TRANSACTION_ORIGIN = "TROCO";
export const SALE_CHANGE_TOLERANCE = 0.01;

const REVERSED_STATUSES = new Set(["CANCELADO", "ESTORNADO"]);

export type TSaleChangeablePayment = {
	metodo: TPaymentMethodEnum;
	valor: number;
	efetivacaoTipo?: "IMEDIATA" | "PENDENTE" | null;
	totalParcelas?: number | null;
};

export type TSaleChangeResolution = {
	// Excesso pago sobre o total (0 quando não há troco).
	troco: number;
	totalPagamentos: number;
	// Motivo (para o operador) quando o excesso NÃO pode virar troco.
	bloqueio: string | null;
	// Troco coberto por dinheiro recebido na hora — o caso normal. Falso = troco em dinheiro contra
	// pagamento em cartão/PIX, quase sempre erro de digitação: o PDV pede confirmação explícita.
	cobertoPorDinheiro: boolean;
};

function round2(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Só dinheiro recebido AGORA pode gerar troco. Previsto/fiado é dinheiro que ainda não entrou e o
 * cartão parcelado entra na agenda como PENDENTE mesmo com efetivação "imediata".
 */
export function isImmediateSalePayment(payment: TSaleChangeablePayment) {
	if ((payment.efetivacaoTipo ?? "IMEDIATA") !== "IMEDIATA") return false;
	if (payment.metodo === "CARTAO_CREDITO" && (payment.totalParcelas ?? 1) > 1) return false;
	return true;
}

export function resolveSaleChange({ payments, saleTotal }: { payments: TSaleChangeablePayment[]; saleTotal: number }): TSaleChangeResolution {
	const totalPagamentos = round2(payments.reduce((sum, payment) => sum + (Number.isFinite(payment.valor) ? payment.valor : 0), 0));
	const excesso = round2(totalPagamentos - Math.max(0, saleTotal));
	if (excesso <= SALE_CHANGE_TOLERANCE) {
		return { troco: 0, totalPagamentos, bloqueio: null, cobertoPorDinheiro: true };
	}

	const hasDeferredPayment = payments.some((payment) => payment.valor > 0 && !isImmediateSalePayment(payment));
	const bloqueio = hasDeferredPayment
		? "Pagamentos previstos, fiados ou parcelados não podem gerar troco. Ajuste os valores para fechar o total da venda."
		: null;

	const dinheiroImediato = payments
		.filter((payment) => payment.metodo === "DINHEIRO" && isImmediateSalePayment(payment))
		.reduce((sum, payment) => sum + payment.valor, 0);

	return {
		troco: excesso,
		totalPagamentos,
		bloqueio,
		cobertoPorDinheiro: dinheiroImediato + SALE_CHANGE_TOLERANCE >= excesso,
	};
}

export type TSaleChangeTransactionLike = {
	valor: number;
	tipo?: string | null;
	provedorStatus?: string | null;
	modificadoresMetadata?: { origem?: string | null } | null;
};

export function isSaleChangeTransaction(transaction: Pick<TSaleChangeTransactionLike, "tipo" | "modificadoresMetadata">) {
	return transaction.tipo === "SAIDA" && transaction.modificadoresMetadata?.origem === SALE_CHANGE_TRANSACTION_ORIGIN;
}

/** Troco vivo da venda: SAÍDAs de troco não canceladas/estornadas. */
export function getSaleChangeTotal(transactions: TSaleChangeTransactionLike[]) {
	return round2(
		transactions
			.filter((transaction) => isSaleChangeTransaction(transaction) && !REVERSED_STATUSES.has(transaction.provedorStatus ?? ""))
			.reduce((sum, transaction) => sum + transaction.valor, 0),
	);
}

/**
 * Troco vivo agrupado por método de devolução. O troco quase sempre sai em dinheiro, mas o método
 * vem da transação e não de uma suposição: é ele que diz de qual instrumento o valor saiu.
 */
export function groupSaleChangeByMethod<T extends TSaleChangeTransactionLike & { metodo: TPaymentMethodEnum }>(transactions: T[]) {
	const valorPorMetodo = new Map<TPaymentMethodEnum, number>();
	for (const transaction of transactions) {
		if (!isSaleChangeTransaction(transaction) || REVERSED_STATUSES.has(transaction.provedorStatus ?? "")) continue;
		valorPorMetodo.set(transaction.metodo, round2((valorPorMetodo.get(transaction.metodo) ?? 0) + transaction.valor));
	}
	return [...valorPorMetodo].map(([metodo, valor]) => ({ metodo, valor }));
}

/**
 * Visão dos pagamentos SEM o troco, para consumidores que precisam que a soma feche com o total
 * (documento fiscal: a Spedy não expõe vTroco, e pagamentos acima do vNF são a rejeição 866).
 * O troco sai primeiro do dinheiro; se sobrar (troco dado contra cartão), o resto é rateado
 * proporcionalmente entre os demais métodos, com o ajuste de centavos no último.
 */
export function netSaleChangeFromPayments<T extends { metodo: TPaymentMethodEnum; valor: number }>(payments: T[], troco: number): T[] {
	if (troco <= SALE_CHANGE_TOLERANCE) return payments;

	let remaining = round2(troco);
	const afterCash = payments.map((payment) => {
		if (payment.metodo !== "DINHEIRO" || remaining <= 0) return payment;
		const deduction = Math.min(payment.valor, remaining);
		remaining = round2(remaining - deduction);
		return { ...payment, valor: round2(payment.valor - deduction) };
	});
	if (remaining <= SALE_CHANGE_TOLERANCE) return afterCash.filter((payment) => payment.valor > 0);

	const others = afterCash.filter((payment) => payment.metodo !== "DINHEIRO");
	const othersTotal = others.reduce((sum, payment) => sum + payment.valor, 0);
	if (othersTotal <= 0) return afterCash.filter((payment) => payment.valor > 0);

	const target = round2(othersTotal - remaining);
	let allocated = 0;
	let index = 0;
	const result = afterCash.map((payment) => {
		if (payment.metodo === "DINHEIRO") return payment;
		index += 1;
		const valor = index === others.length ? round2(target - allocated) : round2((target * payment.valor) / othersTotal);
		allocated = round2(allocated + valor);
		return { ...payment, valor: Math.max(0, valor) };
	});
	return result.filter((payment) => payment.valor > 0);
}
