import { apiHandler } from "@/lib/api";
import { getCurrentSessionUncached } from "@/lib/authentication/pages-session";
import { db } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { count } from "drizzle-orm";
import createHttpError from "http-errors";
import type { NextApiHandler } from "next";
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
});
export type TGetProductsBySearchInput = z.infer<typeof GetProductsBySearchInputSchema>;

async function getProductsBySearch({ input, userOrgId }: { input: TGetProductsBySearchInput; userOrgId: string }) {
	const PAGE_SIZE = 25;

	const skip = PAGE_SIZE * (input.page - 1);
	const limit = PAGE_SIZE;

	const conditions = [eq(products.organizacaoId, userOrgId)];

	if (input.search.length > 0) {
		conditions.push(sql`(${products.descricao} ILIKE '%' || ${input.search} || '%' OR ${products.codigo} ILIKE '%' || ${input.search} || '%')`);
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
		orderBy: (fields, { desc }) => desc(fields.descricao),
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

const getProductsBySearchHandler: NextApiHandler<TGetProductsBySearchOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached(req.cookies);
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const input = GetProductsBySearchInputSchema.parse(req.query);
	const data = await getProductsBySearch({ input, userOrgId });
	return res.status(200).json(data);
};

export default apiHandler({
	GET: getProductsBySearchHandler,
});
