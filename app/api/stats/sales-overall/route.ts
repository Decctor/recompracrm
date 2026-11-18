import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertSellersIdsWithinResultsScope } from "@/lib/permissions/results-scope";
import { canViewCosts } from "@/lib/permissions/sensitive-data";
import { getOverallSaleGoal, getOverallStats, type TOverallSalesStats } from "@/lib/sales/overall-stats";
import { SalesOverallStatsFiltersSchema } from "@/schemas/query-params-utils";
import createHttpError from "http-errors";

// As agregações vivem em `lib/sales/overall-stats` (compartilhadas com o agente de IA); o tipo
// segue re-exportado daqui porque os consumidores de client importam do route, por convenção.
export type { TOverallSalesStats };

type GetResponse = {
	data: TOverallSalesStats;
};
const getSalesOverallStatsRoute: PagesRouteHandler<GetResponse> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgMembership = sessionUser.membership;
	const userOrgId = userOrgMembership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { comparisonPeriod, ...filters } = SalesOverallStatsFiltersSchema.parse(req.body);

	await assertSellersIdsWithinResultsScope({
		organizacaoId: userOrgId,
		resultsScope: userOrgMembership.permissoes.resultados.escopo,
		sellersIds: filters.sellersIds,
	});
	console.log("[INFO] [GET_SALES_OVERALL_STATS] Filters payload: ", filters);

	const overallSaleGoal = await getOverallSaleGoal({
		after: filters.period.after,
		before: filters.period.before,
		organizacaoId: userOrgId,
	});

	const stats = await getOverallStats(
		filters,
		userOrgId,
		comparisonPeriod ? { after: new Date(comparisonPeriod.after), before: new Date(comparisonPeriod.before) } : null,
	);
	const overallStats: TOverallSalesStats = {
		periodoComparacao: stats.periodoComparacao,
		faturamentoMetaPorcentagem: (stats.faturamento.atual / overallSaleGoal) * 100,
		faturamento: stats.faturamento,
		// Margem é faturamento − custo: quem não vê custo não recebe o número (o bloco já não a exibe).
		margemBruta: canViewCosts(userOrgMembership.permissoes) ? stats.margemBruta : { atual: 0, anterior: undefined },
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

const routeHandlers = {
	POST: getSalesOverallStatsRoute,
	GET: getSalesOverallStatsRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});
export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET!, bodyFromSearchParam: "payload" }),
});
