import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { localDayKey } from "@/lib/operation-timezone";
import { addDays, toLocalDayKey } from "@/lib/stock/analytics/periods";
import { getPurchaseEntries, naiveUtc } from "@/lib/stock/analytics/queries";
import { derivePriceHistory } from "@/lib/stock/analytics/price-history";
import { getSessionOrganizationId } from "@/lib/stock/analytics/route-helpers";
import { db } from "@/services/drizzle";
import { products, saleItems, sales } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const HISTORY_DAYS = 365;

const GetProductPriceCostHistoryInputSchema = z.object({
	productId: z
		.string({ required_error: "ID do produto não informado.", invalid_type_error: "Tipo inválido para ID do produto." })
		.min(1, { message: "ID do produto não informado." }),
});
export type TGetProductPriceCostHistoryInput = z.infer<typeof GetProductPriceCostHistoryInputSchema>;

/**
 * Custo, preço e margem do produto nos últimos 12 meses.
 *
 * - Custo: compras recebidas (ledger `ENTRADA_AQUISICAO`), custo unitário ponderado por compra.
 * - Preço: derivado das vendas (preço bruto mais frequente por dia, ver `derivePriceHistory`), já que
 *   o histórico de cadastro guarda só a alteração anterior. Considera as vendas do produto sem
 *   variante — variantes têm preço próprio.
 */
async function getProductPriceCostHistory({ input, organizationId }: { input: TGetProductPriceCostHistoryInput; organizationId: string }) {
	const now = new Date();
	const windowStart = addDays(now, -HISTORY_DAYS);
	const product = await db.query.products.findFirst({
		where: and(eq(products.id, input.productId), eq(products.organizacaoId, organizationId)),
		columns: { id: true, precoVenda: true, precoVendaAnterior: true, dataAlteracaoPrecoVenda: true, precoCusto: true },
	});
	if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

	const [entries, dailyPrices] = await Promise.all([
		getPurchaseEntries({ organizationId, productId: input.productId }),
		db.execute<{ dia: string; preco: number }>(sql`
			select
				${localDayKey(sql`s.data_venda`)} as "dia",
				(mode() within group (order by si.valor_unitario))::float8 as "preco"
			from ${saleItems} si
			join ${sales} s on s.id = si.venda_id
			where s.organizacao_id = ${organizationId}
				and s.status_venda = 'CONFIRMADA'
				and si.produto_id = ${input.productId}
				and si.produto_variante_id is null
				and si.valor_unitario > 0
				and s.data_venda >= ${naiveUtc(windowStart)}
				and s.data_venda <= ${naiveUtc(now)}
			group by 1
			order by 1
		`),
	]);

	// Uma compra pode ter mais de uma linha (variantes): custo ponderado por compra.
	const byPurchase = new Map<
		string,
		{ compraId: string; data: number; dia: string; quantidade: number; custoTotal: number; documento: string; fornecedor: string | null }
	>();
	for (const entry of entries) {
		if (entry.custoUnitario == null) continue;
		const purchase = byPurchase.get(entry.compraId) ?? {
			compraId: entry.compraId,
			data: entry.data,
			dia: entry.dia,
			quantidade: 0,
			custoTotal: 0,
			documento: entry.compraTitulo,
			fornecedor: entry.fornecedor,
		};
		purchase.quantidade += entry.quantidade;
		purchase.custoTotal += entry.quantidade * entry.custoUnitario;
		purchase.data = Math.min(purchase.data, entry.data);
		byPurchase.set(entry.compraId, purchase);
	}
	const allPurchases = [...byPurchase.values()]
		.filter((purchase) => purchase.quantidade > 0)
		.sort((a, b) => a.data - b.data)
		.map((purchase) => ({ ...purchase, custoUnitario: purchase.custoTotal / purchase.quantidade }));
	const windowPurchases = allPurchases.filter((purchase) => purchase.data >= windowStart.getTime());
	const lastBeforeWindow = allPurchases.filter((purchase) => purchase.data < windowStart.getTime()).pop() ?? null;

	const compras = windowPurchases.map((purchase, index) => ({
		compraId: purchase.compraId,
		data: purchase.data,
		dia: purchase.dia,
		quantidade: purchase.quantidade,
		custoUnitario: purchase.custoUnitario,
		documento: purchase.documento,
		fornecedor: purchase.fornecedor,
		custoAnterior: index > 0 ? windowPurchases[index - 1].custoUnitario : (lastBeforeWindow?.custoUnitario ?? null),
	}));

	const currentPrice = product.precoVenda ?? 0;
	const knownChange =
		product.dataAlteracaoPrecoVenda && product.precoVendaAnterior != null && product.precoVendaAnterior !== product.precoVenda
			? { dia: toLocalDayKey(product.dataAlteracaoPrecoVenda), de: product.precoVendaAnterior, para: currentPrice }
			: null;
	const prices = derivePriceHistory({ dailyPrices, currentPrice, knownChange, windowStart: toLocalDayKey(windowStart) });

	const custoInicio = lastBeforeWindow?.custoUnitario ?? compras[0]?.custoUnitario ?? product.precoCusto ?? null;
	const custoAtual = compras[compras.length - 1]?.custoUnitario ?? custoInicio;
	const marginAt = (price: number, cost: number | null) => (price > 0 && cost != null ? (price - cost) / price : null);
	const windowQuantity = compras.reduce((sum, purchase) => sum + purchase.quantidade, 0);

	return {
		data: {
			inicio: windowStart.getTime(),
			fim: now.getTime(),
			compras,
			precos: prices.alteracoes,
			resumo: {
				custoInicio,
				custoAtual,
				precoInicio: prices.precoInicio,
				precoAtual: currentPrice,
				margemInicio: marginAt(prices.precoInicio, custoInicio),
				margemAtual: marginAt(currentPrice, custoAtual),
				custoMedioPonderado:
					windowQuantity > 0 ? compras.reduce((sum, purchase) => sum + purchase.quantidade * purchase.custoUnitario, 0) / windowQuantity : null,
				quantidadeCompras: compras.length,
			},
		},
		message: "Histórico de custo e preço obtido com sucesso.",
	};
}
export type TGetProductPriceCostHistoryOutput = Awaited<ReturnType<typeof getProductPriceCostHistory>>;

async function getProductPriceCostHistoryRoute(request: NextRequest) {
	const organizationId = getSessionOrganizationId(await getCurrentSessionUncached());
	const input = GetProductPriceCostHistoryInputSchema.parse({ productId: request.nextUrl.searchParams.get("productId") });
	const result = await getProductPriceCostHistory({ input, organizationId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getProductPriceCostHistoryRoute });
