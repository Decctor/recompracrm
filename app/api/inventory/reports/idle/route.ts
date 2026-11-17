import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getLastOutflowByProduct, getStockPositions } from "@/lib/stock/analytics/queries";
import { maskCost } from "@/lib/permissions/sensitive-data";
import { getInventoryReportAccess } from "@/lib/stock/analytics/route-helpers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/** Sem saída há mais que isto, em dias, o saldo está parado. */
const IDLE_THRESHOLD_DAYS = 30;
const IDLE_BUCKETS = [
	{ faixa: "DE_30_A_60", rotulo: "30 a 60 dias", min: 30, max: 60 },
	{ faixa: "DE_60_A_90", rotulo: "60 a 90 dias", min: 60, max: 90 },
	{ faixa: "ACIMA_DE_90", rotulo: "Mais de 90 dias", min: 90, max: Number.POSITIVE_INFINITY },
] as const;

const GetStockReportIdleInputSchema = z.object({
	limit: z
		.string({ invalid_type_error: "Tipo inválido para limite." })
		.optional()
		.nullable()
		.transform((value) => (value ? Math.min(200, Math.max(1, Number(value) || 10)) : 10)),
});
export type TGetStockReportIdleInput = z.infer<typeof GetStockReportIdleInputSchema>;

/**
 * Estoque parado: produtos com saldo e sem saída de consumo há mais de 30 dias. Produto que nunca
 * teve saída conta desde o cadastro. É um retrato de hoje, não depende do período. Valores ao custo
 * (capital parado, participação no imobilizado, valor por faixa e por item) voltam `null` para quem
 * não vê custos.
 */
async function getStockReportIdle({ input, organizationId, canViewCosts }: { input: TGetStockReportIdleInput; organizationId: string; canViewCosts: boolean }) {
	const now = Date.now();
	const [positions, lastOutflows] = await Promise.all([getStockPositions({ organizationId }), getLastOutflowByProduct({ organizationId })]);
	const totalValue = positions.reduce((sum, position) => sum + position.valor, 0);

	const idle = positions
		.filter((position) => position.saldo > 0)
		.map((position) => {
			const ultimaSaida = lastOutflows.get(position.produtoId) ?? null;
			const diasSemSaida = Math.floor((now - (ultimaSaida ?? position.dataInsercao)) / 86_400_000);
			return {
				produtoId: position.produtoId,
				nome: position.nome,
				codigo: position.codigo,
				unidade: position.unidade,
				saldo: position.saldo,
				valor: position.valor,
				ultimaSaida,
				diasSemSaida,
			};
		})
		.filter((item) => item.diasSemSaida > IDLE_THRESHOLD_DAYS)
		.sort((a, b) => b.valor - a.valor);

	const capitalParado = idle.reduce((sum, item) => sum + item.valor, 0);
	return {
		data: {
			capitalParado: maskCost(capitalParado, canViewCosts),
			produtos: idle.length,
			percentualImobilizado: maskCost(totalValue > 0 ? capitalParado / totalValue : 0, canViewCosts),
			faixas: IDLE_BUCKETS.map((bucket) => {
				const items = idle.filter((item) => item.diasSemSaida > bucket.min && item.diasSemSaida <= bucket.max);
				return {
					faixa: bucket.faixa,
					rotulo: bucket.rotulo,
					produtos: items.length,
					valor: maskCost(
						items.reduce((sum, item) => sum + item.valor, 0),
						canViewCosts,
					),
				};
			}),
			itens: idle.slice(0, input.limit).map((item) => ({ ...item, valor: maskCost(item.valor, canViewCosts) })),
		},
		message: "Estoque parado obtido com sucesso.",
	};
}
export type TGetStockReportIdleOutput = Awaited<ReturnType<typeof getStockReportIdle>>;

async function getStockReportIdleRoute(request: NextRequest) {
	const { organizationId, canViewCosts } = getInventoryReportAccess(await getCurrentSessionUncached());
	const input = GetStockReportIdleInputSchema.parse({ limit: request.nextUrl.searchParams.get("limit") });
	const result = await getStockReportIdle({ input, organizationId, canViewCosts });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStockReportIdleRoute });
