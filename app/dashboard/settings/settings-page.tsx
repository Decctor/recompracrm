"use client";
import CommunicationTemplatesPage from "@/app/dashboard/communication/_components/communication-templates-page";
import SettingsAiAgent from "@/components/Settings/SettingsAiAgent";
import SettingsAiConnections from "@/components/Settings/SettingsAiConnections";
import SettingsCustomFields from "@/components/Settings/SettingsCustomFields";
import SettingsDevices from "@/components/Settings/SettingsDevices";
import SettingsFinances from "@/components/Settings/SettingsFinances";
import SettingsIntegration from "@/components/Settings/SettingsIntegration";
import SettingsModules from "@/components/Settings/SettingsModules";
import SettingsOrg from "@/components/Settings/SettingsOrg";
import SettingsOutbound from "@/components/Settings/SettingsOutbound";
import SettingsProfile from "@/components/Settings/SettingsProfile";
import SettingsSalesChannels from "@/components/Settings/SettingsSalesChannels";
import SettingsSegments from "@/components/Settings/SettingsSegments";
import SettingsUsers from "@/components/Settings/SettingsUsers";
import SettingsWhatsAppConnection from "@/components/Settings/SettingsWhatsAppConnection";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import SettingsNavRail from "./_components/settings-nav-rail";
import { DEFAULT_SETTINGS_VIEW, SETTINGS_VIEWS, getSettingsLocation, isSettingsSectionAccessible } from "./_components/settings-navigation";
import SettingsRestrictedState from "./_components/settings-restricted-state";
import SettingsSectionHeader from "./_components/settings-section-header";

type SettingsPageProps = {
	user: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};

export default function SettingsPage({ user, membership }: SettingsPageProps) {
	const [view, setView] = useQueryState("view", parseAsStringLiteral(SETTINGS_VIEWS).withDefault(DEFAULT_SETTINGS_VIEW));
	// Sub-aba de seção (hoje só o agente de IA usa). Trocar de seção a descarta, senão ela ficaria
	// pendurada na URL apontando para uma aba que a nova seção não tem.
	const [, setSectionTab] = useQueryState("tab");
	const { section } = getSettingsLocation(view);
	// A checagem vive aqui além do rail porque `?view=` é digitável e compartilhável.
	const canAccessSection = isSettingsSectionAccessible(section, membership);

	return (
		<div className="flex w-full grow flex-col gap-4 lg:flex-row lg:items-start">
			<SettingsNavRail
				activeView={view}
				membership={membership}
				onSelect={(next) => {
					setView(next);
					setSectionTab(null);
				}}
			/>

			<div className="flex w-full min-w-0 flex-col gap-4 lg:flex-1">
				<SettingsSectionHeader view={view} />

				{canAccessSection ? (
					<>
						{view === "profile" ? <SettingsProfile sessionUser={user} /> : null}
						{view === "organization" ? <SettingsOrg membership={membership} /> : null}
						{view === "modules" ? <SettingsModules membership={membership} /> : null}
						{view === "sales-channels" ? <SettingsSalesChannels membership={membership} /> : null}
						{view === "users" ? <SettingsUsers user={user} membership={membership} /> : null}
						{view === "devices" ? <SettingsDevices user={user} membership={membership} /> : null}
						{view === "meta-oauth" ? <SettingsWhatsAppConnection user={user} /> : null}
						{view === "message-templates" ? <CommunicationTemplatesPage organizationName={membership.organizacao.nome} /> : null}
						{view === "outbound" ? <SettingsOutbound membership={membership} /> : null}
						{view === "ai-agent" ? <SettingsAiAgent membership={membership} /> : null}
						{view === "ai-connections" ? <SettingsAiConnections membership={membership} /> : null}
						{view === "integration" ? <SettingsIntegration user={user} membership={membership} /> : null}
						{view === "finances" ? <SettingsFinances membership={membership} /> : null}
						{view === "segments" ? <SettingsSegments user={user} /> : null}
						{view === "custom-fields" ? <SettingsCustomFields membership={membership} /> : null}
					</>
				) : (
					<SettingsRestrictedState reason={section.restrictedReason} />
				)}
			</div>
		</div>
	);
}
