import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getPartnerByUserId, loadPartnerPanel } from "@/lib/platform-partnerships/partner-panel";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetPlatformPartnerReferralsInputSchema = z.object({
	id: z
		.string({ required_error: "ID da loja não informado.", invalid_type_error: "Tipo inválido para o ID da loja." })
		.min(1, "ID da loja não informado."),
});
export type TGetPlatformPartnerReferralsInput = z.infer<typeof GetPlatformPartnerReferralsInputSchema>;

async function getPlatformPartnerReferrals({ input, userId }: { input: TGetPlatformPartnerReferralsInput; userId: string }) {
	const partner = await getPartnerByUserId(userId);
	if (!partner || partner.status !== "ATIVO") throw new createHttpError.NotFound("Cadastro de parceiro não encontrado.");

	const { stores, commissions } = await loadPartnerPanel({ partnerId: partner.id });
	const store = stores.find((item) => item.id === input.id);
	if (!store) throw new createHttpError.NotFound("Loja não encontrada.");

	const faturas = commissions
		.filter((commission) => commission.referralId === store.id && commission.status !== "CANCELADA")
		.sort((a, b) => b.dataInsercao.getTime() - a.dataInsercao.getTime())
		.map((commission) => ({
			id: commission.id,
			numeroInvoiceAssinatura: commission.numeroInvoiceAssinatura,
			ajuste: commission.ajusteOrigemCommissionId !== null,
			valorInvoiceBrutoCentavos: commission.valorInvoiceBrutoCentavos,
			percentualComissaoBps: commission.percentualComissaoBps,
			valorComissaoCentavos: commission.valorComissaoCentavos,
			status: commission.status,
			dataInsercao: commission.dataInsercao,
		}));

	return {
		data: { byId: { ...store, faturas } },
		message: "Loja obtida com sucesso.",
	};
}
export type TGetPlatformPartnerReferralsOutput = Awaited<ReturnType<typeof getPlatformPartnerReferrals>>;
export type TGetPlatformPartnerReferralsOutputById = TGetPlatformPartnerReferralsOutput["data"]["byId"];

async function getPlatformPartnerReferralsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = GetPlatformPartnerReferralsInputSchema.parse({ id: request.nextUrl.searchParams.get("id") });
	const result = await getPlatformPartnerReferrals({ input, userId: session.user.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({
	GET: getPlatformPartnerReferralsRoute,
});
