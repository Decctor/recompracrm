import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { count } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";

const GetProductsBySearchInputSchema = z.object({
	search: z.string({
		required_error: "Busca não informada.",
		invalid_type_error: "Tipo inválido para busca.",
	}),
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

	if (input.search.length > 0) {
		// Insensível a acentos via unaccent() em ambos os lados (requer extensão `unaccent`, migration 0033).
		conditions.push(
			sql`(unaccent(${products.nome}) ILIKE unaccent('%' || ${input.search} || '%') OR unaccent(${products.codigo}) ILIKE unaccent('%' || ${input.search} || '%'))`,
		);
	}
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
		orderBy: (fields, { desc }) => desc(fields.nome),
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

const getProductsBySearchHandler: PagesRouteHandler<TGetProductsBySearchOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const input = GetProductsBySearchInputSchema.parse(req.query);
	const data = await getProductsBySearch({ input, userOrgId });
	return res.status(200).json(data);
};

const routeHandlers = {
	GET: getProductsBySearchHandler,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
