import { normalizeFinancialTransactionValue } from "@/lib/finances/financial-transaction-value";
import { getOrganizationPaymentMethodDefault } from "@/lib/payments/defaults";
import type { TPaymentSplit } from "@/lib/payments/types";
import { SALE_CHANGE_TRANSACTION_ORIGIN, resolveSaleChange } from "@/lib/sales/sale-change";
import type { DBTransaction } from "@/services/drizzle";
import { financialTransactions } from "@/services/drizzle/schema";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import createHttpError from "http-errors";

/**
 * Registra o troco de uma venda como SAÍDA em DINHEIRO no lançamento da venda (ver lib/sales/sale-change.ts).
 *
 * Roda depois dos pagamentos (que entram pelo valor entregue pelo cliente). Valida as regras de
 * troco — excesso só sobre pagamentos imediatos — e lança a saída carimbada com a sessão de caixa,
 * para que o esperado de gaveta desconte o troco entregue. Sem excesso, não faz nada.
 */
export async function registerSaleChangeTransaction({
	tx,
	organization,
	lancamentoContabilId,
	salePayments,
	saleTotal,
	sessaoVendaId,
	autorId,
}: {
	tx: DBTransaction;
	organization: Pick<TOrganizationEntity, "id" | "configuracao">;
	lancamentoContabilId: string;
	salePayments: TPaymentSplit[];
	saleTotal: number;
	sessaoVendaId?: string | null;
	autorId: string | null;
}) {
	const change = resolveSaleChange({ payments: salePayments, saleTotal });
	if (change.bloqueio) throw new createHttpError.BadRequest(change.bloqueio);
	if (change.troco <= 0) return null;

	// O troco sai da gaveta: conta do dinheiro escolhida pelo operador ou a padrão do método.
	const cashPayment = salePayments.find((payment) => payment.metodo === "DINHEIRO" && payment.contaFinanceiraId);
	const contaFinanceiraId =
		cashPayment?.contaFinanceiraId ??
		getOrganizationPaymentMethodDefault({ organizationConfig: organization.configuracao, metodo: "DINHEIRO" }).contaFinanceiraPadraoId ??
		null;

	const now = new Date();
	const [inserted] = await tx
		.insert(financialTransactions)
		.values({
			organizacaoId: organization.id,
			lancamentoContabilId,
			contaFinanceiraId,
			sessaoVendaId: sessaoVendaId ?? null,
			titulo: "Troco - Venda",
			tipo: "SAIDA",
			...normalizeFinancialTransactionValue({ valor: change.troco, modificadoresMetadata: { origem: SALE_CHANGE_TRANSACTION_ORIGIN } }),
			metodo: "DINHEIRO",
			dataPrevisao: now,
			dataEfetivacao: now,
			efetivacaoAutorId: autorId,
			efetivacaoOrigem: "IMEDIATA",
			parcela: null,
			totalParcelas: null,
			provedorReferencia: null,
			provedorStatus: "APROVADO",
			autorId,
		})
		.returning({ id: financialTransactions.id });

	return { transacaoId: inserted.id, valor: change.troco };
}
