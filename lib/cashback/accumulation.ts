import type { DBTransaction } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, sql } from "drizzle-orm";

/**
 * Motivo gravado em `metadados.motivoExpiracao` dos ACÚMULOs revertidos por reatribuição de
 * cliente da venda. As guardas de idempotência ignoram essas linhas: a venda mudou de dono, e o
 * novo cliente (ou o antigo, num vai-e-volta) precisa poder acumular de novo. Expiração natural
 * e cancelamento de venda não carregam este motivo e continuam bloqueando.
 */
export const SALE_CLIENT_REASSIGNMENT_CASHBACK_REASON = "VENDA_REATRIBUIDA";

export const notReversedByClientReassignment = () =>
	sql`coalesce(${cashbackProgramTransactions.metadados}->>'motivoExpiracao', '') <> ${SALE_CLIENT_REASSIGNMENT_CASHBACK_REASON}`;

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
	operatorSellerId,
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
	operatorSellerId?: string | null;
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

	// Guarda de idempotência na fonte: uma venda acumula no máximo uma vez POR CLIENTE
	// (comprador e parceiro são acúmulos legítimos distintos na mesma venda). Protege contra
	// caminhos concorrentes (import, confirmação, entrega) e replays de eventos de webhook.
	if (saleId) {
		const existingAccumulation = await tx.query.cashbackProgramTransactions.findFirst({
			where: and(
				eq(cashbackProgramTransactions.organizacaoId, orgId),
				eq(cashbackProgramTransactions.vendaId, saleId),
				eq(cashbackProgramTransactions.clienteId, clientId),
				eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
				notReversedByClientReassignment(),
			),
			columns: { id: true },
		});
		if (existingAccumulation) {
			return {
				accumulatedValue: 0,
				previousAvailableBalance: balance.saldoValorDisponivel,
				newAvailableBalance: balance.saldoValorDisponivel,
				newAccumulatedBalance: balance.saldoValorAcumuladoTotal,
				transactionId: existingAccumulation.id,
				alreadyProcessed: true,
			};
		}
	}

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
			alreadyProcessed: false,
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
		.where(
			and(
				eq(cashbackProgramBalances.organizacaoId, orgId),
				eq(cashbackProgramBalances.clienteId, clientId),
				eq(cashbackProgramBalances.programaId, program.id),
			),
		);

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
			expiracaoData: dayjs(timestamp).add(program.expiracaoRegraValidadeValor, "day").toDate(),
			dataInsercao: timestamp,
			operadorId: operatorId ?? null,
			operadorVendedorId: operatorSellerId ?? null,
			metadados: metadata ?? null,
		})
		.returning({ id: cashbackProgramTransactions.id });

	return {
		accumulatedValue,
		previousAvailableBalance,
		newAvailableBalance,
		newAccumulatedBalance,
		transactionId: insertedTransaction[0]?.id ?? null,
		alreadyProcessed: false,
	};
}
