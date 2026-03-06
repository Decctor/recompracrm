import { db } from "@/services/drizzle";
import { clients, goals, goalsSellers, partners, products, saleItems, sales, sellers } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, countDistinct, desc, eq, gte, inArray, isNotNull, lte, notInArray, or, sql, sum } from "drizzle-orm";

type PeriodParams = {
	after: Date;
	before: Date;
	comparisonAfter: Date;
	comparisonBefore: Date;
	organizacaoId: string;
};

export type OverallSalesStatsResult = {
	faturamento: {
		atual: number;
		anterior: number | undefined;
	};
	custoTotal: {
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
	faturamentoMeta: number;
	faturamentoMetaPorcentagem: number;
};

export async function getOverallSalesStats({
	after,
	before,
	comparisonAfter,
	comparisonBefore,
	organizacaoId,
}: PeriodParams): Promise<OverallSalesStatsResult> {
	// Current period stats
	const totalSalesStatsResult = await db
		.select({
			qtde: count(sales.id),
			valorTotal: sum(sales.valorTotal),
			custoTotal: sum(sales.custoTotal),
		})
		.from(sales)
		.where(and(eq(sales.organizacaoId, organizacaoId), eq(sales.natureza, "SN01"), gte(sales.dataVenda, after), lte(sales.dataVenda, before)));
	console.log("TOTAL SALES STATS RESULT:", totalSalesStatsResult);
	const totalSalesStats = totalSalesStatsResult[0];
	const totalSalesQty = totalSalesStats.qtde;
	const totalSalesValorTotal = totalSalesStats.valorTotal ? Number(totalSalesStats.valorTotal) : 0;
	const totalSalesCustoTotal = totalSalesStats.custoTotal ? Number(totalSalesStats.custoTotal) : 0;

	const totalSalesItemsStatsResult = await db
		.select({
			total: sum(saleItems.quantidade),
		})
		.from(saleItems)
		.where(
			inArray(
				saleItems.vendaId,
				db
					.select({ id: sales.id })
					.from(sales)
					.where(and(eq(sales.organizacaoId, organizacaoId), eq(sales.natureza, "SN01"), gte(sales.dataVenda, after), lte(sales.dataVenda, before))),
			),
		);

	const totalSalesItemsStats = totalSalesItemsStatsResult[0];
	const totalSalesItemsQty = totalSalesItemsStats.total ? Number(totalSalesItemsStats.total) : 0;

	// Previous period stats
	const dateDiff = dayjs(before).diff(dayjs(after), "days");

	const previousTotalSalesStatsResult = await db
		.select({
			qtde: count(sales.id),
			valorTotal: sum(sales.valorTotal),
			custoTotal: sum(sales.custoTotal),
		})
		.from(sales)
		.where(
			and(
				eq(sales.organizacaoId, organizacaoId),
				eq(sales.natureza, "SN01"),
				gte(sales.dataVenda, comparisonAfter),
				lte(sales.dataVenda, comparisonBefore),
			),
		);

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
			inArray(
				saleItems.vendaId,
				db
					.select({ id: sales.id })
					.from(sales)
					.where(
						and(
							eq(sales.organizacaoId, organizacaoId),
							eq(sales.natureza, "SN01"),
							gte(sales.dataVenda, comparisonAfter),
							lte(sales.dataVenda, comparisonBefore),
						),
					),
			),
		);

	const previousTotalSalesItemsStats = previousTotalSalesItemsStatsResult[0];
	const previousTotalSalesItemsQty = previousTotalSalesItemsStats.total ? Number(previousTotalSalesItemsStats.total) : 0;

	// Get sale goals
	const saleGoal = await getOverallSaleGoal({ after, before, comparisonAfter, comparisonBefore, organizacaoId });

	return {
		faturamento: {
			atual: totalSalesValorTotal,
			anterior: previousTotalSalesValorTotal,
		},
		custoTotal: {
			atual: totalSalesCustoTotal,
			anterior: previousTotalSalesCustoTotal,
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
		faturamentoMeta: saleGoal,
		faturamentoMetaPorcentagem: (totalSalesValorTotal / saleGoal) * 100,
	};
}

async function getOverallSaleGoal({ after, before, comparisonAfter, comparisonBefore, organizacaoId }: PeriodParams): Promise<number> {
	try {
		const goals = await db.query.goals.findMany({
			where: (fields, { and, or, gte, lte, eq }) =>
				and(
					eq(fields.organizacaoId, organizacaoId),
					or(and(gte(fields.dataInicio, after), lte(fields.dataInicio, before)), and(gte(fields.dataFim, after), lte(fields.dataFim, before))),
				),
		});

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
				return acc;
			}
			if (afterDatetime <= monthStartDatetime && beforeDatetime >= monthEndDatetime) {
				return acc + current.objetivoValor;
			}
			if (beforeDatetime > monthEndDatetime) {
				const applicableDays = dayjs(current.dataFim).diff(dayjs(after), "days");
				return acc + (current.objetivoValor * applicableDays) / days;
			}

			const applicableDays = dayjs(before).diff(dayjs(current.dataInicio), "days") + 1;
			return acc + (current.objetivoValor * applicableDays) / days;
		}, 0);

		return applicableSaleGoal;
	} catch (error) {
		console.log("Error getting overall sale goal", error);
		return 0;
	}
}

export type SellerRankingItem = {
	vendedorId: string;
	vendedorNome: string;
	vendedorAvatarUrl: string | null;
	qtdeVendas: number;
	faturamento: number;
	meta: number;
	percentualMeta: number;
};

export async function getSellerRankings({ after, before, organizacaoId }: PeriodParams, limit = 10): Promise<SellerRankingItem[]> {
	const saleWhereConditions = [isNotNull(sales.dataVenda)] as const;
	const saleWhere = and(
		...saleWhereConditions,
		eq(sales.organizacaoId, organizacaoId),
		eq(sales.natureza, "SN01"),
		gte(sales.dataVenda, after),
		lte(sales.dataVenda, before),
	);

	const sellersResult = await db.query.sellers.findMany({
		where: eq(sellers.organizacaoId, organizacaoId),
		columns: {
			id: true,
			nome: true,
			avatarUrl: true,
		},
	});
	const sellersMap = new Map(sellersResult.map((seller) => [seller.id, seller]));

	const resultsBySeller = await db
		.select({
			vendedorId: sales.vendedorId,
			qtde: count(sales.id),
			total: sum(sales.valorTotal),
		})
		.from(sales)
		.where(saleWhere)
		.groupBy(sales.vendedorId)
		.orderBy(desc(sql`sum(${sales.valorTotal})`))
		.limit(limit);

	// Get goals for sellers
	const sellerIds = resultsBySeller.map((s) => s.vendedorId).filter((id): id is string => id !== null);

	const sellerGoalsMap = new Map<string, number>();
	for (const sellerId of sellerIds) {
		const goal = await getSellerSaleGoal({ sellerId, after, before, organizacaoId });
		sellerGoalsMap.set(sellerId, goal);
	}

	return resultsBySeller.map((seller) => {
		const sellerInfo = sellersMap.get(seller.vendedorId as string);
		const faturamento = seller.total ? Number(seller.total) : 0;
		const meta = sellerGoalsMap.get(seller.vendedorId as string) || 0;

		return {
			vendedorId: seller.vendedorId as string,
			vendedorNome: sellerInfo?.nome || "N/A",
			vendedorAvatarUrl: sellerInfo?.avatarUrl || null,
			qtdeVendas: seller.qtde,
			faturamento,
			meta,
			percentualMeta: meta > 0 ? (faturamento / meta) * 100 : 0,
		};
	});
}

async function getSellerSaleGoal({
	sellerId,
	after,
	before,
	organizacaoId,
}: { sellerId: string; after: Date; before: Date; organizacaoId: string }): Promise<number> {
	try {
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
								or(and(gte(goals.dataInicio, after), lte(goals.dataInicio, before)), and(gte(goals.dataFim, after), lte(goals.dataFim, before))),
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
			const afterDatetime = new Date(after).getTime();
			const beforeDatetime = new Date(before).getTime();

			const monthStartDatetime = new Date(goal.meta.dataInicio).getTime();
			const monthEndDatetime = new Date(goal.meta.dataFim).getTime();

			const days = Math.abs(dayjs(goal.meta.dataFim).diff(dayjs(goal.meta.dataInicio), "days")) + 1;

			if (
				(afterDatetime < monthStartDatetime && beforeDatetime < monthStartDatetime) ||
				(afterDatetime > monthEndDatetime && beforeDatetime > monthEndDatetime)
			) {
				return acc;
			}
			if (afterDatetime <= monthStartDatetime && beforeDatetime >= monthEndDatetime) {
				return acc + goal.objetivoValor;
			}
			if (beforeDatetime > monthEndDatetime) {
				const applicableDays = dayjs(goal.meta.dataFim).diff(dayjs(after), "days");
				return acc + (goal.objetivoValor * applicableDays) / days;
			}

			const applicableDays = dayjs(before).diff(dayjs(goal.meta.dataInicio), "days") + 1;
			return acc + (goal.objetivoValor * applicableDays) / days;
		}, 0);

		return totalSellerGoal;
	} catch (error) {
		console.log("Error getting seller sale goal", error);
		return 0;
	}
}

export type PartnerRankingItem = {
	parceiroId: string;
	parceiroNome: string;
	parceiroAvatarUrl: string | null;
	qtdeVendas: number;
	faturamento: number;
};

export async function getPartnerRankings({ after, before, organizacaoId }: PeriodParams, limit = 10): Promise<PartnerRankingItem[]> {
	const saleWhereConditions = [isNotNull(sales.dataVenda), isNotNull(sales.parceiroId)] as const;
	const saleWhere = and(
		...saleWhereConditions,
		eq(sales.organizacaoId, organizacaoId),
		eq(sales.natureza, "SN01"),
		gte(sales.dataVenda, after),
		lte(sales.dataVenda, before),
	);

	const partnersResult = await db.query.partners.findMany({
		where: eq(partners.organizacaoId, organizacaoId),
		columns: {
			id: true,
			nome: true,
			avatarUrl: true,
		},
	});
	const partnersMap = new Map(partnersResult.map((partner) => [partner.id, partner]));

	const resultsByPartner = await db
		.select({
			parceiroId: sales.parceiroId,
			qtde: count(sales.id),
			total: sum(sales.valorTotal),
		})
		.from(sales)
		.innerJoin(partners, eq(sales.parceiroId, partners.id))
		.where(saleWhere)
		.groupBy(sales.parceiroId)
		.orderBy(desc(sql`sum(${sales.valorTotal})`))
		.limit(limit);

	return resultsByPartner.map((partner) => {
		const partnerInfo = partnersMap.get(partner.parceiroId as string);
		return {
			parceiroId: partner.parceiroId as string,
			parceiroNome: partnerInfo?.nome || "N/A",
			parceiroAvatarUrl: partnerInfo?.avatarUrl || null,
			qtdeVendas: partner.qtde,
			faturamento: partner.total ? Number(partner.total) : 0,
		};
	});
}

export type ProductRankingItem = {
	produtoId: string;
	produtoDescricao: string;
	produtoGrupo: string | null;
	quantidade: number;
	faturamento: number;
};

export async function getProductRankings({ after, before, organizacaoId }: PeriodParams, limit = 10): Promise<ProductRankingItem[]> {
	const saleWhere = and(
		eq(sales.organizacaoId, organizacaoId),
		isNotNull(sales.dataVenda),
		eq(sales.natureza, "SN01"),
		gte(sales.dataVenda, after),
		lte(sales.dataVenda, before),
	);

	const resultsByProduct = await db
		.select({
			produtoId: products.id,
			produtoDescricao: products.descricao,
			produtoGrupo: products.grupo,
			quantidade: sum(saleItems.quantidade),
			total: sum(saleItems.valorVendaTotalLiquido),
		})
		.from(saleItems)
		.innerJoin(sales, eq(saleItems.vendaId, sales.id))
		.innerJoin(products, eq(saleItems.produtoId, products.id))
		.where(and(saleWhere, eq(products.organizacaoId, organizacaoId)))
		.groupBy(products.id, products.descricao, products.grupo)
		.orderBy(desc(sql`sum(${saleItems.valorVendaTotalLiquido})`))
		.limit(limit);

	return resultsByProduct.map((product) => ({
		produtoId: product.produtoId,
		produtoDescricao: product.produtoDescricao || "N/A",
		produtoGrupo: product.produtoGrupo,
		quantidade: product.quantidade ? Number(product.quantidade) : 0,
		faturamento: product.total ? Number(product.total) : 0,
	}));
}

export type ProductGroupRankingItem = {
	grupo: string;
	quantidade: number;
	faturamento: number;
};

export async function getProductGroupRankings({ after, before, organizacaoId }: PeriodParams, limit = 10): Promise<ProductGroupRankingItem[]> {
	const saleWhere = and(
		eq(sales.organizacaoId, organizacaoId),
		isNotNull(sales.dataVenda),
		eq(sales.natureza, "SN01"),
		gte(sales.dataVenda, after),
		lte(sales.dataVenda, before),
	);

	const resultsByGroup = await db
		.select({
			grupo: products.grupo,
			quantidade: sum(saleItems.quantidade),
			total: sum(saleItems.valorVendaTotalLiquido),
		})
		.from(saleItems)
		.innerJoin(sales, eq(saleItems.vendaId, sales.id))
		.innerJoin(products, eq(saleItems.produtoId, products.id))
		.where(and(saleWhere, eq(products.organizacaoId, organizacaoId)))
		.groupBy(products.grupo)
		.orderBy(desc(sql`sum(${saleItems.valorVendaTotalLiquido})`))
		.limit(limit);

	return resultsByGroup.map((group) => ({
		grupo: group.grupo || "N/A",
		quantidade: group.quantidade ? Number(group.quantidade) : 0,
		faturamento: group.total ? Number(group.total) : 0,
	}));
}
