"use client";

import { ActionToolbar } from "@/components/ui/action-toolbar";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { appRoutes } from "@/lib/navigation/routes";
import { Tabs, TabsContent, TabsList, TabsTrigger, tabsPageToolbarActionsClassName, tabsPageToolbarClassName } from "@/components/ui/tabs";
import { Database, MessageCircle, MessageCircleIcon, Plus, TrendingUp } from "lucide-react";
import Link from "next/link";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { BlockedPhonesAlert } from "./blocked-phones-alert";
import { CampaignsDatabaseView } from "./database/campaigns-database-view";
import { CampaignsInteractionsView } from "./interactions/campaigns-interactions-view";
import { CampaignsStatsView } from "./stats/campaigns-stats-view";
import { CampaignTemplatesView } from "./templates/campaign-templates-view";

type CampaignsPageProps = {
	user: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};

function CampaignModuleActions() {
	return (
		<ActionToolbar>
			<ActionToolbar.Action asChild icon={Plus}>
				<Link href="/dashboard/communication/builder">NOVO TEMPLATE</Link>
			</ActionToolbar.Action>
			<ActionToolbar.Primary asChild icon={Plus}>
				<Link href={appRoutes.growth.newCampaign()}>NOVA CAMPANHA</Link>
			</ActionToolbar.Primary>
		</ActionToolbar>
	);
}

export default function CampaignsPage({ membership }: CampaignsPageProps) {
	const [viewMode, setViewMode] = useQueryState("view", parseAsStringEnum(["stats", "database", "interactions", "templates"]));

	return (
		<div className="flex h-full w-full flex-col gap-3">
			<BlockedPhonesAlert />
			<Tabs
				value={viewMode ?? "stats"}
				onValueChange={(v: string) => setViewMode(v as "stats" | "database" | "interactions" | "templates")}
				className="flex h-full w-full flex-col"
			>
				<div className={tabsPageToolbarClassName}>
					<TabsList variant="page">
						<TabsTrigger value="stats">
							<TrendingUp className="h-4 w-4 min-h-4 min-w-4" />
							Estatísticas
						</TabsTrigger>
						<TabsTrigger value="database">
							<Database className="h-4 w-4 min-h-4 min-w-4" />
							Minhas Campanhas
						</TabsTrigger>
						<TabsTrigger value="interactions">
							<MessageCircle className="h-4 w-4 min-h-4 min-w-4" />
							Interações
						</TabsTrigger>
						<TabsTrigger value="templates">
							<MessageCircleIcon className="h-4 w-4 min-h-4 min-w-4" />
							Modelos de Mensagens
						</TabsTrigger>
					</TabsList>
					<div className={tabsPageToolbarActionsClassName}>
						<CampaignModuleActions />
					</div>
				</div>
				<TabsContent value="stats" className="mt-3 flex flex-col gap-3">
					<CampaignsStatsView />
				</TabsContent>
				<TabsContent value="database" className="mt-3 flex flex-col gap-3">
					<CampaignsDatabaseView />
				</TabsContent>
				<TabsContent value="interactions" className="mt-3 flex flex-col gap-3">
					<CampaignsInteractionsView />
				</TabsContent>
				<TabsContent value="templates" className="mt-3 flex flex-col gap-3">
					<CampaignTemplatesView organizationName={membership.organizacao.nome} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
