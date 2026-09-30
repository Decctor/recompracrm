import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { formatPartnerDate } from "@/lib/platform-partnerships/earnings";
import { getPartnerByUserId, getPartnerPayoutDetail } from "@/lib/platform-partnerships/partner-panel";
import { buildPayoutStatementPdf } from "@/lib/platform-partnerships/payout-statement";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetPlatformPartnerPayoutStatementInputSchema = z.object({
	id: z
		.string({ required_error: "ID do pagamento não informado.", invalid_type_error: "Tipo inválido para o ID do pagamento." })
		.min(1, "ID do pagamento não informado."),
});
export type TGetPlatformPartnerPayoutStatementInput = z.infer<typeof GetPlatformPartnerPayoutStatementInputSchema>;

async function getPlatformPartnerPayoutStatement({ input, userId }: { input: TGetPlatformPartnerPayoutStatementInput; userId: string }) {
	const partner = await getPartnerByUserId(userId);
	if (!partner || partner.status !== "ATIVO") throw new createHttpError.NotFound("Cadastro de parceiro não encontrado.");

	const payout = await getPartnerPayoutDetail({ partnerId: partner.id, payoutId: input.id });
	if (!payout) throw new createHttpError.NotFound("Pagamento não encontrado.");

	const bytes = await buildPayoutStatementPdf(payout);
	const dateKey = formatPartnerDate(payout.dataPagamento ?? payout.dataPrevista ?? payout.competenciaFim)
		.split("/")
		.reverse()
		.join("-");
	return { bytes, fileName: `demonstrativo-pix-${dateKey}.pdf` };
}

async function getPlatformPartnerPayoutStatementRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = GetPlatformPartnerPayoutStatementInputSchema.parse({ id: request.nextUrl.searchParams.get("id") });
	const { bytes, fileName } = await getPlatformPartnerPayoutStatement({ input, userId: session.user.id });
	return new NextResponse(Buffer.from(bytes), {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${fileName}"`,
			"Cache-Control": "private, no-store",
		},
	});
}

export const GET = appApiHandler({
	GET: getPlatformPartnerPayoutStatementRoute,
});
