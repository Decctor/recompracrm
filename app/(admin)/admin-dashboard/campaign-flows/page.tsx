import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import CampaignFlowsPage from "./campaign-flows-page";

export default async function CampaignFlowsRoute() {
	const session = await getCurrentSession();
	if (!session) redirect("/auth/signin");
	if (!session.user.admin) return <UnauthorizedPage message="Oops, aparentemente você não possui permissão para acessar essa área." />;
	return <CampaignFlowsPage user={session.user} />;
}
