import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import AssetsPage from "./assets-page";

export default async function Assets() {
	const sessionUser = await getCurrentSession();
	if (!sessionUser) redirect("/auth/signin");
	const userMembership = sessionUser.membership;
	if (!userMembership) redirect("/onboarding");
	return <AssetsPage membership={userMembership} />;
}
