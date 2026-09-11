"use client";

import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { darkenUntilReadableWithWhite } from "@/lib/organizations/colors";
import { useGoalsStats } from "@/lib/queries/goals";
import { useSalesPulse } from "@/lib/queries/stats/sales-pulse";
import { cn } from "@/lib/utils";
import { ArrowRight, Target, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { resolveTodayRange, useDayKey } from "./use-day-key";

/**
 * A faixa do topo: o que a loja vendeu hoje, a meta do período e o valor que está em risco.
 *
 * Fica acima das abas e não muda quando elas mudam — é a leitura que todo papel precisa antes de
 * escolher para onde olhar. Só o bloco de risco à direita segue a aba ativa, porque "o que está
 * parado" quer dizer coisas diferentes em Relacionamento e em Operação.
 *
 * O fundo é a cor da organização, escurecida até que texto branco passe em 4.5:1. A cor vem do
 * banco sem garantia de contraste e a linha de legenda da faixa é 13px: sem o ajuste, um teal claro
 * deixaria "83 vendas · ticket médio" ilegível. Ver `darkenUntilReadableWithWhite`.
 */

type HeroBandProps = {
	canViewSales: boolean;
	canViewGoals: boolean;
	canCreateGoals: boolean;
	/** Bloco de risco à direita: cada aba mede o seu. Ausente = a aba não tem o que medir. */
	risk: HeroRisk | null;
};

export type HeroRisk = {
	value: string;
	label: string;
	href: string;
	isPending?: boolean;
};

const PULSE_DAYS = 14;

export function HeroBand({ canViewSales, canViewGoals, canCreateGoals, risk }: HeroBandProps) {
	// Sem permissão de resultados não há faixa de vendas, mas o risco continua valendo: é pendência,
	// não resultado. Sem a faixa ao lado, ele ocupa a largura toda em vez de flutuar numa coluna.
	if (!canViewSales) return risk ? <RiskTile risk={risk} /> : null;
	return <HeroBandCard canViewGoals={canViewGoals} canCreateGoals={canCreateGoals} risk={risk} />;
}

function HeroBandCard({ canViewGoals, canCreateGoals, risk }: Omit<HeroBandProps, "canViewSales">) {
	const { colors } = useOrgColors();
	const dayKey = useDayKey();
	const dayStart = useMemo(() => resolveTodayRange(dayKey).after.toDate(), [dayKey]);
	const pulse = useSalesPulse({ dayStart, days: PULSE_DAYS });
	const goals = useGoalsStats({ enabled: canViewGoals });

	const band = darkenUntilReadableWithWhite(colors.primary) ?? colors.primary;
	const goal = canViewGoals ? (goals.data?.activeGoal ?? null) : null;

	return (
		<div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_18.75rem]">
			<section
				className="flex min-w-0 flex-col gap-3 rounded-xl px-5 py-5 text-white"
				style={{ backgroundColor: band }}
				aria-labelledby="hero-band-title"
			>
				{pulse.isPending ? (
					<BandSkeleton />
				) : pulse.isError ? (
					<p className="text-sm text-white/90">{getErrorMessage(pulse.error)}</p>
				) : (
					<BandContent data={pulse.data} accent={colors.secondary} band={band} />
				)}
			</section>

			<div className="flex min-w-0 flex-col gap-3">
				<GoalRing goal={goal} isPending={canViewGoals && goals.isPending} canCreateGoals={canCreateGoals} accent={colors.primary} />
				{risk ? <RiskTile risk={risk} /> : null}
			</div>
		</div>
	);
}

type TPulse = NonNullable<ReturnType<typeof useSalesPulse>["data"]>;

function BandContent({ data, accent, band }: { data: TPulse; accent: string; band: string }) {
	const { hoje, mesmoDiaSemanaAnterior, serie } = data;
	const chartConfig = { faturamento: { label: "Vendido", color: "#ffffff" } } satisfies ChartConfig;
	const media = serie.length > 0 ? serie.reduce((acc, day) => acc + day.faturamento, 0) / serie.length : 0;

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 id="hero-band-title" className="text-label text-white/85">
						Vendas de hoje
					</h2>
					<span className="font-black text-[2.75rem] leading-[0.95] tracking-[-0.035em]">{formatToMoney(hoje.faturamento)}</span>
					<p className="font-medium text-sm text-white/90">
						{hoje.qtdeVendas === 0
							? "Nenhuma venda registrada ainda."
							: `${formatDecimalPlaces(hoje.qtdeVendas)} ${hoje.qtdeVendas === 1 ? "venda" : "vendas"} · ticket médio ${formatToMoney(hoje.ticketMedio)}`}
					</p>
				</div>

				<dl className="flex shrink-0 gap-7 pt-1">
					<Comparison current={hoje.faturamento} previous={mesmoDiaSemanaAnterior.faturamento} />
					{hoje.recorrentes ? (
						<div className="flex flex-col gap-0.5">
							<dt className="text-micro text-white/85 uppercase tracking-[0.06em]">De quem já era cliente</dt>
							<dd className="font-black text-xl">{formatDecimalPlaces(hoje.recorrentes.percentual, 0, 0)}%</dd>
						</div>
					) : null}
				</dl>
			</div>

			<ChartContainer config={chartConfig} className="h-28 w-full">
				<AreaChart data={serie} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
					<defs>
						<linearGradient id="hero-band-area" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#ffffff" stopOpacity={0.34} />
							<stop offset="100%" stopColor="#ffffff" stopOpacity={0.02} />
						</linearGradient>
					</defs>
					<XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: "#ffffff" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
					<YAxis hide domain={[0, "dataMax"]} />
					<ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" formatter={(value) => formatToMoney(Number(value))} />} />
					{/* A média da janela dá escala ao traço: sem ela um pico e um vale têm a mesma leitura. */}
					{media > 0 ? <ReferenceLine y={media} stroke="#ffffff" strokeOpacity={0.5} strokeDasharray="4 5" strokeWidth={1} /> : null}
					<Area
						dataKey="faturamento"
						type="linear"
						stroke="#ffffff"
						strokeWidth={2.5}
						fill="url(#hero-band-area)"
						isAnimationActive={false}
						activeDot={{ r: 5, fill: accent, stroke: band, strokeWidth: 2.5 }}
					/>
				</AreaChart>
			</ChartContainer>
		</>
	);
}

function Comparison({ current, previous }: { current: number; previous: number }) {
	if (previous <= 0) {
		return (
			<div className="flex flex-col gap-0.5">
				<dt className="text-micro text-white/85 uppercase tracking-[0.06em]">Mesmo dia da semana passada</dt>
				<dd className="font-medium text-sm text-white/90">Sem vendas para comparar</dd>
			</div>
		);
	}
	const delta = ((current - previous) / previous) * 100;
	const up = delta >= 0;
	const Icon = up ? TrendingUp : TrendingDown;
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-micro text-white/85 uppercase tracking-[0.06em]">vs. semana passada</dt>
			<dd className="flex items-center gap-1 font-black text-xl">
				<Icon className="size-4" aria-hidden />
				{up ? "+" : ""}
				{formatDecimalPlaces(delta, 0, 0)}%
			</dd>
		</div>
	);
}

function BandSkeleton() {
	return (
		<div className="flex flex-col gap-3" aria-busy>
			<Skeleton className="h-3 w-28 rounded bg-white/25" />
			<Skeleton className="h-11 w-56 rounded-md bg-white/25" />
			<Skeleton className="h-3 w-44 rounded bg-white/25" />
			<Skeleton className="h-28 w-full rounded-md bg-white/20" />
		</div>
	);
}

type TActiveGoal = NonNullable<NonNullable<ReturnType<typeof useGoalsStats>["data"]>["activeGoal"]>;

const PACING = {
	ADIANTADO: { label: "Adiantada", className: "bg-success-surface text-success-surface-foreground", Icon: TrendingUp },
	NO_RITMO: { label: "No ritmo", className: "bg-muted text-foreground", Icon: TrendingUp },
	ATRASADO: { label: "Atrasada", className: "bg-destructive-surface text-destructive-surface-foreground", Icon: TrendingDown },
} as const;

const RING_RADIUS = 43;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * A meta como anel. A curva completa vive na tela de Metas; aqui só o quanto do período já foi
 * cumprido e se o ritmo está à frente ou atrás.
 */
function GoalRing({
	goal,
	isPending,
	canCreateGoals,
	accent,
}: {
	goal: TActiveGoal | null;
	isPending: boolean;
	canCreateGoals: boolean;
	accent: string;
}) {
	if (isPending) {
		return (
			<div className="flex flex-1 items-center justify-center rounded-xl border border-border bg-card py-5 shadow-2xs" aria-busy>
				<Skeleton className="size-[7.5rem] rounded-full" />
			</div>
		);
	}
	if (!goal) {
		if (!canCreateGoals) return null;
		return (
			<Link
				href={appRoutes.management.goals()}
				className="flex flex-1 items-center gap-2.5 rounded-xl border border-border border-dashed px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<Target className="size-4 shrink-0 text-muted-foreground" aria-hidden />
				<span className="flex min-w-0 flex-col">
					<span className="font-bold text-foreground text-xs">Defina uma meta</span>
					<span className="text-micro font-normal text-muted-foreground">Acompanhe o ritmo do mês por aqui.</span>
				</span>
			</Link>
		);
	}

	const percent = Math.min(Math.max(goal.percentualValor, 0), 100);
	const hit = goal.percentualValor >= 100;
	const pacing = PACING[goal.ritmo.situacao];

	return (
		<Link
			href={appRoutes.management.goals()}
			className="flex flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-card px-4 py-4 shadow-2xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div className="relative size-[7.5rem]">
				<svg
					viewBox="0 0 100 100"
					className="size-[7.5rem] -rotate-90"
					role="meter"
					aria-label="Meta do período"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(percent)}
				>
					<circle cx="50" cy="50" r={RING_RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
					<circle
						cx="50"
						cy="50"
						r={RING_RADIUS}
						fill="none"
						strokeWidth="10"
						strokeLinecap="round"
						strokeDasharray={`${(percent / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
						stroke={hit ? "var(--color-warning)" : accent}
					/>
				</svg>
				<span className="absolute inset-0 flex flex-col items-center justify-center">
					<span className="font-black text-[1.75rem] leading-none tracking-tight">{formatDecimalPlaces(goal.percentualValor, 0, 0)}%</span>
					<span className="text-micro text-muted-foreground uppercase tracking-[0.08em]">Meta do período</span>
				</span>
			</div>
			<div className="flex flex-col items-center gap-1">
				<span className="font-bold text-xs">
					{formatToMoney(goal.realizadoValor)} <span className="font-normal text-muted-foreground">/ {formatToMoney(goal.objetivoValor)}</span>
				</span>
				<span className={cn("text-micro flex items-center gap-1 rounded-full px-2.5 py-1 font-bold", pacing.className)}>
					<pacing.Icon className="size-3" aria-hidden />
					{pacing.label}
				</span>
			</div>
		</Link>
	);
}

function RiskTile({ risk }: { risk: HeroRisk }) {
	if (risk.isPending) {
		return (
			<div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-2xs" aria-busy>
				<Skeleton className="size-9 shrink-0 rounded-lg" />
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<Skeleton className="h-4 w-24 rounded" />
					<Skeleton className="h-3 w-36 rounded" />
				</div>
			</div>
		);
	}
	return (
		<Link
			href={risk.href}
			className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-2xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive-surface text-destructive-surface-foreground">
				<TriangleAlert className="size-4" aria-hidden />
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="font-black text-destructive-surface-foreground text-base leading-tight">{risk.value}</span>
				<span className="text-micro truncate font-normal text-muted-foreground">{risk.label}</span>
			</span>
			<ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
		</Link>
	);
}
