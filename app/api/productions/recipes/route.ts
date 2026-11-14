import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canCreateProductions, canDeleteProductions, canEditProductions } from "@/lib/permissions/productions";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { handleSimpleChildRowsProcessing } from "@/lib/db-utils";
import { calculateValuation, getProductPricingMap } from "@/lib/productions/valuation";
import { ProductionRecipeBaseSchema, ProductionRecipeInputSchema, ProductionRecipeOutputBaseSchema } from "@/schemas/productions";
import { db } from "@/services/drizzle";
import { getPrimaryRecipeOutput } from "@/lib/productions/builder-math";
import { ProductionRecipesSortFieldEnum, SortDirectionEnum } from "@/schemas/enums";
import {
	productStockLots,
	productionRecipeInputs,
	productionRecipeOutputs,
	productionRecipes,
	productions,
	productVariants,
	products,
} from "@/services/drizzle/schema";
import { and, eq, gt, inArray, isNull, max, ne, or, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const GetProductionRecipesInputSchema = z.object({
	id: z
		.string({
			invalid_type_error: "Tipo inválido para ID da receita.",
		})
		.optional()
		.nullable(),
	page: z
		.string({
			invalid_type_error: "Tipo inválido para página.",
		})
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
	search: z
		.string({
			invalid_type_error: "Tipo inválido para busca.",
		})
		.optional()
		.nullable(),
	activeOnly: z
		.string({
			invalid_type_error: "Tipo inválido para filtro de ativo.",
		})
		.optional()
		.nullable()
		.transform((value) => value !== "false"),
	orderBy: z
		.string({ invalid_type_error: "Tipo inválido para ordenação." })
		.optional()
		.nullable()
		.transform((value) => value || "ULTIMA_PRODUCAO")
		.pipe(ProductionRecipesSortFieldEnum),
	orderByDirection: z
		.string({ invalid_type_error: "Tipo inválido para direção de ordenação." })
		.optional()
		.nullable()
		.transform((value) => value || "desc")
		.pipe(SortDirectionEnum),
	pageSize: z
		.string({ invalid_type_error: "Tipo inválido para tamanho da página." })
		.optional()
		.nullable()
		.transform((value) => Math.min(Math.max(value ? Number(value) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)),
});
export type TGetProductionRecipesInput = z.infer<typeof GetProductionRecipesInputSchema>;
export type TGetProductionRecipeByIdInput = Pick<TGetProductionRecipesInput, "id">;
export type TGetProductionRecipesDefaultInput = Omit<TGetProductionRecipesInput, "id">;

const ProductionRecipePayloadSchema = ProductionRecipeBaseSchema.omit({ organizacaoId: true, dataInsercao: true }).superRefine((value, ctx) => {
	if (value.previsaoTempoValor != null && !value.previsaoTempoMedida) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["previsaoTempoMedida"],
			message: "Medida da previsão de tempo não informada.",
		});
	}
	if (value.previsaoTempoMedida && value.previsaoTempoValor == null) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["previsaoTempoValor"],
			message: "Valor da previsão de tempo não informado.",
		});
	}
});

const ProductionRecipeOutputPayloadSchema = ProductionRecipeOutputBaseSchema.omit({ organizacaoId: true, receitaId: true }).superRefine(
	(value, ctx) => {
		if (value.prazoValidadeValor != null && !value.prazoValidadeMedida) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["prazoValidadeMedida"],
				message: "Medida do prazo de validade não informada.",
			});
		}
		if (value.prazoValidadeMedida && value.prazoValidadeValor == null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["prazoValidadeValor"],
				message: "Valor do prazo de validade não informado.",
			});
		}
	},
);

const CreateProductionRecipeInputSchema = z.object({
	productionRecipe: ProductionRecipePayloadSchema,
	productionRecipeInputs: z.array(ProductionRecipeInputSchema.omit({ organizacaoId: true, receitaId: true })).min(1, {
		message: "Informe pelo menos um insumo da receita.",
	}),
	productionRecipeOutputs: z.array(ProductionRecipeOutputPayloadSchema).min(1, {
		message: "Informe pelo menos uma saída da receita.",
	}),
});
export type TCreateProductionRecipeInput = z.infer<typeof CreateProductionRecipeInputSchema>;

const UpdateProductionRecipeInputSchema = z.object({
	productionRecipeId: z.string({
		required_error: "ID da receita não informado.",
		invalid_type_error: "Tipo inválido para ID da receita.",
	}),
	productionRecipe: ProductionRecipeBaseSchema.omit({ organizacaoId: true, dataInsercao: true }).partial(),
	productionRecipeInputs: z.array(
		ProductionRecipeInputSchema.omit({ organizacaoId: true, receitaId: true }).extend({
			id: z.string({ invalid_type_error: "Tipo inválido para ID do insumo." }).optional().nullable(),
			deletar: z.boolean({ invalid_type_error: "Tipo inválido para exclusão do insumo." }).optional().nullable(),
		}),
	),
	productionRecipeOutputs: z.array(
		ProductionRecipeOutputBaseSchema.omit({ organizacaoId: true, receitaId: true }).extend({
			id: z.string({ invalid_type_error: "Tipo inválido para ID da saída." }).optional().nullable(),
			deletar: z.boolean({ invalid_type_error: "Tipo inválido para exclusão da saída." }).optional().nullable(),
		}),
	),
});
export type TUpdateProductionRecipeInput = z.infer<typeof UpdateProductionRecipeInputSchema>;

const DeleteProductionRecipeInputSchema = z.object({
	productionRecipeId: z.string({
		required_error: "ID da receita não informado.",
		invalid_type_error: "Tipo inválido para ID da receita.",
	}),
});
export type TDeleteProductionRecipeInput = z.infer<typeof DeleteProductionRecipeInputSchema>;

type RecipeItemInput = {
	id?: string | null;
	deletar?: boolean | null;
	produtoId: string;
	produtoVarianteId?: string | null;
};

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

async function validateRecipeItemsOrganization({
	organizationId,
	inputs,
	outputs,
}: {
	organizationId: string;
	inputs: RecipeItemInput[];
	outputs: RecipeItemInput[];
}) {
	const activeItems = [...inputs, ...outputs].filter((item) => !item.deletar);
	const productIds = [...new Set(activeItems.map((item) => item.produtoId))];
	const variantIds = [...new Set(activeItems.map((item) => item.produtoVarianteId).filter((id): id is string => !!id))];

	const [productsResult, variantsResult] = await Promise.all([
		productIds.length > 0
			? db.query.products.findMany({
					where: and(inArray(products.id, productIds), eq(products.organizacaoId, organizationId)),
					columns: { id: true },
				})
			: [],
		variantIds.length > 0
			? db.query.productVariants.findMany({
					where: and(inArray(productVariants.id, variantIds), eq(productVariants.organizacaoId, organizationId)),
					columns: { id: true, produtoId: true },
				})
			: [],
	]);

	const productIdsFound = new Set(productsResult.map((product) => product.id));
	const variantsById = new Map(variantsResult.map((variant) => [variant.id, variant]));

	for (const item of activeItems) {
		if (!productIdsFound.has(item.produtoId)) throw new createHttpError.BadRequest("Produto da receita não encontrado.");
		if (!item.produtoVarianteId) continue;

		const variant = variantsById.get(item.produtoVarianteId);
		if (!variant) throw new createHttpError.BadRequest("Variante da receita não encontrada.");
		if (variant.produtoId !== item.produtoId) throw new createHttpError.BadRequest("Variante da receita não pertence ao produto informado.");
	}
}

type TStockKey = { produtoId: string; produtoVarianteId?: string | null };
const stockKey = (item: TStockKey) => `${item.produtoId}::${item.produtoVarianteId ?? ""}`;

/** Lotes ativos, com saldo e dentro da validade — o que pode ser reincorporado numa produção. */
function availableLotConditions(organizationId: string) {
	return and(
		eq(productStockLots.organizacaoId, organizationId),
		eq(productStockLots.status, "ATIVO"),
		gt(productStockLots.quantidadeAtual, 0),
		or(isNull(productStockLots.dataValidade), gt(productStockLots.dataValidade, new Date())),
	);
}

/** Saldo em lotes por produto+variante, numa consulta para a página inteira. */
async function getLotBalances({ organizationId, items }: { organizationId: string; items: TStockKey[] }) {
	const balances = new Map<string, number>();
	const productIds = [...new Set(items.map((item) => item.produtoId))];
	if (productIds.length === 0) return balances;

	const rows = await db
		.select({
			produtoId: productStockLots.produtoId,
			produtoVarianteId: productStockLots.produtoVarianteId,
			saldo: sum(productStockLots.quantidadeAtual).mapWith(Number),
		})
		.from(productStockLots)
		.where(and(availableLotConditions(organizationId), inArray(productStockLots.produtoId, productIds)))
		.groupBy(productStockLots.produtoId, productStockLots.produtoVarianteId);

	for (const row of rows) balances.set(stockKey(row), row.saldo ?? 0);
	return balances;
}

/** Quantas produções (não canceladas) cada receita já teve e quando foi a última. */
async function getRecipeProductionStats({ organizationId, recipeIds }: { organizationId: string; recipeIds: string[] }) {
	const stats = new Map<string, { producoes: number; dataUltimaProducao: Date | null }>();
	if (recipeIds.length === 0) return stats;

	const rows = await db
		.select({
			receitaId: productions.receitaId,
			producoes: sql<number>`count(*)`.mapWith(Number),
			dataUltimaProducao: max(sql<Date>`COALESCE(${productions.dataInicio}, ${productions.dataInsercao})`).mapWith((value) =>
				value ? new Date(value) : null,
			),
		})
		.from(productions)
		.where(and(eq(productions.organizacaoId, organizationId), inArray(productions.receitaId, recipeIds), ne(productions.status, "CANCELADA")))
		.groupBy(productions.receitaId);

	for (const row of rows) {
		if (row.receitaId) stats.set(row.receitaId, { producoes: row.producoes, dataUltimaProducao: row.dataUltimaProducao });
	}
	return stats;
}

async function getProductionRecipes({ input, session }: { input: TGetProductionRecipesInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	if (input.id) {
		const recipe = await db.query.productionRecipes.findFirst({
			where: and(eq(productionRecipes.id, input.id), eq(productionRecipes.organizacaoId, organizationId)),
			with: {
				insumos: {
					with: {
						produto: true,
						produtoVariante: true,
					},
					orderBy: (fields, { asc }) => asc(fields.id),
				},
				saidas: {
					with: {
						produto: true,
						produtoVariante: true,
					},
					orderBy: (fields, { asc }) => asc(fields.id),
				},
			},
		});
		if (!recipe) throw new createHttpError.NotFound("Receita não encontrada.");

		// Receita é molde, não fato consumado: a valoração é sempre pelos preços vigentes no catálogo.
		const pricingMap = await getProductPricingMap({ organizationId, items: [...recipe.insumos, ...recipe.saidas] });

		// Saldo da saída principal — o que o construtor oferece para reincorporar.
		const primaryOutput = getPrimaryRecipeOutput(recipe.saidas);
		const saldo = primaryOutput
			? {
					lotes: await db.query.productStockLots.findMany({
						where: and(
							availableLotConditions(organizationId),
							eq(productStockLots.produtoId, primaryOutput.produtoId),
							primaryOutput.produtoVarianteId
								? eq(productStockLots.produtoVarianteId, primaryOutput.produtoVarianteId)
								: isNull(productStockLots.produtoVarianteId),
						),
						columns: { id: true, codigoLote: true, quantidadeAtual: true, dataValidade: true, dataFabricacao: true },
						orderBy: (fields, { asc }) => [sql`${fields.dataValidade} ASC NULLS LAST`, asc(fields.dataInsercao)],
					}),
					/** Saldo geral do produto/variante, para "Sem lote específico". */
					saldoGeral: (primaryOutput.produtoVariante ? primaryOutput.produtoVariante.quantidade : primaryOutput.produto.quantidade) ?? 0,
				}
			: null;

		return {
			data: {
				byId: {
					...recipe,
					valores: calculateValuation({ inputs: recipe.insumos, outputs: recipe.saidas, pricingMap }),
					saldo,
				},
				default: undefined,
			},
			message: "Receita encontrada com sucesso.",
		};
	}

	const conditions = [eq(productionRecipes.organizacaoId, organizationId)];
	if (input.activeOnly) conditions.push(eq(productionRecipes.ativo, true));
	if (input.search) {
		// Busca pelo nome da receita ou por um insumo dela. Alias literal na subconsulta: a consulta
		// relacional reescreve as colunas do `where` para o alias da tabela raiz.
		const term = `%${input.search}%`;
		const searchCondition = or(
			sql`${productionRecipes.titulo} ILIKE ${term}`,
			sql`EXISTS (SELECT 1 FROM ${productionRecipeInputs} ri JOIN ${products} p ON p.id = ri.produto_id WHERE ri.receita_id = ${productionRecipes.id} AND p.nome ILIKE ${term})`,
		);
		if (searchCondition) conditions.push(searchCondition);
	}

	// Organizações têm dezenas de receitas, não milhares: carrega todas as que casam com o filtro e
	// ordena em memória — custo e margem são valorados pelo catálogo e não existem como coluna.
	const recipesResult = await db.query.productionRecipes.findMany({
		where: and(...conditions),
		// Projeção enxuta: o card da listagem usa apenas estes campos. Detalhes completos
		// (modoPreparo, itens com produtos/variantes) são carregados sob demanda via byId.
		columns: {
			id: true,
			titulo: true,
			descricao: true,
			imagemCapaUrl: true,
			capaIcone: true,
			capaCor: true,
			previsaoTempoMedida: true,
			previsaoTempoValor: true,
			ativo: true,
			dataInsercao: true,
		},
		with: {
			// Além da contagem, o card exibe custo e retorno esperado — daí produto, variante e
			// quantidade de cada item. Os preços vêm de uma consulta agregada da página inteira.
			insumos: { columns: { id: true, produtoId: true, produtoVarianteId: true, quantidade: true } },
			saidas: {
				columns: { id: true, produtoId: true, produtoVarianteId: true, quantidade: true, prazoValidadeMedida: true, prazoValidadeValor: true },
				with: { produto: { columns: { id: true, nome: true, unidade: true } } },
				orderBy: (fields, { asc }) => asc(fields.id),
			},
		},
	});

	const recipeIds = recipesResult.map((recipe) => recipe.id);
	const primaryOutputs = recipesResult.map((recipe) => getPrimaryRecipeOutput(recipe.saidas)).filter((output) => output != null);

	// Uma única leitura de preços, de saldos e de estatísticas para todas as receitas.
	const [pricingMap, lotBalances, productionStats] = await Promise.all([
		getProductPricingMap({ organizationId, items: recipesResult.flatMap((recipe) => [...recipe.insumos, ...recipe.saidas]) }),
		getLotBalances({ organizationId, items: primaryOutputs }),
		getRecipeProductionStats({ organizationId, recipeIds }),
	]);

	const recipesWithStats = recipesResult.map((recipe) => {
		const primaryOutput = getPrimaryRecipeOutput(recipe.saidas);
		const stats = productionStats.get(recipe.id);
		return {
			...recipe,
			valores: calculateValuation({ inputs: recipe.insumos, outputs: recipe.saidas, pricingMap }),
			producoes: stats?.producoes ?? 0,
			dataUltimaProducao: stats?.dataUltimaProducao ?? null,
			/** Saldo em lotes da saída principal — selo "Saldo" no construtor. */
			saldoLotes: primaryOutput ? (lotBalances.get(stockKey(primaryOutput)) ?? 0) : 0,
		};
	});

	const directionFactor = input.orderByDirection === "asc" ? 1 : -1;
	const sortValue = (recipe: (typeof recipesWithStats)[number]): number | string | null => {
		switch (input.orderBy) {
			case "NOME":
				return recipe.titulo.toLocaleLowerCase("pt-BR");
			case "CUSTO":
				return recipe.valores.custoTotal;
			case "MARGEM":
				return recipe.valores.margemPercentual;
			default:
				return recipe.dataUltimaProducao?.getTime() ?? null;
		}
	};
	const sortedRecipes = [...recipesWithStats].sort((a, b) => {
		const valueA = sortValue(a);
		const valueB = sortValue(b);
		// Sem valor (nunca produzida, sem retorno) vai para o fim em qualquer direção.
		if (valueA == null && valueB == null) return a.titulo.localeCompare(b.titulo, "pt-BR");
		if (valueA == null) return 1;
		if (valueB == null) return -1;
		if (typeof valueA === "string" && typeof valueB === "string") return valueA.localeCompare(valueB, "pt-BR") * directionFactor;
		return ((valueA as number) - (valueB as number)) * directionFactor;
	});

	const recipesMatched = sortedRecipes.length;
	const pageStart = (input.page - 1) * input.pageSize;

	return {
		data: {
			byId: undefined,
			default: {
				recipes: sortedRecipes.slice(pageStart, pageStart + input.pageSize),
				recipesMatched,
				totalPages: Math.max(1, Math.ceil(recipesMatched / input.pageSize)),
			},
		},
		message: "Receitas encontradas com sucesso.",
	};
}
export type TGetProductionRecipesOutput = Awaited<ReturnType<typeof getProductionRecipes>>;
export type TGetProductionRecipesOutputById = Exclude<TGetProductionRecipesOutput["data"]["byId"], undefined>;
export type TGetProductionRecipesOutputDefault = Exclude<TGetProductionRecipesOutput["data"]["default"], undefined>;

async function createProductionRecipe({ input, session }: { input: TCreateProductionRecipeInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	await validateRecipeItemsOrganization({
		organizationId,
		inputs: input.productionRecipeInputs,
		outputs: input.productionRecipeOutputs,
	});

	return await db.transaction(async (tx) => {
		const [insertedRecipe] = await tx
			.insert(productionRecipes)
			.values({
				...input.productionRecipe,
				organizacaoId: organizationId,
			})
			.returning({ id: productionRecipes.id });

		if (!insertedRecipe?.id) throw new createHttpError.InternalServerError("Erro ao criar receita de produção.");

		await tx.insert(productionRecipeInputs).values(
			input.productionRecipeInputs.map((recipeInput) => ({
				...recipeInput,
				organizacaoId: organizationId,
				receitaId: insertedRecipe.id,
			})),
		);

		await tx.insert(productionRecipeOutputs).values(
			input.productionRecipeOutputs.map((recipeOutput) => ({
				...recipeOutput,
				organizacaoId: organizationId,
				receitaId: insertedRecipe.id,
			})),
		);

		return {
			data: {
				insertedId: insertedRecipe.id,
			},
			message: "Receita de produção criada com sucesso.",
		};
	});
}
export type TCreateProductionRecipeOutput = Awaited<ReturnType<typeof createProductionRecipe>>;

async function updateProductionRecipe({ input, session }: { input: TUpdateProductionRecipeInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	await validateRecipeItemsOrganization({
		organizationId,
		inputs: input.productionRecipeInputs,
		outputs: input.productionRecipeOutputs,
	});

	return await db.transaction(async (tx) => {
		const [updatedRecipe] = await tx
			.update(productionRecipes)
			.set(input.productionRecipe)
			.where(and(eq(productionRecipes.id, input.productionRecipeId), eq(productionRecipes.organizacaoId, organizationId)))
			.returning({ id: productionRecipes.id });

		if (!updatedRecipe?.id) throw new createHttpError.NotFound("Receita não encontrada.");

		await handleSimpleChildRowsProcessing({
			trx: tx,
			table: productionRecipeInputs,
			entities: input.productionRecipeInputs,
			fatherEntityKey: "receitaId",
			fatherEntityId: updatedRecipe.id,
			organizacaoId: organizationId,
		});

		await handleSimpleChildRowsProcessing({
			trx: tx,
			table: productionRecipeOutputs,
			entities: input.productionRecipeOutputs,
			fatherEntityKey: "receitaId",
			fatherEntityId: updatedRecipe.id,
			organizacaoId: organizationId,
		});

		return {
			data: {
				updatedId: updatedRecipe.id,
			},
			message: "Receita de produção atualizada com sucesso.",
		};
	});
}
export type TUpdateProductionRecipeOutput = Awaited<ReturnType<typeof updateProductionRecipe>>;

async function deleteProductionRecipe({ input, session }: { input: TDeleteProductionRecipeInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const [updatedRecipe] = await db
		.update(productionRecipes)
		.set({ ativo: false })
		.where(and(eq(productionRecipes.id, input.productionRecipeId), eq(productionRecipes.organizacaoId, organizationId)))
		.returning({ id: productionRecipes.id });

	if (!updatedRecipe?.id) throw new createHttpError.NotFound("Receita não encontrada.");

	return {
		data: {
			deletedId: updatedRecipe.id,
		},
		message: "Receita de produção excluída com sucesso.",
	};
}
export type TDeleteProductionRecipeOutput = Awaited<ReturnType<typeof deleteProductionRecipe>>;

async function getProductionRecipesRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const searchParams = request.nextUrl.searchParams;
	const input = GetProductionRecipesInputSchema.parse({
		id: searchParams.get("id"),
		page: searchParams.get("page"),
		search: searchParams.get("search"),
		activeOnly: searchParams.get("activeOnly"),
		orderBy: searchParams.get("orderBy"),
		orderByDirection: searchParams.get("orderByDirection"),
		pageSize: searchParams.get("pageSize"),
	});
	const result = await getProductionRecipes({ input, session });
	return NextResponse.json(result);
}

async function createProductionRecipeRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canCreateProductions(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para criar fichas técnicas.");
	const input = CreateProductionRecipeInputSchema.parse(await request.json());
	const result = await createProductionRecipe({ input, session });
	return NextResponse.json(result, { status: 201 });
}

async function updateProductionRecipeRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canEditProductions(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para editar fichas técnicas.");
	const input = UpdateProductionRecipeInputSchema.parse(await request.json());
	const result = await updateProductionRecipe({ input, session });
	return NextResponse.json(result);
}

async function deleteProductionRecipeRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canDeleteProductions(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para excluir fichas técnicas.");
	const input = DeleteProductionRecipeInputSchema.parse({
		productionRecipeId: request.nextUrl.searchParams.get("productionRecipeId"),
	});
	const result = await deleteProductionRecipe({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getProductionRecipesRoute });
export const POST = appApiHandler({ POST: createProductionRecipeRoute });
export const PUT = appApiHandler({ PUT: updateProductionRecipeRoute });
export const DELETE = appApiHandler({ DELETE: deleteProductionRecipeRoute });
