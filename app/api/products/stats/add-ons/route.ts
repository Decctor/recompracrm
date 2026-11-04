import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { productAddOnOptions, productAddOns, products, saleItemModifiers, saleItems, sales } from "@/services/drizzle/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Ranking dos adicionais vendidos — com ou sem produto vinculado. A maior parte da receita de
// adicionais vem de opções sem produto ("Nutella", "Borda recheada"), que nas estatísticas de
// produto ficam somadas ao produto do item (lib/products/product-sales-lines.ts). Aqui elas
// aparecem por conta própria.

const GetProductAddOnsRankingInputSchema = z.object({
	periodAfter: z
		.string({ invalid_type_error: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((v) => (v ? new Date(v) : null)),
	periodBefore: z
		.string({ invalid_type_error: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((v) => (v ? new Date(v) : null)),
	rankingBy: z
		.enum(["sales-total-value", "sales-total-qty"], { invalid_type_error: "Tipo inválido para ordenação do ranking." })
		.optional()
		.nullable()
		.transform((v) => v ?? "sales-total-value"),
});
export type TGetProductAddOnsRankingInput = z.input<typeof GetProductAddOnsRankingInputSchema>;

const RANKING_LIMIT = 10;

async function getProductAddOnsRanking({ input, session }: { input: z.infer<typeof GetProductAddOnsRankingInputSchema>; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	// Opção apagada (opcao_id null) ou não resolvida na importação: agrupa pelo nome gravado.
	const addOnKey = sql<string>`coalesce(${saleItemModifiers.opcaoId}, ${saleItemModifiers.nome})`;
	// Valor do adicional é por unidade do item; desconto do item repartido na proporção do bruto.
	const revenueExpr = sql`sum(least(${saleItems.quantidade} * ${saleItemModifiers.valorTotal}, greatest(${saleItems.valorVendaTotalBruto}, 0)) * (case when ${saleItems.valorVendaTotalBruto} > 0 then ${saleItems.valorVendaTotalLiquido} / ${saleItems.valorVendaTotalBruto} else 0 end))`;
	const quantityExpr = sql`sum(${saleItems.quantidade} * ${saleItemModifiers.quantidade})`;

	const rows = await db
		.select({
			chave: addOnKey,
			nome: sql<string>`max(coalesce(${productAddOnOptions.nome}, ${saleItemModifiers.nome}))`,
			grupo: sql<string | null>`max(${productAddOns.nome})`,
			produtoVinculadoNome: sql<string | null>`max(${products.nome})`,
			quantidade: sql<number>`${quantityExpr}`,
			faturamento: sql<number>`${revenueExpr}`,
		})
		.from(saleItemModifiers)
		.innerJoin(saleItems, eq(saleItems.id, saleItemModifiers.itemVendaId))
		.innerJoin(sales, eq(sales.id, saleItems.vendaId))
		.leftJoin(productAddOnOptions, eq(productAddOnOptions.id, saleItemModifiers.opcaoId))
		.leftJoin(productAddOns, eq(productAddOns.id, productAddOnOptions.produtoAddOnId))
		.leftJoin(products, eq(products.id, saleItemModifiers.produtoId))
		.where(
			and(
				eq(saleItems.organizacaoId, organizationId),
				eq(sales.organizacaoId, organizationId),
				eq(sales.statusVenda, "CONFIRMADA"),
				input.periodAfter ? gte(sales.dataVenda, input.periodAfter) : undefined,
				input.periodBefore ? lte(sales.dataVenda, input.periodBefore) : undefined,
			),
		)
		// Coluna crua no GROUP BY: a expressão sem parâmetros não sofre a renumeração de binds.
		.groupBy(sql`coalesce(${saleItemModifiers.opcaoId}, ${saleItemModifiers.nome})`)
		.orderBy(desc(input.rankingBy === "sales-total-qty" ? quantityExpr : revenueExpr))
		.limit(RANKING_LIMIT);

	const ranking = rows.map((row, index) => ({
		posicao: index + 1,
		chave: row.chave,
		nome: row.nome,
		grupo: row.grupo,
		produtoVinculadoNome: row.produtoVinculadoNome,
		quantidade: Number(row.quantidade ?? 0),
		faturamento: Number(row.faturamento ?? 0),
	}));

	return { data: ranking, message: "Ranking de adicionais obtido com sucesso." };
}
export type TGetProductAddOnsRankingOutput = Awaited<ReturnType<typeof getProductAddOnsRanking>>;

async function getProductAddOnsRankingRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetProductAddOnsRankingInputSchema.parse({
		periodAfter: searchParams.get("periodAfter"),
		periodBefore: searchParams.get("periodBefore"),
		rankingBy: searchParams.get("rankingBy"),
	});
	const result = await getProductAddOnsRanking({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getProductAddOnsRankingRoute });
