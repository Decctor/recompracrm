"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { TNormalizedMetaAdsMetrics } from "@/lib/integrations/meta/ads/types";
import {
	META_RESULT_LABELS,
	costPer,
	formatAdsCurrency,
	formatAdsNumber,
	formatAdsPercent,
	formatAdsRoas,
	pickMetaResultKey,
} from "@/lib/paid-media/format";
import { DeltaPill } from "../_components/paid-media-ui";

type SheetKpiStripProps = {
	metrics: TNormalizedMetaAdsMetrics | null | undefined;
	comparing: TNormalizedMetaAdsMetrics | null | undefined;
	currency: string;
	isLoading?: boolean;
};

/**
 * Os quatro números de um item no painel. O resultado é o do próprio item (uma campanha de cadastro
 * dentro de uma conta de vendas mostra leads), e o quarto número é ROAS só quando há receita.
 */
export function SheetKpiStrip({ metrics, comparing, currency, isLoading }: SheetKpiStripProps) {
	if (isLoading) {
		return (
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				{[0, 1, 2, 3].map((item) => (
					<Skeleton key={item} className="h-20 w-full" />
				))}
			</div>
		);
	}
	if (!metrics) return null;
	const resultKey = pickMetaResultKey(metrics);
	const label = META_RESULT_LABELS[resultKey];
	const cost = costPer(metrics.spend, metrics[resultKey]);
	const previousCost = comparing ? costPer(comparing.spend, comparing[resultKey]) : null;
	const hasRevenue = metrics.purchaseValue > 0;

	const tiles = [
		{
			label: "Investimento",
			value: formatAdsCurrency(metrics.spend, currency),
			delta: <DeltaPill current={metrics.spend} previous={comparing?.spend} />,
		},
		{
			label: label.plural,
			value: formatAdsNumber(metrics[resultKey]),
			delta: <DeltaPill current={metrics[resultKey]} previous={comparing?.[resultKey]} />,
		},
		{ label: label.costLabel, value: formatAdsCurrency(cost, currency), delta: <DeltaPill current={cost} previous={previousCost} lowerIsBetter /> },
		hasRevenue
			? {
					label: "ROAS",
					value: formatAdsRoas(metrics.purchaseRoas),
					delta: <DeltaPill current={metrics.purchaseRoas} previous={comparing?.purchaseRoas} />,
				}
			: { label: "CTR", value: formatAdsPercent(metrics.ctr), delta: <DeltaPill current={metrics.ctr} previous={comparing?.ctr} /> },
	];

	return (
		<div className="text-numeric grid grid-cols-2 gap-2 sm:grid-cols-4">
			{tiles.map((tile) => (
				<div key={tile.label} className="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5">
					<span className="text-label truncate text-muted-foreground">{tile.label}</span>
					<span className="text-lg font-black leading-none">{tile.value}</span>
					<span className="min-h-4">{tile.delta}</span>
				</div>
			))}
		</div>
	);
}

/** Título de bloco dentro do painel — o painel já é a moldura, então os blocos não ganham cartão. */
export function SheetBlockTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<h3 className="text-label text-muted-foreground">{children}</h3>
			{actions}
		</div>
	);
}
