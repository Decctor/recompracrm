import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { ProductStockDeductionModeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { withProductUpdateStamp } from "@/lib/products/update-stamp";
import { products } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// Modo de baixa de estoque do produto (composicao/ficha tecnica).
// Rota focada: a aba de estoque do produto configura o modo sem reenviar o
// cadastro inteiro. Ver docs/tabs/implementation-plan.md (secao 5 — Producao).
// ============================================================================

const UpdateProductStockDeductionInputSchema = z.object({
	productId: z.string({ required_error: "ID do produto nao informado." }),
	baixaEstoqueModo: ProductStockDeductionModeEnum,
	fichaTecnicaReceitaId: z.string({ invalid_type_error: "Tipo nao valido para ID da ficha tecnica." }).optional().nullable(),
});
export type TUpdateProductStockDeductionInput = z.infer<typeof UpdateProductStockDeductionInputSchema>;

async function updateProductStockDeduction({ input, session }: { input: TUpdateProductStockDeductionInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	const product = await db.query.products.findFirst({
		where: and(eq(products.id, input.productId), eq(products.organizacaoId, orgId)),
		columns: { id: true },
	});
	if (!product) throw new createHttpError.NotFound("Produto nao encontrado.");

	if (input.baixaEstoqueModo === "COMPOSICAO" && input.fichaTecnicaReceitaId) {
		const recipe = await db.query.productionRecipes.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.fichaTecnicaReceitaId as string), eq(fields.organizacaoId, orgId)),
			columns: { id: true, ativo: true },
		});
		if (!recipe) throw new createHttpError.NotFound("Ficha tecnica nao encontrada.");
		if (!recipe.ativo) throw new createHttpError.BadRequest("A ficha tecnica selecionada esta inativa.");
	}

	await db
		.update(products)
		.set(
			withProductUpdateStamp({
				baixaEstoqueModo: input.baixaEstoqueModo,
				fichaTecnicaReceitaId: input.baixaEstoqueModo === "COMPOSICAO" ? (input.fichaTecnicaReceitaId ?? null) : null,
			}),
		)
		.where(and(eq(products.id, input.productId), eq(products.organizacaoId, orgId)));

	return {
		data: { productId: input.productId },
		message: "Modo de baixa de estoque atualizado com sucesso.",
	};
}
export type TUpdateProductStockDeductionOutput = Awaited<ReturnType<typeof updateProductStockDeduction>>;

async function updateProductStockDeductionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");

	const body = await request.json();
	const input = UpdateProductStockDeductionInputSchema.parse(body);
	const result = await updateProductStockDeduction({ input, session });
	return NextResponse.json(result);
}

export const PUT = appApiHandler({ PUT: updateProductStockDeductionRoute });
