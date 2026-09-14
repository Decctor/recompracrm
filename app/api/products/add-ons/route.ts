import z from "zod";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db, type DBTransaction } from "@/services/drizzle";
import createHttpError from "http-errors";
import { ProductAddOnOptionSchema, ProductAddOnSchema } from "@/schemas/products";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { appApiHandler } from "@/lib/app-api";
import { productAddOnReferences, productAddOns, products } from "@/services/drizzle/schema";
import { upsertProductAddOnOptions } from "@/lib/products/add-on-options";
import { and, eq, ilike, isNull, or } from "drizzle-orm";

const GetProductAddOnsInputSchema = z.object({
	productId: z
		.string({
			invalid_type_error: "Tipo não válido para ID do produto.",
		})
		.optional()
		.nullable(),
	productAddOnId: z
		.string({
			invalid_type_error: "Tipo não válido para ID do adicional.",
		})
		.optional()
		.nullable(),
	search: z
		.string({
			invalid_type_error: "Tipo não válido para busca.",
		})
		.optional()
		.nullable(),
	activeOnly: z
		.string({
			invalid_type_error: "Tipo não válido para filtro de ativos.",
		})
		.optional()
		.nullable()
		.transform((v) => v === "true"),
});
export type TGetProductAddOnsInput = z.infer<typeof GetProductAddOnsInputSchema>;

async function getProductAddOns({ input, session }: { input: TGetProductAddOnsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (input.productId) {
		const product = await db.query.products.findFirst({
			where: and(eq(products.id, input.productId), eq(products.organizacaoId, userOrgId)),
			columns: { id: true },
		});
		if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

		const productAddOnsResult = await db.query.productAddOnReferences.findMany({
			where: (fields, { and, eq, isNull }) => and(eq(fields.produtoId, input.productId!), isNull(fields.produtoVarianteId)),
			with: {
				grupo: {
					with: {
						opcoes: {
							where: (fields, { eq }) => eq(fields.ativo, true),
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
		});

		return {
			data: {
				byProductId: productAddOnsResult.filter((reference) => reference.grupo?.organizacaoId === userOrgId && reference.grupo.ativo),
				byId: undefined,
				default: undefined,
			},
			message: "Adicionais do produto recuperados com sucesso.",
		};
	}

	if (input.productAddOnId) {
		const productAddOnResult = await db.query.productAddOns.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.productAddOnId!), eq(fields.organizacaoId, userOrgId)),
			with: {
				opcoes: {
					// Management read: inactive options stay visible (and reactivatable);
					// only tombstoned ones are hidden. Consumption reads filter "ativo".
					where: (fields, { isNull }) => isNull(fields.dataExclusao),
					orderBy: (fields, { asc }) => asc(fields.nome),
					with: {
						produto: true,
						produtoVariante: true,
					},
				},
				produtos: {
					with: {
						produto: { columns: { id: true, nome: true } },
						produtoVariante: { columns: { id: true, nome: true } },
					},
				},
			},
		});
		if (!productAddOnResult) throw new createHttpError.NotFound("Adicional não encontrado.");

		return {
			data: {
				byProductId: undefined,
				byId: productAddOnResult,
				default: undefined,
			},
			message: "Adicional recuperado com sucesso.",
		};
	}

	const searchTerm = input.search?.trim();
	const addOnsResult = await db.query.productAddOns.findMany({
		where: and(
			eq(productAddOns.organizacaoId, userOrgId),
			input.activeOnly ? eq(productAddOns.ativo, true) : undefined,
			searchTerm ? or(ilike(productAddOns.nome, `%${searchTerm}%`), ilike(productAddOns.internoNome, `%${searchTerm}%`)) : undefined,
		),
		with: {
			opcoes: {
				where: (fields, { isNull }) => isNull(fields.dataExclusao),
				orderBy: (fields, { asc }) => asc(fields.nome),
				with: {
					produto: true,
					produtoVariante: true,
				},
			},
			produtos: {
				with: {
					produto: { columns: { id: true, nome: true } },
					produtoVariante: { columns: { id: true, nome: true } },
				},
			},
		},
		orderBy: (fields, { asc }) => asc(fields.nome),
	});

	return {
		data: {
			byProductId: undefined,
			byId: undefined,
			default: addOnsResult,
		},
		message: "Grupos de adicionais recuperados com sucesso.",
	};
}
export type TGetProductAddOnsOutput = Awaited<ReturnType<typeof getProductAddOns>>;
export type TGetProductAddOnsOutputByProductId = Exclude<TGetProductAddOnsOutput["data"]["byProductId"], undefined>;
export type TGetProductAddOnsOutputById = Exclude<TGetProductAddOnsOutput["data"]["byId"], undefined>;
export type TGetProductAddOnsOutputDefault = Exclude<TGetProductAddOnsOutput["data"]["default"], undefined>;

async function getProductAddOnsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = GetProductAddOnsInputSchema.parse({
		productId: request.nextUrl.searchParams.get("productId"),
		productAddOnId: request.nextUrl.searchParams.get("productAddOnId"),
		search: request.nextUrl.searchParams.get("search"),
		activeOnly: request.nextUrl.searchParams.get("activeOnly"),
	});
	const result = await getProductAddOns({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({
	GET: getProductAddOnsRoute,
});

const ProductAddOnOptionInputSchema = ProductAddOnOptionSchema.omit({ organizacaoId: true, produtoAddOnId: true }).extend({
	produtoConsumo: z.string().optional().nullable(),
	id: z
		.string({
			invalid_type_error: "Tipo não válido para ID da opção.",
		})
		.optional(),
	deletar: z
		.boolean({
			invalid_type_error: "Tipo não válido para deletar opção.",
		})
		.optional(),
});

const ProductAddOnInputSchema = ProductAddOnSchema.omit({ organizacaoId: true }).extend({
	opcoes: z.array(ProductAddOnOptionInputSchema),
	id: z
		.string({
			invalid_type_error: "Tipo não válido para ID do adicional.",
		})
		.optional(),
	deletar: z
		.boolean({
			invalid_type_error: "Tipo não válido para deletar adicional.",
		})
		.optional(),
});

export const CreateProductAddOnInputSchema = z.object({
	productId: z
		.string({
			invalid_type_error: "Tipo não válido para ID do produto.",
		})
		.optional()
		.nullable(),
	addOn: ProductAddOnInputSchema,
});
export type TCreateProductAddOnInput = z.infer<typeof CreateProductAddOnInputSchema>;

export const UpdateProductAddOnInputSchema = z.object({
	productId: z
		.string({
			invalid_type_error: "Tipo não válido para ID do produto.",
		})
		.optional()
		.nullable(),
	productAddOnId: z.string({
		required_error: "ID do adicional não informado.",
		invalid_type_error: "Tipo não válido para ID do adicional.",
	}),
	addOn: ProductAddOnInputSchema,
});
export type TUpdateProductAddOnInput = z.infer<typeof UpdateProductAddOnInputSchema>;

async function getNextProductAddOnOrder({ tx, productId }: { tx: DBTransaction; productId: string }) {
	const references = await tx.query.productAddOnReferences.findMany({
		where: and(eq(productAddOnReferences.produtoId, productId), isNull(productAddOnReferences.produtoVarianteId)),
		columns: {
			ordem: true,
		},
	});

	return references.reduce((maxOrder, reference) => Math.max(maxOrder, reference.ordem ?? 0), -1) + 1;
}

async function createProductAddOn({ input, session }: { input: TCreateProductAddOnInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (input.productId) {
		const product = await db.query.products.findFirst({
			where: and(eq(products.id, input.productId), eq(products.organizacaoId, userOrgId)),
			columns: { id: true },
		});
		if (!product) throw new createHttpError.NotFound("Produto não encontrado.");
	}

	const transactionReturn = await db.transaction(async (tx) => {
		const [createdAddOn] = await tx
			.insert(productAddOns)
			.values({
				organizacaoId: userOrgId,
				nome: input.addOn.nome,
				internoNome: input.addOn.internoNome,
				minOpcoes: input.addOn.minOpcoes,
				maxOpcoes: input.addOn.maxOpcoes,
				ativo: input.addOn.ativo,
			})
			.returning({ id: productAddOns.id });

		if (!createdAddOn?.id) {
			throw new createHttpError.InternalServerError("Erro ao criar grupo de adicionais do produto.");
		}

		await upsertProductAddOnOptions({
			tx,
			userOrgId,
			addOnId: createdAddOn.id,
			options: input.addOn.opcoes,
		});

		if (input.productId) {
			await tx.insert(productAddOnReferences).values({
				produtoId: input.productId,
				produtoVarianteId: null,
				produtoAddOnId: createdAddOn.id,
				ordem: await getNextProductAddOnOrder({ tx, productId: input.productId }),
			});
		}

		return createdAddOn.id;
	});

	return {
		data: {
			productId: input.productId ?? null,
			productAddOnId: transactionReturn,
		},
		message: "Adicional criado com sucesso.",
	};
}
export type TCreateProductAddOnOutput = Awaited<ReturnType<typeof createProductAddOn>>;

async function createProductAddOnRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = CreateProductAddOnInputSchema.parse(await request.json());
	const result = await createProductAddOn({ input, session });
	return NextResponse.json(result, { status: 201 });
}

export const POST = appApiHandler({
	POST: createProductAddOnRoute,
});

async function updateProductAddOn({ input, session }: { input: TUpdateProductAddOnInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (input.productId) {
		const product = await db.query.products.findFirst({
			where: and(eq(products.id, input.productId), eq(products.organizacaoId, userOrgId)),
			columns: { id: true },
		});
		if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

		const existingReference = await db.query.productAddOnReferences.findFirst({
			where: and(
				eq(productAddOnReferences.produtoId, input.productId),
				eq(productAddOnReferences.produtoAddOnId, input.productAddOnId),
				isNull(productAddOnReferences.produtoVarianteId),
			),
			with: {
				grupo: true,
			},
		});
		if (!existingReference?.grupo || existingReference.grupo.organizacaoId !== userOrgId) {
			throw new createHttpError.NotFound("Adicional não encontrado.");
		}
	} else {
		const existingAddOn = await db.query.productAddOns.findFirst({
			where: and(eq(productAddOns.id, input.productAddOnId), eq(productAddOns.organizacaoId, userOrgId)),
			columns: { id: true },
		});
		if (!existingAddOn) throw new createHttpError.NotFound("Adicional não encontrado.");
	}

	const transactionReturn = await db.transaction(async (tx) => {
		const [updatedAddOn] = await tx
			.update(productAddOns)
			.set({
				nome: input.addOn.nome,
				internoNome: input.addOn.internoNome,
				minOpcoes: input.addOn.minOpcoes,
				maxOpcoes: input.addOn.maxOpcoes,
				ativo: input.addOn.ativo,
			})
			.where(and(eq(productAddOns.id, input.productAddOnId), eq(productAddOns.organizacaoId, userOrgId)))
			.returning({ id: productAddOns.id });

		if (!updatedAddOn?.id) {
			throw new createHttpError.InternalServerError("Erro ao atualizar grupo de adicionais do produto.");
		}

		await upsertProductAddOnOptions({
			tx,
			userOrgId,
			addOnId: input.productAddOnId,
			options: input.addOn.opcoes,
		});

		return updatedAddOn.id;
	});

	return {
		data: {
			updatedId: transactionReturn,
		},
		message: "Adicional atualizado com sucesso.",
	};
}
export type TUpdateProductAddOnOutput = Awaited<ReturnType<typeof updateProductAddOn>>;

async function updateProductAddOnRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = UpdateProductAddOnInputSchema.parse(await request.json());
	const result = await updateProductAddOn({ input, session });
	return NextResponse.json(result);
}

export const PUT = appApiHandler({
	PUT: updateProductAddOnRoute,
});
