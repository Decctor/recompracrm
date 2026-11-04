import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { resolveResultsScopeSellerIds } from "@/lib/permissions/results-scope";
import { db } from "@/services/drizzle";
import { getProductSalesLines } from "@/lib/products/product-sales-lines";
import { clients, products, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, desc, eq, gte, inArray, isNotNull, lte, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { z } from "zod";

const WEEKDAY_LABELS = {
	0: "Domingo",
	1: "Segunda",
	2: "Terça",
	3: "Quarta",
	4: "Quinta",
	5: "Sexta",
	6: "Sábado",
} as const;

const SalesDetailedAnalysisInputSchema = z
	.object({
		weekday: z
			.number({
				required_error: "Dia da semana não informado.",
				invalid_type_error: "Tipo inválido para dia da semana.",
			})
			.int()
			.min(0, { message: "Dia da semana inválido." })
			.max(6, { message: "Dia da semana inválido." }),
		hourIntervalStart: z
			.number({
				invalid_type_error: "Tipo inválido para hora inicial.",
			})
			.int()
			.min(0, { message: "Hora inicial inválida." })
			.max(23, { message: "Hora inicial inválida." })
			.optional(),
		hourIntervalEnd: z
			.number({
				invalid_type_error: "Tipo inválido para hora final.",
			})
			.int()
			.min(1, { message: "Hora final inválida." })
			.max(24, { message: "Hora final inválida." })
			.optional(),
		periodStart: z
			.string({
				required_error: "Período inicial não informado.",
				invalid_type_error: "Tipo inválido para período inicial.",
			})
			.datetime({ message: "Tipo inválido para período inicial." }),
		periodEnd: z
			.string({
				required_error: "Período final não informado.",
				invalid_type_error: "Tipo inválido para período final.",
			})
			.datetime({ message: "Tipo inválido para período final." }),
	})
	.superRefine((data, ctx) => {
		const hourIntervalStart = data.hourIntervalStart;
		const hourIntervalEnd = data.hourIntervalEnd;
		const hasStart = typeof hourIntervalStart === "number";
		const hasEnd = typeof hourIntervalEnd === "number";

		if (hasStart !== hasEnd) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Informe o intervalo de horas completo.",
				path: hasStart ? ["hourIntervalEnd"] : ["hourIntervalStart"],
			});
		}

		if (hasStart && hasEnd && hourIntervalEnd <= hourIntervalStart) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "A hora final deve ser maior que a hora inicial.",
				path: ["hourIntervalEnd"],
			});
		}

		if (dayjs(data.periodEnd).isBefore(dayjs(data.periodStart))) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "O período final deve ser posterior ao período inicial.",
				path: ["periodEnd"],
			});
		}
	});

export type TSalesDetailedAnalysisInput = z.infer<typeof SalesDetailedAnalysisInputSchema>;

type TSalesDetailedAnalysisOutputData = {
	kpis: {
		salesQuantity: number;
		totalRevenue: number;
		avgTicket: number;
	};
	topClients: {
		clientId: string;
		clientName: string;
		identifier: string | null;
		quantity: number;
		total: number;
	}[];
	topProducts: {
		productId: string;
		productName: string;
		productGroup: string | null;
		quantity: number;
		total: number;
	}[];
	meta: {
		weekday: number;
		weekdayLabel: string;
		hourIntervalStart: number | null;
		hourIntervalEnd: number | null;
		hourLabel: string | null;
		periodStart: string;
		periodEnd: string;
	};
};

async function getSalesDetailedAnalysis({
	input,
	organizacaoId,
	scopeSellerIds,
}: {
	input: TSalesDetailedAnalysisInput;
	organizacaoId: string;
	scopeSellerIds: string[] | null;
}) {
	const adjustedPeriodStart = dayjs(input.periodStart).toDate();
	const adjustedPeriodEnd = dayjs(input.periodEnd).toDate();
	const weekdayExpr = sql<number>`EXTRACT(DOW FROM ${sales.dataVenda})`;
	const hourExpr = sql<number>`EXTRACT(HOUR FROM ${sales.dataVenda})`;

	const salesWhere = and(
		eq(sales.organizacaoId, organizacaoId),
		isNotNull(sales.dataVenda),
		gte(sales.dataVenda, adjustedPeriodStart),
		lte(sales.dataVenda, adjustedPeriodEnd),
		sql`${weekdayExpr} = ${input.weekday}`,
		typeof input.hourIntervalStart === "number" ? sql`${hourExpr} >= ${input.hourIntervalStart}` : undefined,
		typeof input.hourIntervalEnd === "number" ? sql`${hourExpr} < ${input.hourIntervalEnd}` : undefined,
		scopeSellerIds ? inArray(sales.vendedorId, scopeSellerIds) : undefined,
	);

	// Ranking de produtos sobre linhas atribuídas a produto: adicional vinculado conta para o
	// produto da opção (lib/products/product-sales-lines.ts).
	const lines = getProductSalesLines({ organizationId: organizacaoId });

	const [kpisResult, topClientsRaw, topProductsRaw] = await Promise.all([
		db
			.select({
				salesQuantity: count(sales.id),
				totalRevenue: sum(sales.valorTotal),
			})
			.from(sales)
			.where(salesWhere),
		db
			.select({
				clientId: clients.id,
				clientName: clients.nome,
				identifier: clients.cpfCnpj,
				quantity: count(sales.id),
				total: sum(sales.valorTotal),
			})
			.from(sales)
			.innerJoin(clients, eq(sales.clienteId, clients.id))
			.where(and(salesWhere, eq(clients.organizacaoId, organizacaoId)))
			.groupBy(clients.id, clients.nome, clients.cpfCnpj)
			.orderBy(desc(sql`sum(${sales.valorTotal})`))
			.limit(25),
		db
			.select({
				productId: products.id,
				productName: products.nome,
				productGroup: products.grupo,
				quantity: sum(lines.quantidade),
				total: sum(lines.valorVendaTotalLiquido),
			})
			.from(lines)
			.innerJoin(sales, eq(lines.vendaId, sales.id))
			.innerJoin(products, eq(lines.produtoId, products.id))
			.where(and(eq(lines.organizacaoId, organizacaoId), eq(products.organizacaoId, organizacaoId), salesWhere))
			.groupBy(products.id, products.nome, products.grupo)
			.orderBy(desc(sql`sum(${lines.valorVendaTotalLiquido})`))
			.limit(25),
	]);

	const salesQuantity = Number(kpisResult[0]?.salesQuantity ?? 0);
	const totalRevenue = kpisResult[0]?.totalRevenue ? Number(kpisResult[0].totalRevenue) : 0;
	const avgTicket = salesQuantity > 0 ? totalRevenue / salesQuantity : 0;

	return {
		data: {
			kpis: {
				salesQuantity,
				totalRevenue,
				avgTicket,
			},
			topClients: topClientsRaw.map((row) => ({
				clientId: row.clientId,
				clientName: row.clientName,
				identifier: row.identifier ?? null,
				quantity: Number(row.quantity ?? 0),
				total: row.total ? Number(row.total) : 0,
			})),
			topProducts: topProductsRaw.map((row) => ({
				productId: row.productId,
				productName: row.productName,
				productGroup: row.productGroup ?? null,
				quantity: row.quantity ? Number(row.quantity) : 0,
				total: row.total ? Number(row.total) : 0,
			})),
			meta: {
				weekday: input.weekday,
				weekdayLabel: WEEKDAY_LABELS[input.weekday as keyof typeof WEEKDAY_LABELS],
				hourIntervalStart: input.hourIntervalStart ?? null,
				hourIntervalEnd: input.hourIntervalEnd ?? null,
				hourLabel:
					typeof input.hourIntervalStart === "number" && typeof input.hourIntervalEnd === "number"
						? `${input.hourIntervalStart}:00 - ${input.hourIntervalEnd}:00`
						: null,
				periodStart: input.periodStart,
				periodEnd: input.periodEnd,
			},
		} satisfies TSalesDetailedAnalysisOutputData,
	};
}

export type TGetSalesDetailedAnalysisOutput = Awaited<ReturnType<typeof getSalesDetailedAnalysis>>;

const getSalesDetailedAnalysisHandler: PagesRouteHandler<TGetSalesDetailedAnalysisOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgMembership = sessionUser.membership;
	const userOrgId = userOrgMembership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const input = SalesDetailedAnalysisInputSchema.parse(req.body);

	const scopeSellerIds = await resolveResultsScopeSellerIds({
		organizacaoId: userOrgId,
		resultsScope: userOrgMembership.permissoes.resultados.escopo,
	});
	if (scopeSellerIds && scopeSellerIds.length === 0) {
		throw new createHttpError.Unauthorized("Você não tem permissão para acessar esse recurso.");
	}

	const data = await getSalesDetailedAnalysis({ input, organizacaoId: userOrgId, scopeSellerIds });
	return res.status(200).json(data);
};

const routeHandlers = {
	POST: getSalesDetailedAnalysisHandler,
	GET: getSalesDetailedAnalysisHandler,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});
export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET!, bodyFromSearchParam: "payload" }),
});
