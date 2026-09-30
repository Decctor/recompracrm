import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getPartnerByUserId } from "@/lib/platform-partnerships/partner-panel";
import { resolvePlatformPartnerReceiptUrl } from "@/lib/platform-partnerships/receipts";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetPlatformPartnerPayoutReceiptInputSchema = z.object({
	id: z
		.string({ required_error: "ID do pagamento não informado.", invalid_type_error: "Tipo inválido para o ID do pagamento." })
		.min(1, "ID do pagamento não informado."),
});
export type TGetPlatformPartnerPayoutReceiptInput = z.infer<typeof GetPlatformPartnerPayoutReceiptInputSchema>;

/** URL do comprovante de um PIX do próprio parceiro. */
async function getPlatformPartnerPayoutReceipt({ input, userId }: { input: TGetPlatformPartnerPayoutReceiptInput; userId: string }) {
	const partner = await getPartnerByUserId(userId);
	if (!partner || partner.status !== "ATIVO") throw new createHttpError.NotFound("Cadastro de parceiro não encontrado.");

	const payout = await db.query.platformPartnerPayouts.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.id), eq(fields.partnerId, partner.id)),
		columns: { comprovanteUrl: true },
	});
	if (!payout?.comprovanteUrl) throw new createHttpError.NotFound("Comprovante não encontrado.");
	return { url: await resolvePlatformPartnerReceiptUrl(payout.comprovanteUrl) };
}

// Abre direto no navegador (link do botão "Comprovante"): redireciona para a URL assinada.
async function getPlatformPartnerPayoutReceiptRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = GetPlatformPartnerPayoutReceiptInputSchema.parse({ id: request.nextUrl.searchParams.get("id") });
	const { url } = await getPlatformPartnerPayoutReceipt({ input, userId: session.user.id });
	return NextResponse.redirect(url);
}

export const GET = appApiHandler({ GET: getPlatformPartnerPayoutReceiptRoute });
