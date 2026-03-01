import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { sales } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// INPUT SCHEMA
// ============================================================================

const CancelSaleInputSchema = z.object({
	id: z.string({ required_error: "ID da venda não informado." }),
});

// ============================================================================
// HANDLER
// ============================================================================

async function cancelSale(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const { searchParams } = new URL(request.url);
	const input = CancelSaleInputSchema.parse({ id: searchParams.get("id") });

	const orgId = session.membership.organizacao.id;

	// Verify the sale exists, belongs to the org, and is in ORCAMENTO status
	const existing = await db.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.id), eq(fields.organizacaoId, orgId)),
		columns: { id: true, status: true },
	});

	if (!existing) throw new createHttpError.NotFound("Venda não encontrada.");
	if (existing.status !== "ORCAMENTO") {
		throw new createHttpError.BadRequest("Somente rascunhos (orçamentos) podem ser cancelados por esta rota.");
	}

	await db.update(sales).set({ status: "CANCELADA" }).where(eq(sales.id, input.id));

	return NextResponse.json({
		data: { saleId: input.id },
		message: "Rascunho de venda cancelado com sucesso.",
	});
}

export const POST = appApiHandler({ POST: cancelSale });
