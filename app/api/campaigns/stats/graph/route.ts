import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getBestNumberOfPointsBetweenDates, getDateBuckets, getEvenlySpacedDates } from "@/lib/dates";
import { db } from "@/services/drizzle";
import { campaignConversions, interactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, asc, count, eq, gte, lte, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
		.transform((v) => (v ? dayjs(v).startOf("day").toDate() : undefined)),
	endDate: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).endOf("day").toDate() : undefined)),
	comparingStartDate: z
		.string({
			required_error: "Período de comparação não informado.",
			invalid_type_error: "Tipo inválido para período de comparação.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).startOf("day").toDate() : undefined)),
	comparingEndDate: z
		.string({
			required_error: "Período de comparação não informado.",
			invalid_type_error: "Tipo inválido para período de comparação.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).endOf("day").toDate() : undefined)),
});

export type TGetCampaignGraphInput = z.infer<typeof GetCampaignGraphInputSchema>;

async function getGraphDataForPeriod({
	graphType,
	period,
	bucketCount,
	groupingFormat,
	userOrgId,
	campanhaId,
}: {
	graphType: "interactions" | "conversions" | "revenue";
	period: { after: Date; before: Date };
	bucketCount: number;
	groupingFormat: string;
	userOrgId: string;
	campanhaId?: string | null;
}): Promise<Array<{ label: string; value: number }>> {
	const periodDatesStrs = getEvenlySpacedDates({
		startDate: period.after,
		endDate: period.before,
		points: bucketCount,
	});

	const periodDateBuckets = getDateBuckets(periodDatesStrs);

	// Graph Type: interactions (message interactions per period)
	if (graphType === "interactions") {
		const interactionData = await db
			.select({
				date: sql<string>`date_trunc('day', ${interactions.dataInsercao})::text`,
				total: count(interactions.id),
			})
			.from(interactions)
			.where(
				and(
					eq(interactions.organizacaoId, userOrgId),
					eq(interactions.tipo, "ENVIO-MENSAGEM"),
					gte(interactions.dataInsercao, period.after),
					lte(interactions.dataInsercao, period.before),
					...(campanhaId ? [eq(interactions.campanhaId, campanhaId)] : []),
				),
			)
			.orderBy(sql`date_trunc('day', ${interactions.dataInsercao})`)
			.groupBy(sql`date_trunc('day', ${interactions.dataInsercao})`);

		const initialData = Object.fromEntries(periodDatesStrs.map((date) => [dayjs(date).format(groupingFormat), { value: 0 }]));

		const dataReduced = interactionData.reduce((acc, current) => {
			const itemDate = new Date(current.date);
			const itemTime = itemDate.getTime();

			const bucket = periodDateBuckets.find((b) => itemTime >= b.start && itemTime <= b.end);
			if (!bucket) return acc;

			const key = dayjs(bucket.key).format(groupingFormat);
			if (!acc[key]) acc[key] = { value: 0 };

			acc[key].value += Number(current.total);
			return acc;
		}, initialData);

		return Object.entries(dataReduced).map(([key, value]) => ({
			label: key,
			value: value.value,
		}));
	}

	// Graph Type: conversions (conversions per period)
	if (graphType === "conversions") {
		const conversionData = await db
			.select({
				date: sql<string>`date_trunc('day', ${campaignConversions.dataConversao})::text`,
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
			.orderBy(sql`date_trunc('day', ${campaignConversions.dataConversao})`)
			.groupBy(sql`date_trunc('day', ${campaignConversions.dataConversao})`);

		const initialData = Object.fromEntries(periodDatesStrs.map((date) => [dayjs(date).format(groupingFormat), { value: 0 }]));

		const dataReduced = conversionData.reduce((acc, current) => {
			const itemDate = new Date(current.date);
			const itemTime = itemDate.getTime();

			const bucket = periodDateBuckets.find((b) => itemTime >= b.start && itemTime <= b.end);
			if (!bucket) return acc;

			const key = dayjs(bucket.key).format(groupingFormat);
			if (!acc[key]) acc[key] = { value: 0 };

			acc[key].value += Number(current.total);
			return acc;
		}, initialData);

		return Object.entries(dataReduced).map(([key, value]) => ({
			label: key,
			value: value.value,
		}));
	}

	// Graph Type: revenue (revenue per period)
	if (graphType === "revenue") {
		const revenueData = await db
			.select({
				date: sql<string>`date_trunc('day', ${campaignConversions.dataConversao})::text`,
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
			.orderBy(sql`date_trunc('day', ${campaignConversions.dataConversao})`)
			.groupBy(sql`date_trunc('day', ${campaignConversions.dataConversao})`);

		const initialData = Object.fromEntries(periodDatesStrs.map((date) => [dayjs(date).format(groupingFormat), { value: 0 }]));

		const dataReduced = revenueData.reduce((acc, current) => {
			const itemDate = new Date(current.date);
			const itemTime = itemDate.getTime();

			const bucket = periodDateBuckets.find((b) => itemTime >= b.start && itemTime <= b.end);
			if (!bucket) return acc;

			const key = dayjs(bucket.key).format(groupingFormat);
			if (!acc[key]) acc[key] = { value: 0 };

			acc[key].value += Number(current.total ?? 0);
			return acc;
		}, initialData);

		return Object.entries(dataReduced).map(([key, value]) => ({
			label: key,
			value: value.value,
		}));
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
				date: interactions.dataInsercao,
			})
			.from(interactions)
			.where(eq(interactions.organizacaoId, userOrgId))
			.orderBy(asc(interactions.dataInsercao))
			.limit(1);
		period.after = firstInteraction[0]?.date ?? undefined;
		if (!period.after) throw new createHttpError.BadRequest("Não foi possível encontrar a primeira interação cadastrada.");
	}

	if (!period.before) {
		period.before = new Date();
	}

	// Calculate bucket config from MAIN period
	const { points: bestNumberOfPointsForPeriodsDates, groupingFormat } = getBestNumberOfPointsBetweenDates({
		startDate: period.after,
		endDate: period.before,
	});

	// Get main period data
	const mainData = await getGraphDataForPeriod({
		graphType: input.graphType,
		period: { after: period.after, before: period.before },
		bucketCount: bestNumberOfPointsForPeriodsDates,
		groupingFormat,
		userOrgId,
		campanhaId: input.campanhaId,
	});

	// If comparison period exists, get comparison data with SAME bucket count
	let comparisonData: Array<{ label: string; value: number }> | null = null;
	if (input.comparingStartDate && input.comparingEndDate) {
		comparisonData = await getGraphDataForPeriod({
			graphType: input.graphType,
			period: { after: input.comparingStartDate, before: input.comparingEndDate },
			bucketCount: bestNumberOfPointsForPeriodsDates,
			groupingFormat,
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
