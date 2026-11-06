import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getChartBuckets, getChartGranularity, type TChartBucket } from "@/lib/charts/period-buckets";
import { chartBucketPositionSql } from "@/lib/charts/period-buckets-sql";
import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import { canViewFinances } from "@/lib/permissions/finances";
import { db } from "@/services/drizzle";
import { financialAccounts, financialTransactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

dayjs.extend(utc);
dayjs.extend(timezone);

const GetFinancialAccountGraphInputSchema = z.object({
	contaFinanceiraId: z.string({
		required_error: "ID da conta financeira não informado.",
		invalid_type_error: "Tipo inválido para ID da conta financeira.",
	}),
	startDate: z
		.string({ invalid_type_error: "Tipo inválido para período." })
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).startOf("day").toDate() : undefined)),
	endDate: z
		.string({ invalid_type_error: "Tipo inválido para período." })
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).endOf("day").toDate() : undefined)),
	comparingStartDate: z
		.string({ invalid_type_error: "Tipo inválido para período de comparação." })
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).startOf("day").toDate() : undefined)),
	comparingEndDate: z
		.string({ invalid_type_error: "Tipo inválido para período de comparação." })
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).endOf("day").toDate() : undefined)),
});

export type TGetFinancialAccountGraphInput = z.infer<typeof GetFinancialAccountGraphInputSchema>;

async function getGraphDataForPeriod({
	period,
	buckets,
	userOrgId,
	contaFinanceiraId,
}: {
	period: { after: Date; before: Date };
	buckets: TChartBucket[];
	userOrgId: string;
	contaFinanceiraId: string;
}): Promise<Array<{ label: string; entries: number; exits: number }>> {
	const transactionData = await db
		.select({
			position: chartBucketPositionSql(financialTransactions.dataEfetivacao, buckets),
			entries: sql<number>`COALESCE(SUM(CASE WHEN ${financialTransactions.tipo} = 'ENTRADA' THEN ${financialTransactions.valor} ELSE 0 END), 0)`,
			exits: sql<number>`COALESCE(SUM(CASE WHEN ${financialTransactions.tipo} = 'SAIDA' THEN ${financialTransactions.valor} ELSE 0 END), 0)`,
		})
		.from(financialTransactions)
		.where(
			and(
				eq(financialTransactions.organizacaoId, userOrgId),
				eq(financialTransactions.contaFinanceiraId, contaFinanceiraId),
				isNotNull(financialTransactions.dataEfetivacao),
				gte(financialTransactions.dataEfetivacao, period.after),
				lte(financialTransactions.dataEfetivacao, period.before),
			),
		)
		.groupBy(chartBucketPositionSql(financialTransactions.dataEfetivacao, buckets));

	const byPosition = new Map(transactionData.map((row) => [Number(row.position), row]));
	return buckets.map((bucket, index) => {
		const row = byPosition.get(index + 1);
		return { label: bucket.label, entries: Number(row?.entries ?? 0), exits: Number(row?.exits ?? 0) };
	});
}

async function getFinancialAccountGraph({ input, session }: { input: TGetFinancialAccountGraphInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const account = await db.query.financialAccounts.findFirst({
		where: and(eq(financialAccounts.id, input.contaFinanceiraId), eq(financialAccounts.organizacaoId, userOrgId)),
		columns: { id: true },
	});
	if (!account) throw new createHttpError.NotFound("Conta financeira não encontrada.");

	const period = {
		after: input.startDate ?? dayjs().tz(OPERATION_TIMEZONE).subtract(30, "days").startOf("day").toDate(),
		before: input.endDate ?? dayjs().tz(OPERATION_TIMEZONE).endOf("day").toDate(),
	};

	// Granularidade decidida pelo período PRINCIPAL; a comparação usa a mesma, casada por posição.
	const granularity = getChartGranularity({ startDate: period.after, endDate: period.before });

	const mainData = await getGraphDataForPeriod({
		period: { after: period.after, before: period.before },
		buckets: getChartBuckets({ startDate: period.after, endDate: period.before, granularity }),
		userOrgId,
		contaFinanceiraId: input.contaFinanceiraId,
	});

	let comparisonData: Array<{ label: string; entries: number; exits: number }> | null = null;
	if (input.comparingStartDate && input.comparingEndDate) {
		comparisonData = await getGraphDataForPeriod({
			period: { after: input.comparingStartDate, before: input.comparingEndDate },
			buckets: getChartBuckets({ startDate: input.comparingStartDate, endDate: input.comparingEndDate, granularity }),
			userOrgId,
			contaFinanceiraId: input.contaFinanceiraId,
		});
	}

	const mergedData = mainData.map((item, index) => ({
		label: item.label,
		entries: item.entries,
		exits: item.exits,
		comparingEntries: comparisonData?.[index]?.entries,
		comparingExits: comparisonData?.[index]?.exits,
	}));

	return {
		data: mergedData,
		message: "Gráfico da conta financeira recuperado com sucesso.",
	};
}

export type TGetFinancialAccountGraphOutput = Awaited<ReturnType<typeof getFinancialAccountGraph>>;

const getFinancialAccountGraphRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!canViewFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para acessar o módulo financeiro.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetFinancialAccountGraphInputSchema.parse({
		contaFinanceiraId: searchParams.get("contaFinanceiraId"),
		startDate: searchParams.get("startDate") ?? null,
		endDate: searchParams.get("endDate") ?? null,
		comparingStartDate: searchParams.get("comparingStartDate") ?? null,
		comparingEndDate: searchParams.get("comparingEndDate") ?? null,
	});

	const result = await getFinancialAccountGraph({ input, session });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getFinancialAccountGraphRoute,
});
