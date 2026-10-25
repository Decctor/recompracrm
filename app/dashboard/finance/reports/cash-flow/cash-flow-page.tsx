"use client";

import dayjs from "dayjs";
import { Banknote, CalendarClock, CalendarX2, Flame, Hourglass, Repeat, TriangleAlert, Wallet } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	FINANCE_COLORS,
	formatCompactMoney,
	getColumnTooltipPosition,
	KpiSparkline,
	LegendSwatch,
	TooltipRows,
} from "@/app/dashboard/finance/_components/finance-chart-kit";
import { MetricLabel, ReportCard, ReportCardHeader, ReportSectionState } from "@/app/dashboard/inventory/reports/_components/report-section";
import { ChartCrosshair, ChartHoverColumns } from "@/components/Charts/ChartPrimitives";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import SegmentedControl from "@/components/Utils/SegmentedControl";
import { Skeleton } from "@/components/ui/skeleton";
import { niceDomain } from "@/lib/charts/geometry";
import { getFinancialAccountBalanceType } from "@/lib/finances/financial-account-configuration";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useFinancesCashFlow } from "@/lib/queries/finance-analytics";
import { cn } from "@/lib/utils";
import { FinancialAccountTypeOptions } from "@/utils/select-options";

const HORIZON_OPTIONS = [30, 60, 90].map((days) => ({ value: days, label: `${days} dias` }));
/** Cores da barra de participação por conta (na ordem de saldo). */
const ACCOUNT_SHARE_COLORS = [FINANCE_COLORS.subtotal, FINANCE_COLORS.accent, "#e3b042", "#9a691e", "#7a5117", "#f5cf52"];
const NEGATIVE_COLOR = "#b42318";

type TCashFlowData = NonNullable<ReturnType<typeof useFinancesCashFlow>["data"]>;

export default function CashFlowPage() {
	const { data, isLoading, error, horizonDays, setHorizonDays } = useFinancesCashFlow({ initialHorizonDays: 90 });
	const projection = data?.projecao;

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
				<h1 className="text-xs font-bold uppercase tracking-tight">Fluxo de caixa</h1>
				<SegmentedControl aria-label="Horizonte da projeção" value={horizonDays} options={HORIZON_OPTIONS} onChange={setHorizonDays} />
			</div>

			{projection?.primeiraDataNegativa ? (
				<div className="flex w-full items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-3 text-red-700 dark:text-red-400">
					<TriangleAlert className="size-4 min-w-4" />
					<p className="text-xs font-medium">
						A projeção indica caixa negativo a partir de {dayjs(projection.primeiraDataNegativa).format("DD/MM/YYYY")}. Considere antecipar recebimentos ou
						renegociar saídas previstas até essa data.
					</p>
				</div>
			) : null}

			<ReportSectionState isLoading={isLoading} error={error} skeletonClassName="h-40">
				{data ? <CashKpis data={data} /> : null}
			</ReportSectionState>

			{error ? null : (
				<div className="flex flex-wrap items-start gap-4">
					<div className="min-w-0 flex-[7_1_560px]">
						<ReportSectionState
							isLoading={isLoading}
							error={null}
							skeletonClassName="h-[460px]"
							isEmpty={!!data && data.projecao.diaria.length === 0}
							emptyMessage="Sem dados de projeção."
						>
							{data ? <ProjectionCard data={data} /> : null}
						</ReportSectionState>
					</div>
					<div className="flex min-w-0 flex-[3_1_300px] flex-col gap-4">
						{isLoading ? (
							<>
								<Skeleton className="h-64 w-full rounded-xl" />
								<Skeleton className="h-48 w-full rounded-xl" />
							</>
						) : data ? (
							<>
								<AccountsBalanceCard data={data} />
								<ProjectionSummaryCard data={data} />
								<LargestOutflowsCard data={data} horizonDays={horizonDays} />
							</>
						) : null}
					</div>
				</div>
			)}
		</div>
	);
}

function CashKpis({ data }: { data: TCashFlowData }) {
	const overview = data.visaoGeral;
	const history = overview.saldoConsolidadoDiario;
	const monthlyNet = overview.fluxosMensaisHistorico.map((month) => month.liquido);
	const formatSignedMoney = (value: number) => `${value > 0 ? "+" : ""}${formatToMoney(value)}`;
	const noBurn = overview.queimaMensal === 0;
	const runwayLabel = noBurn
		? "Sem queima"
		: overview.mesesDeCaixa === null
			? "—"
			: overview.mesesDeCaixa > 36
				? "36+ meses"
				: `${formatDecimalPlaces(overview.mesesDeCaixa, 1, 1)} meses`;
	const recurringNet = overview.recorrentesEntradaMensal - overview.recorrentesSaidaMensal;

	return (
		<div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
			<StatUnitCard
				title="Caixa consolidado"
				subtitle="Bancos, caixa e carteiras"
				icon={<Wallet className="size-4" />}
				current={{ value: overview.totalCaixa, format: formatToMoney }}
				previous={history.length > 0 ? { value: history[0].saldo, format: formatToMoney } : undefined}
				previousLabel="HÁ 30 DIAS"
				footer={<KpiSparkline values={history.map((point) => point.saldo)} label="30D" />}
			/>
			<StatUnitCard
				title="Geração média (3M)"
				subtitle="Entradas − saídas por mês"
				icon={<Flame className="size-4" />}
				current={{ value: overview.mediaLiquidaMensal, format: formatSignedMoney }}
				previous={{ value: overview.mediaLiquidaMensalAnterior, format: formatSignedMoney }}
				previousLabel="NOS 3M ANTERIORES"
				footer={<KpiSparkline values={monthlyNet} label="6M" />}
			/>
			<StatUnitCard
				title="Runway"
				subtitle="Caixa ÷ burn médio mensal"
				icon={<Hourglass className="size-4" />}
				current={{ value: overview.mesesDeCaixa ?? 0, format: () => runwayLabel }}
				footer={
					<p className="text-muted-foreground text-xs tracking-tight">
						{noBurn ? "FLUXO POSITIVO NOS ÚLTIMOS 3 MESES" : `QUEIMA MÉDIA: ${formatToMoney(overview.queimaMensal)}/MÊS`}
					</p>
				}
			/>
			<StatUnitCard
				title="Recorrentes / mês"
				subtitle={`Entradas ${formatCompactMoney(overview.recorrentesEntradaMensal)} · Saídas ${formatCompactMoney(overview.recorrentesSaidaMensal)}`}
				icon={<Repeat className="size-4" />}
				current={{ value: recurringNet, format: formatToMoney }}
			/>
		</div>
	);
}

function AxisLine({ top, label, solid }: { top: number; label: string; solid?: boolean }) {
	return (
		<div
			className={cn("border-border pointer-events-none absolute inset-x-0 border-t", solid ? "border-solid" : "border-dashed")}
			style={{ top: `${top}%` }}
		>
			<span className="text-muted-foreground absolute right-full -top-[7px] mr-2 whitespace-nowrap text-[11px] tabular-nums">{label}</span>
		</div>
	);
}

function ProjectionCard({ data }: { data: TCashFlowData }) {
	const [hovered, setHovered] = useState<number | null>(null);
	const projection = data.projecao;
	const days = projection.diaria;
	const count = days.length;

	let minIndex = 0;
	let maxBalance = Number.NEGATIVE_INFINITY;
	days.forEach((day, index) => {
		if (day.saldoProjetado < days[minIndex].saldoProjetado) minIndex = index;
		maxBalance = Math.max(maxBalance, day.saldoProjetado);
	});
	const minBalance = days[minIndex]?.saldoProjetado ?? 0;
	const domain = niceDomain(Math.min(0, minBalance * 1.1), Math.max(0, maxBalance, projection.saldoInicial) * 1.15, 4, { includeZero: true });
	const y = (value: number) => (1 - (value - domain.min) / (domain.max - domain.min || 1)) * 100;
	const x = (index: number) => ((index + 0.5) / count) * 100;
	const line = days.map((day, index) => `${index ? "L" : "M"}${x(index).toFixed(2)} ${y(day.saldoProjetado).toFixed(2)}`).join(" ");
	const area = `${line} L${x(count - 1).toFixed(2)} 100 L${x(0).toFixed(2)} 100 Z`;

	const maxIn = Math.max(0, ...days.map((day) => day.entradas));
	const maxOut = Math.max(0, ...days.map((day) => day.saidas));
	const barTotal = (maxIn + maxOut) * 1.08 || 1;
	const barZero = ((maxIn * 1.04) / barTotal) * 100;
	const tickStep = count <= 31 ? 5 : count <= 61 ? 7 : 14;
	const ticks = days.flatMap((day, index) => (index % tickStep === 0 ? [{ left: x(index), label: dayjs(day.data).format("DD/MM") }] : []));

	const minDotShift = minIndex > count * 0.7 ? "-100%" : minIndex < count * 0.15 ? "-8%" : "-50%";
	const hoveredDay = hovered !== null ? days[hovered] : null;
	const tooltip = hovered !== null ? getColumnTooltipPosition(hovered, count) : null;

	return (
		<ReportCard className="gap-3 px-4 pb-3">
			<ReportCardHeader icon={CalendarClock} title="SALDO PROJETADO">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground text-[11px] font-semibold">AO FINAL DO HORIZONTE</span>
					<span className="text-base font-extrabold tabular-nums" style={{ color: projection.saldoFinal < 0 ? NEGATIVE_COLOR : undefined }}>
						{formatToMoney(projection.saldoFinal)}
					</span>
				</div>
			</ReportCardHeader>

			<div className="relative mt-[22px] ml-16 h-[230px]" onMouseLeave={() => setHovered(null)}>
				{domain.ticks.map((tick) => (
					<AxisLine key={tick} top={y(tick)} label={formatCompactMoney(tick)} solid={tick === 0 && domain.min < 0} />
				))}
				<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
					<defs>
						<linearGradient id="cash-projection-fill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={FINANCE_COLORS.subtotal} stopOpacity={0.22} />
							<stop offset="100%" stopColor={FINANCE_COLORS.subtotal} stopOpacity={0.02} />
						</linearGradient>
					</defs>
					<path d={area} fill="url(#cash-projection-fill)" stroke="none" />
					<path d={line} fill="none" stroke={FINANCE_COLORS.subtotal} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
				</svg>
				<div
					className="bg-card pointer-events-none absolute size-2.5 rounded-full border-2"
					style={{ left: `${x(minIndex)}%`, top: `${y(minBalance)}%`, margin: "-5px 0 0 -5px", borderColor: FINANCE_COLORS.subtotal }}
				>
					<span
						className="bg-card border-border absolute top-3.5 left-1/2 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
						style={{ transform: `translateX(${minDotShift})`, color: minBalance < 0 ? NEGATIVE_COLOR : undefined }}
					>
						Menor saldo · {dayjs(days[minIndex]?.data).format("DD/MM")} · {formatToMoney(minBalance)}
					</span>
				</div>
				<div
					className="pointer-events-none absolute size-2 rounded-full"
					style={{ left: `${x(count - 1)}%`, top: `${y(projection.saldoFinal)}%`, margin: "-4px 0 0 -4px", background: FINANCE_COLORS.subtotal }}
				/>
				{hoveredDay && hovered !== null ? <ChartCrosshair x={x(hovered)} y={y(hoveredDay.saldoProjetado)} dotClassName="bg-[#24549c]" /> : null}
				<ChartHoverColumns count={count} onEnter={setHovered} />
				{hoveredDay && tooltip ? (
					<div
						className="bg-popover text-popover-foreground border-border pointer-events-none absolute -top-3.5 z-20 flex min-w-[200px] flex-col gap-1.5 rounded-[10px] border px-2.5 py-2 shadow-[0_12px_24px_rgba(0,0,0,0.08),0_4px_8px_rgba(0,0,0,0.04)]"
						style={{ left: `${tooltip.left}%`, transform: `translateX(${tooltip.translateX})` }}
					>
						<TooltipRows
							title={dayjs(hoveredDay.data).format("DD/MM/YYYY")}
							rows={[
								{ label: "Saldo projetado", value: formatToMoney(hoveredDay.saldoProjetado), color: FINANCE_COLORS.subtotal },
								{ label: "Entradas previstas", value: formatToMoney(hoveredDay.entradas), color: FINANCE_COLORS.inflow },
								{ label: "Saídas previstas", value: formatToMoney(hoveredDay.saidas), color: FINANCE_COLORS.outflow },
							]}
						/>
					</div>
				) : null}
			</div>

			<div className="border-border mt-3 ml-16 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
				<div className="flex items-center gap-2">
					<Banknote className="size-4" />
					<h3 className="text-xs font-medium uppercase leading-none tracking-tight">Entradas e saídas previstas</h3>
				</div>
				<div className="text-muted-foreground flex items-center gap-3.5 text-xs">
					<span className="flex items-center gap-1.5">
						<LegendSwatch color={FINANCE_COLORS.inflow} />
						Entradas
					</span>
					<span className="flex items-center gap-1.5">
						<LegendSwatch color={FINANCE_COLORS.outflow} />
						Saídas
					</span>
				</div>
			</div>
			<div className="relative mt-1 ml-16 h-[130px]" onMouseLeave={() => setHovered(null)}>
				<AxisLine top={barZero - (maxIn / barTotal) * 100} label={formatCompactMoney(maxIn)} />
				<AxisLine top={barZero} label="R$ 0" />
				<AxisLine top={barZero + (maxOut / barTotal) * 100} label={formatCompactMoney(-maxOut)} />
				{days.map((day, index) => (
					<div
						key={day.data}
						className="pointer-events-none absolute inset-y-0"
						style={{ left: `${(index / count) * 100}%`, width: `${100 / count}%`, opacity: hovered === null || hovered === index ? 1 : 0.45 }}
					>
						<div
							className="absolute inset-x-[15%] rounded-t-[2px]"
							style={{
								top: `${barZero - (day.entradas / barTotal) * 100}%`,
								height: `${(day.entradas / barTotal) * 100}%`,
								background: FINANCE_COLORS.inflow,
							}}
						/>
						<div
							className="absolute inset-x-[15%] rounded-b-[2px]"
							style={{ top: `${barZero}%`, height: `${(day.saidas / barTotal) * 100}%`, background: FINANCE_COLORS.outflow }}
						/>
					</div>
				))}
				<ChartHoverColumns count={count} onEnter={setHovered} />
			</div>
			<div className="relative mt-1 ml-16 h-4">
				{ticks.map((tick) => (
					<span
						key={tick.label}
						className="text-muted-foreground absolute -translate-x-1/2 whitespace-nowrap text-[11px] tabular-nums"
						style={{ left: `${tick.left}%` }}
					>
						{tick.label}
					</span>
				))}
			</div>
		</ReportCard>
	);
}

function CardIconBadge({ children }: { children: ReactNode }) {
	return <div className="bg-primary/12 flex size-7 items-center justify-center rounded-full [&>svg]:size-4">{children}</div>;
}

function AccountsBalanceCard({ data }: { data: TCashFlowData }) {
	const overview = data.visaoGeral;
	const cashAccounts = overview.contas
		.filter((account) => getFinancialAccountBalanceType(account.tipo) !== "LIABILITY")
		.sort((a, b) => b.saldoAtual - a.saldoAtual);
	const liabilityAccounts = overview.contas.filter(
		(account) => getFinancialAccountBalanceType(account.tipo) === "LIABILITY" && account.saldoAtual !== 0,
	);
	const shareBase = cashAccounts.reduce((total, account) => total + Math.max(0, account.saldoAtual), 0);
	const shareOf = (value: number) => (shareBase > 0 ? (Math.max(0, value) / shareBase) * 100 : 0);

	return (
		<ReportCard className="gap-3.5 px-4">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<CardIconBadge>
						<Wallet />
					</CardIconBadge>
					<h3 className="text-xs font-medium uppercase leading-none tracking-tight">Saldo por conta</h3>
				</div>
				<span className="text-sm font-bold tabular-nums">{formatToMoney(overview.totalCaixa)}</span>
			</div>
			{shareBase > 0 ? (
				<div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
					{cashAccounts.map((account, index) => (
						<div
							key={account.id}
							style={{ width: `${shareOf(account.saldoAtual)}%`, background: ACCOUNT_SHARE_COLORS[index % ACCOUNT_SHARE_COLORS.length] }}
						/>
					))}
				</div>
			) : null}
			<div className="flex flex-col">
				{cashAccounts.length === 0 ? <p className="text-muted-foreground border-border border-t py-2.5 text-xs">Nenhuma conta de caixa ativa.</p> : null}
				{cashAccounts.map((account, index) => (
					<div key={account.id} className="border-border flex items-center gap-2.5 border-t py-2">
						<span className="size-2 shrink-0 rounded-[2px]" style={{ background: ACCOUNT_SHARE_COLORS[index % ACCOUNT_SHARE_COLORS.length] }} />
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span className="truncate text-[13px] font-semibold">{account.nome}</span>
							<span className="text-muted-foreground text-[11px]">
								{FinancialAccountTypeOptions.find((option) => option.value === account.tipo)?.label ?? account.tipo}
								{shareBase > 0 ? ` · ${formatDecimalPlaces(shareOf(account.saldoAtual), 1, 1)}%` : ""}
							</span>
						</div>
						<span className="text-[13px] font-semibold tabular-nums" style={{ color: account.saldoAtual < 0 ? NEGATIVE_COLOR : undefined }}>
							{formatToMoney(account.saldoAtual)}
						</span>
					</div>
				))}
				{liabilityAccounts.map((account) => (
					<div key={account.id} className="border-border flex items-center gap-2.5 border-t py-2">
						<span className="size-2 shrink-0 rounded-[2px]" style={{ background: NEGATIVE_COLOR }} />
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span className="truncate text-[13px] font-semibold">{account.nome}</span>
							<span className="text-muted-foreground text-[11px]">PASSIVO</span>
						</div>
						<span className="text-[13px] font-semibold tabular-nums" style={{ color: NEGATIVE_COLOR }}>
							{formatToMoney(-account.saldoAtual)}
						</span>
					</div>
				))}
				<div className="border-border flex items-center justify-between border-t pt-2.5">
					<span className="text-muted-foreground text-xs font-bold tracking-[0.06em]">POSIÇÃO LÍQUIDA</span>
					<span className="text-[15px] font-extrabold tabular-nums" style={{ color: overview.posicaoLiquida < 0 ? NEGATIVE_COLOR : undefined }}>
						{formatToMoney(overview.posicaoLiquida)}
					</span>
				</div>
			</div>
		</ReportCard>
	);
}

function ProjectionSummaryCard({ data }: { data: TCashFlowData }) {
	const projection = data.projecao;
	const rows = [
		{ label: "SALDO INICIAL", value: projection.saldoInicial, color: FINANCE_COLORS.subtotal },
		{ label: "ENTRADAS PREVISTAS", value: projection.totalEntradasPrevistas, color: FINANCE_COLORS.inflow },
		{ label: "SAÍDAS PREVISTAS", value: -projection.totalSaidasPrevistas, color: FINANCE_COLORS.outflow },
		{ label: "SALDO FINAL PROJETADO", value: projection.saldoFinal, color: FINANCE_COLORS.subtotal },
	];
	const max = Math.max(...rows.map((row) => Math.abs(row.value))) || 1;
	return (
		<ReportCard className="gap-3.5 px-4">
			<div className="flex items-center gap-2">
				<CardIconBadge>
					<CalendarClock />
				</CardIconBadge>
				<h3 className="text-xs font-medium uppercase leading-none tracking-tight">Resumo da projeção</h3>
			</div>
			{rows.map((row) => (
				<div key={row.label} className="flex flex-col gap-1.5">
					<div className="flex items-baseline justify-between gap-2">
						<MetricLabel>{row.label}</MetricLabel>
						<span className="text-[13px] font-bold tabular-nums" style={{ color: row.value < 0 ? NEGATIVE_COLOR : undefined }}>
							{formatToMoney(row.value)}
						</span>
					</div>
					<div className="bg-muted h-1.5 rounded-full">
						<div className="h-full rounded-full" style={{ width: `${(Math.abs(row.value) / max) * 100}%`, background: row.color }} />
					</div>
				</div>
			))}
		</ReportCard>
	);
}

function LargestOutflowsCard({ data, horizonDays }: { data: TCashFlowData; horizonDays: number }) {
	const horizonEnd = dayjs().add(horizonDays, "day").endOf("day");
	const outflows = data.projecao.maioresSaidas.filter((outflow) => !dayjs(outflow.dataPrevisao).isAfter(horizonEnd));
	return (
		<ReportCard className="gap-1 px-4">
			<div className="flex items-center gap-2 pb-2">
				<CalendarX2 className="size-4" />
				<h3 className="text-xs font-medium uppercase leading-none tracking-tight">Maiores saídas no horizonte</h3>
			</div>
			{outflows.length === 0 ? (
				<p className="text-muted-foreground border-border border-t py-2.5 text-xs">Nenhuma saída pendente no horizonte.</p>
			) : (
				outflows.map((outflow, index) => (
					<div key={`${outflow.titulo}-${index}`} className="border-border flex items-center gap-2.5 border-t py-1.5 text-xs">
						<span className="text-muted-foreground w-10 shrink-0 font-bold tabular-nums">{dayjs(outflow.dataPrevisao).format("DD/MM")}</span>
						<span className="min-w-0 flex-1 truncate" title={outflow.contaFinanceira ? `${outflow.titulo} · ${outflow.contaFinanceira}` : outflow.titulo}>
							{outflow.titulo}
						</span>
						<span className="font-semibold tabular-nums" style={{ color: NEGATIVE_COLOR }}>
							{formatToMoney(-outflow.valor)}
						</span>
					</div>
				))
			)}
		</ReportCard>
	);
}
