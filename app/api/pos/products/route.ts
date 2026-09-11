import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { resolveAddOnReferencesRules } from "@/lib/products/add-on-rules";
import { channelAddOnReferences } from "@/lib/products/sales-channels";
import { buildChannelCatalogConditions, channelNodePrice, loadChannelState } from "@/lib/products/sales-channels-store";
import { getValidSaleConditions } from "@/lib/sales/valid-sale";
import { POS_PRODUCT_ORDERING_DEFAULT, POSProductOrderingEnum, type TPOSProductOrderingEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { productAddOnOptions, productAddOnReferences, productAddOns, productVariants, products, saleItems, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql, sum, type SQL } from "drizzle-orm";
import { count } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";

// Janela das ordenações por desempenho: fiel ao hábito recente da loja sem carregar sazonalidade
// antiga (ex.: Panetone puxando a primeira página em julho).
const POS_ORDERING_WINDOW_DAYS = 90;

const GetPOSProductsInputSchema = z.object({
	search: z
		.string({
			invalid_type_error: "Tipo inválido para busca.",
		})
		.optional()
		.nullable(),
	group: z
		.string({
			invalid_type_error: "Tipo inválido para grupo.",
		})
		.optional()
		.nullable(),
	page: z
		.string({
			required_error: "Página não informada.",
			invalid_type_error: "Tipo inválido para página.",
		})
		.transform((val) => Number(val))
		.default("1"),
	// Canal cuja disponibilidade/preço a grade resolve: o PDV usa POS; o composer de pedidos de
	// comanda usa COMANDA — o pedido da mesa custa o mesmo venha do QR ou do operador.
	channel: z
		.string({
			invalid_type_error: "Tipo inválido para canal.",
		})
		.optional()
		.nullable()
		.transform((value) => (value === "COMANDA" ? ("COMANDA" as const) : ("POS" as const))),
	// Ordenação da grade. Valor inválido cai no padrão em vez de derrubar a tela de venda.
	ordering: z
		.string({
			invalid_type_error: "Tipo inválido para ordenação.",
		})
		.optional()
		.nullable()
		.transform((value) => {
			const parsed = POSProductOrderingEnum.safeParse(value);
			return parsed.success ? parsed.data : POS_PRODUCT_ORDERING_DEFAULT;
		}),
});
export type TGetPOSProductsInput = z.infer<typeof GetPOSProductsInputSchema>;

/**
 * Vendido por produto na janela recente (vendas confirmadas), base das ordenações por desempenho.
 * Fica como subquery para o ranking ser resolvido no mesmo SELECT que pagina a grade — ordenar em
 * memória só ordenaria a página, não o catálogo.
 */
function buildSalesMetricsSubquery({ orgId }: { orgId: string }) {
	const windowStart = dayjs().subtract(POS_ORDERING_WINDOW_DAYS, "days").toDate();

	return db
		.select({
			produtoId: saleItems.produtoId,
			quantidadeVendida: sum(saleItems.quantidade).mapWith(Number).as("quantidade_vendida"),
			valorVendido: sum(saleItems.valorVendaTotalLiquido).mapWith(Number).as("valor_vendido"),
		})
		.from(saleItems)
		.innerJoin(sales, eq(saleItems.vendaId, sales.id))
		.where(and(eq(saleItems.organizacaoId, orgId), ...getValidSaleConditions({ orgId }), isNotNull(sales.dataVenda), gte(sales.dataVenda, windowStart)))
		.groupBy(saleItems.produtoId)
		.as("pos_sales_metrics");
}

/**
 * IDs da página já na ordem pedida. Produto sem venda na janela entra com zero (LEFT JOIN +
 * coalesce) e cai para o fim; o nome desempata para a paginação não embaralhar entre páginas.
 */
async function selectPOSProductPageIds({
	orgId,
	conditions,
	ordering,
	skip,
	limit,
}: {
	orgId: string;
	conditions: SQL[];
	ordering: TPOSProductOrderingEnum;
	skip: number;
	limit: number;
}) {
	if (ordering === "NOME") {
		const rows = await db
			.select({ id: products.id })
			.from(products)
			.where(and(...conditions))
			.orderBy(asc(products.nome))
			.offset(skip)
			.limit(limit);
		return rows.map((row) => row.id);
	}

	const salesMetrics = buildSalesMetricsSubquery({ orgId });
	const metricColumn = ordering === "QUANTIDADE_VENDIDA" ? salesMetrics.quantidadeVendida : salesMetrics.valorVendido;

	const rows = await db
		.select({ id: products.id })
		.from(products)
		.leftJoin(salesMetrics, eq(salesMetrics.produtoId, products.id))
		.where(and(...conditions))
		.orderBy(desc(sql`coalesce(${metricColumn}, 0)`), asc(products.nome))
		.offset(skip)
		.limit(limit);
	return rows.map((row) => row.id);
}

async function getPOSProducts({ input, session }: { input: TGetPOSProductsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const PAGE_SIZE = 24; // Grid-friendly number (4x6 or 3x8)

	const skip = PAGE_SIZE * (input.page - 1);
	const limit = PAGE_SIZE;

	// Disponibilidade e preço no canal pedido (linhas esparsas da matriz de canais). O mesmo estado
	// serve de filtro para a grade e para a barra de categorias (/api/pos/groups).
	const channelState = await loadChannelState({ orgId: userOrgId, canal: input.channel });
	const catalogConditions = buildChannelCatalogConditions({ orgId: userOrgId, channelState });
	if (!catalogConditions) return { data: { products: [], productsMatched: 0, totalPages: 0, currentPage: input.page } };

	const conditions: SQL[] = [...catalogConditions];

	// Search filter — insensível a acentos: unaccent() em ambos os lados normaliza os diacríticos
	// (ex.: "acai" encontra "Açaí"). Requer a extensão `unaccent` (migration 0033_unaccent_extension).
	if (input.search && input.search.length > 0) {
		conditions.push(
			sql`(unaccent(${products.nome}) ILIKE unaccent('%' || ${input.search} || '%') OR unaccent(${products.codigo}) ILIKE unaccent('%' || ${input.search} || '%'))`,
		);
	}

	// Group filter
	if (input.group && input.group.length > 0) {
		conditions.push(eq(products.grupo, input.group));
	}

	// Count total matching products
	const productsMatched = await db
		.select({ count: count(products.id) })
		.from(products)
		.where(and(...conditions));

	const productsMatchedCount = productsMatched[0]?.count || 0;
	const totalPages = Math.ceil(productsMatchedCount / PAGE_SIZE);

	// A ordenação decide a página; a hidratação só carrega os produtos dela.
	const pageProductIds = await selectPOSProductPageIds({ orgId: userOrgId, conditions, ordering: input.ordering, skip, limit });
	if (pageProductIds.length === 0) {
		return { data: { products: [], productsMatched: productsMatchedCount, totalPages, currentPage: input.page } };
	}

	// Fetch products with their variants and add-ons
	const productsResult = await db.query.products.findMany({
		where: and(...conditions, inArray(products.id, pageProductIds)),
		with: {
			variantes: {
				where: (fields, { eq }) => eq(fields.ativo, true),
				orderBy: (fields, { asc }) => asc(fields.precoVenda),
				with: {
					addOnsReferencias: {
						with: {
							grupo: {
								with: {
									opcoes: {
										where: (fields, { eq }) => eq(fields.ativo, true),
										orderBy: (fields, { asc }) => asc(fields.nome),
									},
								},
							},
						},
						orderBy: (fields, { asc }) => asc(fields.ordem),
					},
				},
			},
			addOnsReferencias: {
				where: (fields, { isNull }) => isNull(fields.produtoVarianteId),
				with: {
					grupo: {
						with: {
							opcoes: {
								where: (fields, { eq }) => eq(fields.ativo, true),
								orderBy: (fields, { asc }) => asc(fields.nome),
							},
						},
					},
				},
				orderBy: (fields, { asc }) => asc(fields.ordem),
			},
		},
	});

	// findMany não preserva a ordem do inArray — reordena pelos IDs já ranqueados.
	const pageRankIndex = new Map(pageProductIds.map((id, index) => [id, index]));
	const orderedProducts = productsResult.sort((a, b) => (pageRankIndex.get(a.id) ?? 0) - (pageRankIndex.get(b.id) ?? 0));

	const normalizedProducts = orderedProducts.map((product) => ({
		...product,
		// Preço resolvido do canal — a grade exibe e o carrinho envia o mesmo valor que a
		// validação (validateSaleItemsPricing com canal) vai recalcular.
		precoVenda: channelNodePrice(channelState, { produtoId: product.id, precoVenda: product.precoVenda }),
		// Grupos já sob as regras do canal: os mínimos do cadastro só continuam obrigatórios
		// onde o canal os exige (o balcão pode dispensar; ver channelAddOnReferences).
		addOnsReferencias: channelAddOnReferences(
			channelState?.channel,
			resolveAddOnReferencesRules(product.addOnsReferencias.filter((reference) => reference.grupo.ativo && reference.grupo.opcoes.length > 0)),
		),
		variantes: product.variantes
			// Linha de variante só restringe dentro de um produto visível (mesma regra do resolver).
			.filter((variant) => channelState?.variantOverrides.get(variant.id)?.disponivel !== false)
			.map((variant) => ({
				...variant,
				precoVenda: channelNodePrice(channelState, { produtoId: product.id, produtoVarianteId: variant.id, precoVenda: variant.precoVenda }) ?? 0,
				addOnsReferencias: channelAddOnReferences(
					channelState?.channel,
					resolveAddOnReferencesRules(variant.addOnsReferencias.filter((reference) => reference.grupo.ativo && reference.grupo.opcoes.length > 0)),
				),
			})),
	}));

	return {
		data: {
			products: normalizedProducts,
			productsMatched: productsMatchedCount,
			totalPages: totalPages,
			currentPage: input.page,
		},
	};
}

export type TGetPOSProductsOutput = Awaited<ReturnType<typeof getPOSProducts>>;

const getPOSProductsHandler: PagesRouteHandler<TGetPOSProductsOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const input = GetPOSProductsInputSchema.parse(req.query);
	const data = await getPOSProducts({ input, session: sessionUser });
	return res.status(200).json(data);
};

const routeHandlers = {
	GET: getPOSProductsHandler,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
