import { apiHandler } from "@/lib/api";
import { getCurrentSessionUncached } from "@/lib/authentication/pages-session";
import { db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions } from "@/services/drizzle/schema";
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import createHttpError from "http-errors";
import type { NextApiHandler } from "next";

const EPSILON = 1e-6;

type TFixMode = "dry-run" | "apply";
type TFixStrategy = "reconcile" | "replay-ledger";

const FIX_CONFIG: {
	mode: TFixMode;
	strategies: TFixStrategy[];
	organizationIds: string[];
	clientIds: string[];
	programIds: string[];
	onlyNegativeBalances: boolean;
	onlyPositiveBalances: boolean;
	limit: number;
	includeItems: boolean;
} = {
	mode: "apply",
	// strategies: ["reconcile", "replay-ledger"],
	strategies: ["replay-ledger"],
	organizationIds: ["4a4e8578-63f0-4119-9695-a2cc068de8d6"],
	clientIds: [],
	programIds: [],
	onlyNegativeBalances: false,
	onlyPositiveBalances: true,
	limit: 10000,
	includeItems: true,
};

function normalizeValue(value: number) {
	return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

type TChangedAccumulation = {
	transactionId: string;
	oldValorRestante: number;
	newValorRestante: number;
	oldStatus: "ATIVO" | "CONSUMIDO" | "EXPIRADO";
	newStatus: "ATIVO" | "CONSUMIDO";
};

type TBackfillItem = {
	balanceId: string;
	organizacaoId: string | null;
	clienteId: string;
	programaId: string;
	oldSaldoValorDisponivel: number;
	newSaldoValorDisponivel: number;
	totalValorRestanteAtivoAntes: number;
	totalValorRestanteAtivoDepois: number;
	missingCreditValue: number;
	overflowRemainingValue: number;
	ledgerTotalCredits?: number;
	ledgerTotalDebits?: number;
	changedAccumulations: TChangedAccumulation[];
	changedBalance: boolean;
	applied: boolean;
};

type TStrategyResult = {
	strategy: TFixStrategy;
	processedBalances: number;
	affectedBalances: number;
	appliedBalances: number;
	balancesWithNegativeValue: number;
	totalOldAvailableBalance: number;
	totalNewAvailableBalance: number;
	totalOldRemainingActive: number;
	totalNewRemainingActive: number;
	totalMissingCreditValue: number;
	totalOverflowRemainingValue: number;
	items: TBackfillItem[];
};

type TFixCashbackValuesOutput = {
	data: {
		mode: TFixMode;
		config: {
			strategies: TFixStrategy[];
			organizationIds: string[];
			clientIds: string[];
			programIds: string[];
			onlyNegativeBalances: boolean;
			limit: number;
		};
		results: TStrategyResult[];
	};
	message: string;
};

async function getBalancesToProcess() {
	const conditions = [];
	if (FIX_CONFIG.organizationIds.length > 0) conditions.push(inArray(cashbackProgramBalances.organizacaoId, FIX_CONFIG.organizationIds));
	if (FIX_CONFIG.clientIds.length > 0) conditions.push(inArray(cashbackProgramBalances.clienteId, FIX_CONFIG.clientIds));
	if (FIX_CONFIG.programIds.length > 0) conditions.push(inArray(cashbackProgramBalances.programaId, FIX_CONFIG.programIds));
	if (FIX_CONFIG.onlyNegativeBalances) conditions.push(lt(cashbackProgramBalances.saldoValorDisponivel, 0));
	if (FIX_CONFIG.onlyPositiveBalances) conditions.push(gt(cashbackProgramBalances.saldoValorDisponivel, 0));
	return await db.query.cashbackProgramBalances.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		limit: FIX_CONFIG.limit,
	});
}

async function getActiveAccumulationsForReconcile(params: { organizacaoId: string | null; clienteId: string; programaId: string }) {
	const whereConditions = [
		eq(cashbackProgramTransactions.clienteId, params.clienteId),
		eq(cashbackProgramTransactions.programaId, params.programaId),
		eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
		eq(cashbackProgramTransactions.status, "ATIVO"),
		gt(cashbackProgramTransactions.valorRestante, 0),
	];
	if (params.organizacaoId) whereConditions.push(eq(cashbackProgramTransactions.organizacaoId, params.organizacaoId));

	return await db.query.cashbackProgramTransactions.findMany({
		where: and(...whereConditions),
		// Mantém os créditos mais novos quando há overflow de valorRestante.
		orderBy: [desc(cashbackProgramTransactions.expiracaoData), desc(cashbackProgramTransactions.dataInsercao)],
		columns: {
			id: true,
			valor: true,
			valorRestante: true,
			status: true,
		},
	});
}

async function getAccumulationsForReplay(params: { organizacaoId: string | null; clienteId: string; programaId: string }) {
	const whereConditions = [
		eq(cashbackProgramTransactions.clienteId, params.clienteId),
		eq(cashbackProgramTransactions.programaId, params.programaId),
		eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
	];
	if (params.organizacaoId) whereConditions.push(eq(cashbackProgramTransactions.organizacaoId, params.organizacaoId));

	return await db.query.cashbackProgramTransactions.findMany({
		where: and(...whereConditions),
		orderBy: [asc(cashbackProgramTransactions.dataInsercao)],
		columns: {
			id: true,
			valor: true,
			valorRestante: true,
			status: true,
		},
	});
}

async function getDebitTransactionsForReplay(params: { organizacaoId: string | null; clienteId: string; programaId: string }) {
	const whereConditions = [
		eq(cashbackProgramTransactions.clienteId, params.clienteId),
		eq(cashbackProgramTransactions.programaId, params.programaId),
		inArray(cashbackProgramTransactions.tipo, ["RESGATE", "EXPIRAÇÃO", "CANCELAMENTO"]),
	];
	if (params.organizacaoId) whereConditions.push(eq(cashbackProgramTransactions.organizacaoId, params.organizacaoId));

	return await db.query.cashbackProgramTransactions.findMany({
		where: and(...whereConditions),
		orderBy: [asc(cashbackProgramTransactions.dataInsercao)],
		columns: {
			tipo: true,
			valor: true,
		},
	});
}

async function runStrategyForBalances({
	strategy,
	balances,
}: {
	strategy: TFixStrategy;
	balances: Awaited<ReturnType<typeof getBalancesToProcess>>;
}): Promise<TStrategyResult> {
	const outputItems: TBackfillItem[] = [];
	let affectedBalances = 0;
	let appliedBalances = 0;
	let balancesWithNegativeValue = 0;
	let totalOldAvailableBalance = 0;
	let totalNewAvailableBalance = 0;
	let totalOldRemainingActive = 0;
	let totalNewRemainingActive = 0;
	let totalMissingCreditValue = 0;
	let totalOverflowRemainingValue = 0;

	for (const [balanceIndex, balance] of balances.entries()) {
		console.log(`[FIX_CASHBACK_VALUES] [${strategy}] Processing balance ${balanceIndex + 1}/${balances.length}`);

		const oldSaldoDisponivel = normalizeValue(balance.saldoValorDisponivel);
		if (oldSaldoDisponivel < 0) balancesWithNegativeValue++;

		let newSaldoDisponivel = oldSaldoDisponivel;
		let oldRemainingTotal = 0;
		let newRemainingTotal = 0;
		let missingCreditValue = 0;
		let overflowRemainingValue = 0;
		let ledgerTotalCredits: number | undefined;
		let ledgerTotalDebits: number | undefined;
		const changedAccumulations: TChangedAccumulation[] = [];

		if (strategy === "reconcile") {
			const accumulations = await getActiveAccumulationsForReconcile({
				organizacaoId: balance.organizacaoId,
				clienteId: balance.clienteId,
				programaId: balance.programaId,
			});

			oldRemainingTotal = normalizeValue(accumulations.reduce((acc, t) => acc + t.valorRestante, 0));
			const nonNegativeBalance = normalizeValue(Math.max(0, oldSaldoDisponivel));
			const targetCanonicalValue = normalizeValue(Math.min(nonNegativeBalance, oldRemainingTotal));

			missingCreditValue = normalizeValue(Math.max(0, nonNegativeBalance - oldRemainingTotal));
			overflowRemainingValue = normalizeValue(Math.max(0, oldRemainingTotal - nonNegativeBalance));

			let remainingToAllocate = targetCanonicalValue;
			for (const accumulationTransaction of accumulations) {
				const allocatedValue = normalizeValue(Math.min(accumulationTransaction.valorRestante, remainingToAllocate));
				remainingToAllocate = normalizeValue(remainingToAllocate - allocatedValue);
				newRemainingTotal = normalizeValue(newRemainingTotal + allocatedValue);

				const nextStatus = allocatedValue <= EPSILON ? "CONSUMIDO" : "ATIVO";
				const hasChangedRemaining = Math.abs(accumulationTransaction.valorRestante - allocatedValue) > EPSILON;
				const hasChangedStatus = accumulationTransaction.status !== nextStatus;
				if (hasChangedRemaining || hasChangedStatus) {
					changedAccumulations.push({
						transactionId: accumulationTransaction.id,
						oldValorRestante: accumulationTransaction.valorRestante,
						newValorRestante: allocatedValue <= EPSILON ? 0 : allocatedValue,
						oldStatus: accumulationTransaction.status,
						newStatus: nextStatus,
					});
				}
			}

			newSaldoDisponivel = targetCanonicalValue;
		}

		if (strategy === "replay-ledger") {
			const [accumulations, debits] = await Promise.all([
				getAccumulationsForReplay({
					organizacaoId: balance.organizacaoId,
					clienteId: balance.clienteId,
					programaId: balance.programaId,
				}),
				getDebitTransactionsForReplay({
					organizacaoId: balance.organizacaoId,
					clienteId: balance.clienteId,
					programaId: balance.programaId,
				}),
			]);

			ledgerTotalCredits = normalizeValue(accumulations.reduce((acc, t) => acc + Math.max(0, t.valor), 0));
			ledgerTotalDebits = normalizeValue(
				debits.reduce((acc, t) => {
					if (t.tipo === "RESGATE") return acc + Math.max(0, t.valor);
					return acc + Math.abs(t.valor);
				}, 0),
			);

			oldRemainingTotal = normalizeValue(accumulations.reduce((acc, t) => acc + Math.max(0, t.valorRestante), 0));
			let remainingDebitToApply = ledgerTotalDebits;

			for (const accumulationTransaction of accumulations) {
				const originalCredit = Math.max(0, accumulationTransaction.valor);
				const consumedAmount = Math.min(originalCredit, remainingDebitToApply);
				const reconstructedRemaining = normalizeValue(originalCredit - consumedAmount);
				remainingDebitToApply = normalizeValue(remainingDebitToApply - consumedAmount);
				newRemainingTotal = normalizeValue(newRemainingTotal + reconstructedRemaining);

				const nextStatus = reconstructedRemaining <= EPSILON ? "CONSUMIDO" : "ATIVO";
				const hasChangedRemaining = Math.abs(accumulationTransaction.valorRestante - reconstructedRemaining) > EPSILON;
				const hasChangedStatus = accumulationTransaction.status !== nextStatus;
				if (hasChangedRemaining || hasChangedStatus) {
					changedAccumulations.push({
						transactionId: accumulationTransaction.id,
						oldValorRestante: accumulationTransaction.valorRestante,
						newValorRestante: reconstructedRemaining <= EPSILON ? 0 : reconstructedRemaining,
						oldStatus: accumulationTransaction.status,
						newStatus: nextStatus,
					});
				}
			}

			// Se debits > credits, o saldo correto é 0 e o "excesso" já está em overflow.
			newSaldoDisponivel = normalizeValue(Math.max(0, ledgerTotalCredits - ledgerTotalDebits));
			missingCreditValue = normalizeValue(Math.max(0, newSaldoDisponivel - oldRemainingTotal));
			overflowRemainingValue = normalizeValue(Math.max(0, oldRemainingTotal - newSaldoDisponivel));
		}

		const changedBalance = Math.abs(oldSaldoDisponivel - newSaldoDisponivel) > EPSILON;
		const hasAnyChange = changedBalance || changedAccumulations.length > 0;
		if (hasAnyChange) affectedBalances++;

		let applied = false;
		if (FIX_CONFIG.mode === "apply" && hasAnyChange) {
			await db.transaction(async (tx) => {
				for (const changedAccumulation of changedAccumulations) {
					await tx
						.update(cashbackProgramTransactions)
						.set({
							valorRestante: changedAccumulation.newValorRestante,
							status: changedAccumulation.newStatus,
							dataAtualizacao: new Date(),
						})
						.where(eq(cashbackProgramTransactions.id, changedAccumulation.transactionId));
				}

				if (changedBalance) {
					await tx
						.update(cashbackProgramBalances)
						.set({
							saldoValorDisponivel: newSaldoDisponivel,
							dataAtualizacao: new Date(),
						})
						.where(eq(cashbackProgramBalances.id, balance.id));
				}
			});
			applied = true;
			appliedBalances++;
		}

		totalOldAvailableBalance = normalizeValue(totalOldAvailableBalance + oldSaldoDisponivel);
		totalNewAvailableBalance = normalizeValue(totalNewAvailableBalance + newSaldoDisponivel);
		totalOldRemainingActive = normalizeValue(totalOldRemainingActive + oldRemainingTotal);
		totalNewRemainingActive = normalizeValue(totalNewRemainingActive + newRemainingTotal);
		totalMissingCreditValue = normalizeValue(totalMissingCreditValue + missingCreditValue);
		totalOverflowRemainingValue = normalizeValue(totalOverflowRemainingValue + overflowRemainingValue);

		if (FIX_CONFIG.includeItems) {
			outputItems.push({
				balanceId: balance.id,
				organizacaoId: balance.organizacaoId,
				clienteId: balance.clienteId,
				programaId: balance.programaId,
				oldSaldoValorDisponivel: oldSaldoDisponivel,
				newSaldoValorDisponivel: newSaldoDisponivel,
				totalValorRestanteAtivoAntes: oldRemainingTotal,
				totalValorRestanteAtivoDepois: newRemainingTotal,
				missingCreditValue,
				overflowRemainingValue,
				ledgerTotalCredits,
				ledgerTotalDebits,
				changedAccumulations,
				changedBalance,
				applied,
			});
		}
	}

	return {
		strategy,
		processedBalances: balances.length,
		affectedBalances,
		appliedBalances,
		balancesWithNegativeValue,
		totalOldAvailableBalance,
		totalNewAvailableBalance,
		totalOldRemainingActive,
		totalNewRemainingActive,
		totalMissingCreditValue,
		totalOverflowRemainingValue,
		items: outputItems,
	};
}

const fixCashbackValuesRoute: NextApiHandler<TFixCashbackValuesOutput> = async (req, res) => {
	const session = await getCurrentSessionUncached(req.cookies);
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	return res.status(200).json({
		data: {
			mode: FIX_CONFIG.mode,
			config: FIX_CONFIG,
			results: [],
		},
		message: "Simulação concluída com sucesso. Nenhuma alteração foi persistida.",
	});
	const balances = await getBalancesToProcess();
	console.log(`[FIX_CASHBACK_VALUES] Total balances found: ${balances.length}`);

	const results: TStrategyResult[] = [];
	for (const strategy of FIX_CONFIG.strategies) {
		console.log(`[FIX_CASHBACK_VALUES] Running strategy: ${strategy}`);
		results.push(await runStrategyForBalances({ strategy, balances }));
	}

	return res.status(200).json({
		data: {
			mode: FIX_CONFIG.mode,
			config: {
				strategies: FIX_CONFIG.strategies,
				organizationIds: FIX_CONFIG.organizationIds,
				clientIds: FIX_CONFIG.clientIds,
				programIds: FIX_CONFIG.programIds,
				onlyNegativeBalances: FIX_CONFIG.onlyNegativeBalances,
				limit: FIX_CONFIG.limit,
			},
			results,
		},
		message:
			FIX_CONFIG.mode === "dry-run" ? "Simulação concluída com sucesso. Nenhuma alteração foi persistida." : "Reprocessamento concluído com sucesso.",
	});
};

export default apiHandler({
	GET: fixCashbackValuesRoute,
});
