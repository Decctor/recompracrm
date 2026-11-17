import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { getCurrentSession } from "@/lib/authentication/session";
import { resolveGoalPermissions } from "@/lib/permissions/goals";
import { redirect } from "next/navigation";
import GoalsPage from "./goals-page";

export default async function Goals() {
	const sessionUser = await getCurrentSession();
	if (!sessionUser) redirect("/auth/signin");
	const goalPermissions = resolveGoalPermissions(sessionUser.membership?.permissoes);
	if (!goalPermissions.visualizar) return <UnauthorizedPage message="Oops, aparentemente você não possui permissão para visualizar metas." />;
	return <GoalsPage user={sessionUser.user} goalPermissions={goalPermissions} />;
}
