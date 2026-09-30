import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getPartnerByUserId, loadPartnerPanel } from "@/lib/platform-partnerships/partner-panel";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function getPlatformPartnerDashboard({ userId }: { userId: string }) {
	const found = await getPartnerByUserId(userId);
	if (!found) {
		return {
			data: { partner: null, resumo: null, lojas: [], extrato: [] },
			message: "Cadastro de parceiro não encontrado.",
		};
	}
	// A chave PIX não sai daqui: o painel só a mostra no detalhe do pagamento, e mascarada.
	const { chavePix: _chavePix, ...partner } = found;
	if (partner.status !== "ATIVO") {
		return {
			data: { partner, resumo: null, lojas: [], extrato: [] },
			message: "Cadastro de parceiro ainda não está ativo.",
		};
	}

	const { stores, resumo, extrato } = await loadPartnerPanel({ partnerId: partner.id });
	return {
		data: {
			partner,
			resumo,
			lojas: stores.map(({ trilha: _trilha, ...store }) => store),
			extrato,
		},
		message: "Dashboard do parceiro obtido com sucesso.",
	};
}
export type TGetPlatformPartnerDashboardOutput = Awaited<ReturnType<typeof getPlatformPartnerDashboard>>;

async function getPlatformPartnerDashboardRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const result = await getPlatformPartnerDashboard({ userId: session.user.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({
	GET: getPlatformPartnerDashboardRoute,
});
