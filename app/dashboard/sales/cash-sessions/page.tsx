import PlanRestrictionComponent from "@/components/Layouts/PlanRestrictionComponent";
import { getCurrentSession } from "@/lib/authentication/session";
import { requireDashboardCapability } from "@/lib/access/guards";
import { canReviewSalesSession } from "@/lib/permissions/sales-sessions";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CashSessionsPage from "./cash-sessions-page";

export const metadata: Metadata = {
	title: "Caixa",
	description: "Sessoes de venda e fechamento de caixa",
};

export default async function CashSessions() {
	const sessionUser = await getCurrentSession();
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");

	const sessoesVenda = sessionUser.membership.organizacao.configuracao.preferencias.sessoesVenda;
	if (!sessoesVenda?.habilitado) {
		return (
			<PlanRestrictionComponent
				title="Sessoes de venda"
				message="O controle de caixa nao esta habilitado para sua organizacao. Ative-o nas configuracoes para abrir e fechar caixas."
			/>
		);
	}

	const { unauthorized } = await requireDashboardCapability("cashSessions");
	if (unauthorized) return unauthorized;

	return (
		<CashSessionsPage
			sessionsConfig={{ requireOpeningFloat: !!sessoesVenda.exigirFundoTroco, blindCount: !!sessoesVenda.conferenciaCega }}
			canReviewSessions={canReviewSalesSession(sessionUser.membership.permissoes)}
		/>
	);
}
