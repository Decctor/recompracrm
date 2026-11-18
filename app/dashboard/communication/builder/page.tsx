import { getCurrentSession } from "@/lib/authentication/session";
import { resolveCommunicationPermissions } from "@/lib/permissions/communication";
import { redirect } from "next/navigation";
import MessageTemplateBuilder from "./_components/message-template-builder";
import { getMessageTemplateById } from "./_lib";
import { getErrorMessage } from "@/lib/errors";
import ErrorComponent from "@/components/Layouts/ErrorComponent";

type MessageTemplateBuilderPageProps = {
	searchParams: Promise<{ templateId?: string }>;
};

export default async function MessageTemplateBuilderPage({ searchParams }: MessageTemplateBuilderPageProps) {
	const authSession = await getCurrentSession();
	if (!authSession) redirect("/auth/signin");
	if (!authSession.membership) redirect("/onboarding");
	const permissions = resolveCommunicationPermissions(authSession.membership.permissoes);
	// Sem `comunicacao.editar` não há o que construir: a API recusaria o salvamento.
	if (!permissions.editar) redirect("/dashboard/communication");

	try {
		const { templateId } = await searchParams;
		const template = await getMessageTemplateById({ templateId: templateId || null, organizationId: authSession.membership.organizacao.id });
		return (
			<MessageTemplateBuilder
				template={template}
				organizationId={authSession.membership.organizacao.id}
				organizationName={authSession.membership.organizacao.nome}
				organizationLogoUrl={authSession.membership.organizacao.logoUrl}
				organizationPrimaryColor={authSession.membership.organizacao.corPrimaria}
				organizationPrimaryForeground={authSession.membership.organizacao.corPrimariaForeground}
				organizationSecondaryColor={authSession.membership.organizacao.corSecundaria}
				organizationSecondaryForeground={authSession.membership.organizacao.corSecundariaForeground}
				canPublish={permissions.publicar}
			/>
		);
	} catch (error) {
		const errorMessage = getErrorMessage(error);
		return <ErrorComponent msg={errorMessage} />;
	}
}
