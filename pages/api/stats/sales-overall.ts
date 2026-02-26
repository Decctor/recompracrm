import { apiHandler } from "@/lib/api";
import { getCurrentSessionUncached } from "@/lib/authentication/pages-session";
import { SalesGeneralStatsFiltersSchema, type TSaleStatsGeneralQueryParams } from "@/schemas/query-params-utils";
import { db } from "@/services/drizzle";
import { clients, saleItems, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, eq, exists, gte, inArray, isNull, lt, lte, notInArray, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import type { NextApiHandler } from "next";

type TOverallSalesStatsReduced = {
	faturamentoBruto: number;
	gastoBruto: number;
	qtdeVendas: number;
	qtdeItensVendidos: number;
};

export type TOverallSalesStats = {
	faturamentoMeta: number;
	faturamentoMetaPorcentagem: number;
	faturamento: {
		atual: number;
		anterior: number | undefined;
	};
	margemBruta: {
		atual: number;
		anterior: number | undefined;
	};
	qtdeVendas: {
		atual: number;
		anterior: number | undefined;
	};
	ticketMedio: {
		atual: number;
		anterior: number | undefined;
	};
	qtdeItensVendidos: {
		atual: number;
		anterior: number | undefined;
	};
	itensPorVendaMedio: {
		atual: number;
		anterior: number | undefined;
	};
	valorDiarioVendido: {
		atual: number;
		anterior: number | undefined;
	};
	faturamentoViaClientesRecorrentes: {
		atual: number;
		anterior: number | undefined;
		porcentagem: number;
	};
	faturamentoViaNovosClientes: {
		atual: number;
		anterior: number | undefined;
		porcentagem: number;
	};
	faturamentoViaClientesNaoIdentificados: {
		atual: number;
		anterior: number | undefined;
		porcentagem: number;
	};
};
type GetResponse = {
	data: TOverallSalesStats;
};
const getSalesOverallStatsRoute: NextApiHandler<GetResponse> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached(req.cookies);
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgMembership = sessionUser.membership;
	const userOrgId = userOrgMembership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const filters = SalesGeneralStatsFiltersSchema.parse(req.body);

	const sessionUserResultsScope = userOrgMembership.permissoes.resultados.escopo;
	if (sessionUserResultsScope) {
		const scopeUsers = await db.query.organizationMembers.findMany({
			where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, userOrgId), inArray(fields.usuarioId, sessionUserResultsScope)),
			columns: { usuarioVendedorId: true },
		});
		const scopeUserSellerIds = scopeUsers.map((user) => user.usuarioVendedorId);

		// Checking if user is filtering for sellers outside his scope
		const isAttempingUnauthorizedScope = filters.sellers.some((sellerId) => !scopeUserSellerIds.includes(sellerId)) || filters.sellers.length === 0;
		if (isAttempingUnauthorizedScope) throw new createHttpError.Unauthorized("Você não tem permissão para acessar esse recurso.");
	}
	console.log("[INFO] [GET_SALES_OVERALL_STATS] Filters payload: ", filters);

	// const sales = await getSales({ filters });
	const overallSaleGoal = await getOverallSaleGoal({
		after: filters.period.after,
		before: filters.period.before,
		organizacaoId: userOrgId,
	});

	// const stats = sales.reduce(
	// 	(acc: TOverallSalesStatsReduced, current) => {
	// 		// updating sales quantity stats
	// 		acc.qtdeVendas += 1;

	// 		const applicableItems = current.itens.filter((item) =>
	// 			filters.productGroups.length > 0 ? filters.productGroups.includes(item.produto.grupo) : true,
	// 		);
	// 		for (const item of applicableItems) {
	// 			acc.qtdeItensVendidos += item.quantidade;
	// 			acc.gastoBruto += item.valorCustoTotal;
	// 			acc.faturamentoBruto += item.valorVendaTotalLiquido;
	// 		}
	// 		return acc;
	// 	},
	// 	{
	// 		faturamentoBruto: 0,
	// 		gastoBruto: 0,
	// 		qtdeVendas: 0,
	// 		qtdeItensVendidos: 0,
	// 	} as TOverallSalesStatsReduced,
	// );

	const stats = await getOverallStats(filters, userOrgId);
	const overallStats: TOverallSalesStats = {
		faturamentoMetaPorcentagem: (stats.faturamento.atual / overallSaleGoal) * 100,
		faturamento: stats.faturamento,
		margemBruta: stats.margemBruta,
		faturamentoMeta: overallSaleGoal,
		qtdeVendas: stats.qtdeVendas,
		ticketMedio: stats.ticketMedio,
		qtdeItensVendidos: stats.qtdeItensVendidos,
		itensPorVendaMedio: stats.itensPorVendaMedio,
		valorDiarioVendido: stats.valorDiarioVendido,
		faturamentoViaClientesRecorrentes: stats.faturamentoViaClientesRecorrentes,
		faturamentoViaNovosClientes: stats.faturamentoViaNovosClientes,
		faturamentoViaClientesNaoIdentificados: stats.faturamentoViaClientesNaoIdentificados,
	};
	return res.status(200).json({ data: overallStats });
};

export default apiHandler({
	POST: getSalesOverallStatsRoute,
});

type GetOverallSaleGoalProps = {
	after: string;
	before: string;
	organizacaoId: string;
};
async function getOverallSaleGoal({ after, before, organizacaoId }: GetOverallSaleGoalProps) {
	const ajustedAfter = dayjs(after).toDate();
	const ajustedBefore = dayjs(before).endOf("day").toDate();
	try {
		const goals = await db.query.goals.findMany({
			where: (fields, { and, or, gte, lte, eq }) =>
				and(
					eq(fields.organizacaoId, organizacaoId),
					or(
						and(gte(fields.dataInicio, ajustedAfter), lte(fields.dataInicio, ajustedBefore)),
						and(gte(fields.dataFim, ajustedAfter), lte(fields.dataFim, ajustedBefore)),
					),
				),
		});

		console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goals: ", goals);
		const applicableSaleGoal = goals.reduce((acc, current) => {
			const afterDatetime = new Date(after).getTime();
			const beforeDatetime = new Date(before).getTime();

			const monthStartDatetime = new Date(current.dataInicio).getTime();
			const monthEndDatetime = new Date(current.dataFim).getTime();

			const days = Math.abs(dayjs(current.dataFim).diff(dayjs(current.dataInicio), "days")) + 1;

			if (
				(afterDatetime < monthStartDatetime && beforeDatetime < monthStartDatetime) ||
				(afterDatetime > monthEndDatetime && beforeDatetime > monthEndDatetime)
			) {
				console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goal not applicable: ", { current });
				return acc;
			}
			if (afterDatetime <= monthStartDatetime && beforeDatetime >= monthEndDatetime) {
				// Caso o período de filtro da query compreenda o mês inteiro
				console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goal applicable for all period: ", { current });
				return acc + current.objetivoValor;
			}
			if (beforeDatetime > monthEndDatetime) {
				const applicableDays = dayjs(current.dataFim).diff(dayjs(after), "days");

				console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goal applicable for partial period: ", { current, applicableDays, days });
				return acc + (current.objetivoValor * applicableDays) / days;
			}

			const applicableDays = dayjs(before).diff(dayjs(current.dataInicio), "days") + 1;

			console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goal applicable for partial period: ", { current, applicableDays, days });

			return acc + (current.objetivoValor * applicableDays) / days;
		}, 0);

		return applicableSaleGoal;
	} catch (error) {
		console.log("Error getting overall sale goal", error);
		throw error;
	}
}

export async function getOverallStats(filters: TSaleStatsGeneralQueryParams, organizacaoId: string) {
	const conditions = [eq(sales.organizacaoId, organizacaoId)];

	if (filters.total.min) conditions.push(gte(sales.valorTotal, filters.total.min));
	if (filters.total.max) conditions.push(gte(sales.valorTotal, filters.total.max));
	if (filters.saleNatures.length > 0) conditions.push(inArray(sales.natureza, filters.saleNatures));
	if (filters.sellers.length > 0) conditions.push(inArray(sales.vendedorNome, filters.sellers));
	if (filters.clientRFMTitles.length > 0)
		conditions.push(
			exists(
				db
					.select({ id: clients.id })
					.from(clients)
					.where(
						and(eq(clients.organizacaoId, organizacaoId), eq(clients.id, sales.clienteId), inArray(clients.analiseRFMTitulo, filters.clientRFMTitles)),
					),
			),
		);
	if (filters.excludedSalesIds) conditions.push(notInArray(sales.id, filters.excludedSalesIds));

	const totalSalesStatsResult = await db
		.select({
			qtde: count(sales.id),
			valorTotal: sum(sales.valorTotal),
			custoTotal: sum(sales.custoTotal),
		})
		.from(sales)
		.where(
			and(
				...conditions,
				filters.period.after ? gte(sales.dataVenda, new Date(filters.period.after)) : undefined,
				filters.period.before ? lte(sales.dataVenda, new Date(filters.period.before)) : undefined,
			),
		);

	const totalSalesStats = totalSalesStatsResult[0];

	const totalSalesQty = totalSalesStats.qtde;
	const totalSalesValorTotal = totalSalesStats.valorTotal ? Number(totalSalesStats.valorTotal) : 0;
	const totalSalesCustoTotal = totalSalesStats.custoTotal ? Number(totalSalesStats.custoTotal) : 0;

	console.log("[INFO] [GET_OVERALL_STATS] Total sales items stats result: ", { totalSalesValorTotal, totalSalesCustoTotal });
	const totalSalesItemsStatsResult = await db
		.select({
			total: sum(saleItems.quantidade),
		})
		.from(saleItems)
		.where(
			and(
				eq(saleItems.organizacaoId, organizacaoId),
				inArray(
					saleItems.vendaId,
					db
						.select({ id: sales.id })
						.from(sales)
						.where(
							and(
								...conditions,
								filters.period.after ? gte(sales.dataVenda, new Date(filters.period.after)) : undefined,
								filters.period.before ? lte(sales.dataVenda, new Date(filters.period.before)) : undefined,
							),
						),
				),
			),
		);

	const totalSalesItemsStats = totalSalesItemsStatsResult[0];
	const totalSalesItemsQty = totalSalesItemsStats.total ? Number(totalSalesItemsStats.total) : 0;

	const periodAfter = filters.period.after ? new Date(filters.period.after) : null;
	const periodBefore = filters.period.before ? new Date(filters.period.before) : null;

	// Revenue breakdown: existing clients, new clients, non-identified (ao consumidor)
	const existingClientsRevenueResult =
		periodAfter && periodBefore
			? await db
					.select({ total: sum(sales.valorTotal) })
					.from(sales)
					.innerJoin(clients, eq(sales.clienteId, clients.id))
					.where(
						and(
							...conditions,
							eq(clients.organizacaoId, organizacaoId),
							gte(sales.dataVenda, periodAfter),
							lte(sales.dataVenda, periodBefore),
							lt(clients.primeiraCompraData, periodAfter),
						),
					)
			: null;
	const newClientsRevenueResult =
		periodAfter && periodBefore
			? await db
					.select({ total: sum(sales.valorTotal) })
					.from(sales)
					.innerJoin(clients, eq(sales.clienteId, clients.id))
					.where(
						and(
							...conditions,
							eq(clients.organizacaoId, organizacaoId),
							gte(sales.dataVenda, periodAfter),
							lte(sales.dataVenda, periodBefore),
							gte(clients.primeiraCompraData, periodAfter),
							lte(clients.primeiraCompraData, periodBefore),
						),
					)
			: null;
	const nonIdentifiedRevenueResult =
		periodAfter && periodBefore
			? await db
					.select({ total: sum(sales.valorTotal) })
					.from(sales)
					.leftJoin(clients, eq(sales.clienteId, clients.id))
					.where(and(...conditions, gte(sales.dataVenda, periodAfter), lte(sales.dataVenda, periodBefore), isNull(clients.id)))
			: null;

	const existingClientsRevenue = existingClientsRevenueResult?.[0]?.total ? Number(existingClientsRevenueResult[0].total) : 0;
	const newClientsRevenue = newClientsRevenueResult?.[0]?.total ? Number(newClientsRevenueResult[0].total) : 0;
	const nonIdentifiedRevenue = nonIdentifiedRevenueResult?.[0]?.total ? Number(nonIdentifiedRevenueResult[0].total) : 0;
	const revenuePercentage = (val: number) => (totalSalesValorTotal > 0 ? (val / totalSalesValorTotal) * 100 : 0);

	if (!filters.period.after && !filters.period.before) {
		return {
			faturamento: {
				atual: totalSalesValorTotal,
				anterior: undefined,
			},
			margemBruta: {
				atual: totalSalesValorTotal - totalSalesCustoTotal,
				anterior: undefined,
			},
			qtdeVendas: {
				atual: totalSalesQty,
				anterior: undefined,
			},
			qtdeItensVendidos: {
				atual: totalSalesItemsQty,
				anterior: undefined,
			},
			itensPorVendaMedio: {
				atual: totalSalesItemsQty / totalSalesQty,
				anterior: undefined,
			},
			ticketMedio: {
				atual: totalSalesValorTotal / totalSalesQty,
				anterior: undefined,
			},
			valorDiarioVendido: {
				atual: totalSalesValorTotal / dayjs(filters.period.before).diff(dayjs(filters.period.after), "days"),
				anterior: undefined,
			},
			faturamentoViaClientesRecorrentes: {
				atual: existingClientsRevenue,
				anterior: undefined,
				porcentagem: revenuePercentage(existingClientsRevenue),
			},
			faturamentoViaNovosClientes: {
				atual: newClientsRevenue,
				anterior: undefined,
				porcentagem: revenuePercentage(newClientsRevenue),
			},
			faturamentoViaClientesNaoIdentificados: {
				atual: nonIdentifiedRevenue,
				anterior: undefined,
				porcentagem: revenuePercentage(nonIdentifiedRevenue),
			},
		};
	}

	const dateDiff = dayjs(filters.period.before).diff(dayjs(filters.period.after), "days");
	const previousPeriodAfter = dayjs(filters.period.after).subtract(dateDiff, "days").toDate();
	const previousPeriodBefore = dayjs(filters.period.before).subtract(dateDiff, "days").toDate();

	const previousTotalSalesStatsResult = await db
		.select({
			qtde: count(sales.id),
			valorTotal: sum(sales.valorTotal),
			custoTotal: sum(sales.custoTotal),
		})
		.from(sales)
		.where(and(...conditions, gte(sales.dataVenda, previousPeriodAfter), lte(sales.dataVenda, previousPeriodBefore)));

	const previousTotalSalesStats = previousTotalSalesStatsResult[0];

	const previousTotalSalesQty = previousTotalSalesStats.qtde;
	const previousTotalSalesValorTotal = previousTotalSalesStats.valorTotal ? Number(previousTotalSalesStats.valorTotal) : 0;
	const previousTotalSalesCustoTotal = previousTotalSalesStats.custoTotal ? Number(previousTotalSalesStats.custoTotal) : 0;

	const previousTotalSalesItemsStatsResult = await db
		.select({
			total: sum(saleItems.quantidade),
		})
		.from(saleItems)
		.where(
			and(
				eq(saleItems.organizacaoId, organizacaoId),
				inArray(
					saleItems.vendaId,
					db
						.select({ id: sales.id })
						.from(sales)
						.where(and(...conditions, gte(sales.dataVenda, previousPeriodAfter), lte(sales.dataVenda, previousPeriodBefore))),
				),
			),
		);

	const previousTotalSalesItemsStats = previousTotalSalesItemsStatsResult[0];
	const previousTotalSalesItemsQty = previousTotalSalesItemsStats.total ? Number(previousTotalSalesItemsStats.total) : 0;

	// Revenue breakdown - período anterior
	const prevExistingClientsRevenueResult = await db
		.select({ total: sum(sales.valorTotal) })
		.from(sales)
		.innerJoin(clients, eq(sales.clienteId, clients.id))
		.where(
			and(
				...conditions,
				eq(clients.organizacaoId, organizacaoId),
				gte(sales.dataVenda, previousPeriodAfter),
				lte(sales.dataVenda, previousPeriodBefore),
				lt(clients.primeiraCompraData, previousPeriodAfter),
			),
		);
	const prevNewClientsRevenueResult = await db
		.select({ total: sum(sales.valorTotal) })
		.from(sales)
		.innerJoin(clients, eq(sales.clienteId, clients.id))
		.where(
			and(
				...conditions,
				eq(clients.organizacaoId, organizacaoId),
				gte(sales.dataVenda, previousPeriodAfter),
				lte(sales.dataVenda, previousPeriodBefore),
				gte(clients.primeiraCompraData, previousPeriodAfter),
				lte(clients.primeiraCompraData, previousPeriodBefore),
			),
		);
	const prevNonIdentifiedRevenueResult = await db
		.select({ total: sum(sales.valorTotal) })
		.from(sales)
		.leftJoin(clients, eq(sales.clienteId, clients.id))
		.where(and(...conditions, gte(sales.dataVenda, previousPeriodAfter), lte(sales.dataVenda, previousPeriodBefore), isNull(clients.id)));

	const prevExistingClientsRevenue = prevExistingClientsRevenueResult[0]?.total ? Number(prevExistingClientsRevenueResult[0].total) : 0;
	const prevNewClientsRevenue = prevNewClientsRevenueResult[0]?.total ? Number(prevNewClientsRevenueResult[0].total) : 0;
	const prevNonIdentifiedRevenue = prevNonIdentifiedRevenueResult[0]?.total ? Number(prevNonIdentifiedRevenueResult[0].total) : 0;

	return {
		faturamento: {
			atual: totalSalesValorTotal,
			anterior: previousTotalSalesValorTotal,
		},
		margemBruta: {
			atual: totalSalesValorTotal - totalSalesCustoTotal,
			anterior: previousTotalSalesValorTotal - previousTotalSalesCustoTotal,
		},
		qtdeVendas: {
			atual: totalSalesQty,
			anterior: previousTotalSalesQty,
		},
		qtdeItensVendidos: {
			atual: totalSalesItemsQty,
			anterior: previousTotalSalesItemsQty,
		},
		itensPorVendaMedio: {
			atual: totalSalesItemsQty / totalSalesQty,
			anterior: previousTotalSalesItemsQty / previousTotalSalesQty,
		},
		ticketMedio: {
			atual: totalSalesValorTotal / totalSalesQty,
			anterior: previousTotalSalesValorTotal / previousTotalSalesQty,
		},
		valorDiarioVendido: {
			atual: totalSalesValorTotal / dateDiff,
			anterior: previousTotalSalesValorTotal / dateDiff,
		},
		faturamentoViaClientesRecorrentes: {
			atual: existingClientsRevenue,
			anterior: prevExistingClientsRevenue,
			porcentagem: revenuePercentage(existingClientsRevenue),
		},
		faturamentoViaNovosClientes: {
			atual: newClientsRevenue,
			anterior: prevNewClientsRevenue,
			porcentagem: revenuePercentage(newClientsRevenue),
		},
		faturamentoViaClientesNaoIdentificados: {
			atual: nonIdentifiedRevenue,
			anterior: prevNonIdentifiedRevenue,
			porcentagem: revenuePercentage(nonIdentifiedRevenue),
		},
	};
}
