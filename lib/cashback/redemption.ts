import type { DBTransaction } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions } from "@/services/drizzle/schema";
import { and, eq, gt } from "drizzle-orm";
import createHttpError from "http-errors";

const EPSILON = 1e-6;
const ENABLE_IMPORTED_BALANCE_FIFO_BYPASS = true; // process.env.CASHBACK_IMPORTED_BALANCE_FIFO_BYPASS === "true";

function normalizeValue(value: number) {
	return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export type TApplyCashbackRedemptionFIFOResult = {
	previousBalance: number;
	newBalance: number;
	newResgatadoTotal: number;
	consumedFromAccumulations: Array<{
		accumulationTransactionId: string;
		consumedValue: number;
	}>;
};

export async function applyCashbackRedemptionFIFO({
	tx,
	orgId,
	clientId,
	programId,
	redemptionValue,
}: {
	tx: DBTransaction;
	orgId: string;
	clientId: string;
	programId: string;
	redemptionValue: number;
}): Promise<TApplyCashbackRedemptionFIFOResult> {
	if (redemptionValue <= 0) {
		throw new createHttpError.BadRequest("Valor de resgate deve ser maior que zero.");
	}

	const balance = await tx.query.cashbackProgramBalances.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.clienteId, clientId), eq(fields.organizacaoId, orgId), eq(fields.programaId, programId)),
	});

	if (!balance) {
		throw new createHttpError.NotFound("Saldo de cashback não encontrado para este cliente.");
	}

	if (balance.saldoValorDisponivel + EPSILON < redemptionValue) {
		throw new createHttpError.BadRequest("Saldo insuficiente.");
	}
	console.log(`[INFO] [CASHBACK_REDEMPTION_FIFO] Starting redemption for ${clientId} redeeming ${redemptionValue} value...`);
	const accumulationTransactions = await tx.query.cashbackProgramTransactions.findMany({
		where: (fields, { and, eq, gt }) =>
			and(
				eq(fields.organizacaoId, orgId),
				eq(fields.clienteId, clientId),
				eq(fields.programaId, programId),
				eq(fields.tipo, "ACÚMULO"),
				eq(fields.status, "ATIVO"),
				gt(fields.valorRestante, 0),
			),
		orderBy: (fields, { asc }) => [asc(fields.expiracaoData), asc(fields.dataInsercao)],
	});

	let remainingToConsume = redemptionValue;
	const consumedFromAccumulations: TApplyCashbackRedemptionFIFOResult["consumedFromAccumulations"] = [];

	console.log(`[INFO] [CASHBACK_REDEMPTION_FIFO] Consuming cashback from ${accumulationTransactions.length} accumulation transactions...`);
	for (const accumulationTransaction of accumulationTransactions) {
		if (remainingToConsume <= EPSILON) break;

		const consumedValue = Math.min(accumulationTransaction.valorRestante, remainingToConsume);
		if (consumedValue <= EPSILON) continue;

		const newRemainingValue = normalizeValue(accumulationTransaction.valorRestante - consumedValue);
		const nextStatus = newRemainingValue <= EPSILON ? "CONSUMIDO" : "ATIVO";
		console.log(
			`[INFO] [CASHBACK_REDEMPTION_FIFO] Consumed ${consumedValue} from transaction ${accumulationTransaction.id}, updating to status ${nextStatus} and remaining value ${newRemainingValue}...`,
		);
		await tx
			.update(cashbackProgramTransactions)
			.set({
				valorRestante: newRemainingValue <= EPSILON ? 0 : newRemainingValue,
				status: nextStatus,
				dataAtualizacao: new Date(),
			})
			.where(
				and(
					eq(cashbackProgramTransactions.id, accumulationTransaction.id),
					eq(cashbackProgramTransactions.status, "ATIVO"),
					gt(cashbackProgramTransactions.valorRestante, 0),
				),
			);

		consumedFromAccumulations.push({
			accumulationTransactionId: accumulationTransaction.id,
			consumedValue: normalizeValue(consumedValue),
		});

		remainingToConsume = normalizeValue(remainingToConsume - consumedValue);
	}

	if (remainingToConsume > EPSILON) {
		const canBypassImportedBalance =
			ENABLE_IMPORTED_BALANCE_FIFO_BYPASS && accumulationTransactions.length === 0 && consumedFromAccumulations.length === 0;

		if (!canBypassImportedBalance) {
			throw new createHttpError.Conflict("Saldo inconsistente para consumo FIFO. Tente novamente.");
		}

		console.warn(
			`[WARN] [CASHBACK_REDEMPTION_FIFO] Bypass temporario aplicado para cliente ${clientId}. Sem transacoes de acumulo para consumir ${remainingToConsume}.`,
		);
	}

	const previousBalance = balance.saldoValorDisponivel;
	const newBalance = Math.max(0, normalizeValue(previousBalance - redemptionValue));
	const newResgatadoTotal = normalizeValue(balance.saldoValorResgatadoTotal + redemptionValue);

	await tx
		.update(cashbackProgramBalances)
		.set({
			saldoValorDisponivel: newBalance,
			saldoValorResgatadoTotal: newResgatadoTotal,
			dataAtualizacao: new Date(),
		})
		.where(eq(cashbackProgramBalances.id, balance.id));

	console.log(
		`[INFO] [CASHBACK_REDEMPTION_FIFO] Updated balance for client ${clientId} to available balance ${newBalance} and total redeemed to ${newResgatadoTotal}...`,
	);
	return {
		previousBalance,
		newBalance,
		newResgatadoTotal,
		consumedFromAccumulations,
	};
}
