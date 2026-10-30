"use client";

import { StatTile } from "@/app/dashboard/_hub/panel";
import { KpiSparkline } from "@/app/dashboard/finance/_components/finance-chart-kit";
import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TNormalizedMetaAdsMetrics } from "@/lib/integrations/meta/ads/types";
import { META_RESULT_LABELS, costPer, formatAdsCurrency, formatAdsNumber, formatAdsPercent, formatAdsRoas } from "@/lib/paid-media/format";
import { getErrorMessage } from "@/lib/errors";
import { useMetaAdsAccountInsights, useMetaAdsSeries } from "@/lib/queries/meta-ads";
import { ChartSpline } from "lucide-react";
import { useMemo, useState } from "react";
import { ComparisonChart } from "./comparison-chart";
import { usePaidMedia } from "./paid-media-context";
import { DeltaPill } from "./paid-media-ui";

type TCurveMetric =
	| "spend"
	| "impressions"
	| "reach"
	| "inlineLinkClicks"
	| "leads"
	| "messagingConversationsStarted"
	| "purchases"
	| "purchaseValue";

const CURVE_METRICS: Record<TCurveMetric, { label: string; kind: "currency" | "number"; cumulative: boolean }> = {
	spend: { label: "Investimento", kind: "currency", cumulative: true },
	impressions: { label: "Impressões", kind: "number", cumulative: true },
	reach: { label: "Alcance", kind: "number", cumulative: false },
	inlineLinkClicks: { label: "Cliques no link", kind: "number", cumulative: true },
	leads: { label: "Leads", kind: "number", cumulative: true },
	messagingConversationsStarted: { label: "Conversas", kind: "number", cumulative: true },
	purchases: { label: "Compras", kind: "number", cumulative: true },
	purchaseValue: { label: "Receita (Meta)", kind: "currency", cumulative: true },
};
const CURVE_METRIC_ORDER: TCurveMetric[] = [
	"spend",
	"impressions",
	"reach",
	"inlineLinkClicks",
	"messagingConversationsStarted",
	"leads",
	"purchases",
	"purchaseValue",
];

function seriesOf(points: { date: string; metrics: TNormalizedMetaAdsMetrics }[] | null | undefined, pick: (m: TNormalizedMetaAdsMetrics) => number) {
	return (points ?? []).map((point) => ({ date: point.date, value: pick(point.metrics) }));
}

/** Os quatro números da conta no período, com a comparação, e a evolução diária logo abaixo. */
export function SummarySection() {
	const { scope, currency, resultKey } = usePaidMedia();
	const { getChartColors } = useOrgColors();
	const sparkColor = getChartColors().current;
	const account = useMetaAdsAccountInsights({ scope });
	const series = useMetaAdsSeries({ scope });
	const [metric, setMetric] = useState<TCurveMetric>("spend");
	const [mode, setMode] = useState<"daily" | "cumulative">("daily");

	const current = account.data?.metrics;
	const previous = account.data?.comparing ?? null;
	const resultLabel = META_RESULT_LABELS[resultKey];
	// Conta sem receita atribuída pela Meta (anúncios para o WhatsApp, cadastros): o ROAS seria "—"
	// sempre, então o quarto número vira o CTR.
	const showRoas = (current?.purchaseValue ?? 0) > 0 || (previous?.purchaseValue ?? 0) > 0;

	const sparks = useMemo(() => {
		const points = series.data?.current ?? [];
		return {
			spend: points.map((point) => point.metrics.spend),
			results: points.map((point) => point.metrics[resultKey]),
			costPerResult: points.map((point) => costPer(point.metrics.spend, point.metrics[resultKey]) ?? 0),
		};
	}, [series.data, resultKey]);

	const metricMeta = CURVE_METRICS[metric];
	const effectiveMode = metricMeta.cumulative ? mode : "daily";
	const chartCurrent = useMemo(() => seriesOf(series.data?.current, (m) => m[metric]), [series.data, metric]);
	const chartPrevious = useMemo(() => (series.data?.comparing ? seriesOf(series.data.comparing, (m) => m[metric]) : null), [series.data, metric]);
	const formatChartValue = (value: number) => (metricMeta.kind === "currency" ? formatAdsCurrency(value, currency) : formatAdsNumber(value));

	const currentCost = current ? costPer(current.spend, current[resultKey]) : null;
	const previousCost = previous ? costPer(previous.spend, previous[resultKey]) : null;
	const comparing = (value: string) => (previous ? `vs. ${value} na comparação` : undefined);

	return (
		<div className="flex w-full flex-col gap-3">
			{account.isLoading ? (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
					{[0, 1, 2, 3].map((item) => (
						<Skeleton key={item} className="h-36 w-full" />
					))}
				</div>
			) : account.isError || !current ? (
				<Callout.Root tone="danger">
					<Callout.Title>Não foi possível carregar os resultados da conta</Callout.Title>
					<Callout.Description>{getErrorMessage(account.error)}</Callout.Description>
				</Callout.Root>
			) : (
				<div className="text-numeric grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<StatTile
						label="Investimento"
						value={formatAdsCurrency(current.spend, currency)}
						delta={<DeltaPill current={current.spend} previous={previous?.spend} />}
						caption={comparing(formatAdsCurrency(previous?.spend, currency))}
					>
						<KpiSparkline values={sparks.spend} label="Por dia" color={sparkColor} />
					</StatTile>
					<StatTile
						label={resultLabel.plural}
						value={formatAdsNumber(current[resultKey])}
						delta={<DeltaPill current={current[resultKey]} previous={previous?.[resultKey]} />}
						caption={comparing(formatAdsNumber(previous?.[resultKey]))}
					>
						<KpiSparkline values={sparks.results} label="Por dia" color={sparkColor} />
					</StatTile>
					<StatTile
						label={resultLabel.costLabel}
						value={formatAdsCurrency(currentCost, currency)}
						delta={<DeltaPill current={currentCost} previous={previousCost} lowerIsBetter />}
						caption={comparing(formatAdsCurrency(previousCost, currency)) ?? "Menor é melhor"}
					>
						<KpiSparkline values={sparks.costPerResult} label="Por dia" color={sparkColor} />
					</StatTile>
					{showRoas ? (
						<StatTile
							label="ROAS (Meta)"
							value={formatAdsRoas(current.purchaseRoas)}
							delta={<DeltaPill current={current.purchaseRoas} previous={previous?.purchaseRoas} />}
							caption={`Receita atribuída pela Meta: ${formatAdsCurrency(current.purchaseValue, currency)}`}
						/>
					) : (
						<StatTile
							label="CTR"
							value={formatAdsPercent(current.ctr)}
							delta={<DeltaPill current={current.ctr} previous={previous?.ctr} />}
							caption={comparing(formatAdsPercent(previous?.ctr)) ?? "Cliques ÷ impressões"}
						/>
					)}
				</div>
			)}

			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<ChartSpline />
					</Section.Icon>
					<Section.Title>Evolução diária</Section.Title>
					<Section.Actions>
						<Tabs value={effectiveMode} onValueChange={(value) => setMode(value as "daily" | "cumulative")}>
							<TabsList>
								<TabsTrigger value="daily">Por dia</TabsTrigger>
								<TabsTrigger value="cumulative" disabled={!metricMeta.cumulative}>
									Acumulado
								</TabsTrigger>
							</TabsList>
						</Tabs>
					</Section.Actions>
				</Section.Header>
				<Section.Body>
					<Tabs value={metric} onValueChange={(value) => setMetric(value as TCurveMetric)}>
						<TabsList variant="page">
							{CURVE_METRIC_ORDER.map((key) => (
								<TabsTrigger key={key} value={key}>
									{CURVE_METRICS[key].label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
					{!metricMeta.cumulative ? (
						<p className="text-micro text-muted-foreground">Alcance conta pessoas únicas por dia; somar os dias contaria a mesma pessoa várias vezes.</p>
					) : null}
					{series.isLoading ? (
						<Skeleton className="h-[280px] w-full" />
					) : series.isError ? (
						<p className="py-8 text-center text-sm text-muted-foreground">{getErrorMessage(series.error)}</p>
					) : (
						<ComparisonChart current={chartCurrent} previous={chartPrevious} cumulative={effectiveMode === "cumulative"} formatValue={formatChartValue} />
					)}
				</Section.Body>
			</Section.Root>
		</div>
	);
}
