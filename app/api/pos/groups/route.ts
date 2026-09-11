import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { sortGroupsByChannelOrder } from "@/lib/products/sales-channels";
import { buildChannelCatalogConditions, loadChannelState } from "@/lib/products/sales-channels-store";
import { db } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
import { and } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";

const GetPOSGroupsInputSchema = z.object({
	// Mesmo canal da grade: a barra de categorias e os produtos precisam responder ao mesmo
	// conjunto, senão a categoria abre vazia.
	channel: z
		.string({
			invalid_type_error: "Tipo inválido para canal.",
		})
		.optional()
		.nullable()
		.transform((value) => (value === "COMANDA" ? ("COMANDA" as const) : ("POS" as const))),
});
export type TGetPOSGroupsInput = z.infer<typeof GetPOSGroupsInputSchema>;

/**
 * Os grupos que têm ao menos um produto vendável no canal — não o DISTINCT do cadastro inteiro.
 * Um grupo só de produtos inativos, não-vendáveis ou fora da vitrine do canal não deve virar botão:
 * clicar nele aplicaria `?group=X` numa grade que já descartou tudo daquele grupo.
 *
 * A lista não pode sair da página de produtos (a grade pagina de 24 em 24), então é um DISTINCT
 * próprio sob as MESMAS condições — a regra vive em `buildChannelCatalogConditions`.
 */
async function getPOSGroups({ input, userOrgId }: { input: TGetPOSGroupsInput; userOrgId: string }) {
	const channelState = await loadChannelState({ orgId: userOrgId, canal: input.channel });
	const conditions = buildChannelCatalogConditions({ orgId: userOrgId, channelState });
	if (!conditions) return { data: { groups: [] } };

	const groupedProductGroups = await db
		.selectDistinct({ grupo: products.grupo })
		.from(products)
		.where(and(...conditions));

	const groups = groupedProductGroups.map((g) => g.grupo).filter((g): g is string => !!g && g.trim().length > 0);

	// A ordem curada do canal (a mesma da vitrine) manda; grupo fora dela entra alfabético no fim.
	return { data: { groups: sortGroupsByChannelOrder(groups, channelState?.channel.ordemGrupos ?? []) } };
}

export type TGetPOSGroupsOutput = Awaited<ReturnType<typeof getPOSGroups>>;

const getPOSGroupsHandler: PagesRouteHandler<TGetPOSGroupsOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const input = GetPOSGroupsInputSchema.parse(req.query);
	const data = await getPOSGroups({ input, userOrgId });
	return res.status(200).json(data);
};

const routeHandlers = {
	GET: getPOSGroupsHandler,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
