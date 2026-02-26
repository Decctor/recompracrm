import { formatDateAsLocale } from "@/lib/formatting";
import { db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions } from "@/services/drizzle/schema/cashback-programs";
import { and, asc, eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

const EPSILON = 1e-6;

function normalizeValue(value: number) {
	return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function normalizeWithZeroThreshold(value: number) {
	const normalizedValue = normalizeValue(value);
	return Math.abs(normalizedValue) <= EPSILON ? 0 : normalizedValue;
}

function applyAvailableBalanceDelta(currentBalance: number, transactionValue: number) {
	return normalizeWithZeroThreshold(Math.max(0, currentBalance + transactionValue));
}

async function fixCashbackValues() {
	const ORG_ID = "4a4e8578-63f0-4119-9695-a2cc068de8d6";
	const ORG_PROGRAM_ID = "6bca5acd-aaa4-4693-b402-5b2c163648ce";
	const clients = await db.query.clients.findMany({
		where: (fields, { eq }) => eq(fields.organizacaoId, ORG_ID),
		with: {
			saldos: true,
			transacoesCashback: {
				where: (fields, { eq }) => eq(fields.programaId, ORG_PROGRAM_ID),
				orderBy: [asc(cashbackProgramTransactions.dataInsercao), asc(cashbackProgramTransactions.id)],
			},
		},
	});

	const results = [];
	for (const [clientIndex, client] of clients.entries()) {
		console.log("Processing client", clientIndex + 1, "of", clients.length);
		if (client.transacoesCashback.length === 0) {
			console.log("No transactions found for client, continuing...", client.id);
			continue;
		}

		const clientPreAjustBalance = client.saldos[0]?.saldoValorDisponivel ?? 0;

		const transactionsData = client.transacoesCashback.reduce(
			(
				acc: {
					saldoValorDisponivel: number;
					saldoValorAcumuladoTotal: number;
					saldoValorResgatadoTotal: number;
					transacoes: typeof client.transacoesCashback;
				},
				transaction,
			) => {
				const initialSaldoValorDisponivel = acc.saldoValorDisponivel;
				const initialSaldoValorAcumuladoTotal = acc.saldoValorAcumuladoTotal;
				const initialSaldoValorResgatadoTotal = acc.saldoValorResgatadoTotal;
				if (transaction.tipo === "ACÚMULO") {
					const newSaldoValorDisponivel = applyAvailableBalanceDelta(initialSaldoValorDisponivel, transaction.valor);
					const newSaldoValorAcumuladoTotal = normalizeWithZeroThreshold(initialSaldoValorAcumuladoTotal + transaction.valor);

					acc.saldoValorDisponivel = newSaldoValorDisponivel;
					acc.saldoValorAcumuladoTotal = newSaldoValorAcumuladoTotal;
					acc.transacoes.push({
						id: transaction.id,
						organizacaoId: transaction.organizacaoId,
						clienteId: transaction.clienteId,
						vendaId: transaction.vendaId,
						vendaValor: transaction.vendaValor,
						programaId: transaction.programaId,
						status: transaction.status === "EXPIRADO" ? "EXPIRADO" : "ATIVO", // For "ACÚMULO" we will be reseting to apply FIFO redemptions later and actually set CONSUMIDO correctly
						tipo: transaction.tipo,
						valor: transaction.valor,
						valorRestante: transaction.status === "EXPIRADO" ? 0 : normalizeWithZeroThreshold(Math.max(0, transaction.valor)), // For "ACÚMULO", we will reset the valorRestante to the valor
						saldoValorAnterior: initialSaldoValorDisponivel,
						saldoValorPosterior: newSaldoValorDisponivel,
						expiracaoData: transaction.expiracaoData,
						// Fields to track the reward given for the redemption
						resgateRecompensaId: transaction.resgateRecompensaId,
						resgateRecompensaValor: transaction.resgateRecompensaValor,
						operadorId: transaction.operadorId,
						operadorVendedorId: transaction.operadorVendedorId,
						campanhaId: transaction.campanhaId,
						metadados: transaction.metadados,
						dataInsercao: transaction.dataInsercao,
						dataAtualizacao: transaction.dataAtualizacao,
					});
				}
				if (transaction.tipo === "RESGATE") {
					const newSaldoValorDisponivel = applyAvailableBalanceDelta(initialSaldoValorDisponivel, transaction.valor); // For "RESGATE", values are already negative, so we can add them to the saldoValorDisponivel
					const newSaldoValorResgatadoTotal = normalizeWithZeroThreshold(initialSaldoValorResgatadoTotal - transaction.valor); // here we use "-" so that the value is actually summed up
					acc.saldoValorDisponivel = newSaldoValorDisponivel;
					acc.saldoValorResgatadoTotal = newSaldoValorResgatadoTotal;
					acc.transacoes.push({
						id: transaction.id,
						organizacaoId: transaction.organizacaoId,
						clienteId: transaction.clienteId,
						vendaId: transaction.vendaId,
						vendaValor: transaction.vendaValor,
						programaId: transaction.programaId,
						status: transaction.status,
						tipo: transaction.tipo,
						valor: transaction.valor,
						valorRestante: 0, // For "RESGATE", we set 0 for valorRestante as it only applies to "ACÚMULO"
						saldoValorAnterior: initialSaldoValorDisponivel,
						saldoValorPosterior: newSaldoValorDisponivel,
						expiracaoData: transaction.expiracaoData,
						// Fields to track the reward given for the redemption
						resgateRecompensaId: transaction.resgateRecompensaId,
						resgateRecompensaValor: transaction.resgateRecompensaValor,
						operadorId: transaction.operadorId,
						operadorVendedorId: transaction.operadorVendedorId,
						campanhaId: transaction.campanhaId,
						metadados: transaction.metadados,
						dataInsercao: transaction.dataInsercao,
						dataAtualizacao: transaction.dataAtualizacao,
					});
				}
				if (transaction.tipo === "EXPIRAÇÃO") {
					const newSaldoValorDisponivel = applyAvailableBalanceDelta(initialSaldoValorDisponivel, transaction.valor); // For "EXPIRAÇÃO", values are already negative, so we can add them to the saldoValorDisponivel
					acc.saldoValorDisponivel = newSaldoValorDisponivel;
					acc.transacoes.push({
						id: transaction.id,
						organizacaoId: transaction.organizacaoId,
						clienteId: transaction.clienteId,
						vendaId: transaction.vendaId,
						vendaValor: transaction.vendaValor,
						programaId: transaction.programaId,
						status: transaction.status,
						tipo: transaction.tipo,
						valor: transaction.valor,
						valorRestante: 0, // For "EXPIRAÇÃO", we set 0 for valorRestante as it only applies to "ACÚMULO"
						saldoValorAnterior: initialSaldoValorDisponivel,
						saldoValorPosterior: newSaldoValorDisponivel,
						expiracaoData: transaction.expiracaoData,
						// Fields to track the reward given for the redemption
						resgateRecompensaId: transaction.resgateRecompensaId,
						resgateRecompensaValor: transaction.resgateRecompensaValor,
						operadorId: transaction.operadorId,
						operadorVendedorId: transaction.operadorVendedorId,
						campanhaId: transaction.campanhaId,
						metadados: transaction.metadados,
						dataInsercao: transaction.dataInsercao,
						dataAtualizacao: transaction.dataAtualizacao,
					});
				}
				if (transaction.tipo === "CANCELAMENTO") {
					const newSaldoValorDisponivel = applyAvailableBalanceDelta(initialSaldoValorDisponivel, transaction.valor); // For "CANCELAMENTO", values are already negative, so we can add them to the saldoValorDisponivel
					acc.saldoValorDisponivel = newSaldoValorDisponivel;
					acc.transacoes.push({
						id: transaction.id,
						organizacaoId: transaction.organizacaoId,
						clienteId: transaction.clienteId,
						vendaId: transaction.vendaId,
						vendaValor: transaction.vendaValor,
						programaId: transaction.programaId,
						status: transaction.status,
						tipo: transaction.tipo,
						valor: transaction.valor,
						valorRestante: 0, // For "CANCELAMENTO", we set 0 for valorRestante as it only applies to "ACÚMULO"
						saldoValorAnterior: initialSaldoValorDisponivel,
						saldoValorPosterior: newSaldoValorDisponivel,
						expiracaoData: transaction.expiracaoData,
						// Fields to track the reward given for the redemption
						resgateRecompensaId: transaction.resgateRecompensaId,
						resgateRecompensaValor: transaction.resgateRecompensaValor,
						operadorId: transaction.operadorId,
						operadorVendedorId: transaction.operadorVendedorId,
						campanhaId: transaction.campanhaId,
						metadados: transaction.metadados,
						dataInsercao: transaction.dataInsercao,
						dataAtualizacao: transaction.dataAtualizacao,
					});
				}
				return acc;
			},
			{
				saldoValorDisponivel: 0,
				saldoValorAcumuladoTotal: 0,
				saldoValorResgatadoTotal: 0,
				transacoes: [],
			},
		);

		const finalTransactions = transactionsData.transacoes.map((transaction) => ({ ...transaction }));
		const accumulationTransactions = finalTransactions
			.filter((transaction) => transaction.tipo === "ACÚMULO" && transaction.status !== "EXPIRADO")
			.sort((transactionA, transactionB) => {
				const expirationTimeA = transactionA.expiracaoData ? new Date(transactionA.expiracaoData).getTime() : Number.MAX_SAFE_INTEGER;
				const expirationTimeB = transactionB.expiracaoData ? new Date(transactionB.expiracaoData).getTime() : Number.MAX_SAFE_INTEGER;
				if (expirationTimeA !== expirationTimeB) return expirationTimeA - expirationTimeB;

				const insertedAtTimeA = new Date(transactionA.dataInsercao).getTime();
				const insertedAtTimeB = new Date(transactionB.dataInsercao).getTime();
				if (insertedAtTimeA !== insertedAtTimeB) return insertedAtTimeA - insertedAtTimeB;

				return transactionA.id.localeCompare(transactionB.id);
			});

		let accumulationCursor = 0;
		for (const transaction of finalTransactions) {
			const amountToConsume = transaction.tipo === "RESGATE" ? normalizeWithZeroThreshold(Math.abs(transaction.valor)) : 0;
			if (amountToConsume <= EPSILON) continue;

			let remainingToConsume = amountToConsume;
			while (remainingToConsume > EPSILON && accumulationCursor < accumulationTransactions.length) {
				const accumulationTransaction = accumulationTransactions[accumulationCursor];
				if (accumulationTransaction.valorRestante <= EPSILON) {
					accumulationTransaction.valorRestante = 0;
					accumulationTransaction.status = "CONSUMIDO";
					accumulationCursor++;
					continue;
				}

				const consumedValue = Math.min(accumulationTransaction.valorRestante, remainingToConsume);
				const newRemainingValue = normalizeWithZeroThreshold(accumulationTransaction.valorRestante - consumedValue);
				accumulationTransaction.valorRestante = newRemainingValue;
				accumulationTransaction.status = newRemainingValue <= EPSILON ? "CONSUMIDO" : "ATIVO";
				remainingToConsume = normalizeWithZeroThreshold(remainingToConsume - consumedValue);

				if (newRemainingValue <= EPSILON) {
					accumulationCursor++;
				}
			}

			if (remainingToConsume > EPSILON) {
				console.warn(`[FIX_CASHBACK_VALUES_V2] Could not fully consume ${remainingToConsume} for transaction ${transaction.id} (client ${client.id}).`);
			}
		}

		for (const accumulationTransaction of finalTransactions) {
			if (accumulationTransaction.tipo !== "ACÚMULO") continue;
			if (accumulationTransaction.status === "EXPIRADO") {
				accumulationTransaction.valorRestante = 0;
				continue;
			}

			accumulationTransaction.valorRestante = normalizeWithZeroThreshold(accumulationTransaction.valorRestante);
			accumulationTransaction.status = accumulationTransaction.valorRestante <= EPSILON ? "CONSUMIDO" : "ATIVO";
		}

		const clientPostAjustBalance = transactionsData.saldoValorDisponivel;

		results.push({
			clientId: client.id,
			clientPreAjustBalance,
			clientPostAjustBalance,
			clientTransactions: finalTransactions.map((t) => ({
				tipo: t.tipo,
				status: t.status,
				data: formatDateAsLocale(t.dataInsercao, true),
				dataExpiracao: t.expiracaoData ? formatDateAsLocale(t.expiracaoData, true) : null,
				valor: t.valor,
				valorRestante: t.valorRestante,
				saldoValorAnterior: t.saldoValorAnterior,
				saldoValorPosterior: t.saldoValorPosterior,
			})),
		});
		// Here we update both the client balance and each of his transactions
		await db.transaction(async (tx) => {
			await tx
				.update(cashbackProgramBalances)
				.set({
					saldoValorDisponivel: normalizeWithZeroThreshold(transactionsData.saldoValorDisponivel),
					saldoValorAcumuladoTotal: normalizeWithZeroThreshold(transactionsData.saldoValorAcumuladoTotal),
					saldoValorResgatadoTotal: normalizeWithZeroThreshold(transactionsData.saldoValorResgatadoTotal),
				})
				.where(
					and(
						eq(cashbackProgramBalances.clienteId, client.id),
						eq(cashbackProgramBalances.organizacaoId, ORG_ID),
						eq(cashbackProgramBalances.programaId, ORG_PROGRAM_ID),
					),
				);

			for (const transaction of finalTransactions) {
				await tx
					.update(cashbackProgramTransactions)
					.set({
						status: transaction.status,
						valorRestante: normalizeWithZeroThreshold(transaction.valorRestante),
						saldoValorAnterior: normalizeWithZeroThreshold(transaction.saldoValorAnterior),
						saldoValorPosterior: normalizeWithZeroThreshold(transaction.saldoValorPosterior),
					})
					.where(
						and(
							eq(cashbackProgramTransactions.id, transaction.id),
							eq(cashbackProgramTransactions.organizacaoId, ORG_ID),
							eq(cashbackProgramTransactions.programaId, ORG_PROGRAM_ID),
						),
					);
			}
		});
	}
}
