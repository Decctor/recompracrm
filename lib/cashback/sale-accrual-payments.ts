import { type TAccrualPayment, computePaymentAccrualBase } from "@/lib/cashback/payment-accrual";
import { isSaleChangeTransaction } from "@/lib/sales/sale-change";
import type { TCashbackPaymentAccrualRules } from "@/schemas/cashback-programs";
import type { DBTransaction } from "@/services/drizzle";
import createHttpError from "http-errors";

const REVERSED_PROVIDER_STATUSES = new Set(["CANCELADO", "ESTORNADO"]);

/**
 * Pagamentos de uma venda interna (PDV, loja, comanda) no formato das regras de acúmulo: as
 * ENTRADAs vivas, com a efetivação como quitação, e o troco como linha negativa de dinheiro (o PDV
 * grava o valor entregue e devolve o excesso numa SAÍDA marcada `origem = TROCO`). As demais SAÍDAs
 * da venda (estornos) não são pagamento.
 *
 * `tx` quando a leitura acontece dentro de uma transação aberta: os pagamentos recém-criados pela
 * confirmação só existem nela.
 */
export async function loadSaleAccrualPayments({
	executor,
	organizationId,
	saleId,
}: {
	executor: Pick<DBTransaction, "query">;
	organizationId: string;
	saleId: string;
}): Promise<TAccrualPayment[]> {
	const sale = await executor.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, saleId), eq(fields.organizacaoId, organizationId)),
		columns: { id: true },
		with: {
			lancamentosContabeis: {
				columns: { id: true },
				with: {
					transacoesFinanceiras: {
						columns: { valor: true, tipo: true, metodo: true, dataEfetivacao: true, provedorStatus: true, modificadoresMetadata: true },
					},
				},
			},
		},
	});
	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");

	const payments: TAccrualPayment[] = [];
	for (const transaction of sale.lancamentosContabeis.flatMap((entry) => entry.transacoesFinanceiras)) {
		if (REVERSED_PROVIDER_STATUSES.has(transaction.provedorStatus ?? "")) continue;
		if (transaction.tipo === "ENTRADA") {
			payments.push({ metodo: transaction.metodo, valor: transaction.valor, quitadoEm: transaction.dataEfetivacao ?? null });
		} else if (isSaleChangeTransaction(transaction)) {
			payments.push({ metodo: transaction.metodo, valor: -transaction.valor, quitadoEm: transaction.dataEfetivacao ?? null });
		}
	}
	return payments;
}

/**
 * Base de acúmulo de uma venda interna já pontuada ou prestes a pontuar fora do fluxo normal
 * (edição de valor, reatribuição de cliente). `null` = venda sem pagamentos registrados (ex.: venda
 * de integração): quem chama usa o total, como antes das regras.
 */
export async function computeInternalSaleAccrualBase({
	executor,
	organizationId,
	saleId,
	saleTotal,
	rules,
}: {
	executor: Pick<DBTransaction, "query">;
	organizationId: string;
	saleId: string;
	saleTotal: number;
	rules: TCashbackPaymentAccrualRules | null | undefined;
}) {
	const payments = await loadSaleAccrualPayments({ executor, organizationId, saleId });
	if (payments.length === 0) return null;
	return computePaymentAccrualBase({ saleTotal, payments, rules }).base;
}
