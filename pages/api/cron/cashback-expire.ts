import { type DBTransaction, db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions, organizations } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, gt, lte } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

const handleCashbackExpire = async (req: NextApiRequest, res: NextApiResponse) => {
	console.log("[INFO] [CASHBACK_EXPIRE] Starting cashback expiration cron job");

	try {
		const organizationsList = await db.query.organizations.findMany({
			columns: { id: true },
		});

		const today = dayjs().toDate();

		for (const organization of organizationsList) {
			console.log(`[ORG: ${organization.id}] Processing organization...`);

			await db.transaction(async (tx) => {
				// Handle Expired Cashback
				const expiredTransactions = await tx.query.cashbackProgramTransactions.findMany({
					where: (fields, { and, eq, gt, lte }) =>
						and(
							eq(fields.organizacaoId, organization.id),
							eq(fields.tipo, "ACÚMULO"),
							eq(fields.status, "ATIVO"),
							gt(fields.valorRestante, 0),
							lte(fields.expiracaoData, today),
						),
				});

				console.log(`[ORG: ${organization.id}] Found ${expiredTransactions.length} expired transactions.`);

				for (const transaction of expiredTransactions) {
					const valorExpirado = transaction.valorRestante;
					console.log(`[ORG: ${organization.id}] Expiring ${valorExpirado} for client ${transaction.clienteId}.`);
					const balance = await tx.query.cashbackProgramBalances.findFirst({
						where: (fields, { and, eq }) =>
							and(eq(fields.clienteId, transaction.clienteId), eq(fields.programaId, transaction.programaId), eq(fields.organizacaoId, organization.id)),
					});

					if (balance) {
						const previousBalance = balance.saldoValorDisponivel;
						const amountToExpire = Math.max(0, Math.min(valorExpirado, previousBalance));
						const newBalance = Math.max(0, previousBalance - amountToExpire);

						// Defensive guard: never allow expirations to push balance below zero.
						if (amountToExpire > 0) {
							await tx.insert(cashbackProgramTransactions).values({
								organizacaoId: organization.id,
								clienteId: transaction.clienteId,
								programaId: transaction.programaId,
								tipo: "EXPIRAÇÃO",
								status: "EXPIRADO",
								valor: -amountToExpire,
								valorRestante: 0,
								saldoValorAnterior: previousBalance,
								saldoValorPosterior: newBalance,
								dataInsercao: new Date(),
							});
						}

						// Mark original transaction as EXPIRADO
						await tx
							.update(cashbackProgramTransactions)
							.set({
								status: "EXPIRADO",
								valorRestante: 0,
								dataAtualizacao: new Date(),
							})
							.where(eq(cashbackProgramTransactions.id, transaction.id));

						// Update client balance
						await tx
							.update(cashbackProgramBalances)
							.set({
								saldoValorDisponivel: newBalance,
								dataAtualizacao: new Date(),
							})
							.where(eq(cashbackProgramBalances.id, balance.id));
					}
				}
			});
		}

		console.log("[INFO] [CASHBACK_EXPIRE] All organizations processed successfully");
		return res.status(200).json("EXECUTADO COM SUCESSO");
	} catch (error) {
		console.error("[ERROR] [CASHBACK_EXPIRE] Fatal error:", error);
		return res.status(500).json({
			error: "Failed to process cashback expiration",
			message: error instanceof Error ? error.message : "Unknown error",
		});
	}
};

export default handleCashbackExpire;
