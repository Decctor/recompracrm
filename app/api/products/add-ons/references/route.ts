import z from "zod";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db, type DBTransaction } from "@/services/drizzle";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canEditProducts } from "@/lib/permissions/products";
import { appApiHandler } from "@/lib/app-api";
import { productAddOnReferences, productAddOns, productVariants, products } from "@/services/drizzle/schema";
import { and, eq, isNull } from "drizzle-orm";

async function validateReferenceScope({
	userOrgId,
	productId,
	productAddOnId,
	productVariantId,
}: {
	userOrgId: string;
	productId: string;
	productAddOnId: string;
	productVariantId?: string | null;
}) {
	const product = await db.query.products.findFirst({
		where: and(eq(products.id, productId), eq(products.organizacaoId, userOrgId)),
		columns: { id: true },
	});
	if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

	if (productVariantId) {
		const variant = await db.query.productVariants.findFirst({
			where: and(eq(productVariants.id, productVariantId), eq(productVariants.organizacaoId, userOrgId)),
			columns: { id: true, produtoId: true },
		});
		if (!variant) throw new createHttpError.NotFound("Variante não encontrada.");
		if (variant.produtoId !== productId) throw new createHttpError.BadRequest("A variante informada não pertence ao produto informado.");
	}

	const addOn = await db.query.productAddOns.findFirst({
		where: and(eq(productAddOns.id, productAddOnId), eq(productAddOns.organizacaoId, userOrgId)),
		columns: { id: true },
	});
	if (!addOn) throw new createHttpError.NotFound("Grupo de adicionais não encontrado.");
}

async function getNextProductAddOnOrder({ tx, productId, productVariantId }: { tx: DBTransaction; productId: string; productVariantId?: string | null }) {
	const references = await tx.query.productAddOnReferences.findMany({
		where: and(
			eq(productAddOnReferences.produtoId, productId),
			productVariantId ? eq(productAddOnReferences.produtoVarianteId, productVariantId) : isNull(productAddOnReferences.produtoVarianteId),
		),
		columns: {
			ordem: true,
		},
	});

	return references.reduce((maxOrder, reference) => Math.max(maxOrder, reference.ordem ?? 0), -1) + 1;
}

const CreateProductAddOnReferenceInputSchema = z.object({
	productId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo não válido para ID do produto.",
	}),
	productAddOnId: z.string({
		required_error: "ID do grupo de adicionais não informado.",
		invalid_type_error: "Tipo não válido para ID do grupo de adicionais.",
	}),
	productVariantId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.optional()
		.nullable(),
	// Regra deste produto (override no vínculo): null/ausente = herda min/max do grupo.
	minOpcoes: z
		.number({
			invalid_type_error: "Tipo não válido para mínimo de opções do vínculo.",
		})
		.optional()
		.nullable(),
	maxOpcoes: z
		.number({
			invalid_type_error: "Tipo não válido para máximo de opções do vínculo.",
		})
		.optional()
		.nullable(),
});
export type TCreateProductAddOnReferenceInput = z.infer<typeof CreateProductAddOnReferenceInputSchema>;

async function createProductAddOnReference({ input, session }: { input: TCreateProductAddOnReferenceInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	await validateReferenceScope({
		userOrgId,
		productId: input.productId,
		productAddOnId: input.productAddOnId,
		productVariantId: input.productVariantId,
	});

	const existingReference = await db.query.productAddOnReferences.findFirst({
		where: and(
			eq(productAddOnReferences.produtoId, input.productId),
			eq(productAddOnReferences.produtoAddOnId, input.productAddOnId),
			input.productVariantId ? eq(productAddOnReferences.produtoVarianteId, input.productVariantId) : isNull(productAddOnReferences.produtoVarianteId),
		),
		columns: { id: true },
	});
	if (existingReference) throw new createHttpError.Conflict("Esse grupo de adicionais já está vinculado ao produto.");

	const referenceId = await db.transaction(async (tx) => {
		const [createdReference] = await tx
			.insert(productAddOnReferences)
			.values({
				produtoId: input.productId,
				produtoVarianteId: input.productVariantId ?? null,
				produtoAddOnId: input.productAddOnId,
				ordem: await getNextProductAddOnOrder({ tx, productId: input.productId, productVariantId: input.productVariantId }),
				minOpcoes: input.minOpcoes ?? null,
				maxOpcoes: input.maxOpcoes ?? null,
			})
			.returning({ id: productAddOnReferences.id });

		if (!createdReference?.id) {
			throw new createHttpError.InternalServerError("Erro ao vincular grupo de adicionais ao produto.");
		}

		return createdReference.id;
	});

	return {
		data: {
			referenceId,
		},
		message: "Grupo de adicionais vinculado ao produto com sucesso.",
	};
}
export type TCreateProductAddOnReferenceOutput = Awaited<ReturnType<typeof createProductAddOnReference>>;

async function createProductAddOnReferenceRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!canEditProducts(session?.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para editar produtos.");
	const input = CreateProductAddOnReferenceInputSchema.parse(await request.json());
	const result = await createProductAddOnReference({ input, session });
	return NextResponse.json(result, { status: 201 });
}

export const POST = appApiHandler({
	POST: createProductAddOnReferenceRoute,
});

const DeleteProductAddOnReferenceInputSchema = z.object({
	productId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo não válido para ID do produto.",
	}),
	productAddOnId: z.string({
		required_error: "ID do grupo de adicionais não informado.",
		invalid_type_error: "Tipo não válido para ID do grupo de adicionais.",
	}),
	productVariantId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.optional()
		.nullable(),
});
export type TDeleteProductAddOnReferenceInput = z.infer<typeof DeleteProductAddOnReferenceInputSchema>;

async function deleteProductAddOnReference({ input, session }: { input: TDeleteProductAddOnReferenceInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const product = await db.query.products.findFirst({
		where: and(eq(products.id, input.productId), eq(products.organizacaoId, userOrgId)),
		columns: { id: true },
	});
	if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

	const [deletedReference] = await db
		.delete(productAddOnReferences)
		.where(
			and(
				eq(productAddOnReferences.produtoId, input.productId),
				eq(productAddOnReferences.produtoAddOnId, input.productAddOnId),
				input.productVariantId ? eq(productAddOnReferences.produtoVarianteId, input.productVariantId) : isNull(productAddOnReferences.produtoVarianteId),
			),
		)
		.returning({ id: productAddOnReferences.id });

	if (!deletedReference?.id) throw new createHttpError.NotFound("Vínculo do grupo de adicionais com o produto não encontrado.");

	return {
		data: {
			deletedReferenceId: deletedReference.id,
		},
		message: "Grupo de adicionais desvinculado do produto com sucesso.",
	};
}
export type TDeleteProductAddOnReferenceOutput = Awaited<ReturnType<typeof deleteProductAddOnReference>>;

async function deleteProductAddOnReferenceRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!canEditProducts(session?.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para editar produtos.");
	const input = DeleteProductAddOnReferenceInputSchema.parse({
		productId: request.nextUrl.searchParams.get("productId"),
		productAddOnId: request.nextUrl.searchParams.get("productAddOnId"),
		productVariantId: request.nextUrl.searchParams.get("productVariantId"),
	});
	const result = await deleteProductAddOnReference({ input, session });
	return NextResponse.json(result);
}

export const DELETE = appApiHandler({
	DELETE: deleteProductAddOnReferenceRoute,
});
