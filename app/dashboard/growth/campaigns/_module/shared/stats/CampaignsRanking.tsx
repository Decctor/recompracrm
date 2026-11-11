"use client";

import type { TGetCampaignRankingInput } from "@/app/api/campaigns/stats/ranking/route";
import { getTriggerMeta } from "@/app/dashboard/growth/campaigns/_module/builder/helpers/triggers";
import { Section } from "@/components/ui/section";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { useCampaignRanking } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, BadgeDollarSign, Crown, Megaphone, MousePointerClick, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type TRankingBy = NonNullable<TGetCampaignRankingInput["rankingBy"]>;

const RANKING_OPTIONS: { value: TRankingBy; label: string; icon: typeof BadgeDollarSign }[] = [
	{ value: "revenue", label: "Receita", icon: BadgeDollarSign },
	{ value: "conversions", label: "Conversões", icon: MousePointerClick },
	{ value: "conversion-rate", label: "Taxa", icon: TrendingUp },
];

const PODIUM_CLASSES = ["bg-[#FFB900] text-white", "bg-slate-400 text-white", "bg-orange-600 text-white"];

type CampaignsRankingProps = {
	startDate: Date | null;
	endDate: Date | null;
	comparingStartDate: Date | null;
	comparingEndDate: Date | null;
};

function PositionDelta({ delta }: { delta: number | null }) {
	if (delta == null || delta === 0) {
		return <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.65rem] font-bold text-muted-foreground">–</span>;
	}
	const up = delta > 0;
	const Icon = up ? ArrowUp : ArrowDown;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums",
				up ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
			)}
		>
			<Icon className="size-3 min-h-3 min-w-3" />
			{up ? "+" : "-"}
			{Math.abs(delta)}
		</span>
	);
}

/** Todas as campanhas do período, ordenadas pelo critério escolhido, com a variação de posição. */
export default function CampaignsRanking({ startDate, endDate, comparingStartDate, comparingEndDate }: CampaignsRankingProps) {
	const [rankingBy, setRankingBy] = useState<TRankingBy>("revenue");
	const { data: ranking, isLoading } = useCampaignRanking({ rankingBy, startDate, endDate, comparingStartDate, comparingEndDate });
	const items = ranking ?? [];

	const barValue = (item: (typeof items)[number]) =>
		rankingBy === "revenue" ? item.receita : rankingBy === "conversions" ? item.conversoes : item.taxaConversao;
	const maxBar = Math.max(...items.map(barValue), 1);
	const formatPrimary = (item: (typeof items)[number]) =>
		rankingBy === "revenue"
			? formatToMoney(item.receita)
			: rankingBy === "conversions"
				? formatDecimalPlaces(item.conversoes)
				: `${formatDecimalPlaces(item.taxaConversao)}%`;
	const primaryLabel = RANKING_OPTIONS.find((option) => option.value === rankingBy)?.label ?? "";

	return (
		<Section.Root className="h-full">
			<Section.Header>
				<Section.Icon>
					<Crown />
				</Section.Icon>
				<Section.Title>Ranking de campanhas</Section.Title>
				<Section.Count>{items.length}</Section.Count>
				<Section.Actions>
					<div className="flex items-center gap-1" role="group" aria-label="Critério do ranking">
						{RANKING_OPTIONS.map((option) => {
							const Icon = option.icon;
							const active = option.value === rankingBy;
							return (
								<button
									key={option.value}
									type="button"
									aria-pressed={active}
									onClick={() => setRankingBy(option.value)}
									className={cn(
										"flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition-colors",
										active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary",
									)}
								>
									<Icon className="size-3.5 min-h-3.5 min-w-3.5" />
									{option.label}
								</button>
							);
						})}
					</div>
				</Section.Actions>
			</Section.Header>
			<Section.Bleed className="max-h-[560px] overflow-y-auto">
				<div className="hidden grid-cols-[2rem_minmax(0,1fr)_5rem_4.5rem_minmax(9rem,12rem)_3rem] items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[0.65rem] font-bold text-muted-foreground uppercase lg:grid">
					<span>#</span>
					<span>Campanha</span>
					<span className="text-right">Interações</span>
					<span className="text-right">Taxa</span>
					<span>{primaryLabel}</span>
					<span className="text-right">Pos.</span>
				</div>
				{isLoading ? (
					<div className="flex flex-col gap-2 p-4">
						{[0, 1, 2, 3].map((index) => (
							<div key={index} className="h-10 animate-pulse rounded-lg bg-muted/40" />
						))}
					</div>
				) : items.length === 0 ? (
					<p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma campanha no período.</p>
				) : (
					<ol className="divide-y divide-border">
						{items.map((item, index) => {
							const trigger = getTriggerMeta(item.gatilhoTipo);
							const TriggerIcon = trigger?.icon ?? Megaphone;
							const barWidth = (barValue(item) / maxBar) * 100;
							return (
								<li
									key={item.campanhaId}
									className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 lg:grid-cols-[2rem_minmax(0,1fr)_5rem_4.5rem_minmax(9rem,12rem)_3rem]"
								>
									<span
										className={cn(
											"flex size-6 items-center justify-center rounded-full text-[0.7rem] font-bold tabular-nums",
											PODIUM_CLASSES[index] ?? "bg-muted text-foreground",
										)}
									>
										{item.rank}
									</span>
									<div className="flex min-w-0 items-center gap-2.5">
										<span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
											<TriggerIcon className="size-4 min-h-4 min-w-4" />
										</span>
										<div className="flex min-w-0 flex-col">
											<Link href={appRoutes.growth.campaign(item.campanhaId)} className="truncate text-sm font-bold hover:underline">
												{item.titulo}
											</Link>
											<span className="truncate text-[0.7rem] text-muted-foreground">{trigger?.label ?? "Campanha"}</span>
										</div>
									</div>
									<span className="text-right text-sm tabular-nums lg:hidden">
										<strong>{formatPrimary(item)}</strong>
									</span>
									<span className="col-span-3 flex flex-wrap items-center gap-x-3 pl-11 text-[0.7rem] text-muted-foreground tabular-nums lg:hidden">
										<span>{formatDecimalPlaces(item.interacoes)} interações</span>
										<span>{formatDecimalPlaces(item.taxaConversao)}% taxa</span>
										<PositionDelta delta={item.rankDelta} />
									</span>
									<span className="hidden text-right text-sm text-muted-foreground tabular-nums lg:block">{formatDecimalPlaces(item.interacoes)}</span>
									<span className="hidden text-right text-sm text-muted-foreground tabular-nums lg:block">{formatDecimalPlaces(item.taxaConversao)}%</span>
									<div className="hidden items-center gap-2 lg:flex">
										<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
											<div className="h-full rounded-full bg-primary" style={{ width: `${barWidth}%` }} />
										</div>
										<span className="shrink-0 text-right text-sm font-bold tabular-nums">{formatPrimary(item)}</span>
									</div>
									<span className="hidden justify-end lg:flex">
										<PositionDelta delta={item.rankDelta} />
									</span>
								</li>
							);
						})}
					</ol>
				)}
			</Section.Bleed>
		</Section.Root>
	);
}
