"use client";
import SettingsIntegration from "@/components/Settings/SettingsIntegration";
import SettingsOrg from "@/components/Settings/SettingsOrg";
import SettingsProfile from "@/components/Settings/SettingsProfile";
import SettingsSalesPromoCampaigns from "@/components/Settings/SettingsSalesPromoCampaigns";
import SettingsSegments from "@/components/Settings/SettingsSegments";
import SettingsUsers from "@/components/Settings/SettingsUsers";
import SettingsWhatsAppConnection from "@/components/Settings/SettingsWhatsAppConnection";
import SettingsWhatsappTemplates from "@/components/Settings/SettingsWhatsappTemplates";
import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { Button } from "@/components/ui/button";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { copyToClipboard } from "@/lib/utils";
import { Building2, Grid3x3, Key, MessageCircleIcon, Plug, Presentation, Trophy, User, UsersRound } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";
type SettingsPageProps = {
	user: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};
export default function SettingsPage({ user, membership }: SettingsPageProps) {
	const [view, setView] = useQueryState(
		"view",
		parseAsStringEnum(["profile", "users", "meta-oauth", "whatsapp-templates", "segments", "sales-promo-campaigns", "organization", "integration"]),
	);
	return (
		<div className="w-full h-full flex flex-col gap-3">
			<div className="w-full flex items-center justify-end">
				<Button
					variant="ghost"
					className="flex items-center gap-2"
					size="sm"
					onClick={() => copyToClipboard(`${process.env.NEXT_PUBLIC_APP_URL}/point-of-interaction/${membership.organizacao.id}`)}
				>
					<Presentation className="w-4 h-4 min-w-4 min-h-4" />
					PONTO DE INTERAÇÃO
				</Button>
			</div>

			<div className="w-full overflow-x-auto overflow-y-hidden scroll-smooth scrollbar-thin scrollbar-thumb-primary/5 scrollbar-track-transparent pb-4 mb-1">
				<div className="flex items-center justify-start gap-2 min-w-max">
					<Button
						variant={!view || view === "profile" ? "secondary" : "ghost"}
						className="flex items-center gap-2 whitespace-nowrap"
						size="sm"
						onClick={() => setView("profile")}
					>
						<User className="w-4 h-4 min-w-4 min-h-4" />
						MEU PERFIL
					</Button>
					<Button
						variant={view === "organization" ? "secondary" : "ghost"}
						className="flex items-center gap-2 whitespace-nowrap"
						size="sm"
						onClick={() => setView("organization")}
					>
						<Building2 className="w-4 h-4 min-w-4 min-h-4" />
						ORGANIZAÇÃO
					</Button>

					<Button
						variant={view === "integration" ? "secondary" : "ghost"}
						className="flex items-center gap-2 whitespace-nowrap"
						size="sm"
						onClick={() => setView("integration")}
					>
						<Plug className="w-4 h-4 min-w-4 min-h-4" />
						INTEGRAÇÃO
					</Button>
					<Button
						variant={view === "users" ? "secondary" : "ghost"}
						className="flex items-center gap-2 whitespace-nowrap"
						size="sm"
						onClick={() => setView("users")}
					>
						<UsersRound className="w-4 h-4 min-w-4 min-h-4" />
						USUÁRIOS
					</Button>
					<Button
						variant={view === "meta-oauth" ? "secondary" : "ghost"}
						className="flex items-center gap-2 whitespace-nowrap"
						size="sm"
						onClick={() => setView("meta-oauth")}
					>
						<Key className="w-4 h-4 min-w-4 min-h-4" />
						CONEXÃO COM WHATSAPP
					</Button>
					<Button
						variant={view === "whatsapp-templates" ? "secondary" : "ghost"}
						className="flex items-center gap-2 whitespace-nowrap"
						size="sm"
						onClick={() => setView("whatsapp-templates")}
					>
						<MessageCircleIcon className="w-4 h-4 min-w-4 min-h-4" />
						TEMPLATES WHATSAPP
					</Button>
					<Button
						variant={view === "segments" ? "secondary" : "ghost"}
						className="flex items-center gap-2 whitespace-nowrap"
						size="sm"
						onClick={() => setView("segments")}
					>
						<Grid3x3 className="w-4 h-4 min-w-4 min-h-4" />
						SEGMENTAÇÕES
					</Button>
					<Button
						variant={view === "sales-promo-campaigns" ? "secondary" : "ghost"}
						className="flex items-center gap-2 whitespace-nowrap"
						size="sm"
						onClick={() => setView("sales-promo-campaigns")}
					>
						<Trophy className="w-4 h-4 min-w-4 min-h-4" />
						CAMPANHAS DE PROMOÇÃO DE VENDAS
					</Button>
				</div>
			</div>
			{!view || view === "profile" ? <SettingsProfile sessionUser={user} /> : null}
			{view === "users" ? (
				membership.permissoes.usuarios.visualizar ? (
					<SettingsUsers user={user} membership={membership} />
				) : (
					<UnauthorizedPage />
				)
			) : null}
			{view === "meta-oauth" ? <SettingsWhatsAppConnection user={user} /> : null}
			{view === "whatsapp-templates" ? <SettingsWhatsappTemplates user={user} membership={membership} /> : null}
			{view === "segments" ? <SettingsSegments user={user} /> : null}
			{view === "sales-promo-campaigns" ? <SettingsSalesPromoCampaigns user={user} /> : null}
			{view === "organization" ? <SettingsOrg user={user} membership={membership} /> : null}
			{view === "integration" ? <SettingsIntegration user={user} membership={membership} /> : null}
		</div>
	);
}
