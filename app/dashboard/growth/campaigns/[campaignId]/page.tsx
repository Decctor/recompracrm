import { requireDashboardCapability } from "@/lib/access/guards";
import { resolveCampaignPermissions } from "@/lib/permissions/campaigns";
import { redirect } from "next/navigation";
import { CommunicationPermissionsProvider } from "@/components/MessageTemplates/communication-permissions";
import { resolveCommunicationPermissions } from "@/lib/permissions/communication";
import CampaignResultPage from "@/app/dashboard/growth/campaigns/_module/detail/campaign-detail-page";
import { CampaignPermissionsProvider } from "@/app/dashboard/growth/campaigns/_module/shared/campaign-permissions";

export default async function CampaignResultServerPage({ params }: { params: Promise<{ campaignId: string }> }) {
	const { campaignId } = await params;
	const access = await requireDashboardCapability("campaigns");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	return (
		<CampaignPermissionsProvider permissions={resolveCampaignPermissions(sessionUser.membership.permissoes)}>
			<CommunicationPermissionsProvider permissions={resolveCommunicationPermissions(sessionUser.membership.permissoes)}>
				<CampaignResultPage campaignId={campaignId} sessionUser={sessionUser.user} sessionUserOrg={sessionUser.membership.organizacao} />
			</CommunicationPermissionsProvider>
		</CampaignPermissionsProvider>
	);
}
