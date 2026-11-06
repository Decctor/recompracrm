import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getChartBuckets } from "@/lib/charts/period-buckets";
import { chartBucketPositionSql } from "@/lib/charts/period-buckets-sql";
import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import { db } from "@/services/drizzle";
import { getProductSalesLines } from "@/lib/products/product-sales-lines";
import { products, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, asc, countDistinct, eq, gte, inArray, isNotNull, lte, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { z } from "zod";

dayjs.extend(utc);
dayjs.extend(timezone);

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

	// Dia inteiro no fuso da operação: o seletor manda o último dia à meia-noite, o que deixava esse
	// dia fora do filtro e virava um intervalo de 1 ms no fim do gráfico.
	const currentPeriodAdjusted = {
		after: input.periodAfter ? dayjs(input.periodAfter).tz(OPERATION_TIMEZONE).startOf("day").toDate() : undefined,
		before: input.periodBefore ? dayjs(input.periodBefore).tz(OPERATION_TIMEZONE).endOf("day").toDate() : undefined,
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
	const buckets = getChartBuckets({ startDate: currentPeriodAdjusted.after, endDate: currentPeriodAdjusted.before });
	if (buckets.length === 0) return { data: [] };
	const bucketPosition = chartBucketPositionSql(sales.dataVenda, buckets);

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

	// Fetch product sales grouped by chart bucket
	const productSalesByBucket = await db
		.select({
			position: bucketPosition,
			quantidade: sum(lines.quantidade),
			valorLiquido: sum(lines.valorVendaTotalLiquido),
			custo: sum(lines.valorCustoTotal),
			vendasCount: countDistinct(lines.vendaId),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), saleItemWhere))
		.groupBy(bucketPosition);
	const byPosition = new Map(productSalesByBucket.map((row) => [Number(row.position), row]));

	const productGraph: TGetProductGraphOutput["data"] = buckets.map((bucket, index) => {
		const row = byPosition.get(index + 1);
		const quantidade = Number(row?.quantidade ?? 0);
		const valorLiquido = Number(row?.valorLiquido ?? 0);
		const custo = Number(row?.custo ?? 0);
		const vendasCount = Number(row?.vendasCount ?? 0);
		const margem = valorLiquido - custo;
		const margemPercentual = valorLiquido > 0 ? (margem / valorLiquido) * 100 : 0;
		const ticketMedio = vendasCount > 0 ? valorLiquido / vendasCount : 0;

		return {
			titulo: bucket.label,
			quantidade,
			valorLiquido,
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
