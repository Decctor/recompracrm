import type { TPaymentMethodEnum } from "@/schemas/enums";
import { isSaleChangeTransaction } from "@/lib/sales/sale-change";

export type TSessionExpectedByMethod = {
	metodo: TPaymentMethodEnum;
	valorEsperado: number;
	entradas: number;
	troco: number;
	outrasSaidas: number;
	/**
	 * Parte das `entradas` ainda sem `dataEfetivacao`: fiado, boleto e cobrança na maquininha que
	 * o terminal ainda não aprovou. Continua dentro do esperado (o recebível do turno é o que foi
	 * vendido), mas a conferência precisa saber quanto desse valor ainda não entrou de fato.
	 */
	pendenteEfetivacao: number;
};

type TSessionTransaction = {
	metodo: TPaymentMethodEnum;
	tipo: string;
	valor: number;
	modificadoresMetadata?: { origem?: string | null } | null;
	dataEfetivacao?: Date | string | null;
};

/** Ledger da sessão: preserva movimentos originais, pois estornos são saídas separadas. */
export function summarizeSessionTransactions(rows: TSessionTransaction[], saldoInicial: number): TSessionExpectedByMethod[] {
	const byMethod = new Map<TPaymentMethodEnum, { entradas: number; troco: number; outrasSaidas: number; pendenteEfetivacao: number }>();
	// Mesmo sem movimento ou fundo inicial, a gaveta precisa ser contada.
	byMethod.set("DINHEIRO", { entradas: 0, troco: 0, outrasSaidas: 0, pendenteEfetivacao: 0 });
	for (const row of rows) {
		const totals = byMethod.get(row.metodo) ?? { entradas: 0, troco: 0, outrasSaidas: 0, pendenteEfetivacao: 0 };
		const cents = Math.round(row.valor * 100);
		if (row.tipo === "ENTRADA") {
			totals.entradas += cents;
			if (row.dataEfetivacao === null) totals.pendenteEfetivacao += cents;
		} else if (isSaleChangeTransaction(row)) totals.troco += cents;
		else totals.outrasSaidas += cents;
		byMethod.set(row.metodo, totals);
	}
	return Array.from(byMethod, ([metodo, totals]) => ({
		metodo,
		valorEsperado: ((metodo === "DINHEIRO" ? Math.round(saldoInicial * 100) : 0) + totals.entradas - totals.troco - totals.outrasSaidas) / 100,
		entradas: totals.entradas / 100,
		troco: totals.troco / 100,
		outrasSaidas: totals.outrasSaidas / 100,
		pendenteEfetivacao: totals.pendenteEfetivacao / 100,
	}));
}
