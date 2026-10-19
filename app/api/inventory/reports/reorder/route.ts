import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getProductStockIndicators } from "@/lib/stock/analytics/product-indicators";
import { getSessionOrganizationId, parsePeriodSearchParams, StockReportPeriodInputSchema } from "@/lib/stock/analytics/route-helpers";
import { type NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

const GetStockReportReorderInputSchema = StockReportPeriodInputSchema;
export type TGetStockReportReorderInput = z.infer<typeof GetStockReportReorderInputSchema>;

/**
 * Produtos no ou abaixo do ponto de pedido, do mais crítico (saldo ÷ ponto de pedido menor) para o
 * menos, com a compra sugerida valorizada ao custo médio atual.
 */
async function getStockReportReorder({ input, organizationId }: { input: TGetStockReportReorderInput; organizationId: string }) {
	const indicators = await getProductStockIndicators({ organizationId, after: input.periodAfter, before: input.periodBefore });
	const itens = indicators
		.filter((item) => item.abaixoPontoPedido)
		.sort((a, b) => a.saldo / Math.max(1, a.pontoPedido) - b.saldo / Math.max(1, b.pontoPedido))
		.map((item) => ({
			produtoId: item.produtoId,
			nome: item.nome,
			codigo: item.codigo,
			grupo: item.grupo,
			unidade: item.unidade,
			saldo: item.saldo,
			estoqueSeguranca: item.estoqueSeguranca,
			pontoPedido: item.pontoPedido,
			coberturaDias: item.coberturaDias,
			prazoReposicaoDias: item.prazoReposicaoDias,
			prazoReposicaoOrigem: item.prazoReposicaoOrigem,
			sugestao: item.sugestao,
			valorSugerido: item.sugestao * item.custoUnitario,
		}));
	return {
		data: {
			total: { produtos: itens.length, valorSugerido: itens.reduce((sum, item) => sum + item.valorSugerido, 0) },
			itens,
		},
		message: "Produtos para reposição obtidos com sucesso.",
	};
}
export type TGetStockReportReorderOutput = Awaited<ReturnType<typeof getStockReportReorder>>;

async function getStockReportReorderRoute(request: NextRequest) {
	const organizationId = getSessionOrganizationId(await getCurrentSessionUncached());
	const input = GetStockReportReorderInputSchema.parse(parsePeriodSearchParams(request.nextUrl.searchParams));
	const result = await getStockReportReorder({ input, organizationId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStockReportReorderRoute });
