import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canCreateProductions, canDeleteProductions, canEditProductions } from "@/lib/permissions/productions";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { handleSimpleChildRowsProcessing } from "@/lib/db-utils";
import { calculateValuation, getProductPricingMap } from "@/lib/productions/valuation";
import { ProductionRecipeBaseSchema, ProductionRecipeInputSchema, ProductionRecipeOutputBaseSchema } from "@/schemas/productions";
import { db } from "@/services/drizzle";
import { productionRecipeInputs, productionRecipeOutputs, productionRecipes, productVariants, products } from "@/services/drizzle/schema";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PAGE_SIZE = 20;

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

		return {
			data: {
				byId: {
					...recipe,
					valores: calculateValuation({ inputs: recipe.insumos, outputs: recipe.saidas, pricingMap }),
				},
				default: undefined,
			},
			message: "Receita encontrada com sucesso.",
		};
	}

	const conditions = [eq(productionRecipes.organizacaoId, organizationId)];
	if (input.activeOnly) conditions.push(eq(productionRecipes.ativo, true));
	if (input.search) conditions.push(sql`${productionRecipes.titulo} ILIKE '%' || ${input.search} || '%'`);

	const [totalResult, recipesResult] = await Promise.all([
		db
			.select({ total: count(productionRecipes.id) })
			.from(productionRecipes)
			.where(and(...conditions)),
		db.query.productionRecipes.findMany({
			where: and(...conditions),
			// Projeção enxuta: o card da listagem usa apenas estes campos. Detalhes completos
			// (modoPreparo, itens com produtos/variantes) são carregados sob demanda via byId.
			columns: {
				id: true,
				titulo: true,
				descricao: true,
				previsaoTempoMedida: true,
				previsaoTempoValor: true,
				dataInsercao: true,
			},
			with: {
				// Além da contagem, o card exibe custo e retorno esperado — daí produto, variante e
				// quantidade de cada item. Os preços vêm de uma consulta agregada da página inteira.
				insumos: { columns: { id: true, produtoId: true, produtoVarianteId: true, quantidade: true } },
				saidas: { columns: { id: true, produtoId: true, produtoVarianteId: true, quantidade: true } },
			},
			orderBy: (fields, { desc }) => desc(fields.dataInsercao),
			limit: PAGE_SIZE,
			offset: (input.page - 1) * PAGE_SIZE,
		}),
	]);

	const recipesMatched = Number(totalResult[0]?.total ?? 0);

	// Uma única leitura de preços para todos os itens da página, em vez de uma por receita.
	const pricingMap = await getProductPricingMap({
		organizationId,
		items: recipesResult.flatMap((recipe) => [...recipe.insumos, ...recipe.saidas]),
	});
	const recipesWithValuation = recipesResult.map((recipe) => ({
		...recipe,
		valores: calculateValuation({ inputs: recipe.insumos, outputs: recipe.saidas, pricingMap }),
	}));

	return {
		data: {
			byId: undefined,
			default: {
				recipes: recipesWithValuation,
				recipesMatched,
				totalPages: Math.max(1, Math.ceil(recipesMatched / PAGE_SIZE)),
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
	});
	const result = await getProductionRecipes({ input, session });
	return NextResponse.json(result);
}

async function createProductionRecipeRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canCreateProductions(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para criar fichas técnicas.");
	const input = CreateProductionRecipeInputSchema.parse(await request.json());
	const result = await createProductionRecipe({ input, session });
	return NextResponse.json(result, { status: 201 });
}

async function updateProductionRecipeRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canEditProductions(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para editar fichas técnicas.");
	const input = UpdateProductionRecipeInputSchema.parse(await request.json());
	const result = await updateProductionRecipe({ input, session });
	return NextResponse.json(result);
}

async function deleteProductionRecipeRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canDeleteProductions(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para excluir fichas técnicas.");
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
