"use client";

import { Panel } from "@/app/dashboard/_hub/panel";
import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Ranking } from "@/components/ui/ranking";
import { Section } from "@/components/ui/section";
import type { TMetaAdsInsightsRow } from "@/app/api/integrations/meta/ads/insights/route";
import { META_RESULT_LABELS, costPer, formatAdsCurrency, formatAdsFraction, formatAdsNumber, type TMetaResultKey } from "@/lib/paid-media/format";
import { useMetaAdsInsightRows } from "@/lib/queries/meta-ads";
import { BadgeDollarSign, CircleDollarSign, PieChart as PieChartIcon, Target, Trophy, Wallet } from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { type TPaidMediaSheetEntry, usePaidMedia } from "./paid-media-context";
import { DeltaText } from "./paid-media-ui";

type TRankingMetric = "spend" | "results" | "costPerResult";

const RANKING_LIMIT = 10;

function rankingValue(row: TMetaAdsInsightsRow, metric: TRankingMetric, resultKey: TMetaResultKey): number | null {
	if (metric === "spend") return row.metrics.spend;
	if (metric === "results") return row.metrics[resultKey];
	return costPer(row.metrics.spend, row.metrics[resultKey]);
}

function toEntry(row: TMetaAdsInsightsRow): TPaidMediaSheetEntry {
	return { type: "campaign", id: row.campaignId ?? "", name: row.campaignName ?? null };
}

function onActivate(event: KeyboardEvent, action: () => void) {
	if (event.key === "Enter" || event.key === " ") {
		event.preventDefault();
		action();
	}
}

/** Top 10 campanhas por investimento, resultados ou custo por resultado. Clicar abre a campanha. */
export function CampaignRankingSection() {
	const { scope, currency, resultKey, sheet } = usePaidMedia();
	const campaigns = useMetaAdsInsightRows({ scope, level: "campaign" });
	const [metric, setMetric] = useState<TRankingMetric>("spend");
	const resultLabel = META_RESULT_LABELS[resultKey];

	const ranked = useMemo(() => {
		const rows = (campaigns.data ?? []).filter((row) => row.campaignId);
		// Custo por resultado: menor é melhor, e campanha sem resultado não entra no ranking.
		if (metric === "costPerResult") {
			return rows
				.filter((row) => rankingValue(row, metric, resultKey) != null)
				.sort((a, b) => (rankingValue(a, metric, resultKey) ?? 0) - (rankingValue(b, metric, resultKey) ?? 0))
				.slice(0, RANKING_LIMIT);
		}
		return [...rows].sort((a, b) => (rankingValue(b, metric, resultKey) ?? 0) - (rankingValue(a, metric, resultKey) ?? 0)).slice(0, RANKING_LIMIT);
	}, [campaigns.data, metric, resultKey]);

	const total = useMemo(
		() => (campaigns.data ?? []).reduce((sum, row) => sum + (metric === "costPerResult" ? 0 : (rankingValue(row, metric, resultKey) ?? 0)), 0),
		[campaigns.data, metric, resultKey],
	);
	const siblings = ranked.map(toEntry);
	const format = (value: number | null) => (metric === "results" ? formatAdsNumber(value) : formatAdsCurrency(value, currency));

	return (
		<Section.Root className="lg:h-[520px]">
			<Section.Header>
				<Section.Icon>
					<Trophy />
				</Section.Icon>
				<Section.Title>Campanhas em destaque</Section.Title>
				<Section.Actions>
					<Ranking.Provider>
						<Ranking.SortButton active={metric === "spend"} tooltip="Investimento" onClick={() => setMetric("spend")}>
							<Wallet className="size-4" />
						</Ranking.SortButton>
						<Ranking.SortButton active={metric === "results"} tooltip={resultLabel.plural} onClick={() => setMetric("results")}>
							<Target className="size-4" />
						</Ranking.SortButton>
						<Ranking.SortButton
							active={metric === "costPerResult"}
							tooltip={`${resultLabel.costLabel} (menor primeiro)`}
							onClick={() => setMetric("costPerResult")}
						>
							<BadgeDollarSign className="size-4" />
						</Ranking.SortButton>
					</Ranking.Provider>
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				{campaigns.isLoading ? (
					<Panel.Loading rows={6} />
				) : campaigns.isError ? (
					<Panel.Error error={campaigns.error} />
				) : ranked.length === 0 ? (
					<Ranking.Empty>Nenhuma campanha com entrega no período.</Ranking.Empty>
				) : (
					<Ranking.List>
						{ranked.map((row, index) => {
							const value = rankingValue(row, metric, resultKey);
							const previousValue = row.comparing ? rankingValue({ ...row, metrics: row.comparing }, metric, resultKey) : null;
							const share = metric !== "costPerResult" && total > 0 && value != null ? value / total : null;
							const open = () => sheet.open(toEntry(row), { siblings });
							return (
								<Ranking.Item
									key={row.campaignId}
									rank={index + 1}
									role="button"
									tabIndex={0}
									onClick={open}
									onKeyDown={(event) => onActivate(event, open)}
									className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<Ranking.ItemTitleRow>
										<Ranking.ItemTitle tooltip={row.campaignName ?? undefined}>{row.campaignName ?? "Campanha sem nome"}</Ranking.ItemTitle>
									</Ranking.ItemTitleRow>
									<Ranking.ItemMeta>
										<span className="text-micro flex items-center gap-1.5 font-normal">
											{share != null ? <span>{formatAdsFraction(share)} do total</span> : null}
											<DeltaText current={value} previous={previousValue} lowerIsBetter={metric === "costPerResult"} />
										</span>
									</Ranking.ItemMeta>
									<Ranking.ItemMetric icon={metric === "results" ? Target : CircleDollarSign} value={format(value)} />
								</Ranking.Item>
							);
						})}
					</Ranking.List>
				)}
			</Section.Body>
		</Section.Root>
	);
}

const DONUT_SLICES = 5;

/** Para onde foi o dinheiro: as cinco campanhas de maior investimento e o resto somado em "Outras". */
export function SpendDistributionSection() {
	const { scope, currency } = usePaidMedia();
	const { colors } = useOrgColors();
	const campaigns = useMetaAdsInsightRows({ scope, level: "campaign" });

	const { slices, total } = useMemo(() => {
		const rows = (campaigns.data ?? []).filter((row) => row.metrics.spend > 0).sort((a, b) => b.metrics.spend - a.metrics.spend);
		const top = rows
			.slice(0, DONUT_SLICES)
			.map((row) => ({ key: row.campaignId ?? "", name: row.campaignName ?? "Campanha sem nome", value: row.metrics.spend }));
		const rest = rows.slice(DONUT_SLICES).reduce((sum, row) => sum + row.metrics.spend, 0);
		const all = rest > 0 ? [...top, { key: "others", name: "Outras campanhas", value: rest }] : top;
		return { slices: all, total: all.reduce((sum, slice) => sum + slice.value, 0) };
	}, [campaigns.data]);

	// Rampa da cor da organização: do tom cheio ao mais claro, e "Outras" sempre neutro.
	const sliceColor = (index: number, key: string) =>
		key === "others" ? "var(--muted-foreground)" : `color-mix(in oklab, ${colors.primary} ${100 - index * 16}%, var(--background))`;
	const config = Object.fromEntries(
		slices.map((slice, index) => [slice.key, { label: slice.name, color: sliceColor(index, slice.key) }]),
	) satisfies ChartConfig;

	return (
		<Section.Root className="lg:h-[520px]">
			<Section.Header>
				<Section.Icon>
					<PieChartIcon />
				</Section.Icon>
				<Section.Title>Distribuição do investimento</Section.Title>
			</Section.Header>
			<Section.Body>
				{campaigns.isLoading ? (
					<Panel.Loading rows={6} />
				) : campaigns.isError ? (
					<Panel.Error error={campaigns.error} />
				) : slices.length === 0 ? (
					<Ranking.Empty>Sem investimento no período.</Ranking.Empty>
				) : (
					<div className="text-numeric flex flex-col items-center gap-4">
						<div className="relative w-full">
							<ChartContainer config={config} className="mx-auto aspect-square h-[220px]">
								<PieChart>
									<ChartTooltip
										cursor={false}
										content={({ active, payload }) => {
											const item = active ? payload?.[0] : null;
											if (!item) return null;
											return (
												<div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-lg">
													<p className="font-bold">{String(item.name)}</p>
													<p className="text-muted-foreground">
														{formatAdsCurrency(Number(item.value), currency)} · {formatAdsFraction(total > 0 ? Number(item.value) / total : null)}
													</p>
												</div>
											);
										}}
									/>
									<Pie data={slices} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} strokeWidth={2} stroke="var(--card)">
										{slices.map((slice, index) => (
											<Cell key={slice.key} fill={sliceColor(index, slice.key)} />
										))}
									</Pie>
								</PieChart>
							</ChartContainer>
							<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
								<span className="text-label text-muted-foreground">Total</span>
								<span className="text-lg font-black">{formatAdsCurrency(total, currency)}</span>
							</div>
						</div>
						<ul className="flex w-full flex-col gap-1.5">
							{slices.map((slice, index) => (
								<li key={slice.key} className="flex items-center gap-2 text-sm">
									<span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: sliceColor(index, slice.key) }} />
									<span className="min-w-0 flex-1 truncate">{slice.name}</span>
									<span className="text-micro text-muted-foreground">{formatAdsFraction(total > 0 ? slice.value / total : null)}</span>
								</li>
							))}
						</ul>
					</div>
				)}
			</Section.Body>
		</Section.Root>
	);
}
