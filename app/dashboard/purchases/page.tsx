import UnauthenticatedPage from "@/components/Utils/UnauthenticatedPage";
import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { requireDashboardCapability } from "@/lib/access/guards";
import { redirect } from "next/navigation";
import PurchasesPage from "./purchases-page";

export default async function Purchases() {
	const { sessionUser, unauthorized } = await requireDashboardCapability("purchases");
	if (unauthorized) return unauthorized;

	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	if (!sessionUser.membership.organizacao.configuracao.recursos.erp.acesso)
		return <UnauthorizedPage message="Oops,  sua organização não possui acesso a este recurso." />;
	return <PurchasesPage membership={sessionUser.membership} />;
}
