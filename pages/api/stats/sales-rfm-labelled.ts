import type { NextApiHandler } from "next";

import { apiHandler } from "@/lib/api";
import { getCurrentSessionUncached } from "@/lib/authentication/pages-session";
import { db } from "@/services/drizzle";
import { clients, saleItems, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, eq, gte, isNotNull, lte, max, min, sum } from "drizzle-orm";
import createHttpError from "http-errors";

export type TRFMSegmentPeriodStats = {
	totalRevenue: number;
	totalPurchasesQty: number;
	avgTicket: number;
	avgPurchaseCycleDays: number;
	avgBasketSize: number;
};

export type TRFMLabelledStats = {
	rfmLabel: string;
	backgroundCollor: string;
	gridArea: string;
	clientsQty: number;
	segmentPeriodStats: TRFMSegmentPeriodStats;
}[];
type GetResponse = {
	data: TRFMLabelledStats;
};
const getSalesRFMLabelledRoute: NextApiHandler<GetResponse> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached(req.cookies);
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const periodAfter = dayjs().subtract(1, "year").startOf("day").toDate();
	const periodBefore = dayjs().endOf("day").toDate();

	const allClients = await db.query.clients.findMany({
		where: (fields, { eq }) => eq(fields.organizacaoId, userOrgId),
		columns: {
			analiseRFMTitulo: true,
		},
	});

	const clientsQtyBySegment = allClients.reduce<Record<string, number>>((acc, client) => {
		if (!client.analiseRFMTitulo) return acc;
		acc[client.analiseRFMTitulo] = (acc[client.analiseRFMTitulo] || 0) + 1;
		return acc;
	}, {});

	const salesBySegment = await db
		.select({
			rfmLabel: clients.analiseRFMTitulo,
			totalRevenue: sum(sales.valorTotal),
			totalPurchasesQty: count(sales.id),
		})
		.from(sales)
		.innerJoin(clients, and(eq(sales.clienteId, clients.id), eq(clients.organizacaoId, userOrgId)))
		.where(
			and(
				eq(sales.organizacaoId, userOrgId),
				gte(sales.dataVenda, periodAfter),
				lte(sales.dataVenda, periodBefore),
				isNotNull(clients.analiseRFMTitulo),
			),
		)
		.groupBy(clients.analiseRFMTitulo);

	const itemsBySegment = await db
		.select({
			rfmLabel: clients.analiseRFMTitulo,
			totalItemsQty: sum(saleItems.quantidade),
		})
		.from(saleItems)
		.innerJoin(sales, and(eq(saleItems.vendaId, sales.id), eq(sales.organizacaoId, userOrgId)))
		.innerJoin(clients, and(eq(sales.clienteId, clients.id), eq(clients.organizacaoId, userOrgId)))
		.where(
			and(
				eq(saleItems.organizacaoId, userOrgId),
				gte(sales.dataVenda, periodAfter),
				lte(sales.dataVenda, periodBefore),
				isNotNull(clients.analiseRFMTitulo),
			),
		)
		.groupBy(clients.analiseRFMTitulo);

	const purchaseCycleByClientRows = await db
		.select({
			rfmLabel: clients.analiseRFMTitulo,
			clientId: sales.clienteId,
			purchasesQty: count(sales.id),
			firstPurchaseDate: min(sales.dataVenda),
			lastPurchaseDate: max(sales.dataVenda),
		})
		.from(sales)
		.innerJoin(clients, and(eq(sales.clienteId, clients.id), eq(clients.organizacaoId, userOrgId)))
		.where(
			and(
				eq(sales.organizacaoId, userOrgId),
				gte(sales.dataVenda, periodAfter),
				lte(sales.dataVenda, periodBefore),
				isNotNull(sales.clienteId),
				isNotNull(clients.analiseRFMTitulo),
			),
		)
		.groupBy(clients.analiseRFMTitulo, sales.clienteId);

	const salesStatsBySegment = new Map<string, { totalRevenue: number; totalPurchasesQty: number }>();
	for (const row of salesBySegment) {
		if (!row.rfmLabel) continue;

		salesStatsBySegment.set(row.rfmLabel, {
			totalRevenue: row.totalRevenue ? Number(row.totalRevenue) : 0,
			totalPurchasesQty: Number(row.totalPurchasesQty),
		});
	}

	const itemsQtyBySegment = new Map<string, number>();
	for (const row of itemsBySegment) {
		if (!row.rfmLabel) continue;
		itemsQtyBySegment.set(row.rfmLabel, row.totalItemsQty ? Number(row.totalItemsQty) : 0);
	}

	const cycleStatsBySegment = new Map<string, { totalDaysSpan: number; totalIntervals: number }>();
	for (const row of purchaseCycleByClientRows) {
		if (!row.rfmLabel || !row.firstPurchaseDate || !row.lastPurchaseDate) continue;

		const purchasesQty = Number(row.purchasesQty);
		if (purchasesQty <= 1) continue;

		const currentRowDaysSpan = dayjs(row.lastPurchaseDate).diff(dayjs(row.firstPurchaseDate), "day", true);
		const currentRowIntervals = purchasesQty - 1;
		const existingStats = cycleStatsBySegment.get(row.rfmLabel) || { totalDaysSpan: 0, totalIntervals: 0 };

		cycleStatsBySegment.set(row.rfmLabel, {
			totalDaysSpan: existingStats.totalDaysSpan + currentRowDaysSpan,
			totalIntervals: existingStats.totalIntervals + currentRowIntervals,
		});
	}

	function getSegmentPeriodStats(rfmLabel: string): TRFMSegmentPeriodStats {
		const salesStats = salesStatsBySegment.get(rfmLabel) || { totalRevenue: 0, totalPurchasesQty: 0 };
		const totalItemsQty = itemsQtyBySegment.get(rfmLabel) || 0;
		const cycleStats = cycleStatsBySegment.get(rfmLabel);

		return {
			totalRevenue: salesStats.totalRevenue,
			totalPurchasesQty: salesStats.totalPurchasesQty,
			avgTicket: salesStats.totalPurchasesQty > 0 ? salesStats.totalRevenue / salesStats.totalPurchasesQty : 0,
			avgPurchaseCycleDays:
				cycleStats && cycleStats.totalIntervals > 0 ? cycleStats.totalDaysSpan / cycleStats.totalIntervals : 0,
			avgBasketSize: salesStats.totalPurchasesQty > 0 ? totalItemsQty / salesStats.totalPurchasesQty : 0,
		};
	}

	const gridItems = [
		{
			rfmLabel: "NÃO PODE PERDÊ-LOS",
			backgroundCollor: "bg-blue-400",
			gridArea: "1 / 1 / 2 / 3",
			clientsQty: clientsQtyBySegment["NÃO PODE PERDÊ-LOS"] || 0,
			segmentPeriodStats: getSegmentPeriodStats("NÃO PODE PERDÊ-LOS"),
		},
		{
			rfmLabel: "CLIENTES LEAIS",
			backgroundCollor: "bg-green-400",
			gridArea: "1 / 3 / 3 / 6",
			clientsQty: clientsQtyBySegment["CLIENTES LEAIS"] || 0,
			segmentPeriodStats: getSegmentPeriodStats("CLIENTES LEAIS"),
		},
		{
			rfmLabel: "CAMPEÕES",
			backgroundCollor: "bg-orange-400",
			gridArea: "1 / 5 / 2 / 6",
			clientsQty: clientsQtyBySegment["CAMPEÕES"] || 0,
			segmentPeriodStats: getSegmentPeriodStats("CAMPEÕES"),
		},
		{
			rfmLabel: "EM RISCO",
			backgroundCollor: "bg-yellow-400",
			gridArea: "2 / 1 / 4 / 3",
			clientsQty: clientsQtyBySegment["EM RISCO"] || 0,
			segmentPeriodStats: getSegmentPeriodStats("EM RISCO"),
		},
		{
			rfmLabel: "PRECISAM DE ATENÇÃO",
			backgroundCollor: "bg-indigo-400",
			gridArea: "3 / 3 / 4 / 4",
			clientsQty: clientsQtyBySegment["PRECISAM DE ATENÇÃO"] || 0,
			segmentPeriodStats: getSegmentPeriodStats("PRECISAM DE ATENÇÃO"),
		},
		{
			rfmLabel: "POTENCIAIS CLIENTES LEAIS",
			backgroundCollor: "bg-[#5C4033]",
			gridArea: "3 / 4 / 5 / 6",
			clientsQty: clientsQtyBySegment["POTENCIAIS CLIENTES LEAIS"] || 0,
			segmentPeriodStats: getSegmentPeriodStats("POTENCIAIS CLIENTES LEAIS"),
		},
		{
			rfmLabel: "HIBERNANDO",
			backgroundCollor: "bg-purple-400",
			gridArea: "4 / 2 / 5 / 3",
			clientsQty: clientsQtyBySegment["HIBERNANDO"] || 0,
			segmentPeriodStats: getSegmentPeriodStats("HIBERNANDO"),
		},
		{
			rfmLabel: "PRESTES A DORMIR",
			backgroundCollor: "bg-yellow-600",
			gridArea: "4 / 3 / 6 / 4",
			clientsQty: clientsQtyBySegment["PRESTES A DORMIR"] || 0,
			segmentPeriodStats: getSegmentPeriodStats("PRESTES A DORMIR"),
		},
		{
			rfmLabel: "PERDIDOS",
			backgroundCollor: "bg-red-500",
			gridArea: "4 / 1 / 6 / 2",
			clientsQty: clientsQtyBySegment["PERDIDOS"] || 0,
			segmentPeriodStats: getSegmentPeriodStats("PERDIDOS"),
		},
		{
			rfmLabel: "PERDIDOS (extensão)",
			backgroundCollor: "bg-red-500",
			gridArea: "5 / 2 / 6 / 3",
			clientsQty: clientsQtyBySegment["PERDIDOS (extensão)"] || 0,
			segmentPeriodStats: getSegmentPeriodStats("PERDIDOS (extensão)"),
		},
		{
			rfmLabel: "PROMISSORES",
			backgroundCollor: "bg-pink-400",
			gridArea: "5 / 4 / 6 / 5",
			clientsQty: clientsQtyBySegment["PROMISSORES"] || 0,
			segmentPeriodStats: getSegmentPeriodStats("PROMISSORES"),
		},
		{
			rfmLabel: "CLIENTES RECENTES",
			backgroundCollor: "bg-teal-400",
			gridArea: "5 / 5 / 6 / 6",
			clientsQty: clientsQtyBySegment["CLIENTES RECENTES"] || 0,
			segmentPeriodStats: getSegmentPeriodStats("CLIENTES RECENTES"),
		},
	];

	return res.status(200).json({ data: gridItems });
};

export default apiHandler({ GET: getSalesRFMLabelledRoute });
