import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import DashboardPage from "./dashboard-page";

export default async function DashboardRoute() {
	const session = await getCurrentSession();
	if (!session) redirect("/auth/signin");
	if (!session.user.admin) return <UnauthorizedPage message="Oops, aparentemente você não possui permissão para acessar essa área." />;
	return <DashboardPage user={session.user} />;
}
