import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { requireDashboardCapability } from "@/lib/access/guards";
import { redirect } from "next/navigation";
import PurchaseBuilderShell from "../_module/builder/components/builder-shell";

export default async function NewPurchasePage() {
	const { sessionUser, unauthorized } = await requireDashboardCapability("purchases");
	if (unauthorized) return unauthorized;

	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	if (!sessionUser.membership.organizacao.configuracao.recursos.erp.acesso)
		return <UnauthorizedPage message="Oops,  sua organização não possui acesso a este recurso." />;
	if (!sessionUser.membership.permissoes.compras.criar) return <UnauthorizedPage message="Você não possui permissão para criar compras." />;
	return <PurchaseBuilderShell />;
}
