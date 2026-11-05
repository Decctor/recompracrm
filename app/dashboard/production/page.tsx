import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { requireDashboardCapability } from "@/lib/access/guards";
import { resolveProductionPermissions } from "@/lib/permissions/productions";
import { redirect } from "next/navigation";
import ProductionsPage from "./productions-page";

export default async function Productions() {
	const { sessionUser, unauthorized } = await requireDashboardCapability("production");
	if (unauthorized) return unauthorized;

	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	if (!sessionUser.membership.organizacao.configuracao.recursos.erp.acesso) {
		return <UnauthorizedPage message="Oops, sua organização não possui acesso a este recurso." />;
	}

	return <ProductionsPage permissions={resolveProductionPermissions(sessionUser.membership.permissoes)} />;
}
