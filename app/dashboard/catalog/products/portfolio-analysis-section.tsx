"use client";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";

import type { TGetProductsPortfolioAnalysisOutput } from "@/app/api/products/stats/portfolio-analysis/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useProductsPortfolioAnalysis } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, Info, Package, ShieldAlert, Trophy } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TPortfolioAnalysisData = TGetProductsPortfolioAnalysisOutput["data"];
type TAnalysisFinding = TPortfolioAnalysisData["findings"][number];
type TAbcDistributionItem = TPortfolioAnalysisData["abcDistribution"][number];
type THistogramBin = TPortfolioAnalysisData["histograms"]["revenue"]["bins"][number];
type TSaleFrequencyBin = TPortfolioAnalysisData["histograms"]["saleFrequency"][number];

const HISTOGRAM_BAR_COLOR = "#e3b042";
const CHART_FOREGROUND = "var(--foreground)";
const CHART_BORDER = "var(--border)";
const RECHARTS_AXIS_THEME_CLASS =
	"[&_.recharts-cartesian-axis-tick_text]:fill-foreground [&_.recharts-cartesian-axis-line]:stroke-border [&_.recharts-cartesian-axis-tick-line]:stroke-border";

const ABC_COLORS: Record<TAbcDistributionItem["label"], string> = {
	A: "#10b981",
	B: "#f59e0b",
	C: "#ef4444",
};

const CLASSIFICATION_STYLES: Record<TPortfolioAnalysisData["analysisSummary"]["classification"], { container: string; icon: string; label: string }> =
	{
		EQUILIBRADO: {
			container: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/30",
			icon: "text-emerald-500 bg-emerald-500/15",
			label: "text-emerald-600 dark:text-emerald-400",
		},
		ATENCAO: {
			container: "from-amber-500/15 to-amber-500/5 border-amber-500/30",
			icon: "text-amber-600 bg-amber-500/15",
			label: "text-amber-700 dark:text-amber-300",
		},
		CONCENTRADO: {
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

const FINDING_STYLES: Record<
	TAnalysisFinding["severity"],
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

type ProductsPortfolioAnalysisSectionProps = {
	periodAfter: Date | null;
	periodBefore: Date | null;
};

function chartAxisTick(fontSize: number) {
	return { fontSize, fill: CHART_FOREGROUND };
}

export default function ProductsPortfolioAnalysisSection({ periodAfter, periodBefore }: ProductsPortfolioAnalysisSectionProps) {
	const { data, isLoading, isError, error } = useProductsPortfolioAnalysis({ periodAfter, periodBefore });

	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-5 rounded-xl border px-4 py-5 shadow-2xs")}>
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
					<Package className="w-4 h-4 min-w-4 min-h-4" />
					<h1 className="text-xs font-medium tracking-tight uppercase">ANÁLISE DO PORTFÓLIO</h1>
				</div>
				<p className="text-[0.7rem] text-muted-foreground">Distribuição, concentração, margem e atividade dos produtos no período.</p>
			</div>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{data ? <PortfolioAnalysisContent data={data} /> : null}
		</div>
	);
}

function PortfolioAnalysisContent({ data }: { data: TPortfolioAnalysisData }) {
	if (data.totalProducts === 0) {
		return (
			<div className="w-full py-12 flex flex-col items-center justify-center gap-2 text-center">
				<Package className="w-6 h-6 text-muted-foreground" />
				<p className="text-sm font-medium">Sem produtos para analisar.</p>
				<p className="text-xs text-muted-foreground">Cadastre ou sincronize produtos e tente novamente.</p>
			</div>
		);
	}

	return (
		<div className="w-full flex flex-col gap-6">
			<AnalysisSummaryCard data={data} />
			<AbcDistributionBlock distribution={data.abcDistribution} activeProducts={data.activeProducts} />
			<VitalityBlock vitality={data.vitality} concentration={data.concentration} />
			<TopRevenueConcentrationBlock items={data.topRevenueConcentration} />
			<HistogramsBlock data={data} />
		</div>
	);
}

function SectionHeader({ title, description, meta }: { title: string; description?: string; meta?: ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-3 flex-col md:flex-row md:items-end">
			<div className="flex flex-col gap-0.5 min-w-0">
				<h3 className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
				{description ? <p className="text-[0.7rem] text-muted-foreground/80">{description}</p> : null}
			</div>
			{meta ? <div className="flex items-center gap-2 shrink-0">{meta}</div> : null}
		</div>
	);
}

function AnalysisSummaryCard({ data }: { data: TPortfolioAnalysisData }) {
	const style = CLASSIFICATION_STYLES[data.analysisSummary.classification];
	const criticalCount = data.findings.filter((finding) => finding.severity === "critical").length;
	const warningCount = data.findings.filter((finding) => finding.severity === "warning").length;
	const infoCount = data.findings.filter((finding) => finding.severity === "info").length;
	const [findingsMenuIsOpen, setFindingsMenuIsOpen] = useState(false);

	return (
		<>
			<div
				className={cn(
					"relative w-full rounded-xl border bg-gradient-to-br p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
					style.container,
				)}
			>
				<div className="flex items-start gap-3 min-w-0">
					<div className={cn("rounded-lg p-2 shrink-0", style.icon)}>
						<Package className="w-5 h-5" />
					</div>
					<div className="flex flex-col gap-1 min-w-0">
						<span className={cn("text-[0.65rem] font-bold tracking-widest uppercase", style.label)}>RESUMO ESTATÍSTICO</span>
						<h2 className={cn("text-base font-semibold tracking-tight uppercase", style.label)}>{data.analysisSummary.label}</h2>
						<p className="text-xs text-foreground/80 max-w-xl">{data.analysisSummary.summary}</p>
					</div>
				</div>
				<div className="flex flex-wrap items-stretch gap-2">
					<AnalysisSummaryChip label="Produtos no catálogo" value={formatDecimalPlaces(data.totalProducts, 0)} />
					<AnalysisSummaryChip label="Ativos no período" value={formatDecimalPlaces(data.activeProducts, 0)} />
					<FindingsSummaryButton
						criticalCount={criticalCount}
						warningCount={warningCount}
						infoCount={infoCount}
						onClick={() => setFindingsMenuIsOpen(true)}
					/>
				</div>
			</div>
			{findingsMenuIsOpen ? (
				<ResponsiveMenu.Root
					open
					onOpenChange={(open) => {
						if (!open) (() => setFindingsMenuIsOpen(false))();
					}}
				>
					<ResponsiveMenu.Content dialogVariant="sm" drawerVariant="md" dialogClassName="h-[60%] min-h-[60%] w-[40%] min-w-[40%] max-w-[40%]">
						<ResponsiveMenu.Header>
							<ResponsiveMenu.Title>PONTOS DE LEITURA</ResponsiveMenu.Title>
							<ResponsiveMenu.Description>Concentração, atividade e margem que merecem leitura antes de decisões sobre o mix.</ResponsiveMenu.Description>
						</ResponsiveMenu.Header>
						<ResponsiveMenu.Body>
							<FindingsContent findings={data.findings} />
						</ResponsiveMenu.Body>
						<ResponsiveMenu.Footer>
							<ResponsiveMenu.Close variant="outline">FECHAR</ResponsiveMenu.Close>
						</ResponsiveMenu.Footer>
					</ResponsiveMenu.Content>
				</ResponsiveMenu.Root>
			) : null}
		</>
	);
}

function AnalysisSummaryChip({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "critical" | "warning" }) {
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

function FindingsSummaryButton({
	criticalCount,
	warningCount,
	infoCount,
	onClick,
}: {
	criticalCount: number;
	warningCount: number;
	infoCount: number;
	onClick: () => void;
}) {
	const totalCount = criticalCount + warningCount + infoCount;
	const hasCritical = criticalCount > 0;
	const hasWarning = warningCount > 0;
	const toneClasses = hasCritical
		? "border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-300"
		: hasWarning
			? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
			: "border-border bg-background/60 text-foreground hover:bg-background";
	const summary = totalCount > 0 ? `${criticalCount} críticos · ${warningCount} atenção · ${infoCount} obs.` : "Nada fora do padrão";

	return (
		<Button
			type="button"
			variant="ghost"
			onClick={onClick}
			className={cn("h-auto min-w-[178px] justify-between rounded-lg border px-2.5 py-1.5 text-left transition-colors", toneClasses)}
		>
			<span className="flex min-w-0 items-start gap-2">
				<ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0" />
				<span className="flex min-w-0 flex-col items-start">
					<span className="text-[0.6rem] font-bold uppercase tracking-wide opacity-80">Pontos de leitura</span>
					<span className="text-sm font-semibold tabular-nums">{formatDecimalPlaces(totalCount, 0)}</span>
				</span>
			</span>
			<ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
		</Button>
	);
}

function FindingsContent({ findings }: { findings: TAnalysisFinding[] }) {
	return (
		<div className="flex w-full flex-col gap-3">
			{findings.length === 0 ? (
				<div className="flex items-start gap-2 text-foreground/80">
					<CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
					<div className="flex flex-col gap-0.5">
						<p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Nenhum ponto fora do padrão.</p>
						<p className="text-[0.7rem] text-foreground/70">A distribuição dos produtos está coerente com o comportamento de vendas no período.</p>
					</div>
				</div>
			) : (
				<ul className="flex flex-col gap-2">
					{findings.map((finding) => {
						const style = FINDING_STYLES[finding.severity];
						const Icon = style.iconComponent;
						return (
							<li key={finding.id} className={cn("flex items-start gap-2 rounded-lg border p-3", style.container)}>
								<Icon className={cn("w-4 h-4 mt-0.5 shrink-0", style.icon)} />
								<div className="flex flex-col gap-0.5">
									<p className="text-xs font-semibold">{finding.title}</p>
									<p className="text-[0.7rem] text-foreground/80">{finding.description}</p>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

function AbcDistributionBlock({ distribution, activeProducts }: { distribution: TAbcDistributionItem[]; activeProducts: number }) {
	const chartData = useMemo(
		() =>
			distribution.map((item) => ({
				label: `Classe ${item.label}`,
				shortLabel: item.label,
				count: item.count,
				percentage: item.percentage,
				revenueShare: item.revenueShare,
				fill: ABC_COLORS[item.label],
			})),
		[distribution],
	);

	return (
		<section className="flex w-full flex-col gap-3">
			<SectionHeader
				title="Distribuição ABC"
				description="Quantos produtos ativos caem em cada classe e sua participação no faturamento"
				meta={
					<span className="text-[0.65rem] uppercase font-semibold tracking-wide text-muted-foreground tabular-nums">
						{formatDecimalPlaces(activeProducts, 0)} ativos
					</span>
				}
			/>
			<div className={cn("w-full h-[280px]", RECHARTS_AXIS_THEME_CLASS)}>
				<ResponsiveContainer width="100%" height="100%">
					<BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
						<CartesianGrid horizontal={false} stroke={CHART_BORDER} strokeDasharray="3 3" />
						<XAxis type="number" tick={chartAxisTick(10)} tickFormatter={(value) => formatDecimalPlaces(value, 0)} stroke={CHART_BORDER} />
						<YAxis type="category" dataKey="shortLabel" width={36} tick={chartAxisTick(10)} stroke={CHART_BORDER} />
						<Tooltip
							cursor={{ fill: "hsl(var(--muted))", opacity: 0.2 }}
							content={({ active, payload }) => {
								if (!active || !payload || payload.length === 0) return null;
								const entry = payload[0].payload as (typeof chartData)[number];
								return (
									<div className="rounded-lg border border-border bg-background p-2 shadow-lg flex flex-col gap-0.5">
										<p className="text-xs font-semibold">{entry.label}</p>
										<p className="text-[0.7rem] text-muted-foreground">
											{formatDecimalPlaces(entry.count, 0)} produtos Â· {formatDecimalPlaces(entry.percentage, 1)}% dos ativos
										</p>
										<p className="text-[0.7rem] text-muted-foreground">{formatDecimalPlaces(entry.revenueShare, 1)}% do faturamento</p>
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

function VitalityBlock({
	vitality,
	concentration,
}: {
	vitality: TPortfolioAnalysisData["vitality"];
	concentration: TPortfolioAnalysisData["concentration"];
}) {
	return (
		<section className="flex w-full flex-col gap-3 border-t border-border pt-5">
			<SectionHeader title="Vitalidade e concentração" description="Movimento do catálogo e dependência de poucos SKUs" />
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<VitalityChip
					label="Ativos"
					value={`${formatDecimalPlaces(vitality.active.percentage, 1)}%`}
					sub={`${formatDecimalPlaces(vitality.active.count, 0)} produtos`}
				/>
				<VitalityChip
					label="Dormantes"
					value={`${formatDecimalPlaces(vitality.dormant.percentage, 1)}%`}
					sub={`${formatDecimalPlaces(vitality.dormant.count, 0)} produtos`}
				/>
				<VitalityChip label="SKUs p/ 80% receita" value={formatDecimalPlaces(concentration.productsFor80PctRevenue, 0)} sub="produtos ativos" />
				<VitalityChip label="Gini (receita)" value={formatDecimalPlaces(concentration.gini, 2)} sub="0 = uniforme Â· 1 = concentrado" />
			</div>
		</section>
	);
}

function VitalityChip({ label, value, sub }: { label: string; value: string; sub: string }) {
	return (
		<div className="flex flex-col gap-0.5 rounded-lg border border-border bg-background/60 px-3 py-2">
			<span className="text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
			<span className="text-sm font-semibold tabular-nums">{value}</span>
			<span className="text-[0.65rem] text-muted-foreground">{sub}</span>
		</div>
	);
}

function TopRevenueConcentrationBlock({ items }: { items: TPortfolioAnalysisData["topRevenueConcentration"] }) {
	return (
		<section className="flex w-full flex-col gap-3 border-t border-border pt-5">
			<SectionHeader title="Concentração por ranking" description="Quanto do faturamento vem dos produtos com maior receita no período" />
			<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
				{items.map((item) => (
					<div key={item.limit} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-background/60 p-3">
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2 min-w-0">
								<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
									<Trophy className="h-3.5 w-3.5" />
								</span>
								<div className="flex min-w-0 flex-col">
									<span className="text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground">Top {item.limit}</span>
									<span className="text-xs font-semibold tabular-nums">{formatDecimalPlaces(item.productsCount, 0)} produtos</span>
								</div>
							</div>
							<span className="text-lg font-semibold tabular-nums">{formatDecimalPlaces(item.revenueShare, 1)}%</span>
						</div>
						<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
							<div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, Math.max(0, item.revenueShare))}%` }} />
						</div>
						<div className="flex items-baseline justify-between gap-2 text-[0.68rem]">
							<span className="font-bold uppercase tracking-wide text-muted-foreground">Faturamento</span>
							<span className="font-semibold tabular-nums text-foreground">{formatToMoney(item.revenue)}</span>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function HistogramsBlock({ data }: { data: TPortfolioAnalysisData }) {
	return (
		<section className="flex w-full flex-col gap-3 border-t border-border pt-5">
			<SectionHeader title="Distribuição estatística" description="Faturamento, margem e frequência de venda entre produtos ativos" />
			<div className={cn("grid grid-cols-1 gap-x-8 gap-y-6", data.histograms.margin && data.metrics.margin ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
				<RevenueHistogram histogram={data.histograms.revenue} metric={data.metrics.revenue} />
				{/* `null` = membro sem dadosSensiveis.visualizarCustos: o histograma de margem não existe. */}
				{data.histograms.margin && data.metrics.margin ? <MarginHistogram histogram={data.histograms.margin} metric={data.metrics.margin} /> : null}
				<SaleFrequencyHistogram histogram={data.histograms.saleFrequency} metric={data.metrics.saleFrequency} />
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
	metric: TPortfolioAnalysisData["metrics"]["revenue"];
	children: React.ReactNode;
}) {
	return (
		<div className="w-full flex flex-col gap-2 min-w-0">
			<div className="flex flex-col gap-0.5">
				<h4 className="text-[0.72rem] font-semibold tracking-tight">{title}</h4>
				<p className="text-[0.65rem] text-muted-foreground">{subtitle}</p>
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] text-muted-foreground">
				<MetricStat label="mediana" value={metric.median != null ? formatDecimalPlaces(metric.median, 1) : "—"} />
				<MetricStat label="média" value={metric.average != null ? formatDecimalPlaces(metric.average, 1) : "—"} />
				<MetricStat label="p90" value={metric.percentiles.p90 != null ? formatDecimalPlaces(metric.percentiles.p90, 1) : "—"} />
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

function RevenueHistogram({
	histogram,
	metric,
}: {
	histogram: TPortfolioAnalysisData["histograms"]["revenue"];
	metric: TPortfolioAnalysisData["metrics"]["revenue"];
}) {
	const chartData = useMemo(() => buildContinuousChartData(histogram.bins, formatToMoney), [histogram.bins]);

	return (
		<HistogramFrame title="Faturamento (R$)" subtitle="Receita por produto ativo no período" metric={metric}>
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={chartData} margin={{ left: 0, right: 8, top: 12, bottom: 4 }}>
					<CartesianGrid stroke={CHART_BORDER} strokeDasharray="3 3" vertical={false} />
					<XAxis dataKey="label" tick={chartAxisTick(8)} stroke={CHART_BORDER} interval={1} />
					<YAxis tick={chartAxisTick(9)} stroke={CHART_BORDER} />
					<Tooltip content={<HistogramTooltip valueFormatter={formatToMoney} unitLabel="produtos" />} />
					<Bar dataKey="count" fill={HISTOGRAM_BAR_COLOR} radius={[4, 4, 0, 0]} />
				</BarChart>
			</ResponsiveContainer>
		</HistogramFrame>
	);
}

function MarginHistogram({
	histogram,
	metric,
}: {
	histogram: NonNullable<TPortfolioAnalysisData["histograms"]["margin"]>;
	metric: NonNullable<TPortfolioAnalysisData["metrics"]["margin"]>;
}) {
	const chartData = useMemo(() => buildContinuousChartData(histogram.bins, (value) => `${formatDecimalPlaces(value, 0)}%`), [histogram.bins]);

	return (
		<HistogramFrame title="Margem (%)" subtitle="Margem percentual por produto com venda" metric={metric}>
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={chartData} margin={{ left: 0, right: 8, top: 12, bottom: 4 }}>
					<CartesianGrid stroke={CHART_BORDER} strokeDasharray="3 3" vertical={false} />
					<XAxis dataKey="label" tick={chartAxisTick(8)} stroke={CHART_BORDER} interval={1} />
					<YAxis tick={chartAxisTick(9)} stroke={CHART_BORDER} />
					<Tooltip content={<HistogramTooltip valueFormatter={(value) => `${formatDecimalPlaces(value, 1)}%`} unitLabel="produtos" />} />
					<Bar dataKey="count" fill={HISTOGRAM_BAR_COLOR} radius={[4, 4, 0, 0]} />
				</BarChart>
			</ResponsiveContainer>
		</HistogramFrame>
	);
}

function SaleFrequencyHistogram({
	histogram,
	metric,
}: {
	histogram: TPortfolioAnalysisData["histograms"]["saleFrequency"];
	metric: TPortfolioAnalysisData["metrics"]["saleFrequency"];
}) {
	const chartData = useMemo(() => histogram.map((bin) => ({ ...bin, label: bin.label })), [histogram]);

	return (
		<HistogramFrame title="Frequência (vendas)" subtitle="Número de vendas distintas por produto" metric={metric}>
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={chartData} margin={{ left: 0, right: 8, top: 12, bottom: 4 }}>
					<CartesianGrid stroke={CHART_BORDER} strokeDasharray="3 3" vertical={false} />
					<XAxis dataKey="label" tick={chartAxisTick(10)} stroke={CHART_BORDER} />
					<YAxis tick={chartAxisTick(9)} stroke={CHART_BORDER} />
					<Tooltip
						content={({ active, payload }) => {
							if (!active || !payload || payload.length === 0) return null;
							const entry = payload[0].payload as TSaleFrequencyBin;
							return (
								<div className="rounded-lg border border-border bg-background p-2 shadow-lg flex flex-col gap-0.5">
									<p className="text-xs font-semibold">{entry.label} vendas</p>
									<p className="text-[0.7rem] text-muted-foreground">{formatDecimalPlaces(entry.count, 0)} produtos</p>
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

function HistogramTooltip({
	active,
	payload,
	valueFormatter,
	unitLabel,
}: {
	active?: boolean;
	payload?: { payload: { start: number; end: number; count: number; label: string } }[];
	valueFormatter: (value: number) => string;
	unitLabel: string;
}) {
	if (!active || !payload || payload.length === 0) return null;
	const entry = payload[0].payload;
	return (
		<div className="rounded-lg border border-border bg-background p-2 shadow-lg flex flex-col gap-0.5">
			<p className="text-xs font-semibold">
				{valueFormatter(entry.start)} → {valueFormatter(entry.end)}
			</p>
			<p className="text-[0.7rem] text-muted-foreground">
				{formatDecimalPlaces(entry.count, 0)} {unitLabel}
			</p>
		</div>
	);
}

function buildContinuousChartData(bins: THistogramBin[], formatter?: (value: number) => string) {
	return bins.map((bin) => ({
		...bin,
		label: formatter ? formatter(bin.start) : formatDecimalPlaces(bin.start, 0),
	}));
}
