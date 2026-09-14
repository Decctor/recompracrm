import z from "zod";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db, type DBTransaction } from "@/services/drizzle";
import createHttpError from "http-errors";
import { ProductVariantSchema, ProductAddOnSchema, ProductAddOnOptionSchema } from "@/schemas/products";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { ProductFiscalProfileSchema } from "@/schemas/fiscal";
import { appApiHandler } from "@/lib/app-api";
import {
	productAddOnOptions,
	productAddOnReferences,
	productAddOns,
	productStockTransactions,
	productVariants,
	products,
} from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { upsertProductAddOnOptions, validateAndResolveAddOnOptionLink } from "@/lib/products/add-on-options";

const GetProductVariantsInputSchema = z.object({
	productId: z
		.string({
			invalid_type_error: "Tipo não válido para ID do produto.",
		})
		.optional()
		.nullable(),
	productVariantId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.optional()
		.nullable(),
});
export type TGetProductVariantsInput = z.infer<typeof GetProductVariantsInputSchema>;

async function getProductVariants({ input, session }: { input: TGetProductVariantsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (input.productId) {
		const productVariantsResult = await db.query.productVariants.findMany({
			where: (fields, { and, eq }) => and(eq(fields.produtoId, input.productId!), eq(fields.organizacaoId, userOrgId)),
		});

		return {
			data: {
				byProductId: productVariantsResult,
				byId: undefined,
			},
			message: "Variantes do produto recuperadas com sucesso.",
		};
	}

	if (input.productVariantId) {
		const productVariantResult = await db.query.productVariants.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.productVariantId!), eq(fields.organizacaoId, userOrgId)),
			with: {
				addOnsReferencias: {
					with: {
						grupo: {
							with: {
								opcoes: {
									where: (fields, { isNull }) => isNull(fields.dataExclusao),
									orderBy: (fields, { asc }) => asc(fields.nome),
								},
							},
						},
					},
				},
				perfisFiscais: {
					where: (fields, { eq }) => eq(fields.ativo, true),
				},
			},
		});
		if (!productVariantResult) throw new createHttpError.NotFound("Variante não encontrada.");

		return {
			data: {
				byProductId: undefined,
				byId: productVariantResult,
			},
			message: "Variante recuperada com sucesso.",
		};
	}

	throw new createHttpError.BadRequest("Informe o ID do produto ou o ID da variante.");
}
export type TGetProductVariantsOutput = Awaited<ReturnType<typeof getProductVariants>>;
export type TGetProductVariantsOutputByProductId = Exclude<TGetProductVariantsOutput["data"]["byProductId"], undefined>;
export type TGetProductVariantsOutputById = Exclude<TGetProductVariantsOutput["data"]["byId"], undefined>;

async function getProductVariantsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = GetProductVariantsInputSchema.parse({
		productId: request.nextUrl.searchParams.get("productId"),
		productVariantId: request.nextUrl.searchParams.get("productVariantId"),
	});
	const result = await getProductVariants({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({
	GET: getProductVariantsRoute,
});

export const CreateProductVariantInputSchema = z.object({
	productVariant: ProductVariantSchema.omit({ organizacaoId: true }),
	perfisFiscais: z.array(ProductFiscalProfileSchema.omit({ organizacaoId: true, produtoId: true, produtoVarianteId: true })),
	addOns: z.array(
		ProductAddOnSchema.omit({ organizacaoId: true }).extend({
			opcoes: z.array(
				ProductAddOnOptionSchema.omit({ organizacaoId: true, produtoAddOnId: true }).extend({
					produtoConsumo: z.string().optional().nullable(),
				}),
			),
		}),
	),
});
export type TCreateProductVariantInput = z.infer<typeof CreateProductVariantInputSchema>;

export const UpdateProductVariantInputSchema = z.object({
	productVariantId: z.string({
		required_error: "ID da variante não informado.",
		invalid_type_error: "Tipo não válido para ID da variante.",
	}),
	productVariant: ProductVariantSchema.omit({ organizacaoId: true }),
	perfisFiscais: z.array(
		ProductFiscalProfileSchema.omit({ organizacaoId: true, produtoId: true, produtoVarianteId: true }).extend({
			id: z
				.string({
					required_error: "ID do perfil fiscal não informado.",
					invalid_type_error: "Tipo não válido para ID do perfil fiscal.",
				})
				.optional(),
			deletar: z
				.boolean({
					required_error: "Deletar perfil fiscal não informado.",
					invalid_type_error: "Tipo não válido para deletar perfil fiscal.",
				})
				.optional(),
		}),
	),
	addOns: z.array(
		ProductAddOnSchema.omit({ organizacaoId: true }).extend({
			opcoes: z.array(
				ProductAddOnOptionSchema.omit({ organizacaoId: true, produtoAddOnId: true }).extend({
					produtoConsumo: z
						.string({
							required_error: "ID do produto de consumo não informado.",
							invalid_type_error: "Tipo não válido para ID do produto de consumo.",
						})
						.optional()
						.nullable(),
					id: z
						.string({
							required_error: "ID da opção não informado.",
							invalid_type_error: "Tipo não válido para ID da opção.",
						})
						.optional(),
					deletar: z
						.boolean({
							required_error: "Deletar opção não informado.",
							invalid_type_error: "Tipo não válido para deletar opção.",
						})
						.optional(),
				}),
			),
			id: z
				.string({
					required_error: "ID do adicional não informado.",
					invalid_type_error: "Tipo não válido para ID do adicional.",
				})
				.optional(),
			deletar: z
				.boolean({
					required_error: "Deletar adicional não informado.",
					invalid_type_error: "Tipo não válido para deletar adicional.",
				})
				.optional(),
		}),
	),
});
export type TUpdateProductVariantInput = z.infer<typeof UpdateProductVariantInputSchema>;

type TUpdateProductVariantAddOnInput = TUpdateProductVariantInput["addOns"][number];
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
	variantId: string;
	order: number;
	addOn: TUpdateProductVariantAddOnInput;
}) {
	if (addOn.id && addOn.deletar) {
		// Groups can be shared across products/variants: removing one from a variant only
		// detaches the reference; the group (and its options) stays available in the registry.
		await tx
			.delete(productAddOnReferences)
			.where(
				and(
					eq(productAddOnReferences.produtoId, productId),
					eq(productAddOnReferences.produtoAddOnId, addOn.id),
					eq(productAddOnReferences.produtoVarianteId, variantId),
				),
			);
		return addOn.id;
	}

	if (addOn.id) {
		await tx
			.update(productAddOns)
			.set({
				nome: addOn.nome,
				internoNome: addOn.internoNome,
				minOpcoes: addOn.minOpcoes,
				maxOpcoes: addOn.maxOpcoes,
				ativo: addOn.ativo,
			})
			.where(and(eq(productAddOns.id, addOn.id), eq(productAddOns.organizacaoId, userOrgId)));

		await tx
			.update(productAddOnReferences)
			.set({ ordem: order })
			.where(
				and(
					eq(productAddOnReferences.produtoId, productId),
					eq(productAddOnReferences.produtoAddOnId, addOn.id),
					eq(productAddOnReferences.produtoVarianteId, variantId),
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
		throw new createHttpError.InternalServerError("Erro ao criar grupo de adicionais da variante.");
	}

	await upsertProductAddOnOptions({
		tx,
		userOrgId,
		addOnId: createdAddOn.id,
		options: addOn.opcoes,
	});

	await tx.insert(productAddOnReferences).values({
		produtoId: productId,
		produtoVarianteId: variantId,
		produtoAddOnId: createdAddOn.id,
		ordem: order,
	});

	return createdAddOn.id;
}

async function createProductVariant({ input, session }: { input: TCreateProductVariantInput; session: TAuthUserSession }) {
	const userMembership = session.membership;
	if (!userMembership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const userOrgId = userMembership.organizacao.id;
	const productId = input.productVariant.produtoId;

	const product = await db.query.products.findFirst({
		where: and(eq(products.id, productId), eq(products.organizacaoId, userOrgId)),
		columns: { id: true },
	});
	if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

	const transactionReturn = await db.transaction(async (tx) => {
		const [createdVariant] = await tx
			.insert(productVariants)
			.values({
				organizacaoId: userOrgId,
				produtoId: productId,
				nome: input.productVariant.nome,
				codigo: input.productVariant.codigo,
				imagemCapaUrl: input.productVariant.imagemCapaUrl,
				precoVenda: input.productVariant.precoVenda,
				precoCusto: input.productVariant.precoCusto,
				quantidade: input.productVariant.quantidade,
				rastreamentoEstoqueAtivo: input.productVariant.rastreamentoEstoqueAtivo,
				ativo: input.productVariant.ativo,
			})
			.returning({ id: productVariants.id });

		if (!createdVariant?.id) {
			throw new createHttpError.InternalServerError("Erro ao criar variante do produto.");
		}

		const variantId = createdVariant.id;

		if (input.productVariant.rastreamentoEstoqueAtivo && input.productVariant.quantidade && input.productVariant.quantidade > 0) {
			await tx.insert(productStockTransactions).values({
				organizacaoId: userOrgId,
				produtoId: productId,
				produtoVarianteId: variantId,
				quantidade: input.productVariant.quantidade,
				saldoAnterior: 0,
				saldoPosterior: input.productVariant.quantidade,
				motivo: "Inicialização do estoque",
				tipo: "AJUSTE",
				operadorId: session.user.id,
			});
		}

		const insertedAddOnIds: string[] = [];

		for (const [addOnIndex, addOn] of input.addOns.entries()) {
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
				throw new createHttpError.InternalServerError("Erro ao criar grupo de adicionais da variante.");
			}

			insertedAddOnIds.push(createdAddOn.id);

			for (const option of addOn.opcoes) {
				const normalizedOption = await validateAndResolveAddOnOptionLink({
					tx,
					userOrgId,
					option,
				});

				await tx.insert(productAddOnOptions).values({
					organizacaoId: userOrgId,
					produtoAddOnId: createdAddOn.id,
					nome: normalizedOption.nome,
					codigo: normalizedOption.codigo,
					precoDelta: normalizedOption.precoDelta,
					maxQtdePorItem: normalizedOption.maxQtdePorItem,
					ativo: normalizedOption.ativo,
					produtoId: normalizedOption.produtoId ?? null,
					produtoVarianteId: normalizedOption.produtoVarianteId ?? null,
					quantidadeConsumo: normalizedOption.quantidadeConsumo ?? 1,
				});
			}

			await tx.insert(productAddOnReferences).values({
				produtoId: productId,
				ordem: addOnIndex,
				produtoAddOnId: createdAddOn.id,
				produtoVarianteId: variantId,
			});
		}

		return {
			productId,
			productVariantId: variantId,
			addOnIds: insertedAddOnIds,
		};
	});

	return {
		data: transactionReturn,
		message: "Variante criada com sucesso.",
	};
}
export type TCreateProductVariantOutput = Awaited<ReturnType<typeof createProductVariant>>;

async function createProductVariantRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = CreateProductVariantInputSchema.parse(await request.json());
	const result = await createProductVariant({ input, session });
	return NextResponse.json(result, { status: 201 });
}

export const POST = appApiHandler({
	POST: createProductVariantRoute,
});

async function updateProductVariant({ input, session }: { input: TUpdateProductVariantInput; session: TAuthUserSession }) {
	const userMembership = session.membership;
	if (!userMembership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const userOrgId = userMembership.organizacao.id;
	const productId = input.productVariant.produtoId;
	const productVariantId = input.productVariantId;

	const product = await db.query.products.findFirst({
		where: and(eq(products.id, productId), eq(products.organizacaoId, userOrgId)),
		columns: { id: true },
	});
	if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

	const existingVariant = await db.query.productVariants.findFirst({
		where: and(eq(productVariants.id, productVariantId), eq(productVariants.produtoId, productId), eq(productVariants.organizacaoId, userOrgId)),
		columns: { id: true },
	});
	if (!existingVariant) throw new createHttpError.NotFound("Variante não encontrada.");

	const transactionReturn = await db.transaction(async (tx) => {
		const [updatedVariant] = await tx
			.update(productVariants)
			.set({
				nome: input.productVariant.nome,
				codigo: input.productVariant.codigo,
				imagemCapaUrl: input.productVariant.imagemCapaUrl,
				precoVenda: input.productVariant.precoVenda,
				precoCusto: input.productVariant.precoCusto,
				quantidade: input.productVariant.quantidade,
				rastreamentoEstoqueAtivo: input.productVariant.rastreamentoEstoqueAtivo,
				ativo: input.productVariant.ativo,
			})
			.where(and(eq(productVariants.id, productVariantId), eq(productVariants.produtoId, productId), eq(productVariants.organizacaoId, userOrgId)))
			.returning({ id: productVariants.id });

		if (!updatedVariant?.id) {
			throw new createHttpError.InternalServerError("Erro ao atualizar variante do produto.");
		}

		for (const [addOnIndex, addOn] of input.addOns.entries()) {
			await upsertScopedProductAddOn({
				tx,
				userOrgId,
				productId,
				variantId: productVariantId,
				order: addOnIndex,
				addOn,
			});
		}

		return updatedVariant.id;
	});

	return {
		data: {
			updatedId: transactionReturn,
		},
		message: "Variante atualizada com sucesso.",
	};
}
export type TUpdateProductVariantOutput = Awaited<ReturnType<typeof updateProductVariant>>;

async function updateProductVariantRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = UpdateProductVariantInputSchema.parse(await request.json());
	const result = await updateProductVariant({ input, session });
	return NextResponse.json(result);
}

export const PUT = appApiHandler({
	PUT: updateProductVariantRoute,
});
