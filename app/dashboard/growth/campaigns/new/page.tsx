import { requireDashboardCapability } from "@/lib/access/guards";
import { appRoutes } from "@/lib/navigation/routes";
import { resolveCampaignPermissions } from "@/lib/permissions/campaigns";
import { redirect } from "next/navigation";
import BuilderShell from "@/app/dashboard/growth/campaigns/_module/builder/components/builder-shell";
import { CampaignPermissionsProvider } from "@/app/dashboard/growth/campaigns/_module/shared/campaign-permissions";

export default async function CampaignBuilderPage() {
	const access = await requireDashboardCapability("campaigns");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");

	const permissions = resolveCampaignPermissions(sessionUser.membership.permissoes);
	// Sem `campanhas.editar` não há o que construir: a API recusaria o salvamento.
	if (!permissions.editar) redirect(appRoutes.growth.campaigns());

	return (
		<CampaignPermissionsProvider permissions={permissions}>
			<BuilderShell membership={sessionUser.membership} />
		</CampaignPermissionsProvider>
	);
}
