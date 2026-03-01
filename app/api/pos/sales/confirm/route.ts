import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { processSaleConfirmation } from "@/lib/sale-processing";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// INPUT SCHEMA
// ============================================================================

const ConfirmSaleInputSchema = z.object({
	id: z.string({ required_error: "ID da venda não informado." }),
	pagamentos: z
		.array(
			z.object({
				metodo: z.enum(["DINHEIRO", "PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "BOLETO", "TRANSFERENCIA", "CASHBACK", "VALE", "OUTRO"], {
					required_error: "Método de pagamento não informado.",
				}),
				valor: z.number({ required_error: "Valor do pagamento não informado." }),
				parcela: z.number().optional().nullable(),
				totalParcelas: z.number().optional().nullable(),
			}),
		)
		.min(1, { message: "Pelo menos um pagamento é obrigatório." }),
	contaDebitoId: z.string({ required_error: "Conta de débito não informada." }),
	contaCreditoId: z.string({ required_error: "Conta de crédito não informada." }),
});
export type TConfirmSaleInput = z.infer<typeof ConfirmSaleInputSchema>;

// ============================================================================
// HANDLER
// ============================================================================

async function confirmSale({ input, session }: { input: TConfirmSaleInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	// Load the full organization record for provider config
	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
	});

	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const result = await processSaleConfirmation({
		vendaId: input.id,
		pagamentos: input.pagamentos,
		autorId: session.user.id,
		organizacao: organization,
		contaDebitoId: input.contaDebitoId,
		contaCreditoId: input.contaCreditoId,
	});

	return {
		data: result,
		message: "Venda confirmada com sucesso.",
	};
}
export type TConfirmSaleOutput = Awaited<ReturnType<typeof confirmSale>>;

// ============================================================================
// ROUTE HANDLER
// ============================================================================

async function confirmSaleRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const { searchParams } = new URL(request.url);
	const body = await request.json();
	const input = ConfirmSaleInputSchema.parse({ ...body, id: searchParams.get("id") });
	const result = await confirmSale({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: confirmSaleRoute });
