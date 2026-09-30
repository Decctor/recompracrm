import { getCurrentSession } from "@/lib/authentication/session";
import { getPartnerByUserId } from "@/lib/platform-partnerships/partner-panel";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PartnerShell } from "../_components/partner-shell";
import { CardIssuedScreen, PartnerStatusScreen } from "../_components/partner-status-screens";

/**
 * Porteiro do painel: sem cadastro vai para o onboarding; cadastro não ativo vê a tela de situação;
 * recém-aprovado vê o cartão sendo emitido uma vez; o resto entra no painel.
 */
export default async function PartnerPanelLayout({ children }: { children: ReactNode }) {
	const session = await getCurrentSession();
	if (!session) redirect(`/auth/signin?redirectTo=${encodeURIComponent("/partner-dashboard")}`);

	const partner = await getPartnerByUserId(session.user.id);
	if (!partner) redirect("/partner-dashboard/onboarding");
	if (partner.status !== "ATIVO") return <PartnerStatusScreen status={partner.status} nome={partner.nome} motivoRejeicao={partner.motivoRejeicao} />;
	if (!partner.dataCartaoVisualizado) {
		return (
			<CardIssuedScreen
				nome={partner.nome}
				codigo={partner.codigo}
				dataAprovacao={partner.dataAprovacao}
				mensagemDivulgacao={partner.mensagemDivulgacao}
			/>
		);
	}

	return <PartnerShell>{children}</PartnerShell>;
}
