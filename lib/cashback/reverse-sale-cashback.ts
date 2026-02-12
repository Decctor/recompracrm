import type { DBTransaction } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions, interactions } from "@/services/drizzle/schema";
import { and, eq, isNull, or } from "drizzle-orm";

type ReverseSaleCashbackParams = {
	tx: DBTransaction;
	saleId: string;
	clientId: string;
	organizationId: string;
	reason: string; // e.g., "VENDA_CANCELADA", "VENDA_CANCELADA_RETROATIVA"
};

/**
 * Reverses cashback transactions associated with a canceled sale and cancels unprocessed interactions.
 *
 * This function:
 * 1. Finds all active or consumed cashback transactions linked to the sale
 * 2. Creates CANCELAMENTO transactions to reverse the cashback
 * 3. Updates the client's cashback balance
 * 4. Marks original transactions as EXPIRADO
 * 5. Deletes unprocessed scheduled interactions related to campaigns triggered by this sale
 *
 * @param tx - Database transaction
 * @param saleId - ID of the canceled sale
 * @param clientId - ID of the client
 * @param organizationId - ID of the organization
 * @param reason - Reason for cancellation (for audit trail)
 * @returns Object with reversal statistics
 */
export async function reverseSaleCashback({ tx, saleId, clientId, organizationId, reason }: ReverseSaleCashbackParams): Promise<{
	reversedTransactionsCount: number;
	totalReversedAmount: number;
	canceledInteractionsCount: number;
}> {
	console.log(`[CASHBACK_REVERSAL] Starting reversal for sale ${saleId}. Reason: ${reason}`);

	// 1. Find all active or consumed cashback transactions related to this sale
	const relatedTransactions = await tx.query.cashbackProgramTransactions.findMany({
		where: (fields, { and, eq, or }) =>
			and(eq(fields.vendaId, saleId), eq(fields.tipo, "ACÚMULO"), or(eq(fields.status, "ATIVO"), eq(fields.status, "CONSUMIDO"))),
	});

	if (relatedTransactions.length === 0) {
		console.log(`[CASHBACK_REVERSAL] No active cashback transactions found for sale ${saleId}. Nothing to reverse.`);
		return {
			reversedTransactionsCount: 0,
			totalReversedAmount: 0,
			canceledInteractionsCount: 0,
		};
	}

	console.log(`[CASHBACK_REVERSAL] Found ${relatedTransactions.length} cashback transaction(s) to reverse for sale ${saleId}.`);

	let totalReversedAmount = 0;
	const now = new Date();

	// 2. For each transaction, create a reversal and update balances
	for (const transaction of relatedTransactions) {
		const transactionClientId = transaction.clienteId;
		// Only reverse the remaining amount (not already consumed)
		const amountToReverse = transaction.valorRestante;

		if (amountToReverse <= 0) {
			console.log(`[CASHBACK_REVERSAL] Transaction ${transaction.id} has no remaining value to reverse. Skipping but marking as EXPIRADO.`);
			// Still mark as expired
			await tx
				.update(cashbackProgramTransactions)
				.set({
					status: "EXPIRADO",
				})
				.where(eq(cashbackProgramTransactions.id, transaction.id));
			continue;
		}

		// Get current balance
		const currentBalance = await tx.query.cashbackProgramBalances.findFirst({
			where: (fields, { and, eq }) =>
				and(eq(fields.clienteId, transactionClientId), eq(fields.programaId, transaction.programaId), eq(fields.organizacaoId, organizationId)),
		});

		if (!currentBalance) {
			console.error(
				`[CASHBACK_REVERSAL] Balance not found for client ${transactionClientId} and program ${transaction.programaId}. Skipping transaction ${transaction.id}.`,
			);
			continue;
		}

		const previousBalance = currentBalance.saldoValorDisponivel;
		const newBalance = previousBalance - amountToReverse;

		// Create CANCELAMENTO transaction
		await tx.insert(cashbackProgramTransactions).values({
			organizacaoId: organizationId,
			clienteId: transactionClientId,
			vendaId: saleId,
			programaId: transaction.programaId,
			tipo: "CANCELAMENTO",
			status: "ATIVO",
			valor: -amountToReverse, // Negative value to indicate reversal
			valorRestante: 0,
			vendaValor: transaction.vendaValor,
			saldoValorAnterior: previousBalance,
			saldoValorPosterior: newBalance,
			expiracaoData: null,
			campanhaId: transaction.campanhaId,
			dataInsercao: now,
			metadados: {
				transacaoOrigemId: transaction.id,
				motivo: reason,
			},
		});

		// Mark original transaction as EXPIRADO
		await tx
			.update(cashbackProgramTransactions)
			.set({
				status: "EXPIRADO",
				valorRestante: 0,
			})
			.where(eq(cashbackProgramTransactions.id, transaction.id));

		// Update client balance
		await tx
			.update(cashbackProgramBalances)
			.set({
				saldoValorDisponivel: newBalance,
				dataAtualizacao: now,
			})
			.where(eq(cashbackProgramBalances.id, currentBalance.id));

		totalReversedAmount += amountToReverse;

		console.log(
			`[CASHBACK_REVERSAL] Reversed transaction ${transaction.id} for client ${transactionClientId}: R$ ${(amountToReverse / 100).toFixed(2)}. ` +
				`Previous balance: R$ ${(previousBalance / 100).toFixed(2)}, New balance: R$ ${(newBalance / 100).toFixed(2)}`,
		);
	}

	// 3. Cancel unprocessed interactions related to campaigns triggered by this sale
	// We delete interactions that:
	// - Belong to the same client
	// - Have not been executed yet (dataExecucao IS NULL)
	// - Were created around the same time as the sale
	// Note: We can't directly link interactions to sales in the current schema,
	// so we delete recent unprocessed interactions for safety
	const relatedCampaignIds = relatedTransactions.reduce<string[]>((acc, transaction) => {
		if (transaction.campanhaId) acc.push(transaction.campanhaId);
		return acc;
	}, []);

	const canceledInteractions =
		relatedCampaignIds.length === 0
			? []
			: await tx
		.delete(interactions)
		.where(
			and(
				eq(interactions.clienteId, clientId),
				eq(interactions.organizacaoId, organizationId),
				isNull(interactions.dataExecucao),
				// Only delete interactions from campaigns that might have generated cashback
				or(...relatedCampaignIds.map((campaignId) => eq(interactions.campanhaId, campaignId))),
			),
		)
		.returning({ id: interactions.id });

	const canceledInteractionsCount = canceledInteractions.length;

	console.log(
		`[CASHBACK_REVERSAL] Sale ${saleId} reversal completed. ` +
			`Reversed ${relatedTransactions.length} transaction(s) totaling R$ ${(totalReversedAmount / 100).toFixed(2)}. ` +
			`Canceled ${canceledInteractionsCount} unprocessed interaction(s).`,
	);

	return {
		reversedTransactionsCount: relatedTransactions.length,
		totalReversedAmount,
		canceledInteractionsCount,
	};
}
