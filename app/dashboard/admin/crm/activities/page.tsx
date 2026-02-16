import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import ActivitiesPage from "./activities-page";

export default async function ActivitiesRoute() {
	const session = await getCurrentSession();
	if (!session) redirect("/auth/signin");
	if (!session.user.admin) redirect("/dashboard");
	return <ActivitiesPage user={session.user} />;
}
