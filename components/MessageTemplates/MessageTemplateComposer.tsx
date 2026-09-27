"use client";

import type { TUseMessageTemplateState } from "@/state-hooks/use-message-template-state";
import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { BadgeCheck, Eye, FileText } from "lucide-react";
import { MessageTemplatePanel } from "./MessageTemplateFields";
import { MessageTemplateConfigurationSection, MessageTemplateContentSection } from "./MessageTemplateFormSections";
import { MessageTemplateEmailPreview, MessageTemplateWhatsappPreview } from "./MessageTemplatePreviews";
import type { TOrganizationTemplateTheme } from "./message-template-utils";

export function MessageTemplateComposer({
	messageTemplateState,
	organizationId,
	organizationName,
	organizationLogoUrl,
	className = "grid min-h-[calc(100vh-12rem)] gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(520px,1.5fr)_minmax(340px,1fr)]",
}: {
	messageTemplateState: TUseMessageTemplateState;
	organizationId: string;
	organizationName: string;
	organizationLogoUrl: string | null;
	className?: string;
}) {
	const { colors } = useOrgColors();
	const {
		state,
		updateTemplate,
		updateTemplateContent,
		updateTemplateContentHeader,
		updateTemplateContentBody,
		updateTemplateContentBodyParameter,
		addContentButton,
		addContentPresetButton,
		appendContentButtons,
		updateContentButton,
		removeContentButton,
		unknownVariables,
		whatsappWarnings,
		emailWarnings,
	} = messageTemplateState;

	const organizationTheme: TOrganizationTemplateTheme = {
		name: organizationName,
		logoUrl: organizationLogoUrl,
		primaryColor: colors.primary,
		primaryForeground: colors.primaryForeground,
		secondaryColor: colors.secondary,
		secondaryForeground: colors.secondaryForeground,
	};

	return (
		<div className={className}>
			<MessageTemplatePanel icon={<BadgeCheck className="h-4 w-4" />} title="CONFIGURAÇÃO" description="Identidade, canais e regras de envio.">
				<MessageTemplateConfigurationSection
					state={state}
					organizationName={organizationName}
					updateTemplate={updateTemplate}
					updateTemplateContent={updateTemplateContent}
				/>
			</MessageTemplatePanel>

			<MessageTemplatePanel icon={<FileText className="h-4 w-4" />} title="CONTEÚDO UNIVERSAL" description="O mesmo texto alimenta WhatsApp e e-mail.">
				<MessageTemplateContentSection
					state={state}
					organizationId={organizationId}
					unknownVariables={unknownVariables}
					updateTemplateContent={updateTemplateContent}
					updateTemplateContentHeader={updateTemplateContentHeader}
					updateTemplateContentBody={updateTemplateContentBody}
					updateTemplateContentBodyParameter={updateTemplateContentBodyParameter}
					addContentButton={addContentButton}
					addContentPresetButton={addContentPresetButton}
					appendContentButtons={appendContentButtons}
					updateContentButton={updateContentButton}
					removeContentButton={removeContentButton}
				/>
			</MessageTemplatePanel>

			<MessageTemplatePanel icon={<Eye className="h-4 w-4" />} title="PREVIEW E VALIDAÇÃO" description="Confira a leitura em cada canal.">
				<div className="flex flex-col gap-4">
					<MessageTemplateWhatsappPreview messageTemplate={state.messageTemplate} organizationTheme={organizationTheme} warnings={whatsappWarnings} />
					<MessageTemplateEmailPreview
						messageTemplate={state.messageTemplate}
						organizationId={organizationId}
						organizationName={organizationName}
						organizationTheme={organizationTheme}
						warnings={emailWarnings}
					/>
				</div>
			</MessageTemplatePanel>
		</div>
	);
}
