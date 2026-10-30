"use client";

import { Panel } from "@/app/dashboard/_hub/panel";
import { Section } from "@/components/ui/section";
import type { TMetaAdsRichMetrics } from "@/lib/integrations/meta/ads/types";
import { costPer, formatAdsCurrency, formatAdsNumber, formatAdsPercent, formatAdsRoas } from "@/lib/paid-media/format";
import { useMetaAdsAccountInsights } from "@/lib/queries/meta-ads";
import { Eye, MousePointerClick, Target } from "lucide-react";
import type { ReactNode } from "react";
import { usePaidMedia } from "./paid-media-context";
import { DeltaText } from "./paid-media-ui";

type TMetricRow = {
	label: string;
	get: (metrics: TMetaAdsRichMetrics) => number | null;
	format: (value: number | null, currency: string) => string;
	lowerIsBetter?: boolean;
};

type TMetricGroup = { title: string; icon: ReactNode; rows: TMetricRow[] };

const money = (value: number | null, currency: string) => formatAdsCurrency(value, currency);
const count = (value: number | null) => formatAdsNumber(value);

const GROUPS: TMetricGroup[] = [
	{
		title: "Entrega",
		icon: <Eye />,
		rows: [
			{ label: "Impressões", get: (m) => m.impressions, format: count },
			{ label: "Alcance", get: (m) => m.reach, format: count },
			{ label: "Frequência", get: (m) => m.frequency, format: (value) => formatAdsNumber(value, 2) },
			{ label: "CPM", get: (m) => m.cpm, format: money, lowerIsBetter: true },
		],
	},
	{
		title: "Tráfego",
		icon: <MousePointerClick />,
		rows: [
			{ label: "Cliques", get: (m) => m.clicks, format: count },
			{ label: "Cliques no link", get: (m) => m.inlineLinkClicks, format: count },
			{ label: "CTR", get: (m) => m.ctr, format: (value) => formatAdsPercent(value) },
			{ label: "CPC", get: (m) => m.cpc, format: money, lowerIsBetter: true },
		],
	},
	{
		title: "Resultados na Meta",
		icon: <Target />,
		rows: [
			{ label: "Conversas iniciadas", get: (m) => m.messagingConversationsStarted, format: count },
			{ label: "Custo por conversa", get: (m) => costPer(m.spend, m.messagingConversationsStarted), format: money, lowerIsBetter: true },
			{ label: "Leads", get: (m) => m.leads, format: count },
			{ label: "Custo por lead", get: (m) => costPer(m.spend, m.leads), format: money, lowerIsBetter: true },
			{ label: "Compras", get: (m) => m.purchases, format: count },
			{ label: "Receita atribuída", get: (m) => m.purchaseValue, format: money },
			{ label: "ROAS", get: (m) => m.purchaseRoas, format: (value) => formatAdsRoas(value) },
		],
	},
];

/** Os números de apoio, agrupados pelo que respondem: a Meta entregou? as pessoas clicaram? converteu? */
export function MetricGroupsSection() {
	const { scope, currency } = usePaidMedia();
	const account = useMetaAdsAccountInsights({ scope });
	const current = account.data?.metrics;
	const previous = account.data?.comparing ?? null;

	return (
		<div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-3">
			{GROUPS.map((group) => (
				<Section.Root key={group.title}>
					<Section.Header>
						<Section.Icon>{group.icon}</Section.Icon>
						<Section.Title>{group.title}</Section.Title>
					</Section.Header>
					{account.isLoading ? (
						<Panel.Body>
							<Panel.Loading rows={group.rows.length} />
						</Panel.Body>
					) : account.isError || !current ? (
						<Panel.Body>
							<Panel.Error error={account.error} />
						</Panel.Body>
					) : (
						<Section.Bleed className="text-numeric">
							{group.rows.map((row) => {
								const value = row.get(current);
								return (
									<div key={row.label} className="flex items-center justify-between gap-3 border-border/60 border-b px-3 py-2 last:border-b-0">
										<span className="text-sm text-muted-foreground">{row.label}</span>
										<span className="flex items-baseline gap-2">
											<DeltaText current={value} previous={previous ? row.get(previous) : null} lowerIsBetter={row.lowerIsBetter} />
											<span className="text-sm font-bold">{row.format(value, currency)}</span>
										</span>
									</div>
								);
							})}
						</Section.Bleed>
					)}
				</Section.Root>
			))}
		</div>
	);
}
