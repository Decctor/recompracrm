import { resolveInventoryPermissions } from "@/lib/permissions/inventory";
import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { requireDashboardCapability } from "@/lib/access/guards";
import { redirect } from "next/navigation";
import RecountPage from "./recount-page";

export default async function Recount() {
	const { sessionUser, unauthorized } = await requireDashboardCapability("inventory");
	if (unauthorized) return unauthorized;

	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	if (!sessionUser.membership.organizacao.configuracao.recursos.erp.acesso) {
		return <UnauthorizedPage message="Oops, sua organização não possui acesso a este recurso." />;
	}

	return <RecountPage organizationId={sessionUser.membership.organizacao.id} permissions={resolveInventoryPermissions(sessionUser.membership.permissoes)} />;
}
