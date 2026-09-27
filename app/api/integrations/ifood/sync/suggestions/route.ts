import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { requireIntegrationViewSession } from "@/lib/integrations/ifood/sync/guards";
import { listIfoodCategories } from "@/lib/integrations/ifood/catalog";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { listCatalogLinks } from "@/lib/integrations/ifood/sync/links";
import { suggestCatalogLinks, type TMatchCandidate } from "@/lib/integrations/ifood/sync/matching";
import { db } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetCatalogSuggestionsInputSchema = z.object({
	merchantId: z.string({ required_error: "ID da loja não informado.", invalid_type_error: "Tipo não válido para ID da loja." }).min(1),
	catalogId: z.string({ required_error: "ID do catálogo não informado.", invalid_type_error: "Tipo não válido para ID do catálogo." }).min(1),
});
export type TGetCatalogSuggestionsInput = z.infer<typeof GetCatalogSuggestionsInputSchema>;

async function getCatalogSuggestions({ orgId, input }: { orgId: string; input: TGetCatalogSuggestionsInput }) {
	const context = await resolveIfoodManagementContext({ organizacaoId: orgId, merchantId: input.merchantId });

	const [categorias, links, produtos] = await Promise.all([
		listIfoodCategories(context.client, input.merchantId, { catalogId: input.catalogId }),
		listCatalogLinks({ orgId, merchantId: input.merchantId }),
		// Candidatos = cadastro vendável e ativo. Matéria-prima nunca é sugerida (o vínculo a
		// rejeitaria de qualquer forma) e variantes entram como nós próprios: no iFood, cada
		// variante vira um item (decisão D2).
		db.query.products.findMany({
			where: and(eq(products.organizacaoId, orgId), eq(products.ativo, true), eq(products.vendavel, true)),
			columns: { id: true, nome: true, codigo: true, precoVenda: true },
			with: {
				variantes: { where: (fields, { eq: eqOp }) => eqOp(fields.ativo, true), columns: { id: true, nome: true, codigo: true, precoVenda: true } },
			},
		}),
	]);

	const candidates: TMatchCandidate[] = produtos.flatMap((product): TMatchCandidate[] =>
		product.variantes.length
			? product.variantes.map((variant) => ({
					produtoId: product.id,
					produtoVarianteId: variant.id,
					nome: `${product.nome} ${variant.nome}`,
					codigo: variant.codigo ?? product.codigo,
					precoVenda: variant.precoVenda,
				}))
			: [{ produtoId: product.id, produtoVarianteId: null, nome: product.nome, codigo: product.codigo, precoVenda: product.precoVenda }],
	);

	const items = categorias.flatMap((categoria) => categoria.itens);
	const suggestions = suggestCatalogLinks({ items, candidates, existingLinks: links });

	return {
		data: {
			suggestions,
			resumo: {
				total: suggestions.length,
				fortes: suggestions.filter((suggestion) => suggestion.forca === "FORTE").length,
				fracas: suggestions.filter((suggestion) => suggestion.forca === "FRACA").length,
				semCorrespondencia: suggestions.filter((suggestion) => suggestion.forca === "NENHUMA").length,
			},
		},
		message: "Sugestões de vínculo carregadas com sucesso.",
	};
}
export type TGetCatalogSuggestionsOutput = Awaited<ReturnType<typeof getCatalogSuggestions>>;

async function getCatalogSuggestionsRoute(request: NextRequest) {
	const session = requireIntegrationViewSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = GetCatalogSuggestionsInputSchema.parse({
		merchantId: request.nextUrl.searchParams.get("merchantId"),
		catalogId: request.nextUrl.searchParams.get("catalogId"),
	});
	const result = await getCatalogSuggestions({ orgId, input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCatalogSuggestionsRoute });
