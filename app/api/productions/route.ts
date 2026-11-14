import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canCreateProductions, canDeleteProductions, canEditProductions, canViewProductions } from "@/lib/permissions/productions";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { handleSimpleChildRowsProcessing } from "@/lib/db-utils";
import { getProductionPricingItems, getProductPricingMap, resolveProductionValuation } from "@/lib/productions/valuation";
import { ProductionBaseSchema, ProductionInputSchema, ProductionOutputBaseSchema } from "@/schemas/productions";
import { db } from "@/services/drizzle";
import {
	productStockLots,
	productionInputs,
	productionOutputs,
	productionRecipes,
	productions,
	productVariants,
	products,
	users,
} from "@/services/drizzle/schema";
import { ProductionCompositionEnum, ProductionOriginEnum, ProductionStatusEnum, ProductionsSortFieldEnum, SortDirectionEnum } from "@/schemas/enums";
import { type SQL, and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
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
	recipeIds: z
		.string({ invalid_type_error: "Tipo inválido para receitas." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",") : [])),
	compositions: z
		.string({ invalid_type_error: "Tipo inválido para composição." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",") : []))
		.pipe(z.array(ProductionCompositionEnum)),
	orderBy: z
		.string({ invalid_type_error: "Tipo inválido para ordenação." })
		.optional()
		.nullable()
		.transform((value) => value || "DATA")
		.pipe(ProductionsSortFieldEnum),
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
						lote: { columns: { id: true, codigoLote: true, dataValidade: true, quantidadeAtual: true } },
					},
					// Saldo reincorporado primeiro: é a primeira linha pesada na tela de produção.
					orderBy: (fields, { asc, desc }) => [desc(fields.reincorporado), asc(fields.id)],
				},
				// Lotes gerados na conclusão — base das etiquetas.
				lotes: {
					columns: { id: true, codigoLote: true, produtoId: true, produtoVarianteId: true, quantidadeInicial: true, dataValidade: true },
					orderBy: (fields, { asc }) => asc(fields.codigoLote),
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

	// A consulta relacional reescreve toda coluna do `where`/`orderBy` para o alias da tabela raiz — por
	// isso as subconsultas referenciam as outras tabelas por alias literal, e só `productions` por coluna.
	const hasReincorporatedInput = sql`EXISTS (SELECT 1 FROM ${productionInputs} pi WHERE pi.producao_id = ${productions.id} AND pi.reincorporado = true)`;

	const conditions: (SQL | undefined)[] = [eq(productions.organizacaoId, organizationId)];
	if (input.search) {
		const term = `%${input.search}%`;
		conditions.push(
			or(
				sql`${productions.titulo} ILIKE ${term}`,
				sql`EXISTS (SELECT 1 FROM ${productionRecipes} pr WHERE pr.id = ${productions.receitaId} AND pr.titulo ILIKE ${term})`,
				sql`EXISTS (SELECT 1 FROM ${users} u WHERE u.id = ${productions.autorId} AND u.nome ILIKE ${term})`,
			),
		);
	}
	if (input.status.length > 0) conditions.push(inArray(productions.status, input.status));
	if (input.origem.length > 0) conditions.push(inArray(productions.origem, input.origem));
	if (input.recipeIds.length > 0) conditions.push(inArray(productions.receitaId, input.recipeIds));
	if (input.compositions.length > 0) {
		conditions.push(
			or(
				...input.compositions.map((composition) => {
					if (composition === "RECEITA") return isNotNull(productions.receitaId);
					if (composition === "MANUAL") return isNull(productions.receitaId);
					return hasReincorporatedInput;
				}),
			),
		);
	}
	if (input.periodAfter) conditions.push(gte(productions.dataInsercao, input.periodAfter));
	if (input.periodBefore) conditions.push(lte(productions.dataInsercao, input.periodBefore));

	// Custo e margem só existem gravados nas concluídas (snapshot); as demais ficam por último em
	// qualquer direção — projetá-las pelo catálogo exigiria valorar toda a base para ordenar.
	const direction = input.orderByDirection === "asc" ? asc : desc;
	const nullsLast = (expression: SQL) => sql`${expression} ${sql.raw(input.orderByDirection === "asc" ? "ASC" : "DESC")} NULLS LAST`;
	const orderByExpressions: SQL[] = (() => {
		switch (input.orderBy) {
			case "TITULO":
				return [direction(productions.titulo)];
			case "SAIDA":
				return [
					direction(
						sql`(SELECT COALESCE(SUM(COALESCE(po.quantidade_real, po.quantidade_prevista, 0)), 0) FROM ${productionOutputs} po WHERE po.producao_id = ${productions.id})`,
					),
				];
			case "CUSTO":
				return [nullsLast(sql`${productions.custoTotal}`)];
			case "MARGEM":
				return [nullsLast(sql`(${productions.retornoEsperado} - ${productions.custoTotal})`)];
			default:
				return [direction(sql`COALESCE(${productions.dataInicio}, ${productions.dataInsercao})`)];
		}
	})();

	const [totalResult, productionsResult] = await Promise.all([
		db
			.select({ total: count(productions.id) })
			.from(productions)
			.where(and(...conditions)),
		db.query.productions.findMany({
			where: and(...conditions),
			with: {
				receita: { columns: { id: true, titulo: true, imagemCapaUrl: true, capaIcone: true, capaCor: true } },
				autor: { columns: { id: true, nome: true, avatarUrl: true } },
				entradas: true,
				saidas: {
					with: {
						produto: { columns: { id: true, nome: true, unidade: true } },
						produtoVariante: { columns: { id: true, nome: true } },
					},
					orderBy: (fields, { asc }) => asc(fields.id),
				},
			},
			orderBy: [...orderByExpressions, desc(productions.dataInsercao), asc(productions.id)],
			limit: input.pageSize,
			offset: (input.page - 1) * input.pageSize,
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
				totalPages: Math.max(1, Math.ceil(productionsMatched / input.pageSize)),
			},
		},
		message: "Produções encontradas com sucesso.",
	};
}
export type TGetProductionsOutput = Awaited<ReturnType<typeof getProductions>>;
export type TGetProductionsOutputById = Exclude<TGetProductionsOutput["data"]["byId"], undefined>;
export type TGetProductionsOutputDefault = Exclude<TGetProductionsOutput["data"]["default"], undefined>;

/** Saldo reincorporado com lote escolhido: o lote precisa ser da organização, do mesmo produto e estar ativo. */
async function validateProductionInputLots({
	organizationId,
	inputs,
}: {
	organizationId: string;
	inputs: (ProductionItemInput & { loteId?: string | null })[];
}) {
	const pinnedInputs = inputs.filter((item) => !item.deletar && item.loteId);
	if (pinnedInputs.length === 0) return;

	const lotIds = [...new Set(pinnedInputs.map((item) => item.loteId as string))];
	const lots = await db.query.productStockLots.findMany({
		where: and(inArray(productStockLots.id, lotIds), eq(productStockLots.organizacaoId, organizationId)),
		columns: { id: true, produtoId: true, produtoVarianteId: true, status: true },
	});
	const lotsById = new Map(lots.map((lot) => [lot.id, lot]));

	for (const item of pinnedInputs) {
		const lot = lotsById.get(item.loteId as string);
		if (!lot) throw new createHttpError.BadRequest("Lote do insumo não encontrado.");
		if (lot.produtoId !== item.produtoId || (lot.produtoVarianteId ?? null) !== (item.produtoVarianteId ?? null)) {
			throw new createHttpError.BadRequest("Lote do insumo não pertence ao produto informado.");
		}
		if (lot.status !== "ATIVO") throw new createHttpError.BadRequest("Lote do insumo não está ativo.");
	}
}

async function createProduction({ input, session }: { input: TCreateProductionInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	const userId = session.user.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	await validateProductionItemsOrganization({
		organizationId,
		inputs: input.productionInputs,
		outputs: input.productionOutputs,
	});
	await validateProductionInputLots({ organizationId, inputs: input.productionInputs });

	return await db.transaction(async (tx) => {
		const [insertedProduction] = await tx
			.insert(productions)
			.values({
				...input.production,
				// Criada já em produção (construtor → "Iniciar produção"): o relógio começa agora.
				dataInicio: input.production.dataInicio ?? (input.production.status === "EM_PRODUCAO" ? new Date() : null),
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
	await validateProductionInputLots({ organizationId, inputs: input.productionInputs });

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
	if (!canViewProductions(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar a produção.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetProductionsInputSchema.parse({
		id: searchParams.get("id"),
		page: searchParams.get("page"),
		search: searchParams.get("search"),
		status: searchParams.get("status"),
		origem: searchParams.get("origem"),
		periodAfter: searchParams.get("periodAfter"),
		periodBefore: searchParams.get("periodBefore"),
		recipeIds: searchParams.get("recipeIds"),
		compositions: searchParams.get("compositions"),
		orderBy: searchParams.get("orderBy"),
		orderByDirection: searchParams.get("orderByDirection"),
		pageSize: searchParams.get("pageSize"),
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
