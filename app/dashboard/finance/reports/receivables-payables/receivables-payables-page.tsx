"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Calendar, CalendarDays, CalendarX2, CreditCard, MoveDown, MoveUp, Percent, Scale, ShieldCheck, Timer, Wallet } from "lucide-react";
import type { TGetFinancesReceivablesPayablesOutput } from "@/app/api/finances/analytics/receivables-payables/route";
import {
	MetricLabel,
	ReportCard,
	ReportCardHeader,
	ReportSection,
	ReportSectionState,
} from "@/app/dashboard/inventory/reports/_components/report-section";
import {
	FINANCE_COLORS,
	KpiSparkline,
	LegendSwatch,
	formatPercent,
	formatSignedCompact,
} from "@/app/dashboard/finance/_components/finance-chart-kit";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useFinancesReceivablesPayables } from "@/lib/queries/finance-analytics";
import { cn } from "@/lib/utils";
import { SalePaymentMethodsOptions } from "@/utils/select-options";

type TReceivablesPayables = TGetFinancesReceivablesPayablesOutput["data"];
type TCalendarItem = TReceivablesPayables["calendario"]["itens"][number];

const WEEKDAY_HEADERS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// 7 colunas de dia; a partir de `sm` a coluna do total da semana entra à direita.
const CALENDAR_COLUMNS = "grid grid-cols-7 gap-1 sm:grid-cols-[repeat(7,minmax(0,1fr))_72px]";
const METHODS_COLUMNS = "grid grid-cols-[minmax(180px,1.3fr)_minmax(0,2fr)_52px_96px_84px] gap-3";
const AGING_COLUMNS = "grid grid-cols-[minmax(140px,1fr)_minmax(0,2fr)_minmax(0,2fr)] gap-6";

export default function ReceivablesPayablesPage() {
	const { data, isLoading, error, params, updateParams } = useFinancesReceivablesPayables({ initialParams: {} });

	return (
		<div className="flex w-full flex-col gap-8">
			<ReportSection id="posicao" icon={Scale} title="Posição" description={`Valores em aberto em ${dayjs().format("DD/MM/YYYY")}, incluindo vencidos.`}>
				<ReportSectionState isLoading={isLoading} error={error} skeletonClassName="h-40">
					{data ? <PositionKpis data={data} /> : null}
				</ReportSectionState>
			</ReportSection>

			<ReportSection
				id="aging"
				icon={CalendarX2}
				title="Aging de vencimentos"
				description="Em aberto por faixa de dias em relação a hoje. Faixas vencidas destacadas."
			>
				<ReportSectionState
					isLoading={isLoading}
					error={error}
					isEmpty={!!data && data.totalAReceber === 0 && data.totalAPagar === 0}
					emptyMessage="Nenhuma transação em aberto."
				>
					{data ? <AgingTable buckets={data.vencimentos} /> : null}
				</ReportSectionState>
			</ReportSection>

			<ReportSection
				id="calendario"
				icon={CalendarDays}
				title="Calendário de vencimentos"
				description="Saldo previsto por dia (a receber − a pagar). Clique num dia para ver os lançamentos."
			>
				<ReportSectionState isLoading={isLoading} error={error} skeletonClassName="h-96">
					{data ? <DueCalendar calendar={data.calendario} /> : null}
				</ReportSectionState>
			</ReportSection>

			<ReportSection
				id="meios-de-pagamento"
				icon={CreditCard}
				title="Meios de pagamento"
				description="Entradas do período por forma de pagamento e o custo das taxas retidas em cada uma."
				actions={
					<DateIntervalInput
						label="PERÍODO"
						labelClassName="hidden"
						className="hover:bg-accent hover:text-accent-foreground border-none shadow-none"
						value={{ after: params.periodAfter, before: params.periodBefore }}
						handleChange={(value) => updateParams({ periodAfter: value.after ?? params.periodAfter, periodBefore: value.before ?? params.periodBefore })}
					/>
				}
			>
				<ReportSectionState isLoading={isLoading} error={error} skeletonClassName="h-72">
					{data ? (
						<div className="flex flex-wrap items-start gap-4">
							<div className="min-w-0 flex-[2_1_560px]">
								{data.meiosPagamento.length > 0 ? (
									<PaymentMethods methods={data.meiosPagamento} />
								) : (
									<div className="border-border text-muted-foreground rounded-xl border border-dashed px-3 py-6 text-center text-xs">
										Nenhuma entrada efetivada no período.
									</div>
								)}
							</div>
							<div className="flex min-w-0 flex-[1_1_280px] flex-col gap-3">
								<FrictionCard data={data} />
								<DelayCard
									label={`Atraso médio de recebimento (${data.janelaAtrasoDias}D)`}
									days={data.atrasoMedioRecebimentoDias}
									count={data.recebimentosNaJanela}
									earlyLabel="recebendo adiantado"
								/>
								<DelayCard
									label={`Atraso médio de pagamento (${data.janelaAtrasoDias}D)`}
									days={data.atrasoMedioPagamentoDias}
									count={data.pagamentosNaJanela}
									earlyLabel="pagando adiantado"
								/>
							</div>
						</div>
					) : null}
				</ReportSectionState>
			</ReportSection>
		</div>
	);
}

// ============================================================================
// KPIs
// ============================================================================

function PositionKpis({ data }: { data: TReceivablesPayables }) {
	const { ha30Dias, mensal } = data.historico;
	const cobertura = data.liquidez.coberturaMeses;
	return (
		<div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
			<StatUnitCard
				title="Total a receber"
				subtitle={`Vencido ${formatToMoney(data.vencidoAReceber)}`}
				icon={<MoveDown className="size-4" />}
				current={{ value: data.totalAReceber, format: formatToMoney }}
				previous={{ value: ha30Dias.aReceber, format: formatToMoney }}
				previousLabel="HÁ 30 DIAS"
				footer={<KpiSparkline values={mensal.map((point) => point.aReceber)} label="6M" />}
			/>
			<StatUnitCard
				title="Total a pagar"
				subtitle={`Vencido ${formatToMoney(data.vencidoAPagar)}`}
				icon={<MoveUp className="size-4" />}
				current={{ value: data.totalAPagar, format: formatToMoney }}
				previous={{ value: ha30Dias.aPagar, format: formatToMoney }}
				previousLabel="HÁ 30 DIAS"
				lowerIsBetter
				footer={<KpiSparkline values={mensal.map((point) => point.aPagar)} label="6M" />}
			/>
			<StatUnitCard
				title="Capital de giro"
				subtitle="Caixa + a receber − a pagar"
				icon={<Scale className="size-4" />}
				current={{ value: data.liquidez.capitalGiro, format: formatToMoney }}
				previous={{ value: ha30Dias.capitalGiro, format: formatToMoney }}
				previousLabel="HÁ 30 DIAS"
				footer={<KpiSparkline values={mensal.map((point) => point.capitalGiro)} label="6M" />}
			/>
			<StatUnitCard
				title="Cobertura de fixos"
				subtitle="Caixa ÷ recorrentes de saída"
				icon={<ShieldCheck className="size-4" />}
				current={{
					value: cobertura ?? 0,
					format: (value) => (cobertura === null ? "—" : value > 36 ? "36+ meses" : `${formatDecimalPlaces(value, 1, 1)} meses`),
				}}
			/>
		</div>
	);
}

// ============================================================================
// AGING
// ============================================================================

function ShareBar({ value, max, color, className }: { value: number; max: number; color: string; className?: string }) {
	return (
		<div className={cn("bg-muted flex-1 overflow-hidden rounded-full", className)}>
			<div className="h-full rounded-full" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color }} />
		</div>
	);
}

function AgingTable({ buckets }: { buckets: TReceivablesPayables["vencimentos"] }) {
	const max = Math.max(...buckets.map((bucket) => Math.max(bucket.receber, bucket.pagar)), 0);
	const rows = buckets.map((bucket) => ({
		...bucket,
		overdue: bucket.chave.startsWith("vencido"),
		label: bucket.rotulo.replace(/(\d)-(\d)/, "$1–$2"),
	}));
	const overdueRow = "bg-red-50/60 dark:bg-red-500/10";
	const overdueLabel = "text-red-700 dark:text-red-400";
	return (
		<>
			{/* Tabela a partir de `sm` */}
			<div className="bg-card border-border hidden overflow-auto rounded-xl border shadow-2xs sm:block">
				<div className="min-w-[640px]">
					<div
						className={cn(AGING_COLUMNS, "border-border text-muted-foreground border-b px-3.5 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide")}
					>
						<span>Faixa</span>
						<span>A receber</span>
						<span>A pagar</span>
					</div>
					{rows.map((row) => (
						<div
							key={row.chave}
							className={cn(AGING_COLUMNS, "border-border items-center border-b px-3.5 py-2.5 last:border-b-0", row.overdue && overdueRow)}
						>
							<span className={cn("text-xs font-bold tracking-tight", row.overdue && overdueLabel)}>{row.label}</span>
							<div className="flex items-center gap-2">
								<ShareBar value={row.receber} max={max} color={FINANCE_COLORS.inflow} className="h-2" />
								<span className="w-[108px] text-right text-xs font-bold tabular-nums">{formatToMoney(row.receber)}</span>
							</div>
							<div className="flex items-center gap-2">
								<ShareBar value={row.pagar} max={max} color={FINANCE_COLORS.outflow} className="h-2" />
								<span className="w-[108px] text-right text-xs font-bold tabular-nums">{formatToMoney(row.pagar)}</span>
							</div>
						</div>
					))}
				</div>
			</div>
			{/* Lista empilhada no celular */}
			<div className="bg-card border-border flex flex-col gap-0.5 rounded-xl border p-1.5 shadow-2xs sm:hidden">
				{rows.map((row) => (
					<div key={row.chave} className={cn("flex flex-col gap-1.5 rounded-[10px] px-2 py-2.5", row.overdue && overdueRow)}>
						<span className={cn("text-xs font-bold tracking-tight", row.overdue && overdueLabel)}>{row.label}</span>
						<div className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5">
							<MetricLabel>Receber</MetricLabel>
							<ShareBar value={row.receber} max={max} color={FINANCE_COLORS.inflow} className="h-1.5" />
							<span className="whitespace-nowrap text-right text-xs font-bold tabular-nums">{formatToMoney(row.receber)}</span>
							<MetricLabel>Pagar</MetricLabel>
							<ShareBar value={row.pagar} max={max} color={FINANCE_COLORS.outflow} className="h-1.5" />
							<span className="whitespace-nowrap text-right text-xs font-bold tabular-nums">{formatToMoney(row.pagar)}</span>
						</div>
					</div>
				))}
			</div>
		</>
	);
}

// ============================================================================
// CALENDÁRIO
// ============================================================================

function DueCalendar({ calendar }: { calendar: TReceivablesPayables["calendario"] }) {
	const todayKey = dayjs().format("YYYY-MM-DD");

	const days = useMemo(() => {
		const itemsByDay = new Map<string, TCalendarItem[]>();
		for (const item of calendar.itens) {
			const key = dayjs(item.dataPrevisao).format("YYYY-MM-DD");
			itemsByDay.set(key, [...(itemsByDay.get(key) ?? []), item]);
		}
		const start = dayjs(calendar.inicio);
		return Array.from({ length: calendar.dias }, (_, index) => {
			const date = start.add(index, "day");
			const key = date.format("YYYY-MM-DD");
			const items = itemsByDay.get(key) ?? [];
			const net = items.reduce((total, item) => total + (item.tipo === "ENTRADA" ? item.valor : -item.valor), 0);
			return { date, key, items, net };
		});
	}, [calendar]);
	const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => days.slice(index * 7, index * 7 + 7));

	// Intensidade relativa ao maior saldo diário de hoje em diante (vencidos não distorcem a escala).
	const maxNet = Math.max(...days.filter((day) => day.key >= todayKey).map((day) => Math.abs(day.net)), 0);
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	const defaultDay =
		days.find((day) => day.key === todayKey && day.items.length > 0) ?? days.find((day) => day.key > todayKey && day.items.length > 0);
	const selected = days.find((day) => day.key === (selectedKey ?? defaultDay?.key ?? todayKey)) ?? days[0];
	const firstDay = days[0];
	const lastDay = days[days.length - 1];

	return (
		<div className="flex flex-wrap items-start gap-4">
			<ReportCard className="min-w-0 flex-[2_1_560px] gap-1.5">
				<ReportCardHeader icon={CalendarDays} title={`${firstDay?.date.format("DD/MM") ?? ""} – ${lastDay?.date.format("DD/MM") ?? ""}`}>
					<div className="text-foreground/70 flex items-center gap-3.5 text-[11px] font-semibold">
						<span className="flex items-center gap-1.5">
							<LegendSwatch color={FINANCE_COLORS.inflow} />
							Entra mais
						</span>
						<span className="flex items-center gap-1.5">
							<LegendSwatch color={FINANCE_COLORS.outflow} />
							Sai mais
						</span>
						<span className="flex items-center gap-1.5">
							<LegendSwatch className="border border-dashed border-red-700" />
							Vencido
						</span>
					</div>
				</ReportCardHeader>
				<div className="mt-1.5 flex flex-col gap-1">
					<div className={cn(CALENDAR_COLUMNS, "text-muted-foreground text-[0.6rem] font-semibold uppercase tracking-wide")}>
						{WEEKDAY_HEADERS.map((weekday) => (
							<span key={weekday} className="pl-1">
								{weekday}
							</span>
						))}
						<span className="hidden text-right sm:block">Semana</span>
					</div>
					{weeks.map((week, weekIndex) => {
						const weekNet = week.reduce((total, day) => total + day.net, 0);
						return (
							<div key={week[0]?.key ?? weekIndex} className={CALENDAR_COLUMNS}>
								{week.map((day, dayIndex) => {
									const isPast = day.key < todayKey;
									const isToday = day.key === todayKey;
									const hasItems = day.items.length > 0;
									const intensity = maxNet > 0 ? Math.min(1, Math.abs(day.net) / maxNet) : 0;
									const alpha = hasItems ? 0.1 + 0.62 * Math.pow(intensity, 0.7) : 0;
									const strong = alpha > 0.46;
									const showMonth = day.date.date() === 1 || (weekIndex === 0 && dayIndex === 0);
									const tag = isPast && hasItems ? "VENCIDO" : isToday ? "HOJE" : "";
									return (
										<button
											key={day.key}
											type="button"
											onClick={() => setSelectedKey(day.key)}
											aria-pressed={day.key === selected?.key}
											className={cn(
												"relative flex h-[52px] min-w-0 cursor-pointer flex-col justify-between overflow-hidden rounded-[10px] px-[5px] py-1.5 text-left hover:brightness-[0.97] sm:h-[60px]",
												!hasItems && (isPast ? "bg-muted/70" : "bg-card"),
												strong ? "text-white" : "text-foreground",
												day.key === selected?.key
													? "border-foreground border-2"
													: isToday
														? "border-primary border-2"
														: isPast && hasItems
															? "border border-dashed border-red-700"
															: "border-border border",
											)}
											style={
												hasItems ? { background: `rgba(${day.net >= 0 ? FINANCE_COLORS.inflowRgb : FINANCE_COLORS.outflowRgb},${alpha.toFixed(2)})` } : undefined
											}
										>
											<span className="flex items-baseline gap-1">
												<span className="text-xs font-bold">{day.date.date()}</span>
												{showMonth ? (
													<span className={cn("text-[10px]", strong ? "text-white/85" : "text-muted-foreground")}>{MONTH_NAMES[day.date.month()]}</span>
												) : null}
											</span>
											{tag ? (
												<span
													className={cn(
														"absolute top-[7px] right-1.5 hidden text-[8.5px] font-bold tracking-[0.02em] sm:block",
														tag === "HOJE" ? "text-primary" : strong ? "text-white" : "text-red-700",
													)}
												>
													{tag}
												</span>
											) : null}
											<span className="truncate text-[11px] font-bold tracking-[-0.02em]">{hasItems ? formatSignedCompact(day.net) : ""}</span>
										</button>
									);
								})}
								<div
									className={cn(
										"hidden items-center justify-end text-xs font-bold tabular-nums sm:flex",
										weekNet > 0 ? "text-green-700" : weekNet < 0 ? "text-red-700" : "text-muted-foreground",
									)}
								>
									{weekNet === 0 ? "—" : formatSignedCompact(weekNet)}
								</div>
							</div>
						);
					})}
				</div>
			</ReportCard>
			{selected ? <SelectedDayPanel date={selected.date} items={selected.items} net={selected.net} isPast={selected.key < todayKey} /> : null}
		</div>
	);
}

function SelectedDayPanel({ date, items, net, isPast }: { date: dayjs.Dayjs; items: TCalendarItem[]; net: number; isPast: boolean }) {
	const sorted = [...items].sort((a, b) => (a.tipo === b.tipo ? b.valor - a.valor : a.tipo === "ENTRADA" ? -1 : 1));
	return (
		<ReportCard className="min-w-0 flex-[1_1_280px] gap-2.5">
			<ReportCardHeader icon={Calendar} title={`${WEEKDAY_NAMES[date.day()]}, ${date.format("DD/MM/YYYY")}`.toUpperCase()}>
				{items.length > 0 ? (
					<span className={cn("text-sm font-semibold tabular-nums", net < 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400")}>
						{formatToMoney(net)}
					</span>
				) : null}
			</ReportCardHeader>
			{sorted.length === 0 ? (
				<div className="border-border text-muted-foreground rounded-xl border border-dashed px-3 py-6 text-center text-xs">
					Nenhum vencimento neste dia.
				</div>
			) : (
				<div className="flex flex-col">
					{sorted.map((item) => {
						const isInflow = item.tipo === "ENTRADA";
						const color = isInflow ? FINANCE_COLORS.inflow : FINANCE_COLORS.outflow;
						const Icon = isInflow ? MoveDown : MoveUp;
						return (
							<div key={item.id} className="border-border flex items-center gap-2.5 border-t py-2.5">
								<div
									className="flex size-7 shrink-0 items-center justify-center rounded-full"
									style={{ background: `rgba(${isInflow ? FINANCE_COLORS.inflowRgb : FINANCE_COLORS.outflowRgb},0.12)`, color }}
								>
									<Icon className="size-3.5" />
								</div>
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="truncate text-[13px] font-semibold">{item.titulo}</span>
									<span className="text-muted-foreground text-[11px]">
										{item.contaFinanceira ?? "Sem conta"} · {isPast ? "vencido" : "previsto"}
									</span>
								</div>
								<span className="whitespace-nowrap text-[13px] font-bold tabular-nums" style={{ color }}>
									{isInflow ? "+" : "−"}
									{formatToMoney(item.valor)}
								</span>
							</div>
						);
					})}
				</div>
			)}
		</ReportCard>
	);
}

// ============================================================================
// MEIOS DE PAGAMENTO, FRICÇÃO E ATRASOS
// ============================================================================

function getRatePillClassName(rate: number) {
	if (rate >= 3) return "bg-[#fff7e5] text-[#7a5117] dark:bg-amber-500/15 dark:text-amber-300";
	if (rate >= 1) return "bg-muted text-foreground";
	return "bg-green-500/10 text-green-700 dark:text-green-400";
}

function PaymentMethods({ methods }: { methods: TReceivablesPayables["meiosPagamento"] }) {
	const totalVolume = methods.reduce((total, method) => total + method.volume, 0);
	const totalFees = methods.reduce((total, method) => total + method.taxas, 0);
	const maxVolume = Math.max(...methods.map((method) => method.volume), 0);
	const totalRate = totalVolume > 0 ? (totalFees / totalVolume) * 100 : 0;
	const rows = methods.map((method) => {
		const option = SalePaymentMethodsOptions.find((candidate) => candidate.value === method.metodo);
		return {
			...method,
			label: option?.label ?? method.metodo,
			renderIcon: option?.renderIcon ?? ((className: string) => <Wallet className={className} />),
			rate: method.volume > 0 ? (method.taxas / method.volume) * 100 : 0,
			share: totalVolume > 0 ? (method.volume / totalVolume) * 100 : 0,
		};
	});

	return (
		<>
			<div className="bg-card border-border hidden overflow-auto rounded-xl border shadow-2xs sm:block">
				<div className="min-w-[640px]">
					<div
						className={cn(
							METHODS_COLUMNS,
							"border-border text-muted-foreground border-b px-3.5 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide",
						)}
					>
						<span>Meio</span>
						<span>Volume</span>
						<span className="text-right">Part.</span>
						<span className="text-right">Taxas</span>
						<span className="text-right">Taxa efetiva</span>
					</div>
					{rows.map((row) => (
						<div key={row.metodo} className={cn(METHODS_COLUMNS, "border-border hover:bg-muted items-center border-b px-3.5 py-2.5")}>
							<div className="flex min-w-0 items-center gap-2.5">
								<div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-[10px]">{row.renderIcon("size-4")}</div>
								<span className="truncate text-sm font-bold tracking-tight">{row.label}</span>
							</div>
							<div className="flex items-center gap-2">
								<ShareBar value={row.volume} max={maxVolume} color={FINANCE_COLORS.subtotal} className="h-2" />
								<span className="w-24 text-right text-xs font-bold tabular-nums">{formatToMoney(row.volume)}</span>
							</div>
							<span className="text-muted-foreground text-right text-xs font-semibold tabular-nums">{formatPercent(row.share)}</span>
							<span className="text-right text-[13px] font-semibold tabular-nums">{formatToMoney(row.taxas)}</span>
							<div className="flex justify-end">
								<span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums", getRatePillClassName(row.rate))}>
									{formatPercent(row.rate, 2)}
								</span>
							</div>
						</div>
					))}
					<div className={cn(METHODS_COLUMNS, "items-center px-3.5 py-3")}>
						<MetricLabel>Total no período</MetricLabel>
						<span className="text-right text-[13px] font-bold tabular-nums">{formatToMoney(totalVolume)}</span>
						<span />
						<span className="text-right text-[13px] font-bold tabular-nums">{formatToMoney(totalFees)}</span>
						<div className="flex justify-end">
							<span className="bg-muted rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums">{formatPercent(totalRate, 2)}</span>
						</div>
					</div>
				</div>
			</div>
			<div className="bg-card border-border flex flex-col rounded-xl border px-3 py-1 shadow-2xs sm:hidden">
				{rows.map((row) => (
					<div key={row.metodo} className="border-border flex flex-col gap-2 border-b py-3">
						<div className="flex items-center gap-2.5">
							<div className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-lg">{row.renderIcon("size-3.5")}</div>
							<span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight">{row.label}</span>
							<span className="whitespace-nowrap text-[13px] font-bold tabular-nums">{formatToMoney(row.volume)}</span>
						</div>
						<ShareBar value={row.volume} max={maxVolume} color={FINANCE_COLORS.subtotal} className="h-1.5 flex-none" />
						<div className="text-muted-foreground flex items-center justify-between gap-2 text-[11px]">
							<span>
								{formatPercent(row.share)} do volume · taxas {formatToMoney(row.taxas)}
							</span>
							<span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums", getRatePillClassName(row.rate))}>
								{formatPercent(row.rate, 2)}
							</span>
						</div>
					</div>
				))}
				<div className="flex items-center justify-between gap-2 py-3">
					<MetricLabel>Total no período</MetricLabel>
					<span className="text-right text-xs font-bold tabular-nums">
						{formatToMoney(totalVolume)} · taxas {formatToMoney(totalFees)} · {formatPercent(totalRate, 2)}
					</span>
				</div>
			</div>
		</>
	);
}

function FrictionCard({ data }: { data: TReceivablesPayables }) {
	const { jurosMultasPagos, taxasTotal, descontosObtidos } = data.friccao;
	const net = jurosMultasPagos + taxasTotal - descontosObtidos;
	const rows = [
		{ label: "Juros e multas pagos", value: formatToMoney(jurosMultasPagos), className: "text-red-700 dark:text-red-400" },
		{ label: "Taxas financeiras (entradas e saídas)", value: formatToMoney(taxasTotal), className: "text-red-700 dark:text-red-400" },
		{ label: "Descontos obtidos", value: `−${formatToMoney(descontosObtidos)}`, className: "text-green-700 dark:text-green-400" },
	];
	return (
		<ReportCard className="gap-2.5">
			<ReportCardHeader icon={Percent} title="CUSTO DE FRICÇÃO">
				<span className="text-sm font-semibold tabular-nums">{formatToMoney(net)}</span>
			</ReportCardHeader>
			<div className="flex flex-col">
				{rows.map((row) => (
					<div key={row.label} className="border-border flex items-center justify-between gap-3 border-t py-2.5">
						<span className="text-xs font-medium tracking-tight">{row.label}</span>
						<span className={cn("text-[13px] font-semibold tabular-nums", row.className)}>{row.value}</span>
					</div>
				))}
			</div>
			<span className="text-muted-foreground text-xs">
				{data.entradasPeriodo > 0
					? `Custo líquido equivale a ${formatPercent((net / data.entradasPeriodo) * 100)} das entradas do período.`
					: "Sem entradas efetivadas no período para comparar."}
			</span>
		</ReportCard>
	);
}

function DelayCard({ label, days, count, earlyLabel }: { label: string; days: number | null; count: number; earlyLabel: string }) {
	const value = days === null ? "Sem dados" : days === 0 ? "Em dia" : `${days > 0 ? "+" : "−"}${formatDecimalPlaces(Math.abs(days), 1, 1)} dias`;
	return (
		<div className="bg-card border-border flex flex-col gap-2 rounded-xl border px-3.5 py-3 shadow-2xs">
			<div className="flex items-center justify-between gap-3">
				<div className="text-muted-foreground flex min-w-0 items-center gap-2">
					<Timer className="size-4 shrink-0" />
					<span className="text-foreground text-xs font-medium uppercase leading-tight tracking-tight">{label}</span>
				</div>
				<span
					className={cn(
						"whitespace-nowrap text-xl font-bold leading-none tabular-nums",
						days !== null && days > 0 ? "text-red-700 dark:text-red-400" : "text-foreground",
					)}
				>
					{value}
				</span>
			</div>
			<span className="text-muted-foreground text-[0.65rem]">
				{count} {count === 1 ? "transação" : "transações"}
				{days !== null && days < 0 ? ` · ${earlyLabel}` : ""}
			</span>
		</div>
	);
}
