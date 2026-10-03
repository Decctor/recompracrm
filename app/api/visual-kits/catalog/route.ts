import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { loadVisualKitCatalog } from "@/lib/visual-kits/catalog";
import { ProductSearchQuerySchema } from "@/schemas/product-search";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Catálogo do construtor de kits: busca (com filtro de promoção) ou itens por chave
// (`produtoId:produtoVarianteId`) para pré-visualizar as peças com preços atuais.
const GetVisualKitCatalogInputSchema = z.object({
	search: ProductSearchQuerySchema,
	canalVendaId: z
		.string({ invalid_type_error: "Tipo inválido para canal de venda." })
		.optional()
		.nullable()
		.transform((value) => value || null),
	promo: z
		.string({ invalid_type_error: "Tipo inválido para filtro de promoção." })
		.optional()
		.nullable()
		.transform((value) => value === "true"),
	keys: z
		.string({ invalid_type_error: "Tipo inválido para produtos." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",").filter(Boolean) : null)),
});
export type TGetVisualKitCatalogInput = z.infer<typeof GetVisualKitCatalogInputSchema>;

async function getVisualKitCatalog({ input, session }: { input: TGetVisualKitCatalogInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const result = input.keys
		? await loadVisualKitCatalog({ orgId: organizationId, canalVendaId: input.canalVendaId, modo: "CHAVES", chaves: input.keys })
		: await loadVisualKitCatalog({
				orgId: organizationId,
				canalVendaId: input.canalVendaId,
				modo: "BUSCA",
				busca: input.search,
				somentePromocao: input.promo,
			});

	return { data: result, message: "Catálogo carregado com sucesso." };
}
export type TGetVisualKitCatalogOutput = Awaited<ReturnType<typeof getVisualKitCatalog>>;

async function getVisualKitCatalogRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetVisualKitCatalogInputSchema.parse({
		search: searchParams.get("search"),
		canalVendaId: searchParams.get("canalVendaId"),
		promo: searchParams.get("promo"),
		keys: searchParams.get("keys"),
	});
	const result = await getVisualKitCatalog({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getVisualKitCatalogRoute });
