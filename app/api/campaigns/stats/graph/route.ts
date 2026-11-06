import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { CAMPAIGN_SENT_INTERACTION_STATUSES } from "@/lib/campaigns/utils";
import { getChartBuckets, getChartGranularity, type TChartBucket } from "@/lib/charts/period-buckets";
import { chartBucketPositionSql } from "@/lib/charts/period-buckets-sql";
import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import { db } from "@/services/drizzle";
import { campaignConversions, interactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, asc, count, eq, gte, inArray, lte, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

dayjs.extend(utc);
dayjs.extend(timezone);

const GetCampaignGraphInputSchema = z.object({
	graphType: z.enum(["interactions", "conversions", "revenue"], {
		required_error: "Tipo de gráfico não informado.",
		invalid_type_error: "Tipo inválido para tipo de gráfico.",
	}),
	campanhaId: z.string().optional().nullable(),
	startDate: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).startOf("day").toDate() : undefined)),
	endDate: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).endOf("day").toDate() : undefined)),
	comparingStartDate: z
		.string({
			required_error: "Período de comparação não informado.",
			invalid_type_error: "Tipo inválido para período de comparação.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).startOf("day").toDate() : undefined)),
	comparingEndDate: z
		.string({
			required_error: "Período de comparação não informado.",
			invalid_type_error: "Tipo inválido para período de comparação.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).endOf("day").toDate() : undefined)),
});

export type TGetCampaignGraphInput = z.infer<typeof GetCampaignGraphInputSchema>;

/** Série do gráfico a partir das linhas agrupadas por intervalo (`chartBucketPositionSql`, 1-based). */
function toBucketSeries(buckets: TChartBucket[], rows: Array<{ position: number; total: unknown }>): Array<{ label: string; value: number }> {
	const byPosition = new Map(rows.map((row) => [Number(row.position), row]));
	return buckets.map((bucket, index) => ({ label: bucket.label, value: Number(byPosition.get(index + 1)?.total ?? 0) }));
}

async function getGraphDataForPeriod({
	graphType,
	period,
	buckets,
	userOrgId,
	campanhaId,
}: {
	graphType: "interactions" | "conversions" | "revenue";
	period: { after: Date; before: Date };
	buckets: TChartBucket[];
	userOrgId: string;
	campanhaId?: string | null;
}): Promise<Array<{ label: string; value: number }>> {
	// Graph Type: interactions (message interactions per period)
	if (graphType === "interactions") {
		const interactionData = await db
			.select({
				position: chartBucketPositionSql(interactions.dataEnvio, buckets),
				total: count(interactions.id),
			})
			.from(interactions)
			.where(
				and(
					eq(interactions.organizacaoId, userOrgId),
					eq(interactions.tipo, "ENVIO-MENSAGEM"),
					inArray(interactions.statusEnvio, [...CAMPAIGN_SENT_INTERACTION_STATUSES]),
					gte(interactions.dataEnvio, period.after),
					lte(interactions.dataEnvio, period.before),
					...(campanhaId ? [eq(interactions.campanhaId, campanhaId)] : []),
				),
			)
			.groupBy(chartBucketPositionSql(interactions.dataEnvio, buckets));

		return toBucketSeries(buckets, interactionData);
	}

	// Graph Type: conversions (conversions per period)
	if (graphType === "conversions") {
		const conversionData = await db
			.select({
				position: chartBucketPositionSql(campaignConversions.dataConversao, buckets),
				total: count(campaignConversions.id),
			})
			.from(campaignConversions)
			.where(
				and(
					eq(campaignConversions.organizacaoId, userOrgId),
					gte(campaignConversions.dataConversao, period.after),
					lte(campaignConversions.dataConversao, period.before),
					...(campanhaId ? [eq(campaignConversions.campanhaId, campanhaId)] : []),
				),
			)
			.groupBy(chartBucketPositionSql(campaignConversions.dataConversao, buckets));

		return toBucketSeries(buckets, conversionData);
	}

	// Graph Type: revenue (revenue per period)
	if (graphType === "revenue") {
		const revenueData = await db
			.select({
				position: chartBucketPositionSql(campaignConversions.dataConversao, buckets),
				total: sum(campaignConversions.atribuicaoReceita),
			})
			.from(campaignConversions)
			.where(
				and(
					eq(campaignConversions.organizacaoId, userOrgId),
					gte(campaignConversions.dataConversao, period.after),
					lte(campaignConversions.dataConversao, period.before),
					...(campanhaId ? [eq(campaignConversions.campanhaId, campanhaId)] : []),
				),
			)
			.groupBy(chartBucketPositionSql(campaignConversions.dataConversao, buckets));

		return toBucketSeries(buckets, revenueData);
	}

	return [];
}

async function getCampaignGraph({ input, session }: { input: TGetCampaignGraphInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const period = {
		after: input.startDate,
		before: input.endDate,
	};

	// If no start period, get the first interaction date
	if (!period.after) {
		const firstInteraction = await db
			.select({
				date: interactions.dataEnvio,
			})
			.from(interactions)
			.where(eq(interactions.organizacaoId, userOrgId))
			.orderBy(asc(interactions.dataEnvio))
			.limit(1);
		const firstInteractionDate = firstInteraction[0]?.date;
		if (!firstInteractionDate) throw new createHttpError.BadRequest("Não foi possível encontrar a primeira interação cadastrada.");
		// Começa no início do dia local, para o primeiro intervalo não sair cortado no instante exato da
		// primeira interação.
		period.after = dayjs(firstInteractionDate).tz(OPERATION_TIMEZONE).startOf("day").toDate();
	}

	if (!period.before) {
		period.before = new Date();
	}

	// Granularidade decidida pelo período PRINCIPAL; a comparação usa a mesma, casada por posição.
	const granularity = getChartGranularity({ startDate: period.after, endDate: period.before });

	// Get main period data
	const mainData = await getGraphDataForPeriod({
		graphType: input.graphType,
		period: { after: period.after, before: period.before },
		buckets: getChartBuckets({ startDate: period.after, endDate: period.before, granularity }),
		userOrgId,
		campanhaId: input.campanhaId,
	});

	let comparisonData: Array<{ label: string; value: number }> | null = null;
	if (input.comparingStartDate && input.comparingEndDate) {
		comparisonData = await getGraphDataForPeriod({
			graphType: input.graphType,
			period: { after: input.comparingStartDate, before: input.comparingEndDate },
			buckets: getChartBuckets({ startDate: input.comparingStartDate, endDate: input.comparingEndDate, granularity }),
			userOrgId,
			campanhaId: input.campanhaId,
		});
	}

	// Merge by index
	const mergedData = mainData.map((item, index) => ({
		label: item.label,
		value: item.value,
		comparisonLabel: comparisonData?.[index]?.label,
		comparisonValue: comparisonData?.[index]?.value,
	}));

	return {
		data: mergedData,
		message: "Gráfico de campanhas recuperado com sucesso.",
	};
}

export type TGetCampaignGraphOutput = Awaited<ReturnType<typeof getCampaignGraph>>;

const getCampaignGraphRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetCampaignGraphInputSchema.parse({
		graphType: searchParams.get("graphType") as "interactions" | "conversions" | "revenue",
		startDate: searchParams.get("startDate") ?? null,
		endDate: searchParams.get("endDate") ?? null,
		comparingStartDate: searchParams.get("comparingStartDate") ?? null,
		comparingEndDate: searchParams.get("comparingEndDate") ?? null,
		campanhaId: searchParams.get("campanhaId") ?? null,
	});

	const result = await getCampaignGraph({ input, session: session });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getCampaignGraphRoute,
});
