import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { refundTabPayment } from "@/lib/tabs";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Estorno de um recebimento parcial, so com a conta aberta. Em dinheiro exige o caixa aberto que
// devolve a nota (ver lib/tabs/refund-tab-payment.ts).

const RefundTabPaymentInputSchema = z.object({
	tabPaymentId: z.string({ required_error: "ID do recebimento nao informado." }),
	reason: z.string({ required_error: "Informe o motivo do estorno." }).trim().min(1, { message: "Informe o motivo do estorno." }).max(300),
	sessaoVendaId: z.string({ invalid_type_error: "Tipo nao valido para o ID da sessao de venda." }).optional().nullable(),
});
export type TRefundTabPaymentRouteInput = z.infer<typeof RefundTabPaymentInputSchema>;

async function refundTabPaymentService({ input, session }: { input: TRefundTabPaymentRouteInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
	});
	if (!organization) throw new createHttpError.NotFound("Organizacao nao encontrada.");

	const result = await refundTabPayment({
		organization,
		userId: session.user.id,
		input: { tabPaymentId: input.tabPaymentId, reason: input.reason, sessaoVendaId: input.sessaoVendaId },
	});

	return { data: result, message: "Recebimento estornado com sucesso." };
}
export type TRefundTabPaymentOutput = Awaited<ReturnType<typeof refundTabPaymentService>>;

async function refundTabPaymentRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const body = await request.json();
	const input = RefundTabPaymentInputSchema.parse(body);
	const result = await refundTabPaymentService({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: refundTabPaymentRoute });
