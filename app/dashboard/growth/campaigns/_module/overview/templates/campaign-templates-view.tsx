"use client";

import CommunicationTemplatesPage from "@/app/dashboard/communication/_components/communication-templates-page";
import { useCommunicationPermissions } from "@/components/MessageTemplates/communication-permissions";

type CampaignTemplatesViewProps = {
	organizationName: string;
};

export function CampaignTemplatesView({ organizationName }: CampaignTemplatesViewProps) {
	const permissions = useCommunicationPermissions();
	return <CommunicationTemplatesPage organizationName={organizationName} showNewTemplateAction={false} permissions={permissions} />;
}
