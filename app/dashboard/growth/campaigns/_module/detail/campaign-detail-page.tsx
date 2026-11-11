"use client";

import CampaignStatsView from "@/app/dashboard/growth/campaigns/_module/detail/campaign-stats-view";
import { appRoutes } from "@/lib/navigation/routes";
import CampaignConfigView from "@/app/dashboard/growth/campaigns/_module/detail/campaign-config-view";
import CampaignSurveyResultsView from "@/app/dashboard/growth/campaigns/_module/detail/campaign-survey-results-view";
import PauseCampaignDialog from "@/app/dashboard/growth/campaigns/_module/detail/components/pause-campaign-dialog";
import { getTriggerMeta } from "@/app/dashboard/growth/campaigns/_module/builder/helpers/triggers";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { updateCampaign } from "@/lib/mutations/campaigns";
import { useCampaignById } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Database, ListChecks, Megaphone, Pause, PlayIcon, TrendingUp } from "lucide-react";
import Link from "next/link";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";

type CampaignResultPageProps = {
	campaignId: string;
	sessionUser: TAuthUserSession["user"];
	sessionUserOrg: NonNullable<TAuthUserSession["membership"]>["organizacao"];
};

export default function CampaignResultPage({ campaignId, sessionUser, sessionUserOrg }: CampaignResultPageProps) {
	const queryClient = useQueryClient();
	const [viewMode, setViewMode] = useQueryState("view", parseAsStringEnum(["stats", "config", "survey"]));
	const [pauseDialogOpen, setPauseDialogOpen] = useState(false);

	const { data: campaign, isLoading, isError, error } = useCampaignById({ id: campaignId });

	const { mutate: handleStatusMutation, isPending: statusIsPending } = useMutation({
		mutationKey: ["update-campaign-status", campaignId],
		mutationFn: updateCampaign,
		onSuccess: async (data) => {
			toast.success(data.message);
			await queryClient.invalidateQueries({ queryKey: ["campaign-by-id", campaignId] });
			await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
			setPauseDialogOpen(false);
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	if (isLoading) return <LoadingComponent />;
	if (isError || !campaign) return <ErrorComponent msg={getErrorMessage(error) ?? "Campanha não encontrada."} />;

	// Pesquisas abrem nas respostas: é o que o usuário veio ver.
	const isSurvey = campaign.gatilhoTipo === "PESQUISA";
	const activeView = viewMode ?? (isSurvey ? "survey" : "stats");
	const trigger = getTriggerMeta(campaign.gatilhoTipo);
	const TriggerIcon = trigger?.icon ?? Megaphone;

	return (
		<div className="flex h-full w-full flex-col gap-3">
			<div className="flex w-full flex-col gap-2">
				<Button variant="ghost" size="sm" asChild className="flex w-fit items-center gap-1.5 px-2">
					<Link href={`${appRoutes.growth.campaigns()}?view=database`}>
						<ArrowLeft className="h-4 w-4 min-h-4 min-w-4" />
						VOLTAR
					</Link>
				</Button>
				<div className="flex w-full flex-col items-start justify-between gap-3 lg:flex-row">
					<div className="flex min-w-0 items-center gap-3">
						<span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card" aria-hidden>
							<TriggerIcon className="size-5 min-h-5 min-w-5" />
						</span>
						<div className="flex min-w-0 flex-col items-start">
							<h1 className="text-lg font-bold tracking-tight">{campaign.titulo}</h1>
							{campaign.descricao ? <p className="text-sm font-medium tracking-tight text-muted-foreground">{campaign.descricao}</p> : null}
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{trigger ? (
							<span className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-[0.65rem] font-bold tracking-tight uppercase">
								<TriggerIcon className="size-3.5 min-h-3.5 min-w-3.5" />
								{trigger.label}
							</span>
						) : null}
						{campaign.ativo ? (
							<>
								<div className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 bg-green-500 text-white")}>
									<Check className="h-4 min-h-4 w-4 min-w-4" />
									<p className="text-[0.65rem] font-bold tracking-tight uppercase">ATIVA</p>
								</div>
								<Button variant="outline" size="sm" disabled={statusIsPending} className="flex items-center gap-1.5" onClick={() => setPauseDialogOpen(true)}>
									<Pause className="h-4 min-h-4 w-4 min-w-4" />
									PAUSAR
								</Button>
							</>
						) : (
							<Button
								variant="ghost"
								size="fit"
								disabled={statusIsPending}
								className="flex items-center gap-1.5 rounded-xl bg-green-500 px-3 py-1.5 text-white hover:bg-green-600 hover:text-white dark:bg-green-600 dark:hover:bg-green-700"
								onClick={() => handleStatusMutation({ campaignId, campaign: { ...campaign, ativo: true }, segmentations: campaign.segmentacoes ?? [] })}
							>
								<PlayIcon className="h-4 min-h-4 w-4 min-w-4" />
								ATIVAR
							</Button>
						)}
					</div>
				</div>
			</div>

			<Tabs value={activeView} onValueChange={(value) => setViewMode(value as "stats" | "config" | "survey")}>
				<TabsList variant="page">
					{isSurvey ? (
						<TabsTrigger value="survey">
							<ListChecks className="h-4 w-4 min-h-4 min-w-4" />
							Respostas
						</TabsTrigger>
					) : null}
					<TabsTrigger value="stats">
						<TrendingUp className="h-4 w-4 min-h-4 min-w-4" />
						Estatísticas
					</TabsTrigger>
					<TabsTrigger value="config">
						<Database className="h-4 w-4 min-h-4 min-w-4" />
						Minha campanha
					</TabsTrigger>
				</TabsList>
				{isSurvey ? (
					<TabsContent value="survey" className="flex flex-col gap-3">
						<CampaignSurveyResultsView campaignId={campaignId} />
					</TabsContent>
				) : null}
				<TabsContent value="stats" className="flex flex-col gap-3">
					<CampaignStatsView campaignId={campaignId} />
				</TabsContent>
				<TabsContent value="config" className="flex flex-col gap-3">
					<CampaignConfigView campaign={campaign} sessionUser={sessionUser} sessionUserOrg={sessionUserOrg} />
				</TabsContent>
			</Tabs>

			<PauseCampaignDialog
				open={pauseDialogOpen}
				isPending={statusIsPending}
				onCancel={() => setPauseDialogOpen(false)}
				onConfirm={() => handleStatusMutation({ campaignId, campaign: { ...campaign, ativo: false }, segmentations: campaign.segmentacoes ?? [] })}
			/>
		</div>
	);
}
