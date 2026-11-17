"use client";

import type { TGetProductionStatsOutput } from "@/app/api/productions/stats/route";
import { Section } from "@/components/ui/section";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { Coins, Gauge, Scale, Target, TrendingDown, TrendingUp, TriangleAlert, type LucideIcon } from "lucide-react";
import { formatUnitQuantity, quantityInUnit } from "./stats-format";

type TStatsData = TGetProductionStatsOutput["data"];
type TYieldBand = keyof TStatsData["yield"]["bands"];

const YIELD_BANDS: { id: TYieldBand; label: string; hint: string; icon: LucideIcon; barClassName: string; iconClassName: string }[] = [
	{
		id: "ACIMA_DO_PREVISTO",
		label: "Acima do previsto",
		hint: "Rendeu 100% ou mais",
		icon: TrendingUp,
		barClassName: "bg-green-500",
		iconClassName: "text-green-600 dark:text-green-400",
	},
	{
		id: "DENTRO_DA_META",
		label: "Dentro da meta",
		hint: "Entre 98% e 100%",
		icon: Target,
		barClassName: "bg-blue-500",
		iconClassName: "text-blue-600 dark:text-blue-400",
	},
	{
		id: "ABAIXO_DO_PREVISTO",
		label: "Abaixo do previsto",
		hint: "Entre 95% e 98%",
		icon: TrendingDown,
		barClassName: "bg-yellow-500",
		iconClassName: "text-yellow-600 dark:text-yellow-400",
	},
	{
		id: "PERDA_ALTA",
		label: "Perda alta",
		hint: "Abaixo de 95%",
		icon: TriangleAlert,
		barClassName: "bg-red-500",
		iconClassName: "text-red-600 dark:text-red-400",
	},
];

function SideTile({
	label,
	icon: Icon,
	value,
	hint,
	valueClassName,
	className,
}: {
	label: string;
	icon: LucideIcon;
	value: string;
	hint: string;
	valueClassName?: string;
	className?: string;
}) {
	return (
		<div className={cn("flex min-w-0 flex-1 flex-col gap-0.5 border-border px-4 py-4", className)}>
			<div className="flex items-start justify-between gap-2">
				<span className="text-label text-muted-foreground">{label}</span>
				<Icon className="size-4 min-h-4 min-w-4 shrink-0 text-muted-foreground" />
			</div>
			<span className={cn("text-2xl font-extrabold tracking-tight tabular-nums", valueClassName)}>{value}</span>
			<span className="text-[0.7rem] text-muted-foreground">{hint}</span>
		</div>
	);
}

/** Saída real sobre a prevista de cada produção concluída, em quatro faixas, mais a perda e quanto ela custou. */
export function YieldSection({ stats, canViewCosts }: { stats: TStatsData; canViewCosts: boolean }) {
	const { evaluatedCount, bands } = stats.yield;
	const mainUnit = stats.summary.current.unidadePrincipal;
	const mainLoss = quantityInUnit(stats.summary.current.perdas, mainUnit);
	const lossCost = stats.summary.current.custoPerda;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Gauge />
				</Section.Icon>
				<Section.Title>Rendimento das produções</Section.Title>
				<Section.Count>{formatDecimalPlaces(evaluatedCount)}</Section.Count>
				<Section.Actions>
					<span className="text-[0.7rem] font-medium text-muted-foreground">Saída real sobre a prevista, por produção</span>
				</Section.Actions>
			</Section.Header>
			<Section.Bleed>
				<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem]">
					<div className="flex flex-col gap-4 px-4 py-5">
						<div className="flex h-6 w-full gap-1">
							{evaluatedCount > 0 ? (
								YIELD_BANDS.filter((band) => bands[band.id] > 0).map((band) => {
									const share = (bands[band.id] / evaluatedCount) * 100;
									return (
										<div
											key={band.id}
											className={cn("flex h-full min-w-6 items-center rounded-md px-2 text-[0.65rem] font-bold text-white", band.barClassName)}
											style={{ width: `${share}%` }}
											title={`${band.label}: ${formatDecimalPlaces(bands[band.id])} (${formatDecimalPlaces(share, 1, 1)}%)`}
										>
											{share >= 8 ? <span className="truncate">{formatDecimalPlaces(share, 1, 1)}%</span> : null}
										</div>
									);
								})
							) : (
								<div className="h-full w-full rounded-md bg-muted" />
							)}
						</div>
						<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
							{YIELD_BANDS.map((band) => {
								const Icon = band.icon;
								return (
									<div key={band.id} className="flex min-w-0 flex-col gap-0.5">
										<span className="flex items-center gap-1.5 text-label">
											<Icon className={cn("size-3.5 min-h-3.5 min-w-3.5 shrink-0", band.iconClassName)} />
											{band.label}
										</span>
										<span className="text-2xl font-extrabold tracking-tight tabular-nums">{formatDecimalPlaces(bands[band.id])}</span>
										<span className="text-[0.7rem] text-muted-foreground">{band.hint}</span>
									</div>
								);
							})}
						</div>
					</div>
					<div className="flex flex-col border-t border-border sm:flex-row lg:flex-col lg:border-t-0 lg:border-l">
						<SideTile label="Perda total" icon={Scale} value={mainUnit ? formatUnitQuantity(mainLoss, mainUnit) : "—"} hint="Saída abaixo do previsto" />
						{canViewCosts && lossCost != null ? (
						<SideTile
							label="Custo da perda"
							icon={Coins}
							value={formatToMoney(lossCost)}
							valueClassName={lossCost > 0 ? "text-red-600 dark:text-red-400" : undefined}
							hint="Insumos sem retorno em saída"
							className="border-t sm:border-t-0 sm:border-l lg:border-t lg:border-l-0"
						/>
						) : null}
					</div>
				</div>
			</Section.Bleed>
		</Section.Root>
	);
}
