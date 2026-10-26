"use client";

import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, BadgeDollarSign, Crown, type LucideIcon, MessageCircle, Minus, MousePointerClick, TrendingUp } from "lucide-react";
import { useState } from "react";
import { MUTED, MockCard } from "./mock-parts";

// Ranking de campanhas (growth/campaigns/_module/shared/stats/CampaignsRanking.tsx). É o único
// recorte com controle de verdade: os três botões reordenam o top por receita, conversões ou taxa,
// como no app.

type TSortKey = "revenue" | "conversions" | "rate";

const SORTS: { key: TSortKey; icon: LucideIcon; title: string }[] = [
	{ key: "revenue", icon: BadgeDollarSign, title: "Ordenar por Receita" },
	{ key: "conversions", icon: MousePointerClick, title: "Ordenar por Conversões" },
	{ key: "rate", icon: TrendingUp, title: "Ordenar por Taxa de Conversão" },
];

type TCampaignRow = {
	title: string;
	revenue: number;
	conversions: number;
	interactions: number;
	rate: number;
	prevRevenue: number;
	prevConversions: number;
	prevRate: number;
	/** Posições ganhas (+) ou perdidas (−) desde o período anterior. */
	positionDelta: number;
};

const CAMPAIGNS: TCampaignRow[] = [
	{
		title: "Cliente sumido há 60 dias",
		revenue: 8420,
		conversions: 96,
		interactions: 1184,
		rate: 8.1,
		prevRevenue: 7310,
		prevConversions: 81,
		prevRate: 7.4,
		positionDelta: 1,
	},
	{
		title: "Cashback expirando",
		revenue: 6180,
		conversions: 141,
		interactions: 1062,
		rate: 13.3,
		prevRevenue: 6530,
		prevConversions: 128,
		prevRate: 12.6,
		positionDelta: -1,
	},
	{
		title: "Aniversário do cliente",
		revenue: 3940,
		conversions: 52,
		interactions: 498,
		rate: 10.4,
		prevRevenue: 3220,
		prevConversions: 44,
		prevRate: 9.1,
		positionDelta: 0,
	},
	{
		title: "Primeira compra",
		revenue: 2710,
		conversions: 64,
		interactions: 912,
		rate: 7.0,
		prevRevenue: 2050,
		prevConversions: 51,
		prevRate: 6.2,
		positionDelta: 2,
	},
];

const PODIUM = [
	{ crown: "text-[#eab308]", row: "border-[rgba(234,179,8,0.5)] bg-[rgba(234,179,8,0.05)]" },
	{ crown: "text-[#9ca3af]", row: "border-[rgba(156,163,175,0.5)] bg-[rgba(156,163,175,0.05)]" },
	{ crown: "text-[#ea580c]", row: "border-[rgba(234,88,12,0.5)] bg-[rgba(234,88,12,0.05)]" },
];

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const decimal = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function metricOf(row: TCampaignRow, key: TSortKey) {
	if (key === "revenue") return { current: money(row.revenue), previous: money(row.prevRevenue) };
	if (key === "conversions") return { current: String(row.conversions), previous: String(row.prevConversions) };
	return { current: `${decimal(row.rate)}%`, previous: `${decimal(row.prevRate)}%` };
}

function sortValue(row: TCampaignRow, key: TSortKey) {
	return key === "revenue" ? row.revenue : key === "conversions" ? row.conversions : row.rate;
}

export function CampaignRankingMock() {
	const [sortKey, setSortKey] = useState<TSortKey>("revenue");
	const rows = [...CAMPAIGNS].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey));
	const MetricIcon = SORTS.find((sort) => sort.key === sortKey)?.icon ?? BadgeDollarSign;

	return (
		<MockCard className="gap-2.5 p-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="text-[12px] font-medium tracking-[-0.01em]">RANKING DE CAMPANHAS - TOP 10</span>
				<div className="flex gap-1.5">
					{SORTS.map(({ key, icon: Icon, title }) => (
						<button
							key={key}
							type="button"
							title={title}
							aria-label={title}
							aria-pressed={sortKey === key}
							onClick={() => setSortKey(key)}
							className={cn(
								"flex cursor-pointer rounded-lg border-0 p-2 transition-colors",
								sortKey === key ? "bg-[#24549c] text-white" : "bg-transparent text-[#0e1214] hover:bg-[#f2f4f4]",
							)}
						>
							<Icon className="size-4 flex-none" aria-hidden />
						</button>
					))}
				</div>
			</div>
			{rows.map((row, i) => {
				const podium = PODIUM[i];
				const metric = metricOf(row, sortKey);
				const delta = row.positionDelta;
				const DeltaIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
				return (
					<div
						key={row.title}
						className={cn(
							"flex items-start justify-between gap-2 rounded-xl border p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
							podium ? podium.row : "border-[#e3e8ea] bg-white",
						)}
					>
						<div className="flex min-w-0 items-center gap-2">
							{podium ? (
								<Crown className={cn("size-5 flex-none", podium.crown)} aria-hidden />
							) : (
								<span className="flex size-6 flex-none items-center justify-center rounded-full bg-[rgba(36,84,156,0.1)] text-[12px] font-bold">{i + 1}</span>
							)}
							<div className="flex min-w-0 flex-col gap-1">
								<div className="flex items-center gap-2">
									<span className="truncate text-[13px] font-bold tracking-[-0.01em]">{row.title}</span>
									<span
										className={cn(
											"flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10.4px] font-bold",
											delta > 0 && "bg-[rgba(34,197,94,0.1)] text-[#16a34a]",
											delta < 0 && "bg-[rgba(239,68,68,0.1)] text-[#dc2626]",
											delta === 0 && "bg-[rgba(107,114,128,0.1)] text-[#4b5563]",
										)}
									>
										<DeltaIcon className="size-3 flex-none" aria-hidden />
										{delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : ""}
									</span>
								</div>
								<div className={cn("flex flex-wrap gap-x-2.5 gap-y-1 text-[10.4px]", MUTED)}>
									<span className="flex items-center gap-1">
										<MessageCircle className="size-3 flex-none" aria-hidden />
										{row.interactions.toLocaleString("pt-BR")} interações
									</span>
									<span className="flex items-center gap-1">
										<TrendingUp className="size-3 flex-none" aria-hidden />
										{decimal(row.rate)}% taxa
									</span>
								</div>
							</div>
						</div>
						<div className="flex flex-none flex-col items-end gap-1">
							<span className="flex items-center gap-1.5 rounded-md bg-[rgba(36,84,156,0.1)] px-2 py-1.5 text-[12px] font-bold">
								<MetricIcon className="size-3 flex-none" aria-hidden />
								{metric.current}
							</span>
							<span className={cn("text-[9.6px]", MUTED)}>Anterior: {metric.previous}</span>
						</div>
					</div>
				);
			})}
		</MockCard>
	);
}
