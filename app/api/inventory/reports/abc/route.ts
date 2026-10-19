import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { summarizeAbc } from "@/lib/stock/analytics/abc";
import { getAbcRanking } from "@/lib/stock/analytics/queries";
import { getSessionOrganizationId, parsePeriodSearchParams, StockReportPeriodInputSchema } from "@/lib/stock/analytics/route-helpers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetStockReportAbcInputSchema = z
	.object({
		metric: z
			.string({ invalid_type_error: "Tipo inválido para métrica da curva ABC." })
			.optional()
			.nullable()
			.transform((value) => value || "FATURAMENTO")
			.pipe(z.enum(["FATURAMENTO", "VOLUME"], { invalid_type_error: "Métrica da curva ABC inválida." })),
	})
	.and(StockReportPeriodInputSchema);
export type TGetStockReportAbcInput = z.infer<typeof GetStockReportAbcInputSchema>;

/** Curva ABC dos produtos rastreados por faturamento ou por unidades vendidas no período. */
async function getStockReportAbc({ input, organizationId }: { input: TGetStockReportAbcInput; organizationId: string }) {
	const { ranked } = await getAbcRanking({ organizationId, after: input.periodAfter, before: input.periodBefore, metric: input.metric });
	return {
		data: {
			metrica: input.metric,
			total: ranked.reduce((sum, item) => sum + item.valor, 0),
			totalProdutos: ranked.length,
			classes: summarizeAbc(ranked),
			curva: ranked.map((item) => ({
				produtoId: item.produtoId,
				nome: item.nome,
				posicao: item.posicao,
				participacao: item.participacao,
				acumulado: item.acumulado,
				classe: item.classe,
			})),
		},
		message: "Curva ABC obtida com sucesso.",
	};
}
export type TGetStockReportAbcOutput = Awaited<ReturnType<typeof getStockReportAbc>>;

async function getStockReportAbcRoute(request: NextRequest) {
	const organizationId = getSessionOrganizationId(await getCurrentSessionUncached());
	const searchParams = request.nextUrl.searchParams;
	const input = GetStockReportAbcInputSchema.parse({ metric: searchParams.get("metric"), ...parsePeriodSearchParams(searchParams) });
	const result = await getStockReportAbc({ input, organizationId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStockReportAbcRoute });
