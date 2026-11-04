import { getProductSalesLines } from "@/lib/products/product-sales-lines";
import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { clients, goals, goalsSellers, products, saleItems, sales, sellers } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, countDistinct, desc, eq, gte, inArray, isNotNull, lte, or, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { z } from "zod";

const GetSellerStatsInputSchema = z.object({
	sellerId: z.string({
		required_error: "ID do vendedor não informado.",
		invalid_type_error: "Tipo inválido para ID do vendedor.",
	}),
	periodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.optional()
		.nullable(),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.optional()
		.nullable(),
});
export type TGetSellerStatsInput = z.infer<typeof GetSellerStatsInputSchema>;
// Avaliação de Performance

// - Quantitativa
// 1. Valor total vendido
// 2. Quantidade de vendas
// 3. Ticket médio
// 4. Valor vendido por categoria de produto

// - Qualitativa
// 1. Quantidade e valor de vendas agrupado por cliente (top 10)
// 2. Quantidade e valor de vendas agrupado por produto (top 10)
// 3. Quantidade e valor de vendas agrupado por dia (1,2,3,4 etc)
// 4. Quantidade e valor de vendas agrupado por mês

type GetSellerStatsParams = {
	session: TAuthUserSession;
	input: TGetSellerStatsInput;
};

async function getSellerStats({ session, input }: GetSellerStatsParams) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const seller = await db.query.sellers.findFirst({
		where: and(eq(sellers.id, input.sellerId), eq(sellers.organizacaoId, userOrgId)),
	});
	if (!seller) throw new createHttpError.NotFound("Vendedor não encontrado.");

	const periodAfterDate = input.periodAfter ? new Date(input.periodAfter) : undefined;
	const periodBeforeDate = input.periodBefore ? new Date(input.periodBefore) : undefined;

	const saleWhereConditions = [eq(sales.organizacaoId, userOrgId), eq(sales.vendedorId, input.sellerId), isNotNull(sales.dataVenda)] as const;
	const saleWhere = and(
		...saleWhereConditions,
		periodAfterDate ? gte(sales.dataVenda, periodAfterDate) : undefined,
		periodBeforeDate ? lte(sales.dataVenda, periodBeforeDate) : undefined,
	);

	const sellerSaleGoal = await getSellerSaleGoal({
		sellerId: input.sellerId,
		periodAfter: input.periodAfter ?? null,
		periodBefore: input.periodBefore ?? null,
		organizacaoId: userOrgId,
	});
	// Quantitative: total sold, sales count
	const totalStatsResult = await db
		.select({ qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.where(saleWhere);
	const totalStats = totalStatsResult[0];
	const salesCount = Number(totalStats?.qtde ?? 0);
	const totalSalesValue = totalStats?.total ? Number(totalStats.total) : 0;
	const avgTicket = salesCount > 0 ? totalSalesValue / salesCount : 0;

	// First and last sale dates
	const firstSaleResult = await db.select({ data: sales.dataVenda }).from(sales).where(saleWhere).orderBy(sql`${sales.dataVenda} asc`).limit(1);
	const lastSaleResult = await db.select({ data: sales.dataVenda }).from(sales).where(saleWhere).orderBy(sql`${sales.dataVenda} desc`).limit(1);

	const firstSaleDate = firstSaleResult[0]?.data ?? null;
	const lastSaleDate = lastSaleResult[0]?.data ?? null;

	const daysDiff = dayjs(lastSaleDate).diff(dayjs(firstSaleDate), "days");

	const totalSalesValuePerDay = totalSalesValue / daysDiff;

	const totalSalesItemsResult = await db
		.select({ total: sum(saleItems.quantidade) })
		.from(saleItems)
		.where(and(eq(saleItems.organizacaoId, userOrgId), inArray(saleItems.vendaId, db.select({ id: sales.id }).from(sales).where(saleWhere))));
	const totalSalesItems = totalSalesItemsResult[0]?.total ? Number(totalSalesItemsResult[0].total) : 0;

	const avgSalesItemsPerSale = totalSalesItems / salesCount;
	// Por grupo e por produto: linhas atribuídas a produto — adicional vinculado conta para o
	// produto da opção (lib/products/product-sales-lines.ts).
	const lines = getProductSalesLines({ organizationId: userOrgId });
	// Quantitative: value sold by product category
	const byProductGroupRaw = await db
		.select({ grupo: products.grupo, total: sum(lines.valorVendaTotalLiquido), sales: countDistinct(lines.vendaId) })
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.leftJoin(products, eq(lines.produtoId, products.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(products.organizacaoId, userOrgId), saleWhere))
		.groupBy(products.grupo)
		.orderBy(desc(sql`sum(${lines.valorVendaTotalLiquido})`))
		.limit(10);

	// Qualitative: top clients (top 10)
	const byClientTop10Raw = await db
		.select({
			clienteId: sales.clienteId,
			clienteNome: clients.nome,
			qtde: count(sales.id),
			total: sum(sales.valorTotal),
		})
		.from(sales)
		.leftJoin(clients, eq(sales.clienteId, clients.id))
		.where(and(eq(clients.organizacaoId, userOrgId), saleWhere))
		.groupBy(sales.clienteId, clients.nome)
		.orderBy(desc(sql`sum(${sales.valorTotal})`))
		.limit(10);

	// Qualitative: top products (top 10)
	const byProductTop10Raw = await db
		.select({
			produtoId: lines.produtoId,
			produtoNome: products.nome,
			produtoGrupo: products.grupo,
			qtde: sum(lines.quantidade),
			total: sum(lines.valorVendaTotalLiquido),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.leftJoin(products, eq(lines.produtoId, products.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(products.organizacaoId, userOrgId), saleWhere))
		.groupBy(lines.produtoId, products.nome, products.grupo)
		.orderBy(desc(sql`sum(${lines.valorVendaTotalLiquido})`))
		.limit(10);

	// Qualitative: grouped by day of month
	const dayExpr = sql<number>`extract(day from ${sales.dataVenda})`;
	const byDayOfMonthRaw = await db
		.select({ dia: dayExpr, qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.where(saleWhere)
		.groupBy(dayExpr)
		.orderBy(dayExpr);

	// Qualitative: grouped by month
	const monthExpr = sql<number>`extract(month from ${sales.dataVenda})`;
	const byMonthRaw = await db
		.select({ mes: monthExpr, qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.where(saleWhere)
		.groupBy(monthExpr)
		.orderBy(monthExpr);

	const weekDayExpr = sql<number>`extract(dow from ${sales.dataVenda})`;
	const byWeekDayRaw = await db
		.select({ semana: weekDayExpr, qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.where(saleWhere)
		.groupBy(weekDayExpr)
		.orderBy(weekDayExpr);

	// Qualitative: grouped by day of week + hour (weekly revenue heatmap)
	const hourExpr = sql<number>`extract(hour from ${sales.dataVenda})`;
	const byWeekDayHourRaw = await db
		.select({ semana: weekDayExpr, hora: hourExpr, qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.where(saleWhere)
		.groupBy(weekDayExpr, hourExpr)
		.orderBy(weekDayExpr, hourExpr);

	return {
		data: {
			vendedor: {
				nome: seller.nome,
				telefone: seller.telefone,
				email: seller.email,
				identificador: seller.identificador,
				avatarUrl: seller.avatarUrl,
			},
			dataPrimeiraVenda: firstSaleDate,
			dataUltimaVenda: lastSaleDate,
			faturamentoMeta: sellerSaleGoal,
			faturamentoMetaPorcentagem: (totalSalesValue / sellerSaleGoal) * 100,
			faturamentoBrutoTotal: totalSalesValue,
			faturamentoBrutoPorDia: totalSalesValuePerDay,
			qtdeVendas: salesCount,
			qtdeItensVendidos: totalSalesItems,
			qtdeItensPorVendaMedio: avgSalesItemsPerSale,
			ticketMedio: avgTicket,
			resultadosAgrupados: {
				grupo: byProductGroupRaw.map((row) => ({
					grupo: row.grupo ?? null,
					quantidade: row.sales ? Number(row.sales) : 0,
					total: row.total ? Number(row.total) : 0,
				})),
				cliente: byClientTop10Raw.map((row) => ({
					clienteId: row.clienteId,
					clienteNome: row.clienteNome ?? null,
					quantidade: Number(row.qtde ?? 0),
					total: row.total ? Number(row.total) : 0,
				})),
				produto: byProductTop10Raw.map((row) => ({
					produtoId: row.produtoId,
					produtoNome: row.produtoNome ?? "",
					produtoGrupo: row.produtoGrupo ?? null,
					quantidade: row.qtde ? Number(row.qtde) : 0,
					total: row.total ? Number(row.total) : 0,
				})),
				dia: byDayOfMonthRaw.map((row) => ({
					dia: Number(row.dia),
					quantidade: Number(row.qtde ?? 0),
					total: row.total ? Number(row.total) : 0,
				})),
				mes: byMonthRaw.map((row) => ({
					mes: Number(row.mes),
					quantidade: Number(row.qtde ?? 0),
					total: row.total ? Number(row.total) : 0,
				})),
				diaSemana: byWeekDayRaw.map((row) => ({
					diaSemana: Number(row.semana),
					quantidade: Number(row.qtde ?? 0),
					total: row.total ? Number(row.total) : 0,
				})),
				diaSemanaHora: byWeekDayHourRaw.map((row) => ({
					diaSemana: Number(row.semana),
					hora: Number(row.hora),
					quantidade: Number(row.qtde ?? 0),
					total: row.total ? Number(row.total) : 0,
				})),
			},
		},
	};
}
export type TGetSellerStatsOutput = Awaited<ReturnType<typeof getSellerStats>>;
const getSellerStatsHandler: PagesRouteHandler<TGetSellerStatsOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetSellerStatsInputSchema.parse({
		sellerId: req.query.sellerId as string,
		periodAfter: (req.query.periodAfter as string | undefined) ?? null,
		periodBefore: (req.query.periodBefore as string | undefined) ?? null,
	});
	const data = await getSellerStats({ session: sessionUser, input });
	return res.status(200).json(data);
};

const routeHandlers = {
	GET: getSellerStatsHandler,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});

async function getSellerSaleGoal({
	sellerId,
	periodAfter,
	periodBefore,
	organizacaoId,
}: { sellerId: string; periodAfter: string | null; periodBefore: string | null; organizacaoId: string }) {
	if (!periodAfter || !periodBefore) return 0;

	const ajustedAfter = new Date(periodAfter);
	const ajustedBefore = new Date(periodBefore);

	const sellerGoalsResult = await db.query.goalsSellers.findMany({
		where: and(
			eq(goalsSellers.vendedorId, sellerId),
			inArray(
				goalsSellers.metaId,
				db
					.select({ id: goals.id })
					.from(goals)
					.where(
						and(
							eq(goals.organizacaoId, organizacaoId),
							or(
								and(gte(goals.dataInicio, ajustedAfter), lte(goals.dataInicio, ajustedBefore)),
								and(gte(goals.dataFim, ajustedAfter), lte(goals.dataFim, ajustedBefore)),
							),
						),
					),
			),
		),
		with: {
			meta: {
				columns: {
					dataInicio: true,
					dataFim: true,
				},
			},
		},
	});

	const totalSellerGoal = sellerGoalsResult.reduce((acc, goal) => {
		const afterDatetime = new Date(periodAfter).getTime();
		const beforeDatetime = new Date(periodBefore).getTime();

		const monthStartDatetime = new Date(goal.meta.dataInicio).getTime();
		const monthEndDatetime = new Date(goal.meta.dataFim).getTime();

		const days = Math.abs(dayjs(goal.meta.dataFim).diff(dayjs(goal.meta.dataInicio), "days")) + 1;

		if (
			(afterDatetime < monthStartDatetime && beforeDatetime < monthStartDatetime) ||
			(afterDatetime > monthEndDatetime && beforeDatetime > monthEndDatetime)
		) {
			console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goal not applicable: ", { goal });
			return acc;
		}
		if (afterDatetime <= monthStartDatetime && beforeDatetime >= monthEndDatetime) {
			// Caso o período de filtro da query compreenda o mês inteiro
			console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goal applicable for all period: ", { goal });
			return acc + goal.objetivoValor;
		}
		if (beforeDatetime > monthEndDatetime) {
			const applicableDays = dayjs(goal.meta.dataFim).diff(dayjs(periodAfter), "days");

			console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goal applicable for partial period: ", { goal, applicableDays, days });
			return acc + (goal.objetivoValor * applicableDays) / days;
		}

		const applicableDays = dayjs(periodBefore).diff(dayjs(goal.meta.dataInicio), "days") + 1;

		console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goal applicable for partial period: ", { goal, applicableDays, days });

		return acc + (goal.objetivoValor * applicableDays) / days;
	}, 0);

	return totalSellerGoal;
}
