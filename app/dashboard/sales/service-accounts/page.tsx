import { getCurrentSession } from "@/lib/authentication/session";
import { requireDashboardCapability } from "@/lib/access/guards";
import { appRoutes } from "@/lib/navigation/routes";
import { redirect } from "next/navigation";
import TabsBoardPage from "./tabs-board-page";

export default async function Tabs() {
	const sessionUser = await getCurrentSession();
	if (!sessionUser) redirect("/auth/signin");

	const membership = sessionUser.membership;
	if (!membership) redirect("/onboarding");
	if (!membership.organizacao.configuracao.recursos.erp.acesso) redirect(appRoutes.sales.root());
	// Módulo desabilitado na organização: rota inacessível (mesmo gate da sidebar).
	if (!membership.organizacao.configuracao.preferencias.contasAtendimento?.habilitado) redirect(appRoutes.sales.root());

	const { unauthorized } = await requireDashboardCapability("serviceAccounts");
	if (unauthorized) return unauthorized;

	return <TabsBoardPage organizationLogoUrl={membership.organizacao.logoUrl ?? null} />;
}
