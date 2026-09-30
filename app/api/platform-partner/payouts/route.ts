import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getPartnerByUserId, getPartnerPayoutDetail } from "@/lib/platform-partnerships/partner-panel";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetPlatformPartnerPayoutsInputSchema = z.object({
	id: z
		.string({ required_error: "ID do pagamento não informado.", invalid_type_error: "Tipo inválido para o ID do pagamento." })
		.min(1, "ID do pagamento não informado."),
});
export type TGetPlatformPartnerPayoutsInput = z.infer<typeof GetPlatformPartnerPayoutsInputSchema>;

async function getPlatformPartnerPayouts({ input, userId }: { input: TGetPlatformPartnerPayoutsInput; userId: string }) {
	const partner = await getPartnerByUserId(userId);
	if (!partner || partner.status !== "ATIVO") throw new createHttpError.NotFound("Cadastro de parceiro não encontrado.");

	const payout = await getPartnerPayoutDetail({ partnerId: partner.id, payoutId: input.id });
	if (!payout) throw new createHttpError.NotFound("Pagamento não encontrado.");

	return {
		data: { byId: payout },
		message: "Pagamento obtido com sucesso.",
	};
}
export type TGetPlatformPartnerPayoutsOutput = Awaited<ReturnType<typeof getPlatformPartnerPayouts>>;
export type TGetPlatformPartnerPayoutsOutputById = TGetPlatformPartnerPayoutsOutput["data"]["byId"];

async function getPlatformPartnerPayoutsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = GetPlatformPartnerPayoutsInputSchema.parse({ id: request.nextUrl.searchParams.get("id") });
	const result = await getPlatformPartnerPayouts({ input, userId: session.user.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({
	GET: getPlatformPartnerPayoutsRoute,
});
