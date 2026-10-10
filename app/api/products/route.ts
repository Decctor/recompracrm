import { GetProductsDefaultInputSchema, buildProductFilterConditions, queryProductsList, type TGetProductsDefaultInput } from "@/lib/products/list";
export type { TGetProductsDefaultInput } from "@/lib/products/list";
import { buildProductSearch, withProductSearch, type ProductSearchDatabase } from "@/lib/products/search";
import { NextResponse, type NextRequest } from "next/server";
import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { scheduleAddOnGroupPush, schedulePushForProduct } from "@/lib/integrations/ifood/sync/queue";
import type { TAuthUserSession } from "@/lib/authentication/types";
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
	productChannelSettings,
	productFiscalProfiles,
	productOptionValues,
	productOptions,
	productStockLots,
	productStockTransactions,
	productVariantOptionValues,
	productVariants,
	products,
	salesChannels,
} from "@/services/drizzle/schema";
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { upsertProductAddOnOptions } from "@/lib/products/add-on-options";
import { buildSalePriceUpdate } from "@/lib/products/price-snapshot";
import { withProductUpdateStamp } from "@/lib/products/update-stamp";
import { splitChannelSettingNodes, validateChannelSettingNodes } from "@/lib/products/sales-channels";
import createHttpError from "http-errors";
import { z } from "zod";

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
// Modo "stock": visão operacional de estoque. Retorna, por produto, o saldo atual, o preço unitário, a movimentação
// (entradas/saídas) dentro do período filtrado e o lote ativo prioritário (FEFO — vence primeiro) com a contagem de lotes ativos.
async function getProductsStockView({ input, userOrgId }: { input: TGetProductsDefaultInput; userOrgId: string }, db: ProductSearchDatabase) {
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
			.orderBy(...(input.search.length ? [desc(buildProductSearch(input.search, products).relevance)] : []), orderByClause, asc(products.id))
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
	return withProductSearch(db, "search" in input ? input.search : [], (database) => queryProducts({ input, session }, database));
}

async function queryProducts({ input, session }: GetProductsParams, db: ProductSearchDatabase) {
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
				fornecedorPrincipal: {
					columns: { id: true, nome: true, cpfCnpj: true, telefone: true, email: true, ativo: true },
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
		return getProductsStockView({ input, userOrgId }, db);
	}

	return queryProductsList({ input, userOrgId }, db);
}

export type TGetProductsOutput = Awaited<ReturnType<typeof getProducts>>;
export type TGetProductsOutputDefault = Exclude<TGetProductsOutput["data"]["default"], undefined>;
export type TGetProductsOutputById = Exclude<TGetProductsOutput["data"]["byId"], undefined>;
export type TGetProductsOutputStock = Exclude<TGetProductsOutput["data"]["stock"], undefined>;

async function getProductsRoute(request: NextRequest) {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = GetProductsInputSchema.parse({
		page: request.nextUrl.searchParams.get("page") ?? undefined,
		id: request.nextUrl.searchParams.get("id") ?? undefined,
		search: request.nextUrl.searchParams.get("search") ?? undefined,
		groups: request.nextUrl.searchParams.get("groups") ?? undefined,
		statsPeriodAfter: request.nextUrl.searchParams.get("statsPeriodAfter") ?? undefined,
		statsPeriodBefore: request.nextUrl.searchParams.get("statsPeriodBefore") ?? undefined,
		statsSellerIds: request.nextUrl.searchParams.get("statsSellerIds") ?? undefined,
		statsIntegrationsIds: request.nextUrl.searchParams.get("statsIntegrationsIds") ?? undefined,
		statsExcludedSalesIds: request.nextUrl.searchParams.get("statsExcludedSalesIds") ?? undefined,
		statsTotalMin: request.nextUrl.searchParams.get("statsTotalMin") ?? undefined,
		statsTotalMax: request.nextUrl.searchParams.get("statsTotalMax") ?? undefined,
		stockStatus: request.nextUrl.searchParams.get("stockStatus") ?? undefined,
		trackedOnly: request.nextUrl.searchParams.get("trackedOnly") ?? undefined,
		mainSupplierIds: request.nextUrl.searchParams.get("mainSupplierIds") ?? undefined,
		withoutMainSupplier: request.nextUrl.searchParams.get("withoutMainSupplier") ?? undefined,
		abcClasses: request.nextUrl.searchParams.get("abcClasses") ?? undefined,
		priceMin: request.nextUrl.searchParams.get("priceMin") ?? undefined,
		priceMax: request.nextUrl.searchParams.get("priceMax") ?? undefined,
		orderByField: request.nextUrl.searchParams.get("orderByField") ?? undefined,
		orderByDirection: request.nextUrl.searchParams.get("orderByDirection") ?? undefined,
		mode: request.nextUrl.searchParams.get("mode") ?? undefined,
		resultLimit: request.nextUrl.searchParams.get("resultLimit") ?? undefined,
	});
	const data = await getProducts({ input, session: sessionUser });
	return NextResponse.json(data);
}

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
	// Opcional na edição: ausente = não mexer no preço da variante existente (o cliente só envia o que
	// o usuário alterou, para não reverter um preço trocado depois do carregamento da página).
	// Variante nova exige o preço — validado no insert.
	precoVenda: z
		.number({
			invalid_type_error: "Tipo não válido para preço de venda da variante.",
		})
		.optional(),
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
			.select({ quantidade: products.quantidade, precoVenda: products.precoVenda, precoVendaAnterior: products.precoVendaAnterior })
			.from(products)
			.where(and(eq(products.id, input.productId), eq(products.organizacaoId, userOrgId)))
			.for("update");
		if (!currentProductState) throw new createHttpError.NotFound("Produto não encontrado.");

		// `quantidade` fica fora do update direto: com rastreamento ativo, o saldo só muda via
		// movimentação de estoque (abaixo), preservando o livro-razão.
		const [updatedProduct] = await tx
			.update(products)
			.set(
				withProductUpdateStamp({
					vendavel: input.product.vendavel,
					ativo: input.product.ativo,
					nome: input.product.nome,
					descricao: input.product.descricao,
					codigo: input.product.codigo,
					unidade: input.product.unidade,
					ncm: input.product.ncm,
					tipo: input.product.tipo,
					grupo: input.product.grupo,
					imagemCapaUrl: input.product.imagemCapaUrl,
					// Preço atual lido sob a mesma trava: o snapshot não pode usar um preço que outra escrita já trocou.
					...buildSalePriceUpdate({
						current: currentProductState,
						// `undefined` = a seção não edita preço: nada de reverter para o valor lido nem de snapshot.
						next: { precoVenda: input.product.precoVenda, precoVendaAnterior: input.product.precoVendaAnterior },
					}),
					precoCusto: input.product.precoCusto,
					codigoBarras: input.product.codigoBarras,
					conteudoQuantidade: input.product.conteudoQuantidade,
					conteudoUnidade: input.product.conteudoUnidade,
					rastreamentoEstoqueAtivo: input.product.rastreamentoEstoqueAtivo,
					baixaEstoqueModo: input.product.baixaEstoqueModo,
					fichaTecnicaReceitaId: input.product.fichaTecnicaReceitaId,
				}),
			)
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
					.select({
						quantidade: productVariants.quantidade,
						precoVenda: productVariants.precoVenda,
						precoVendaAnterior: productVariants.precoVendaAnterior,
					})
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
						...buildSalePriceUpdate({
							current: currentVariantState,
							next: { precoVenda: variant.precoVenda, precoVendaAnterior: variant.precoVendaAnterior },
						}),
						precoCusto: variant.precoCusto,
						codigoBarras: variant.codigoBarras,
						conteudoQuantidade: variant.conteudoQuantidade,
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
				if (variant.precoVenda === undefined) throw new createHttpError.BadRequest("Preço de venda da variante não informado.");
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
						codigoBarras: variant.codigoBarras,
						conteudoQuantidade: variant.conteudoQuantidade,
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
	// vinculado. Assíncrono de propósito (fila): o cadastro não pode falhar por indisponibilidade
	// do iFood — falhas ficam no vínculo (status ERRO), visíveis na tela de vínculos.
	await schedulePushForProduct({ orgId: sessionUser.membership!.organizacao.id, produtoId: input.productId });
	// O push do produto não leva as opções dos grupos de adicionais — elas têm vínculo próprio e o
	// push do GRUPO é que as propaga para todas as cópias no iFood (o mesmo da aba Adicionais).
	// Diferencial por snapshot: grupo sem mudança de opção não chama o iFood.
	for (const produtoAddOnId of editedAddOnGroupIds(input)) {
		await scheduleAddOnGroupPush({ orgId: sessionUser.membership!.organizacao.id, produtoAddOnId });
	}
	return res.status(200).json(data);
};

/**
 * Grupos cujo conteúdo este save pode ter mudado: os enviados com id e não desanexados, no produto e
 * nas variantes. Grupo novo ainda não tem vínculo no iFood; desanexar não muda o grupo em si.
 */
function editedAddOnGroupIds(input: TUpdateProductInput) {
	const addOns = [...input.productAddOns, ...input.productVariants.flatMap((variant) => variant.addOns ?? [])];
	return [...new Set(addOns.filter((addOn) => addOn.id && !addOn.deletar).map((addOn) => addOn.id as string))];
}

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
	// Chave local da variante, para que outros blocos do payload (canais) apontem para ela antes
	// de existir um id. Opcional: quem não configura canais não precisa dela.
	referenciaId: z.string({ invalid_type_error: "Tipo não válido para referência da variante." }).optional(),
	imagemCapaUrl: z.string().optional().nullable(),
	addOns: z.array(CreateProductAddOnInputSchema),
	perfisFiscais: z.array(ProductFiscalProfileSchema.omit({ organizacaoId: true, produtoId: true, produtoVarianteId: true })),
	opcoesValores: z.array(CreateProductVariantOptionValueInputSchema).default([]),
});

// Override de canal para um nó (canal × produto | variante) do produto novo. Mesmo contrato do
// PUT /api/products/channel-settings, com a variante apontada pela referência local.
const CreateProductChannelSettingInputSchema = z.object({
	canalVendaId: z
		.string({
			required_error: "ID do canal de venda não informado.",
			invalid_type_error: "Tipo não válido para ID do canal de venda.",
		})
		.min(1, { message: "ID do canal de venda não informado." }),
	produtoVarianteReferenciaId: z
		.string({
			invalid_type_error: "Tipo não válido para referência da variante.",
		})
		.optional()
		.nullable(),
	disponivel: z
		.boolean({
			invalid_type_error: "Tipo não válido para disponibilidade no canal.",
		})
		.optional()
		.nullable(),
	precoVenda: z
		.number({
			invalid_type_error: "Tipo não válido para preço de venda no canal.",
		})
		.nonnegative({ message: "O preço de venda no canal não pode ser negativo." })
		.optional()
		.nullable(),
});

const CreateProductInputSchema = z.object({
	product: ProductSchema.omit({ organizacaoId: true }),
	productVariants: z.array(CreateProductVariantInputSchema),
	productOptions: z.array(CreateProductOptionInputSchema).default([]),
	productAddOns: z.array(CreateProductAddOnInputSchema),
	productFiscalProfiles: z.array(ProductFiscalProfileSchema.omit({ organizacaoId: true, produtoId: true, produtoVarianteId: true })),
	// Opcional para os chamadores que não montam a matriz de canais (importação de compra, etc.).
	productChannelSettings: z.array(CreateProductChannelSettingInputSchema).optional(),
});

export type TCreateProductInput = z.infer<typeof CreateProductInputSchema>;

async function createProduct({ session, input }: { session: TAuthUserSession; input: TCreateProductInput }) {
	const userMembership = session.membership;
	if (!userMembership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const userOrgId = userMembership.organizacao.id;
	const userHasFiscalConfigurePermission = userMembership.permissoes.fiscal.configurar;

	console.log("[INFO] [CREATE PRODUCT] Input:", JSON.stringify(input, null, 2));

	// 0. Channel overrides are validated before the transaction opens: the rules are the same the
	//    PUT of channel settings applies, over the variants' local references instead of real ids.
	const channelSettingsInput = input.productChannelSettings ?? [];
	const channelSettingNodes = channelSettingsInput.map((setting) => ({
		canalVendaId: setting.canalVendaId,
		produtoVarianteId: setting.produtoVarianteReferenciaId ?? null,
		disponivel: setting.disponivel ?? null,
		precoVenda: setting.precoVenda ?? null,
	}));
	if (channelSettingNodes.length > 0) {
		if (!userMembership.organizacao.configuracao.recursos.erp.acesso) {
			throw new createHttpError.Forbidden("Sua organização não possui acesso ao módulo de ERP.");
		}
		const channelIds = [...new Set(channelSettingNodes.map((setting) => setting.canalVendaId))];
		const ownedChannels = await db
			.select({ id: salesChannels.id })
			.from(salesChannels)
			.where(and(eq(salesChannels.organizacaoId, userOrgId), inArray(salesChannels.id, channelIds)));
		const validationError = validateChannelSettingNodes({
			settings: channelSettingNodes,
			ownedChannelIds: new Set(ownedChannels.map((channel) => channel.id)),
			variantIds: new Set(input.productVariants.flatMap((variant) => (variant.referenciaId ? [variant.referenciaId] : []))),
			hasVariants: input.productVariants.length > 0,
		});
		if (validationError) throw new createHttpError.BadRequest(validationError);
	}

	const transactionReturn = await db.transaction(async (tx) => {
		// 1. Create the main product
		const [createdProduct] = await tx
			.insert(products)
			.values({
				organizacaoId: userOrgId,
				vendavel: input.product.vendavel,
				ativo: input.product.ativo,
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
				codigoBarras: input.product.codigoBarras,
				conteudoQuantidade: input.product.conteudoQuantidade,
				conteudoUnidade: input.product.conteudoUnidade,
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
		// Local reference -> real id, so the channel overrides can point at the variants just created.
		const variantRefToId = new Map<string, string>();
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
					codigoBarras: variant.codigoBarras,
					conteudoQuantidade: variant.conteudoQuantidade,
					quantidade: variant.quantidade,
					rastreamentoEstoqueAtivo: variant.rastreamentoEstoqueAtivo,
					ativo: variant.ativo,
				})
				.returning({ id: productVariants.id });

			if (!createdVariant?.id) throw new createHttpError.InternalServerError("Erro ao criar variante do produto.");

			insertedProductVariantIds.push(createdVariant.id);
			if (variant.referenciaId) variantRefToId.set(variant.referenciaId, createdVariant.id);

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

		// 4. Channel overrides. The row is sparse: a node with neither availability nor price
		//    inherits and is simply not written (the PUT would delete it; here there is nothing yet).
		const { upserts: channelUpserts } = splitChannelSettingNodes(channelSettingNodes);
		if (channelUpserts.length > 0) {
			await tx.insert(productChannelSettings).values(
				channelUpserts.map((setting) => ({
					organizacaoId: userOrgId,
					produtoId: productId,
					canalVendaId: setting.canalVendaId,
					// The reference was validated against the payload's variants, so it always resolves.
					produtoVarianteId: setting.produtoVarianteId ? (variantRefToId.get(setting.produtoVarianteId) ?? null) : null,
					disponivel: setting.disponivel,
					precoVenda: setting.precoVenda,
				})),
			);
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
	PUT: updateProductHandler,
	POST: createProductHandler,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: getProductsRoute,
});
export const PUT = appApiHandler({
	PUT: (request) => runPagesRouteHandler({ request, handler: routeHandlers.PUT! }),
});
export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});
