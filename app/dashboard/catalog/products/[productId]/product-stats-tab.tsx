"use client";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import { buildSalesIntegrationFilterOptions } from "@/components/Sales/sales-integration-filter-options";
import { Button } from "@/components/ui/button";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { InteractiveFilter, type InteractiveFilterOption } from "@/components/ui/interactive-filter";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getErrorMessage } from "@/lib/errors";
import { getExcelFromJSON } from "@/lib/excel-utils";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { formatInteractiveDateRangeSummary, formatInteractiveOptionSummary } from "@/components/ui/interactive-filter-formatting";
import { useProductGraph, useProductStats } from "@/lib/queries/products";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import { cn } from "@/lib/utils";
import { isValidNumber } from "@/lib/validation";
import type { TGetProductGraphOutput } from "@/app/api/products/graph/route";
import type { TGetProductStatsOutput } from "@/app/api/products/stats/route";
import dayjs from "dayjs";
import {
	BadgeDollarSign,
	Calendar,
	CalendarRange,
	ChartBar,
	CirclePlus,
	Download,
	ListFilter,
	Percent,
	ShoppingBag,
	Tag,
	TrendingUp,
	UserRound,
	Users,
} from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

type ProductStatsTabProps = {
	productId: string;
	enabled?: boolean;
};

export default function ProductStatsTab({ productId, enabled = true }: ProductStatsTabProps) {
	const {
		data: stats,
		isLoading,
		isError,
		isSuccess,
		error,
		filters,
		updateFilters,
	} = useProductStats({
		productId,
		enabled,
		initialFilters: {
			periodAfter: dayjs().startOf("month").toISOString(),
			periodBefore: dayjs().endOf("month").toISOString(),
			sellerId: null,
			partnerId: null,
			integrationsIds: null,
		},
	});

	return (
		<div className="w-full h-full flex flex-col gap-3">
			<ProductInlineFilters filters={filters} updateFilters={updateFilters} />
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && stats ? (
				<>
					<div className="flex items-center gap-4 flex-wrap">
						<div className="flex items-center gap-2">
							<CalendarRange className="w-4 min-w-4 h-4 min-h-4" />
							<p className="text-sm font-medium tracking-tight text-foreground/60">DESDE O INÍCIO:</p>
						</div>
						<p className="text-sm font-medium tracking-tight">{formatToMoney(stats.geral.faturamentoBrutoTotal)} vendidos</p>
						<p className="text-sm font-medium tracking-tight">{stats.geral.vendasQtdeTotal} vendas únicas</p>
						<p className="text-sm font-medium tracking-tight">{formatDecimalPlaces(stats.geral.quantidadeTotal)} itens vendidos</p>
						<p className="text-sm font-medium tracking-tight">
							<span className="text-foreground/60">PRIMEIRA VENDA:</span> {stats.dataPrimeiraVenda ? formatDateAsLocale(stats.dataPrimeiraVenda) : "N/A"}
						</p>
						<p className="text-sm font-medium tracking-tight">
							<span className="text-foreground/60">ÚLTIMA VENDA:</span> {stats.dataUltimaVenda ? formatDateAsLocale(stats.dataUltimaVenda) : "N/A"}
						</p>
					</div>

					{/* Main Stats Cards */}
					<div className="w-full flex flex-col gap-2">
						<div className="flex w-full flex-col items-center justify-around gap-2 lg:flex-row">
							<StatUnitCard
								title="Quantidade Vendida"
								icon={<ShoppingBag className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats.quantidadeTotal || 0, format: (n) => formatDecimalPlaces(n) }}
								className="w-full lg:w-1/4"
							/>
							<StatUnitCard
								title="Número de Vendas"
								icon={<CirclePlus className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats.vendasQtdeTotal || 0, format: (n) => formatDecimalPlaces(n) }}
								className="w-full lg:w-1/4"
							/>
							<StatUnitCard
								title="Clientes Únicos"
								icon={<Users className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats.clientesUnicos || 0, format: (n) => formatDecimalPlaces(n) }}
								className="w-full lg:w-1/4"
							/>
							<StatUnitCard
								title="Ticket Médio"
								icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats.ticketMedio || 0, format: (n) => formatToMoney(n) }}
								className="w-full lg:w-1/4"
							/>
						</div>
						<div className="flex w-full flex-col items-center justify-around gap-2 lg:flex-row">
							<StatUnitCard
								title="Faturamento Bruto"
								icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats.faturamentoBrutoTotal || 0, format: (n) => formatToMoney(n) }}
								className="w-full lg:w-1/4"
							/>
							<StatUnitCard
								title="Faturamento Líquido"
								icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats.faturamentoLiquidoTotal || 0, format: (n) => formatToMoney(n) }}
								className="w-full lg:w-1/4"
							/>
							<StatUnitCard
								title="Margem Bruta"
								icon={<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />}
								current={{
									value: stats.margemBrutaTotal || 0,
									format: (n) => `${formatToMoney(n)} (${formatDecimalPlaces(stats.margemBrutaPercentual)}%)`,
								}}
								className="w-full lg:w-1/4"
							/>
							<StatUnitCard
								title="Faturamento/Dia"
								icon={<ChartBar className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats.faturamentoPorDia || 0, format: (n) => formatToMoney(n) }}
								className="w-full lg:w-1/4"
							/>
						</div>
						<DiscountAnalysis
							descontoTotal={stats.descontoTotal}
							percentualDescontoMedio={stats.percentualDescontoMedio}
							faturamentoBruto={stats.faturamentoBrutoTotal}
						/>
						<SalesCompositionAnalysis composicao={stats.composicao} />
					</div>

					{/* Product Graph */}
					<ProductGraphBlock
						productId={productId}
						periodAfter={filters.periodAfter}
						periodBefore={filters.periodBefore}
						sellerId={filters.sellerId ?? null}
						partnerId={filters.partnerId ?? null}
						integrationsIds={filters.integrationsIds ?? null}
					/>

					{/* Seasonality Analysis */}
					<div className="flex w-full flex-col lg:flex-row gap-2 items-stretch">
						<div className="w-full lg:w-1/3">
							<GroupedByMonthDay data={stats.resultadosAgrupados.dia} />
						</div>
						<div className="w-full lg:w-1/3">
							<GroupedByMonth data={stats.resultadosAgrupados.mes} />
						</div>
						<div className="w-full lg:w-1/3">
							<GroupedByWeekDay data={stats.resultadosAgrupados.diaSemana} />
						</div>
					</div>

					{/* Relationships Analysis */}
					<div className="flex w-full flex-col lg:flex-row gap-2 items-stretch">
						<div className="w-full lg:w-1/3">
							<GroupedByClient data={stats.resultadosAgrupados.cliente} />
						</div>
						<div className="w-full lg:w-1/3">
							<GroupedBySeller data={stats.resultadosAgrupados.vendedor} />
						</div>
						<div className="w-full lg:w-1/3">
							<GroupedByPartner data={stats.resultadosAgrupados.parceiro} />
						</div>
					</div>

					{/* Advanced Analysis */}
					<div className="flex w-full flex-col lg:flex-row gap-2 items-stretch">
						<div className="w-full lg:w-1/2">
							<GroupedByRelatedProducts data={stats.resultadosAgrupados.produtosRelacionados} />
						</div>
						<div className="w-full lg:w-1/2">
							<MarginAnalysis data={stats.analiseMargem} />
						</div>
					</div>
				</>
			) : null}
		</div>
	);
}

type ProductInlineFiltersProps = {
	filters: {
		periodAfter?: string | null | undefined;
		periodBefore?: string | null | undefined;
		sellerId?: string | null | undefined;
		partnerId?: string | null | undefined;
		integrationsIds?: string[] | null | undefined;
	};
	updateFilters: (filters: Partial<ProductInlineFiltersProps["filters"]>) => void;
};

function ProductInlineFilters({ filters, updateFilters }: ProductInlineFiltersProps) {
	const { data: filterOptions } = useSaleQueryFilterOptions();
	const integrationOptions = buildSalesIntegrationFilterOptions(filterOptions?.integrations);
	const sellerOptions = (filterOptions?.sellers ?? []) as InteractiveFilterOption<string>[];
	const partnerOptions = (filterOptions?.partners ?? []) as InteractiveFilterOption<string>[];
	const hasIntegrations = (filters.integrationsIds ?? []).length > 0;
	const hasSeller = Boolean(filters.sellerId);
	const hasPartner = Boolean(filters.partnerId);

	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			<InteractiveFilter.Root className="w-fit">
				<InteractiveFilter.Trigger>
					<InteractiveFilter.Icon>
						<Calendar className="h-4 w-4" />
						<InteractiveFilter.Label>PERÍODO</InteractiveFilter.Label>
					</InteractiveFilter.Icon>
					<InteractiveFilter.Value>{formatInteractiveDateRangeSummary(filters.periodAfter, filters.periodBefore)}</InteractiveFilter.Value>
					<InteractiveFilter.Clear onClear={() => updateFilters({ periodAfter: null, periodBefore: null })} />
				</InteractiveFilter.Trigger>
				<InteractiveFilter.Content className="w-auto p-0">
					<InteractiveFilter.DateRangeContent
						value={{
							from: filters.periodAfter ? new Date(filters.periodAfter) : undefined,
							to: filters.periodBefore ? new Date(filters.periodBefore) : undefined,
						}}
						onChange={(period) => updateFilters({ periodAfter: period.from?.toISOString() ?? null, periodBefore: period.to?.toISOString() ?? null })}
					/>
				</InteractiveFilter.Content>
			</InteractiveFilter.Root>

			{hasIntegrations ? (
				<ProductMultiFilter
					label="INTEGRAÇÕES"
					options={integrationOptions}
					value={filters.integrationsIds ?? []}
					onChange={(integrationsIds) => updateFilters({ integrationsIds })}
					onClear={() => updateFilters({ integrationsIds: null })}
				/>
			) : null}
			{hasSeller ? (
				<ProductSingleFilter
					label="VENDEDOR"
					options={sellerOptions}
					value={filters.sellerId}
					onChange={(sellerId) => updateFilters({ sellerId })}
					onClear={() => updateFilters({ sellerId: null })}
				/>
			) : null}
			{hasPartner ? (
				<ProductSingleFilter
					label="PARCEIRO"
					options={partnerOptions}
					value={filters.partnerId}
					onChange={(partnerId) => updateFilters({ partnerId })}
					onClear={() => updateFilters({ partnerId: null })}
				/>
			) : null}

			<InteractiveFilter.AddFilterRoot className="w-fit">
				<InteractiveFilter.AddFilterTrigger>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>ADICIONAR FILTRO</InteractiveFilter.Label>
				</InteractiveFilter.AddFilterTrigger>
				<InteractiveFilter.AddFilterContent>
					<InteractiveFilter.AddFilterSection heading="Filtros">
						{!hasIntegrations ? (
							<InteractiveFilter.AddFilterItem id="integrations" label="INTEGRAÇÕES" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={integrationOptions}
									value={filters.integrationsIds ?? []}
									onChange={(integrationsIds) => updateFilters({ integrationsIds })}
									onClear={() => updateFilters({ integrationsIds: null })}
									clearLabel="TODAS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasSeller ? (
							<InteractiveFilter.AddFilterItem id="seller" label="VENDEDOR" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.SingleContent
									options={sellerOptions}
									value={filters.sellerId ?? undefined}
									onChange={(sellerId) => updateFilters({ sellerId })}
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasPartner ? (
							<InteractiveFilter.AddFilterItem id="partner" label="PARCEIRO" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.SingleContent
									options={partnerOptions}
									value={filters.partnerId ?? undefined}
									onChange={(partnerId) => updateFilters({ partnerId })}
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
					</InteractiveFilter.AddFilterSection>
				</InteractiveFilter.AddFilterContent>
			</InteractiveFilter.AddFilterRoot>
		</div>
	);
}

function ProductMultiFilter({
	label,
	options,
	value,
	onChange,
	onClear,
}: {
	label: string;
	options: InteractiveFilterOption<string>[];
	value: string[];
	onChange: (value: string[]) => void;
	onClear: () => void;
}) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>{label}</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveOptionSummary(options, value)}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={onClear} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-72 p-0">
				<InteractiveFilter.MultiContent options={options} value={value} onChange={onChange} onClear={onClear} clearLabel="TODAS" />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function ProductSingleFilter({
	label,
	options,
	value,
	onChange,
	onClear,
}: {
	label: string;
	options: InteractiveFilterOption<string>[];
	value?: string | null;
	onChange: (value: string) => void;
	onClear: () => void;
}) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>{label}</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{options.find((option) => option.value === value)?.label ?? "TODOS"}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={onClear} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-72 p-0">
				<InteractiveFilter.SingleContent options={options} value={value ?? undefined} onChange={onChange} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

// Seasonality Components
function GroupedByMonthDay({ data }: { data: TGetProductStatsOutput["data"]["resultadosAgrupados"]["dia"] }) {
	const maxValue = Math.max(...data.map((item) => item.total), 0);
	const minValue = Math.min(...data.map((item) => item.total), 0);
	const range = maxValue - minValue;

	const bestDayIndex = data.length > 0 ? data.reduce((max, item) => (item.total > max.total ? item : max), data[0]).dia : null;
	const worstDayIndex = data.length > 0 ? data.reduce((min, item) => (item.total < min.total ? item : min), data[0]).dia : null;

	function getDayResult(index: number) {
		return data.find((item) => item.dia === index + 1);
	}

	function getColorIntensity(value: number): number {
		if (range === 0) return 0.3;
		const normalized = (value - minValue) / range;
		return 0.1 + normalized * 0.9;
	}

	function DayCard({ index }: { index: number }) {
		const result = getDayResult(index);
		const intensity = result ? getColorIntensity(result.total) : 0;
		const bgColor = result ? `rgba(254, 173, 0, ${intensity})` : "transparent";
		const avgValue = result && result.quantidade > 0 ? result.total / result.quantidade : 0;

		return (
			<Tooltip>
				<TooltipTrigger
					delay={200}
					render={
						<div
							key={index.toString()}
							className="flex flex-col items-center justify-center p-2 rounded-md border border-border w-full gap-1 min-h-[60px] transition-all hover:scale-[1.02] cursor-pointer"
							style={{ backgroundColor: bgColor }}
						>
							<h1 className="text-xs font-bold tracking-tight">{index + 1}</h1>
						</div>
					}
				/>
				{result ? (
					<TooltipContent className="bg-primary text-foreground-foreground p-3 min-w-[180px]">
						<div className="flex flex-col gap-2">
							<h3 className="text-sm font-semibold mb-1">DIA {index + 1}</h3>
							<div className="flex items-center justify-between gap-4">
								<span className="text-xs font-medium tracking-tight">QUANTIDADE</span>
								<span className="text-sm font-bold">{formatDecimalPlaces(result.quantidade)}</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<span className="text-xs font-medium tracking-tight">FATURAMENTO</span>
								<span className="text-sm font-bold">{formatToMoney(result.total)}</span>
							</div>
							<div className="border-t border-border-foreground/80 mt-1 pt-2 flex flex-col gap-1">
								<div className="flex items-center justify-between gap-4">
									<span className="text-xs font-medium tracking-tight">VALOR MÉDIO</span>
									<span className="text-sm font-bold">{formatToMoney(avgValue)}</span>
								</div>
							</div>
						</div>
					</TooltipContent>
				) : (
					<TooltipContent className="bg-primary text-foreground-foreground p-3">
						<div className="flex flex-col gap-1">
							<h3 className="text-sm font-semibold">DIA {index + 1}</h3>
							<span className="text-xs">SEM DADOS</span>
						</div>
					</TooltipContent>
				)}
			</Tooltip>
		);
	}

	return (
		<TooltipProvider>
			<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full">
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">POR DIA DO MÊS</h1>
					<Calendar className="w-4 h-4 min-w-4 min-h-4" />
				</div>
				<div className="w-full flex flex-col gap-1">
					{isValidNumber(bestDayIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-green-100 text-green-600 text-xs rounded-lg font-medium">
							Melhor dia para vender foi {bestDayIndex}
						</div>
					) : null}
					{isValidNumber(worstDayIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-red-100 text-red-600 text-xs rounded-lg font-medium">
							Pior dia para vender foi {worstDayIndex}
						</div>
					) : null}
				</div>
				<div className="grid grid-cols-7 gap-2 w-full">
					{Array.from({ length: 31 }).map((_, index) => (
						<DayCard key={index.toString()} index={index} />
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}

function GroupedByMonth({ data }: { data: TGetProductStatsOutput["data"]["resultadosAgrupados"]["mes"] }) {
	const MONTH_MAP = {
		1: "Janeiro",
		2: "Fevereiro",
		3: "Março",
		4: "Abril",
		5: "Maio",
		6: "Junho",
		7: "Julho",
		8: "Agosto",
		9: "Setembro",
		10: "Outubro",
		11: "Novembro",
		12: "Dezembro",
	};

	const maxValue = Math.max(...data.map((item) => item.total), 0);
	const minValue = Math.min(...data.map((item) => item.total), 0);
	const range = maxValue - minValue;

	const bestMonthIndex = data.length > 0 ? data.reduce((max, item) => (item.total > max.total ? item : max), data[0]).mes : null;
	const worstMonthIndex = data.length > 0 ? data.reduce((min, item) => (item.total < min.total ? item : min), data[0]).mes : null;

	function getMonthResult(index: number) {
		return data.find((item) => item.mes === index + 1);
	}

	function getColorIntensity(value: number): number {
		if (range === 0) return 0.3;
		const normalized = (value - minValue) / range;
		return 0.1 + normalized * 0.9;
	}

	function MonthCard({ index }: { index: number }) {
		const result = getMonthResult(index);
		const intensity = result ? getColorIntensity(result.total) : 0;
		const bgColor = result ? `rgba(254, 173, 0, ${intensity})` : "transparent";
		const avgValue = result && result.quantidade > 0 ? result.total / result.quantidade : 0;

		return (
			<Tooltip>
				<TooltipTrigger
					delay={200}
					render={
						<div
							key={index.toString()}
							className="flex flex-col items-center justify-center p-3 rounded-md border border-border w-full gap-1 min-h-[70px] transition-all hover:scale-[1.02] cursor-pointer"
							style={{ backgroundColor: bgColor }}
						>
							<h1 className="text-xs font-bold tracking-tight uppercase">{MONTH_MAP[(index + 1) as keyof typeof MONTH_MAP]}</h1>
						</div>
					}
				/>
				{result ? (
					<TooltipContent className="bg-primary text-foreground-foreground p-3 min-w-[180px]">
						<div className="flex flex-col gap-2">
							<h3 className="text-sm font-semibold mb-1">{MONTH_MAP[(index + 1) as keyof typeof MONTH_MAP]}</h3>
							<div className="flex items-center justify-between gap-4">
								<span className="text-xs font-medium tracking-tight">QUANTIDADE</span>
								<span className="text-sm font-bold">{formatDecimalPlaces(result.quantidade)}</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<span className="text-xs font-medium tracking-tight">FATURAMENTO</span>
								<span className="text-sm font-bold">{formatToMoney(result.total)}</span>
							</div>
							<div className="border-t border-border-foreground/80 mt-1 pt-2 flex flex-col gap-1">
								<div className="flex items-center justify-between gap-4">
									<span className="text-xs font-medium tracking-tight">VALOR MÉDIO</span>
									<span className="text-sm font-bold">{formatToMoney(avgValue)}</span>
								</div>
							</div>
						</div>
					</TooltipContent>
				) : (
					<TooltipContent className="bg-primary text-foreground-foreground p-3">
						<div className="flex flex-col gap-1">
							<h3 className="text-sm font-semibold">{MONTH_MAP[(index + 1) as keyof typeof MONTH_MAP]}</h3>
							<span className="text-xs">SEM DADOS</span>
						</div>
					</TooltipContent>
				)}
			</Tooltip>
		);
	}

	return (
		<TooltipProvider>
			<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full">
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">POR MÊS</h1>
					<Calendar className="w-4 h-4 min-w-4 min-h-4" />
				</div>
				<div className="w-full flex flex-col gap-1">
					{isValidNumber(bestMonthIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-green-100 text-green-600 text-xs rounded-lg font-medium">
							Melhor mês para vender foi {MONTH_MAP[bestMonthIndex as keyof typeof MONTH_MAP]}
						</div>
					) : null}
					{isValidNumber(worstMonthIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-red-100 text-red-600 text-xs rounded-lg font-medium">
							Pior mês para vender foi {MONTH_MAP[worstMonthIndex as keyof typeof MONTH_MAP]}
						</div>
					) : null}
				</div>
				<div className="grid grid-cols-3 grid-rows-4 gap-2 w-full">
					{Array.from({ length: 12 }).map((_, index) => (
						<MonthCard key={index.toString()} index={index} />
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}

function GroupedByWeekDay({ data }: { data: TGetProductStatsOutput["data"]["resultadosAgrupados"]["diaSemana"] }) {
	const WEEKDAY_MAP = {
		0: "Domingo",
		1: "Segunda",
		2: "Terça",
		3: "Quarta",
		4: "Quinta",
		5: "Sexta",
		6: "Sábado",
	};

	const maxValue = Math.max(...data.map((item) => item.total), 0);
	const minValue = Math.min(...data.map((item) => item.total), 0);
	const range = maxValue - minValue;

	const bestDayIndex = data.length > 0 ? data.reduce((max, item) => (item.total > max.total ? item : max), data[0]).diaSemana : null;
	const worstDayIndex = data.length > 0 ? data.reduce((min, item) => (item.total < min.total ? item : min), data[0]).diaSemana : null;

	function getWeekDayResult(index: number) {
		return data.find((item) => item.diaSemana === index);
	}

	function getColorIntensity(value: number): number {
		if (range === 0) return 0.3;
		const normalized = (value - minValue) / range;
		return 0.1 + normalized * 0.9;
	}

	function WeekDayCard({ index }: { index: number }) {
		const result = getWeekDayResult(index);
		const intensity = result ? getColorIntensity(result.total) : 0;
		const bgColor = result ? `rgba(254, 173, 0, ${intensity})` : "transparent";
		const avgValue = result && result.quantidade > 0 ? result.total / result.quantidade : 0;

		return (
			<Tooltip>
				<TooltipTrigger
					delay={200}
					render={
						<div
							key={index.toString()}
							className="flex flex-col items-center justify-center p-3 rounded-md border border-border w-full gap-1 min-h-[70px] transition-all hover:scale-[1.02] cursor-pointer"
							style={{ backgroundColor: bgColor }}
						>
							<h1 className="text-xs font-bold tracking-tight uppercase">{WEEKDAY_MAP[index as keyof typeof WEEKDAY_MAP]}</h1>
						</div>
					}
				/>
				{result ? (
					<TooltipContent className="bg-primary text-foreground-foreground p-3 min-w-[180px]">
						<div className="flex flex-col gap-2">
							<h3 className="text-sm font-semibold mb-1">{WEEKDAY_MAP[index as keyof typeof WEEKDAY_MAP]}</h3>
							<div className="flex items-center justify-between gap-4">
								<span className="text-xs font-medium tracking-tight">QUANTIDADE</span>
								<span className="text-sm font-bold">{formatDecimalPlaces(result.quantidade)}</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<span className="text-xs font-medium tracking-tight">FATURAMENTO</span>
								<span className="text-sm font-bold">{formatToMoney(result.total)}</span>
							</div>
							<div className="border-t border-border-foreground/80 mt-1 pt-2 flex flex-col gap-1">
								<div className="flex items-center justify-between gap-4">
									<span className="text-xs font-medium tracking-tight">VALOR MÉDIO</span>
									<span className="text-sm font-bold">{formatToMoney(avgValue)}</span>
								</div>
							</div>
						</div>
					</TooltipContent>
				) : (
					<TooltipContent className="bg-primary text-foreground-foreground p-3">
						<div className="flex flex-col gap-1">
							<h3 className="text-sm font-semibold">{WEEKDAY_MAP[index as keyof typeof WEEKDAY_MAP]}</h3>
							<span className="text-xs">SEM DADOS</span>
						</div>
					</TooltipContent>
				)}
			</Tooltip>
		);
	}

	return (
		<TooltipProvider>
			<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full">
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">POR DIA DA SEMANA</h1>
					<Calendar className="w-4 h-4 min-w-4 min-h-4" />
				</div>
				<div className="w-full flex flex-col gap-1">
					{isValidNumber(bestDayIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-green-100 text-green-600 text-xs rounded-lg font-medium">
							Melhor dia para vender foi {WEEKDAY_MAP[bestDayIndex as keyof typeof WEEKDAY_MAP]}
						</div>
					) : null}
					{isValidNumber(worstDayIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-red-100 text-red-600 text-xs rounded-lg font-medium">
							Pior dia para vender foi {WEEKDAY_MAP[worstDayIndex as keyof typeof WEEKDAY_MAP]}
						</div>
					) : null}
				</div>
				<div className="grid grid-cols-1 gap-2 w-full">
					{Array.from({ length: 7 }).map((_, index) => (
						<WeekDayCard key={index.toString()} index={index} />
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}

// Relationship Components
function GroupedByClient({ data }: { data: TGetProductStatsOutput["data"]["resultadosAgrupados"]["cliente"] }) {
	const [sortMode, setSortMode] = useState<"value" | "quantity">("value");

	const sortedData = [...data].sort((a, b) => {
		if (sortMode === "value") {
			return b.total - a.total;
		}
		return b.quantidade - a.quantidade;
	});

	function ClientCard({
		index,
		client,
		mode,
	}: {
		index: number;
		client: TGetProductStatsOutput["data"]["resultadosAgrupados"]["cliente"][number];
		mode: "value" | "quantity";
	}) {
		return (
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-1 flex-1 min-w-0">
					<div className="w-6 h-6 min-w-6 min-h-6 rounded-full flex items-center justify-center border border-border text-xs">{index + 1}Âº</div>
					<h1 className="text-xs font-medium tracking-tight uppercase truncate">{client.clienteNome || "N/A"}</h1>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs font-bold tracking-tight">
						{mode === "value" ? formatToMoney(client.total) : formatDecimalPlaces(client.quantidade)}
					</span>
				</div>
			</div>
		);
	}

	return (
		<TooltipProvider>
			<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full">
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">TOP 10 CLIENTES</h1>
					<UserRound className="w-4 h-4 min-w-4 min-h-4" />
				</div>
				<div className="flex items-center gap-1 w-full">
					<button
						type="button"
						onClick={() => setSortMode("value")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "value" ? "bg-primary text-foreground-foreground" : "bg-primary/10 text-foreground hover:bg-primary/20"
						}`}
					>
						VALOR
					</button>
					<button
						type="button"
						onClick={() => setSortMode("quantity")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "quantity" ? "bg-primary text-foreground-foreground" : "bg-primary/10 text-foreground hover:bg-primary/20"
						}`}
					>
						QUANTIDADE
					</button>
				</div>
				<div className="w-full flex flex-col gap-2">
					{sortedData.slice(0, 10).map((item, index) => (
						<ClientCard key={item.clienteId} index={index} client={item} mode={sortMode} />
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}

function GroupedBySeller({ data }: { data: TGetProductStatsOutput["data"]["resultadosAgrupados"]["vendedor"] }) {
	const [sortMode, setSortMode] = useState<"value" | "quantity">("value");

	const sortedData = [...data].sort((a, b) => {
		if (sortMode === "value") {
			return b.total - a.total;
		}
		return b.quantidade - a.quantidade;
	});

	function SellerCard({
		index,
		seller,
		mode,
	}: {
		index: number;
		seller: TGetProductStatsOutput["data"]["resultadosAgrupados"]["vendedor"][number];
		mode: "value" | "quantity";
	}) {
		return (
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-1 flex-1 min-w-0">
					<div className="w-6 h-6 min-w-6 min-h-6 rounded-full flex items-center justify-center border border-border text-xs">{index + 1}Âº</div>
					<h1 className="text-xs font-medium tracking-tight uppercase truncate">{seller.vendedorNome || "N/A"}</h1>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs font-bold tracking-tight">
						{mode === "value" ? formatToMoney(seller.total) : formatDecimalPlaces(seller.quantidade)}
					</span>
				</div>
			</div>
		);
	}

	return (
		<TooltipProvider>
			<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full">
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">TOP 10 VENDEDORES</h1>
					<Users className="w-4 h-4 min-w-4 min-h-4" />
				</div>
				<div className="flex items-center gap-1 w-full">
					<button
						type="button"
						onClick={() => setSortMode("value")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "value" ? "bg-primary text-foreground-foreground" : "bg-primary/10 text-foreground hover:bg-primary/20"
						}`}
					>
						VALOR
					</button>
					<button
						type="button"
						onClick={() => setSortMode("quantity")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "quantity" ? "bg-primary text-foreground-foreground" : "bg-primary/10 text-foreground hover:bg-primary/20"
						}`}
					>
						QUANTIDADE
					</button>
				</div>
				<div className="w-full flex flex-col gap-2">
					{sortedData.slice(0, 10).map((item, index) => (
						<SellerCard key={item.vendedorId} index={index} seller={item} mode={sortMode} />
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}

function GroupedByPartner({ data }: { data: TGetProductStatsOutput["data"]["resultadosAgrupados"]["parceiro"] }) {
	const [sortMode, setSortMode] = useState<"value" | "quantity">("value");

	const sortedData = [...data].sort((a, b) => {
		if (sortMode === "value") {
			return b.total - a.total;
		}
		return b.quantidade - a.quantidade;
	});

	function PartnerCard({
		index,
		partner,
		mode,
	}: {
		index: number;
		partner: TGetProductStatsOutput["data"]["resultadosAgrupados"]["parceiro"][number];
		mode: "value" | "quantity";
	}) {
		return (
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-1 flex-1 min-w-0">
					<div className="w-6 h-6 min-w-6 min-h-6 rounded-full flex items-center justify-center border border-border text-xs">{index + 1}Âº</div>
					<h1 className="text-xs font-medium tracking-tight uppercase truncate">{partner.parceiroNome || "N/A"}</h1>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs font-bold tracking-tight">
						{mode === "value" ? formatToMoney(partner.total) : formatDecimalPlaces(partner.quantidade)}
					</span>
				</div>
			</div>
		);
	}

	return (
		<TooltipProvider>
			<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full">
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">TOP 10 PARCEIROS</h1>
					<Users className="w-4 h-4 min-w-4 min-h-4" />
				</div>
				<div className="flex items-center gap-1 w-full">
					<button
						type="button"
						onClick={() => setSortMode("value")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "value" ? "bg-primary text-foreground-foreground" : "bg-primary/10 text-foreground hover:bg-primary/20"
						}`}
					>
						VALOR
					</button>
					<button
						type="button"
						onClick={() => setSortMode("quantity")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "quantity" ? "bg-primary text-foreground-foreground" : "bg-primary/10 text-foreground hover:bg-primary/20"
						}`}
					>
						QUANTIDADE
					</button>
				</div>
				<div className="w-full flex flex-col gap-2">
					{sortedData.slice(0, 10).map((item, index) => (
						<PartnerCard key={item.parceiroId || index} index={index} partner={item} mode={sortMode} />
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}

// Analysis Components
function GroupedByRelatedProducts({ data }: { data: TGetProductStatsOutput["data"]["resultadosAgrupados"]["produtosRelacionados"] }) {
	const [sortMode, setSortMode] = useState<"frequency" | "value" | "quantity">("frequency");

	const sortedData = [...data].sort((a, b) => {
		if (sortMode === "frequency") {
			return b.frequencia - a.frequencia;
		}
		if (sortMode === "value") {
			return b.total - a.total;
		}
		return b.quantidade - a.quantidade;
	});

	function ProductCard({
		index,
		product,
		mode,
	}: {
		index: number;
		product: TGetProductStatsOutput["data"]["resultadosAgrupados"]["produtosRelacionados"][number];
		mode: "frequency" | "value" | "quantity";
	}) {
		return (
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-1 flex-1 min-w-0">
					<div className="w-6 h-6 min-w-6 min-h-6 rounded-full flex items-center justify-center border border-border text-xs">{index + 1}Âº</div>
					<div className="flex flex-col flex-1 min-w-0">
						<h1 className="text-xs font-medium tracking-tight truncate">{product.produtoNome}</h1>
						<p className="text-[10px] text-foreground/60 truncate">{product.produtoCodigo}</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs font-bold tracking-tight">
						{mode === "frequency" ? `${product.frequencia}x` : mode === "value" ? formatToMoney(product.total) : formatDecimalPlaces(product.quantidade)}
					</span>
				</div>
			</div>
		);
	}

	return (
		<TooltipProvider>
			<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full">
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">PRODUTOS VENDIDOS JUNTO</h1>
					<ShoppingBag className="w-4 h-4 min-w-4 min-h-4" />
				</div>
				<div className="flex items-center gap-1 w-full flex-wrap">
					<button
						type="button"
						onClick={() => setSortMode("frequency")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "frequency" ? "bg-primary text-foreground-foreground" : "bg-primary/10 text-foreground hover:bg-primary/20"
						}`}
					>
						FREQUÊNCIA
					</button>
					<button
						type="button"
						onClick={() => setSortMode("value")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "value" ? "bg-primary text-foreground-foreground" : "bg-primary/10 text-foreground hover:bg-primary/20"
						}`}
					>
						VALOR
					</button>
					<button
						type="button"
						onClick={() => setSortMode("quantity")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "quantity" ? "bg-primary text-foreground-foreground" : "bg-primary/10 text-foreground hover:bg-primary/20"
						}`}
					>
						QTDE
					</button>
				</div>
				<div className="w-full flex flex-col gap-2">
					{sortedData.length > 0 ? (
						sortedData.slice(0, 10).map((item, index) => <ProductCard key={item.produtoId} index={index} product={item} mode={sortMode} />)
					) : (
						<p className="text-xs text-center text-foreground/60">Nenhum produto relacionado encontrado</p>
					)}
				</div>
			</div>
		</TooltipProvider>
	);
}

function MarginAnalysis({ data }: { data: TGetProductStatsOutput["data"]["analiseMargem"] }) {
	const [viewMode, setViewMode] = useState<"seller" | "client" | "partner">("seller");

	const currentData = viewMode === "seller" ? data.porVendedor : viewMode === "client" ? data.porCliente : data.porParceiro;

	function MarginCard({
		index,
		item,
	}: {
		index: number;
		item:
			| TGetProductStatsOutput["data"]["analiseMargem"]["porVendedor"][number]
			| TGetProductStatsOutput["data"]["analiseMargem"]["porCliente"][number]
			| TGetProductStatsOutput["data"]["analiseMargem"]["porParceiro"][number];
	}) {
		const name =
			"vendedorNome" in item ? item.vendedorNome : "clienteNome" in item ? item.clienteNome : "parceiroNome" in item ? item.parceiroNome : "N/A";

		return (
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-1 flex-1 min-w-0">
					<div className="w-6 h-6 min-w-6 min-h-6 rounded-full flex items-center justify-center border border-border text-xs">{index + 1}Âº</div>
					<h1 className="text-xs font-medium tracking-tight uppercase truncate">{name || "N/A"}</h1>
				</div>
				<div className="flex flex-col items-end">
					<span className="text-xs font-bold tracking-tight">{formatToMoney(item.margem)}</span>
					<span className="text-[10px] text-foreground/60">{formatDecimalPlaces(item.margemPercentual)}%</span>
				</div>
			</div>
		);
	}

	return (
		<TooltipProvider>
			<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full">
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">ANÁLISE DE MARGEM</h1>
					<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />
				</div>
				<div className="flex items-center gap-1 w-full flex-wrap">
					<button
						type="button"
						onClick={() => setViewMode("seller")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							viewMode === "seller" ? "bg-primary text-foreground-foreground" : "bg-primary/10 text-foreground hover:bg-primary/20"
						}`}
					>
						VENDEDOR
					</button>
					<button
						type="button"
						onClick={() => setViewMode("client")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							viewMode === "client" ? "bg-primary text-foreground-foreground" : "bg-primary/10 text-foreground hover:bg-primary/20"
						}`}
					>
						CLIENTE
					</button>
					<button
						type="button"
						onClick={() => setViewMode("partner")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							viewMode === "partner" ? "bg-primary text-foreground-foreground" : "bg-primary/10 text-foreground hover:bg-primary/20"
						}`}
					>
						PARCEIRO
					</button>
				</div>
				<div className="w-full flex flex-col gap-2">
					{currentData.length > 0 ? (
						currentData.slice(0, 10).map((item, index) => <MarginCard key={index.toString()} index={index} item={item} />)
					) : (
						<p className="text-xs text-center text-foreground/60">Nenhum dado disponível</p>
					)}
				</div>
			</div>
		</TooltipProvider>
	);
}

function DiscountAnalysis({
	descontoTotal,
	percentualDescontoMedio,
	faturamentoBruto,
}: {
	descontoTotal: number;
	percentualDescontoMedio: number;
	faturamentoBruto: number;
}) {
	return (
		<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full">
			<div className="flex items-center justify-between">
				<h1 className="text-xs font-medium tracking-tight uppercase">ANÁLISE DE DESCONTOS</h1>
				<Percent className="w-4 h-4 min-w-4 min-h-4" />
			</div>
			<div className="w-full flex flex-col gap-4">
				<div className="w-full flex items-center gap-4 flex-wrap">
					<div className="flex items-end gap-1">
						<p className="text-2xl font-bold text-[#15599a] dark:text-[#fead61]">{formatToMoney(descontoTotal)}</p>
						<span className="text-[0.65rem] font-medium tracking-tight">TOTAL EM DESCONTOS</span>
					</div>
					<div className="flex items-end gap-1">
						<p className="text-2xl font-bold text-[#15599a] dark:text-[#fead61]">{formatDecimalPlaces(percentualDescontoMedio)}%</p>
						<span className="text-[0.65rem] font-medium tracking-tight">PERCENTUAL MÉDIO</span>
					</div>
				</div>
				<p
					className={cn(
						"text-sm text-center px-2 py-1 rounded-lg bg-primary/10 text-foreground w-fit self-center",
						percentualDescontoMedio > 15 && "text-yellow-800 bg-yellow-100",
					)}
				>
					De <strong className="text-foreground">{formatToMoney(faturamentoBruto)}</strong> potenciais, {formatToMoney(descontoTotal)} foram descontados
				</p>
			</div>
		</div>
	);
}

// De onde vêm as vendas do produto: como item, como adicional vinculado de outro item, e quanto
// do faturamento como item foram adicionais sem produto (que ficam com o produto da linha).
// Só aparece quando há adicional envolvido — para a maioria dos produtos seria um bloco de zeros.
function SalesCompositionAnalysis({ composicao }: { composicao: TGetProductStatsOutput["data"]["composicao"] }) {
	const hasAddOnSales = composicao.quantidadeComoAdicional > 0 || composicao.faturamentoComoAdicional > 0;
	const hasUnlinkedAddOns = composicao.faturamentoAdicionaisSemProduto > 0;
	if (!hasAddOnSales && !hasUnlinkedAddOns) return null;
	return (
		<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full">
			<div className="flex items-center justify-between">
				<h1 className="text-xs font-medium tracking-tight uppercase">COMPOSIÇÃO DAS VENDAS</h1>
				<CirclePlus className="w-4 h-4 min-w-4 min-h-4" />
			</div>
			<div className="w-full flex items-center gap-4 flex-wrap">
				<div className="flex items-end gap-1">
					<p className="text-2xl font-bold text-[#15599a] dark:text-[#fead61]">{formatToMoney(composicao.faturamentoComoItem)}</p>
					<span className="text-[0.65rem] font-medium tracking-tight">COMO ITEM ({formatDecimalPlaces(composicao.quantidadeComoItem)} UN.)</span>
				</div>
				{hasAddOnSales ? (
					<div className="flex items-end gap-1">
						<p className="text-2xl font-bold text-[#15599a] dark:text-[#fead61]">{formatToMoney(composicao.faturamentoComoAdicional)}</p>
						<span className="text-[0.65rem] font-medium tracking-tight">
							COMO ADICIONAL DE OUTROS PRODUTOS ({formatDecimalPlaces(composicao.quantidadeComoAdicional)} UN.)
						</span>
					</div>
				) : null}
			</div>
			{hasUnlinkedAddOns ? (
				<p className="text-sm text-center px-2 py-1 rounded-lg bg-primary/10 text-foreground w-fit self-center">
					Das vendas como item, <strong className="text-foreground">{formatToMoney(composicao.faturamentoAdicionaisSemProduto)}</strong> foram adicionais
					sem produto vinculado
				</p>
			) : null}
		</div>
	);
}

// Product Graph Component
function ProductGraphBlock({
	productId,
	periodAfter,
	periodBefore,
	sellerId,
	partnerId,
	integrationsIds,
}: {
	productId: string;
	periodAfter: string | null | undefined;
	periodBefore: string | null | undefined;
	sellerId: string | null;
	partnerId: string | null;
	integrationsIds: string[] | null;
}) {
	console.log("[INFO] [PRODUCT GRAPH BLOCK] Input:", { productId, periodAfter, periodBefore, sellerId, partnerId, integrationsIds });
	const [graphMetric, setGraphMetric] = useState<"quantidade" | "valorLiquido" | "margemPercentual" | "ticketMedio">("valorLiquido");

	const { data: productGraph, isLoading: productGraphLoading } = useProductGraph({
		productId,
		periodAfter: periodAfter,
		periodBefore: periodBefore,
		sellerId,
		partnerId,
		integrationsIds,
	});

	async function handleExportData(data: TGetProductGraphOutput["data"] | undefined) {
		try {
			if (!data) throw new Error("Não há dados para exportar");
			const exportationJSON = data.map((item) => ({
				PERÍODO: item.titulo,
				QUANTIDADE: item.quantidade,
				"VALOR LÍQUIDO": item.valorLiquido,
				"MARGEM (R$)": item.margem,
				"MARGEM (%)": item.margemPercentual,
				"TICKET MÉDIO": item.ticketMedio,
			}));
			getExcelFromJSON(exportationJSON, "PRODUTO_EVOLUÇÃO.xlsx");
			return toast.success("Dados exportados com sucesso");
		} catch (error) {
			const msg = getErrorMessage(error);
			return toast.error(msg);
		}
	}

	const CHART_LABEL: Record<"quantidade" | "valorLiquido" | "margemPercentual" | "ticketMedio", string> = {
		quantidade: "QUANTIDADE VENDIDA",
		valorLiquido: "VALOR VENDIDO",
		margemPercentual: "MARGEM (%)",
		ticketMedio: "TICKET MÉDIO",
	};
	const chartConfig = {
		titulo: {
			label: "DATA",
		},
		quantidade: {
			label: "Quantidade Vendida",
			color: "#FFB900",
		},
		valorLiquido: {
			label: "Valor Líquido",
			color: "#FFB900",
		},
		margemPercentual: {
			label: "Margem %",
			color: "#22c55e",
		},
		ticketMedio: {
			label: "Ticket Médio",
			color: "#15599a",
		},
	} satisfies ChartConfig;

	return (
		<div className="w-full flex flex-col gap-2 py-2">
			<div className="bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs">
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">{CHART_LABEL[graphMetric]}</h1>
					<div className="flex items-center gap-2">
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button variant={"ghost"} size="fit" className="rounded-lg p-2" onClick={() => handleExportData(productGraph)}>
											<Download className="h-4 min-h-4 w-4 min-w-4" />
										</Button>
									}
								/>
								<TooltipContent>
									<p>Baixar</p>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant={graphMetric === "valorLiquido" ? "default" : "ghost"}
											size="fit"
											className="rounded-lg p-2"
											onClick={() => setGraphMetric("valorLiquido")}
										>
											<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
										</Button>
									}
								/>
								<TooltipContent>
									<p>Valor Líquido</p>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant={graphMetric === "quantidade" ? "default" : "ghost"}
											size="fit"
											className="rounded-lg p-2"
											onClick={() => setGraphMetric("quantidade")}
										>
											<ShoppingBag className="h-4 min-h-4 w-4 min-w-4" />
										</Button>
									}
								/>
								<TooltipContent>
									<p>Quantidade</p>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant={graphMetric === "margemPercentual" ? "default" : "ghost"}
											size="fit"
											className="rounded-lg p-2"
											onClick={() => setGraphMetric("margemPercentual")}
										>
											<Percent className="h-4 min-h-4 w-4 min-w-4" />
										</Button>
									}
								/>
								<TooltipContent>
									<p>Margem %</p>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant={graphMetric === "ticketMedio" ? "default" : "ghost"}
											size="fit"
											className="rounded-lg p-2"
											onClick={() => setGraphMetric("ticketMedio")}
										>
											<ChartBar className="h-4 min-h-4 w-4 min-w-4" />
										</Button>
									}
								/>
								<TooltipContent>
									<p>Ticket Médio</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
				</div>
				<div className="flex w-full items-center gap-4">
					<div className="flex max-h-[400px] min-h-[400px] w-full items-center justify-center lg:max-h-[350px] lg:min-h-[350px]">
						<ChartContainer className="aspect-auto h-[350px] w-full lg:h-[250px]" config={chartConfig}>
							<ComposedChart
								accessibilityLayer
								data={productGraph || []}
								margin={{
									top: 15,
									right: 15,
									left: 15,
									bottom: 15,
								}}
							>
								<CartesianGrid vertical={false} />
								<XAxis dataKey="titulo" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={(value) => value.slice(0, 12)} />

								<ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />

								<defs>
									<linearGradient id="fillProductMetric" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor={chartConfig[graphMetric].color} stopOpacity={0.8} />
										<stop offset="95%" stopColor={chartConfig[graphMetric].color} stopOpacity={0.1} />
									</linearGradient>
								</defs>

								{graphMetric === "quantidade" || graphMetric === "valorLiquido" || graphMetric === "ticketMedio" ? (
									<>
										<YAxis
											yAxisId="left"
											orientation="left"
											tickFormatter={(value) => (graphMetric === "quantidade" ? formatDecimalPlaces(value) : formatToMoney(value))}
											stroke={chartConfig[graphMetric].color}
										/>
										<Area
											yAxisId="left"
											dataKey={graphMetric}
											type="monotone"
											fill="url(#fillProductMetric)"
											fillOpacity={0.4}
											stroke={chartConfig[graphMetric].color}
											name={chartConfig[graphMetric].label}
										/>
									</>
								) : null}

								{graphMetric === "margemPercentual" ? (
									<>
										<YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} stroke={chartConfig[graphMetric].color} />
										<Bar
											yAxisId="right"
											dataKey={graphMetric}
											fill={chartConfig[graphMetric].color}
											name={chartConfig[graphMetric].label}
											radius={[4, 4, 0, 0]}
											barSize={20}
										/>
									</>
								) : null}
							</ComposedChart>
						</ChartContainer>
					</div>
				</div>
			</div>
		</div>
	);
}
