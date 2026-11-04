import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { getProductSalesLines } from "@/lib/products/product-sales-lines";
import { partners, sales } from "@/services/drizzle/schema";
import { and, eq, gte, inArray, isNotNull, lte, notInArray, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetPartnersRankingInputSchema = z.object({
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
			required_error: "Período de comparação não informado.",
			invalid_type_error: "Tipo inválido para período de comparação.",
		})
		.datetime({ message: "Tipo inválido para período de comparação." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	comparingPeriodBefore: z
		.string({
			required_error: "Período de comparação não informado.",
			invalid_type_error: "Tipo inválido para período de comparação.",
		})
		.datetime({ message: "Tipo inválido para período de comparação." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	rankingBy: z.enum(["sales-total-value", "sales-total-qty", "average-ticket", "margin"]).optional().nullable(),
});

export type TGetPartnersRankingInput = z.infer<typeof GetPartnersRankingInputSchema>;

async function fetchRankingForPeriod({
	periodAfter,
	periodBefore,
	rankingBy,
	userOrgId,
}: {
	periodAfter: Date | null;
	periodBefore: Date | null;
	rankingBy: "sales-total-value" | "sales-total-qty" | "average-ticket" | "margin" | null | undefined;
	userOrgId: string;
}) {
	// Build sale conditions
	const saleConditions = [eq(sales.organizacaoId, userOrgId), isNotNull(sales.dataVenda), isNotNull(sales.parceiroId), eq(sales.statusVenda, "CONFIRMADA")];
	if (periodAfter) saleConditions.push(gte(sales.dataVenda, periodAfter));
	if (periodBefore) saleConditions.push(lte(sales.dataVenda, periodBefore));

	// Get partners with sales and margin data
	// Linhas atribuídas a produto: o custo inclui o do produto vinculado a cada adicional
	// (lib/products/product-sales-lines.ts). A receita é a mesma de sale_items.
	const lines = getProductSalesLines({ organizationId: userOrgId });
	const partnersWithMargin = await db
		.select({
			parceiroId: sales.parceiroId,
			totalRevenue: sum(lines.valorVendaTotalLiquido),
			totalCost: sum(lines.valorCustoTotal),
			// Uma por linha de item, como antes (count(sales.id) sobre o join com sale_items): as
			// linhas de adicional não entram na contagem.
			totalSalesQty: sql<number>`count(*) filter (where ${lines.origem} = 'ITEM')`,
		})
		.from(sales)
		.innerJoin(lines, eq(sales.id, lines.vendaId))
		.where(and(...saleConditions, eq(lines.organizacaoId, userOrgId)))
		.groupBy(sales.parceiroId);

	// Get partner details
	const partnerIds = partnersWithMargin.map((p) => p.parceiroId).filter((id): id is string => id !== null);
	const partnersDetails = await db.query.partners.findMany({
		where: and(eq(partners.organizacaoId, userOrgId), inArray(partners.id, partnerIds)),
		columns: {
			id: true,
			nome: true,
			avatarUrl: true,
			cpfCnpj: true,
			telefone: true,
		},
	});

	const partnersMap = new Map(partnersDetails.map((partner) => [partner.id, partner]));

	// Calculate metrics for each partner
	const partnersWithMetrics = partnersWithMargin.map((partnerData) => {
		const partnerId = partnerData.parceiroId as string;
		const partnerInfo = partnersMap.get(partnerId);
		const totalRevenue = Number(partnerData.totalRevenue ?? 0);
		const totalCost = Number(partnerData.totalCost ?? 0);
		const totalMargin = totalRevenue - totalCost;
		const marginPercentage = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
		const totalSalesQty = Number(partnerData.totalSalesQty ?? 0);
		const averageTicket = totalSalesQty > 0 ? totalRevenue / totalSalesQty : 0;

		return {
			parceiroId: partnerId,
			parceiroNome: partnerInfo?.nome || "N/A",
			parceiroAvatarUrl: partnerInfo?.avatarUrl || null,
			parceiroCpfCnpj: partnerInfo?.cpfCnpj || null,
			parceiroTelefone: partnerInfo?.telefone || null,
			totalRevenue,
			totalCost,
			totalMargin,
			marginPercentage,
			totalSalesQty,
			averageTicket,
		};
	});

	// Sort by ranking criteria
	const sortedPartners = partnersWithMetrics.sort((a, b) => {
		if (rankingBy === "sales-total-value") {
			return b.totalRevenue - a.totalRevenue;
		}
		if (rankingBy === "sales-total-qty") {
			return b.totalSalesQty - a.totalSalesQty;
		}
		if (rankingBy === "average-ticket") {
			return b.averageTicket - a.averageTicket;
		}
		if (rankingBy === "margin") {
			return b.totalMargin - a.totalMargin;
		}
		// Default: sales-total-value
		return b.totalRevenue - a.totalRevenue;
	});

	// Get top 10 and add rank
	return sortedPartners.slice(0, 10).map((partner, index) => ({
		rank: index + 1,
		parceiroId: partner.parceiroId,
		parceiroNome: partner.parceiroNome,
		parceiroAvatarUrl: partner.parceiroAvatarUrl,
		parceiroCpfCnpj: partner.parceiroCpfCnpj,
		parceiroTelefone: partner.parceiroTelefone,
		totalRevenue: partner.totalRevenue,
		totalCost: partner.totalCost,
		totalMargin: partner.totalMargin,
		marginPercentage: partner.marginPercentage,
		totalSalesQty: partner.totalSalesQty,
		averageTicket: partner.averageTicket,
	}));
}

async function getPartnersRanking({ input, session }: { input: TGetPartnersRankingInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	console.log("[INFO] [GET PARTNERS RANKING] Starting:", {
		userOrg: userOrgId,
		input,
	});

	const { periodAfter, periodBefore, comparingPeriodAfter, comparingPeriodBefore, rankingBy } = input;

	// Fetch current period ranking
	const currentRanking = await fetchRankingForPeriod({
		periodAfter,
		periodBefore,
		rankingBy,
		userOrgId,
	});

	// If no comparison period, return current ranking without comparison fields
	if (!comparingPeriodAfter || !comparingPeriodBefore) {
		return {
			data: currentRanking.map((item) => ({
				...item,
				rankComparison: null,
				rankDelta: null,
				totalRevenueComparison: null,
				totalSalesQtyComparison: null,
				averageTicketComparison: null,
				totalMarginComparison: null,
				marginPercentageComparison: null,
			})),
		};
	}

	// Fetch comparison period ranking
	const comparisonRanking = await fetchRankingForPeriod({
		periodAfter: comparingPeriodAfter,
		periodBefore: comparingPeriodBefore,
		rankingBy,
		userOrgId,
	});

	// Create a map of parceiroId -> comparison data for quick lookup
	const comparisonMap = new Map(
		comparisonRanking.map((item) => [
			item.parceiroId,
			{
				rank: item.rank,
				totalRevenue: item.totalRevenue,
				totalSalesQty: item.totalSalesQty,
				averageTicket: item.averageTicket,
				totalMargin: item.totalMargin,
				marginPercentage: item.marginPercentage,
			},
		]),
	);

	// Merge current ranking with comparison data
	const enrichedRanking = currentRanking.map((item) => {
		const comparisonData = comparisonMap.get(item.parceiroId);
		const rankComparison = comparisonData?.rank ?? null;
		const rankDelta = rankComparison !== null ? rankComparison - item.rank : null;

		return {
			...item,
			rankComparison,
			rankDelta,
			totalRevenueComparison: comparisonData?.totalRevenue ?? null,
			totalSalesQtyComparison: comparisonData?.totalSalesQty ?? null,
			averageTicketComparison: comparisonData?.averageTicket ?? null,
			totalMarginComparison: comparisonData?.totalMargin ?? null,
			marginPercentageComparison: comparisonData?.marginPercentage ?? null,
		};
	});

	return {
		data: enrichedRanking,
	};
}

export type TGetPartnersRankingOutput = Awaited<ReturnType<typeof getPartnersRanking>>;

const getPartnersRankingRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const searchParams = await request.nextUrl.searchParams;
	const input = GetPartnersRankingInputSchema.parse({
		periodAfter: searchParams.get("periodAfter") ?? null,
		periodBefore: searchParams.get("periodBefore") ?? null,
		comparingPeriodAfter: searchParams.get("comparingPeriodAfter") ?? null,
		comparingPeriodBefore: searchParams.get("comparingPeriodBefore") ?? null,
		rankingBy:
			(searchParams.get("rankingBy") as "sales-total-value" | "sales-total-qty" | "average-ticket" | "margin" | undefined) ?? "sales-total-value",
	});

	const data = await getPartnersRanking({ input, session });
	return NextResponse.json(data);
};

export const GET = appApiHandler({
	GET: getPartnersRankingRoute,
});
