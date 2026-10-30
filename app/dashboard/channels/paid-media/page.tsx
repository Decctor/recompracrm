import { requireDashboardCapability } from "@/lib/access/guards";
import { canManageIntegrations } from "@/lib/integrations/mask";
import { redirect } from "next/navigation";
import PaidMediaPage from "./paid-media-page";

export default async function PaidMedia() {
	const { sessionUser, unauthorized } = await requireDashboardCapability("paidMedia");
	if (unauthorized) return unauthorized;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	return <PaidMediaPage canManageIntegrations={canManageIntegrations(sessionUser.membership.permissoes)} />;
}
