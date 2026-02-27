import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import CampaignResultPage from "./campaign-result-page";

export default async function CampaignResultServerPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const sessionUser = await getCurrentSession();
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	return <CampaignResultPage campaignId={id} user={sessionUser.user} membership={sessionUser.membership} />;
}
