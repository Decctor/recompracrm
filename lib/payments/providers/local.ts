import { db } from "@/services/drizzle";
import { financialTransactions } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import type { IPaymentProvider, TPaymentIntentResult, TProcessPaymentsInput, TRefundResult } from "../types";

/**
 * LocalPaymentProvider — records payments directly in the DB.
 * No external API calls, no webhooks.
 * Payments are immediately marked as effective (efetivado).
 */
export class LocalPaymentProvider implements IPaymentProvider {
	async processPayments(input: TProcessPaymentsInput): Promise<TPaymentIntentResult[]> {
		const results: TPaymentIntentResult[] = [];

		for (const pagamento of input.pagamentos) {
			const now = new Date();

			const [inserted] = await db
				.insert(financialTransactions)
				.values({
					organizacaoId: input.organizacaoId,
					lancamentoContabilId: input.lancamentoContabilId,
					titulo: `Pagamento via ${pagamento.metodo} - Venda`,
					tipo: "ENTRADA",
					valor: pagamento.valor,
					metodo: pagamento.metodo,
					dataPrevisao: now,
					dataEfetivacao: now,
					parcela: pagamento.parcela ?? null,
					totalParcelas: pagamento.totalParcelas ?? null,
					provedorReferencia: null,
					provedorStatus: "APROVADO",
					autorId: input.autorId,
				})
				.returning({ id: financialTransactions.id });

			results.push({
				transacaoId: inserted.id,
				provedorReferencia: null,
				provedorStatus: "APROVADO",
				efetivado: true,
			});
		}

		return results;
	}

	async refundPayment(transacaoId: string, _valor?: number): Promise<TRefundResult> {
		// For local provider, mark the original transaction as refunded
		await db
			.update(financialTransactions)
			.set({ provedorStatus: "ESTORNADO" })
			.where(eq(financialTransactions.id, transacaoId));

		return {
			provedorReferencia: null,
			provedorStatus: "ESTORNADO",
		};
	}

	async getPaymentStatus(_provedorReferencia: string): Promise<string> {
		// Local payments are always approved immediately
		return "APROVADO";
	}
}
