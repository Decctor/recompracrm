import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import LeadDetailPage from "./lead-detail-page";

type LeadDetailRouteProps = {
	params: Promise<{ leadId: string }>;
};

export default async function LeadDetailRoute({ params }: LeadDetailRouteProps) {
	const session = await getCurrentSession();
	if (!session) redirect("/auth/signin");
	if (!session.user.admin) return <UnauthorizedPage message="Oops, aparentemente você não possui permissão para acessar essa área." />;
	const { leadId } = await params;
	return <LeadDetailPage user={session.user} leadId={leadId} />;
}
