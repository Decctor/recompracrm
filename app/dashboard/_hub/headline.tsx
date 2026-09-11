"use client";

import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { useGoalsStats } from "@/lib/queries/goals";
import { useSalesPulse } from "@/lib/queries/stats/sales-pulse";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Target, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import { resolveTodayRange, useDayKey } from "./use-day-key";

/**
 * A manchete do dashboard: quanto a loja vendeu hoje, como isso se compara com a semana passada e,
 * quando existe meta ativa, o quanto do período já foi cumprido.
 *
 * Um elemento só, um gráfico só. Vendas e meta compartilham o mesmo eixo: as barras são o vendido
 * por dia e a linha de referência é o alvo diário da meta — por isso a meta não precisa de um
 * segundo gráfico, e sua ausência (o caso da maioria das organizações) não deixa buraco na tela.
 */

type HeadlineProps = {
	/** Sem permissão de resultados não há manchete: o restante do hub continua valendo. */
	canViewSales: boolean;
	canViewGoals: boolean;
	canCreateGoals: boolean;
};

export function Headline({ canViewSales, canViewGoals, canCreateGoals }: HeadlineProps) {
	if (!canViewSales) return null;
	return <HeadlineCard canViewGoals={canViewGoals} canCreateGoals={canCreateGoals} />;
}

const PACING = {
	ADIANTADO: { label: "Adiantada", className: "text-success" },
	NO_RITMO: { label: "No ritmo", className: "text-foreground" },
	ATRASADO: { label: "Atrasada", className: "text-destructive" },
} as const;

function HeadlineCard({ canViewGoals, canCreateGoals }: { canViewGoals: boolean; canCreateGoals: boolean }) {
	const { colors } = useOrgColors();
	const dayKey = useDayKey();
	const dayStart = useMemo(() => resolveTodayRange(dayKey).after.toDate(), [dayKey]);
	const pulse = useSalesPulse({ dayStart, days: 7 });
	const goals = useGoalsStats({ enabled: canViewGoals });

	const goal = canViewGoals ? (goals.data?.activeGoal ?? null) : null;
	// Alvo do dia da meta ativa: vira a linha de referência das barras. `metaDia` é nulo fora do período.
	const dailyTarget = goal?.ritmo.metaDia?.valor ?? null;

	if (pulse.isPending) return <HeadlineSkeleton />;
	if (pulse.isError) {
		return (
			<section className={cardClassName}>
				<p className="text-xs text-destructive">{getErrorMessage(pulse.error)}</p>
			</section>
		);
	}

	const data = pulse.data;
	const maxValue = Math.max(...data.serie.map((day) => day.faturamento), dailyTarget ?? 0);

	return (
		<section className={cn(cardClassName, "gap-4")} aria-labelledby="headline-title">
			<div className="flex w-full items-center justify-between gap-2">
				<h2 id="headline-title" className="text-label text-muted-foreground">
					Vendas de hoje
				</h2>
				<Link
					href={appRoutes.sales.results()}
					className="text-micro flex shrink-0 items-center gap-0.5 rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Ver resultados
					<ArrowUpRight className="size-3.5" aria-hidden />
				</Link>
			</div>

			<div className={cn("grid w-full gap-x-6 gap-y-5", "lg:grid-cols-12")}>
				{/* Coluna da esquerda: o número e, abaixo, a meta (ou o convite para criar uma). */}
				<div className="flex min-w-0 flex-col justify-between gap-5 lg:col-span-4">
					<div className="flex flex-col gap-1.5">
						<span className="text-4xl font-extrabold leading-none tracking-[-0.02em]">{formatToMoney(data.hoje.faturamento)}</span>
						<Delta current={data.hoje.faturamento} previous={data.mesmoDiaSemanaAnterior.faturamento} />
						<p className="text-xs text-muted-foreground">
							{data.hoje.qtdeVendas === 0
								? "Nenhuma venda registrada ainda."
								: `${formatDecimalPlaces(data.hoje.qtdeVendas)} ${data.hoje.qtdeVendas === 1 ? "venda" : "vendas"}, ticket médio de ${formatToMoney(data.hoje.ticketMedio)}.`}
						</p>
					</div>
					{goal ? <GoalMeter goal={goal} /> : canViewGoals && canCreateGoals ? <GoalInvite /> : null}
				</div>

				{/* Coluna da direita: os últimos 7 dias. Hoje em destaque, os demais recuados. */}
				<div className="flex min-w-0 flex-col gap-1.5 lg:col-span-8">
					<div className="text-micro flex items-center justify-between gap-2 text-muted-foreground">
						<span>Últimos 7 dias</span>
						{dailyTarget ? (
							<span className="flex items-center gap-1.5">
								<span className="h-px w-4 border-t border-dashed border-muted-foreground" aria-hidden />
								Alvo do dia: {formatToMoney(dailyTarget)}
							</span>
						) : null}
					</div>
					<SevenDayChart serie={data.serie} dailyTarget={dailyTarget} maxValue={maxValue} accent={colors.primary} />
				</div>
			</div>
		</section>
	);
}

const cardClassName = "bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-4 py-4 shadow-2xs";

function HeadlineSkeleton() {
	return (
		<section className={cardClassName} aria-busy>
			<Skeleton className="h-3 w-28 rounded" />
			<div className="grid w-full gap-6 lg:grid-cols-12">
				<div className="flex flex-col gap-3 lg:col-span-4">
					<Skeleton className="h-10 w-44 rounded-md" />
					<Skeleton className="h-3 w-36 rounded" />
					<Skeleton className="h-10 w-full rounded-md" />
				</div>
				<Skeleton className="h-28 w-full rounded-md lg:col-span-8" />
			</div>
		</section>
	);
}

function Delta({ current, previous }: { current: number; previous: number }) {
	if (previous <= 0) return <span className="text-xs text-muted-foreground">Sem vendas no mesmo dia da semana passada.</span>;
	const delta = ((current - previous) / previous) * 100;
	const up = delta >= 0;
	const Icon = up ? TrendingUp : TrendingDown;
	return (
		<span className={cn("flex items-center gap-1 text-xs font-semibold", up ? "text-success" : "text-destructive")}>
			<Icon className="size-3.5" aria-hidden />
			{up ? "+" : ""}
			{formatDecimalPlaces(delta, 0, 0)}%<span className="font-normal text-muted-foreground"> que na semana passada</span>
		</span>
	);
}

type TActiveGoal = NonNullable<NonNullable<ReturnType<typeof useGoalsStats>["data"]>["activeGoal"]>;

/** Meta como medidor, não como segundo gráfico: a curva completa vive na tela de Metas. */
function GoalMeter({ goal }: { goal: TActiveGoal }) {
	const pacing = PACING[goal.ritmo.situacao];
	const percent = Math.min(goal.percentualValor, 100);
	const hit = goal.percentualValor >= 100;
	return (
		<Link
			href={appRoutes.management.goals()}
			className="group/meta flex flex-col gap-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-micro text-muted-foreground">Meta do período</span>
				<span className={cn("text-sm font-extrabold tabular-nums", hit && "text-warning-surface-foreground")}>
					{formatDecimalPlaces(goal.percentualValor, 0, 0)}%
				</span>
			</div>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
				<div className={cn("h-full rounded-full", hit ? "bg-warning" : "bg-primary")} style={{ width: `${percent}%` }} />
			</div>
			<div className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-muted-foreground">
				<span className="tabular-nums">
					{formatToMoney(goal.realizadoValor)} de {formatToMoney(goal.objetivoValor)}
				</span>
				<span className={cn("font-semibold", pacing.className)}>{pacing.label}</span>
			</div>
		</Link>
	);
}

/** Sem meta ativa a coluna não fica vazia: vira o convite para criar a primeira. */
function GoalInvite() {
	return (
		<Link
			href={appRoutes.management.goals()}
			className="flex items-center gap-2.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<Target className="size-4 shrink-0 text-muted-foreground" aria-hidden />
			<span className="flex min-w-0 flex-col">
				<span className="text-xs font-semibold text-foreground">Defina uma meta</span>
				<span className="text-micro text-muted-foreground">Acompanhe o ritmo do mês por aqui.</span>
			</span>
		</Link>
	);
}

type TSeriePoint = { dia: string; rotulo: string; faturamento: number; qtdeVendas: number };

function SevenDayChart({
	serie,
	dailyTarget,
	maxValue,
	accent,
}: {
	serie: TSeriePoint[];
	dailyTarget: number | null;
	maxValue: number;
	accent: string;
}) {
	const lastIndex = serie.length - 1;
	const chartConfig = { faturamento: { label: "Vendido", color: accent } } satisfies ChartConfig;
	// Folga no topo para a linha de alvo não encostar na borda quando ela é o valor mais alto.
	const domainMax = maxValue > 0 ? maxValue * 1.15 : 1;
	return (
		<ChartContainer config={chartConfig} className="h-28 w-full">
			<BarChart data={serie} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
				<XAxis dataKey="rotulo" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
				<YAxis hide domain={[0, domainMax]} />
				<ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" formatter={(value) => formatToMoney(Number(value))} />} />
				{dailyTarget ? <ReferenceLine y={dailyTarget} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" strokeWidth={1} /> : null}
				<Bar dataKey="faturamento" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
					{serie.map((day, index) => (
						<Cell key={day.dia} fill={index === lastIndex ? accent : "var(--color-muted)"} />
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}
