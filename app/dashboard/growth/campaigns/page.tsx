import { requireDashboardCapability } from "@/lib/access/guards";
import { resolveCampaignPermissions } from "@/lib/permissions/campaigns";
import { redirect } from "next/navigation";
import CampaignsPage from "@/app/dashboard/growth/campaigns/_module/overview/campaigns-page";
import { CampaignPermissionsProvider } from "@/app/dashboard/growth/campaigns/_module/shared/campaign-permissions";

export default async function CommercialCampaignsPage() {
	const access = await requireDashboardCapability("campaigns");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	return (
		<CampaignPermissionsProvider permissions={resolveCampaignPermissions(sessionUser.membership.permissoes)}>
			<CampaignsPage user={sessionUser.user} membership={sessionUser.membership} />
		</CampaignPermissionsProvider>
	);
}
