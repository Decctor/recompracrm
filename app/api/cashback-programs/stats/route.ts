import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { PeriodQueryParamSchema } from "@/schemas/query-params-utils";
import { db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions, clients, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, countDistinct, eq, gte, isNull, lt, lte, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const CashbackProgramStatsInputSchema = z.object({
	period: PeriodQueryParamSchema,
});
export type TCashbackProgramStatsInput = z.infer<typeof CashbackProgramStatsInputSchema>;

type TCashbackProgramStats = {
	totalParticipants: {
		atual: number;
		anterior: number | undefined;
	};
	totalNewParticipants: {
		atual: number;
		anterior: number | undefined;
	};
	totalCashbackGenerated: {
		atual: number;
		anterior: number | undefined;
	};
	totalCashbackRescued: {
		atual: number;
		anterior: number | undefined;
	};
	redemptionRate: {
		atual: number;
		anterior: number | undefined;
	};
	totalExpiredCashback: {
		atual: number;
		anterior: number | undefined;
	};
	totalExpiringCashback: {
		atual: number;
		anterior: number | undefined;
	};
	// Client metrics
	totalClients: {
		atual: number;
		anterior: number | undefined;
	};
	totalNewClients: {
		atual: number;
		anterior: number | undefined;
	};
	revenueFromRecurrentClients: {
		atual: number;
		anterior: number | undefined;
		percentage: number;
	};
	revenueFromNewClients: {
		atual: number;
		anterior: number | undefined;
		percentage: number;
	};
	revenueFromNonIdentifiedClients: {
		atual: number;
		anterior: number | undefined;
		percentage: number;
	};
	// Sales metrics
	totalSalesCount: {
		atual: number;
		anterior: number | undefined;
	};
	totalSalesValue: {
		atual: number;
		anterior: number | undefined;
	};
	salesWithCashbackCount: {
		atual: number;
		anterior: number | undefined;
		percentage: number;
	};
	salesWithCashbackValue: {
		atual: number;
		anterior: number | undefined;
		percentage: number;
	};
};

type GetResponse = {
	data: TCashbackProgramStats;
};

async function getCashbackProgramStats({
	input,
	session,
}: {
	input: TCashbackProgramStatsInput;
	session: TAuthUserSession;
}): Promise<GetResponse> {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const ajustedAfter = dayjs(input.period.after).toDate();
	const ajustedBefore = dayjs(input.period.before).endOf("day").toDate();

	// Calculate current period stats
	const [generatedResult, rescuedResult, expiredResult, participantsResult, newParticipantsResult] = await Promise.all([
		// Total cashback generated (ACÚMULO)
		db
			.select({ total: sum(cashbackProgramTransactions.valor) })
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
					gte(cashbackProgramTransactions.dataInsercao, ajustedAfter),
					lte(cashbackProgramTransactions.dataInsercao, ajustedBefore),
				),
			),
		// Total cashback rescued (RESGATE)
		db
			.select({ total: sum(cashbackProgramTransactions.valor) })
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.tipo, "RESGATE"),
					gte(cashbackProgramTransactions.dataInsercao, ajustedAfter),
					lte(cashbackProgramTransactions.dataInsercao, ajustedBefore),
				),
			),
		// Total expired cashback
		db
			.select({ total: sum(cashbackProgramTransactions.valor) })
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.status, "EXPIRADO"),
					gte(cashbackProgramTransactions.dataInsercao, ajustedAfter),
					lte(cashbackProgramTransactions.dataInsercao, ajustedBefore),
				),
			),
		// Total participants
		db
			.select({ total: countDistinct(cashbackProgramBalances.clienteId) })
			.from(cashbackProgramBalances)
			.where(and(eq(cashbackProgramBalances.organizacaoId, userOrgId), lte(cashbackProgramBalances.dataInsercao, ajustedBefore))),
		// Total new participants
		db
			.select({ total: countDistinct(cashbackProgramBalances.clienteId) })
			.from(cashbackProgramBalances)
			.where(
				and(
					eq(cashbackProgramBalances.organizacaoId, userOrgId),
					gte(cashbackProgramBalances.dataInsercao, ajustedAfter),
					lte(cashbackProgramBalances.dataInsercao, ajustedBefore),
				),
			),
	]);

	// Total expiring cashback (within 30 days and ATIVO)
	const expiringDate = dayjs().add(30, "days").toDate();
	const expiringResult = await db
		.select({ total: sum(cashbackProgramTransactions.valorRestante) })
		.from(cashbackProgramTransactions)
		.where(
			and(
				eq(cashbackProgramTransactions.organizacaoId, userOrgId),
				eq(cashbackProgramTransactions.status, "ATIVO"),
				lte(cashbackProgramTransactions.expiracaoData, expiringDate),
			),
		);

	const currentGenerated = generatedResult[0]?.total ? Number(generatedResult[0].total) : 0;
	const currentRescued = rescuedResult[0]?.total ? -Number(rescuedResult[0].total) : 0; // using "-" to reverse the value
	const currentExpired = expiredResult[0]?.total ? -Number(expiredResult[0].total) : 0; // using "-" to reverse the value
	const currentExpiring = expiringResult[0]?.total ? Number(expiringResult[0].total) : 0;
	const currentParticipants = participantsResult[0]?.total ? Number(participantsResult[0].total) : 0;
	const currentNewParticipants = newParticipantsResult[0]?.total ? Number(newParticipantsResult[0].total) : 0;
	const currentRedemptionRate = currentGenerated > 0 ? (currentRescued / currentGenerated) * 100 : 0;

	// Client metrics - current period
	const saleConditions = [eq(sales.organizacaoId, userOrgId), eq(sales.natureza, "SN01")];

	const [
		totalClientsResult,
		totalNewClientsResult,
		totalRevenueResult,
		existingClientsRevenueResult,
		newClientsRevenueResult,
		nonIdentifiedClientsRevenueResult,
		totalSalesCountResult,
		salesWithCashbackCountResult,
		salesWithCashbackValueResult,
	] = await Promise.all([
		// Total clients (up until periodBefore)
		db
			.select({ count: count() })
			.from(clients)
			.where(and(eq(clients.organizacaoId, userOrgId), lte(clients.primeiraCompraData, ajustedBefore))),
		// Total new clients (within period)
		db
			.select({ count: count() })
			.from(clients)
			.where(and(eq(clients.organizacaoId, userOrgId), gte(clients.primeiraCompraData, ajustedAfter), lte(clients.primeiraCompraData, ajustedBefore))),
		// Total revenue (for percentage calculation)
		db
			.select({ total: sum(sales.valorTotal), count: count() })
			.from(sales)
			.where(and(...saleConditions, gte(sales.dataVenda, ajustedAfter), lte(sales.dataVenda, ajustedBefore))),
		// Revenue from existing clients (first purchase BEFORE periodAfter)
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.innerJoin(clients, eq(sales.clienteId, clients.id))
			.where(
				and(...saleConditions, gte(sales.dataVenda, ajustedAfter), lte(sales.dataVenda, ajustedBefore), lt(clients.primeiraCompraData, ajustedAfter)),
			),
		// Revenue from new clients (first purchase WITHIN period)
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.innerJoin(clients, eq(sales.clienteId, clients.id))
			.where(
				and(
					...saleConditions,
					gte(sales.dataVenda, ajustedAfter),
					lte(sales.dataVenda, ajustedBefore),
					gte(clients.primeiraCompraData, ajustedAfter),
					lte(clients.primeiraCompraData, ajustedBefore),
				),
			),
		// Revenue from non-identified clients (sales without valid client)
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.leftJoin(clients, eq(sales.clienteId, clients.id))
			.where(and(...saleConditions, gte(sales.dataVenda, ajustedAfter), lte(sales.dataVenda, ajustedBefore), isNull(clients.id))),
		// Total sales count
		db
			.select({ count: count() })
			.from(sales)
			.where(and(...saleConditions, gte(sales.dataVenda, ajustedAfter), lte(sales.dataVenda, ajustedBefore))),
		// Sales with cashback count (RESGATE transactions)
		db
			.select({ count: count() })
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.tipo, "RESGATE"),
					gte(cashbackProgramTransactions.dataInsercao, ajustedAfter),
					lte(cashbackProgramTransactions.dataInsercao, ajustedBefore),
				),
			),
		// Sales with cashback value (sum vendaValor from RESGATE transactions)
		db
			.select({ total: sum(cashbackProgramTransactions.vendaValor) })
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.tipo, "RESGATE"),
					gte(cashbackProgramTransactions.dataInsercao, ajustedAfter),
					lte(cashbackProgramTransactions.dataInsercao, ajustedBefore),
				),
			),
	]);

	const currentTotalClients = totalClientsResult[0]?.count ?? 0;
	const currentTotalNewClients = totalNewClientsResult[0]?.count ?? 0;
	const currentTotalRevenue = Number(totalRevenueResult[0]?.total ?? 0);
	const currentTotalSalesCount = totalSalesCountResult[0]?.count ?? 0;
	const currentExistingClientsRevenue = Number(existingClientsRevenueResult[0]?.total ?? 0);
	const currentNewClientsRevenue = Number(newClientsRevenueResult[0]?.total ?? 0);
	const currentNonIdentifiedClientsRevenue = Number(nonIdentifiedClientsRevenueResult[0]?.total ?? 0);
	const currentExistingClientsRevenuePercentage = currentTotalRevenue > 0 ? (currentExistingClientsRevenue / currentTotalRevenue) * 100 : 0;
	const currentNewClientsRevenuePercentage = currentTotalRevenue > 0 ? (currentNewClientsRevenue / currentTotalRevenue) * 100 : 0;
	const currentNonIdentifiedClientsRevenuePercentage = currentTotalRevenue > 0 ? (currentNonIdentifiedClientsRevenue / currentTotalRevenue) * 100 : 0;
	// Sales with cashback metrics
	const currentSalesWithCashbackCount = salesWithCashbackCountResult[0]?.count ?? 0;
	const currentSalesWithCashbackValue = Number(salesWithCashbackValueResult[0]?.total ?? 0);
	const currentSalesWithCashbackCountPercentage = currentTotalSalesCount > 0 ? (currentSalesWithCashbackCount / currentTotalSalesCount) * 100 : 0;
	const currentSalesWithCashbackValuePercentage = currentTotalRevenue > 0 ? (currentSalesWithCashbackValue / currentTotalRevenue) * 100 : 0;

	// Calculate previous period stats
	const dateDiff = dayjs(input.period.before).diff(dayjs(input.period.after), "days");
	const previousPeriodAfter = dayjs(input.period.after).subtract(dateDiff, "days").toDate();
	const previousPeriodBefore = dayjs(input.period.before).subtract(dateDiff, "days").endOf("day").toDate();

	const [prevGeneratedResult, prevRescuedResult, prevExpiredResult, prevParticipantsResult, prevNewParticipantsResult] = await Promise.all([
		// Previous total cashback generated
		db
			.select({ total: sum(cashbackProgramTransactions.valor) })
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
					gte(cashbackProgramTransactions.dataInsercao, previousPeriodAfter),
					lte(cashbackProgramTransactions.dataInsercao, previousPeriodBefore),
				),
			),
		// Previous total cashback rescued
		db
			.select({ total: sum(cashbackProgramTransactions.valor) })
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.tipo, "RESGATE"),
					gte(cashbackProgramTransactions.dataInsercao, previousPeriodAfter),
					lte(cashbackProgramTransactions.dataInsercao, previousPeriodBefore),
				),
			),
		// Previous total expired cashback
		db
			.select({ total: sum(cashbackProgramTransactions.valor) })
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.status, "EXPIRADO"),
					gte(cashbackProgramTransactions.dataInsercao, previousPeriodAfter),
					lte(cashbackProgramTransactions.dataInsercao, previousPeriodBefore),
				),
			),
		// Previous total participants
		db
			.select({ total: countDistinct(cashbackProgramBalances.clienteId) })
			.from(cashbackProgramBalances)
			.where(and(eq(cashbackProgramBalances.organizacaoId, userOrgId), lte(cashbackProgramBalances.dataInsercao, previousPeriodBefore))),
		// Previous total new participants
		db
			.select({ total: countDistinct(cashbackProgramBalances.clienteId) })
			.from(cashbackProgramBalances)
			.where(
				and(
					eq(cashbackProgramBalances.organizacaoId, userOrgId),
					gte(cashbackProgramBalances.dataInsercao, previousPeriodAfter),
					lte(cashbackProgramBalances.dataInsercao, previousPeriodBefore),
				),
			),
	]);

	const previousGenerated = prevGeneratedResult[0]?.total ? Number(prevGeneratedResult[0].total) : 0;
	const previousRescued = prevRescuedResult[0]?.total ? Number(prevRescuedResult[0].total) : 0;
	const previousExpired = prevExpiredResult[0]?.total ? Number(prevExpiredResult[0].total) : 0;
	const previousRedemptionRate = previousGenerated > 0 ? (previousRescued / previousGenerated) * 100 : 0;
	const previousParticipants = prevParticipantsResult[0]?.total ? Number(prevParticipantsResult[0].total) : 0;

	// Client and sales metrics - previous period
	const [
		prevTotalClientsResult,
		prevTotalNewClientsResult,
		prevTotalRevenueResult,
		prevExistingClientsRevenueResult,
		prevNewClientsRevenueResult,
		prevNonIdentifiedClientsRevenueResult,
		prevTotalSalesCountResult,
		prevSalesWithCashbackCountResult,
		prevSalesWithCashbackValueResult,
	] = await Promise.all([
		// Previous total clients
		db
			.select({ count: count() })
			.from(clients)
			.where(and(eq(clients.organizacaoId, userOrgId), lte(clients.primeiraCompraData, previousPeriodBefore))),
		// Previous total new clients
		db
			.select({ count: count() })
			.from(clients)
			.where(
				and(
					eq(clients.organizacaoId, userOrgId),
					gte(clients.primeiraCompraData, previousPeriodAfter),
					lte(clients.primeiraCompraData, previousPeriodBefore),
				),
			),
		// Previous total revenue
		db
			.select({ total: sum(sales.valorTotal), count: count() })
			.from(sales)
			.where(and(...saleConditions, gte(sales.dataVenda, previousPeriodAfter), lte(sales.dataVenda, previousPeriodBefore))),
		// Previous revenue from existing clients
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.innerJoin(clients, eq(sales.clienteId, clients.id))
			.where(
				and(
					...saleConditions,
					gte(sales.dataVenda, previousPeriodAfter),
					lte(sales.dataVenda, previousPeriodBefore),
					lt(clients.primeiraCompraData, previousPeriodAfter),
				),
			),
		// Previous revenue from new clients
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.innerJoin(clients, eq(sales.clienteId, clients.id))
			.where(
				and(
					...saleConditions,
					gte(sales.dataVenda, previousPeriodAfter),
					lte(sales.dataVenda, previousPeriodBefore),
					gte(clients.primeiraCompraData, previousPeriodAfter),
					lte(clients.primeiraCompraData, previousPeriodBefore),
				),
			),
		// Previous revenue from non-identified clients
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.leftJoin(clients, eq(sales.clienteId, clients.id))
			.where(and(...saleConditions, gte(sales.dataVenda, previousPeriodAfter), lte(sales.dataVenda, previousPeriodBefore), isNull(clients.id))),
		// Previous total sales count
		db
			.select({ count: count() })
			.from(sales)
			.where(and(...saleConditions, gte(sales.dataVenda, previousPeriodAfter), lte(sales.dataVenda, previousPeriodBefore))),
		// Previous sales with cashback count
		db
			.select({ count: count() })
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.tipo, "RESGATE"),
					gte(cashbackProgramTransactions.dataInsercao, previousPeriodAfter),
					lte(cashbackProgramTransactions.dataInsercao, previousPeriodBefore),
				),
			),
		// Previous sales with cashback value
		db
			.select({ total: sum(cashbackProgramTransactions.vendaValor) })
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.tipo, "RESGATE"),
					gte(cashbackProgramTransactions.dataInsercao, previousPeriodAfter),
					lte(cashbackProgramTransactions.dataInsercao, previousPeriodBefore),
				),
			),
	]);

	const previousTotalClients = prevTotalClientsResult[0]?.count ?? 0;
	const previousTotalNewClients = prevTotalNewClientsResult[0]?.count ?? 0;
	const previousTotalRevenue = Number(prevTotalRevenueResult[0]?.total ?? 0);
	const previousTotalSalesCount = prevTotalSalesCountResult[0]?.count ?? 0;
	const previousExistingClientsRevenue = Number(prevExistingClientsRevenueResult[0]?.total ?? 0);
	const previousNewClientsRevenue = Number(prevNewClientsRevenueResult[0]?.total ?? 0);
	const previousNonIdentifiedClientsRevenue = Number(prevNonIdentifiedClientsRevenueResult[0]?.total ?? 0);
	const previousNewParticipants = prevNewParticipantsResult[0]?.total ? Number(prevNewParticipantsResult[0].total) : 0;
	// Previous sales with cashback metrics
	const previousSalesWithCashbackCount = prevSalesWithCashbackCountResult[0]?.count ?? 0;
	const previousSalesWithCashbackValue = Number(prevSalesWithCashbackValueResult[0]?.total ?? 0);
	return {
		data: {
			totalParticipants: {
				atual: currentParticipants,
				anterior: previousParticipants,
			},
			totalNewParticipants: {
				atual: currentNewParticipants,
				anterior: previousNewParticipants,
			},
			totalCashbackGenerated: {
				atual: currentGenerated,
				anterior: previousGenerated,
			},
			totalCashbackRescued: {
				atual: currentRescued,
				anterior: previousRescued,
			},
			redemptionRate: {
				atual: currentRedemptionRate,
				anterior: previousRedemptionRate,
			},
			totalExpiredCashback: {
				atual: currentExpired,
				anterior: previousExpired,
			},
			totalExpiringCashback: {
				atual: currentExpiring,
				anterior: undefined, // Expiring is a snapshot, not period-based
			},
			// Client metrics
			totalClients: {
				atual: currentTotalClients,
				anterior: previousTotalClients,
			},
			totalNewClients: {
				atual: currentTotalNewClients,
				anterior: previousTotalNewClients,
			},
			revenueFromRecurrentClients: {
				atual: currentExistingClientsRevenue,
				anterior: previousExistingClientsRevenue,
				percentage: currentExistingClientsRevenuePercentage,
			},
			revenueFromNewClients: {
				atual: currentNewClientsRevenue,
				anterior: previousNewClientsRevenue,
				percentage: currentNewClientsRevenuePercentage,
			},
			revenueFromNonIdentifiedClients: {
				atual: currentNonIdentifiedClientsRevenue,
				anterior: previousNonIdentifiedClientsRevenue,
				percentage: currentNonIdentifiedClientsRevenuePercentage,
			},
			// Sales metrics
			totalSalesCount: {
				atual: currentTotalSalesCount,
				anterior: previousTotalSalesCount,
			},
			totalSalesValue: {
				atual: currentTotalRevenue,
				anterior: previousTotalRevenue,
			},
			salesWithCashbackCount: {
				atual: currentSalesWithCashbackCount,
				anterior: previousSalesWithCashbackCount,
				percentage: currentSalesWithCashbackCountPercentage,
			},
			salesWithCashbackValue: {
				atual: currentSalesWithCashbackValue,
				anterior: previousSalesWithCashbackValue,
				percentage: currentSalesWithCashbackValuePercentage,
			},
		},
	};
}

export type TCashbackProgramStatsOutput = Awaited<ReturnType<typeof getCashbackProgramStats>>;

const getCashbackProgramStatsRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const payload = await request.json();
	const input = CashbackProgramStatsInputSchema.parse(payload);
	const result = await getCashbackProgramStats({ input, session });
	return NextResponse.json(result, { status: 200 });
};

export const POST = appApiHandler({
	POST: getCashbackProgramStatsRoute,
});
