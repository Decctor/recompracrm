import { STORE_CREDIT_METHOD } from "@/lib/finances/store-credit/constants";
import { NON_EDITABLE_PAYMENT_STATUSES, toDateOrNull } from "@/lib/sales/utils";

type DeliveryCoverageTransaction = {
	id: string;
	valor: number;
	tipo?: string | null;
	metodo: string;
	dataEfetivacao?: Date | string | null;
	provedorStatus?: string | null;
};

/**
 * Quanto do total da venda está resolvido para a entrega.
 *
 * Fiado em aberto é pagamento combinado para depois: cobre a entrega e nunca é efetivado por ela,
 * só pelo recebimento de fiado (`lib/finances/store-credit/receive.ts`). Antes desta regra, "receber
 * e entregar" efetivava o fiado junto com os demais pendentes e a venda aparecia como paga sem que
 * ninguém tivesse recebido nada.
 *
 * Client-safe: o quadro de pedidos usa a mesma regra para decidir o que perguntar.
 */
export function resolveDeliveryPaymentCoverage<T extends DeliveryCoverageTransaction>({
	transactions,
	saleTotal,
}: {
	transactions: T[];
	saleTotal: number;
}) {
	const active = transactions.filter(
		(transaction) => (transaction.tipo ? transaction.tipo === "ENTRADA" : true) && !NON_EDITABLE_PAYMENT_STATUSES.has(transaction.provedorStatus ?? ""),
	);
	const isSettled = (transaction: T) => toDateOrNull(transaction.dataEfetivacao) != null;
	const openStoreCredit = active.filter((transaction) => !isSettled(transaction) && transaction.metodo === STORE_CREDIT_METHOD);
	const toSettle = active.filter((transaction) => !isSettled(transaction) && transaction.metodo !== STORE_CREDIT_METHOD);

	// Em centavos: a soma de parcelas em ponto flutuante não pode deixar a venda "quase coberta".
	const cents = (items: T[]) => items.reduce((total, transaction) => total + Math.round(transaction.valor * 100), 0);
	const settledCents = cents(active.filter(isSettled));
	const openStoreCreditCents = cents(openStoreCredit);
	const toSettleCents = cents(toSettle);
	const saleTotalCents = Math.round(saleTotal * 100);

	return {
		valorEfetivado: settledCents / 100,
		valorFiadoEmAberto: openStoreCreditCents / 100,
		valorAReceber: toSettleCents / 100,
		/** Pendentes que "receber e entregar" efetiva — nunca inclui fiado. */
		transacoesAReceber: toSettle,
		/** Entrega liberada sem receber nada: efetivado + fiado em aberto já fecham o total. */
		isCovered: saleTotalCents <= 0 || settledCents + openStoreCreditCents >= saleTotalCents,
		/** Efetivar os pendentes fecha o total (pré-condição de "receber e entregar"). */
		isCoverableBySettling: saleTotalCents <= 0 || settledCents + openStoreCreditCents + toSettleCents >= saleTotalCents,
	};
}
