import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { ClientSearchQueryParams, type TClient } from "@/schemas/clients";
import { db } from "@/services/drizzle";
import { clients, sales, utils } from "@/services/drizzle/schema";
import { type TRFMConfig, getRFMLabel } from "@/utils/rfm";
import dayjs from "dayjs";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import type { z } from "zod";

export type TGetClientsExportationInput = z.infer<typeof ClientSearchQueryParams>;
async function fetchClientExportation(req: PagesRouteRequest, userOrgId: string) {
	const filters = ClientSearchQueryParams.parse(req.body);
	const ajustedAfter = filters.period.after ? dayjs(filters.period.after).toDate() : null;
	const ajustedBefore = filters.period.before ? dayjs(filters.period.before).endOf("day").toDate() : null;

	const utilsRFMReturn = await db.query.utils.findFirst({
		where: eq(utils.identificador, "CONFIG_RFM"),
	});
	const rfmConfig = utilsRFMReturn?.valor.identificador === "CONFIG_RFM" ? utilsRFMReturn.valor : null;

	// Build dynamic WHERE conditions based on filters
	const conditions = [eq(clients.organizacaoId, userOrgId)];
	if (filters.name.trim().length > 0) {
		conditions.push(
			sql`(to_tsvector('portuguese', ${clients.nome}) @@ plainto_tsquery('portuguese', ${filters.name}) OR ${clients.nome} ILIKE '%' || ${filters.name} || '%')`,
		);
	}
	if (filters.phone.trim().length > 0) {
		conditions.push(
			sql`(to_tsvector('portuguese', ${clients.telefone}) @@ plainto_tsquery('portuguese', ${filters.phone}) OR ${clients.telefone} ILIKE '%' || ${filters.phone} || '%')`,
		);
	}
	if (filters.acquisitionChannels.length > 0) {
		conditions.push(inArray(clients.canalAquisicao, filters.acquisitionChannels));
	}
	if (filters.rfmTitles.length > 0) {
		conditions.push(inArray(clients.analiseRFMTitulo, filters.rfmTitles));
	}

	// Getting the all time accumulted results grouped by client
	const allTimeAccumulatedResults = await db
		.select({
			clientId: clients.id,
			totalPurchases: sql<number>`sum(${sales.valorTotal})`,
			purchaseCount: sql<number>`count(${sales.id})`,
			lastPurchaseDate: sql<Date>`max(${sales.dataVenda})`,
		})
		.from(clients)
		.leftJoin(sales, and(eq(sales.clienteId, clients.id), eq(sales.organizacaoId, userOrgId)))
		.where(eq(clients.organizacaoId, userOrgId))
		.groupBy(clients.id);

	// Getting the accumulated results grouped by client for the period (if estabilished)
	const inPeriodAccumulatedResults =
		ajustedAfter && ajustedBefore
			? await db
					.select({
						clientId: clients.id,
						totalPurchases: sql<number>`sum(${sales.valorTotal})`,
						purchaseCount: sql<number>`count(${sales.id})`,
						lastPurchaseDate: sql<Date>`max(${sales.dataVenda})`,
					})
					.from(clients)
					.leftJoin(
						sales,
						and(
							eq(sales.clienteId, clients.id),
							eq(sales.organizacaoId, userOrgId),
							gte(sales.dataVenda, ajustedAfter),
							lte(sales.dataVenda, ajustedBefore),
						),
					)
					.where(eq(clients.organizacaoId, userOrgId))
					.groupBy(clients.id)
			: [];

	const allTimeAccumulatedResultsMap = new Map(
		allTimeAccumulatedResults.map((results) => [
			results.clientId,
			{
				totalPurchases: results.totalPurchases,
				purchaseCount: results.purchaseCount,
				lastPurchaseDate: results.lastPurchaseDate,
			},
		]),
	);

	const inPeriodAccumulatedResultsMap = new Map(
		inPeriodAccumulatedResults.map((results) => [
			results.clientId,
			{
				totalPurchases: results.totalPurchases,
				purchaseCount: results.purchaseCount,
				lastPurchaseDate: results.lastPurchaseDate,
			},
		]),
	);

	const clientsResult = await db.query.clients.findMany({
		where: and(...conditions),
	});

	// Faixa de valor gasto no período (ou na vida toda, sem período) — a mesma que filtra a listagem.
	const spentMin = filters.total.min ?? null;
	const spentMax = filters.total.max ?? null;
	const isPeriodFiltered = !!(filters.period.after && filters.period.before);
	const clientsInSpentRange =
		spentMin == null && spentMax == null
			? clientsResult
			: clientsResult.filter((client) => {
					const results = isPeriodFiltered ? inPeriodAccumulatedResultsMap.get(client.id) : allTimeAccumulatedResultsMap.get(client.id);
					const spent = Number(results?.totalPurchases ?? 0);
					return (spentMin == null || spent >= spentMin) && (spentMax == null || spent <= spentMax);
				});

	return clientsInSpentRange.map((client) => {
		const isPeriodDefined = filters.period.after && filters.period.before;
		const allTimeAccumulatedClientResults = allTimeAccumulatedResultsMap.get(client.id);
		const inPeriodAccumulatedClientResults = isPeriodDefined ? inPeriodAccumulatedResultsMap.get(client.id) : allTimeAccumulatedClientResults;

		// Getting RFM analysis for the defined period
		let rfmTitle = client.analiseRFMTitulo;
		let rfmRecencyScore = client.analiseRFMNotasRecencia;
		let rfmFrequencyScore = client.analiseRFMNotasFrequencia;
		let rfmMonetaryScore = client.analiseRFMNotasMonetario;
		if (isPeriodDefined) {
			const calculatedRecency = inPeriodAccumulatedClientResults?.lastPurchaseDate
				? dayjs().diff(dayjs(inPeriodAccumulatedClientResults.lastPurchaseDate), "days")
				: Number.POSITIVE_INFINITY;
			const calculatedFrequency = inPeriodAccumulatedClientResults?.purchaseCount || 0;
			const calculatedMonetary = inPeriodAccumulatedClientResults?.totalPurchases || 0;

			const configRecency = rfmConfig
				? Object.entries(rfmConfig.recencia).find(([key, value]) => calculatedRecency && calculatedRecency >= value.min && calculatedRecency <= value.max)
				: null;
			rfmRecencyScore = configRecency ? configRecency[0] : "1";

			const configFrequency = rfmConfig
				? Object.entries(rfmConfig.frequencia).find(([key, value]) => calculatedFrequency >= value.min && calculatedFrequency <= value.max)
				: null;
			rfmFrequencyScore = configFrequency ? configFrequency[0] : "1";

			const configMonetary = rfmConfig
				? Object.entries(rfmConfig.monetario).find(([key, value]) => calculatedMonetary >= value.min && calculatedMonetary <= value.max)
				: null;
			rfmMonetaryScore = configMonetary ? configMonetary[0] : "1";

			rfmTitle = getRFMLabel({
				monetary: Number(rfmMonetaryScore),
				frequency: Number(rfmFrequencyScore),
				recency: Number(rfmRecencyScore),
			});
		}
		return {
			NOME: client.nome,
			TELEFONE: client.telefone,
			EMAIL: client.email,
			"CANAL DE AQUISIÇÃO": client.canalAquisicao,
			"DATA DA PRIMEIRA COMPRA": formatDateAsLocale(client.primeiraCompraData),
			"DATA DA ÚLTIMA COMPRA": formatDateAsLocale(client.ultimaCompraData),
			"RFM ATUAL - ÚLTIMA ATUALIZAÇÃO": formatDateAsLocale(client.analiseRFMUltimaAtualizacao),
			"RFM ATUAL - TÍTULO": client.analiseRFMTitulo,
			"RFM ATUAL - NOTA EM RECÊNCIA": client.analiseRFMNotasRecencia,
			"RFM ATUAL - NOTA EM FREQUÊNCIA": client.analiseRFMNotasFrequencia,
			"RFM ATUAL - NOTA EM MONETÁRIO": client.analiseRFMNotasMonetario,
			PERÍODO:
				filters.period.after && filters.period.before
					? `${formatDateAsLocale(filters.period.after)} - ${formatDateAsLocale(filters.period.before)}`
					: "TODO O PERÍODO",
			"NO PERÍODO - Nº DE COMPRAS": inPeriodAccumulatedClientResults?.purchaseCount || 0,
			"NO PERÍODO - TOTAL COMPRO NO PERÍODO": formatToMoney(inPeriodAccumulatedClientResults?.totalPurchases || 0),
			"NO PERÍODO - RFM - TÍTULO": rfmTitle,
			"NO PERÍODO - RFM - NOTA EM RECÊNCIA": rfmRecencyScore,
			"NO PERÍODO - RFM - NOTA EM FREQUÊNCIA": rfmFrequencyScore,
			"NO PERÍODO - RFM - NOTA EM MONETÁRIO": rfmMonetaryScore,
			"TODO O PERÍODO - Nº DE COMPRAS": allTimeAccumulatedClientResults?.purchaseCount || 0,
			"TODO O PERÍODO - TOTAL COMPRO": formatToMoney(allTimeAccumulatedClientResults?.totalPurchases || 0),
		};
	});
}

export type TGetClientsExportationOutput = Awaited<ReturnType<typeof fetchClientExportation>>;

const handleClientsExportation: PagesRouteHandler<{
	data: TGetClientsExportationOutput;
}> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const data = await fetchClientExportation(req, userOrgId);

	return res.status(200).json({ data });
};
const routeHandlers = {
	POST: handleClientsExportation,
	GET: handleClientsExportation,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});
export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET!, bodyFromSearchParam: "payload" }),
});
