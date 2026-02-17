import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import CommunityAdminPage from "./community-admin-page";

export default async function AdminCommunity() {
	const authSession = await getCurrentSession();
	if (!authSession) redirect("/auth/signin");
	if (!authSession.user.admin)
		return <UnauthorizedPage message="Oops, aparentemente você não possui permissão para acessar essa área." />;
	return <CommunityAdminPage />;
}
