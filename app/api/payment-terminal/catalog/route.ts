import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { hydratePOSProducts } from "@/lib/pos/hydrate-pos-products";
import { sortGroupsByChannelOrder } from "@/lib/products/sales-channels";
import { buildChannelCatalogConditions, loadChannelState } from "@/lib/products/sales-channels-store";
import { buildProductSearch, withProductSearch } from "@/lib/products/search";
import { ProductSearchQuerySchema } from "@/schemas/product-search";
import { db } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
import { type SQL, and, asc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Catálogo do terminal (Fluxo A): os mesmos grupos, produtos, preços e adicionais que o PDV web vê no
// canal POS. Cada produto e cada variação trazem seus grupos de adicionais com as regras já
// resolvidas (mínimo, máximo, máximo por opção) para o app montar a escolha; a venda confere as
// mesmas regras no servidor.

type TTerminalAddOnReference = {
	grupo: { id: string; nome: string; minOpcoes: number; maxOpcoes: number; opcoes: { id: string; nome: string; precoDelta: number; maxQtdePorItem: number | null }[] };
};

function toTerminalAddOnGroups(references: TTerminalAddOnReference[]) {
	return references.map(({ grupo }) => ({
		id: grupo.id,
		nome: grupo.nome,
		minOpcoes: grupo.minOpcoes,
		maxOpcoes: grupo.maxOpcoes,
		opcoes: grupo.opcoes.map((opcao) => ({ id: opcao.id, nome: opcao.nome, precoDelta: opcao.precoDelta, maxQtdePorItem: opcao.maxQtdePorItem })),
	}));
}

const PAGE_SIZE = 40;

const GetTerminalCatalogInputSchema = z.object({
	search: ProductSearchQuerySchema,
	group: z.string({ invalid_type_error: "Tipo inválido para grupo." }).optional().nullable(),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((value) => (value ? Math.max(1, Number(value) || 1) : 1)),
});
export type TGetTerminalCatalogInput = z.infer<typeof GetTerminalCatalogInputSchema>;

async function getTerminalCatalog({ input, organizationId }: { input: TGetTerminalCatalogInput; organizationId: string }) {
	const channelState = await loadChannelState({ orgId: organizationId, canal: "POS" });
	const catalogConditions = buildChannelCatalogConditions({ orgId: organizationId, channelState });
	if (!catalogConditions) {
		return { data: { groups: [], products: [], page: 1, totalPages: 0, total: 0 }, message: "Catálogo vazio para o canal PDV." };
	}

	return withProductSearch(db, input.search, async (database) => {
		const conditions: SQL[] = [...catalogConditions];
		const search = buildProductSearch(input.search, products);
		if (search.condition) conditions.push(search.condition);
		if (input.group) conditions.push(eq(products.grupo, input.group));

		const [groupRows, pageRows] = await Promise.all([
			database.selectDistinct({ grupo: products.grupo }).from(products).where(and(...catalogConditions)),
			database
				.select({ id: products.id, total: sql<number>`count(*) over ()`.mapWith(Number) })
				.from(products)
				.where(and(...conditions))
				.orderBy(...(search.condition ? [sql`${search.relevance} desc`] : []), asc(products.nome), asc(products.id))
				.offset((input.page - 1) * PAGE_SIZE)
				.limit(PAGE_SIZE),
		]);
		const groups = sortGroupsByChannelOrder(
			groupRows.map((row) => row.grupo).filter((group): group is string => !!group && group.trim().length > 0),
			channelState?.channel.ordemGrupos ?? [],
		);
		const total = pageRows[0]?.total ?? 0;
		const ids = pageRows.map((row) => row.id);
		if (ids.length === 0) return { data: { groups, products: [], page: input.page, totalPages: Math.ceil(total / PAGE_SIZE), total }, message: "Catálogo listado com sucesso." };

		// Mesma projeção do canal PDV que a venda usa (`hydratePOSProducts` → `resolveCatalogOrderItem`):
		// o que o terminal mostra — preço do nó, variações disponíveis, grupos com as regras do vínculo
		// e do canal, opções com preço e pausa do canal — é exatamente o que o servidor confere.
		const hydrated = await hydratePOSProducts({ orgId: organizationId, productIds: ids });
		const rank = new Map(ids.map((id, index) => [id, index]));
		const list = hydrated
			.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
			.map((product) => ({
				id: product.id,
				nome: product.nome,
				codigo: product.codigo,
				grupo: product.grupo,
				imagemUrl: product.imagemCapaUrl,
				precoVenda: product.precoVenda,
				gruposAdicionais: toTerminalAddOnGroups(product.addOnsReferencias),
				// Compatibilidade: versões do app anteriores aos grupos bloqueiam o produto com este flag.
				possuiAdicionais: product.addOnsReferencias.length > 0,
				variantes: product.variantes.map((variant) => ({
					id: variant.id,
					nome: variant.nome,
					codigo: variant.codigo,
					// Foto própria da variação (a cor da camiseta); o app cai na foto do produto quando é nula.
					imagemUrl: variant.imagemCapaUrl,
					precoVenda: variant.precoVenda,
					gruposAdicionais: toTerminalAddOnGroups(variant.addOnsReferencias),
					possuiAdicionais: variant.addOnsReferencias.length > 0,
				})),
			}));

		return { data: { groups, products: list, page: input.page, totalPages: Math.ceil(total / PAGE_SIZE), total }, message: "Catálogo listado com sucesso." };
	});
}
export type TGetTerminalCatalogOutput = Awaited<ReturnType<typeof getTerminalCatalog>>;

async function getTerminalCatalogRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:catalog:read");
	const { searchParams } = request.nextUrl;
	const input = GetTerminalCatalogInputSchema.parse({ search: searchParams.get("search"), group: searchParams.get("group"), page: searchParams.get("page") });
	return NextResponse.json(await getTerminalCatalog({ input, organizationId: actor.organizationId }));
}

export const GET = paymentTerminalApiHandler({ GET: getTerminalCatalogRoute });
