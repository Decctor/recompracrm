import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { sortGroupsByChannelOrder } from "@/lib/products/sales-channels";
import { buildChannelCatalogConditions, channelNodePrice, loadChannelState } from "@/lib/products/sales-channels-store";
import { buildProductSearch, withProductSearch } from "@/lib/products/search";
import { ProductSearchQuerySchema } from "@/schemas/product-search";
import { db } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
import { type SQL, and, asc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Catálogo mínimo do terminal (Fluxo A): os mesmos grupos, produtos e preços que o PDV web vê no
// canal POS (`buildChannelCatalogConditions`). Produto com adicionais obrigatórios é exibido, mas
// marcado — o terminal não monta modificadores neste marco e o backend recusa a venda dele.

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

		const rows = await database.query.products.findMany({
			where: (fields, { inArray }) => inArray(fields.id, ids),
			columns: { id: true, nome: true, codigo: true, grupo: true, precoVenda: true, imagemCapaUrl: true },
			with: {
				variantes: {
					where: (fields, { eq: equals }) => equals(fields.ativo, true),
					columns: { id: true, nome: true, codigo: true, precoVenda: true },
					orderBy: (fields, { asc: ascending }) => ascending(fields.precoVenda),
					with: { addOnsReferencias: { columns: { id: true } } },
				},
				addOnsReferencias: { columns: { id: true, produtoVarianteId: true } },
			},
		});
		const rank = new Map(ids.map((id, index) => [id, index]));
		const list = rows
			.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
			.map((product) => ({
				id: product.id,
				nome: product.nome,
				codigo: product.codigo,
				grupo: product.grupo,
				imagemUrl: product.imagemCapaUrl,
				precoVenda: channelNodePrice(channelState, { produtoId: product.id, precoVenda: product.precoVenda }),
				// O resolver da venda recusa produto/variante com adicionais: o app mostra o motivo em vez de falhar no fim.
				possuiAdicionais: product.addOnsReferencias.some((reference) => reference.produtoVarianteId === null),
				variantes: product.variantes
					.filter((variant) => channelState?.variantOverrides.get(variant.id)?.disponivel !== false)
					.map((variant) => ({
						id: variant.id,
						nome: variant.nome,
						codigo: variant.codigo,
						precoVenda: channelNodePrice(channelState, { produtoId: product.id, produtoVarianteId: variant.id, precoVenda: variant.precoVenda }),
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
