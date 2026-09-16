import type { DBTransaction } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions, interactions } from "@/services/drizzle/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";

type ReverseSaleCashbackParams = {
	tx: DBTransaction;
	saleId: string;
	clientId: string;
	organizationId: string;
	reason: string; // e.g., "VENDA_CANCELADA", "VENDA_CANCELADA_RETROATIVA"
	mode?: "cancel" | "delete";
	// Reatribuição de cliente: reverte SOMENTE os ACÚMULOs de `clientId` (o comprador). O acúmulo do
	// parceiro pertence à venda (`parceiroId`), não ao comprador, e fica intacto; resgates nunca
	// chegam aqui porque a política de reatribuição os recusa antes.
	scope?: "sale" | "buyer-accumulations";
};

const EPSILON = 1e-6;

function normalizeValue(value: number) {
	return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function appendReversalMetadata(metadata: unknown, extra: Record<string, unknown>) {
	const sanitizedExtra = Object.fromEntries(Object.entries(extra).filter(([, value]) => value !== undefined));
	if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
		return { ...metadata, ...sanitizedExtra };
	}

	return sanitizedExtra;
}

function getConsumedFromAccumulations(metadata: unknown) {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || !("consumoFifo" in metadata)) return [];

	const consumoFifo = (metadata as { consumoFifo?: unknown }).consumoFifo;
	if (!Array.isArray(consumoFifo)) return [];

	return consumoFifo.flatMap((item) => {
		if (!item || typeof item !== "object") return [];
		const accumulationTransactionId = (item as { accumulationTransactionId?: unknown }).accumulationTransactionId;
		const consumedValue = (item as { consumedValue?: unknown }).consumedValue;
		if (typeof accumulationTransactionId !== "string" || typeof consumedValue !== "number" || consumedValue <= 0) return [];
		return [{ accumulationTransactionId, consumedValue }];
	});
}

/**
 * Reverses cashback transactions associated with a canceled sale and cancels unprocessed interactions.
 *
 * This function:
 * 1. Reverses active redemptions linked to the sale and restores FIFO consumption
 * 2. Reverses active or consumed accumulations linked to the sale
 * 3. Creates CANCELAMENTO transactions to keep an audit trail
 * 4. Updates the client's cashback balance
 * 5. Marks original transactions as EXPIRADO
 * 6. Deletes unprocessed scheduled interactions related to campaigns triggered by this sale
 * 7. In delete mode, detaches cashback transactions from the sale so the sale can be physically deleted
 *
 * @param tx - Database transaction
 * @param saleId - ID of the canceled sale
 * @param clientId - ID of the client
 * @param organizationId - ID of the organization
 * @param reason - Reason for cancellation (for audit trail)
 * @returns Object with reversal statistics
 */
export async function reverseSaleCashback({
	tx,
	saleId,
	clientId,
	organizationId,
	reason,
	mode = "cancel",
	scope = "sale",
}: ReverseSaleCashbackParams): Promise<{
	reversedTransactionsCount: number;
	totalReversedAmount: number;
	// Soma do `valor` original dos acúmulos encontrados (revertidos ou não): o que o cliente já
	// tinha consumido é a diferença para `totalReversedAmount`.
	totalOriginalAccumulatedAmount: number;
	reversedAccumulationsCount: number;
	reversedRedemptionsCount: number;
	totalRestoredRedemptionAmount: number;
	canceledInteractionsCount: number;
	detachedTransactionsCount: number;
}> {
	console.log(`[CASHBACK_REVERSAL] Starting reversal for sale ${saleId}. Reason: ${reason}. Mode: ${mode}`);

	const now = new Date();

	const buyerOnly = scope === "buyer-accumulations";
	const relatedAccumulations = await tx.query.cashbackProgramTransactions.findMany({
		where: (fields, { and, eq, or }) =>
			and(
				eq(fields.vendaId, saleId),
				eq(fields.tipo, "ACÚMULO"),
				buyerOnly ? eq(fields.clienteId, clientId) : undefined,
				or(eq(fields.status, "ATIVO"), eq(fields.status, "CONSUMIDO")),
			),
	});
	const relatedRedemptions = buyerOnly
		? []
		: await tx.query.cashbackProgramTransactions.findMany({
				where: (fields, { and, eq }) => and(eq(fields.vendaId, saleId), eq(fields.tipo, "RESGATE"), eq(fields.status, "ATIVO")),
			});

	if (relatedAccumulations.length === 0 && relatedRedemptions.length === 0) {
		console.log(`[CASHBACK_REVERSAL] No active cashback transactions found for sale ${saleId}. Nothing to reverse.`);
		const detachedTransactionsCount =
			mode === "delete"
				? (
						await tx
							.update(cashbackProgramTransactions)
							.set({ vendaId: null, dataAtualizacao: now })
							.where(eq(cashbackProgramTransactions.vendaId, saleId))
							.returning({ id: cashbackProgramTransactions.id })
					).length
				: 0;

		return {
			reversedTransactionsCount: 0,
			totalReversedAmount: 0,
			totalOriginalAccumulatedAmount: 0,
			reversedAccumulationsCount: 0,
			reversedRedemptionsCount: 0,
			totalRestoredRedemptionAmount: 0,
			canceledInteractionsCount: 0,
			detachedTransactionsCount,
		};
	}

	console.log(
		`[CASHBACK_REVERSAL] Found ${relatedAccumulations.length} accumulation(s) and ${relatedRedemptions.length} redemption(s) to reverse for sale ${saleId}.`,
	);

	let totalReversedAmount = 0;
	let totalRestoredRedemptionAmount = 0;
	let reversedAccumulationsCount = 0;
	let reversedRedemptionsCount = 0;

	for (const redemption of relatedRedemptions) {
		const consumedFromAccumulations = getConsumedFromAccumulations(redemption.metadados);
		for (const consumed of consumedFromAccumulations) {
			await tx
				.update(cashbackProgramTransactions)
				.set({
					valorRestante: sql`${cashbackProgramTransactions.valorRestante} + ${consumed.consumedValue}`,
					status: "ATIVO",
					dataAtualizacao: now,
				})
				.where(eq(cashbackProgramTransactions.id, consumed.accumulationTransactionId));
		}

		const currentBalance = await tx.query.cashbackProgramBalances.findFirst({
			where: (fields, { and, eq }) =>
				and(eq(fields.clienteId, redemption.clienteId), eq(fields.programaId, redemption.programaId), eq(fields.organizacaoId, organizationId)),
		});
		if (!currentBalance) {
			console.error(
				`[CASHBACK_REVERSAL] Balance not found for client ${redemption.clienteId} and program ${redemption.programaId}. Skipping redemption ${redemption.id}.`,
			);
			continue;
		}

		const restoredValue = normalizeValue(Math.abs(redemption.valor));
		const newBalance = normalizeValue(currentBalance.saldoValorDisponivel + restoredValue);
		const newRedeemedTotal = Math.max(0, normalizeValue(currentBalance.saldoValorResgatadoTotal - restoredValue));

		await tx
			.update(cashbackProgramBalances)
			.set({
				saldoValorDisponivel: newBalance,
				saldoValorResgatadoTotal: newRedeemedTotal,
				dataAtualizacao: now,
			})
			.where(eq(cashbackProgramBalances.id, currentBalance.id));

		await tx
			.update(cashbackProgramTransactions)
			.set({
				status: "EXPIRADO",
				metadados: appendReversalMetadata(redemption.metadados, {
					motivoExpiracao: reason,
					vendaExcluidaId: mode === "delete" ? saleId : undefined,
				}),
				dataAtualizacao: now,
			})
			.where(eq(cashbackProgramTransactions.id, redemption.id));

		await tx.insert(cashbackProgramTransactions).values({
			organizacaoId: organizationId,
			clienteId: redemption.clienteId,
			vendaId: mode === "delete" ? null : saleId,
			vendaValor: redemption.vendaValor,
			programaId: redemption.programaId,
			tipo: "CANCELAMENTO",
			status: "ATIVO",
			valor: restoredValue,
			valorRestante: 0,
			saldoValorAnterior: currentBalance.saldoValorDisponivel,
			saldoValorPosterior: newBalance,
			expiracaoData: null,
			operadorId: redemption.operadorId,
			operadorVendedorId: redemption.operadorVendedorId,
			campanhaId: redemption.campanhaId,
			// Preserva o vínculo com a recompensa para que o estorno seja rastreável até o prêmio.
			resgateRecompensaId: redemption.resgateRecompensaId,
			resgateRecompensaValor: redemption.resgateRecompensaValor,
			dataInsercao: now,
			metadados: {
				transacaoOrigemId: redemption.id,
				vendaOriginalId: saleId,
				motivo: reason,
			},
		});

		totalRestoredRedemptionAmount += restoredValue;
		reversedRedemptionsCount += 1;
	}

	// For each accumulation, create a reversal and update balances.
	for (const transaction of relatedAccumulations) {
		const transactionClientId = transaction.clienteId;
		if (mode === "delete" && transaction.valorRestante + EPSILON < transaction.valor) {
			throw new createHttpError.Conflict(
				"Esta venda gerou cashback que já foi utilizado em resgates posteriores. Estorne os resgates dependentes antes de excluir a venda.",
			);
		}

		let amountToReverse = transaction.valorRestante;

		if (amountToReverse <= 0) {
			console.log(`[CASHBACK_REVERSAL] Transaction ${transaction.id} has no remaining value to reverse. Skipping but marking as EXPIRADO.`);
			await tx
				.update(cashbackProgramTransactions)
				.set({
					status: "EXPIRADO",
					metadados: appendReversalMetadata(transaction.metadados, {
						motivoExpiracao: reason,
						vendaExcluidaId: mode === "delete" ? saleId : undefined,
					}),
					dataAtualizacao: now,
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
		amountToReverse = Math.max(0, Math.min(amountToReverse, previousBalance));
		if (amountToReverse <= 0) {
			await tx
				.update(cashbackProgramTransactions)
				.set({
					status: "EXPIRADO",
					valorRestante: 0,
					metadados: appendReversalMetadata(transaction.metadados, {
						motivoExpiracao: reason,
						vendaExcluidaId: mode === "delete" ? saleId : undefined,
					}),
					dataAtualizacao: now,
				})
				.where(eq(cashbackProgramTransactions.id, transaction.id));
			continue;
		}
		const newBalance = Math.max(0, normalizeValue(previousBalance - amountToReverse));
		const newAccumulatedTotal = Math.max(0, normalizeValue(currentBalance.saldoValorAcumuladoTotal - amountToReverse));

		// Create CANCELAMENTO transaction
		await tx.insert(cashbackProgramTransactions).values({
			organizacaoId: organizationId,
			clienteId: transactionClientId,
			vendaId: mode === "delete" ? null : saleId,
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
				vendaOriginalId: saleId,
				motivo: reason,
			},
		});

		// Mark original transaction as EXPIRADO
		await tx
			.update(cashbackProgramTransactions)
			.set({
				status: "EXPIRADO",
				valorRestante: 0,
				metadados: appendReversalMetadata(transaction.metadados, {
					motivoExpiracao: reason,
					vendaExcluidaId: mode === "delete" ? saleId : undefined,
				}),
				dataAtualizacao: now,
			})
			.where(eq(cashbackProgramTransactions.id, transaction.id));

		// Update client balance
		await tx
			.update(cashbackProgramBalances)
			.set({
				saldoValorDisponivel: newBalance,
				saldoValorAcumuladoTotal: newAccumulatedTotal,
				dataAtualizacao: now,
			})
			.where(eq(cashbackProgramBalances.id, currentBalance.id));

		totalReversedAmount += amountToReverse;
		reversedAccumulationsCount += 1;

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
	const relatedCampaignIds = [...relatedAccumulations, ...relatedRedemptions].reduce<string[]>((acc, transaction) => {
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
	const detachedTransactionsCount =
		mode === "delete"
			? (
					await tx
						.update(cashbackProgramTransactions)
						.set({ vendaId: null, dataAtualizacao: now })
						.where(eq(cashbackProgramTransactions.vendaId, saleId))
						.returning({ id: cashbackProgramTransactions.id })
				).length
			: 0;

	console.log(
		`[CASHBACK_REVERSAL] Sale ${saleId} reversal completed. ` +
			`Reversed ${reversedAccumulationsCount} accumulation(s) totaling R$ ${(totalReversedAmount / 100).toFixed(2)}. ` +
			`Restored ${reversedRedemptionsCount} redemption(s) totaling R$ ${(totalRestoredRedemptionAmount / 100).toFixed(2)}. ` +
			`Canceled ${canceledInteractionsCount} unprocessed interaction(s). Detached ${detachedTransactionsCount} transaction(s).`,
	);

	return {
		reversedTransactionsCount: reversedAccumulationsCount + reversedRedemptionsCount,
		totalReversedAmount,
		totalOriginalAccumulatedAmount: relatedAccumulations.reduce((sum, transaction) => sum + transaction.valor, 0),
		reversedAccumulationsCount,
		reversedRedemptionsCount,
		totalRestoredRedemptionAmount,
		canceledInteractionsCount,
		detachedTransactionsCount,
	};
}
