import { canViewCosts } from "@/lib/permissions/sensitive-data";
import { redactCatalogCosts } from "@/lib/products/cost-visibility";
import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { z } from "zod";

const GetProductsByCodesInputSchema = z.object({
	codes: z
		.string({
			required_error: "Código do produto não informado.",
			invalid_type_error: "Tipo não válido para o código do produto.",
		})
		.transform((val) => val.split(",")),
});
export type TGetProductsByCodesInput = z.infer<typeof GetProductsByCodesInputSchema>;

async function getProductsByCodes({ input, session }: { input: TGetProductsByCodesInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (input.codes.length === 0) throw new createHttpError.BadRequest("Pelo menos um código de produto deve ser informado.");

	const products = await db.query.products.findMany({
		where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, userOrgId), inArray(fields.codigo, input.codes)),
	});

	return {
		data: redactCatalogCosts(products, canViewCosts(session.membership?.permissoes)),
		message: "Produtos encontrados com sucesso.",
	};
}
export type TGetProductsByCodesOutput = Awaited<ReturnType<typeof getProductsByCodes>>;

const getProductsByCodesHandler: PagesRouteHandler<TGetProductsByCodesOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = GetProductsByCodesInputSchema.parse(req.query);
	const data = await getProductsByCodes({ input, session: sessionUser });
	return res.status(200).json(data);
};

const routeHandlers = {
	GET: getProductsByCodesHandler,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
