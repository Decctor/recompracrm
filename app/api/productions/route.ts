import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canCreateProductions, canDeleteProductions, canEditProductions, canViewProductions } from "@/lib/permissions/productions";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { handleSimpleChildRowsProcessing } from "@/lib/db-utils";
import { getProductionPricingItems, getProductPricingMap, resolveProductionValuation } from "@/lib/productions/valuation";
import { ProductionBaseSchema, ProductionInputSchema, ProductionOutputBaseSchema } from "@/schemas/productions";
import { db } from "@/services/drizzle";
import { productionInputs, productionOutputs, productions, productVariants, products } from "@/services/drizzle/schema";
import { ProductionOriginEnum, ProductionStatusEnum } from "@/schemas/enums";
import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PAGE_SIZE = 20;
const LOCKED_STATUSES = ["CONCLUIDA", "CANCELADA"] as const;

const GetProductionsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo inválido para ID da produção." }).optional().nullable(),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
	search: z.string({ invalid_type_error: "Tipo inválido para busca." }).optional().nullable(),
	status: z
		.string({ invalid_type_error: "Tipo inválido para status." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",") : []))
		.pipe(z.array(ProductionStatusEnum)),
	origem: z
		.string({ invalid_type_error: "Tipo inválido para origem." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",") : []))
		.pipe(z.array(ProductionOriginEnum)),
	periodAfter: z
		.string({ invalid_type_error: "Tipo inválido para início do período." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	periodBefore: z
		.string({ invalid_type_error: "Tipo inválido para fim do período." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
});
export type TGetProductionsInput = z.infer<typeof GetProductionsInputSchema>;
export type TGetProductionByIdInput = Pick<TGetProductionsInput, "id">;
export type TGetProductionsDefaultInput = Omit<TGetProductionsInput, "id">;

// A valoração (custoTotal/retornoEsperado/dataSnapshotValores e os unitários por item) é congelada
// pelo servidor na conclusão da produção — o cliente nunca a envia.
const ProductionPayloadSchema = ProductionBaseSchema.omit({
	organizacaoId: true,
	autorId: true,
	dataInsercao: true,
	custoTotal: true,
	retornoEsperado: true,
	dataSnapshotValores: true,
}).extend({
	status: ProductionStatusEnum.default("RASCUNHO"),
	origem: ProductionOriginEnum.default("MANUAL"),
});

const ProductionInputPayloadSchema = ProductionInputSchema.omit({ organizacaoId: true, producaoId: true, custoUnitario: true });

const ProductionOutputPayloadBaseSchema = ProductionOutputBaseSchema.omit({
	organizacaoId: true,
	producaoId: true,
	valorUnitarioVenda: true,
});

const ProductionOutputPayloadSchema = ProductionOutputPayloadBaseSchema.superRefine((value, ctx) => {
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
});

const ProductionInputUpdatePayloadSchema = ProductionInputPayloadSchema.extend({
	id: z.string({ invalid_type_error: "Tipo inválido para ID da entrada." }).optional().nullable(),
	deletar: z.boolean({ invalid_type_error: "Tipo inválido para exclusão da entrada." }).optional().nullable(),
});

const ProductionOutputUpdatePayloadSchema = ProductionOutputPayloadBaseSchema.extend({
	id: z.string({ invalid_type_error: "Tipo inválido para ID da saída." }).optional().nullable(),
	deletar: z.boolean({ invalid_type_error: "Tipo inválido para exclusão da saída." }).optional().nullable(),
}).superRefine((value, ctx) => {
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
});

const CreateProductionInputSchema = z.object({
	production: ProductionPayloadSchema,
	productionInputs: z.array(ProductionInputPayloadSchema).optional().default([]),
	productionOutputs: z.array(ProductionOutputPayloadSchema).optional().default([]),
});
export type TCreateProductionInput = z.infer<typeof CreateProductionInputSchema>;

const UpdateProductionInputSchema = z.object({
	productionId: z.string({
		required_error: "ID da produção não informado.",
		invalid_type_error: "Tipo inválido para ID da produção.",
	}),
	production: ProductionPayloadSchema.partial(),
	productionInputs: z.array(ProductionInputUpdatePayloadSchema),
	productionOutputs: z.array(ProductionOutputUpdatePayloadSchema),
});
export type TUpdateProductionInput = z.infer<typeof UpdateProductionInputSchema>;

const DeleteProductionInputSchema = z.object({
	productionId: z.string({
		required_error: "ID da produção não informado.",
		invalid_type_error: "Tipo inválido para ID da produção.",
	}),
});
export type TDeleteProductionInput = z.infer<typeof DeleteProductionInputSchema>;

type ProductionItemInput = {
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

async function validateProductionItemsOrganization({
	organizationId,
	inputs,
	outputs,
}: {
	organizationId: string;
	inputs: ProductionItemInput[];
	outputs: ProductionItemInput[];
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
		if (!productIdsFound.has(item.produtoId)) throw new createHttpError.BadRequest("Produto da produção não encontrado.");
		if (!item.produtoVarianteId) continue;

		const variant = variantsById.get(item.produtoVarianteId);
		if (!variant) throw new createHttpError.BadRequest("Variante da produção não encontrada.");
		if (variant.produtoId !== item.produtoId) throw new createHttpError.BadRequest("Variante da produção não pertence ao produto informado.");
	}
}

async function getProductions({ input, session }: { input: TGetProductionsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	if (input.id) {
		const production = await db.query.productions.findFirst({
			where: and(eq(productions.id, input.id), eq(productions.organizacaoId, organizationId)),
			with: {
				receita: true,
				autor: { columns: { id: true, nome: true, avatarUrl: true } },
				entradas: {
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
		if (!production) throw new createHttpError.NotFound("Produção não encontrada.");

		// Produção concluída já traz o snapshot — `getProductionPricingItems` devolve lista vazia
		// nesse caso e a consulta de preços é dispensada.
		const pricingMap = await getProductPricingMap({ organizationId, items: getProductionPricingItems(production) });

		return {
			data: {
				byId: {
					...production,
					valores: resolveProductionValuation({ production, pricingMap }),
				},
				default: undefined,
			},
			message: "Produção encontrada com sucesso.",
		};
	}

	const conditions = [eq(productions.organizacaoId, organizationId)];
	if (input.search) conditions.push(sql`${productions.titulo} ILIKE '%' || ${input.search} || '%'`);
	if (input.status.length > 0) conditions.push(inArray(productions.status, input.status));
	if (input.origem.length > 0) conditions.push(inArray(productions.origem, input.origem));
	if (input.periodAfter) conditions.push(gte(productions.dataInsercao, input.periodAfter));
	if (input.periodBefore) conditions.push(lte(productions.dataInsercao, input.periodBefore));

	const [totalResult, productionsResult] = await Promise.all([
		db
			.select({ total: count(productions.id) })
			.from(productions)
			.where(and(...conditions)),
		db.query.productions.findMany({
			where: and(...conditions),
			with: {
				receita: { columns: { id: true, titulo: true } },
				autor: { columns: { id: true, nome: true, avatarUrl: true } },
				entradas: true,
				saidas: true,
			},
			orderBy: (fields, { desc }) => desc(fields.dataInsercao),
			limit: PAGE_SIZE,
			offset: (input.page - 1) * PAGE_SIZE,
		}),
	]);

	const productionsMatched = Number(totalResult[0]?.total ?? 0);

	// Uma única leitura de preços para toda a página, e só para as produções ainda sem snapshot.
	const pricingMap = await getProductPricingMap({
		organizationId,
		items: productionsResult.flatMap(getProductionPricingItems),
	});
	const productionsWithValuation = productionsResult.map((production) => ({
		...production,
		valores: resolveProductionValuation({ production, pricingMap }),
	}));

	return {
		data: {
			byId: undefined,
			default: {
				productions: productionsWithValuation,
				productionsMatched,
				totalPages: Math.max(1, Math.ceil(productionsMatched / PAGE_SIZE)),
			},
		},
		message: "Produções encontradas com sucesso.",
	};
}
export type TGetProductionsOutput = Awaited<ReturnType<typeof getProductions>>;
export type TGetProductionsOutputById = Exclude<TGetProductionsOutput["data"]["byId"], undefined>;
export type TGetProductionsOutputDefault = Exclude<TGetProductionsOutput["data"]["default"], undefined>;

async function createProduction({ input, session }: { input: TCreateProductionInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	const userId = session.user.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	await validateProductionItemsOrganization({
		organizationId,
		inputs: input.productionInputs,
		outputs: input.productionOutputs,
	});

	return await db.transaction(async (tx) => {
		const [insertedProduction] = await tx
			.insert(productions)
			.values({
				...input.production,
				organizacaoId: organizationId,
				autorId: userId,
			})
			.returning({ id: productions.id });

		if (!insertedProduction?.id) throw new createHttpError.InternalServerError("Erro ao criar produção.");

		if (input.productionInputs.length > 0) {
			await tx.insert(productionInputs).values(
				input.productionInputs.map((productionInput) => ({
					...productionInput,
					organizacaoId: organizationId,
					producaoId: insertedProduction.id,
				})),
			);
		}

		if (input.productionOutputs.length > 0) {
			await tx.insert(productionOutputs).values(
				input.productionOutputs.map((productionOutput) => ({
					...productionOutput,
					organizacaoId: organizationId,
					producaoId: insertedProduction.id,
				})),
			);
		}
		console.log("[DEBUG] [CREATE PRODUCTION] Production created successfully with ID:", insertedProduction.id);
		return {
			data: {
				insertedId: insertedProduction.id,
			},
			message: "Produção criada com sucesso.",
		};
	});
}
export type TCreateProductionOutput = Awaited<ReturnType<typeof createProduction>>;

async function updateProduction({ input, session }: { input: TUpdateProductionInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	await validateProductionItemsOrganization({
		organizationId,
		inputs: input.productionInputs,
		outputs: input.productionOutputs,
	});

	return await db.transaction(async (tx) => {
		const currentProduction = await tx.query.productions.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.productionId), eq(fields.organizacaoId, organizationId)),
			columns: { id: true, status: true },
		});
		if (!currentProduction) throw new createHttpError.NotFound("Produção não encontrada.");
		if (LOCKED_STATUSES.includes(currentProduction.status as (typeof LOCKED_STATUSES)[number])) {
			throw new createHttpError.BadRequest("Produções concluídas ou canceladas não podem ser alteradas.");
		}

		const [updatedProduction] = await tx
			.update(productions)
			.set(input.production)
			.where(and(eq(productions.id, input.productionId), eq(productions.organizacaoId, organizationId)))
			.returning({ id: productions.id });

		if (!updatedProduction?.id) throw new createHttpError.NotFound("Produção não encontrada.");

		await handleSimpleChildRowsProcessing({
			trx: tx,
			table: productionInputs,
			entities: input.productionInputs,
			fatherEntityKey: "producaoId",
			fatherEntityId: updatedProduction.id,
			organizacaoId: organizationId,
		});

		await handleSimpleChildRowsProcessing({
			trx: tx,
			table: productionOutputs,
			entities: input.productionOutputs,
			fatherEntityKey: "producaoId",
			fatherEntityId: updatedProduction.id,
			organizacaoId: organizationId,
		});

		return {
			data: {
				updatedId: updatedProduction.id,
			},
			message: "Produção atualizada com sucesso.",
		};
	});
}
export type TUpdateProductionOutput = Awaited<ReturnType<typeof updateProduction>>;

async function deleteProduction({ input, session }: { input: TDeleteProductionInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const currentProduction = await db.query.productions.findFirst({
		where: and(eq(productions.id, input.productionId), eq(productions.organizacaoId, organizationId)),
		columns: { id: true, status: true },
	});
	if (!currentProduction) throw new createHttpError.NotFound("Produção não encontrada.");
	if (currentProduction.status === "CONCLUIDA") throw new createHttpError.BadRequest("Produções concluídas não podem ser canceladas neste fluxo.");

	const [updatedProduction] = await db
		.update(productions)
		.set({ status: "CANCELADA" })
		.where(and(eq(productions.id, input.productionId), eq(productions.organizacaoId, organizationId)))
		.returning({ id: productions.id });

	if (!updatedProduction?.id) throw new createHttpError.NotFound("Produção não encontrada.");

	return {
		data: {
			deletedId: updatedProduction.id,
		},
		message: "Produção cancelada com sucesso.",
	};
}
export type TDeleteProductionOutput = Awaited<ReturnType<typeof deleteProduction>>;

async function getProductionsRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canViewProductions(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para visualizar a produção.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetProductionsInputSchema.parse({
		id: searchParams.get("id"),
		page: searchParams.get("page"),
		search: searchParams.get("search"),
		status: searchParams.get("status"),
		origem: searchParams.get("origem"),
		periodAfter: searchParams.get("periodAfter"),
		periodBefore: searchParams.get("periodBefore"),
	});
	const result = await getProductions({ input, session });
	return NextResponse.json(result);
}

async function createProductionRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canCreateProductions(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para criar produções.");
	const input = CreateProductionInputSchema.parse(await request.json());
	const result = await createProduction({ input, session });
	return NextResponse.json(result, { status: 201 });
}

async function updateProductionRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canEditProductions(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para editar produções.");
	const input = UpdateProductionInputSchema.parse(await request.json());
	const result = await updateProduction({ input, session });
	return NextResponse.json(result);
}

async function deleteProductionRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canDeleteProductions(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para excluir produções.");
	const input = DeleteProductionInputSchema.parse({
		productionId: request.nextUrl.searchParams.get("productionId"),
	});
	const result = await deleteProduction({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getProductionsRoute });
export const POST = appApiHandler({ POST: createProductionRoute });
export const PUT = appApiHandler({ PUT: updateProductionRoute });
export const DELETE = appApiHandler({ DELETE: deleteProductionRoute });
