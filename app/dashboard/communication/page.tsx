import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { getCurrentSession } from "@/lib/authentication/session";
import { resolveCommunicationPermissions } from "@/lib/permissions/communication";
import { redirect } from "next/navigation";
import CommunicationTemplatesPage from "./_components/communication-templates-page";

export default async function CommunicationPage() {
	const authSession = await getCurrentSession();
	if (!authSession) redirect("/auth/signin");
	if (!authSession.membership) redirect("/onboarding");

	const permissions = resolveCommunicationPermissions(authSession.membership.permissoes);
	if (!permissions.visualizar) return <UnauthorizedPage message="Você não possui permissão para visualizar a comunicação." />;

	return <CommunicationTemplatesPage organizationName={authSession.membership.organizacao.nome} permissions={permissions} />;
}
