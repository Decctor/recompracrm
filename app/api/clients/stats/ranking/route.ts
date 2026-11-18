import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanViewClients } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { clients, sales } from "@/services/drizzle/schema";
import { and, count, desc, eq, gte, inArray, isNotNull, lte, notInArray, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { z } from "zod";

const GetClientsRankingInputSchema = z.object({
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
	rankingBy: z.enum(["purchases-total-qty", "purchases-total-value"]).optional().nullable(),
});
export type TGetClientsRankingInput = z.infer<typeof GetClientsRankingInputSchema>;

async function fetchRankingForPeriod({
	periodAfter,
	periodBefore,
	rankingBy,
	userOrgId,
}: {
	periodAfter: Date | null;
	periodBefore: Date | null;
	rankingBy: "purchases-total-qty" | "purchases-total-value" | null | undefined;
	userOrgId: string;
}) {
	// Build sale conditions (org and valid sales only (SNO1))
	const saleConditions = [eq(sales.organizacaoId, userOrgId), eq(sales.statusVenda, "CONFIRMADA")];
	if (periodAfter) saleConditions.push(gte(sales.dataVenda, periodAfter));
	if (periodBefore) saleConditions.push(lte(sales.dataVenda, periodBefore));

	// Get clients with sales in the period - group by client ID only
	const clientsWithSales = await db
		.select({
			clienteId: sales.clienteId,
			totalPurchases: count(sales.id),
			totalValue: sum(sales.valorTotal),
		})
		.from(sales)
		.where(and(...saleConditions, isNotNull(sales.clienteId)))
		.groupBy(sales.clienteId);

	// Get client IDs
	const clientIds = clientsWithSales.map((c) => c.clienteId).filter((id): id is string => id !== null);

	// Fetch client details separately
	const clientsDetails = await db.query.clients.findMany({
		where: and(eq(clients.organizacaoId, userOrgId), inArray(clients.id, clientIds)),
		columns: {
			id: true,
			nome: true,
			telefone: true,
			email: true,
		},
	});

	// Create a map for quick lookup
	const clientsMap = new Map(clientsDetails.map((client) => [client.id, client]));

	// Enrich clients with sales metrics
	const clientsWithMetrics = clientsWithSales.map((clientData) => {
		const clientId = clientData.clienteId as string;
		const clientInfo = clientsMap.get(clientId);

		return {
			clienteId: clientId,
			nome: clientInfo?.nome ? clientInfo?.nome : "AO CONSUMIDOR",
			telefone: clientInfo?.telefone || null,
			email: clientInfo?.email || null,
			totalPurchases: Number(clientData.totalPurchases),
			totalValue: Number(clientData.totalValue ?? 0),
		};
	});

	// Sort by ranking criteria
	const sortedClients = clientsWithMetrics.sort((a, b) => {
		if (rankingBy === "purchases-total-value") {
			return b.totalValue - a.totalValue;
		}
		if (rankingBy === "purchases-total-qty") {
			return b.totalPurchases - a.totalPurchases;
		}
		// Default: purchases-total-value
		return b.totalValue - a.totalValue;
	});

	// Get top 10 and add rank
	return sortedClients.slice(0, 10).map((client, index) => ({
		rank: index + 1,
		...client,
	}));
}

async function getClientsRanking({ input, session }: { input: TGetClientsRankingInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	console.log("[INFO] [GET CLIENTS RANKING] Starting:", {
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
				totalPurchasesComparison: null,
				totalValueComparison: null,
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

	// Create a map of clientId -> comparison data for quick lookup
	const comparisonMap = new Map(
		comparisonRanking.map((item) => [
			item.clienteId,
			{
				rank: item.rank,
				totalPurchases: item.totalPurchases,
				totalValue: item.totalValue,
			},
		]),
	);

	// Merge current ranking with comparison data
	const enrichedRanking = currentRanking.map((item) => {
		const comparisonData = comparisonMap.get(item.clienteId);
		const rankComparison = comparisonData?.rank ?? null;
		const rankDelta = rankComparison !== null ? rankComparison - item.rank : null;

		return {
			...item,
			rankComparison,
			rankDelta,
			totalPurchasesComparison: comparisonData?.totalPurchases ?? null,
			totalValueComparison: comparisonData?.totalValue ?? null,
		};
	});

	return {
		data: enrichedRanking,
	};
}

export type TGetClientsRankingOutput = Awaited<ReturnType<typeof getClientsRanking>>;

const getClientsRankingRoute: PagesRouteHandler<TGetClientsRankingOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanViewClients(sessionUser);

	const input = GetClientsRankingInputSchema.parse({
		periodAfter: (req.query.periodAfter as string | undefined) ?? null,
		periodBefore: (req.query.periodBefore as string | undefined) ?? null,
		comparingPeriodAfter: (req.query.comparingPeriodAfter as string | undefined) ?? null,
		comparingPeriodBefore: (req.query.comparingPeriodBefore as string | undefined) ?? null,
		rankingBy: (req.query.rankingBy as "purchases-total-qty" | "purchases-total-value" | undefined) ?? "purchases-total-value",
	});

	const data = await getClientsRanking({ input, session: sessionUser });
	return res.status(200).json(data);
};

const routeHandlers = {
	GET: getClientsRankingRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
