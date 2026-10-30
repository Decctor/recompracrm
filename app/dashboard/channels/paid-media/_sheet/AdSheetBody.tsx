"use client";

import type { TGetMetaAdsAdOutput } from "@/app/api/integrations/meta/ads/ad/route";
import { Panel } from "@/app/dashboard/_hub/panel";
import SegmentedControl from "@/components/Utils/SegmentedControl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TMetaAdsQualityRankings, TMetaAdsSeriesPoint } from "@/lib/integrations/meta/ads/types";
import {
	META_RESULT_LABELS,
	type TRankingLevel,
	collapseRanking,
	formatAdsCurrency,
	formatAdsNumber,
	getMetaAdsManagerUrl,
	getMetaCtaLabel,
	getRankingLabel,
	pickMetaResultKey,
} from "@/lib/paid-media/format";
import { useMetaAdsAdById } from "@/lib/queries/meta-ads";
import { cn } from "@/lib/utils";
import { ExternalLink, Images, Megaphone } from "lucide-react";
import { useState } from "react";
import { BreakdownsSection } from "../_components/breakdowns-section";
import { ComparisonChart } from "../_components/comparison-chart";
import { usePaidMedia } from "../_components/paid-media-context";
import { AdsStatusChip, InfoRow } from "../_components/paid-media-ui";
import { SheetBlockTitle, SheetKpiStrip } from "./sheet-parts";

type TAdDetail = TGetMetaAdsAdOutput["data"]["byId"];

export function AdSheetBody({ adId, fallbackName }: { adId: string; fallbackName: string | null }) {
	const { scope, currency, adAccountNumericId, sheet } = usePaidMedia();
	const detail = useMetaAdsAdById({ scope, adId });
	const [chartMetric, setChartMetric] = useState<"spend" | "results">("spend");

	const ad = detail.data?.ad ?? null;
	const name = ad?.anuncioNome ?? fallbackName ?? "Anúncio";
	const metrics = detail.data?.summary;
	const resultKey = pickMetaResultKey(metrics);
	const pick = (point: TMetaAdsSeriesPoint) => ({ date: point.date, value: chartMetric === "spend" ? point.metrics.spend : point.metrics[resultKey] });

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h2 className="text-xl font-black leading-tight tracking-tight">{name}</h2>
				<div className="flex flex-wrap items-center gap-2">
					<AdsStatusChip status={ad?.status} />
					{ad?.campanhaId ? (
						<Button
							type="button"
							variant="ghost"
							size="xs"
							onClick={() => sheet.open({ type: "campaign", id: ad.campanhaId as string, name: ad.campanhaNome }, { push: true })}
						>
							<Megaphone />
							<span className="max-w-56 truncate normal-case">{ad.campanhaNome ?? "Ver campanha"}</span>
						</Button>
					) : null}
					{adAccountNumericId ? (
						<Button asChild variant="ghost" size="xs" className="ml-auto">
							<a href={getMetaAdsManagerUrl({ adAccountNumericId, level: "ad", entityId: adId })} target="_blank" rel="noreferrer">
								GERENCIADOR
								<ExternalLink />
							</a>
						</Button>
					) : null}
				</div>
				{ad?.conjuntoNome ? <span className="text-micro text-muted-foreground">Conjunto: {ad.conjuntoNome}</span> : null}
			</div>

			{detail.isError ? <Panel.Error error={detail.error} /> : null}

			<SheetKpiStrip metrics={metrics} comparing={detail.data?.comparing} currency={currency} isLoading={detail.isLoading} />

			{detail.isLoading ? <Skeleton className="h-72 w-full" /> : detail.data ? <CreativeBlock detail={detail.data} /> : null}

			{detail.data?.rankings ? <RankingsBlock rankings={detail.data.rankings} /> : null}

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
				{detail.isLoading ? (
					<Skeleton className="h-[220px] w-full" />
				) : detail.data ? (
					<ComparisonChart
						current={detail.data.daily.map(pick)}
						previous={null}
						formatValue={(value) => (chartMetric === "spend" ? formatAdsCurrency(value, currency) : formatAdsNumber(value))}
						height={220}
					/>
				) : null}
			</div>

			<BreakdownsSection objectId={adId} compact />
		</div>
	);
}

/** O criativo como ele roda: vídeo tocável quando a Meta libera a fonte, senão a capa; cartões do carrossel; textos e destino. */
function CreativeBlock({ detail }: { detail: TAdDetail }) {
	const ad = detail.ad;
	if (!ad) {
		return (
			<p className="rounded-xl border border-border border-dashed px-3 py-4 text-sm text-muted-foreground">
				Este anúncio ainda não está no catálogo. O criativo aparece depois da próxima sincronização.
			</p>
		);
	}
	const cta = getMetaCtaLabel(ad.cta);
	const videoSource = detail.video?.source;
	return (
		<div className="flex flex-col gap-3">
			<SheetBlockTitle>Criativo</SheetBlockTitle>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<div className="flex flex-col gap-2">
					<div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-muted">
						{videoSource ? (
							<video src={videoSource} poster={ad.capaUrl ?? detail.video?.picture} controls playsInline className="size-full object-contain" />
						) : ad.capaUrl ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img src={ad.capaUrl} alt={ad.titulo ?? ad.anuncioNome} className="size-full object-contain" />
						) : (
							<Images className="size-8 text-muted-foreground" />
						)}
					</div>
					{ad.cartoes.length > 1 ? (
						<div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/30">
							{ad.cartoes.map((card, index) => (
								<div key={`${card.imagemUrl ?? ""}-${index}`} className="flex w-28 shrink-0 flex-col gap-1">
									<div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
										{card.imagemUrl ? (
											// eslint-disable-next-line @next/next/no-img-element
											<img src={card.imagemUrl} alt={card.titulo ?? ""} loading="lazy" className="size-full object-cover" />
										) : null}
									</div>
									{card.titulo ? <span className="text-micro line-clamp-2">{card.titulo}</span> : null}
								</div>
							))}
						</div>
					) : null}
				</div>
				<div className="flex min-w-0 flex-col gap-3">
					{ad.titulo ? <p className="text-base font-bold leading-snug">{ad.titulo}</p> : null}
					{ad.corpo ? <p className="max-h-60 overflow-y-auto text-sm whitespace-pre-line text-foreground/90">{ad.corpo}</p> : null}
					<div className="flex flex-col">
						{cta ? <InfoRow label="Chamada">{cta}</InfoRow> : null}
						{ad.urlDestino ? (
							<InfoRow label="Destino">
								<a href={ad.urlDestino} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
									{ad.urlDestino.replace(/^https?:\/\//, "").slice(0, 60)}
								</a>
							</InfoRow>
						) : null}
						{ad.permalink ? (
							<InfoRow label="Publicação">
								<a
									href={ad.permalink}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
								>
									Ver no Instagram
									<ExternalLink className="size-3" />
								</a>
							</InfoRow>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

const RANKING_ROWS: { key: keyof TMetaAdsQualityRankings; label: string }[] = [
	{ key: "quality", label: "Qualidade" },
	{ key: "engagementRate", label: "Engajamento" },
	{ key: "conversionRate", label: "Conversão" },
];

const RANKING_SEGMENTS: { level: TRankingLevel; label: string; activeClassName: string }[] = [
	{ level: "BELOW", label: "Abaixo", activeClassName: "bg-destructive" },
	{ level: "AVERAGE", label: "Na média", activeClassName: "bg-warning" },
	{ level: "ABOVE", label: "Acima", activeClassName: "bg-success" },
];

/** Como a Meta compara este anúncio com os concorrentes no mesmo leilão. */
function RankingsBlock({ rankings }: { rankings: TMetaAdsQualityRankings }) {
	return (
		<div className="flex flex-col gap-3">
			<SheetBlockTitle>Relevância no leilão</SheetBlockTitle>
			<div className="flex flex-col gap-2.5">
				{RANKING_ROWS.map((row) => {
					const raw = rankings[row.key];
					const level = collapseRanking(raw);
					return (
						<div key={row.key} className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3">
							<span className="text-sm">{row.label}</span>
							<div className="flex flex-col gap-1">
								<div className="grid grid-cols-3 gap-1">
									{RANKING_SEGMENTS.map((segment) => (
										<span key={segment.level} className={cn("h-2 rounded-full", segment.level === level ? segment.activeClassName : "bg-muted")} />
									))}
								</div>
								<span className="text-micro text-muted-foreground">{getRankingLabel(raw)}</span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
