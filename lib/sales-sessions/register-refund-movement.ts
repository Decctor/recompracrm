import { financialTransactions } from "@/services/drizzle/schema";
import type { TransactionClient } from "./types";
import { normalizeFinancialTransactionValue } from "@/lib/finances/financial-transaction-value";

/**
 * Registra a saída de dinheiro de um estorno na sessão de venda atualmente aberta.
 *
 * Roda DENTRO da transação do cancelamento (recebe o `tx`) e ancora a saída no lançamento de estorno
 * já criado. Carimba `sessaoVendaId` para que o estorno reflita na gaveta da sessão corrente — nunca
 * na sessão original (que pode estar fechada/imutável).
 *
 * Só métodos de gaveta (DINHEIRO) geram saída física; demais métodos permanecem como ajuste de
 * recebível no provider.
 */
export async function registerRefundCashMovement({
	tx,
	orgId,
	sessaoVendaId,
	lancamentoContabilId,
	valorDinheiro,
	contaFinanceiraId,
	autorId,
	titulo,
	origem,
}: {
	tx: TransactionClient;
	orgId: string;
	sessaoVendaId: string;
	lancamentoContabilId: string;
	valorDinheiro: number;
	contaFinanceiraId: string | null;
	autorId: string | null;
	titulo: string;
	/** Origem carimbada na SAIDA (ex.: estorno de parcial de conta). Nunca TROCO. */
	origem?: string | null;
}) {
	if (valorDinheiro <= 0) return null;

	const [transaction] = await tx
		.insert(financialTransactions)
		.values({
			organizacaoId: orgId,
			lancamentoContabilId,
			contaFinanceiraId,
			sessaoVendaId,
			titulo,
			tipo: "SAIDA",
			...normalizeFinancialTransactionValue({ valor: valorDinheiro, modificadoresMetadata: origem ? { origem } : null }),
			metodo: "DINHEIRO",
			dataPrevisao: new Date(),
			dataEfetivacao: new Date(),
			provedorStatus: "ESTORNADO",
			autorId,
		})
		.returning({ id: financialTransactions.id });

	return transaction?.id ?? null;
}
