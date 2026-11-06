import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getChartBuckets, type TChartBucket } from "@/lib/charts/period-buckets";
import { chartBucketPositionSql } from "@/lib/charts/period-buckets-sql";
import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import { db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, asc, countDistinct, eq, gte, lte, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

dayjs.extend(utc);
dayjs.extend(timezone);

const CashbackProgramsGraphInputSchema = z.object({
	graphType: z.enum(["participants-growth", "total-cashback-generated", "total-cashback-rescued"]),
	periodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).startOf("day").toDate() : undefined)),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).endOf("day").toDate() : undefined)),
});
export type TCashbackProgramsGraphInput = z.infer<typeof CashbackProgramsGraphInputSchema>;

/**
 * Lê as linhas agrupadas por intervalo (`chartBucketPositionSql`, 1-based) e transforma em valores
 * acumulados, partindo do total anterior ao período.
 */
function accumulateBucketRows({
	buckets,
	rows,
	initialTotal,
}: {
	buckets: TChartBucket[];
	rows: Array<{ position: number; total: unknown }>;
	initialTotal: number;
}): Array<{ label: string; value: number }> {
	const byPosition = new Map(rows.map((row) => [Number(row.position), row]));

	// Transformar em valores acumulados
	let accumulated = initialTotal;
	return buckets.map((bucket, index) => {
		accumulated += Number(byPosition.get(index + 1)?.total ?? 0);
		return { label: bucket.label, value: accumulated };
	});
}

// We will have graphs for:
// - participants growth
// - total (cummulative) cashback generated
// - total (cummulative) cashback rescued
async function getCashbackProgramsGraph({ input, sessionUser }: { input: TCashbackProgramsGraphInput; sessionUser: TAuthUserSession }) {
	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const period = {
		after: input.periodAfter,
		before: input.periodBefore,
	};

	console.log(`[ORG: ${userOrgId}] [INFO] [GET CASHBACK PROGRAMS GRAPH] Period:`, period);
	if (!period.after) {
		const firstCashbackProgramAssociation = await db
			.select({
				date: cashbackProgramBalances.dataInsercao,
			})
			.from(cashbackProgramBalances)
			.where(eq(cashbackProgramBalances.organizacaoId, userOrgId))
			.orderBy(asc(cashbackProgramBalances.dataInsercao))
			.limit(1);
		const firstAssociationDate = firstCashbackProgramAssociation[0]?.date;
		if (!firstAssociationDate) throw new createHttpError.BadRequest("Não foi possível encontrar a primeira associação do programa de cashback.");
		// Começa no início do dia local, para o primeiro intervalo não sair cortado no instante exato da
		// primeira associação.
		period.after = dayjs(firstAssociationDate).tz(OPERATION_TIMEZONE).startOf("day").toDate();
	}

	if (!period.before) {
		period.before = new Date();
	}

	const buckets = getChartBuckets({ startDate: period.after, endDate: period.before });

	if (input.graphType === "participants-growth") {
		// Obter total de participantes ANTES do início do período
		const participantsBeforePeriod = await db
			.select({
				total: countDistinct(cashbackProgramBalances.clienteId),
			})
			.from(cashbackProgramBalances)
			.where(and(eq(cashbackProgramBalances.organizacaoId, userOrgId), lte(cashbackProgramBalances.dataInsercao, period.after)));

		const initialTotal = Number(participantsBeforePeriod[0]?.total || 0);

		const participantsGrowth = await db
			.select({
				position: chartBucketPositionSql(cashbackProgramBalances.dataInsercao, buckets),
				total: countDistinct(cashbackProgramBalances.clienteId),
			})
			.from(cashbackProgramBalances)
			.where(
				and(
					eq(cashbackProgramBalances.organizacaoId, userOrgId),
					gte(cashbackProgramBalances.dataInsercao, period.after),
					lte(cashbackProgramBalances.dataInsercao, period.before),
				),
			)
			.groupBy(chartBucketPositionSql(cashbackProgramBalances.dataInsercao, buckets));

		return {
			data: accumulateBucketRows({ buckets, rows: participantsGrowth, initialTotal }),
		};
	}

	if (input.graphType === "total-cashback-generated") {
		// Obter total de cashback gerado ANTES do início do período
		const cashbackGeneratedBeforePeriod = await db
			.select({
				total: sum(cashbackProgramTransactions.valor),
			})
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
					lte(cashbackProgramTransactions.dataInsercao, period.after),
				),
			);

		const initialTotal = Number(cashbackGeneratedBeforePeriod[0]?.total || 0);

		const totalCashbackGenerated = await db
			.select({
				position: chartBucketPositionSql(cashbackProgramTransactions.dataInsercao, buckets),
				total: sum(cashbackProgramTransactions.valor),
			})
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
					gte(cashbackProgramTransactions.dataInsercao, period.after),
					lte(cashbackProgramTransactions.dataInsercao, period.before),
				),
			)
			.groupBy(chartBucketPositionSql(cashbackProgramTransactions.dataInsercao, buckets));

		return {
			data: accumulateBucketRows({ buckets, rows: totalCashbackGenerated, initialTotal }),
		};
	}

	if (input.graphType === "total-cashback-rescued") {
		// Obter total de cashback resgatado ANTES do início do período
		const cashbackRescuedBeforePeriod = await db
			.select({
				total: sum(cashbackProgramTransactions.valor),
			})
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.tipo, "RESGATE"),
					lte(cashbackProgramTransactions.dataInsercao, period.after),
				),
			);

		const initialTotal = Number(cashbackRescuedBeforePeriod[0]?.total || 0);

		const totalCashbackRescued = await db
			.select({
				position: chartBucketPositionSql(cashbackProgramTransactions.dataInsercao, buckets),
				total: sum(cashbackProgramTransactions.valor),
			})
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, userOrgId),
					eq(cashbackProgramTransactions.tipo, "RESGATE"),
					gte(cashbackProgramTransactions.dataInsercao, period.after),
					lte(cashbackProgramTransactions.dataInsercao, period.before),
				),
			)
			.groupBy(chartBucketPositionSql(cashbackProgramTransactions.dataInsercao, buckets));

		return {
			data: accumulateBucketRows({ buckets, rows: totalCashbackRescued, initialTotal }),
		};
	}

	return {
		data: [],
	};
}
export type TCashbackProgramsGraphOutput = Awaited<ReturnType<typeof getCashbackProgramsGraph>>;
const getCashbackProgramsGraphRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const searchParams = request.nextUrl.searchParams;
	console.log("[INFO] [GET CASHBACK PROGRAMS GRAPH] Search params:", searchParams);
	const input = CashbackProgramsGraphInputSchema.parse({
		graphType: searchParams.get("graphType") as "participants-growth" | "total-cashback-generated" | "total-cashback-rescued",
		periodAfter: searchParams.get("periodAfter") as string | undefined,
		periodBefore: searchParams.get("periodBefore") as string | undefined,
	});
	const result = await getCashbackProgramsGraph({ input, sessionUser: session });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getCashbackProgramsGraphRoute,
});
