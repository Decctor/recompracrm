import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getBestNumberOfPointsBetweenDates, getDateBuckets, getEvenlySpacedDates } from "@/lib/dates";
import { db } from "@/services/drizzle";
import { getProductSalesLines } from "@/lib/products/product-sales-lines";
import { products, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, asc, countDistinct, eq, gte, inArray, isNotNull, lte, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { z } from "zod";

const GetProductGraphInputSchema = z.object({
	productId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo inválido para ID do produto.",
	}),
	periodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable(),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable(),
	sellerId: z
		.string({
			required_error: "ID do vendedor não informado.",
			invalid_type_error: "Tipo inválido para ID do vendedor.",
		})
		.optional()
		.nullable(),
	partnerId: z
		.string({
			required_error: "ID do parceiro não informado.",
			invalid_type_error: "Tipo inválido para ID do parceiro.",
		})
		.optional()
		.nullable(),
	integrationsIds: z.array(z.string()).optional().nullable(),
});

export type TGetProductGraphInput = z.infer<typeof GetProductGraphInputSchema>;

type TProductGraphReduced = {
	[key: string]: {
		quantidade: number;
		valorLiquido: number;
		custo: number;
		vendasCount: number;
	};
};

export type TGetProductGraphOutput = {
	data: Array<{
		titulo: string;
		quantidade: number;
		valorLiquido: number;
		margem: number;
		margemPercentual: number;
		ticketMedio: number;
	}>;
};

async function fetchProductGraph(input: TGetProductGraphInput, session: TAuthUserSession) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	console.log("[INFO] [FETCH PRODUCT GRAPH] Input:", input);
	// Verify product exists
	const product = await db.query.products.findFirst({
		where: and(eq(products.id, input.productId), eq(products.organizacaoId, userOrgId)),
	});
	if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

	const currentPeriodAdjusted = {
		after: input.periodAfter ? new Date(input.periodAfter) : undefined,
		before: input.periodBefore ? new Date(input.periodBefore) : undefined,
	};

	// Linhas atribuídas a produto: adicional vinculado conta para o produto da opção
	// (lib/products/product-sales-lines.ts).
	const lines = getProductSalesLines({ organizationId: userOrgId });

	if (!currentPeriodAdjusted.after) {
		const firstProductSale = await db
			.select({ data: sales.dataVenda })
			.from(lines)
			.innerJoin(sales, eq(lines.vendaId, sales.id))
			.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), eq(lines.produtoId, input.productId)))
			.orderBy(asc(sales.dataVenda))
			.limit(1);
		currentPeriodAdjusted.after = firstProductSale[0]?.data ?? undefined;
		if (!currentPeriodAdjusted.after) throw new createHttpError.BadRequest("Não foi possível encontrar a primeira venda do produto.");
	}

	if (!currentPeriodAdjusted.before) {
		currentPeriodAdjusted.before = new Date();
	}
	const { points: bestNumberOfPointsForPeriodsDates, groupingFormat } = getBestNumberOfPointsBetweenDates({
		startDate: currentPeriodAdjusted.after,
		endDate: currentPeriodAdjusted.before,
	});

	const currentPeriodDatesStrs = getEvenlySpacedDates({
		startDate: currentPeriodAdjusted.after,
		endDate: currentPeriodAdjusted.before,
		points: bestNumberOfPointsForPeriodsDates,
	});

	const currentPeriodDateBuckets = getDateBuckets(currentPeriodDatesStrs);

	// Build where conditions
	const saleItemWhereConditions = [eq(lines.organizacaoId, userOrgId), eq(lines.produtoId, input.productId)];
	const saleWhereConditions = [eq(sales.organizacaoId, userOrgId), eq(sales.statusVenda, "CONFIRMADA"), isNotNull(sales.dataVenda)];

	const saleWhere = and(
		...saleWhereConditions,
		gte(sales.dataVenda, currentPeriodAdjusted.after),
		lte(sales.dataVenda, currentPeriodAdjusted.before),
		input.sellerId ? eq(sales.vendedorId, input.sellerId) : undefined,
		input.partnerId ? eq(sales.parceiroId, input.partnerId) : undefined,
		getSalesIntegrationCondition(input.integrationsIds),
	);

	const saleItemWhere = and(...saleItemWhereConditions, inArray(lines.vendaId, db.select({ id: sales.id }).from(sales).where(saleWhere)));

	// Fetch product sales grouped by day
	const productSalesByDay = await db
		.select({
			dataVenda: sql<string>`date_trunc('day', ${sales.dataVenda})::text`,
			quantidade: sum(lines.quantidade),
			valorLiquido: sum(lines.valorVendaTotalLiquido),
			custo: sum(lines.valorCustoTotal),
			vendasCount: countDistinct(lines.vendaId),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), saleItemWhere))
		.groupBy(sql`date_trunc('day', ${sales.dataVenda})`)
		.orderBy(sql`date_trunc('day', ${sales.dataVenda})`);

	// Initialize reduced data structure
	const initialProductGraphReduced: TProductGraphReduced = Object.fromEntries(
		currentPeriodDatesStrs.map((date) => [dayjs(date).format(groupingFormat), { quantidade: 0, valorLiquido: 0, custo: 0, vendasCount: 0 }]),
	);

	// Reduce product sales into buckets
	const productGraphReduced = productSalesByDay.reduce((acc: TProductGraphReduced, current) => {
		const saleDate = new Date(current.dataVenda);
		const saleTime = saleDate.getTime();

		// Find the correct bucket
		const bucket = currentPeriodDateBuckets.find((b) => saleTime >= b.start && saleTime <= b.end);
		if (!bucket) return acc;

		const key = dayjs(bucket.key).format(groupingFormat);
		if (!acc[key]) acc[key] = { quantidade: 0, valorLiquido: 0, custo: 0, vendasCount: 0 };

		acc[key].quantidade += Number(current.quantidade ?? 0);
		acc[key].valorLiquido += Number(current.valorLiquido ?? 0);
		acc[key].custo += Number(current.custo ?? 0);
		acc[key].vendasCount += Number(current.vendasCount ?? 0);

		return acc;
	}, initialProductGraphReduced);

	// Transform into output format
	const productGraph = Object.entries(productGraphReduced).map(([key, value]) => {
		const margem = value.valorLiquido - value.custo;
		const margemPercentual = value.valorLiquido > 0 ? (margem / value.valorLiquido) * 100 : 0;
		const ticketMedio = value.vendasCount > 0 ? value.valorLiquido / value.vendasCount : 0;

		return {
			titulo: key,
			quantidade: value.quantidade,
			valorLiquido: value.valorLiquido,
			margem,
			margemPercentual,
			ticketMedio,
		};
	});

	return {
		data: productGraph,
	};
}

const handleGetProductGraphRoute: PagesRouteHandler<TGetProductGraphOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = GetProductGraphInputSchema.parse({
		productId: req.query.productId as string,
		periodAfter: req.query.periodAfter as string,
		periodBefore: req.query.periodBefore as string,
		sellerId: (req.query.sellerId as string | undefined) ?? null,
		partnerId: (req.query.partnerId as string | undefined) ?? null,
		integrationsIds: req.query.integrationsIds ? JSON.parse(req.query.integrationsIds as string) : null,
	});

	const productGraph = await fetchProductGraph(input, sessionUser);

	return res.status(200).json(productGraph);
};

const routeHandlers = {
	GET: handleGetProductGraphRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
