import { ProductSearchQuerySchema } from "@/schemas/product-search";
import { z } from "zod";
import { buildProductSearch, type ProductSearchDatabase } from "@/lib/products/search";
import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import { products, saleItems, sales, suppliers } from "@/services/drizzle/schema";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, max, min, notInArray, or, type SQL, sql } from "drizzle-orm";

export const GetProductsDefaultInputSchema = z.object({
	page: z
		.string({
			required_error: "Página não informada.",
			invalid_type_error: "Tipo inválido para página.",
		})
		.transform((val) => Number(val)),

	search: ProductSearchQuerySchema,
	groups: z
		.string({
			required_error: "Grupos não informados.",
			invalid_type_error: "Tipo inválido para grupo.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	statsPeriodBefore: z
		.string({ invalid_type_error: "Tipo não válido para data de venda antes da data." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	statsPeriodAfter: z
		.string({ invalid_type_error: "Tipo não válido para data de venda após a data." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	statsSellerIds: z
		.string({
			required_error: "IDs dos vendedores não informados.",
			invalid_type_error: "Tipo inválido para IDs dos vendedores.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	statsIntegrationsIds: z
		.string({
			invalid_type_error: "Tipo não válido para os IDs de integração.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : [])),
	statsExcludedSalesIds: z
		.string({
			invalid_type_error: "Tipo não válido para ID da venda.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : [])),
	statsTotalMin: z
		.string({
			invalid_type_error: "Tipo não válido para valor mínimo da venda.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
	statsTotalMax: z
		.string({
			invalid_type_error: "Tipo não válido para valor máximo da venda.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
	stockStatus: z
		.string({
			invalid_type_error: "Tipo não válido para status de estoque.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	mainSupplierIds: z
		.string({ invalid_type_error: "Tipo não válido para os IDs de fornecedor principal." })
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	withoutMainSupplier: z
		.string({ invalid_type_error: "Tipo não válido para o filtro de produtos sem fornecedor principal." })
		.optional()
		.nullable()
		.transform((val) => val === "true"),
	// Só produtos com rastreamento de estoque ativo: sem isso, quantidade nula vira "sem estoque".
	trackedOnly: z
		.string({ invalid_type_error: "Tipo não válido para o filtro de rastreamento." })
		.optional()
		.nullable()
		.transform((val) => val === "true"),
	abcClasses: z
		.string({
			invalid_type_error: "Tipo nao valido para curva ABC.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",").filter((abcClass) => ["A", "B", "C"].includes(abcClass)) : [])),
	priceMin: z
		.string({
			invalid_type_error: "Tipo não válido para preço mínimo.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
	priceMax: z
		.string({
			invalid_type_error: "Tipo não válido para preço máximo.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
	orderByField: z.enum(["nome", "codigo", "grupo", "vendasValorTotal", "vendasQtdeTotal", "quantidade"]).optional().nullable(),
	orderByDirection: z.enum(["asc", "desc"]).optional().nullable(),
	// Controla qual "modo" de leitura o endpoint executa (ver getProducts). Ausente/"default" retorna produtos + stats
	// comerciais; "stock" retorna a visão operacional de estoque (saldo, movimentação no período, lote ativo).
	mode: z.enum(["default", "stock"], { invalid_type_error: "Tipo não válido para modo de leitura." }).optional().nullable(),
	resultLimit: z
		.string({
			invalid_type_error: "Tipo não válido para limite de resultados.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
});
export type TGetProductsDefaultInput = z.infer<typeof GetProductsDefaultInputSchema>;

export function buildProductFilterConditions(input: TGetProductsDefaultInput, userOrgId: string) {
	const conditions = [eq(products.organizacaoId, userOrgId)];

	const search = buildProductSearch(input.search, products);
	if (search.condition) conditions.push(search.condition);
	if (input.groups.length > 0) {
		conditions.push(inArray(products.grupo, input.groups));
	}
	if (input.trackedOnly) conditions.push(eq(products.rastreamentoEstoqueAtivo, true));
	if (input.stockStatus && input.stockStatus.length > 0) {
		const stockConditions = [];
		for (const status of input.stockStatus) {
			if (status === "out") stockConditions.push(sql`(${products.quantidade} IS NULL OR ${products.quantidade} = 0)`);
			else if (status === "low") stockConditions.push(sql`(${products.quantidade} > 0 AND ${products.quantidade} <= 10)`);
			else if (status === "healthy") stockConditions.push(sql`(${products.quantidade} > 10 AND ${products.quantidade} <= 50)`);
			else if (status === "overstocked") stockConditions.push(sql`${products.quantidade} > 50`);
		}
		if (stockConditions.length > 0) conditions.push(sql`(${sql.join(stockConditions, sql` OR `)})`);
	}
	if (input.priceMin) conditions.push(gte(products.precoVenda, input.priceMin));
	if (input.priceMax) conditions.push(lte(products.precoVenda, input.priceMax));
	// Fornecedores escolhidos e/ou "sem fornecedor principal": as duas opções somam (OR).
	const mainSupplierConditions: SQL[] = [];
	if (input.mainSupplierIds.length > 0) mainSupplierConditions.push(inArray(products.fornecedorPrincipalId, input.mainSupplierIds));
	if (input.withoutMainSupplier) mainSupplierConditions.push(isNull(products.fornecedorPrincipalId));
	if (mainSupplierConditions.length > 0) conditions.push(or(...mainSupplierConditions) as SQL);

	return conditions;
}

export async function queryProductsList(
	{ input, userOrgId, pageSize = 25 }: { input: TGetProductsDefaultInput; userOrgId: string; pageSize?: number },
	db: ProductSearchDatabase,
) {
	const productQueryConditions = buildProductFilterConditions(input, userOrgId);

	const statsConditions = [eq(sales.organizacaoId, userOrgId), eq(sales.statusVenda, "CONFIRMADA")];
	if (input.statsPeriodBefore) statsConditions.push(lte(sales.dataVenda, input.statsPeriodBefore));
	if (input.statsPeriodAfter) statsConditions.push(gte(sales.dataVenda, input.statsPeriodAfter));
	const integrationCondition = getSalesIntegrationCondition(input.statsIntegrationsIds);
	if (integrationCondition) statsConditions.push(integrationCondition);
	if (input.statsExcludedSalesIds && input.statsExcludedSalesIds.length > 0) statsConditions.push(notInArray(sales.id, input.statsExcludedSalesIds));
	if (input.statsSellerIds && input.statsSellerIds.length > 0) statsConditions.push(inArray(sales.vendedorId, input.statsSellerIds));
	// Filtros sobre o total das vendas por produto (uma parcela por item, como o HAVING anterior).
	const statsTotalConditions: SQL[] = [];

	const PAGE_SIZE = pageSize;
	const skip = PAGE_SIZE * (input.page - 1);

	// Stats por produto pré-agregadas a partir dos itens da organização (índice org+produto), com hash
	// join nas vendas que passam nos filtros. A forma anterior (products LEFT JOIN sale_items LEFT JOIN
	// sales) levava o planejador a um lookup em `sales` por item (50k por requisição nesta org), e a
	// contagem repetia tudo: ~760 ms de banco por requisição. Agora é uma agregação (~90 ms), uma vez.
	const salesStatsSubquery = db
		.select({
			produtoId: saleItems.produtoId,
			totalSalesValue: sql<number>`sum(${saleItems.valorVendaTotalLiquido})`.as("total_sales_value"),
			totalSalesQty: sql<number>`sum(${saleItems.quantidade})`.as("total_sales_qty"),
			totalCostValue: sql<number>`sum(${saleItems.valorCustoTotal})`.as("total_cost_value"),
			firstSaleDate: min(sales.dataVenda).as("first_sale_date"),
			lastSaleDate: max(sales.dataVenda).as("last_sale_date"),
			salesTotalSum: sql<number>`sum(${sales.valorTotal})`.as("sales_total_sum"),
		})
		.from(saleItems)
		.innerJoin(sales, and(eq(sales.id, saleItems.vendaId), ...statsConditions))
		.where(eq(saleItems.organizacaoId, userOrgId))
		.groupBy(saleItems.produtoId)
		.as("sales_stats");
	if (input.statsTotalMin) statsTotalConditions.push(gte(salesStatsSubquery.salesTotalSum, input.statsTotalMin));
	if (input.statsTotalMax) statsTotalConditions.push(lte(salesStatsSubquery.salesTotalSum, input.statsTotalMax));

	// Fragmento reutilizável para o valor total (0 para produto sem venda no filtro)
	const totalSalesSql = sql`COALESCE(${salesStatsSubquery.totalSalesValue}, 0)`;

	// Produtos filtrados + stats; a curva ABC (window functions) é calculada sobre esse conjunto.
	const baseQuery = db
		.select({
			// Campos do produto
			productId: products.id,
			codigo: products.codigo,
			nome: products.nome,
			descricao: products.descricao,
			unidade: products.unidade,
			ncm: products.ncm,
			tipo: products.tipo,
			grupo: products.grupo,
			imagemCapaUrl: products.imagemCapaUrl,
			precoVenda: products.precoVenda,
			precoCusto: products.precoCusto,
			quantidade: products.quantidade,
			organizacaoId: products.organizacaoId,
			dataUltimaSincronizacao: products.dataUltimaSincronizacao,
			fornecedorPrincipalId: products.fornecedorPrincipalId,
			fornecedorPrincipalNome: sql<string | null>`${suppliers.nome}`.as("fornecedor_principal_nome"),
			// Campos de stats - 0 quando nenhuma venda passa nos filtros
			totalSalesValue: sql<number>`COALESCE(${salesStatsSubquery.totalSalesValue}, 0)`.as("total_sales_value"),
			totalSalesQty: sql<number>`COALESCE(${salesStatsSubquery.totalSalesQty}, 0)`.as("total_sales_qty"),
			totalCostValue: sql<number>`COALESCE(${salesStatsSubquery.totalCostValue}, 0)`.as("total_cost_value"),
			firstSaleDate: salesStatsSubquery.firstSaleDate,
			lastSaleDate: salesStatsSubquery.lastSaleDate,
			// Curva ABC - calculamos via window functions
			accumulatedSales: sql<number>`sum(${totalSalesSql}) OVER (ORDER BY ${totalSalesSql} DESC, ${products.id} ASC)`.as("accumulated_sales"),
			totalSalesGlobal: sql<number>`sum(${totalSalesSql}) OVER ()`.as("total_sales_global"),
		})
		.from(products)
		.leftJoin(salesStatsSubquery, eq(salesStatsSubquery.produtoId, products.id))
		.leftJoin(suppliers, eq(suppliers.id, products.fornecedorPrincipalId))
		.where(and(...productQueryConditions, ...statsTotalConditions));

	const productStatsSubquery = baseQuery.as("product_stats");
	const curvaABCSql = sql<string>`
		CASE
			WHEN COALESCE(${productStatsSubquery.totalSalesGlobal}, 0) <= 0 THEN 'C'
			WHEN ((COALESCE(${productStatsSubquery.accumulatedSales}, 0) - COALESCE(${productStatsSubquery.totalSalesValue}, 0)) / NULLIF(${productStatsSubquery.totalSalesGlobal}, 0)) < 0.8 THEN 'A'
			WHEN ((COALESCE(${productStatsSubquery.accumulatedSales}, 0) - COALESCE(${productStatsSubquery.totalSalesValue}, 0)) / NULLIF(${productStatsSubquery.totalSalesGlobal}, 0)) < 0.95 THEN 'B'
			ELSE 'C'
		END
	`;

	// Mesmas colunas em todas as camadas (ABC, corte por resultLimit, página); só a fonte muda.
	const pickProductFields = <T extends Record<string, any>>(source: T) => ({
		productId: source.productId,
		codigo: source.codigo,
		nome: source.nome,
		descricao: source.descricao,
		unidade: source.unidade,
		ncm: source.ncm,
		tipo: source.tipo,
		grupo: source.grupo,
		imagemCapaUrl: source.imagemCapaUrl,
		precoVenda: source.precoVenda,
		precoCusto: source.precoCusto,
		quantidade: source.quantidade,
		organizacaoId: source.organizacaoId,
		dataUltimaSincronizacao: source.dataUltimaSincronizacao,
		fornecedorPrincipalId: source.fornecedorPrincipalId,
		fornecedorPrincipalNome: source.fornecedorPrincipalNome,
		totalSalesValue: source.totalSalesValue,
		totalSalesQty: source.totalSalesQty,
		totalCostValue: source.totalCostValue,
		firstSaleDate: source.firstSaleDate,
		lastSaleDate: source.lastSaleDate,
	});

	// Aplica ordenação e paginação
	const productsWithABCQuery = db
		.select({ ...pickProductFields(productStatsSubquery), curvaABC: curvaABCSql.as("curva_abc") })
		.from(productStatsSubquery);

	if (input.abcClasses && input.abcClasses.length > 0) {
		productsWithABCQuery.where(
			sql`${curvaABCSql} IN (${sql.join(
				input.abcClasses.map((abcClass) => sql`${abcClass}`),
				sql`, `,
			)})`,
		);
	}

	const productsWithABCSubquery = productsWithABCQuery.as("products_with_abc");
	const direction = input.orderByDirection === "desc" ? desc : asc;
	const orderByField = input.orderByField;
	const searchTerms = input.search;

	function buildOrderByClause<T extends Record<string, any>>(source: T) {
		switch (orderByField) {
			case "nome":
				return direction(source.nome);
			case "codigo":
				return direction(source.codigo);
			case "grupo":
				return direction(source.grupo);
			case "vendasValorTotal":
				return direction(sql`COALESCE(${source.totalSalesValue}, 0)`);
			case "vendasQtdeTotal":
				return direction(sql`COALESCE(${source.totalSalesQty}, 0)`);
			case "quantidade":
				return direction(sql`COALESCE(${source.quantidade}, 0)`);
			default:
				return asc(source.nome);
		}
	}

	function buildSearchOrder<T extends Record<string, any>>(source: T) {
		return [
			...(searchTerms.length ? [desc(buildProductSearch(searchTerms, { nome: source.nome, codigo: source.codigo }).relevance)] : []),
			buildOrderByClause(source),
			asc(source.productId),
		];
	}

	// resultLimit: corta os top N após ordenação e filtro de curva ABC, antes da paginação
	const paginationSource = input.resultLimit
		? db
				.select()
				.from(productsWithABCSubquery)
				.orderBy(...buildSearchOrder(productsWithABCSubquery))
				.limit(input.resultLimit)
				.as("products_capped")
		: productsWithABCSubquery;

	// Total via window function na própria página: evita recomputar a agregação só para contar.
	const productsWithStatsResult = await db
		.select({ ...pickProductFields(paginationSource), curvaABC: paginationSource.curvaABC, productsMatched: sql<number>`count(*) over ()` })
		.from(paginationSource)
		.orderBy(...buildSearchOrder(paginationSource))
		.offset(skip)
		.limit(PAGE_SIZE);
	// Página vazia além do fim não traz o total: só nesse caso paga a contagem separada.
	const statsByProductMatchedCount =
		productsWithStatsResult.length > 0
			? Number(productsWithStatsResult[0].productsMatched)
			: skip > 0
				? ((await db.select({ count: count() }).from(paginationSource))[0]?.count ?? 0)
				: 0;

	// Mapeia os resultados para o formato final
	const productsWithStats = productsWithStatsResult.map((row) => {
		const totalSales = row.totalSalesValue ? Number(row.totalSalesValue) : 0;

		return {
			id: row.productId,
			codigo: row.codigo,
			nome: row.nome,
			descricao: row.descricao,
			unidade: row.unidade,
			ncm: row.ncm,
			tipo: row.tipo,
			grupo: row.grupo,
			imagemCapaUrl: row.imagemCapaUrl,
			precoVenda: row.precoVenda,
			precoCusto: row.precoCusto,
			quantidade: row.quantidade,
			organizacaoId: row.organizacaoId,
			dataUltimaSincronizacao: row.dataUltimaSincronizacao,
			fornecedorPrincipal: row.fornecedorPrincipalId ? { id: row.fornecedorPrincipalId, nome: row.fornecedorPrincipalNome } : null,
			estatisticas: {
				vendasValorTotal: totalSales,
				vendasQtdeTotal: row.totalSalesQty ? Number(row.totalSalesQty) : 0,
				vendasCustoTotal: row.totalCostValue ? Number(row.totalCostValue) : 0,
				dataPrimeiraVenda: row.firstSaleDate ?? null,
				dataUltimaVenda: row.lastSaleDate ?? null,
				curvaABC: row.curvaABC,
			},
		};
	});
	return {
		data: {
			default: {
				products: productsWithStats,
				productsMatched: statsByProductMatchedCount,
				totalPages: Math.ceil(statsByProductMatchedCount / PAGE_SIZE),
			},
			byId: undefined,
			stock: undefined,
		},
	};
}
