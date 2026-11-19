import { centsToMoney, moneyToCents } from "@/lib/purchase/costing";
import type { TPurchaseCancellationTransactionResolutionEnum } from "@/schemas/enums";

/**
 * Regras do cancelamento de compra, sem banco (a tela usa para a prévia, a rota para executar).
 *
 * Cancelar uma compra estorna o lançamento contábil inteiro e decide, parcela a parcela, o que acontece
 * com o dinheiro:
 *
 * | Parcela  | Opções                                                                               |
 * | -------- | ------------------------------------------------------------------------------------ |
 * | Pendente | CANCELAR — deixa de ser devida · MANTER — continua devida (multa, valor negociado)    |
 * | Paga     | DEVOLUCAO — o fornecedor devolve, vira entrada prevista · PERDA — o valor não volta  |
 *
 * O que fica com a organização sem contrapartida (parcelas MANTER e PERDA) é o custo do cancelamento:
 * o estorno não o devolve a Fornecedores e o reconhece na conta de perda escolhida
 * (`buildReversalAccountingEntryLines` com `retained`). Assim a DRE mostra exatamente o que o
 * cancelamento custou, e o resto da compra some dela.
 */

export type TPurchaseCancellationTransaction = {
	id: string;
	valor: number;
	dataEfetivacao: Date | string | null;
	dataCancelamento?: Date | string | null;
};

export const PURCHASE_CANCELLATION_PENDING_RESOLUTIONS: readonly TPurchaseCancellationTransactionResolutionEnum[] = ["CANCELAR", "MANTER"];
export const PURCHASE_CANCELLATION_PAID_RESOLUTIONS: readonly TPurchaseCancellationTransactionResolutionEnum[] = ["DEVOLUCAO", "PERDA"];

export const PURCHASE_CANCELLATION_RESOLUTION_LABELS: Record<TPurchaseCancellationTransactionResolutionEnum, { label: string; description: string }> = {
	CANCELAR: { label: "Cancelar", description: "Deixa de ser devida e sai de contas a pagar." },
	MANTER: { label: "Manter", description: "Continua devida (multa, valor negociado). Fica como custo do cancelamento." },
	DEVOLUCAO: { label: "Devolução a receber", description: "O fornecedor devolve o valor: vira uma entrada prevista." },
	PERDA: { label: "Assumir como perda", description: "O valor não volta e fica como custo do cancelamento." },
};

export function isTransactionPaid(transaction: Pick<TPurchaseCancellationTransaction, "dataEfetivacao">) {
	return transaction.dataEfetivacao != null;
}

/** Parcelas que o cancelamento precisa resolver: as que ainda valem (canceladas antes ficam de fora). */
export function getResolvableTransactions<T extends TPurchaseCancellationTransaction>(transactions: T[]) {
	return transactions.filter((transaction) => transaction.dataCancelamento == null);
}

/** Sugestão inicial: parcela pendente é cancelada; paga, o fornecedor devolve. */
export function getDefaultCancellationResolution(transaction: Pick<TPurchaseCancellationTransaction, "dataEfetivacao">) {
	return isTransactionPaid(transaction) ? ("DEVOLUCAO" as const) : ("CANCELAR" as const);
}

export type TPurchaseCancellationPlan = {
	/** Pendentes que deixam de ser devidas. */
	cancelTransactionIds: string[];
	/** Pagas que o fornecedor devolve: cada uma vira uma entrada prevista. */
	refundTransactionIds: string[];
	valorCancelado: number;
	valorMantido: number;
	valorDevolucao: number;
	valorPerda: number;
	/** MANTER + PERDA: o que o estorno reconhece como custo do cancelamento. */
	valorRetido: number;
};

/**
 * Valida as resoluções contra o estado de cada parcela e soma os efeitos. Toda parcela que ainda vale
 * precisa de uma resolução compatível: pendente só pode ser cancelada ou mantida; paga, devolvida ou
 * assumida como perda.
 */
export function planPurchaseCancellation({
	transactions,
	resolutions,
}: {
	transactions: TPurchaseCancellationTransaction[];
	resolutions: Map<string, TPurchaseCancellationTransactionResolutionEnum>;
}): TPurchaseCancellationPlan {
	const resolvable = getResolvableTransactions(transactions);
	const resolvableIds = new Set(resolvable.map((transaction) => transaction.id));
	for (const id of resolutions.keys())
		if (!resolvableIds.has(id)) throw new Error("Uma das parcelas informadas não pertence a esta compra ou já foi cancelada.");

	const plan: TPurchaseCancellationPlan = {
		cancelTransactionIds: [],
		refundTransactionIds: [],
		valorCancelado: 0,
		valorMantido: 0,
		valorDevolucao: 0,
		valorPerda: 0,
		valorRetido: 0,
	};
	const cents = { cancelado: 0, mantido: 0, devolucao: 0, perda: 0 };

	for (const transaction of resolvable) {
		const resolution = resolutions.get(transaction.id);
		if (!resolution) throw new Error("Defina o que fazer com cada parcela da compra.");
		const paid = isTransactionPaid(transaction);
		const allowed = paid ? PURCHASE_CANCELLATION_PAID_RESOLUTIONS : PURCHASE_CANCELLATION_PENDING_RESOLUTIONS;
		if (!allowed.includes(resolution))
			throw new Error(
				paid
					? "Uma parcela paga só pode ser devolvida pelo fornecedor ou assumida como perda."
					: "Uma parcela pendente só pode ser cancelada ou mantida.",
			);
		const valueCents = moneyToCents(transaction.valor);
		switch (resolution) {
			case "CANCELAR":
				plan.cancelTransactionIds.push(transaction.id);
				cents.cancelado += valueCents;
				break;
			case "MANTER":
				cents.mantido += valueCents;
				break;
			case "DEVOLUCAO":
				plan.refundTransactionIds.push(transaction.id);
				cents.devolucao += valueCents;
				break;
			case "PERDA":
				cents.perda += valueCents;
				break;
		}
	}

	plan.valorCancelado = centsToMoney(cents.cancelado);
	plan.valorMantido = centsToMoney(cents.mantido);
	plan.valorDevolucao = centsToMoney(cents.devolucao);
	plan.valorPerda = centsToMoney(cents.perda);
	plan.valorRetido = centsToMoney(cents.mantido + cents.perda);
	return plan;
}
