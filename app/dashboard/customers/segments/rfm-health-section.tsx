"use client";

import type { TGetRFMHealthOutput } from "@/app/api/segmentations/rfm-health/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { updateRFMConfig } from "@/lib/mutations/configs";
import { useRFMHealth } from "@/lib/queries/segmentations";
import { cn } from "@/lib/utils";
import type { TRFMConfig } from "@/utils/rfm";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, HeartPulse, Info, Settings2, ShieldAlert } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TRFMHealthData = TGetRFMHealthOutput["data"];
type THealthAlert = TRFMHealthData["alerts"][number];
type TLabelDistributionItem = TRFMHealthData["labelDistribution"][number];
type THistogramBin = TRFMHealthData["histograms"]["recency"]["bins"][number];
type TFrequencyBin = TRFMHealthData["histograms"]["frequency"][number];

const HISTOGRAM_BAR_COLOR = "#e3b042";

/** Cores de eixo/ticks alinhadas ao tema (oklch em --foreground / --border). */
const CHART_FOREGROUND = "var(--foreground)";
const CHART_BORDER = "var(--border)";
const RECHARTS_AXIS_THEME_CLASS =
	"[&_.recharts-cartesian-axis-tick_text]:fill-foreground [&_.recharts-cartesian-axis-line]:stroke-border [&_.recharts-cartesian-axis-tick-line]:stroke-border";

function chartAxisTick(fontSize: number) {
	return { fontSize, fill: CHART_FOREGROUND };
}

type SegmentsPageRFMHealthProps = {
	/** Ausente sem clientes.gerenciarBase: some o ajuste da configuração e a aplicação das sugestões. */
	onOpenConfig: (() => void) | null;
};

const CLASSIFICATION_STYLES: Record<TRFMHealthData["healthScore"]["classification"], { container: string; icon: string; label: string }> = {
	SAUDAVEL: {
		container: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/30",
		icon: "text-emerald-500 bg-emerald-500/15",
		label: "text-emerald-600 dark:text-emerald-400",
	},
	ATENCAO: {
		container: "from-amber-500/15 to-amber-500/5 border-amber-500/30",
		icon: "text-amber-600 bg-amber-500/15",
		label: "text-amber-700 dark:text-amber-300",
	},
	DESALINHADA: {
		container: "from-rose-500/15 to-rose-500/5 border-rose-500/30",
		icon: "text-rose-600 bg-rose-500/15",
		label: "text-rose-700 dark:text-rose-300",
	},
	INSUFICIENTE: {
		container: "from-slate-500/15 to-slate-500/5 border-slate-500/30",
		icon: "text-slate-600 bg-slate-500/15",
		label: "text-slate-700 dark:text-slate-300",
	},
};

const ALERT_STYLES: Record<
	THealthAlert["severity"],
	{ container: string; icon: string; iconComponent: React.ComponentType<{ className?: string }> }
> = {
	critical: {
		container: "border-rose-500/40 bg-rose-500/10",
		icon: "text-rose-600 dark:text-rose-400",
		iconComponent: ShieldAlert,
	},
	warning: {
		container: "border-amber-500/40 bg-amber-500/10",
		icon: "text-amber-600 dark:text-amber-400",
		iconComponent: AlertTriangle,
	},
	info: {
		container: "border-sky-500/30 bg-sky-500/10",
		icon: "text-sky-600 dark:text-sky-400",
		iconComponent: Info,
	},
};

export default function SegmentsPageRFMHealth({ onOpenConfig }: SegmentsPageRFMHealthProps) {
	const { data, isLoading, isError, error } = useRFMHealth({ months: 12 });

	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-5 rounded-xl border px-4 py-5 shadow-2xs")}>
			<div className="flex items-start justify-between gap-3 flex-col lg:flex-row lg:items-center">
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<HeartPulse className="w-4 h-4 min-w-4 min-h-4" />
						<h1 className="text-xs font-medium tracking-tight uppercase">SAÚDE DA MATRIZ</h1>
					</div>
					<p className="text-[0.7rem] text-muted-foreground">Diagnóstico estatístico da matriz RFM nos últimos 12 meses.</p>
				</div>
				{onOpenConfig ? (
					<Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={onOpenConfig}>
						<Settings2 className="w-4 h-4 min-w-4 min-h-4" />
						AJUSTAR CONFIGURAÇÃO
					</Button>
				) : null}
			</div>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{data ? <RFMHealthContent data={data} canApplySuggestions={!!onOpenConfig} /> : null}
		</div>
	);
}

function RFMHealthContent({ data, canApplySuggestions }: { data: TRFMHealthData; canApplySuggestions: boolean }) {
	if (data.totalClients === 0) {
		return (
			<div className="w-full py-12 flex flex-col items-center justify-center gap-2 text-center">
				<HeartPulse className="w-6 h-6 text-muted-foreground" />
				<p className="text-sm font-medium">Sem clientes para analisar.</p>
				<p className="text-xs text-muted-foreground">
					Não foram encontradas vendas com cliente identificado no período. Sincronize as vendas e tente novamente.
				</p>
			</div>
		);
	}

	return (
		<div className="w-full flex flex-col gap-6">
			<HealthScoreCard data={data} />
			<div className="grid w-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-8 gap-y-6">
				<AlertsBlock alerts={data.alerts} />
				<DistributionBlock distribution={data.labelDistribution} totalClients={data.totalClients} />
			</div>
			<HistogramsBlock data={data} />
			{canApplySuggestions ? <ConfigComparisonBlock rfmConfig={data.rfmConfig} suggestedConfig={data.suggestedConfig} /> : null}
		</div>
	);
}

function SectionHeader({ title, description, meta, action }: { title: string; description?: string; meta?: ReactNode; action?: ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-3 flex-col md:flex-row md:items-end">
			<div className="flex flex-col gap-0.5 min-w-0">
				<h3 className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
				{description ? <p className="text-[0.7rem] text-muted-foreground/80">{description}</p> : null}
			</div>
			{meta || action ? (
				<div className="flex items-center gap-2 shrink-0">
					{meta}
					{action}
				</div>
			) : null}
		</div>
	);
}

function HealthScoreCard({ data }: { data: TRFMHealthData }) {
	const style = CLASSIFICATION_STYLES[data.healthScore.classification];
	const criticalCount = data.alerts.filter((alert) => alert.severity === "critical").length;
	const warningCount = data.alerts.filter((alert) => alert.severity === "warning").length;
	const infoCount = data.alerts.filter((alert) => alert.severity === "info").length;

	return (
		<div
			className={cn(
				"relative w-full rounded-xl border bg-gradient-to-br p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
				style.container,
			)}
		>
			<div className="flex items-start gap-3 min-w-0">
				<div className={cn("rounded-lg p-2 shrink-0", style.icon)}>
					<HeartPulse className="w-5 h-5" />
				</div>
				<div className="flex flex-col gap-1 min-w-0">
					<span className={cn("text-[0.65rem] font-bold tracking-widest uppercase", style.label)}>STATUS DA MATRIZ</span>
					<h2 className={cn("text-base font-semibold tracking-tight uppercase", style.label)}>{data.healthScore.label}</h2>
					<p className="text-xs text-foreground/80 max-w-xl">{data.healthScore.summary}</p>
				</div>
			</div>
			<div className="flex flex-wrap items-stretch gap-2">
				<HealthScoreChip label="Clientes analisados" value={formatDecimalPlaces(data.totalClients, 0)} />
				<HealthScoreChip label="Alertas críticos" value={String(criticalCount)} tone={criticalCount > 0 ? "critical" : "neutral"} />
				<HealthScoreChip label="Atenção" value={String(warningCount)} tone={warningCount > 0 ? "warning" : "neutral"} />
				<HealthScoreChip label="Observações" value={String(infoCount)} tone="neutral" />
			</div>
		</div>
	);
}

function HealthScoreChip({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "critical" | "warning" }) {
	const toneClasses =
		tone === "critical"
			? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
			: tone === "warning"
				? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
				: "border-border bg-background/60 text-foreground";
	return (
		<div className={cn("flex flex-col items-start rounded-lg border px-2.5 py-1.5", toneClasses)}>
			<span className="text-[0.6rem] font-bold uppercase tracking-wide opacity-80">{label}</span>
			<span className="text-sm font-semibold tabular-nums">{value}</span>
		</div>
	);
}

function AlertsBlock({ alerts }: { alerts: THealthAlert[] }) {
	return (
		<section className="flex w-full flex-col gap-3">
			<SectionHeader
				title="Alertas"
				description={alerts.length > 0 ? `${alerts.length} ${alerts.length === 1 ? "ponto" : "pontos"} para revisar` : "Nada a sinalizar"}
			/>
			{alerts.length === 0 ? (
				<div className="flex items-start gap-2 text-foreground/80">
					<CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
					<div className="flex flex-col gap-0.5">
						<p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Nenhum alerta no momento.</p>
						<p className="text-[0.7rem] text-foreground/70">A matriz parece coerente com o comportamento da base no período.</p>
					</div>
				</div>
			) : (
				<ul className="flex flex-col gap-2">
					{alerts.map((alert) => {
						const style = ALERT_STYLES[alert.severity];
						const Icon = style.iconComponent;
						return (
							<li key={alert.id} className={cn("flex items-start gap-2 rounded-lg border p-3", style.container)}>
								<Icon className={cn("w-4 h-4 mt-0.5 shrink-0", style.icon)} />
								<div className="flex flex-col gap-0.5">
									<p className="text-xs font-semibold">{alert.title}</p>
									<p className="text-[0.7rem] text-foreground/80">{alert.description}</p>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

function DistributionBlock({ distribution, totalClients }: { distribution: TLabelDistributionItem[]; totalClients: number }) {
	const chartData = useMemo(() => {
		return distribution.map((item) => ({
			label: item.label,
			shortLabel: shortenLabel(item.label),
			count: item.count,
			percentage: item.percentage,
			fill: getColorForLabel(item.label),
		}));
	}, [distribution]);

	return (
		<section className="flex w-full flex-col gap-3">
			<SectionHeader
				title="Distribuição por segmentação"
				description="Quantos clientes caem em cada faixa da matriz"
				meta={
					<span className="text-[0.65rem] uppercase font-semibold tracking-wide text-muted-foreground tabular-nums">
						{formatDecimalPlaces(totalClients, 0)} clientes
					</span>
				}
			/>
			<div className={cn("w-full h-[280px]", RECHARTS_AXIS_THEME_CLASS)}>
				<ResponsiveContainer width="100%" height="100%">
					<BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
						<CartesianGrid horizontal={false} stroke={CHART_BORDER} strokeDasharray="3 3" />
						<XAxis type="number" tick={chartAxisTick(10)} tickFormatter={(value) => formatDecimalPlaces(value, 0)} stroke={CHART_BORDER} />
						<YAxis type="category" dataKey="shortLabel" width={170} tick={chartAxisTick(10)} stroke={CHART_BORDER} />
						<Tooltip
							cursor={{ fill: "hsl(var(--muted))", opacity: 0.2 }}
							content={({ active, payload }) => {
								if (!active || !payload || payload.length === 0) return null;
								const entry = payload[0].payload as (typeof chartData)[number];
								return (
									<div className="rounded-lg border border-border bg-background p-2 shadow-lg flex flex-col gap-0.5">
										<p className="text-xs font-semibold">{entry.label}</p>
										<p className="text-[0.7rem] text-muted-foreground">
											{formatDecimalPlaces(entry.count, 0)} clientes · {formatDecimalPlaces(entry.percentage, 1)}%
										</p>
									</div>
								);
							}}
						/>
						<Bar dataKey="count" radius={[0, 6, 6, 0]}>
							{chartData.map((entry) => (
								<Cell key={entry.label} fill={entry.fill} />
							))}
						</Bar>
					</BarChart>
				</ResponsiveContainer>
			</div>
		</section>
	);
}

function HistogramsBlock({ data }: { data: TRFMHealthData }) {
	return (
		<section className="flex w-full flex-col gap-3 border-t border-border pt-5">
			<SectionHeader title="Distribuição estatística R, F e M" description="Distribuição real da base e onde caem os cortes configurados (R/F/M 1–5)" />
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-6">
				<RecencyHistogram data={data} />
				<FrequencyHistogram data={data} />
				<MonetaryHistogram data={data} />
			</div>
		</section>
	);
}

function HistogramFrame({
	title,
	subtitle,
	metric,
	children,
}: {
	title: string;
	subtitle: string;
	metric: TRFMHealthData["metrics"]["recency"];
	children: React.ReactNode;
}) {
	return (
		<div className="w-full flex flex-col gap-2 min-w-0">
			<div className="flex flex-col gap-0.5">
				<h4 className="text-[0.72rem] font-semibold tracking-tight">{title}</h4>
				<p className="text-[0.65rem] text-muted-foreground">{subtitle}</p>
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] text-muted-foreground">
				<MetricStat label="mediana" value={formatDecimalPlaces(metric.median ?? 0, 1)} />
				<MetricStat label="média" value={formatDecimalPlaces(metric.average ?? 0, 1)} />
				<MetricStat label="p90" value={formatDecimalPlaces(metric.percentiles.p90 ?? 0, 1)} />
			</div>
			<div className={cn("w-full h-[200px] mt-1", RECHARTS_AXIS_THEME_CLASS)}>{children}</div>
		</div>
	);
}

function MetricStat({ label, value }: { label: string; value: string }) {
	return (
		<span className="inline-flex items-baseline gap-1 tabular-nums">
			<span className="text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground/80">{label}</span>
			<span className="text-[0.7rem] font-semibold text-foreground">{value}</span>
		</span>
	);
}

function RecencyHistogram({ data }: { data: TRFMHealthData }) {
	const histogram = data.histograms.recency;
	const chartData = useMemo(() => buildContinuousChartData(histogram.bins), [histogram.bins]);
	const thresholds = useMemo(
		() => buildThresholdsAlignedToBins(buildRecencyThresholds(data.rfmConfig), histogram.bins, chartData),
		[data.rfmConfig, histogram.bins, chartData],
	);

	return (
		<HistogramFrame title="Recência (dias)" subtitle="Dias desde a última compra" metric={data.metrics.recency}>
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={chartData} margin={{ left: 0, right: 8, top: 12, bottom: 4 }}>
					<CartesianGrid stroke={CHART_BORDER} strokeDasharray="3 3" vertical={false} />
					<XAxis dataKey="label" tick={chartAxisTick(9)} stroke={CHART_BORDER} interval={1} />
					<YAxis tick={chartAxisTick(9)} stroke={CHART_BORDER} />
					<Tooltip content={<HistogramTooltip valueFormatter={(value) => `${formatDecimalPlaces(value, 0)} dias`} />} />
					{thresholds.map((threshold) => (
						<ReferenceLine
							key={threshold.id}
							x={threshold.binLabel}
							stroke={threshold.color}
							strokeDasharray="4 2"
							label={{ value: threshold.label, fill: threshold.color, fontSize: 9, position: "top" }}
						/>
					))}
					<Bar dataKey="count" fill={HISTOGRAM_BAR_COLOR} radius={[4, 4, 0, 0]} />
				</BarChart>
			</ResponsiveContainer>
		</HistogramFrame>
	);
}

function FrequencyHistogram({ data }: { data: TRFMHealthData }) {
	const histogram = data.histograms.frequency;
	const chartData = useMemo(() => histogram.map((bin) => ({ ...bin, label: bin.label })), [histogram]);
	return (
		<HistogramFrame title="Frequência (compras)" subtitle="Número de compras no período" metric={data.metrics.frequency}>
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={chartData} margin={{ left: 0, right: 8, top: 12, bottom: 4 }}>
					<CartesianGrid stroke={CHART_BORDER} strokeDasharray="3 3" vertical={false} />
					<XAxis dataKey="label" tick={chartAxisTick(10)} stroke={CHART_BORDER} />
					<YAxis tick={chartAxisTick(9)} stroke={CHART_BORDER} />
					<Tooltip
						content={({ active, payload }) => {
							if (!active || !payload || payload.length === 0) return null;
							const entry = payload[0].payload as TFrequencyBin;
							return (
								<div className="rounded-lg border border-border bg-background p-2 shadow-lg flex flex-col gap-0.5">
									<p className="text-xs font-semibold">{entry.label} compras</p>
									<p className="text-[0.7rem] text-muted-foreground">{formatDecimalPlaces(entry.count, 0)} clientes</p>
								</div>
							);
						}}
					/>
					<Bar dataKey="count" fill={HISTOGRAM_BAR_COLOR} radius={[4, 4, 0, 0]} />
				</BarChart>
			</ResponsiveContainer>
		</HistogramFrame>
	);
}

function MonetaryHistogram({ data }: { data: TRFMHealthData }) {
	const histogram = data.histograms.monetary;
	const chartData = useMemo(() => buildContinuousChartData(histogram.bins, formatToMoney), [histogram.bins]);
	const thresholds = useMemo(
		() => buildThresholdsAlignedToBins(buildMonetaryThresholds(data.rfmConfig), histogram.bins, chartData),
		[data.rfmConfig, histogram.bins, chartData],
	);
	return (
		<HistogramFrame title="Monetário (R$)" subtitle="Valor total comprado no período" metric={data.metrics.monetary}>
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={chartData} margin={{ left: 0, right: 8, top: 12, bottom: 4 }}>
					<CartesianGrid stroke={CHART_BORDER} strokeDasharray="3 3" vertical={false} />
					<XAxis dataKey="label" tick={chartAxisTick(8)} stroke={CHART_BORDER} interval={1} />
					<YAxis tick={chartAxisTick(9)} stroke={CHART_BORDER} />
					<Tooltip content={<HistogramTooltip valueFormatter={formatToMoney} />} />
					{thresholds.map((threshold) => (
						<ReferenceLine
							key={threshold.id}
							x={threshold.binLabel}
							stroke={threshold.color}
							strokeDasharray="4 2"
							label={{ value: threshold.label, fill: threshold.color, fontSize: 9, position: "top" }}
						/>
					))}
					<Bar dataKey="count" fill={HISTOGRAM_BAR_COLOR} radius={[4, 4, 0, 0]} />
				</BarChart>
			</ResponsiveContainer>
		</HistogramFrame>
	);
}

function HistogramTooltip({
	active,
	payload,
	valueFormatter,
}: {
	active?: boolean;
	payload?: { payload: { start: number; end: number; count: number; label: string } }[];
	valueFormatter: (value: number) => string;
}) {
	if (!active || !payload || payload.length === 0) return null;
	const entry = payload[0].payload;
	return (
		<div className="rounded-lg border border-border bg-background p-2 shadow-lg flex flex-col gap-0.5">
			<p className="text-xs font-semibold">
				{valueFormatter(entry.start)} → {valueFormatter(entry.end)}
			</p>
			<p className="text-[0.7rem] text-muted-foreground">{formatDecimalPlaces(entry.count, 0)} clientes</p>
		</div>
	);
}

type TRFMDimension = keyof Pick<TRFMConfig, "recencia" | "frequencia" | "monetario">;
type TApplyingDimension = TRFMDimension | "all";

function mergePartialSuggestion(current: TRFMConfig, suggested: TRFMConfig, dimension: TRFMDimension): TRFMConfig {
	return {
		...current,
		[dimension]: suggested[dimension],
	};
}

function dimensionHasChanges(current: TRFMConfig["recencia"], suggested: TRFMConfig["recencia"]): boolean {
	const scores = [1, 2, 3, 4, 5] as const;
	return scores.some((score) => current[score].min !== suggested[score].min || current[score].max !== suggested[score].max);
}

function ConfigComparisonBlock({ rfmConfig, suggestedConfig }: { rfmConfig: TRFMConfig; suggestedConfig: TRFMConfig }) {
	const queryClient = useQueryClient();
	const [applyingDimension, setApplyingDimension] = useState<TApplyingDimension | null>(null);

	const { mutate: applySuggestedConfig, isPending } = useMutation({
		mutationKey: ["apply-rfm-suggested-config"],
		mutationFn: updateRFMConfig,
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: ["rfm-config"] });
			queryClient.invalidateQueries({ queryKey: ["rfm-health"] });
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			setApplyingDimension(null);
		},
	});

	const applyConfig = (dimension: TApplyingDimension) => {
		const mergedConfig = dimension === "all" ? suggestedConfig : mergePartialSuggestion(rfmConfig, suggestedConfig, dimension);
		setApplyingDimension(dimension);
		applySuggestedConfig({ rfmConfig: mergedConfig });
	};

	const hasAnyChanges =
		dimensionHasChanges(rfmConfig.recencia, suggestedConfig.recencia) ||
		dimensionHasChanges(rfmConfig.frequencia, suggestedConfig.frequencia) ||
		dimensionHasChanges(rfmConfig.monetario, suggestedConfig.monetario);

	return (
		<section className="flex w-full flex-col gap-3 border-t border-border pt-5">
			<SectionHeader
				title="Configuração atual vs sugestão por percentis"
				description="A sugestão divide a base em quintis com base no comportamento real. Aplique tudo de uma vez ou somente Recência, Frequência ou Monetário."
				action={
					<LoadingButton
						variant="outline"
						size="sm"
						className="flex items-center gap-2"
						loading={isPending && applyingDimension === "all"}
						disabled={!hasAnyChanges || (isPending && applyingDimension !== "all")}
						onClick={() => applyConfig("all")}
					>
						<Check className="w-3.5 h-3.5" />
						APLICAR TUDO
					</LoadingButton>
				}
			/>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
				<ConfigTable
					title="Recência (dias)"
					current={rfmConfig.recencia}
					suggested={suggestedConfig.recencia}
					formatter={(value) => formatDecimalPlaces(value, 0)}
					onApply={() => applyConfig("recencia")}
					isApplying={isPending && applyingDimension === "recencia"}
					isDisabled={!dimensionHasChanges(rfmConfig.recencia, suggestedConfig.recencia) || (isPending && applyingDimension !== "recencia")}
				/>
				<ConfigTable
					title="Frequência"
					current={rfmConfig.frequencia}
					suggested={suggestedConfig.frequencia}
					formatter={(value) => formatDecimalPlaces(value, 0)}
					onApply={() => applyConfig("frequencia")}
					isApplying={isPending && applyingDimension === "frequencia"}
					isDisabled={!dimensionHasChanges(rfmConfig.frequencia, suggestedConfig.frequencia) || (isPending && applyingDimension !== "frequencia")}
				/>
				<ConfigTable
					title="Monetário"
					current={rfmConfig.monetario}
					suggested={suggestedConfig.monetario}
					formatter={formatToMoney}
					onApply={() => applyConfig("monetario")}
					isApplying={isPending && applyingDimension === "monetario"}
					isDisabled={!dimensionHasChanges(rfmConfig.monetario, suggestedConfig.monetario) || (isPending && applyingDimension !== "monetario")}
				/>
			</div>
		</section>
	);
}

function ConfigTable({
	title,
	current,
	suggested,
	formatter,
	onApply,
	isApplying,
	isDisabled,
}: {
	title: string;
	current: TRFMConfig["recencia"];
	suggested: TRFMConfig["recencia"];
	formatter: (value: number) => string;
	onApply: () => void;
	isApplying: boolean;
	isDisabled: boolean;
}) {
	const scores = [5, 4, 3, 2, 1] as const;
	return (
		<div className="w-full flex flex-col gap-1.5 min-w-0">
			<div className="flex items-center justify-between gap-2">
				<h4 className="text-[0.7rem] font-semibold tracking-tight">{title}</h4>
				<LoadingButton
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-[0.65rem] font-bold uppercase tracking-wide"
					loading={isApplying}
					disabled={isDisabled}
					onClick={onApply}
				>
					<Check className="w-3 h-3" />
					Aplicar
				</LoadingButton>
			</div>
			<div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 text-[0.6rem] font-bold uppercase tracking-[0.06em] text-muted-foreground pb-1.5 border-b border-border">
				<span>Nota</span>
				<span>Atual</span>
				<span>Sugestão</span>
			</div>
			<div className="flex flex-col">
				{scores.map((score) => {
					const currentRange = current[score];
					const suggestedRange = suggested[score];
					return (
						<div
							key={score}
							className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 items-center py-1.5 text-[0.7rem] tabular-nums border-b border-border/40 last:border-b-0"
						>
							<span className="font-semibold text-foreground">{score}</span>
							<span className="text-foreground/90 truncate">
								{formatter(currentRange.min)} → {formatter(currentRange.max)}
							</span>
							<span className="text-muted-foreground truncate">
								{formatter(suggestedRange.min)} → {formatter(suggestedRange.max)}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function shortenLabel(label: string) {
	if (label.length <= 24) return label;
	return `${label.slice(0, 23)}…`;
}

const LABEL_COLORS: Record<string, string> = {
	CAMPEÕES: "#fb923c",
	"CLIENTES LEAIS": "#34d399",
	"POTENCIAIS CLIENTES LEAIS": "#a16207",
	"CLIENTES RECENTES": "#2dd4bf",
	PROMISSORES: "#f472b6",
	"PRECISAM DE ATENÇÃO": "#818cf8",
	"PRESTES A DORMIR": "#ca8a04",
	"EM RISCO": "#facc15",
	"NÃO PODE PERDÊ-LOS": "#60a5fa",
	HIBERNANDO: "#a78bfa",
	PERDIDOS: "#ef4444",
};

function getColorForLabel(label: string): string {
	return LABEL_COLORS[label] ?? "#6366f1";
}

function buildContinuousChartData(bins: THistogramBin[], formatter?: (value: number) => string) {
	return bins.map((bin) => ({
		...bin,
		label: formatter ? formatter(bin.start) : formatDecimalPlaces(bin.start, 0),
	}));
}

type TThresholdCandidate = { id: string; label: string; color: string; value: number };

function buildRecencyThresholds(rfmConfig: TRFMConfig): TThresholdCandidate[] {
	const colors: Record<number, string> = {
		5: "#10b981",
		4: "#22c55e",
		3: "#f59e0b",
		2: "#f97316",
		1: "#ef4444",
	};
	return [
		{ id: "r5", color: colors[5], value: rfmConfig.recencia[5].max, label: "R5" },
		{ id: "r4", color: colors[4], value: rfmConfig.recencia[4].max, label: "R4" },
		{ id: "r3", color: colors[3], value: rfmConfig.recencia[3].max, label: "R3" },
		{ id: "r2", color: colors[2], value: rfmConfig.recencia[2].max, label: "R2" },
	];
}

function buildMonetaryThresholds(rfmConfig: TRFMConfig): TThresholdCandidate[] {
	const colors: Record<number, string> = {
		1: "#ef4444",
		2: "#f97316",
		3: "#f59e0b",
		4: "#22c55e",
		5: "#10b981",
	};
	return [
		{ id: "m1", color: colors[1], value: rfmConfig.monetario[1].max, label: "M1" },
		{ id: "m2", color: colors[2], value: rfmConfig.monetario[2].max, label: "M2" },
		{ id: "m3", color: colors[3], value: rfmConfig.monetario[3].max, label: "M3" },
		{ id: "m4", color: colors[4], value: rfmConfig.monetario[4].max, label: "M4" },
	];
}

function buildThresholdsAlignedToBins(
	candidates: TThresholdCandidate[],
	bins: THistogramBin[],
	chartData: { label: string; start: number; end: number }[],
) {
	if (bins.length === 0) return [];
	const maxBinEnd = bins[bins.length - 1].end;
	const minBinStart = bins[0].start;
	return candidates
		.filter((candidate) => candidate.value >= minBinStart && candidate.value <= maxBinEnd && candidate.value > 0)
		.map((candidate) => {
			const binIndex = bins.findIndex((bin) => candidate.value >= bin.start && candidate.value <= bin.end);
			const safeIndex = binIndex === -1 ? bins.length - 1 : binIndex;
			return {
				id: candidate.id,
				label: candidate.label,
				color: candidate.color,
				binLabel: chartData[safeIndex]?.label ?? "",
			};
		})
		.filter((threshold) => threshold.binLabel !== "");
}
