import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getProductMovementSummaries, getStockDeltasByDay, getStockPositions, naiveUtc } from "@/lib/stock/analytics/queries";
import { getSessionOrganizationId, parsePeriodSearchParams, StockReportPeriodInputSchema } from "@/lib/stock/analytics/route-helpers";
import { db } from "@/services/drizzle";
import { productStockLots } from "@/services/drizzle/schema";
import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

const GetStockReportSummaryInputSchema = StockReportPeriodInputSchema;
export type TGetStockReportSummaryInput = z.infer<typeof GetStockReportSummaryInputSchema>;

/**
 * Resumo do estoque hoje e no início do período. Unidades, valor e produtos zerados no início são
 * reconstruídos desfazendo as movimentações do período. Lotes vencendo não têm histórico
 * reconstruível (o saldo do lote não é versionado), então a comparação volta `null`.
 */
async function getStockReportSummary({ input, organizationId }: { input: TGetStockReportSummaryInput; organizationId: string }) {
	const now = new Date();
	const in7Days = new Date(now.getTime() + 7 * 86_400_000);
	const [positions, movement, deltasByDay, expiringLots] = await Promise.all([
		getStockPositions({ organizationId }),
		getProductMovementSummaries({ organizationId, after: input.periodAfter, before: now }),
		getStockDeltasByDay({ organizationId, after: input.periodAfter, before: now }),
		db.execute<{ total: number }>(sql`
			select count(*)::int as "total"
			from ${productStockLots} l
			where l.organizacao_id = ${organizationId}
				and l.status = 'ATIVO'
				and l.quantidade_atual > 0
				and l.data_validade >= ${naiveUtc(now)}
				and l.data_validade < ${naiveUtc(in7Days)}
		`),
	]);

	let unitsNow = 0;
	let unitsBefore = 0;
	let valueNow = 0;
	let zeroNow = 0;
	let zeroBefore = 0;
	let withBalance = 0;
	for (const position of positions) {
		const balanceBefore = position.saldo - (movement.byProductId.get(position.produtoId)?.variacao ?? 0);
		unitsNow += Math.max(0, position.saldo);
		unitsBefore += Math.max(0, balanceBefore);
		valueNow += position.valor;
		if (position.saldo <= 0) zeroNow += 1;
		else withBalance += 1;
		if (balanceBefore <= 0) zeroBefore += 1;
	}
	let valueDelta = 0;
	for (const delta of deltasByDay.values()) valueDelta += delta.valor;

	return {
		data: {
			emEstoque: { atual: unitsNow, anterior: unitsBefore },
			valorImobilizado: { atual: valueNow, anterior: valueNow - valueDelta },
			semEstoque: { atual: zeroNow, anterior: zeroBefore },
			lotesVencendo7Dias: { atual: expiringLots[0]?.total ?? 0, anterior: null as number | null },
			produtosComSaldo: withBalance,
			produtosRastreados: positions.length,
		},
		message: "Resumo do estoque obtido com sucesso.",
	};
}
export type TGetStockReportSummaryOutput = Awaited<ReturnType<typeof getStockReportSummary>>;

async function getStockReportSummaryRoute(request: NextRequest) {
	const organizationId = getSessionOrganizationId(await getCurrentSessionUncached());
	const input = GetStockReportSummaryInputSchema.parse(parsePeriodSearchParams(request.nextUrl.searchParams));
	const result = await getStockReportSummary({ input, organizationId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStockReportSummaryRoute });
