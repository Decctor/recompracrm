import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import DashboardPage from "./dashboard-page";

export default async function DashboardRoute() {
	const session = await getCurrentSession();
	if (!session) redirect("/auth/signin");
	if (!session.user.admin) redirect("/dashboard");
	return <DashboardPage user={session.user} />;
}
