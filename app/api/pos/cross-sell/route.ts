import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { hydratePOSProducts } from "@/lib/pos/hydrate-pos-products";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { productClientReferences, productPairScores, saleItems, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, countDistinct, desc, eq, gte, inArray, isNotNull, notInArray, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { unstable_cache } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const SUGGESTIONS_LIMIT = 6;
const CANDIDATE_POOL = 20;
const PROFILE_WEIGHT = 0.6;
const BASKET_WEIGHT = 0.4;
// Mais vendidos da loja (fallback): a mesma agregação de 12 meses para toda requisição da org
// (~2,8 s na Congelatte), recalculada a cada cliente escolhido no PDV. Fica em cache por org; a
// lista guarda folga para tirar os produtos da cesta sem nova consulta.
const BEST_SELLERS_CACHE_SECONDS = 60 * 60;
const BEST_SELLERS_CACHED_POOL = 50;

function loadBestSellers(organizacaoId: string) {
	const twelveMonthsAgo = dayjs().subtract(12, "months").toDate();
	return db
		.select({ produtoId: saleItems.produtoId, score: sum(saleItems.quantidade) })
		.from(saleItems)
		.innerJoin(sales, eq(saleItems.vendaId, sales.id))
		.where(and(eq(saleItems.organizacaoId, organizacaoId), isNotNull(sales.dataVenda), gte(sales.dataVenda, twelveMonthsAgo)))
		.groupBy(saleItems.produtoId)
		.orderBy(desc(sum(saleItems.quantidade)))
		.limit(BEST_SELLERS_CACHED_POOL);
}

function getBestSellersCached(organizacaoId: string) {
	return unstable_cache(() => loadBestSellers(organizacaoId), ["pos-cross-sell-best-sellers", organizacaoId], {
		revalidate: BEST_SELLERS_CACHE_SECONDS,
	})();
}

const GetCrossSellInputSchema = z.object({
	clientId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo inválido para ID do cliente.",
	}),
	basketProductIds: z
		.string({ invalid_type_error: "Tipo inválido para produtos da cesta." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",").filter(Boolean) : [])),
});
export type TGetCrossSellInput = z.infer<typeof GetCrossSellInputSchema>;

type ScoreSource = "perfil" | "cesta";

function buildMotivo(sources: Set<ScoreSource>): string {
	const hasPerfil = sources.has("perfil");
	const hasCesta = sources.has("cesta");
	if (hasPerfil && hasCesta) return "Recorrente e combina com a cesta";
	if (hasPerfil) return "Compra recorrente do cliente";
	if (hasCesta) return "Combina com a cesta";
	return "Mais vendido da loja";
}

/**
 * Coprodutos da cesta. Lê os pares que o cron product-client-references grava toda noite
 * (productPairScores: top 30 por produto, vendas confirmadas dos últimos 365 dias) — uma busca por
 * índice no lugar do self-join de itens, que levava até 6,9 s por requisição no PDV.
 *
 * Organização ainda sem pares gravados (antes do primeiro cron após o deploy, ou recém-criada) cai
 * no cálculo ao vivo de antes.
 */
async function loadBasketCoOccurrence({ organizacaoId, basketIds }: { organizacaoId: string; basketIds: string[] }) {
	const stored = await db
		.select({ produtoId: productPairScores.produtoRelacionadoId, score: sum(productPairScores.coocorrencias) })
		.from(productPairScores)
		.where(
			and(
				eq(productPairScores.organizacaoId, organizacaoId),
				inArray(productPairScores.produtoId, basketIds),
				notInArray(productPairScores.produtoRelacionadoId, basketIds),
			),
		)
		.groupBy(productPairScores.produtoRelacionadoId)
		.orderBy(desc(sum(productPairScores.coocorrencias)))
		.limit(CANDIDATE_POOL);
	if (stored.length > 0) return stored;

	const organizationHasPairs = await db
		.select({ id: productPairScores.id })
		.from(productPairScores)
		.where(eq(productPairScores.organizacaoId, organizacaoId))
		.limit(1);
	if (organizationHasPairs.length > 0) return stored;

	return loadBasketCoOccurrenceLive({ organizacaoId, basketIds });
}

function loadBasketCoOccurrenceLive({ organizacaoId, basketIds }: { organizacaoId: string; basketIds: string[] }) {
	const twelveMonthsAgo = dayjs().subtract(12, "months").toDate();
	const basketSaleIds = db
		.selectDistinct({ vendaId: saleItems.vendaId })
		.from(saleItems)
		.innerJoin(sales, eq(saleItems.vendaId, sales.id))
		.where(
			and(
				eq(saleItems.organizacaoId, organizacaoId),
				inArray(saleItems.produtoId, basketIds),
				isNotNull(sales.dataVenda),
				gte(sales.dataVenda, twelveMonthsAgo),
			),
		);

	return db
		.select({ produtoId: saleItems.produtoId, score: countDistinct(saleItems.vendaId) })
		.from(saleItems)
		.where(and(eq(saleItems.organizacaoId, organizacaoId), inArray(saleItems.vendaId, basketSaleIds), notInArray(saleItems.produtoId, basketIds)))
		.groupBy(saleItems.produtoId)
		.orderBy(desc(countDistinct(saleItems.vendaId)))
		.limit(CANDIDATE_POOL);
}

async function getCrossSell({ input, session }: { input: TGetCrossSellInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const basketIds = input.basketProductIds;

	// Aggregated score per candidate product, plus which sources contributed (for the "why").
	const scoreMap = new Map<string, { score: number; sources: Set<ScoreSource> }>();
	const addScore = (produtoId: string, score: number, source: ScoreSource) => {
		if (!produtoId) return;
		const existing = scoreMap.get(produtoId) ?? { score: 0, sources: new Set<ScoreSource>() };
		existing.score += score;
		existing.sources.add(source);
		scoreMap.set(produtoId, existing);
	};

	// Source 1 — client profile: what this client buys (productClientReferences, GERAL window).
	const profileRaw = await db
		.select({ produtoId: productClientReferences.produtoId, valor: productClientReferences.totalComprasValor })
		.from(productClientReferences)
		.where(
			and(
				eq(productClientReferences.organizacaoId, organizacaoId),
				eq(productClientReferences.clienteId, input.clientId),
				eq(productClientReferences.janela, "GERAL"),
				basketIds.length > 0 ? notInArray(productClientReferences.produtoId, basketIds) : undefined,
			),
		)
		.orderBy(desc(productClientReferences.totalComprasValor))
		.limit(CANDIDATE_POOL);

	// Collapse multiple variant rows into a single product-level score.
	const profileByProduct = new Map<string, number>();
	for (const row of profileRaw) {
		profileByProduct.set(row.produtoId, (profileByProduct.get(row.produtoId) ?? 0) + Number(row.valor ?? 0));
	}
	const profileMax = Math.max(0, ...profileByProduct.values());
	if (profileMax > 0) {
		for (const [produtoId, valor] of profileByProduct) {
			addScore(produtoId, PROFILE_WEIGHT * (valor / profileMax), "perfil");
		}
	}

	// Source 2 — basket co-occurrence: "who bought these also bought" over the last 12 months.
	if (basketIds.length > 0) {
		const coOccurrenceRaw = await loadBasketCoOccurrence({ organizacaoId, basketIds });
		const basketMax = Math.max(0, ...coOccurrenceRaw.map((row) => Number(row.score ?? 0)));
		if (basketMax > 0) {
			for (const row of coOccurrenceRaw) {
				addScore(row.produtoId, BASKET_WEIGHT * (Number(row.score ?? 0) / basketMax), "cesta");
			}
		}
	}

	let origem: "PERSONALIZADO" | "MAIS_VENDIDOS" = "PERSONALIZADO";

	// Fallback — no personalized signal: best sellers of the store (last 12 months).
	if (scoreMap.size === 0) {
		origem = "MAIS_VENDIDOS";
		const basketIdSet = new Set(basketIds);
		const bestSellersRaw = (await getBestSellersCached(organizacaoId)).filter((row) => !basketIdSet.has(row.produtoId)).slice(0, SUGGESTIONS_LIMIT);
		for (const row of bestSellersRaw) addScore(row.produtoId, Number(row.score ?? 0), "perfil");
		// Reasons for fallback rows should read as store best sellers, not profile.
		for (const entry of scoreMap.values()) entry.sources = new Set();
	}

	const rankedIds = [...scoreMap.entries()]
		.sort((a, b) => b[1].score - a[1].score)
		.slice(0, SUGGESTIONS_LIMIT)
		.map(([produtoId]) => produtoId);

	if (rankedIds.length === 0) {
		return { data: { products: [], origem }, message: "Nenhuma sugestão disponível." };
	}

	// Mesma hidratação da grade do PDV (variantes/adicionais ativos, só produtos vendáveis),
	// para que a sugestão flua direto para os handlers de carrinho.
	const hydrated = await hydratePOSProducts({ orgId: organizacaoId, productIds: rankedIds });

	const rankIndex = new Map(rankedIds.map((id, index) => [id, index]));
	const suggestions = hydrated
		.map((product) => ({
			...product,
			crossSellMotivo: buildMotivo(scoreMap.get(product.id)?.sources ?? new Set()),
		}))
		.sort((a, b) => (rankIndex.get(a.id) ?? 0) - (rankIndex.get(b.id) ?? 0));

	return {
		data: { products: suggestions, origem },
		message: "Sugestões de cross-sell carregadas com sucesso.",
	};
}
export type TGetCrossSellOutput = Awaited<ReturnType<typeof getCrossSell>>;

async function getCrossSellRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const { searchParams } = new URL(request.url);
	const input = GetCrossSellInputSchema.parse({
		clientId: searchParams.get("clientId"),
		basketProductIds: searchParams.get("basketProductIds"),
	});
	const result = await getCrossSell({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({
	GET: getCrossSellRoute,
});
