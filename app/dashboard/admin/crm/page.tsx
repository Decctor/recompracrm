import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import CrmPage from "./crm-page";

export default async function CrmRoute() {
	const session = await getCurrentSession();
	if (!session) redirect("/auth/signin");
	if (!session.user.admin) redirect("/dashboard");
	return <CrmPage user={session.user} />;
}
