import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { partners, sales } from "@/services/drizzle/schema";
import { and, count, countDistinct, eq, gte, isNotNull, lte, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetPartnersOverallStatsInputSchema = z.object({
	periodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	comparingPeriodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	comparingPeriodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
});

export type TGetPartnersOverallStatsInput = z.infer<typeof GetPartnersOverallStatsInputSchema>;

async function getPartnersOverallStats({ input, session }: { input: TGetPartnersOverallStatsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	console.log("[INFO] [GET PARTNERS OVERALL STATS] Starting:", {
		userOrg: userOrgId,
		input,
	});

	const { periodAfter, periodBefore, comparingPeriodAfter, comparingPeriodBefore } = input;

	// 1. Total partners count (all partners in organization)
	const totalPartnersResult = await db.select({ count: count() }).from(partners).where(eq(partners.organizacaoId, userOrgId));

	// 2. Active partners (partners who made sales in the period)
	const saleConditions = [eq(sales.organizacaoId, userOrgId), isNotNull(sales.dataVenda), eq(sales.statusVenda, "CONFIRMADA")];
	if (periodAfter) saleConditions.push(gte(sales.dataVenda, periodAfter));
	if (periodBefore) saleConditions.push(lte(sales.dataVenda, periodBefore));

	const activePartnersResult = await db
		.select({ count: countDistinct(sales.parceiroId) })
		.from(sales)
		.where(and(...saleConditions, isNotNull(sales.parceiroId)));

	// 3. Total revenue and sales count
	const revenueResult = await db
		.select({
			totalRevenue: sum(sales.valorTotal),
			salesCount: count(sales.id),
		})
		.from(sales)
		.where(and(...saleConditions));

	const totalRevenue = Number(revenueResult[0]?.totalRevenue ?? 0);
	const salesCount = Number(revenueResult[0]?.salesCount ?? 0);
	const averageTicket = salesCount > 0 ? totalRevenue / salesCount : 0;

	// If no comparison period, return current stats only
	if (!comparingPeriodAfter && !comparingPeriodBefore) {
		return {
			data: {
				totalPartners: {
					current: totalPartnersResult[0]?.count ?? 0,
					comparison: null,
				},
				activePartners: {
					current: Number(activePartnersResult[0]?.count ?? 0),
					comparison: null,
				},
				totalRevenue: {
					current: totalRevenue,
					comparison: null,
				},
				averageTicket: {
					current: averageTicket,
					comparison: null,
				},
			},
		};
	}

	// Calculate comparison period stats
	const comparisonSaleConditions = [eq(sales.organizacaoId, userOrgId), isNotNull(sales.dataVenda), eq(sales.statusVenda, "CONFIRMADA")];
	if (comparingPeriodAfter) comparisonSaleConditions.push(gte(sales.dataVenda, comparingPeriodAfter));
	if (comparingPeriodBefore) comparisonSaleConditions.push(lte(sales.dataVenda, comparingPeriodBefore));

	const comparisonTotalPartnersResult = await db.select({ count: count() }).from(partners).where(eq(partners.organizacaoId, userOrgId));

	const comparisonActivePartnersResult = await db
		.select({ count: countDistinct(sales.parceiroId) })
		.from(sales)
		.where(and(...comparisonSaleConditions, isNotNull(sales.parceiroId)));

	const comparisonRevenueResult = await db
		.select({
			totalRevenue: sum(sales.valorTotal),
			salesCount: count(sales.id),
		})
		.from(sales)
		.where(and(...comparisonSaleConditions));

	const comparisonTotalRevenue = Number(comparisonRevenueResult[0]?.totalRevenue ?? 0);
	const comparisonSalesCount = Number(comparisonRevenueResult[0]?.salesCount ?? 0);
	const comparisonAverageTicket = comparisonSalesCount > 0 ? comparisonTotalRevenue / comparisonSalesCount : 0;

	return {
		data: {
			totalPartners: {
				current: totalPartnersResult[0]?.count ?? 0,
				comparison: comparisonTotalPartnersResult[0]?.count ?? 0,
			},
			activePartners: {
				current: Number(activePartnersResult[0]?.count ?? 0),
				comparison: Number(comparisonActivePartnersResult[0]?.count ?? 0),
			},
			totalRevenue: {
				current: totalRevenue,
				comparison: comparisonTotalRevenue,
			},
			averageTicket: {
				current: averageTicket,
				comparison: comparisonAverageTicket,
			},
		},
	};
}

export type TGetPartnersOverallStatsOutput = Awaited<ReturnType<typeof getPartnersOverallStats>>;

const getPartnersOverallStatsRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership?.permissoes.empresa.visualizar) throw new createHttpError.Forbidden("Você não possui permissão para visualizar parceiros.");

	const searchParams = await request.nextUrl.searchParams;
	const input = GetPartnersOverallStatsInputSchema.parse({
		periodAfter: searchParams.get("periodAfter") ?? null,
		periodBefore: searchParams.get("periodBefore") ?? null,
		comparingPeriodAfter: searchParams.get("comparingPeriodAfter") ?? null,
		comparingPeriodBefore: searchParams.get("comparingPeriodBefore") ?? null,
	});

	const data = await getPartnersOverallStats({ input, session });
	return NextResponse.json(data);
};

export const GET = appApiHandler({
	GET: getPartnersOverallStatsRoute,
});
