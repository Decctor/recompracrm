import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanViewClients } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getValidSaleConditions } from "@/lib/sales/valid-sale";
import { db } from "@/services/drizzle";
import { clients, sales } from "@/services/drizzle/schema";
import { and, count, eq, gte, isNotNull, isNull, lt, lte, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";

const GetClientsOverallStatsInputSchema = z.object({
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

export type TGetClientsOverallStatsInput = z.infer<typeof GetClientsOverallStatsInputSchema>;

// ============================================================================
// Métricas de SNAPSHOT (acumuladas): retratam a base como ela estava ao final
// do período selecionado ("até"), e não o que aconteceu dentro do período.
// ============================================================================

async function countClientsUpTo({ orgId, until }: { orgId: string; until: Date | null }) {
	const result = await db
		.select({ count: count() })
		.from(clients)
		.where(and(eq(clients.organizacaoId, orgId), until ? lte(clients.primeiraCompraData, until) : undefined));
	return result[0]?.count ?? 0;
}

/**
 * LTV: gasto médio por cliente identificado ao longo da vida (todas as vendas válidas até o
 * fim do período). Vendas sem cliente ("AO CONSUMIDOR") ficam fora — agrupá-las viraria um
 * pseudo-cliente único gigante distorcendo a média.
 */
async function computeLtvSnapshot({ orgId, until }: { orgId: string; until: Date | null }) {
	const perClient = db
		.select({ totalCliente: sum(sales.valorTotal).as("total_cliente") })
		.from(sales)
		.where(and(...getValidSaleConditions({ orgId }), isNotNull(sales.clienteId), until ? lte(sales.dataVenda, until) : undefined))
		.groupBy(sales.clienteId)
		.as("vendas_por_cliente");

	const result = await db.select({ avg: sql<number>`AVG(${perClient.totalCliente})` }).from(perClient);
	return Number(result[0]?.avg ?? 0);
}

/**
 * Lifetime médio (dias): tempo médio entre a primeira e a última compra dos clientes
 * recorrentes (2+ compras) da base até o fim do período. Clientes de compra única não têm
 * lifetime observável (seria sempre 0 e afundaria a média sem informação).
 * Aproximações conscientes: metadataTotalCompras é o valor atual (não o do fim do período);
 * a última compra é limitada ao fim do período via LEAST para snapshots históricos.
 */
async function computeAvgLifetimeSnapshot({ orgId, until }: { orgId: string; until: Date | null }) {
	// Date crua interpolada em sql`` não tem contexto de coluna para o driver serializar; vai como ISO string + cast.
	const lifetimeDays = until
		? sql<number>`AVG(EXTRACT(EPOCH FROM (LEAST(${clients.ultimaCompraData}, ${until.toISOString()}::timestamp) - ${clients.primeiraCompraData})) / 86400)`
		: sql<number>`AVG(EXTRACT(EPOCH FROM (${clients.ultimaCompraData} - ${clients.primeiraCompraData})) / 86400)`;

	const result = await db
		.select({ avg: lifetimeDays })
		.from(clients)
		.where(
			and(
				eq(clients.organizacaoId, orgId),
				isNotNull(clients.primeiraCompraData),
				isNotNull(clients.ultimaCompraData),
				gte(clients.metadataTotalCompras, 2),
				until ? lte(clients.primeiraCompraData, until) : undefined,
			),
		);
	return Number(result[0]?.avg ?? 0);
}

// ============================================================================
// Métricas de PERÍODO: o que aconteceu dentro da janela selecionada.
// ============================================================================

async function countNewClients({ orgId, after, before }: { orgId: string; after: Date | null; before: Date | null }) {
	const result = await db
		.select({ count: count() })
		.from(clients)
		.where(
			and(
				eq(clients.organizacaoId, orgId),
				after ? gte(clients.primeiraCompraData, after) : undefined,
				before ? lte(clients.primeiraCompraData, before) : undefined,
			),
		);
	return result[0]?.count ?? 0;
}

/** Receita média por cliente identificado dentro do período (a leitura mensal que o LTV antigo media). */
async function computePeriodRevenuePerClient({ orgId, after, before }: { orgId: string; after: Date | null; before: Date | null }) {
	const perClient = db
		.select({ totalCliente: sum(sales.valorTotal).as("total_cliente") })
		.from(sales)
		.where(
			and(
				...getValidSaleConditions({ orgId }),
				isNotNull(sales.clienteId),
				after ? gte(sales.dataVenda, after) : undefined,
				before ? lte(sales.dataVenda, before) : undefined,
			),
		)
		.groupBy(sales.clienteId)
		.as("vendas_cliente_periodo");

	const result = await db.select({ avg: sql<number>`AVG(${perClient.totalCliente})` }).from(perClient);
	return Number(result[0]?.avg ?? 0);
}

async function computePeriodRevenueBreakdown({ orgId, after, before }: { orgId: string; after: Date | null; before: Date | null }) {
	const saleConditions = [
		...getValidSaleConditions({ orgId }),
		after ? gte(sales.dataVenda, after) : undefined,
		before ? lte(sales.dataVenda, before) : undefined,
	];

	const totalResult = await db
		.select({ total: sum(sales.valorTotal) })
		.from(sales)
		.where(and(...saleConditions));
	const total = Number(totalResult[0]?.total ?? 0);

	// Clientes existentes: primeira compra ANTES do início do período.
	const existingResult = await db
		.select({ total: sum(sales.valorTotal) })
		.from(sales)
		.innerJoin(clients, eq(sales.clienteId, clients.id))
		.where(and(...saleConditions, after ? lt(clients.primeiraCompraData, after) : undefined));
	const existing = Number(existingResult[0]?.total ?? 0);

	// Clientes novos: primeira compra DENTRO do período.
	const fromNewResult = await db
		.select({ total: sum(sales.valorTotal) })
		.from(sales)
		.innerJoin(clients, eq(sales.clienteId, clients.id))
		.where(
			and(...saleConditions, after ? gte(clients.primeiraCompraData, after) : undefined, before ? lte(clients.primeiraCompraData, before) : undefined),
		);
	const fromNew = Number(fromNewResult[0]?.total ?? 0);

	// Vendas sem cliente identificado (AO CONSUMIDOR).
	const nonIdentifiedResult = await db
		.select({ total: sum(sales.valorTotal) })
		.from(sales)
		.leftJoin(clients, eq(sales.clienteId, clients.id))
		.where(and(...saleConditions, isNull(clients.id)));
	const nonIdentified = Number(nonIdentifiedResult[0]?.total ?? 0);

	return { total, existing, fromNew, nonIdentified };
}

async function getClientsOverallStats({ input, session }: { input: TGetClientsOverallStatsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { periodAfter, periodBefore, comparingPeriodAfter, comparingPeriodBefore } = input;
	const hasComparison = !!comparingPeriodAfter || !!comparingPeriodBefore;

	console.log("[INFO] [GET CLIENTS STATS] Starting:", { userOrg: userOrgId, input });

	const [totalClients, newClients, ltv, avgLifetime, periodRevenuePerClient, revenue] = await Promise.all([
		countClientsUpTo({ orgId: userOrgId, until: periodBefore }),
		countNewClients({ orgId: userOrgId, after: periodAfter, before: periodBefore }),
		computeLtvSnapshot({ orgId: userOrgId, until: periodBefore }),
		computeAvgLifetimeSnapshot({ orgId: userOrgId, until: periodBefore }),
		computePeriodRevenuePerClient({ orgId: userOrgId, after: periodAfter, before: periodBefore }),
		computePeriodRevenueBreakdown({ orgId: userOrgId, after: periodAfter, before: periodBefore }),
	]);

	const comparison = hasComparison
		? {
				totalClients: await countClientsUpTo({ orgId: userOrgId, until: comparingPeriodBefore }),
				newClients: await countNewClients({ orgId: userOrgId, after: comparingPeriodAfter, before: comparingPeriodBefore }),
				ltv: await computeLtvSnapshot({ orgId: userOrgId, until: comparingPeriodBefore }),
				avgLifetime: await computeAvgLifetimeSnapshot({ orgId: userOrgId, until: comparingPeriodBefore }),
				periodRevenuePerClient: await computePeriodRevenuePerClient({
					orgId: userOrgId,
					after: comparingPeriodAfter,
					before: comparingPeriodBefore,
				}),
				revenue: await computePeriodRevenueBreakdown({ orgId: userOrgId, after: comparingPeriodAfter, before: comparingPeriodBefore }),
			}
		: null;

	return {
		data: {
			// Snapshot (acumulado até o fim do período)
			totalClients: {
				current: totalClients,
				comparison: comparison ? comparison.totalClients : null,
			},
			ltv: {
				current: ltv,
				comparison: comparison ? comparison.ltv : null,
			},
			avgLifetime: {
				current: avgLifetime,
				comparison: comparison ? comparison.avgLifetime : null,
			},
			// Período
			totalNewClients: {
				current: newClients,
				comparison: comparison ? comparison.newClients : null,
			},
			periodRevenuePerClient: {
				current: periodRevenuePerClient,
				comparison: comparison ? comparison.periodRevenuePerClient : null,
			},
			revenueFromRecurrentClients: {
				current: revenue.existing,
				comparison: comparison ? comparison.revenue.existing : null,
				percentage: revenue.total > 0 ? (revenue.existing / revenue.total) * 100 : 0,
			},
			revenueFromNewClients: {
				current: revenue.fromNew,
				comparison: comparison ? comparison.revenue.fromNew : null,
				percentage: revenue.total > 0 ? (revenue.fromNew / revenue.total) * 100 : 0,
			},
			revenueFromNonIdentifiedClients: {
				current: revenue.nonIdentified,
				comparison: comparison ? comparison.revenue.nonIdentified : null,
				percentage: revenue.total > 0 ? (revenue.nonIdentified / revenue.total) * 100 : 0,
			},
		},
	};
}
export type TGetClientsOverallStatsOutput = Awaited<ReturnType<typeof getClientsOverallStats>>;

const getClientsOverallStatsRoute: PagesRouteHandler<TGetClientsOverallStatsOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanViewClients(sessionUser);
	const input = GetClientsOverallStatsInputSchema.parse(req.query);
	const data = await getClientsOverallStats({ input, session: sessionUser });
	return res.status(200).json(data);
};

const routeHandlers = {
	GET: getClientsOverallStatsRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
