import { getFiscalProvider } from "@/lib/fiscal";
import { getPaymentProvider, type TPaymentSplit } from "@/lib/payments";
import { db } from "@/services/drizzle";
import { sales, saleItems } from "@/services/drizzle/schema";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { createAccountingEntry } from "./create-accounting-entry";
import { processStockDeduction } from "./process-stock-deduction";

type ProcessSaleConfirmationInput = {
	vendaId: string;
	pagamentos: TPaymentSplit[];
	autorId: string;
	organizacao: TOrganizationEntity;
	// Accounting entry target accounts (must be configured per organization)
	contaDebitoId: string;
	contaCreditoId: string;
};

/**
 * Orchestrator for confirming a sale (ORCAMENTO → CONFIRMADA).
 *
 * Steps (transactional):
 * 1. Update sale status to CONFIRMADA
 * 2. Create accounting entry
 * 3. Process payments via provider → creates financial transactions
 * 4. Deduct stock
 *
 * Step (async, post-transaction):
 * 5. Fiscal emission if org has automatic emission enabled
 */
export async function processSaleConfirmation(input: ProcessSaleConfirmationInput) {
	// Load the sale with its items
	const sale = await db.query.sales.findFirst({
		where: (fields, { eq }) => eq(fields.id, input.vendaId),
		with: {
			itens: true,
		},
	});

	if (!sale) {
		throw new createHttpError.NotFound("Venda não encontrada.");
	}

	if (sale.status !== "ORCAMENTO") {
		throw new createHttpError.BadRequest(`Venda não pode ser confirmada no status atual: ${sale.status}`);
	}

	// Transactional processing
	const transactionResult = await db.transaction(async (tx) => {
		// 1. Update sale status: ORCAMENTO → CONFIRMADA
		await tx
			.update(sales)
			.set({
				status: "CONFIRMADA",
				natureza: "SN01",
				dataVenda: new Date(),
			})
			.where(eq(sales.id, input.vendaId));

		// 2. Create accounting entry
		const entry = await createAccountingEntry(tx, {
			organizacaoId: input.organizacao.id,
			vendaId: input.vendaId,
			valor: sale.valorTotal,
			titulo: `Venda #${sale.idExterno}`,
			idContaDebito: input.contaDebitoId,
			idContaCredito: input.contaCreditoId,
			autorId: input.autorId,
		});

		// 3. Process stock deduction
		await processStockDeduction(tx, {
			organizacaoId: input.organizacao.id,
			vendaId: input.vendaId,
			itens: sale.itens,
			operadorId: input.autorId,
		});

		return { entry };
	});

	// 4. Process payments via provider (outside tx because providers may make external calls)
	const paymentProvider = getPaymentProvider(input.organizacao);
	const paymentResults = await paymentProvider.processPayments({
		vendaId: input.vendaId,
		lancamentoContabilId: transactionResult.entry.id,
		organizacaoId: input.organizacao.id,
		pagamentos: input.pagamentos,
		autorId: input.autorId,
	});

	// 5. Fiscal emission (async, non-blocking)
	if (input.organizacao.fiscalEmissaoAutomatica) {
		try {
			const fiscalProvider = getFiscalProvider(input.organizacao);
			await fiscalProvider.emitirDocumento({
				venda: sale,
				tipo: "NFCE",
				organizacao: input.organizacao,
				lancamentoContabilId: transactionResult.entry.id,
			});
		} catch (error) {
			// Fiscal emission failure should not block sale confirmation
			console.error("[FISCAL] Erro na emissão automática:", error);
		}
	}

	return {
		vendaId: input.vendaId,
		lancamentoContabilId: transactionResult.entry.id,
		pagamentos: paymentResults,
	};
}
