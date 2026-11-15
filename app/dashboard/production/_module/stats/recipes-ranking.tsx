"use client";

import type { TGetProductionStatsOutput } from "@/app/api/productions/stats/route";
import { RecipeCover } from "@/components/Productions/RecipeCover";
import { Section } from "@/components/ui/section";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, BadgeDollarSign, Crown, Factory, Gauge } from "lucide-react";
import { useState } from "react";
import { MetricToggle, type TMetricToggleOption } from "./metric-toggle";
import { formatRatioPercent, formatUnitQuantity } from "./stats-format";

type TRankingRow = TGetProductionStatsOutput["data"]["ranking"][number];
type TRankingMetric = keyof TRankingRow["previousPositions"];

const RANKING_METRICS: TMetricToggleOption<TRankingMetric>[] = [
	{ value: "valor", label: "Valor", icon: BadgeDollarSign },
	{ value: "producoes", label: "Produções", icon: Factory },
	{ value: "rendimento", label: "Rendimento", icon: Gauge },
];

const PODIUM_CLASSES = ["bg-[#FFB900] text-white", "bg-slate-400 text-white", "bg-orange-600 text-white"];

// Container query: a tabela completa precisa de ~680px do cartão, não da tela — ao lado dos insumos
// o cartão fica estreito mesmo num monitor largo.
const FULL_GRID = "@2xl:grid-cols-[2rem_minmax(0,1fr)_4.5rem_4rem_minmax(6rem,10rem)_3rem]";

function yieldClassName(ratio: number | null) {
	if (ratio == null) return "text-muted-foreground";
	if (ratio >= 0.98) return "text-foreground";
	if (ratio >= 0.95) return "text-amber-700 dark:text-amber-400";
	return "text-red-700 dark:text-red-400";
}

/** Variação contra a posição no período de comparação. Receita nova no ranking (ou parada) mostra "—". */
function PositionDelta({ delta, isNew }: { delta: number | null; isNew: boolean }) {
	if (delta == null || delta === 0) {
		return (
			<span
				className="rounded-md bg-muted px-1.5 py-0.5 text-[0.65rem] font-bold text-muted-foreground"
				title={isNew ? "Sem posição no período anterior" : "Mesma posição do período anterior"}
			>
				—
			</span>
		);
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

/** Receitas do período, ordenadas pela métrica escolhida; a posição anterior vem da API por métrica. */
export function RecipesRanking({ ranking }: { ranking: TRankingRow[] }) {
	const [metric, setMetric] = useState<TRankingMetric>("valor");

	// Sem rendimento (nenhuma saída prevista) a receita não tem como entrar no ranking de rendimento —
	// a mesma regra que a API usa para a posição anterior.
	const metricValue = (row: TRankingRow) => row[metric];
	const rows = ranking
		.filter((row) => metricValue(row) != null)
		.sort((a, b) => (metricValue(b) ?? 0) - (metricValue(a) ?? 0) || a.receita.titulo.localeCompare(b.receita.titulo, "pt-BR"));
	const values = rows.map((row) => metricValue(row) ?? 0);
	const maxValue = Math.max(...values, metric === "rendimento" ? 1 : 0);
	// Rendimentos ficam todos perto de 100%: a barra parte de um pouco abaixo do menor para mostrar a diferença.
	const minValue = metric === "rendimento" ? Math.min(...values, 1) - 0.01 : 0;
	const barWidth = (value: number) => Math.max(4, ((value - minValue) / (maxValue - minValue || 1)) * 100);

	const formatPrimary = (row: TRankingRow) => {
		if (metric === "valor") return formatToMoney(row.valor);
		if (metric === "producoes") return formatDecimalPlaces(row.producoes);
		return formatRatioPercent(row.rendimento);
	};
	const primaryLabel = RANKING_METRICS.find((option) => option.value === metric)?.label ?? "";

	return (
		<Section.Root className="@container">
			<Section.Header>
				<Section.Icon>
					<Crown />
				</Section.Icon>
				<Section.Title>Ranking de receitas</Section.Title>
				<Section.Count>{formatDecimalPlaces(rows.length)}</Section.Count>
				<Section.Actions>
					<MetricToggle options={RANKING_METRICS} value={metric} onChange={setMetric} ariaLabel="Critério do ranking" />
				</Section.Actions>
			</Section.Header>
			<Section.Bleed>
				{rows.length === 0 ? (
					<p className="px-4 py-8 text-center text-sm text-muted-foreground">
						{ranking.length === 0 ? "Nenhuma produção concluída no período." : "Nenhuma receita com rendimento medido no período."}
					</p>
				) : (
					<>
						<div
							className={cn(
								"hidden items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[0.65rem] font-bold text-muted-foreground uppercase @2xl:grid",
								FULL_GRID,
							)}
						>
							<span>#</span>
							<span>Receita</span>
							<span className="text-right">Produções</span>
							<span className="text-right">Rend.</span>
							<span>{primaryLabel}</span>
							<span className="text-right">Pos.</span>
						</div>
						<ol className="divide-y divide-border">
							{rows.map((row, index) => {
								const position = index + 1;
								const previous = row.previousPositions[metric];
								const delta = previous != null ? previous - position : null;
								const yieldText = formatRatioPercent(row.rendimento);
								const subtitle =
									row.receita.rendimentoReceita != null
										? `Rende ${formatUnitQuantity(row.receita.rendimentoReceita, row.receita.unidade)} por lote`
										: "Sem saída definida";
								return (
									<li key={row.receita.id} className={cn("grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5", FULL_GRID)}>
										<span
											className={cn(
												"flex size-6 items-center justify-center rounded-full text-[0.7rem] font-bold tabular-nums",
												PODIUM_CLASSES[index] ?? "bg-muted text-foreground",
											)}
										>
											{position}
										</span>
										<div className="flex min-w-0 items-center gap-2.5">
											<RecipeCover recipe={row.receita} className="size-8 shrink-0 rounded-lg" iconClassName="size-4" />
											<div className="flex min-w-0 flex-col">
												<span className="truncate text-sm font-bold">{row.receita.titulo}</span>
												<span className="truncate text-[0.7rem] text-muted-foreground">{subtitle}</span>
											</div>
										</div>
										{/* Compacto: valor à direita e o resto numa segunda linha. */}
										<span className="text-right text-sm font-bold whitespace-nowrap tabular-nums @2xl:hidden">{formatPrimary(row)}</span>
										<span className="col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 pl-11 text-[0.7rem] text-muted-foreground tabular-nums @2xl:hidden">
											<span>
												{formatDecimalPlaces(row.producoes)} {row.producoes === 1 ? "produção" : "produções"}
											</span>
											<span className={yieldClassName(row.rendimento)}>Rend. {yieldText}</span>
											<PositionDelta delta={delta} isNew={previous == null} />
										</span>
										{/* Completo. */}
										<span className="hidden text-right text-sm text-muted-foreground tabular-nums @2xl:block">{formatDecimalPlaces(row.producoes)}</span>
										<span className={cn("hidden text-right text-sm tabular-nums @2xl:block", yieldClassName(row.rendimento))}>{yieldText}</span>
										<div className="hidden min-w-0 items-center gap-2 @2xl:flex">
											<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
												<div className="h-full rounded-full bg-primary" style={{ width: `${barWidth(metricValue(row) ?? 0)}%` }} />
											</div>
											<span className="shrink-0 text-right text-sm font-bold whitespace-nowrap tabular-nums">{formatPrimary(row)}</span>
										</div>
										<span className="hidden justify-end @2xl:flex">
											<PositionDelta delta={delta} isNew={previous == null} />
										</span>
									</li>
								);
							})}
						</ol>
					</>
				)}
			</Section.Bleed>
		</Section.Root>
	);
}
