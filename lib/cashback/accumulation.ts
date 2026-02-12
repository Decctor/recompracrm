import type { DBTransaction } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq } from "drizzle-orm";

type TProgramSnapshot = {
	id: string;
	acumuloTipo: string;
	acumuloValor: number;
	acumuloRegraValorMinimo: number;
	expiracaoRegraValidadeValor: number;
};

export function calculateAccumulatedCashbackValue({
	accumulationType,
	accumulationValue,
	minimumSaleValue,
	saleValue,
}: {
	accumulationType: string;
	accumulationValue: number;
	minimumSaleValue: number;
	saleValue: number;
}) {
	if (saleValue < minimumSaleValue) return 0;
	if (accumulationType === "FIXO") return accumulationValue;
	if (accumulationType === "PERCENTUAL") return (saleValue * accumulationValue) / 100;
	return 0;
}

export async function ensureCashbackBalanceForClient({
	tx,
	orgId,
	clientId,
	programId,
}: {
	tx: DBTransaction;
	orgId: string;
	clientId: string;
	programId: string;
}) {
	const existingBalance = await tx.query.cashbackProgramBalances.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, orgId), eq(fields.clienteId, clientId), eq(fields.programaId, programId)),
	});

	if (existingBalance) return existingBalance;

	const insertedBalance = await tx
		.insert(cashbackProgramBalances)
		.values({
			organizacaoId: orgId,
			clienteId: clientId,
			programaId: programId,
			saldoValorDisponivel: 0,
			saldoValorAcumuladoTotal: 0,
			saldoValorResgatadoTotal: 0,
		})
		.returning();

	return insertedBalance[0]!;
}

export async function accumulateCashbackForClient({
	tx,
	orgId,
	clientId,
	saleId,
	saleValue,
	operatorId,
	program,
	accumulationValueOverride,
	createdAt,
	metadata,
}: {
	tx: DBTransaction;
	orgId: string;
	clientId: string;
	saleId: string | null;
	saleValue: number;
	operatorId?: string | null;
	program: TProgramSnapshot;
	accumulationValueOverride?: number | null;
	createdAt?: Date;
	metadata?: Record<string, unknown>;
}) {
	const balance = await ensureCashbackBalanceForClient({
		tx,
		orgId,
		clientId,
		programId: program.id,
	});

	const accumulationValueToUse = accumulationValueOverride ?? program.acumuloValor;
	const accumulatedValue = calculateAccumulatedCashbackValue({
		accumulationType: program.acumuloTipo,
		accumulationValue: accumulationValueToUse,
		minimumSaleValue: program.acumuloRegraValorMinimo,
		saleValue,
	});

	if (accumulatedValue <= 0) {
		return {
			accumulatedValue: 0,
			previousAvailableBalance: balance.saldoValorDisponivel,
			newAvailableBalance: balance.saldoValorDisponivel,
			newAccumulatedBalance: balance.saldoValorAcumuladoTotal,
			transactionId: null as string | null,
		};
	}

	const previousAvailableBalance = balance.saldoValorDisponivel;
	const newAvailableBalance = previousAvailableBalance + accumulatedValue;
	const newAccumulatedBalance = balance.saldoValorAcumuladoTotal + accumulatedValue;
	const timestamp = createdAt ?? new Date();

	await tx
		.update(cashbackProgramBalances)
		.set({
			saldoValorDisponivel: newAvailableBalance,
			saldoValorAcumuladoTotal: newAccumulatedBalance,
			dataAtualizacao: timestamp,
		})
		.where(and(eq(cashbackProgramBalances.organizacaoId, orgId), eq(cashbackProgramBalances.clienteId, clientId), eq(cashbackProgramBalances.programaId, program.id)));

	const insertedTransaction = await tx
		.insert(cashbackProgramTransactions)
		.values({
			organizacaoId: orgId,
			clienteId: clientId,
			vendaId: saleId,
			vendaValor: saleValue,
			programaId: program.id,
			tipo: "ACÚMULO",
			status: "ATIVO",
			valor: accumulatedValue,
			valorRestante: accumulatedValue,
			saldoValorAnterior: previousAvailableBalance,
			saldoValorPosterior: newAvailableBalance,
			expiracaoData: dayjs().add(program.expiracaoRegraValidadeValor, "day").toDate(),
			dataInsercao: timestamp,
			operadorId: operatorId ?? null,
			metadados: metadata ?? null,
		})
		.returning({ id: cashbackProgramTransactions.id });

	return {
		accumulatedValue,
		previousAvailableBalance,
		newAvailableBalance,
		newAccumulatedBalance,
		transactionId: insertedTransaction[0]?.id ?? null,
	};
}
