import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getExpiringLots } from "@/lib/stock/analytics/queries";
import { getSessionOrganizationId } from "@/lib/stock/analytics/route-helpers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const HORIZON_DAYS = 60;
/** A lista destaca o que pede ação: vencidos e o que vence em até 30 dias. */
const LIST_HORIZON_DAYS = 30;
const EXPIRATION_BUCKETS = [
	{ faixa: "VENCIDOS", rotulo: "Vencidos", min: Number.NEGATIVE_INFINITY, max: 0 },
	{ faixa: "ATE_7", rotulo: "Até 7 dias", min: 0, max: 7 },
	{ faixa: "DE_8_A_30", rotulo: "8 a 30 dias", min: 7, max: 30 },
	{ faixa: "DE_31_A_60", rotulo: "31 a 60 dias", min: 30, max: 60 },
] as const;

const GetStockReportExpirationsInputSchema = z.object({
	limit: z
		.string({ invalid_type_error: "Tipo inválido para limite." })
		.optional()
		.nullable()
		.transform((value) => (value ? Math.min(200, Math.max(1, Number(value) || 12)) : 12)),
});
export type TGetStockReportExpirationsInput = z.infer<typeof GetStockReportExpirationsInputSchema>;

/**
 * Lotes ativos com saldo por prazo até a validade, com o valor em risco ao custo do lote. Retrato de
 * hoje: não depende do período. `diasAteValidade` segue a mesma conta da Visão geral (teto da
 * diferença em dias), então "vencido" é `<= 0`.
 */
async function getStockReportExpirations({ input, organizationId }: { input: TGetStockReportExpirationsInput; organizationId: string }) {
	const now = Date.now();
	const lots = await getExpiringLots({ organizationId, until: new Date(now + HORIZON_DAYS * 86_400_000) });
	const enriched = lots.map((lot) => ({
		...lot,
		valor: lot.quantidadeAtual * lot.custoUnitario,
		diasAteValidade: Math.ceil((lot.dataValidade - now) / 86_400_000),
	}));

	return {
		data: {
			faixas: EXPIRATION_BUCKETS.map((bucket) => {
				const items = enriched.filter((lot) => lot.diasAteValidade > bucket.min && lot.diasAteValidade <= bucket.max);
				return { faixa: bucket.faixa, rotulo: bucket.rotulo, lotes: items.length, valor: items.reduce((sum, lot) => sum + lot.valor, 0) };
			}),
			lotes: enriched.filter((lot) => lot.diasAteValidade <= LIST_HORIZON_DAYS).slice(0, input.limit),
		},
		message: "Vencimentos de lotes obtidos com sucesso.",
	};
}
export type TGetStockReportExpirationsOutput = Awaited<ReturnType<typeof getStockReportExpirations>>;

async function getStockReportExpirationsRoute(request: NextRequest) {
	const organizationId = getSessionOrganizationId(await getCurrentSessionUncached());
	const input = GetStockReportExpirationsInputSchema.parse({ limit: request.nextUrl.searchParams.get("limit") });
	const result = await getStockReportExpirations({ input, organizationId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStockReportExpirationsRoute });
