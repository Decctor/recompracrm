import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getProductStockIndicators } from "@/lib/stock/analytics/product-indicators";
import { getSessionOrganizationId, parsePeriodSearchParams, StockReportPeriodInputSchema } from "@/lib/stock/analytics/route-helpers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetStockReportCoverageInputSchema = z
	.object({
		limit: z
			.string({ invalid_type_error: "Tipo inválido para limite." })
			.optional()
			.nullable()
			.transform((value) => (value ? Math.min(200, Math.max(1, Number(value) || 10)) : 10)),
	})
	.and(StockReportPeriodInputSchema);
export type TGetStockReportCoverageInput = z.infer<typeof GetStockReportCoverageInputSchema>;

/**
 * Giro e cobertura por produto, do que acaba primeiro para o que dura mais. Produtos sem consumo
 * (cobertura indefinida) vêm por último, e os sem saldo e sem consumo ficam de fora.
 */
async function getStockReportCoverage({ input, organizationId }: { input: TGetStockReportCoverageInput; organizationId: string }) {
	const indicators = await getProductStockIndicators({ organizationId, after: input.periodAfter, before: input.periodBefore });
	const relevant = indicators
		.filter((item) => item.saldo > 0 || item.consumoMedioDia > 0)
		.sort((a, b) => {
			if (a.coberturaDias == null && b.coberturaDias == null) return b.saldo - a.saldo;
			if (a.coberturaDias == null) return 1;
			if (b.coberturaDias == null) return -1;
			return a.coberturaDias - b.coberturaDias;
		});
	return {
		data: {
			total: relevant.length,
			itens: relevant.slice(0, input.limit).map((item) => ({
				produtoId: item.produtoId,
				nome: item.nome,
				codigo: item.codigo,
				grupo: item.grupo,
				unidade: item.unidade,
				classe: item.classe,
				consumoMedioDia: item.consumoMedioDia,
				saldo: item.saldo,
				coberturaDias: item.coberturaDias,
				giro: item.giro,
				prazoReposicaoDias: item.prazoReposicaoDias,
			})),
		},
		message: "Giro e cobertura obtidos com sucesso.",
	};
}
export type TGetStockReportCoverageOutput = Awaited<ReturnType<typeof getStockReportCoverage>>;

async function getStockReportCoverageRoute(request: NextRequest) {
	const organizationId = getSessionOrganizationId(await getCurrentSessionUncached());
	const searchParams = request.nextUrl.searchParams;
	const input = GetStockReportCoverageInputSchema.parse({ limit: searchParams.get("limit"), ...parsePeriodSearchParams(searchParams) });
	const result = await getStockReportCoverage({ input, organizationId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStockReportCoverageRoute });
