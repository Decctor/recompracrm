import { accumulateCashbackForClient, notReversedByClientReassignment } from "@/lib/cashback/accumulation";
import { db } from "@/services/drizzle";
import { cashbackProgramTransactions, cashbackPrograms } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { getSaleFinancialState } from "./get-sale-financial-state";
import { captureSaleCampaignEvent } from "@/lib/campaigns/events/handlers/sale-capture";
import { publishPendingCampaignEventsSafely } from "@/lib/campaigns/events/queue";
import { waitUntil } from "@vercel/functions";

export async function processSaleCashbackAccumulationIfEligible({
	organizationId,
	saleId,
	authorId,
}: {
	organizationId: string;
	saleId: string;
	authorId?: string | null;
}) {
	const [sale, financialState] = await Promise.all([
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
			},
		}),
		getSaleFinancialState({ organizationId, saleId }),
	]);

	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");
	if (!sale.clienteId || sale.statusVenda !== "CONFIRMADA" || !financialState.isFullyPaid) return null;
	const clientId = sale.clienteId;

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

		const program = await tx.query.cashbackPrograms.findFirst({
			where: and(eq(cashbackPrograms.organizacaoId, organizationId), eq(cashbackPrograms.ativo, true)),
		});
		if (!program) return null;

		const result = await accumulateCashbackForClient({
			tx,
			orgId: organizationId,
			clientId,
			saleId,
			saleValue: sale.valorTotal,
			operatorId: authorId ?? null,
			operatorSellerId: sale.vendedorId,
			program,
			metadata: {
				origem: sale.canal ?? "INTERNO",
				processamentoOrigem: sale.processamentoOrigem,
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
