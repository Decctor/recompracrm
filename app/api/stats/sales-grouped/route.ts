import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { inOperationTimezone } from "@/lib/operation-timezone";
import { assertSellersIdsWithinResultsScope } from "@/lib/permissions/results-scope";
import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import { SalesGeneralStatsFiltersSchema, type TSaleStatsGeneralQueryParams } from "@/schemas/query-params-utils";

import { db } from "@/services/drizzle";
import { clients, partners, products, saleItems, sales, sellers } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, countDistinct, eq, exists, gte, inArray, isNotNull, lte, max, min, notInArray, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";

export type TGroupedSalesStats = {
	porItem: {
		id: string;
		titulo: string;
		qtde: number;
		vendas: number;
		total: number;
	}[];
	porGrupo: {
		titulo: string;
		qtde: number;
		total: number;
	}[];
	porVendedor: {
		vendedor: {
			id: string;
			identificador: string;
			nome: string;
			avatarUrl: string | null;
		};
		qtde: number;
		total: number;
	}[];
	porCanal: {
		titulo: string;
		qtde: number;
		total: number;
	}[];
	porEntregaModalidade: {
		titulo: string;
		qtde: number;
		total: number;
	}[];
	porParceiro: {
		parceiro: {
			id: string;
			identificador: string;
			nome: string;
			avatarUrl: string | null;
			cpfCnpj: string | null;
		};
		qtde: number;
		total: number;
		ultimaCompra: Date | null;
		vendedorMaisFrequente: string | null;
		tempoAtividade: Date | null;
	}[];
	porDiaDoMes: {
		dia: number;
		qtde: number;
		total: number;
	}[];
	porMes: {
		mes: number;
		qtde: number;
		total: number;
	}[];
	porDiaDaSemana: {
		diaSemana: number;
		qtde: number;
		total: number;
	}[];
	porDiaSemanaHora: {
		diaSemana: number;
		hora: number;
		qtde: number;
		total: number;
	}[];
};

type GetResponse = {
	data: TGroupedSalesStats;
};
const getSalesGroupedStatsRoute: PagesRouteHandler<GetResponse> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgMembership = sessionUser.membership;
	const userOrgId = userOrgMembership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const filters = SalesGeneralStatsFiltersSchema.parse(req.body);

	await assertSellersIdsWithinResultsScope({
		organizacaoId: userOrgId,
		resultsScope: userOrgMembership.permissoes.resultados.escopo,
		sellersIds: filters.sellersIds,
	});

	const stats = await getSalesGroupedStats({ filters, organizacaoId: userOrgId });

	return res.status(200).json({
		data: {
			porItem: stats.porItem.map((item) => ({
				id: item.id,
				titulo: item.titulo,
				qtde: Number(item.qtde ?? 0),
				vendas: item.vendas,
				total: item.total ? Number(item.total) : 0,
			})),
			porGrupo: stats.porGrupo.map((item) => ({ titulo: item.titulo, qtde: Number(item.qtde ?? 0), total: item.total ? Number(item.total) : 0 })),
			porVendedor: stats.porVendedor.map((item) => ({
				vendedor: {
					id: item.vendedorId as string,
					identificador: item.nome as string,
					nome: item.nome ?? "",
					avatarUrl: item.avatarUrl ?? null,
				},
				nome: item.nome,
				avatarUrl: item.avatarUrl ?? null,
				qtde: item.qtde,
				total: item.total ? Number(item.total) : 0,
			})),
			porParceiro: stats.porParceiro.map((item) => ({
				parceiro: {
					id: item.parceiroId as string,
					identificador: item.identificador as string,
					nome: item.nome ?? "",
					avatarUrl: item.avatarUrl ?? null,
					cpfCnpj: item.cpfCnpj ?? null,
				},
				nome: item.nome,
				avatarUrl: item.avatarUrl ?? null,
				qtde: item.qtde,
				total: item.total ? Number(item.total) : 0,
				ultimaCompra: item.ultimaCompra,
				vendedorMaisFrequente: item.vendedorMaisFrequente,
				tempoAtividade: item.tempoAtividade,
			})),
			porCanal: stats.porCanal.map((item) => ({ titulo: item.titulo as string, qtde: item.qtde, total: item.total ? Number(item.total) : 0 })),
			porEntregaModalidade: stats.porEntregaModalidade.map((item) => ({
				titulo: item.titulo as string,
				qtde: item.qtde,
				total: item.total ? Number(item.total) : 0,
			})),
			porDiaDoMes: stats.porDiaDoMes.map((item) => ({ dia: item.dia, qtde: item.qtde, total: item.total ? Number(item.total) : 0 })),
			porMes: stats.porMes.map((item) => ({ mes: item.mes, qtde: item.qtde, total: item.total ? Number(item.total) : 0 })),
			porDiaDaSemana: stats.porDiaDaSemana.map((item) => ({ diaSemana: item.diaSemana, qtde: item.qtde, total: item.total ? Number(item.total) : 0 })),
			porDiaSemanaHora: stats.porDiaSemanaHora.map((item) => ({
				diaSemana: Number(item.diaSemana),
				hora: Number(item.hora),
				qtde: item.qtde,
				total: item.total ? Number(item.total) : 0,
			})),
		},
	});

};

const routeHandlers = {
	POST: getSalesGroupedStatsRoute,
	GET: getSalesGroupedStatsRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});
export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET!, bodyFromSearchParam: "payload" }),
});

type GetSalesParams = {
	filters: TSaleStatsGeneralQueryParams;
	organizacaoId: string;
};

async function getSalesGroupedStats({ filters, organizacaoId }: GetSalesParams) {
	const ajustedAfter = filters.period.after ? dayjs(filters.period.after).toDate() : null;
	const ajustedBefore = filters.period.before ? dayjs(filters.period.before).endOf("day").toDate() : null;

	const conditions = [eq(sales.organizacaoId, organizacaoId), eq(sales.statusVenda, "CONFIRMADA")];

	if (ajustedAfter) conditions.push(gte(sales.dataVenda, ajustedAfter));
	if (ajustedBefore) conditions.push(lte(sales.dataVenda, ajustedBefore));
	if (filters.total.min) conditions.push(gte(sales.valorTotal, filters.total.min));
	if (filters.total.max) conditions.push(lte(sales.valorTotal, filters.total.max));

	const integrationCondition = getSalesIntegrationCondition(filters.integrationsIds);
	if (integrationCondition) conditions.push(integrationCondition);

	if (filters.sellersIds.length > 0) conditions.push(inArray(sales.vendedorId, filters.sellersIds));

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

	const sellersResult = await db.query.sellers.findMany({
		where: eq(sellers.organizacaoId, organizacaoId),
		columns: {
			id: true,
			identificador: true,
			nome: true,
			avatarUrl: true,
		},
	});
	const sellersMap = new Map(sellersResult.map((seller) => [seller.id, seller]));
	const partnersResult = await db.query.partners.findMany({
		where: eq(partners.organizacaoId, organizacaoId),
		columns: {
			id: true,
			identificador: true,
			nome: true,
			avatarUrl: true,
			cpfCnpj: true,
		},
	});
	const partnersMap = new Map(partnersResult.map((partner) => [partner.id, partner]));

	const resultsBySeller = await db
		.select({
			vendedorId: sales.vendedorId,
			qtde: count(sales.id),
			total: sum(sales.valorTotal),
		})
		.from(sales)
		.where(and(...conditions))
		.groupBy(sales.vendedorId);

	// Query para obter contagem de vendas por parceiro e vendedor
	const salesByPartnerAndSeller = await db
		.select({
			parceiroId: sales.parceiroId,
			vendedorId: sales.vendedorId,
			qtdeVendas: count(sales.id),
		})
		.from(sales)
		.where(and(...conditions, isNotNull(sales.parceiro), notInArray(sales.parceiro, ["", "0", "N/A"])))
		.groupBy(sales.parceiroId, sales.vendedorId);

	// Query para obter a primeira venda de cada parceiro (sem filtros de período)
	const firstSaleByPartner = await db
		.select({
			parceiroId: sales.parceiroId,
			primeiraVenda: min(sales.dataVenda),
		})
		.from(sales)
		.where(and(eq(sales.organizacaoId, organizacaoId), isNotNull(sales.parceiro), notInArray(sales.parceiro, ["", "0", "N/A"])))
		.groupBy(sales.parceiroId);

	const resultsByPartner = await db
		.select({
			parceiroId: sales.parceiroId,
			qtde: count(sales.id),
			total: sum(sales.valorTotal),
			ultimaCompra: max(sales.dataVenda),
		})
		.from(sales)
		.innerJoin(partners, eq(sales.parceiroId, partners.id))
		.where(and(...conditions, isNotNull(sales.parceiroId)))
		.groupBy(sales.parceiroId);

	// Enriquecendo os resultados com vendedor mais frequente e tempo de atividade
	const enrichedResultsByPartner = resultsByPartner.map((partner) => {
		const partnerInfo = partnersMap.get(partner.parceiroId as string);
		// Encontra o vendedor com mais vendas para este parceiro
		const mostFrequentSeller = salesByPartnerAndSeller.filter((v) => v.parceiroId === partner.parceiroId).sort((a, b) => b.qtdeVendas - a.qtdeVendas);

		// Encontra a primeira venda deste parceiro
		const firstSale = firstSaleByPartner.find((p) => p.parceiroId === partner.parceiroId);

		return {
			...partner,
			nome: partnerInfo?.nome || null,
			identificador: partnerInfo?.identificador as string,
			cpfCnpj: partnerInfo?.cpfCnpj as string,
			avatarUrl: partnerInfo?.avatarUrl || null,
			vendedorMaisFrequente: mostFrequentSeller[0]?.vendedorId ? (sellersMap.get(mostFrequentSeller[0].vendedorId)?.nome ?? null) : null,
			tempoAtividade: firstSale?.primeiraVenda || null,
		};
	});

	const enrichedResultsBySeller = resultsBySeller.map((seller) => {
		const sellerInfo = sellersMap.get(seller.vendedorId as string);
		return {
			...seller,
			nome: sellerInfo?.nome || null,
			identificador: sellerInfo?.identificador as string,
			avatarUrl: sellerInfo?.avatarUrl || null,
		};
	});
	const resultsByItem = await db
		.select({
			id: products.id,
			titulo: products.nome,
			qtde: sum(saleItems.quantidade),
			vendas: countDistinct(saleItems.vendaId),
			total: sum(saleItems.valorVendaTotalLiquido),
		})
		.from(saleItems)
		.where(
			and(
				eq(saleItems.organizacaoId, organizacaoId),
				exists(
					db
						.select({ id: sales.id })
						.from(sales)
						.where(and(eq(sales.id, saleItems.vendaId), ...conditions)),
				),
			),
		)
		.innerJoin(products, eq(saleItems.produtoId, products.id))
		.groupBy(products.id, products.nome);

	const resultsByItemGroup = await db
		.select({
			titulo: products.grupo,
			qtde: sum(saleItems.quantidade),
			total: sum(saleItems.valorVendaTotalLiquido),
		})
		.from(saleItems)
		.where(
			and(
				eq(saleItems.organizacaoId, organizacaoId),
				exists(
					db
						.select({ id: sales.id })
						.from(sales)
						.where(and(eq(sales.id, saleItems.vendaId), ...conditions)),
				),
			),
		)
		.innerJoin(products, eq(saleItems.produtoId, products.id))
		.groupBy(products.grupo);

	// Grouping by day of the month
	const resultsByDayOfMonth = await db
		.select({
			dia: sql<number>`EXTRACT(DAY FROM ${inOperationTimezone(sales.dataVenda)})`,
			qtde: count(sales.id),
			total: sum(sales.valorTotal),
		})
		.from(sales)
		.where(and(...conditions, isNotNull(sales.dataVenda)))
		.groupBy(sql`EXTRACT(DAY FROM ${inOperationTimezone(sales.dataVenda)})`);

	// Grouping by month
	const resultsByMonth = await db
		.select({
			mes: sql<number>`EXTRACT(MONTH FROM ${inOperationTimezone(sales.dataVenda)})`,
			qtde: count(sales.id),
			total: sum(sales.valorTotal),
		})
		.from(sales)
		.where(and(...conditions, isNotNull(sales.dataVenda)))
		.groupBy(sql`EXTRACT(MONTH FROM ${inOperationTimezone(sales.dataVenda)})`);

	// Grouping by day of the week (0 = Sunday, 6 = Saturday)
	const resultsByDayOfWeek = await db
		.select({
			diaSemana: sql<number>`EXTRACT(DOW FROM ${inOperationTimezone(sales.dataVenda)})`,
			qtde: count(sales.id),
			total: sum(sales.valorTotal),
		})
		.from(sales)
		.where(and(...conditions, isNotNull(sales.dataVenda)))
		.groupBy(sql`EXTRACT(DOW FROM ${inOperationTimezone(sales.dataVenda)})`);

	// Heatmap: grouping by day of week + hour (0 = Sunday, 6 = Saturday; hora 0-23)
	const resultsByDayOfWeekAndHour = await db
		.select({
			diaSemana: sql<number>`EXTRACT(DOW FROM ${inOperationTimezone(sales.dataVenda)})`,
			hora: sql<number>`EXTRACT(HOUR FROM ${inOperationTimezone(sales.dataVenda)})`,
			qtde: count(sales.id),
			total: sum(sales.valorTotal),
		})
		.from(sales)
		.where(and(...conditions, isNotNull(sales.dataVenda)))
		.groupBy(sql`EXTRACT(DOW FROM ${inOperationTimezone(sales.dataVenda)})`, sql`EXTRACT(HOUR FROM ${inOperationTimezone(sales.dataVenda)})`);

	const resultsByChannel = await db
		.select({
			titulo: sales.canal,
			qtde: count(sales.id),
			total: sum(sales.valorTotal),
		})
		.from(sales)
		.where(and(...conditions, isNotNull(sales.canal)))
		.groupBy(sales.canal);

	const resultsByFulfillmentMethod = await db
		.select({
			titulo: sales.entregaModalidade,
			qtde: count(sales.id),
			total: sum(sales.valorTotal),
		})
		.from(sales)
		.where(and(...conditions, isNotNull(sales.entregaModalidade)))
		.groupBy(sales.entregaModalidade);

	return {
		porItem: resultsByItem,
		porGrupo: resultsByItemGroup,
		porVendedor: enrichedResultsBySeller,
		porParceiro: enrichedResultsByPartner,
		porDiaDoMes: resultsByDayOfMonth,
		porMes: resultsByMonth,
		porDiaDaSemana: resultsByDayOfWeek,
		porDiaSemanaHora: resultsByDayOfWeekAndHour,
		porCanal: resultsByChannel,
		porEntregaModalidade: resultsByFulfillmentMethod,
	};
}
