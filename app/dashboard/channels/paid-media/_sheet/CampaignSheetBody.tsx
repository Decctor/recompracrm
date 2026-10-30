"use client";

import type { TGetMetaAdsHierarchyOutput } from "@/app/api/integrations/meta/ads/hierarchy/route";
import { Panel } from "@/app/dashboard/_hub/panel";
import SegmentedControl from "@/components/Utils/SegmentedControl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TMetaAdsSeriesPoint } from "@/lib/integrations/meta/ads/types";
import {
	META_RESULT_LABELS,
	costPer,
	formatAdsCurrency,
	formatAdsNumber,
	getMetaAdsManagerUrl,
	getMetaObjectiveLabel,
	pickMetaResultKey,
} from "@/lib/paid-media/format";
import { useMetaAdsAccountInsights, useMetaAdsCampaignHierarchy, useMetaAdsInsightRows, useMetaAdsSeries } from "@/lib/queries/meta-ads";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { AdThumb } from "../_components/ad-library-section";
import { ComparisonChart } from "../_components/comparison-chart";
import { ConversionFunnelSection } from "../_components/conversion-funnel-section";
import { type TPaidMediaSheetEntry, usePaidMedia } from "../_components/paid-media-context";
import { AdsStatusChip } from "../_components/paid-media-ui";
import { SheetBlockTitle, SheetKpiStrip } from "./sheet-parts";

type TAdSetNode = TGetMetaAdsHierarchyOutput["data"]["adsets"][number];

export function CampaignSheetBody({ campaignId, fallbackName }: { campaignId: string; fallbackName: string | null }) {
	const { scope, currency, adAccountNumericId } = usePaidMedia();
	// Mesmas chaves das seções da página: o resumo e a linha da campanha já estão na cache.
	const totals = useMetaAdsAccountInsights({ scope, campaignId });
	const campaigns = useMetaAdsInsightRows({ scope, level: "campaign" });
	const series = useMetaAdsSeries({ scope, objectId: campaignId });
	const hierarchy = useMetaAdsCampaignHierarchy({ scope, campaignId });
	const [chartMetric, setChartMetric] = useState<"spend" | "results">("spend");

	const row = campaigns.data?.find((campaign) => campaign.campaignId === campaignId) ?? null;
	const name = row?.campaignName ?? fallbackName ?? "Campanha";
	const objective = getMetaObjectiveLabel(row?.campanhaObjetivo);
	const metrics = totals.data?.metrics;
	const resultKey = pickMetaResultKey(metrics);
	const formatChart = (value: number) => (chartMetric === "spend" ? formatAdsCurrency(value, currency) : formatAdsNumber(value));
	const pick = (point: TMetaAdsSeriesPoint) => ({ date: point.date, value: chartMetric === "spend" ? point.metrics.spend : point.metrics[resultKey] });
	const chartCurrent = (series.data?.current ?? []).map(pick);
	const chartPrevious = series.data?.comparing ? series.data.comparing.map(pick) : null;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h2 className="text-xl font-black leading-tight tracking-tight">{name}</h2>
				<div className="flex flex-wrap items-center gap-2">
					<AdsStatusChip status={row?.campanhaStatus} />
					{objective ? <span className="text-micro text-muted-foreground">Objetivo: {objective}</span> : null}
					{adAccountNumericId ? (
						<Button asChild variant="ghost" size="xs" className="ml-auto">
							<a href={getMetaAdsManagerUrl({ adAccountNumericId, level: "campaign", entityId: campaignId })} target="_blank" rel="noreferrer">
								GERENCIADOR
								<ExternalLink />
							</a>
						</Button>
					) : null}
				</div>
			</div>

			<SheetKpiStrip metrics={metrics} comparing={totals.data?.comparing} currency={currency} isLoading={totals.isLoading} />

			<div className="flex flex-col gap-3">
				<SheetBlockTitle
					actions={
						<SegmentedControl
							aria-label="Métrica do gráfico"
							value={chartMetric}
							onChange={setChartMetric}
							options={[
								{ value: "spend", label: "Investimento" },
								{ value: "results", label: META_RESULT_LABELS[resultKey].plural },
							]}
						/>
					}
				>
					Por dia
				</SheetBlockTitle>
				{series.isLoading ? (
					<Skeleton className="h-[220px] w-full" />
				) : series.isError ? (
					<Panel.Error error={series.error} />
				) : (
					<ComparisonChart current={chartCurrent} previous={chartPrevious} formatValue={formatChart} height={220} />
				)}
			</div>

			<div className="flex flex-col gap-3">
				<SheetBlockTitle>Conjuntos e anúncios</SheetBlockTitle>
				{hierarchy.isLoading ? (
					<Panel.Loading rows={5} />
				) : hierarchy.isError ? (
					<Panel.Error error={hierarchy.error} />
				) : (hierarchy.data ?? []).length === 0 ? (
					<p className="text-sm text-muted-foreground">Nenhum conjunto encontrado para esta campanha.</p>
				) : (
					<AdSetTree adsets={hierarchy.data ?? []} />
				)}
			</div>

			<ConversionFunnelSection objectId={campaignId} />
		</div>
	);
}

function AdSetTree({ adsets }: { adsets: TAdSetNode[] }) {
	const { currency, sheet } = usePaidMedia();
	// Os primeiros conjuntos abertos; os outros recolhidos para a árvore não virar uma parede.
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set(adsets.slice(0, 2).map((adset) => adset.adsetId)));
	const allAds = useMemo<TPaidMediaSheetEntry[]>(
		() => adsets.flatMap((adset) => adset.ads.map((ad) => ({ type: "ad" as const, id: ad.adId, name: ad.adName }))),
		[adsets],
	);

	const toggle = (adsetId: string) =>
		setExpanded((previous) => {
			const next = new Set(previous);
			if (next.has(adsetId)) next.delete(adsetId);
			else next.add(adsetId);
			return next;
		});

	return (
		<div className="text-numeric flex flex-col overflow-hidden rounded-xl border border-border">
			{adsets.map((adset) => {
				const isOpen = expanded.has(adset.adsetId);
				const resultKey = pickMetaResultKey(adset.metrics);
				return (
					<div key={adset.adsetId} className="border-border border-b last:border-b-0">
						<button
							type="button"
							onClick={() => toggle(adset.adsetId)}
							aria-expanded={isOpen}
							className="flex w-full items-center gap-2 bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`} />
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="truncate text-sm font-bold">{adset.adsetName ?? "Conjunto sem nome"}</span>
								<span className="text-micro text-muted-foreground">
									{adset.ads.length} anúncio(s) · {formatAdsCurrency(adset.metrics?.spend, currency)}
									{adset.metrics && adset.metrics[resultKey] > 0
										? ` · ${formatAdsNumber(adset.metrics[resultKey])} ${META_RESULT_LABELS[resultKey].plural.toLowerCase()}`
										: ""}
								</span>
							</span>
							<AdsStatusChip status={adset.adsetStatus} />
						</button>
						{isOpen ? (
							<div className="flex flex-col">
								{adset.ads.map((ad) => {
									const adResultKey = pickMetaResultKey(ad.metrics);
									return (
										<button
											key={ad.adId}
											type="button"
											onClick={() => sheet.open({ type: "ad", id: ad.adId, name: ad.adName }, { siblings: allAds, push: true })}
											className="flex w-full items-center gap-3 border-border/60 border-t px-3 py-2 pl-9 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<AdThumb
												ad={{ capaUrl: ad.ad?.capaUrl ?? null, anuncioNome: ad.adName, tipoMidia: ad.ad?.tipoMidia ?? "DESCONHECIDO" }}
												className="size-9"
											/>
											<span className="flex min-w-0 flex-1 flex-col">
												<span className="truncate text-sm">{ad.adName}</span>
												<span className="text-micro text-muted-foreground">
													{ad.metrics
														? `${formatAdsCurrency(ad.metrics.spend, currency)} · ${formatAdsNumber(ad.metrics[adResultKey])} ${META_RESULT_LABELS[adResultKey].plural.toLowerCase()} · ${formatAdsCurrency(costPer(ad.metrics.spend, ad.metrics[adResultKey]), currency)} cada`
														: "Sem entrega no período"}
												</span>
											</span>
											<AdsStatusChip status={ad.ad?.status} />
										</button>
									);
								})}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
