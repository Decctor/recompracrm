"use client";

import type { TMetaAdsInsightsRow } from "@/app/api/integrations/meta/ads/insights/route";
import { HubTable } from "@/app/dashboard/_hub/hub-table";
import { Panel } from "@/app/dashboard/_hub/panel";
import { Section } from "@/components/ui/section";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TMetaAdsRichMetrics } from "@/lib/integrations/meta/ads/types";
import {
	META_RESULT_LABELS,
	costPer,
	formatAdsCurrency,
	formatAdsNumber,
	formatAdsPercent,
	formatAdsRoas,
	getMetaObjectiveLabel,
} from "@/lib/paid-media/format";
import { useMetaAdsInsightRows } from "@/lib/queries/meta-ads";
import { Megaphone } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { type TPaidMediaSheetEntry, usePaidMedia } from "./paid-media-context";
import { AdsStatusChip, DeltaText } from "./paid-media-ui";

type TCampaignSort = "spend" | "results" | "costPerResult" | "ctr" | "roas";

function toEntry(row: TMetaAdsInsightsRow): TPaidMediaSheetEntry {
	return { type: "campaign", id: row.campaignId ?? "", name: row.campaignName ?? null };
}

function ValueWithDelta({ value, delta }: { value: string; delta: ReactNode }) {
	return (
		<span className="inline-flex flex-col items-start gap-0 sm:items-end">
			<span>{value}</span>
			{delta}
		</span>
	);
}

/** Todas as campanhas com entrega no período, com a variação de cada número contra a comparação. */
export function CampaignsTableSection() {
	const { scope, currency, resultKey, sheet } = usePaidMedia();
	const campaigns = useMetaAdsInsightRows({ scope, level: "campaign" });
	const [sort, setSort] = useState<TCampaignSort>("spend");
	const resultLabel = META_RESULT_LABELS[resultKey];

	const getters: Record<TCampaignSort, (m: TMetaAdsRichMetrics) => number | null> = useMemo(
		() => ({
			spend: (m) => m.spend,
			results: (m) => m[resultKey],
			costPerResult: (m) => costPer(m.spend, m[resultKey]),
			ctr: (m) => m.ctr,
			roas: (m) => m.purchaseRoas,
		}),
		[resultKey],
	);

	const rows = useMemo(() => {
		const list = (campaigns.data ?? []).filter((row) => row.campaignId);
		const get = getters[sort];
		const direction = sort === "costPerResult" ? 1 : -1;
		return [...list].sort((a, b) => {
			const va = get(a.metrics);
			const vb = get(b.metrics);
			if (va == null) return 1;
			if (vb == null) return -1;
			return (va - vb) * direction;
		});
	}, [campaigns.data, getters, sort]);
	const siblings = rows.map(toEntry);

	const sortOptions: { value: TCampaignSort; label: string }[] = [
		{ value: "spend", label: "Maior investimento" },
		{ value: "results", label: `Mais ${resultLabel.plural.toLowerCase()}` },
		{ value: "costPerResult", label: `Menor ${resultLabel.costLabel.toLowerCase()}` },
		{ value: "ctr", label: "Maior CTR" },
		{ value: "roas", label: "Maior ROAS" },
	];

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Megaphone />
				</Section.Icon>
				<Section.Title>Campanhas</Section.Title>
				{campaigns.data ? <Section.Count>{rows.length}</Section.Count> : null}
				<Section.Actions>
					<Select
						items={sortOptions}
						value={sort}
						onValueChange={(value) => {
							if (value !== null) setSort(value as TCampaignSort);
						}}
					>
						<SelectTrigger size="sm" aria-label="Ordenação">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{sortOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Section.Actions>
			</Section.Header>
			{campaigns.isLoading ? (
				<Panel.Body>
					<Panel.Loading rows={6} />
				</Panel.Body>
			) : campaigns.isError ? (
				<Panel.Body>
					<Panel.Error error={campaigns.error} />
				</Panel.Body>
			) : rows.length === 0 ? (
				<Panel.Body>
					<p className="text-sm text-muted-foreground">Nenhuma campanha com entrega no período.</p>
				</Panel.Body>
			) : (
				<Section.Bleed className="text-numeric">
					<HubTable
						columns={[
							{ id: "campaign", header: "Campanha", track: "minmax(0,2.4fr)" },
							{ id: "status", header: "Status", track: "minmax(0,1fr)" },
							{ id: "spend", header: "Investimento", track: "minmax(0,1fr)", align: "right" },
							{ id: "results", header: resultLabel.plural, track: "minmax(0,0.8fr)", align: "right" },
							{ id: "cost", header: "Custo/result.", track: "minmax(0,1fr)", align: "right" },
							{ id: "ctr", header: "CTR", track: "minmax(0,0.7fr)", align: "right" },
							{ id: "roas", header: "ROAS", track: "minmax(0,0.7fr)", align: "right" },
						]}
						rows={rows.map((row) => {
							const { metrics, comparing } = row;
							const cost = getters.costPerResult(metrics);
							const objective = getMetaObjectiveLabel(row.campanhaObjetivo);
							return {
								id: row.campaignId ?? "",
								onSelect: () => sheet.open(toEntry(row), { siblings }),
								cells: {
									campaign: (
										<span className="flex min-w-0 flex-col">
											<span className="truncate">{row.campaignName ?? "Campanha sem nome"}</span>
											{objective ? <span className="text-micro truncate font-normal text-muted-foreground">{objective}</span> : null}
										</span>
									),
									status: <AdsStatusChip status={row.campanhaStatus} />,
									spend: (
										<ValueWithDelta
											value={formatAdsCurrency(metrics.spend, currency)}
											delta={<DeltaText current={metrics.spend} previous={comparing?.spend} />}
										/>
									),
									results: (
										<ValueWithDelta
											value={formatAdsNumber(metrics[resultKey])}
											delta={<DeltaText current={metrics[resultKey]} previous={comparing?.[resultKey]} />}
										/>
									),
									cost: (
										<ValueWithDelta
											value={formatAdsCurrency(cost, currency)}
											delta={<DeltaText current={cost} previous={comparing ? getters.costPerResult(comparing) : null} lowerIsBetter />}
										/>
									),
									ctr: <ValueWithDelta value={formatAdsPercent(metrics.ctr)} delta={<DeltaText current={metrics.ctr} previous={comparing?.ctr} />} />,
									roas: formatAdsRoas(metrics.purchaseRoas),
								},
							};
						})}
					/>
				</Section.Bleed>
			)}
		</Section.Root>
	);
}
