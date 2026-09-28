import { buildProductSearch, withProductSearch, type ProductSearchDatabase } from "@/lib/products/search";
import { ProductSearchQuerySchema } from "@/schemas/product-search";
import { NextResponse, type NextRequest } from "next/server";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { count } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";

const GetProductsBySearchInputSchema = z.object({
	search: ProductSearchQuerySchema,
	page: z
		.string({
			required_error: "Página não informada.",
			invalid_type_error: "Tipo inválido para página.",
		})
		.transform((val) => Number(val)),
	// Hidratação de listas que persistem apenas IDs (ex.: produtos de uma campanha de promoção):
	// quando informado, a busca textual e a paginação são ignoradas e só os IDs pedidos retornam.
	ids: z
		.string({ invalid_type_error: "Tipo inválido para IDs." })
		.transform((val) => val.split(",").filter(Boolean))
		.optional(),
});
export type TGetProductsBySearchInput = z.infer<typeof GetProductsBySearchInputSchema>;

async function getProductsBySearch({ input, userOrgId }: { input: TGetProductsBySearchInput; userOrgId: string }) {
	return withProductSearch(db, input.ids?.length ? [] : input.search, (database) => queryProducts({ input, userOrgId }, database));
}

async function queryProducts({ input, userOrgId }: { input: TGetProductsBySearchInput; userOrgId: string }, db: ProductSearchDatabase) {
	const PAGE_SIZE = 25;

	const skip = PAGE_SIZE * (input.page - 1);
	const limit = PAGE_SIZE;

	const conditions = [eq(products.organizacaoId, userOrgId)];

	// Modo hidratação por IDs: retorna exatamente os produtos pedidos, sem paginar.
	const requestedIds = input.ids ?? [];
	if (requestedIds.length > 0) {
		const productsByIdsResult = await db.query.products.findMany({
			where: and(eq(products.organizacaoId, userOrgId), inArray(products.id, requestedIds)),
			with: {
				variantes: {
					where: (variant, { eq }) => eq(variant.ativo, true),
				},
			},
		});

		return {
			data: {
				products: productsByIdsResult,
				productsMatched: productsByIdsResult.length,
				totalPages: 1,
			},
		};
	}

	const search = buildProductSearch(input.search, products);
	if (search.condition) conditions.push(search.condition);
	const productsMatched = await db
		.select({ count: count(products.id) })
		.from(products)
		.where(and(...conditions));

	const productsMatchedCount = productsMatched[0]?.count || 0;

	const totalPages = Math.ceil(productsMatchedCount / PAGE_SIZE);
	const productsResult = await db.query.products.findMany({
		where: and(...conditions),
		with: {
			variantes: {
				where: (variant, { eq }) => eq(variant.ativo, true),
			},
		},
		offset: skip,
		limit: limit,
		orderBy: [...(input.search.length ? [desc(search.relevance), asc(products.nome)] : [desc(products.nome)]), asc(products.id)],
	});

	return {
		data: {
			products: productsResult,
			productsMatched: productsMatchedCount,
			totalPages: totalPages,
		},
	};
}
export type TGetProductsBySearchOutput = Awaited<ReturnType<typeof getProductsBySearch>>;

async function getProductsBySearchRoute(request: NextRequest) {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const input = GetProductsBySearchInputSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
	const data = await getProductsBySearch({ input, userOrgId });
	return NextResponse.json(data);
}

export const GET = appApiHandler({ GET: getProductsBySearchRoute });
