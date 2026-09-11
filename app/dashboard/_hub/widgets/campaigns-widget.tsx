"use client";

import { CampaignFunnelStages } from "@/components/Campaigns/CampaignFunnelStages";
import { InteractionCard } from "@/components/Interactions/InteractionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDecimalPlaces } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { useCampaignFunnel, useCampaignInteractionsLogs } from "@/lib/queries/campaigns";
import { useCampaignsHealth } from "@/lib/queries/dashboard-hub";
import { cn } from "@/lib/utils";
import { Megaphone } from "lucide-react";
import { useMemo } from "react";
import { HubWidget } from "../hub-widget";
import type { TDashboardWidgetProps } from "../registry";
import { resolveTodayRange, useDayKey } from "../use-day-key";

const INTERACTIONS_LIMIT = 5;

/**
 * Campanhas no dashboard: o mesmo funil de engajamento da tela de campanhas à esquerda e as últimas
 * mensagens que saíram à direita, cada uma com o preview do que o cliente recebeu.
 *
 * As linhas montam `InteractionCard` sem o `Frame`: a moldura é a do widget, e card dentro de card
 * seria aninhamento. O preview no hover vem de graça, é o mesmo componente da aba de Interações.
 */
export function CampaignsWidget(_props: TDashboardWidgetProps) {
	const dayKey = useDayKey();
	const range = useMemo(() => {
		const { after, before } = resolveTodayRange(dayKey);
		return { dayStart: after.toDate(), startDate: after.subtract(6, "day").toDate(), endDate: before.toDate() };
	}, [dayKey]);

	const funnel = useCampaignFunnel({ startDate: range.startDate, endDate: range.endDate });
	const health = useCampaignsHealth({ dayStart: range.dayStart });
	const logs = useCampaignInteractionsLogs({
		initialFilters: { page: 1, search: null, status: [], orderByField: "dataEnvio", orderByDirection: "desc", campanhaId: null },
	});

	const interactions = logs.data?.items ?? [];
	const falhas = health.data?.hoje.falhas ?? 0;
	const bloqueadas = health.data?.hoje.bloqueadas ?? 0;
	const quota = health.data?.quotaSemanal;
	const quotaRatio = quota?.limite ? Math.min(quota.usados / quota.limite, 1) : null;
	const enviados = funnel.data?.enviados ?? 0;

	const isPending = funnel.isPending || health.isPending;

	return (
		<HubWidget attention={falhas > 0}>
			<HubWidget.Header
				icon={<Megaphone />}
				title="Campanhas"
				hint="Últimos 7 dias"
				href={`${appRoutes.growth.campaigns()}?view=stats`}
				hrefLabel="Estatísticas"
			/>

			{isPending ? (
				<HubWidget.Loading rows={5} />
			) : funnel.isError || health.isError ? (
				<HubWidget.Error error={funnel.error ?? health.error} />
			) : enviados === 0 && falhas === 0 ? (
				<HubWidget.Empty message="Nenhuma mensagem enviada nos últimos 7 dias." />
			) : (
				<div className="grid w-full gap-x-6 gap-y-4 lg:grid-cols-2">
					<div className="flex min-w-0 flex-col gap-3">
						{funnel.data ? <CampaignFunnelStages funnel={funnel.data} density="compact" /> : null}
						<HubWidget.Details>
							{falhas > 0 ? <HubWidget.Detail label="Falhas de envio hoje" value={formatDecimalPlaces(falhas)} tone="destructive" /> : null}
							{bloqueadas > 0 ? <HubWidget.Detail label="Bloqueadas pelo limite hoje" value={formatDecimalPlaces(bloqueadas)} tone="destructive" /> : null}
							{quota?.limite ? (
								<div className="flex flex-col gap-1 pt-1">
									<div className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground">Mensagens da semana</span>
										<span className="font-semibold tabular-nums">
											{formatDecimalPlaces(quota.usados)} / {formatDecimalPlaces(quota.limite)}
										</span>
									</div>
									<div
										className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15"
										role="meter"
										aria-label="Mensagens enviadas na semana"
										aria-valuemin={0}
										aria-valuemax={quota.limite}
										aria-valuenow={quota.usados}
									>
										<div
											className={cn("h-full rounded-full", quotaRatio !== null && quotaRatio >= 0.9 ? "bg-destructive" : "bg-primary")}
											style={{ width: `${(quotaRatio ?? 0) * 100}%` }}
										/>
									</div>
								</div>
							) : null}
						</HubWidget.Details>
					</div>

					<div className="flex min-w-0 flex-col gap-2">
						<span className="text-micro text-muted-foreground">Últimas mensagens</span>
						{logs.isPending ? (
							<div className="flex flex-col gap-2" aria-busy>
								{Array.from({ length: 3 }, (_, index) => (
									<Skeleton key={index} className="h-10 w-full rounded-lg" />
								))}
							</div>
						) : interactions.length === 0 ? (
							<p className="text-xs text-muted-foreground">Nenhuma mensagem enviada ainda.</p>
						) : (
							<ul className="flex flex-col divide-y divide-border/70">
								{interactions.slice(0, INTERACTIONS_LIMIT).map((interaction) => (
									<li key={interaction.id} className="py-1.5 first:pt-0 last:pb-0">
										<InteractionCard.Provider interaction={interaction}>
											<InteractionCard.Header>
												<InteractionCard.Leading className="min-w-0 gap-2">
													<InteractionCard.ClientChip />
												</InteractionCard.Leading>
												<InteractionCard.Actions className="shrink-0 gap-1">
													<InteractionCard.MessagePreview />
													<InteractionCard.SentStatus />
												</InteractionCard.Actions>
											</InteractionCard.Header>
											<p className="truncate text-[0.7rem] text-muted-foreground">{interaction.campanha?.titulo ?? "Campanha removida"}</p>
										</InteractionCard.Provider>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			)}
		</HubWidget>
	);
}
