import { getPostponedDateFromReferenceDate } from "@/lib/dates";
import type { TCashbackProgramAccumulationTypeEnum, TCashbackProgramTerminologyEnum, TTimeDurationUnitsEnum } from "@/schemas/enums";
import type { DBTransaction } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions, cashbackPrograms } from "@/services/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

type GenerateCashbackForCampaignParams = {
	tx: DBTransaction;
	organizationId: string;
	clientId: string;
	campaignId: string;
	cashbackType: TCashbackProgramAccumulationTypeEnum;
	cashbackValue: number;
	saleId: string | null;
	saleValue: number | null; // Required for PERCENTUAL calculation
	expirationMeasure: TTimeDurationUnitsEnum | null;
	expirationValue: number | null;
	interactionId?: string | null; // Links the transaction to the interaction that granted it (metadados.interacaoId), enabling reversal when the send is blocked
	createdAt?: Date;
	metadata?: Record<string, unknown>;
};

const DEFAULT_EXPIRATION_DAYS = 30;

export async function generateCashbackForCampaign({
	tx,
	organizationId,
	clientId,
	campaignId,
	saleId,
	cashbackType,
	cashbackValue,
	saleValue,
	expirationMeasure,
	expirationValue,
	interactionId,
	createdAt,
	metadata,
}: GenerateCashbackForCampaignParams): Promise<{
	cashbackAmount: number;
	transactionId: string;
	clientNewAvailableBalance: number;
	clientNewAccumulatedTotal: number;
} | null> {
	// 1. Fetch the organization's cashback program
	const program = await tx.query.cashbackPrograms.findFirst({
		where: eq(cashbackPrograms.organizacaoId, organizationId),
	});

	if (!program) {
		console.error(`[CAMPAIGN_CASHBACK] No cashback program found for organization ${organizationId}. Skipping cashback generation.`);
		return null;
	}

	if (!program.ativo) {
		console.log(`[CAMPAIGN_CASHBACK] Cashback program is inactive for organization ${organizationId}. Skipping cashback generation.`);
		return null;
	}

	// 2. Calculate cashback amount
	let cashbackAmount: number;
	if (cashbackType === "PERCENTUAL") {
		if (saleValue === null || saleValue <= 0) {
			console.error(`[CAMPAIGN_CASHBACK] PERCENTUAL cashback requires a valid sale value. Received: ${saleValue}. Skipping.`);
			return null;
		}
		cashbackAmount = saleValue * (cashbackValue / 100);
	} else {
		// FIXO
		cashbackAmount = cashbackValue;
	}

	if (cashbackAmount <= 0) {
		console.log(`[CAMPAIGN_CASHBACK] Calculated cashback amount is ${cashbackAmount}. Skipping.`);
		return null;
	}

	// 3. Find or create balance record for client
	let balance = await tx.query.cashbackProgramBalances.findFirst({
		where: and(eq(cashbackProgramBalances.clienteId, clientId), eq(cashbackProgramBalances.organizacaoId, organizationId)),
	});

	if (!balance) {
		// Create new balance record
		const insertedBalance = await tx
			.insert(cashbackProgramBalances)
			.values({
				organizacaoId: organizationId,
				clienteId: clientId,
				programaId: program.id,
				saldoValorDisponivel: 0,
				saldoValorAcumuladoTotal: 0,
				saldoValorResgatadoTotal: 0,
			})
			.returning();

		balance = insertedBalance[0];
		if (!balance) {
			console.error(`[CAMPAIGN_CASHBACK] Failed to create balance record for client ${clientId}.`);
			return null;
		}
	}

	// 4. Calculate expiration date
	const now = createdAt ?? new Date();
	let expirationDate: Date;

	if (expirationMeasure && expirationValue && expirationValue > 0) {
		expirationDate = getPostponedDateFromReferenceDate({
			date: now,
			unit: expirationMeasure,
			value: expirationValue,
		});
	} else {
		// Default to 30 days
		expirationDate = getPostponedDateFromReferenceDate({
			date: now,
			unit: "DIAS",
			value: DEFAULT_EXPIRATION_DAYS,
		});
	}

	// 5. Calculate new balances
	const previousBalance = balance.saldoValorDisponivel;
	const newBalance = previousBalance + cashbackAmount;
	const newAccumulatedTotal = balance.saldoValorAcumuladoTotal + cashbackAmount;

	// 6. Update balance
	await tx
		.update(cashbackProgramBalances)
		.set({
			saldoValorDisponivel: newBalance,
			saldoValorAcumuladoTotal: newAccumulatedTotal,
			dataAtualizacao: now,
		})
		.where(eq(cashbackProgramBalances.id, balance.id));

	// 7. Create transaction record
	const transactionMetadata: Record<string, unknown> = { ...metadata };
	if (interactionId) transactionMetadata.interacaoId = interactionId;

	const insertedTransaction = await tx
		.insert(cashbackProgramTransactions)
		.values({
			organizacaoId: organizationId,
			clienteId: clientId,
			programaId: program.id,
			vendaId: saleId,
			tipo: "ACÚMULO",
			status: "ATIVO",
			valor: cashbackAmount,
			valorRestante: cashbackAmount,
			vendaValor: saleValue ?? 0,
			saldoValorAnterior: previousBalance,
			saldoValorPosterior: newBalance,
			expiracaoData: expirationDate,
			campanhaId: campaignId,
			metadados: Object.keys(transactionMetadata).length > 0 ? transactionMetadata : null,
			dataInsercao: now,
		})
		.returning({ id: cashbackProgramTransactions.id });

	const transactionId = insertedTransaction[0]?.id;
	if (!transactionId) {
		console.error("[CAMPAIGN_CASHBACK] Failed to create transaction record.");
		return null;
	}

	console.log(
		`[CAMPAIGN_CASHBACK] Generated ${cashbackAmount.toFixed(2)} cashback for client ${clientId} from campaign ${campaignId}. ` +
			`New balance: ${newBalance.toFixed(2)}. Expires: ${expirationDate.toISOString()}.`,
	);

	return {
		cashbackAmount,
		transactionId,
		clientNewAvailableBalance: newBalance,
		clientNewAccumulatedTotal: newAccumulatedTotal,
	};
}

type GenerateCashbackForCampaignBatchParams = {
	tx: DBTransaction;
	organizationId: string;
	campaignId: string;
	clientIds: string[];
	cashbackValue: number; // FIXO amount, applied equally to every client
	expirationMeasure: TTimeDurationUnitsEnum | null;
	expirationValue: number | null;
	interactionIdByClientId?: Map<string, string>; // Links each transaction to the interaction that granted it (metadados.interacaoId)
};

// Saldos pós-acúmulo por cliente, para que o chamador congele o contexto de cashback na interação
// (variáveis de template). Espelha o retorno de generateCashbackForCampaign, que já expõe os novos
// saldos no caminho unitário.
export type TCampaignCashbackBatchClientBalance = {
	saldoDisponivel: number;
	totalAcumulado: number;
	totalResgatado: number;
};

type TGenerateCashbackForCampaignBatchResult = {
	generatedCount: number;
	cashbackAmount: number;
	terminologia: TCashbackProgramTerminologyEnum | null;
	balancesByClientId: Map<string, TCampaignCashbackBatchClientBalance>;
};

// Set-based FIXO cashback generation for a chunk of clients. Avoids the per-client
// round trips of generateCashbackForCampaign so the enclosing transaction stays short.
export async function generateCashbackForCampaignBatch({
	tx,
	organizationId,
	campaignId,
	clientIds,
	cashbackValue,
	expirationMeasure,
	expirationValue,
	interactionIdByClientId,
}: GenerateCashbackForCampaignBatchParams): Promise<TGenerateCashbackForCampaignBatchResult> {
	const emptyResult: TGenerateCashbackForCampaignBatchResult = {
		generatedCount: 0,
		cashbackAmount: 0,
		terminologia: null,
		balancesByClientId: new Map(),
	};

	const uniqueClientIds = Array.from(new Set(clientIds));
	if (uniqueClientIds.length === 0) {
		return emptyResult;
	}

	const cashbackAmount = cashbackValue;
	if (cashbackAmount <= 0) {
		console.log(`[CAMPAIGN_CASHBACK] Calculated cashback amount is ${cashbackAmount}. Skipping batch.`);
		return emptyResult;
	}

	const program = await tx.query.cashbackPrograms.findFirst({
		where: eq(cashbackPrograms.organizacaoId, organizationId),
	});

	if (!program) {
		console.error(`[CAMPAIGN_CASHBACK] No cashback program found for organization ${organizationId}. Skipping batch.`);
		return emptyResult;
	}

	if (!program.ativo) {
		console.log(`[CAMPAIGN_CASHBACK] Cashback program is inactive for organization ${organizationId}. Skipping batch.`);
		return emptyResult;
	}

	const now = new Date();
	const expirationDate =
		expirationMeasure && expirationValue && expirationValue > 0
			? getPostponedDateFromReferenceDate({ date: now, unit: expirationMeasure, value: expirationValue })
			: getPostponedDateFromReferenceDate({ date: now, unit: "DIAS", value: DEFAULT_EXPIRATION_DAYS });

	const existingBalances = await tx
		.select({
			clienteId: cashbackProgramBalances.clienteId,
			saldoValorDisponivel: cashbackProgramBalances.saldoValorDisponivel,
			saldoValorAcumuladoTotal: cashbackProgramBalances.saldoValorAcumuladoTotal,
			saldoValorResgatadoTotal: cashbackProgramBalances.saldoValorResgatadoTotal,
		})
		.from(cashbackProgramBalances)
		.where(and(eq(cashbackProgramBalances.organizacaoId, organizationId), inArray(cashbackProgramBalances.clienteId, uniqueClientIds)));

	const previousBalanceByClientId = new Map(existingBalances.map((balance) => [balance.clienteId, balance.saldoValorDisponivel]));
	const previousTotalsByClientId = new Map(
		existingBalances.map((balance) => [
			balance.clienteId,
			{ acumulado: balance.saldoValorAcumuladoTotal, resgatado: balance.saldoValorResgatadoTotal },
		]),
	);

	const clientIdsWithoutBalance = uniqueClientIds.filter((clientId) => !previousBalanceByClientId.has(clientId));
	if (clientIdsWithoutBalance.length > 0) {
		await tx.insert(cashbackProgramBalances).values(
			clientIdsWithoutBalance.map((clientId) => ({
				organizacaoId: organizationId,
				clienteId: clientId,
				programaId: program.id,
				saldoValorDisponivel: 0,
				saldoValorAcumuladoTotal: 0,
				saldoValorResgatadoTotal: 0,
			})),
		);
	}

	await tx.insert(cashbackProgramTransactions).values(
		uniqueClientIds.map((clientId) => {
			const previousBalance = previousBalanceByClientId.get(clientId) ?? 0;
			const interactionId = interactionIdByClientId?.get(clientId);
			return {
				organizacaoId: organizationId,
				clienteId: clientId,
				programaId: program.id,
				vendaId: null,
				tipo: "ACÚMULO" as const,
				status: "ATIVO" as const,
				valor: cashbackAmount,
				valorRestante: cashbackAmount,
				vendaValor: 0,
				saldoValorAnterior: previousBalance,
				saldoValorPosterior: previousBalance + cashbackAmount,
				expiracaoData: expirationDate,
				campanhaId: campaignId,
				metadados: interactionId ? { interacaoId: interactionId } : null,
				dataInsercao: now,
			};
		}),
	);

	await tx
		.update(cashbackProgramBalances)
		.set({
			saldoValorDisponivel: sql`${cashbackProgramBalances.saldoValorDisponivel} + ${cashbackAmount}`,
			saldoValorAcumuladoTotal: sql`${cashbackProgramBalances.saldoValorAcumuladoTotal} + ${cashbackAmount}`,
			dataAtualizacao: now,
		})
		.where(and(eq(cashbackProgramBalances.organizacaoId, organizationId), inArray(cashbackProgramBalances.clienteId, uniqueClientIds)));

	console.log(
		`[CAMPAIGN_CASHBACK] Generated ${cashbackAmount.toFixed(2)} cashback for ${uniqueClientIds.length} clients from campaign ${campaignId}.`,
	);

	const balancesByClientId = new Map<string, TCampaignCashbackBatchClientBalance>(
		uniqueClientIds.map((clientId) => {
			const previousBalance = previousBalanceByClientId.get(clientId) ?? 0;
			const previousTotals = previousTotalsByClientId.get(clientId) ?? { acumulado: 0, resgatado: 0 };
			return [
				clientId,
				{
					saldoDisponivel: previousBalance + cashbackAmount,
					totalAcumulado: previousTotals.acumulado + cashbackAmount,
					totalResgatado: previousTotals.resgatado,
				},
			];
		}),
	);

	return { generatedCount: uniqueClientIds.length, cashbackAmount, terminologia: program.terminologia, balancesByClientId };
}
