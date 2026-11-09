import { accumulateCashbackForClient, notReversedByClientReassignment } from "@/lib/cashback/accumulation";
import { hasCashbackPaymentAccrualRules, resolveSaleAccrual } from "@/lib/cashback/payment-accrual";
import { loadSaleAccrualPayments } from "@/lib/cashback/sale-accrual-payments";
import { db } from "@/services/drizzle";
import { cashbackProgramTransactions, cashbackPrograms } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { getSaleFinancialState } from "./get-sale-financial-state";
import { captureSaleCampaignEvent } from "@/lib/campaigns/events/handlers/sale-capture";
import { publishPendingCampaignEventsSafely } from "@/lib/campaigns/events/queue";
import { waitUntil } from "@vercel/functions";

/**
 * Acúmulo adiado de uma venda interna (loja, fiado recebido, pagamento efetivado depois da
 * confirmação). Chamado a cada evento que pode tornar a venda pontuável; idempotente por venda.
 *
 * - Programa sem regras por forma de pagamento: pontua o total quando a venda fica RECEBIDA
 *   (comportamento anterior às regras).
 * - Com regras: `resolveSaleAccrual` sobre os pagamentos da venda, exigindo que cubram o total.
 */
export async function processSaleCashbackAccumulationIfEligible({
	organizationId,
	saleId,
	authorId,
}: {
	organizationId: string;
	saleId: string;
	authorId?: string | null;
}) {
	const [sale, program] = await Promise.all([
		db.query.sales.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, saleId), eq(fields.organizacaoId, organizationId)),
			columns: {
				id: true,
				clienteId: true,
				valorTotal: true,
				vendedorId: true,
				canal: true,
				processamentoOrigem: true,
				statusVenda: true,
				dataVenda: true,
			},
		}),
		db.query.cashbackPrograms.findFirst({
			where: and(eq(cashbackPrograms.organizacaoId, organizationId), eq(cashbackPrograms.ativo, true)),
		}),
	]);

	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");
	if (!sale.clienteId || sale.statusVenda !== "CONFIRMADA" || !program) return null;
	const clientId = sale.clienteId;
	const usesPaymentRules = hasCashbackPaymentAccrualRules(program);

	if (!usesPaymentRules) {
		const financialState = await getSaleFinancialState({ organizationId, saleId });
		if (!financialState.isFullyPaid) return null;
	}

	const accumulation = await db.transaction(async (tx) => {
		// Do cliente ATUAL da venda: um acúmulo revertido por reatribuição (cliente anterior) não
		// conta — o novo dono ainda precisa acumular quando o pagamento se completar.
		const existing = await tx.query.cashbackProgramTransactions.findFirst({
			where: and(
				eq(cashbackProgramTransactions.organizacaoId, organizationId),
				eq(cashbackProgramTransactions.vendaId, saleId),
				eq(cashbackProgramTransactions.clienteId, clientId),
				eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
				notReversedByClientReassignment(),
			),
			columns: { id: true },
		});
		if (existing) return { transactionId: existing.id, alreadyProcessed: true };

		let accrualBase: number | null = null;
		let paymentRulesMetadata: Record<string, unknown> = {};
		if (usesPaymentRules) {
			const payments = await loadSaleAccrualPayments({ executor: tx, organizationId, saleId });
			const decision = resolveSaleAccrual({
				saleTotal: sale.valorTotal,
				saleDate: sale.dataVenda ?? new Date(),
				payments,
				rules: program.acumuloRegrasPagamento,
				requireCoverage: true,
			});
			if (decision.status !== "PONTUAVEL") return null;
			accrualBase = decision.base;
			paymentRulesMetadata = { regrasPagamento: { base: decision.base, metodos: decision.metodos } };
		}

		const result = await accumulateCashbackForClient({
			tx,
			orgId: organizationId,
			clientId,
			saleId,
			saleValue: sale.valorTotal,
			accrualBase,
			operatorId: authorId ?? null,
			operatorSellerId: sale.vendedorId,
			program,
			metadata: {
				origem: sale.canal ?? "INTERNO",
				processamentoOrigem: sale.processamentoOrigem,
				...paymentRulesMetadata,
			},
		});

		await captureSaleCampaignEvent({
			tx,
			organizationId,
			saleId,
			clientId,
			occurredAt: new Date(),
			accumulation: result,
			programId: program.id,
			type: "CASHBACK_ACUMULADO",
		});
		return { ...result, alreadyProcessed: false };
	});
	waitUntil(publishPendingCampaignEventsSafely({ organizationId, sourceType: "VENDA", sourceId: saleId }));
	return accumulation;
}
