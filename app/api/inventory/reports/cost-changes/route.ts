import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getPurchaseEntries, type TPurchaseEntryRow } from "@/lib/stock/analytics/queries";
import { getSessionOrganizationId, parsePeriodSearchParams, StockReportPeriodInputSchema } from "@/lib/stock/analytics/route-helpers";
import { db } from "@/services/drizzle";
import { productVariants, products } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/** Compras anteriores à janela consideradas para achar a "compra anterior" e o histórico do sparkline. */
const HISTORY_DAYS = 365;
const HISTORY_POINTS = 5;

const GetStockReportCostChangesInputSchema = z
	.object({
		limit: z
			.string({ invalid_type_error: "Tipo inválido para limite." })
			.optional()
			.nullable()
			.transform((value) => (value ? Math.min(100, Math.max(1, Number(value) || 8)) : 8)),
	})
	.and(StockReportPeriodInputSchema);
export type TGetStockReportCostChangesInput = z.infer<typeof GetStockReportCostChangesInputSchema>;

/**
 * Maiores variações de custo entre a última compra (dentro do período) e a anterior, por item de
 * estoque (produto ou variante), com a margem ao preço de venda atual antes e depois.
 */
async function getStockReportCostChanges({ input, organizationId }: { input: TGetStockReportCostChangesInput; organizationId: string }) {
	const historyStart = new Date(Math.min(input.periodAfter.getTime(), input.periodBefore.getTime() - HISTORY_DAYS * 86_400_000));
	const entries = await getPurchaseEntries({ organizationId, after: historyStart, before: input.periodBefore });

	const byItem = new Map<string, TPurchaseEntryRow[]>();
	for (const entry of entries) {
		if (entry.custoUnitario == null) continue;
		const key = `${entry.produtoId}:${entry.produtoVarianteId ?? ""}`;
		const list = byItem.get(key) ?? [];
		list.push(entry);
		byItem.set(key, list);
	}

	const candidates = [...byItem.values()]
		.filter((list) => list.length >= 2 && list[list.length - 1].data >= input.periodAfter.getTime())
		.map((list) => {
			const last = list[list.length - 1];
			const previous = list[list.length - 2];
			return { last, previous, historico: list.slice(-HISTORY_POINTS).map((entry) => entry.custoUnitario as number) };
		})
		.filter(({ previous }) => (previous.custoUnitario ?? 0) > 0)
		.map((candidate) => ({
			...candidate,
			variacao: ((candidate.last.custoUnitario as number) - (candidate.previous.custoUnitario as number)) / (candidate.previous.custoUnitario as number),
		}))
		.filter((candidate) => candidate.variacao !== 0)
		.sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao))
		.slice(0, input.limit);

	const productIds = [...new Set(candidates.map((candidate) => candidate.last.produtoId))];
	const variantIds = candidates.map((candidate) => candidate.last.produtoVarianteId).filter((id): id is string => !!id);
	const [productPrices, variantPrices] = await Promise.all([
		productIds.length
			? db
					.select({ id: products.id, precoVenda: products.precoVenda })
					.from(products)
					.where(and(eq(products.organizacaoId, organizationId), inArray(products.id, productIds)))
			: [],
		variantIds.length
			? db
					.select({ id: productVariants.id, precoVenda: productVariants.precoVenda })
					.from(productVariants)
					.where(and(eq(productVariants.organizacaoId, organizationId), inArray(productVariants.id, variantIds)))
			: [],
	]);
	const priceOf = new Map<string, number | null>([...productPrices, ...variantPrices].map((row) => [row.id, row.precoVenda]));
	const marginAt = (price: number | null | undefined, cost: number) => (price && price > 0 ? (price - cost) / price : null);

	return {
		data: {
			itens: candidates.map(({ last, previous, historico, variacao }) => {
				const precoVenda = priceOf.get(last.produtoVarianteId ?? last.produtoId) ?? null;
				const margemAtual = marginAt(precoVenda, last.custoUnitario as number);
				const margemAnterior = marginAt(precoVenda, previous.custoUnitario as number);
				return {
					produtoId: last.produtoId,
					produtoVarianteId: last.produtoVarianteId,
					nome: last.varianteNome ? `${last.produtoNome} · ${last.varianteNome}` : last.produtoNome,
					fornecedor: last.fornecedor,
					data: last.data,
					custoAnterior: previous.custoUnitario as number,
					custoUltimo: last.custoUnitario as number,
					historico,
					variacao,
					precoVenda,
					margemAtual,
					margemVariacao: margemAtual != null && margemAnterior != null ? margemAtual - margemAnterior : null,
				};
			}),
		},
		message: "Variações de custo obtidas com sucesso.",
	};
}
export type TGetStockReportCostChangesOutput = Awaited<ReturnType<typeof getStockReportCostChanges>>;

async function getStockReportCostChangesRoute(request: NextRequest) {
	const organizationId = getSessionOrganizationId(await getCurrentSessionUncached());
	const searchParams = request.nextUrl.searchParams;
	const input = GetStockReportCostChangesInputSchema.parse({ limit: searchParams.get("limit"), ...parsePeriodSearchParams(searchParams) });
	const result = await getStockReportCostChanges({ input, organizationId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStockReportCostChangesRoute });
