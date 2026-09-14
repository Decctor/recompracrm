import type { Metadata } from "next";
import { redirect } from "next/navigation";
import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { requireDashboardCapability } from "@/lib/access/guards";
import { canEditFinances, canViewFinances } from "@/lib/permissions/finances";
import StoreCreditPage from "./store-credit-page";

export const metadata: Metadata = {
	title: "Fiados",
	description: "Acompanhamento e recebimento das vendas a prazo por cliente.",
};

export default async function FinanceStoreCredit() {
	const { sessionUser, unauthorized } = await requireDashboardCapability("finance");
	if (unauthorized) return unauthorized;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");

	const { organizacao, permissoes } = sessionUser.membership;
	if (!organizacao.configuracao.recursos.erp.acesso) {
		return <UnauthorizedPage message="Sua organização não possui acesso ao módulo financeiro." />;
	}
	if (!canViewFinances(permissoes)) {
		return <UnauthorizedPage message="Você não possui permissão para visualizar o módulo financeiro." />;
	}

	// Quem só visualiza vê a lista inteira, mas sem a ação de receber: o botão não aparece, em vez
	// de aparecer desabilitado pedindo para ser clicado.
	return <StoreCreditPage organizationId={organizacao.id} canReceive={canEditFinances(permissoes)} />;
}
