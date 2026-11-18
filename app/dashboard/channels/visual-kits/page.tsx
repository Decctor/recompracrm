import { requireDashboardCapability } from "@/lib/access/guards";
import { canEditCommunication } from "@/lib/permissions/communication";
import { redirect } from "next/navigation";
import VisualKitsPage from "./_module/overview/visual-kits-page";

export default async function VisualKits() {
	const { sessionUser, unauthorized } = await requireDashboardCapability("visualKits");
	if (unauthorized) return unauthorized;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	return <VisualKitsPage canEdit={canEditCommunication(sessionUser.membership.permissoes)} />;
}
