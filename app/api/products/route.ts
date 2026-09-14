import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { schedulePushForProduct } from "@/lib/integrations/ifood/sync/push";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import { ProductFiscalProfileSchema } from "@/schemas/fiscal";
import {
	ProductAddOnOptionSchema,
	ProductAddOnSchema,
	ProductOptionSchema,
	ProductOptionValueSchema,
	ProductSchema,
	ProductVariantSchema,
} from "@/schemas/products";
import { applyStockMovement } from "@/lib/stock/apply-stock-movement";
import { db, type DBTransaction } from "@/services/drizzle";
import {
	productAddOnOptions,
	productAddOnReferences,
	productAddOns,
	productFiscalProfiles,
	productOptionValues,
	productOptions,
	productStockLots,
	productStockTransactions,
	productVariantOptionValues,
	productVariants,
	products,
	saleItems,
	sales,
} from "@/services/drizzle/schema";
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, lte, max, min, notInArray, or, type SQL, sql } from "drizzle-orm";
import { upsertProductAddOnOptions } from "@/lib/products/add-on-options";
import createHttpError from "http-errors";
import { z } from "zod";

const GetProductsDefaultInputSchema = z.object({
	page: z
		.string({
			required_error: "Página não informada.",
			invalid_type_error: "Tipo inválido para página.",
		})
		.transform((val) => Number(val)),

	search: z
		.string({
			required_error: "Busca não informada.",
			invalid_type_error: "Tipo inválido para busca.",
		})
		.optional()
		.nullable(),
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

const GetProductsByIdInputSchema = z.object({
	id: z
		.string({
			required_error: "ID do produto não informado.",
			invalid_type_error: "Tipo inválido para ID do produto.",
		})
		.uuid({ message: "ID do produto inválido." }),
});
export type TGetProductsByIdInput = z.infer<typeof GetProductsByIdInputSchema>;

const GetProductsInputSchema = z.union([GetProductsByIdInputSchema, GetProductsDefaultInputSchema]);
export type TGetProductsInput = z.infer<typeof GetProductsInputSchema>;

type GetProductsParams = {
	input: TGetProductsInput;
	session: TAuthUserSession;
};

const STOCK_INBOUND_MOVEMENT_TYPES = ["ENTRADA_AQUISICAO", "ENTRADA_DEVOLUCAO", "ENTRADA_PRODUCAO"] as const;
const STOCK_OUTBOUND_MOVEMENT_TYPES = ["SAIDA", "SAIDA_PRODUCAO", "DESCARTE"] as const;

// Constrói as condições de filtro sobre a tabela de produtos, compartilhadas entre o modo "default" e "stock".
function buildProductFilterConditions(input: TGetProductsDefaultInput, userOrgId: string) {
	const conditions = [eq(products.organizacaoId, userOrgId)];

	if (input.search) {
		// Insensível a acentos via unaccent() em ambos os lados (requer extensão `unaccent`, migration 0033).
		conditions.push(
			sql`(unaccent(${products.nome}) ILIKE unaccent('%' || ${input.search} || '%') OR unaccent(${products.codigo}) ILIKE unaccent('%' || ${input.search} || '%'))`,
		);
	}
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

	return conditions;
}

// Modo "stock": visão operacional de estoque. Retorna, por produto, o saldo atual, o preço unitário, a movimentação
// (entradas/saídas) dentro do período filtrado e o lote ativo prioritário (FEFO — vence primeiro) com a contagem de lotes ativos.
async function getProductsStockView({ input, userOrgId }: { input: TGetProductsDefaultInput; userOrgId: string }) {
	const now = new Date();
	const PAGE_SIZE = 25;
	const skip = PAGE_SIZE * (input.page - 1);

	const conditions = buildProductFilterConditions(input, userOrgId);

	// Ordenação (subconjunto de campos que fazem sentido para estoque).
	const direction = input.orderByDirection === "desc" ? desc : asc;
	const orderByClause = (() => {
		switch (input.orderByField) {
			case "codigo":
				return direction(products.codigo);
			case "grupo":
				return direction(products.grupo);
			case "quantidade":
				return direction(sql`COALESCE(${products.quantidade}, 0)`);
			default:
				return direction(products.nome);
		}
	})();

	// 1. Página de produtos + total correspondente aos filtros.
	const [productRows, matchedResult] = await Promise.all([
		db
			.select({
				id: products.id,
				codigo: products.codigo,
				nome: products.nome,
				unidade: products.unidade,
				grupo: products.grupo,
				imagemCapaUrl: products.imagemCapaUrl,
				quantidade: products.quantidade,
				precoVenda: products.precoVenda,
				precoCusto: products.precoCusto,
				rastreamentoEstoqueAtivo: products.rastreamentoEstoqueAtivo,
			})
			.from(products)
			.where(and(...conditions))
			.orderBy(orderByClause)
			.offset(skip)
			.limit(PAGE_SIZE),
		db
			.select({ count: count() })
			.from(products)
			.where(and(...conditions)),
	]);

	const productsMatched = matchedResult[0]?.count ?? 0;
	const productIds = productRows.map((product) => product.id);

	// 2. Movimentação (entradas/saídas) no período, agregada por produto. Delta por transação: sinal por tipo,
	//    com AJUSTE derivado da variação de saldo.
	const deltaExpression = sql`CASE
		WHEN ${productStockTransactions.tipo} IN (${sql.join(
			STOCK_INBOUND_MOVEMENT_TYPES.map((type) => sql`${type}`),
			sql`, `,
		)}) THEN ${productStockTransactions.quantidade}
		WHEN ${productStockTransactions.tipo} IN (${sql.join(
			STOCK_OUTBOUND_MOVEMENT_TYPES.map((type) => sql`${type}`),
			sql`, `,
		)}) THEN -${productStockTransactions.quantidade}
		ELSE COALESCE(${productStockTransactions.saldoPosterior} - ${productStockTransactions.saldoAnterior}, 0)
	END`;

	const movementByProductId = new Map<string, { entradas: number; saidas: number }>();
	if (productIds.length > 0) {
		const movementConditions = [eq(productStockTransactions.organizacaoId, userOrgId), inArray(productStockTransactions.produtoId, productIds)];
		if (input.statsPeriodAfter) movementConditions.push(gte(productStockTransactions.dataInsercao, input.statsPeriodAfter));
		if (input.statsPeriodBefore) movementConditions.push(lte(productStockTransactions.dataInsercao, input.statsPeriodBefore));

		const movementRows = await db
			.select({
				produtoId: productStockTransactions.produtoId,
				entradas: sql<number>`COALESCE(SUM(CASE WHEN (${deltaExpression}) > 0 THEN (${deltaExpression}) ELSE 0 END), 0)`,
				saidas: sql<number>`COALESCE(SUM(CASE WHEN (${deltaExpression}) < 0 THEN -(${deltaExpression}) ELSE 0 END), 0)`,
			})
			.from(productStockTransactions)
			.where(and(...movementConditions))
			.groupBy(productStockTransactions.produtoId);

		for (const row of movementRows) {
			movementByProductId.set(row.produtoId, { entradas: Number(row.entradas) || 0, saidas: Number(row.saidas) || 0 });
		}
	}

	// 3. Lotes ativos (não vencidos, com saldo) por produto. Escolhe o prioritário via FEFO e conta os demais.
	const lotsByProductId = new Map<
		string,
		{ id: string; codigoLote: string | null; quantidadeAtual: number; quantidadeInicial: number; dataValidade: Date | null; dataInsercao: Date }[]
	>();
	if (productIds.length > 0) {
		const lotRows = await db
			.select({
				id: productStockLots.id,
				produtoId: productStockLots.produtoId,
				codigoLote: productStockLots.codigoLote,
				quantidadeAtual: productStockLots.quantidadeAtual,
				quantidadeInicial: productStockLots.quantidadeInicial,
				dataValidade: productStockLots.dataValidade,
				dataInsercao: productStockLots.dataInsercao,
			})
			.from(productStockLots)
			.where(
				and(
					eq(productStockLots.organizacaoId, userOrgId),
					inArray(productStockLots.produtoId, productIds),
					eq(productStockLots.status, "ATIVO"),
					gt(productStockLots.quantidadeAtual, 0),
					or(isNull(productStockLots.dataValidade), gte(productStockLots.dataValidade, now)),
				),
			);

		for (const lot of lotRows) {
			const list = lotsByProductId.get(lot.produtoId) ?? [];
			list.push(lot);
			lotsByProductId.set(lot.produtoId, list);
		}
	}

	// 4. Resumo agregado sobre TODO o conjunto filtrado (não apenas a página atual).
	const in7Days = new Date(now);
	in7Days.setDate(in7Days.getDate() + 7);
	const [resumoRow, vencendoResult] = await Promise.all([
		db
			.select({
				totalEmEstoque: sql<number>`COALESCE(SUM(COALESCE(${products.quantidade}, 0)), 0)`,
				valorImobilizado: sql<number>`COALESCE(SUM(COALESCE(${products.quantidade}, 0) * COALESCE(${products.precoCusto}, 0)), 0)`,
				produtosSemEstoque: sql<number>`COALESCE(SUM(CASE WHEN COALESCE(${products.quantidade}, 0) <= 0 THEN 1 ELSE 0 END), 0)`,
				produtosComEstoque: sql<number>`COALESCE(SUM(CASE WHEN COALESCE(${products.quantidade}, 0) > 0 THEN 1 ELSE 0 END), 0)`,
			})
			.from(products)
			.where(and(...conditions)),
		db
			.select({ count: count() })
			.from(productStockLots)
			.innerJoin(products, eq(productStockLots.produtoId, products.id))
			.where(
				and(
					eq(productStockLots.status, "ATIVO"),
					gt(productStockLots.quantidadeAtual, 0),
					gte(productStockLots.dataValidade, now),
					lt(productStockLots.dataValidade, in7Days),
					...conditions,
				),
			),
	]);

	const products_ = productRows.map((product) => {
		const movimentacao = movementByProductId.get(product.id) ?? { entradas: 0, saidas: 0 };
		const activeLots = (lotsByProductId.get(product.id) ?? []).slice().sort((a, b) => {
			// FEFO: vence primeiro. Sem validade vai para o fim. Desempate por data de inserção (mais antigo primeiro).
			if (a.dataValidade && b.dataValidade) return a.dataValidade.getTime() - b.dataValidade.getTime();
			if (a.dataValidade) return -1;
			if (b.dataValidade) return 1;
			return a.dataInsercao.getTime() - b.dataInsercao.getTime();
		});
		const primaryLot = activeLots[0] ?? null;
		const loteAtivo = primaryLot
			? {
					id: primaryLot.id,
					codigoLote: primaryLot.codigoLote,
					quantidadeAtual: primaryLot.quantidadeAtual,
					quantidadeInicial: primaryLot.quantidadeInicial,
					dataValidade: primaryLot.dataValidade,
					diasAteValidade: primaryLot.dataValidade ? Math.ceil((new Date(primaryLot.dataValidade).getTime() - now.getTime()) / 86_400_000) : null,
				}
			: null;

		return {
			id: product.id,
			codigo: product.codigo,
			nome: product.nome,
			unidade: product.unidade,
			grupo: product.grupo,
			imagemCapaUrl: product.imagemCapaUrl,
			quantidade: product.quantidade,
			precoVenda: product.precoVenda,
			precoCusto: product.precoCusto,
			rastreamentoEstoqueAtivo: product.rastreamentoEstoqueAtivo ?? false,
			movimentacao,
			loteAtivo,
			lotesAtivosCount: activeLots.length,
		};
	});

	return {
		data: {
			default: undefined,
			byId: undefined,
			stock: {
				products: products_,
				productsMatched,
				totalPages: Math.ceil(productsMatched / PAGE_SIZE),
				resumo: {
					totalEmEstoque: Number(resumoRow[0]?.totalEmEstoque ?? 0),
					valorImobilizado: Number(resumoRow[0]?.valorImobilizado ?? 0),
					produtosSemEstoque: Number(resumoRow[0]?.produtosSemEstoque ?? 0),
					produtosComEstoque: Number(resumoRow[0]?.produtosComEstoque ?? 0),
					lotesVencendo7Dias: Number(vencendoResult[0]?.count ?? 0),
				},
			},
		},
		message: "Visão de estoque obtida com sucesso.",
	};
}

async function getProducts({ input, session }: GetProductsParams) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	console.log("[INFO] [GET PRODUCTS] Input:", input);

	if ("id" in input) {
		console.log("[INFO] [GET PRODUCTS] Getting product by id:", input.id);
		const product = await db.query.products.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.id), eq(fields.organizacaoId, userOrgId)),
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
											where: (fields, { isNull }) => isNull(fields.dataExclusao),
											orderBy: (fields, { asc }) => asc(fields.nome),
											with: {
												produto: true,
												produtoVariante: true,
											},
										},
									},
								},
							},
							orderBy: (fields, { asc }) => asc(fields.ordem),
						},
						perfisFiscais: {
							where: (fields, { eq }) => eq(fields.ativo, true),
						},
						valoresOpcoes: {
							with: {
								opcao: true,
								valor: true,
							},
						},
					},
				},
				opcoes: {
					orderBy: (fields, { asc }) => asc(fields.ordem),
					with: {
						valores: {
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
									where: (fields, { isNull }) => isNull(fields.dataExclusao),
									orderBy: (fields, { asc }) => asc(fields.nome),
									with: {
										produto: true,
										produtoVariante: true,
									},
								},
							},
						},
					},
					orderBy: (fields, { asc }) => asc(fields.ordem),
				},
				perfisFiscais: {
					where: (fields, { eq }) => eq(fields.ativo, true),
				},
			},
		});
		if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

		return {
			data: {
				byId: product,
				default: undefined,
				stock: undefined,
			},
		};
	}

	// Modo "stock": visão operacional de estoque (delega para o helper dedicado).
	if (input.mode === "stock") {
		return getProductsStockView({ input, userOrgId });
	}

	const productQueryConditions = [eq(products.organizacaoId, userOrgId)];

	if (input.search) {
		// Insensível a acentos via unaccent() em ambos os lados (requer extensão `unaccent`, migration 0033).
		productQueryConditions.push(
			sql`(unaccent(${products.nome}) ILIKE unaccent('%' || ${input.search} || '%') OR unaccent(${products.codigo}) ILIKE unaccent('%' || ${input.search} || '%'))`,
		);
	}
	if (input.groups.length > 0) {
		productQueryConditions.push(inArray(products.grupo, input.groups));
	}

	// Stock status filters
	if (input.stockStatus && input.stockStatus.length > 0) {
		const stockConditions = [];
		for (const status of input.stockStatus) {
			if (status === "out") {
				stockConditions.push(sql`(${products.quantidade} IS NULL OR ${products.quantidade} = 0)`);
			} else if (status === "low") {
				stockConditions.push(sql`(${products.quantidade} > 0 AND ${products.quantidade} <= 10)`);
			} else if (status === "healthy") {
				stockConditions.push(sql`(${products.quantidade} > 10 AND ${products.quantidade} <= 50)`);
			} else if (status === "overstocked") {
				stockConditions.push(sql`${products.quantidade} > 50`);
			}
		}
		if (stockConditions.length > 0) {
			productQueryConditions.push(sql`(${sql.join(stockConditions, sql` OR `)})`);
		}
	}

	// Price range filters
	if (input.priceMin) {
		productQueryConditions.push(gte(products.precoVenda, input.priceMin));
	}
	if (input.priceMax) {
		productQueryConditions.push(lte(products.precoVenda, input.priceMax));
	}

	const statsConditions = [eq(sales.organizacaoId, userOrgId), eq(sales.statusVenda, "CONFIRMADA")];
	if (input.statsPeriodBefore) statsConditions.push(lte(sales.dataVenda, input.statsPeriodBefore));
	if (input.statsPeriodAfter) statsConditions.push(gte(sales.dataVenda, input.statsPeriodAfter));
	const integrationCondition = getSalesIntegrationCondition(input.statsIntegrationsIds);
	if (integrationCondition) statsConditions.push(integrationCondition);
	if (input.statsExcludedSalesIds && input.statsExcludedSalesIds.length > 0) statsConditions.push(notInArray(sales.id, input.statsExcludedSalesIds));
	if (input.statsSellerIds && input.statsSellerIds.length > 0) statsConditions.push(inArray(sales.vendedorId, input.statsSellerIds));
	// Filtros sobre o total das vendas por produto (uma parcela por item, como o HAVING anterior).
	const statsTotalConditions: SQL[] = [];

	const PAGE_SIZE = 25;
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

	// resultLimit: corta os top N após ordenação e filtro de curva ABC, antes da paginação
	const paginationSource = input.resultLimit
		? db.select().from(productsWithABCSubquery).orderBy(buildOrderByClause(productsWithABCSubquery)).limit(input.resultLimit).as("products_capped")
		: productsWithABCSubquery;

	// Total via window function na própria página: evita recomputar a agregação só para contar.
	const productsWithStatsResult = await db
		.select({ ...pickProductFields(paginationSource), curvaABC: paginationSource.curvaABC, productsMatched: sql<number>`count(*) over ()` })
		.from(paginationSource)
		.orderBy(buildOrderByClause(paginationSource))
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

export type TGetProductsOutput = Awaited<ReturnType<typeof getProducts>>;
export type TGetProductsOutputDefault = Exclude<TGetProductsOutput["data"]["default"], undefined>;
export type TGetProductsOutputById = Exclude<TGetProductsOutput["data"]["byId"], undefined>;
export type TGetProductsOutputStock = Exclude<TGetProductsOutput["data"]["stock"], undefined>;

const getProductsHandler: PagesRouteHandler<TGetProductsOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	console.log("[INFO] [GET PRODUCTS] Query params:", req.query);
	const input = GetProductsInputSchema.parse({
		page: req.query.page as string | undefined,
		id: req.query.id as string | undefined,
		search: req.query.search as string | undefined,
		groups: req.query.groups as string | undefined,
		statsPeriodAfter: req.query.statsPeriodAfter as string | undefined,
		statsPeriodBefore: req.query.statsPeriodBefore as string | undefined,
		statsSellerIds: req.query.statsSellerIds as string | undefined,
		statsIntegrationsIds: req.query.statsIntegrationsIds as string | undefined,
		statsExcludedSalesIds: req.query.statsExcludedSalesIds as string | undefined,
		statsTotalMin: req.query.statsTotalMin as string | undefined,
		statsTotalMax: req.query.statsTotalMax as string | undefined,
		stockStatus: req.query.stockStatus as string | undefined,
		trackedOnly: req.query.trackedOnly as string | undefined,
		abcClasses: req.query.abcClasses as string | undefined,
		priceMin: req.query.priceMin as string | undefined,
		priceMax: req.query.priceMax as string | undefined,
		orderByField: req.query.orderByField as string | undefined,
		orderByDirection: req.query.orderByDirection as string | undefined,
		mode: req.query.mode as string | undefined,
		resultLimit: req.query.resultLimit as string | undefined,
	});
	const data = await getProducts({ input, session: sessionUser });
	return res.status(200).json(data);
};

const UpdateProductAddOnOptionInputSchema = ProductAddOnOptionSchema.omit({
	organizacaoId: true,
	produtoAddOnId: true,
}).extend({
	produtoConsumo: z.string().optional().nullable(),
	id: z
		.string({
			invalid_type_error: "Tipo não válido para ID da opção.",
		})
		.optional()
		.nullable(),
	deletar: z
		.boolean({
			invalid_type_error: "Tipo não válido para deletar opção.",
		})
		.optional()
		.nullable(),
});

const UpdateProductAddOnInputSchema = ProductAddOnSchema.omit({ organizacaoId: true })
	.extend({
		opcoes: z.array(UpdateProductAddOnOptionInputSchema),
	})
	.extend({
		id: z
			.string({
				invalid_type_error: "Tipo não válido para ID do adicional.",
			})
			.optional()
			.nullable(),
		deletar: z
			.boolean({
				invalid_type_error: "Tipo não válido para deletar adicional.",
			})
			.optional()
			.nullable(),
		// Regra deste produto (override no vínculo): null = herda min/max do grupo.
		vinculoMinOpcoes: z
			.number({
				invalid_type_error: "Tipo não válido para mínimo de opções do vínculo.",
			})
			.optional()
			.nullable(),
		vinculoMaxOpcoes: z
			.number({
				invalid_type_error: "Tipo não válido para máximo de opções do vínculo.",
			})
			.optional()
			.nullable(),
	});

const UpdateProductFiscalProfileInputSchema = ProductFiscalProfileSchema.omit({
	organizacaoId: true,
	produtoId: true,
	produtoVarianteId: true,
}).extend({
	id: z
		.string({
			invalid_type_error: "Tipo não válido para ID do perfil fiscal.",
		})
		.optional()
		.nullable(),
	deletar: z
		.boolean({
			invalid_type_error: "Tipo não válido para deletar perfil fiscal.",
		})
		.optional()
		.nullable(),
});

// Referência de valor de eixo dentro de uma variante (junção variante <-> valor).
const UpdateProductVariantOptionValueInputSchema = z.object({
	opcaoReferenciaId: z.string({ invalid_type_error: "Tipo não válido para referência do eixo." }),
	valorReferenciaId: z.string({ invalid_type_error: "Tipo não válido para referência do valor." }),
	id: z.string({ invalid_type_error: "Tipo não válido para ID da junção." }).optional().nullable(),
	opcaoId: z.string({ invalid_type_error: "Tipo não válido para ID do eixo." }).optional().nullable(),
	opcaoValorId: z.string({ invalid_type_error: "Tipo não válido para ID do valor." }).optional().nullable(),
	deletar: z.boolean({ invalid_type_error: "Tipo não válido para deletar junção." }).optional().nullable(),
});

const UpdateProductOptionValueInputSchema = ProductOptionValueSchema.omit({ organizacaoId: true, opcaoId: true }).extend({
	referenciaId: z.string({ invalid_type_error: "Tipo não válido para referência do valor." }),
	id: z.string({ invalid_type_error: "Tipo não válido para ID do valor." }).optional().nullable(),
	deletar: z.boolean({ invalid_type_error: "Tipo não válido para deletar valor." }).optional().nullable(),
});

const UpdateProductOptionInputSchema = ProductOptionSchema.omit({ organizacaoId: true, produtoId: true }).extend({
	referenciaId: z.string({ invalid_type_error: "Tipo não válido para referência do eixo." }),
	id: z.string({ invalid_type_error: "Tipo não válido para ID do eixo." }).optional().nullable(),
	deletar: z.boolean({ invalid_type_error: "Tipo não válido para deletar eixo." }).optional().nullable(),
	valores: z.array(UpdateProductOptionValueInputSchema),
});

const UpdateProductVariantInputSchema = ProductVariantSchema.omit({
	organizacaoId: true,
	produtoId: true,
}).extend({
	imagemCapaUrl: z.string().optional().nullable(),
	addOns: z.array(UpdateProductAddOnInputSchema),
	perfisFiscais: z.array(UpdateProductFiscalProfileInputSchema),
	opcoesValores: z.array(UpdateProductVariantOptionValueInputSchema).default([]),
	id: z
		.string({
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.optional()
		.nullable(),
	deletar: z
		.boolean({
			invalid_type_error: "Tipo não válido para deletar variante.",
		})
		.optional()
		.nullable(),
});

const UpdateProductInputSchema = z.object({
	productId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo inválido para ID do produto.",
	}),
	product: ProductSchema.omit({ organizacaoId: true }),
	productVariants: z.array(UpdateProductVariantInputSchema),
	productOptions: z.array(UpdateProductOptionInputSchema).default([]),
	productAddOns: z.array(UpdateProductAddOnInputSchema),
	productFiscalProfiles: z.array(UpdateProductFiscalProfileInputSchema),
});
export type TUpdateProductInput = z.infer<typeof UpdateProductInputSchema>;

type TUpdateProductAddOnInput = z.infer<typeof UpdateProductAddOnInputSchema>;
type TUpdateProductFiscalProfileInput = z.infer<typeof UpdateProductFiscalProfileInputSchema>;
type TUpdateProductOptionInput = z.infer<typeof UpdateProductOptionInputSchema>;
type TUpdateProductVariantOptionValueInput = z.infer<typeof UpdateProductVariantOptionValueInputSchema>;

// Resolve referenciaId -> id real para eixos e valores, fazendo insert/update/delete dos filhos.
async function upsertProductOptions({
	tx,
	userOrgId,
	productId,
	options,
}: {
	tx: DBTransaction;
	userOrgId: string;
	productId: string;
	options: TUpdateProductOptionInput[];
}) {
	const optionRefToId = new Map<string, string>();
	const valueRefToId = new Map<string, string>();

	for (const option of options) {
		if (option.id && option.deletar) {
			// Hard delete: o cascade remove valores e as junções com variantes.
			await tx
				.delete(productOptions)
				.where(and(eq(productOptions.id, option.id), eq(productOptions.produtoId, productId), eq(productOptions.organizacaoId, userOrgId)));
			continue;
		}

		let optionId = option.id ?? null;
		if (optionId) {
			await tx
				.update(productOptions)
				.set({ nome: option.nome, tipo: option.tipo, ordem: option.ordem })
				.where(and(eq(productOptions.id, optionId), eq(productOptions.produtoId, productId), eq(productOptions.organizacaoId, userOrgId)));
		} else {
			const [created] = await tx
				.insert(productOptions)
				.values({ organizacaoId: userOrgId, produtoId: productId, nome: option.nome, tipo: option.tipo, ordem: option.ordem })
				.returning({ id: productOptions.id });
			if (!created?.id) throw new createHttpError.InternalServerError("Erro ao criar eixo de variação.");
			optionId = created.id;
		}
		optionRefToId.set(option.referenciaId, optionId);

		for (const value of option.valores) {
			if (value.id && value.deletar) {
				await tx
					.delete(productOptionValues)
					.where(and(eq(productOptionValues.id, value.id), eq(productOptionValues.opcaoId, optionId), eq(productOptionValues.organizacaoId, userOrgId)));
				continue;
			}

			const valueFields = {
				nome: value.nome,
				valorAuxiliar: value.valorAuxiliar ?? null,
				imagemCapaUrl: value.imagemCapaUrl ?? null,
				ordem: value.ordem,
			};

			let valueId = value.id ?? null;
			if (valueId) {
				await tx
					.update(productOptionValues)
					.set(valueFields)
					.where(and(eq(productOptionValues.id, valueId), eq(productOptionValues.opcaoId, optionId), eq(productOptionValues.organizacaoId, userOrgId)));
			} else {
				const [created] = await tx
					.insert(productOptionValues)
					.values({ organizacaoId: userOrgId, opcaoId: optionId, ...valueFields })
					.returning({ id: productOptionValues.id });
				if (!created?.id) throw new createHttpError.InternalServerError("Erro ao criar valor de variação.");
				valueId = created.id;
			}
			valueRefToId.set(value.referenciaId, valueId);
		}
	}

	return { optionRefToId, valueRefToId };
}

// Substitui as junções de uma variante pelo conjunto desejado (resolvendo referenciaId -> id real).
async function syncVariantOptionValues({
	tx,
	userOrgId,
	variantId,
	refs,
	optionRefToId,
	valueRefToId,
}: {
	tx: DBTransaction;
	userOrgId: string;
	variantId: string;
	refs: TUpdateProductVariantOptionValueInput[];
	optionRefToId: Map<string, string>;
	valueRefToId: Map<string, string>;
}) {
	const desired: Array<{ opcaoId: string; opcaoValorId: string }> = [];
	for (const ref of refs) {
		if (ref.deletar) continue;
		const opcaoId = ref.opcaoId ?? optionRefToId.get(ref.opcaoReferenciaId) ?? null;
		const opcaoValorId = ref.opcaoValorId ?? valueRefToId.get(ref.valorReferenciaId) ?? null;
		if (!opcaoId || !opcaoValorId) continue; // referência a um eixo/valor que não foi enviado ou foi removido
		desired.push({ opcaoId, opcaoValorId });
	}

	await tx
		.delete(productVariantOptionValues)
		.where(and(eq(productVariantOptionValues.produtoVarianteId, variantId), eq(productVariantOptionValues.organizacaoId, userOrgId)));

	for (const item of desired) {
		await tx.insert(productVariantOptionValues).values({
			organizacaoId: userOrgId,
			produtoVarianteId: variantId,
			opcaoId: item.opcaoId,
			opcaoValorId: item.opcaoValorId,
		});
	}
}

async function upsertScopedProductAddOn({
	tx,
	userOrgId,
	productId,
	variantId,
	order,
	addOn,
}: {
	tx: DBTransaction;
	userOrgId: string;
	productId: string;
	variantId?: string | null;
	order: number;
	addOn: TUpdateProductAddOnInput;
}) {
	if (addOn.id && addOn.deletar) {
		// Groups can be shared across products: removing one from a product only
		// detaches the reference; the group stays available in the registry.
		await tx
			.delete(productAddOnReferences)
			.where(
				and(
					eq(productAddOnReferences.produtoId, productId),
					eq(productAddOnReferences.produtoAddOnId, addOn.id),
					variantId ? eq(productAddOnReferences.produtoVarianteId, variantId) : isNull(productAddOnReferences.produtoVarianteId),
				),
			);
		return addOn.id;
	}

	if (addOn.id) {
		// Regras (min/max) editadas no contexto de um produto valem só para o vínculo — o default
		// do grupo é editado no registry (aba Adicionais), onde o escopo global fica explícito.
		// O fluxo de variantes ainda não carrega os campos de vínculo, então segue editando o grupo.
		await tx
			.update(productAddOns)
			.set(
				variantId
					? { nome: addOn.nome, internoNome: addOn.internoNome, minOpcoes: addOn.minOpcoes, maxOpcoes: addOn.maxOpcoes, ativo: addOn.ativo }
					: { nome: addOn.nome, internoNome: addOn.internoNome, ativo: addOn.ativo },
			)
			.where(and(eq(productAddOns.id, addOn.id), eq(productAddOns.organizacaoId, userOrgId)));

		await tx
			.update(productAddOnReferences)
			.set(variantId ? { ordem: order } : { ordem: order, minOpcoes: addOn.vinculoMinOpcoes ?? null, maxOpcoes: addOn.vinculoMaxOpcoes ?? null })
			.where(
				and(
					eq(productAddOnReferences.produtoId, productId),
					eq(productAddOnReferences.produtoAddOnId, addOn.id),
					variantId ? eq(productAddOnReferences.produtoVarianteId, variantId) : isNull(productAddOnReferences.produtoVarianteId),
				),
			);

		await upsertProductAddOnOptions({
			tx,
			userOrgId,
			addOnId: addOn.id,
			options: addOn.opcoes,
		});

		return addOn.id;
	}

	const [createdAddOn] = await tx
		.insert(productAddOns)
		.values({
			organizacaoId: userOrgId,
			nome: addOn.nome,
			internoNome: addOn.internoNome,
			minOpcoes: addOn.minOpcoes,
			maxOpcoes: addOn.maxOpcoes,
			ativo: addOn.ativo,
		})
		.returning({ id: productAddOns.id });

	if (!createdAddOn?.id) {
		throw new createHttpError.InternalServerError("Erro ao criar grupo de adicionais do produto.");
	}

	await upsertProductAddOnOptions({
		tx,
		userOrgId,
		addOnId: createdAddOn.id,
		options: addOn.opcoes,
	});

	await tx.insert(productAddOnReferences).values({
		produtoId: productId,
		produtoVarianteId: variantId ?? null,
		produtoAddOnId: createdAddOn.id,
		ordem: order,
	});

	return createdAddOn.id;
}

async function upsertScopedProductFiscalProfiles({
	tx,
	userOrgId,
	userHasFiscalConfigurePermission,
	productId,
	variantId,
	profiles,
}: {
	tx: DBTransaction;
	userOrgId: string;
	userHasFiscalConfigurePermission: boolean;
	productId: string;
	variantId?: string | null;
	profiles: TUpdateProductFiscalProfileInput[];
}) {
	for (const profile of profiles) {
		const scopedWhereClause = and(
			eq(productFiscalProfiles.organizacaoId, userOrgId),
			eq(productFiscalProfiles.produtoId, productId),
			variantId ? eq(productFiscalProfiles.produtoVarianteId, variantId) : isNull(productFiscalProfiles.produtoVarianteId),
			profile.id ? eq(productFiscalProfiles.id, profile.id) : undefined,
		);

		if (profile.id && profile.deletar) {
			if (!userHasFiscalConfigurePermission) {
				console.warn("[WARN] [UPSERT SCOPED PRODUCT FISCAL PROFILES] User does not have permission to configure fiscal profiles.");
				continue;
			}
			await tx.update(productFiscalProfiles).set({ ativo: false }).where(scopedWhereClause);
			continue;
		}

		const profileValues = {
			origemMercadoria: profile.origemMercadoria,
			ncm: profile.ncm,
			exTipi: profile.exTipi ?? null,
			cest: profile.cest,
			cfopPadrao: profile.cfopPadrao,
			unidadeComercial: profile.unidadeComercial,
			codigoBeneficioFiscal: profile.codigoBeneficioFiscal,
			ativo: profile.ativo,
		};

		if (profile.id) {
			if (!userHasFiscalConfigurePermission) {
				console.warn("[WARN] [UPSERT SCOPED PRODUCT FISCAL PROFILES] User does not have permission to configure fiscal profiles.");
				continue;
			}
			await tx.update(productFiscalProfiles).set(profileValues).where(scopedWhereClause);
			continue;
		}

		if (!userHasFiscalConfigurePermission) {
			console.warn("[WARN] [UPSERT SCOPED PRODUCT FISCAL PROFILES] User does not have permission to configure fiscal profiles.");
			continue;
		}
		await tx.insert(productFiscalProfiles).values({
			organizacaoId: userOrgId,
			produtoId: productId,
			produtoVarianteId: variantId ?? null,
			...profileValues,
		});
	}
}

async function updateProduct({ session, input }: { session: TAuthUserSession; input: TUpdateProductInput }) {
	const userMembership = session.membership;
	if (!userMembership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const userOrgId = userMembership.organizacao.id;
	const userHasFiscalConfigurePermission = userMembership.permissoes.fiscal.configurar;

	const product = await db.query.products.findFirst({
		where: and(eq(products.id, input.productId), eq(products.organizacaoId, userOrgId)),
	});
	if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

	const transactionReturn = await db.transaction(async (tx) => {
		// Saldo lido com trava (FOR UPDATE): a edição vira um AJUSTE calculado por delta, então o
		// saldo de referência não pode mudar (venda concorrente) entre a leitura e a movimentação.
		const [currentProductState] = await tx
			.select({ quantidade: products.quantidade })
			.from(products)
			.where(and(eq(products.id, input.productId), eq(products.organizacaoId, userOrgId)))
			.for("update");
		if (!currentProductState) throw new createHttpError.NotFound("Produto não encontrado.");

		// `quantidade` fica fora do update direto: com rastreamento ativo, o saldo só muda via
		// movimentação de estoque (abaixo), preservando o livro-razão.
		const [updatedProduct] = await tx
			.update(products)
			.set({
				vendavel: input.product.vendavel,
				nome: input.product.nome,
				descricao: input.product.descricao,
				codigo: input.product.codigo,
				unidade: input.product.unidade,
				ncm: input.product.ncm,
				tipo: input.product.tipo,
				grupo: input.product.grupo,
				imagemCapaUrl: input.product.imagemCapaUrl,
				precoVenda: input.product.precoVenda,
				precoCusto: input.product.precoCusto,
				rastreamentoEstoqueAtivo: input.product.rastreamentoEstoqueAtivo,
				baixaEstoqueModo: input.product.baixaEstoqueModo,
				fichaTecnicaReceitaId: input.product.fichaTecnicaReceitaId,
			})
			.where(and(eq(products.id, input.productId), eq(products.organizacaoId, userOrgId)))
			.returning({ updatedId: products.id });

		if (!updatedProduct?.updatedId) {
			throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar produto.");
		}

		// Quantidade ausente no payload = saldo inalterado (antes, escrevia null e zerava o saldo
		// sem rastro). Com rastreamento ativo o delta vira um AJUSTE no livro-razão — o flag novo já
		// foi persistido acima, então ligar o rastreamento e informar o saldo na mesma edição
		// funciona. Sem rastreamento, mantém a escrita direta (produto sem livro-razão).
		if (input.product.quantidade != null) {
			if (input.product.rastreamentoEstoqueAtivo) {
				const productQuantityDelta = input.product.quantidade - (currentProductState.quantidade ?? 0);
				if (productQuantityDelta !== 0) {
					await applyStockMovement({
						trx: tx,
						organizationId: userOrgId,
						userId: session.user.id,
						produtoId: input.productId,
						produtoVarianteId: null,
						signedQuantity: productQuantityDelta,
						movementType: "AJUSTE",
						reason: "Ajuste manual via edição do produto",
						unitCost: null,
						validateSufficientStock: false,
					});
				}
			} else {
				await tx
					.update(products)
					.set({ quantidade: input.product.quantidade })
					.where(and(eq(products.id, input.productId), eq(products.organizacaoId, userOrgId)));
			}
		}

		await upsertScopedProductFiscalProfiles({
			tx,
			userOrgId,
			userHasFiscalConfigurePermission,
			productId: input.productId,
			variantId: null,
			profiles: input.productFiscalProfiles,
		});

		// Upsert dos eixos/valores de variação antes das variantes, para resolver as junções.
		const { optionRefToId, valueRefToId } = await upsertProductOptions({
			tx,
			userOrgId,
			productId: input.productId,
			options: input.productOptions,
		});

		for (const variant of input.productVariants) {
			if (variant.id && variant.deletar) {
				await tx
					.update(productVariants)
					.set({ ativo: false })
					.where(and(eq(productVariants.id, variant.id), eq(productVariants.produtoId, input.productId), eq(productVariants.organizacaoId, userOrgId)));
				await tx
					.update(productFiscalProfiles)
					.set({ ativo: false })
					.where(
						and(
							eq(productFiscalProfiles.organizacaoId, userOrgId),
							eq(productFiscalProfiles.produtoId, input.productId),
							eq(productFiscalProfiles.produtoVarianteId, variant.id),
						),
					);
				continue;
			}

			let variantId = variant.id ?? null;

			if (variantId) {
				// Mesmo tratamento do produto: saldo travado, flag persistido antes, delta via AJUSTE.
				const [currentVariantState] = await tx
					.select({ quantidade: productVariants.quantidade })
					.from(productVariants)
					.where(and(eq(productVariants.id, variantId), eq(productVariants.produtoId, input.productId), eq(productVariants.organizacaoId, userOrgId)))
					.for("update");
				if (!currentVariantState) throw new createHttpError.NotFound("Variante do produto não encontrada.");

				await tx
					.update(productVariants)
					.set({
						nome: variant.nome,
						codigo: variant.codigo,
						imagemCapaUrl: variant.imagemCapaUrl,
						precoVenda: variant.precoVenda,
						precoCusto: variant.precoCusto,
						rastreamentoEstoqueAtivo: variant.rastreamentoEstoqueAtivo,
						ativo: variant.ativo,
					})
					.where(and(eq(productVariants.id, variantId), eq(productVariants.produtoId, input.productId), eq(productVariants.organizacaoId, userOrgId)));

				if (variant.rastreamentoEstoqueAtivo) {
					const variantQuantityDelta = variant.quantidade - (currentVariantState.quantidade ?? 0);
					if (variantQuantityDelta !== 0) {
						await applyStockMovement({
							trx: tx,
							organizationId: userOrgId,
							userId: session.user.id,
							produtoId: input.productId,
							produtoVarianteId: variantId,
							signedQuantity: variantQuantityDelta,
							movementType: "AJUSTE",
							reason: "Ajuste manual via edição do produto",
							unitCost: null,
							validateSufficientStock: false,
						});
					}
				} else {
					await tx
						.update(productVariants)
						.set({ quantidade: variant.quantidade })
						.where(and(eq(productVariants.id, variantId), eq(productVariants.produtoId, input.productId), eq(productVariants.organizacaoId, userOrgId)));
				}
			} else {
				const [createdVariant] = await tx
					.insert(productVariants)
					.values({
						organizacaoId: userOrgId,
						produtoId: input.productId,
						nome: variant.nome,
						codigo: variant.codigo,
						imagemCapaUrl: variant.imagemCapaUrl,
						precoVenda: variant.precoVenda,
						precoCusto: variant.precoCusto,
						quantidade: variant.quantidade,
						rastreamentoEstoqueAtivo: variant.rastreamentoEstoqueAtivo,
						ativo: variant.ativo,
					})
					.returning({ id: productVariants.id });

				if (!createdVariant?.id) {
					throw new createHttpError.InternalServerError("Erro ao criar variante do produto.");
				}

				variantId = createdVariant.id;

				// Variante criada pela edição do produto ganha a mesma transação de inicialização que a
				// rota dedicada de variantes escreve — sem isso o saldo inicial nasceria fora do
				// livro-razão.
				if (variant.rastreamentoEstoqueAtivo && variant.quantidade > 0) {
					await tx.insert(productStockTransactions).values({
						organizacaoId: userOrgId,
						produtoId: input.productId,
						produtoVarianteId: variantId,
						quantidade: variant.quantidade,
						saldoAnterior: 0,
						saldoPosterior: variant.quantidade,
						motivo: "Inicialização do estoque",
						tipo: "AJUSTE",
						operadorId: session.user.id,
					});
				}
			}

			await syncVariantOptionValues({
				tx,
				userOrgId,
				variantId,
				refs: variant.opcoesValores,
				optionRefToId,
				valueRefToId,
			});

			for (const [addOnIndex, addOn] of variant.addOns.entries()) {
				await upsertScopedProductAddOn({
					tx,
					userOrgId,
					productId: input.productId,
					variantId,
					order: addOnIndex,
					addOn,
				});
			}

			// Variants inherit the product-level fiscal profile.
		}

		for (const [addOnIndex, addOn] of input.productAddOns.entries()) {
			await upsertScopedProductAddOn({
				tx,
				userOrgId,
				productId: input.productId,
				variantId: null,
				order: addOnIndex,
				addOn,
			});
		}

		return updatedProduct.updatedId;
	});

	const updatedProductId = transactionReturn;
	if (!updatedProductId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar produto.");
	return {
		data: {
			updatedId: updatedProductId,
		},
		message: "Produto atualizado com sucesso.",
	};
}
export type TUpdateProductOutput = Awaited<ReturnType<typeof updateProduct>>;
const updateProductHandler: PagesRouteHandler<TUpdateProductOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = UpdateProductInputSchema.parse(req.body);
	const data = await updateProduct({ session: sessionUser, input });
	// Propaga nome/descrição/preço/disponibilidade para as lojas iFood onde o produto está
	// vinculado. Assíncrono de propósito: o cadastro não pode falhar por indisponibilidade do
	// iFood — falhas ficam no vínculo (status ERRO) e o cron diário recupera.
	schedulePushForProduct({ orgId: sessionUser.membership!.organizacao.id, produtoId: input.productId });
	return res.status(200).json(data);
};

// ========== CREATE PRODUCT ==========

const CreateProductAddOnInputSchema = ProductAddOnSchema.omit({ organizacaoId: true }).extend({
	opcoes: z.array(
		ProductAddOnOptionSchema.omit({
			organizacaoId: true,
			produtoAddOnId: true,
		}).extend({
			produtoConsumo: z.string().optional().nullable(),
		}),
	),
});

// Referência de valor de eixo dentro de uma variante recém-criada (por referenciaId local).
const CreateProductVariantOptionValueInputSchema = z.object({
	opcaoReferenciaId: z.string({ invalid_type_error: "Tipo não válido para referência do eixo." }),
	valorReferenciaId: z.string({ invalid_type_error: "Tipo não válido para referência do valor." }),
});

const CreateProductOptionValueInputSchema = ProductOptionValueSchema.omit({ organizacaoId: true, opcaoId: true }).extend({
	referenciaId: z.string({ invalid_type_error: "Tipo não válido para referência do valor." }),
});

const CreateProductOptionInputSchema = ProductOptionSchema.omit({ organizacaoId: true, produtoId: true }).extend({
	referenciaId: z.string({ invalid_type_error: "Tipo não válido para referência do eixo." }),
	valores: z.array(CreateProductOptionValueInputSchema),
});

const CreateProductVariantInputSchema = ProductVariantSchema.omit({
	organizacaoId: true,
	produtoId: true,
}).extend({
	imagemCapaUrl: z.string().optional().nullable(),
	addOns: z.array(CreateProductAddOnInputSchema),
	perfisFiscais: z.array(ProductFiscalProfileSchema.omit({ organizacaoId: true, produtoId: true, produtoVarianteId: true })),
	opcoesValores: z.array(CreateProductVariantOptionValueInputSchema).default([]),
});

const CreateProductInputSchema = z.object({
	product: ProductSchema.omit({ organizacaoId: true }),
	productVariants: z.array(CreateProductVariantInputSchema),
	productOptions: z.array(CreateProductOptionInputSchema).default([]),
	productAddOns: z.array(CreateProductAddOnInputSchema),
	productFiscalProfiles: z.array(ProductFiscalProfileSchema.omit({ organizacaoId: true, produtoId: true, produtoVarianteId: true })),
});

export type TCreateProductInput = z.infer<typeof CreateProductInputSchema>;

async function createProduct({ session, input }: { session: TAuthUserSession; input: TCreateProductInput }) {
	const userMembership = session.membership;
	if (!userMembership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const userOrgId = userMembership.organizacao.id;
	const userHasFiscalConfigurePermission = userMembership.permissoes.fiscal.configurar;

	console.log("[INFO] [CREATE PRODUCT] Input:", JSON.stringify(input, null, 2));

	const transactionReturn = await db.transaction(async (tx) => {
		// 1. Create the main product
		const [createdProduct] = await tx
			.insert(products)
			.values({
				organizacaoId: userOrgId,
				vendavel: input.product.vendavel,
				nome: input.product.nome,
				descricao: input.product.descricao,
				codigo: input.product.codigo,
				unidade: input.product.unidade,
				ncm: input.product.ncm,
				tipo: input.product.tipo,
				grupo: input.product.grupo,
				imagemCapaUrl: input.product.imagemCapaUrl,
				precoVenda: input.product.precoVenda,
				precoCusto: input.product.precoCusto,
				quantidade: input.product.quantidade,
				rastreamentoEstoqueAtivo: input.product.rastreamentoEstoqueAtivo,
				baixaEstoqueModo: input.product.baixaEstoqueModo,
				fichaTecnicaReceitaId: input.product.fichaTecnicaReceitaId,
			})
			.returning({ id: products.id });

		if (!createdProduct?.id) throw new createHttpError.InternalServerError("Erro ao criar o produto.");

		const productId = createdProduct.id;

		// 1.1 Checking if product allows stock tracking and if quantity is greater than 0
		if (input.product.rastreamentoEstoqueAtivo && input.product.quantidade && input.product.quantidade > 0) {
			// If that is the case, we gotta create the initial manual stock transaction for the product
			await tx.insert(productStockTransactions).values({
				organizacaoId: userOrgId,
				produtoId: productId,
				produtoVarianteId: null,
				quantidade: input.product.quantidade,
				saldoAnterior: 0,
				saldoPosterior: input.product.quantidade,
				motivo: "Inicialização do estoque",
				tipo: "AJUSTE",
				operadorId: session.user.id,
			});
		}

		const willCreateAnyFiscalProfiles = input.productFiscalProfiles.length > 0;
		if (willCreateAnyFiscalProfiles && !userHasFiscalConfigurePermission) {
			console.warn("[WARN] [CREATE PRODUCT] User does not have permission to configure fiscal profiles.");
			throw new createHttpError.Forbidden("Você não possui permissão para configurar perfis fiscais.");
		}
		for (const profile of input.productFiscalProfiles) {
			await tx.insert(productFiscalProfiles).values({
				organizacaoId: userOrgId,
				produtoId: productId,
				produtoVarianteId: null,
				...profile,
			});
		}

		// 1.2 Create variant option axes and their values, tracking referenciaId -> real id.
		const optionRefToId = new Map<string, string>();
		const valueRefToId = new Map<string, string>();
		for (const option of input.productOptions) {
			const [createdOption] = await tx
				.insert(productOptions)
				.values({ organizacaoId: userOrgId, produtoId: productId, nome: option.nome, tipo: option.tipo, ordem: option.ordem })
				.returning({ id: productOptions.id });
			if (!createdOption?.id) throw new createHttpError.InternalServerError("Erro ao criar eixo de variação.");
			optionRefToId.set(option.referenciaId, createdOption.id);

			for (const value of option.valores) {
				const [createdValue] = await tx
					.insert(productOptionValues)
					.values({
						organizacaoId: userOrgId,
						opcaoId: createdOption.id,
						nome: value.nome,
						valorAuxiliar: value.valorAuxiliar ?? null,
						imagemCapaUrl: value.imagemCapaUrl ?? null,
						ordem: value.ordem,
					})
					.returning({ id: productOptionValues.id });
				if (!createdValue?.id) throw new createHttpError.InternalServerError("Erro ao criar valor de variação.");
				valueRefToId.set(value.referenciaId, createdValue.id);
			}
		}

		const insertedProductVariantIds = [];
		const insertedProductAddOnIds = [];
		// 2. Create product variants (if any)
		for (const variant of input.productVariants) {
			const [createdVariant] = await tx
				.insert(productVariants)
				.values({
					organizacaoId: userOrgId,
					produtoId: productId,
					nome: variant.nome,
					codigo: variant.codigo,
					imagemCapaUrl: variant.imagemCapaUrl,
					precoVenda: variant.precoVenda,
					precoCusto: variant.precoCusto,
					quantidade: variant.quantidade,
					rastreamentoEstoqueAtivo: variant.rastreamentoEstoqueAtivo,
					ativo: variant.ativo,
				})
				.returning({ id: productVariants.id });

			if (!createdVariant?.id) throw new createHttpError.InternalServerError("Erro ao criar variante do produto.");

			insertedProductVariantIds.push(createdVariant.id);

			// 2.0 Link the variant to its option-value combination (Cor: Preto, Tamanho: G).
			for (const ref of variant.opcoesValores) {
				const opcaoId = optionRefToId.get(ref.opcaoReferenciaId);
				const opcaoValorId = valueRefToId.get(ref.valorReferenciaId);
				if (!opcaoId || !opcaoValorId) continue; // referência a um eixo/valor que não foi enviado
				await tx.insert(productVariantOptionValues).values({
					organizacaoId: userOrgId,
					produtoVarianteId: createdVariant.id,
					opcaoId,
					opcaoValorId,
				});
			}

			// 2.1 Checking if variant allows stock tracking and if quantity is greater than 0
			if (variant.rastreamentoEstoqueAtivo && variant.quantidade && variant.quantidade > 0) {
				// If that is the case, we gotta create the initial manual stock transaction for the variant
				await tx.insert(productStockTransactions).values({
					organizacaoId: userOrgId,
					produtoId: productId,
					produtoVarianteId: createdVariant.id,
					quantidade: variant.quantidade,
					saldoAnterior: 0,
					saldoPosterior: variant.quantidade,
					motivo: "Inicialização do estoque",
					tipo: "AJUSTE",
					operadorId: session.user.id,
				});
			}
			// 2.2 Create variant add-ons (if any)
			for (const [addOnIndex, addOn] of variant.addOns.entries()) {
				const [createdAddOn] = await tx
					.insert(productAddOns)
					.values({
						organizacaoId: userOrgId,
						nome: addOn.nome,
						internoNome: addOn.internoNome,
						minOpcoes: addOn.minOpcoes,
						maxOpcoes: addOn.maxOpcoes,
						ativo: addOn.ativo,
					})
					.returning({ id: productAddOns.id });

				if (!createdAddOn?.id) throw new createHttpError.InternalServerError("Erro ao criar grupo de adicionais da variante.");

				insertedProductAddOnIds.push(createdAddOn.id);

				// Create options for this add-on
				for (const option of addOn.opcoes) {
					await tx.insert(productAddOnOptions).values({
						organizacaoId: userOrgId,
						produtoAddOnId: createdAddOn.id,
						nome: option.nome,
						codigo: option.codigo,
						precoDelta: option.precoDelta,
						maxQtdePorItem: option.maxQtdePorItem,
						ativo: option.ativo,
						produtoId: option.produtoId,
						produtoVarianteId: option.produtoVarianteId,
						quantidadeConsumo: option.quantidadeConsumo,
					});
				}

				// 2.2 Create the reference linking product and the variant to the add-on
				await tx.insert(productAddOnReferences).values({
					produtoId: productId,
					ordem: addOnIndex,
					produtoAddOnId: createdAddOn.id,
					produtoVarianteId: createdVariant.id,
				});
			}

			// Variants inherit the product-level fiscal profile.
		}

		// 3. Create product add-ons (at product level) and link them
		for (const [addOnIndex, addOn] of input.productAddOns.entries()) {
			const [createdAddOn] = await tx
				.insert(productAddOns)
				.values({
					organizacaoId: userOrgId,
					nome: addOn.nome,
					internoNome: addOn.internoNome,
					minOpcoes: addOn.minOpcoes,
					maxOpcoes: addOn.maxOpcoes,
					ativo: addOn.ativo,
				})
				.returning({ id: productAddOns.id });

			if (!createdAddOn?.id) throw new createHttpError.InternalServerError("Erro ao criar grupo de adicionais do produto.");

			insertedProductAddOnIds.push(createdAddOn.id);
			// 3.1 Create options for this add-on
			for (const option of addOn.opcoes) {
				await tx.insert(productAddOnOptions).values({
					organizacaoId: userOrgId,
					produtoAddOnId: createdAddOn.id,
					nome: option.nome,
					codigo: option.codigo,
					precoDelta: option.precoDelta,
					maxQtdePorItem: option.maxQtdePorItem,
					ativo: option.ativo,
					produtoId: option.produtoId,
					produtoVarianteId: option.produtoVarianteId,
					quantidadeConsumo: option.quantidadeConsumo,
				});
			}

			// 3.2 Create the reference linking product to add-on
			await tx.insert(productAddOnReferences).values({
				produtoId: productId,
				produtoAddOnId: createdAddOn.id,
				ordem: addOnIndex,
			});
		}

		return {
			insertedProductId: productId,
			insertedProductVariantIds: insertedProductVariantIds,
			insertedProductAddOnIds: insertedProductAddOnIds,
		};
	});

	return {
		data: {
			productId: transactionReturn.insertedProductId,
			productVariantIds: transactionReturn.insertedProductVariantIds,
			productAddOnIds: transactionReturn.insertedProductAddOnIds,
		},
		message: "Produto criado com sucesso.",
	};
}

export type TCreateProductOutput = Awaited<ReturnType<typeof createProduct>>;

const createProductHandler: PagesRouteHandler<TCreateProductOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = CreateProductInputSchema.parse(req.body);
	const data = await createProduct({ session: sessionUser, input });
	return res.status(201).json(data);
};

const routeHandlers = {
	GET: getProductsHandler,
	PUT: updateProductHandler,
	POST: createProductHandler,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
export const PUT = appApiHandler({
	PUT: (request) => runPagesRouteHandler({ request, handler: routeHandlers.PUT! }),
});
export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});
