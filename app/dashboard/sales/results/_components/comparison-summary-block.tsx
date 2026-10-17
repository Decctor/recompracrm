"use client";

import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import type { TSalesComparisonStats } from "@/lib/sales/comparison-stats";
import {
	BadgeDollarSign,
	Box,
	CalendarDays,
	Percent,
	ReceiptText,
	ShoppingBasket,
	TrendingUp,
	UserRound,
	UserRoundPlus,
	UserRoundX,
} from "lucide-react";
import { describeComparisonPeriods } from "./comparison-periods";

type ComparisonSummaryBlockProps = {
	data: TSalesComparisonStats;
};

/**
 * Cartões com o período base em destaque e o de comparação na linha de baixo, com a variação.
 * A legenda no topo nomeia os dois períodos uma vez, para que cada cartão não precise repetir.
 */
export function ComparisonSummaryBlock({ data }: ComparisonSummaryBlockProps) {
	const { getChartColors } = useOrgColors();
	const chartColors = getChartColors();
	const periods = describeComparisonPeriods(data.periodos);
	const previousLabel = `EM ${periods.comparacao.label}`;

	const money = (n: number) => formatToMoney(n);
	const integer = (n: number) => formatDecimalPlaces(n, 0, 0);
	const decimal = (n: number) => formatDecimalPlaces(n, 1, 2);
	const pair = (value: { base: number; comparacao: number }, format: (n: number) => string) => ({
		current: { value: value.base, format },
		previous: { value: value.comparacao, format },
	});

	const margemPercentual = data.margemBruta
		? {
				base: data.faturamento.base > 0 ? (data.margemBruta.base / data.faturamento.base) * 100 : 0,
				comparacao: data.faturamento.comparacao > 0 ? (data.margemBruta.comparacao / data.faturamento.comparacao) * 100 : 0,
			}
		: null;

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
				<PeriodLegend color={chartColors.current} label={periods.base.label} days={periods.base.dias} />
				<span className="text-muted-foreground font-medium">vs</span>
				<PeriodLegend color={chartColors.previous} label={periods.comparacao.label} days={periods.comparacao.dias} muted />
			</div>

			<div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
				<StatUnitCard
					title="FATURAMENTO"
					icon={<BadgeDollarSign className="h-4 w-4" />}
					{...pair(data.faturamento, money)}
					previousLabel={previousLabel}
				/>
				<StatUnitCard title="VENDAS" icon={<ReceiptText className="h-4 w-4" />} {...pair(data.qtdeVendas, integer)} previousLabel={previousLabel} />
				<StatUnitCard title="TICKET MÉDIO" icon={<TrendingUp className="h-4 w-4" />} {...pair(data.ticketMedio, money)} previousLabel={previousLabel} />
				<StatUnitCard
					title="VALOR DIÁRIO MÉDIO"
					subtitle={`${periods.base.dias} vs ${periods.comparacao.dias} dias`}
					icon={<CalendarDays className="h-4 w-4" />}
					{...pair(data.valorDiarioMedio, money)}
					previousLabel={previousLabel}
				/>
				<StatUnitCard
					title="ITENS VENDIDOS"
					icon={<Box className="h-4 w-4" />}
					{...pair(data.qtdeItensVendidos, integer)}
					previousLabel={previousLabel}
				/>
				<StatUnitCard
					title="ITENS POR VENDA"
					icon={<ShoppingBasket className="h-4 w-4" />}
					{...pair(data.itensPorVendaMedio, decimal)}
					previousLabel={previousLabel}
				/>
				{data.margemBruta ? (
					<StatUnitCard
						title="MARGEM BRUTA"
						icon={<BadgeDollarSign className="h-4 w-4" />}
						{...pair(data.margemBruta, money)}
						previousLabel={previousLabel}
					/>
				) : null}
				{margemPercentual ? (
					<StatUnitCard
						title="MARGEM BRUTA (%)"
						icon={<Percent className="h-4 w-4" />}
						{...pair(margemPercentual, (n) => `${formatDecimalPlaces(n, 1, 1)}%`)}
						previousLabel={previousLabel}
					/>
				) : null}
			</div>

			<div className="grid w-full grid-cols-1 gap-2 md:grid-cols-3">
				<StatUnitCard
					variant="horizontal"
					title="CLIENTES RECORRENTES"
					icon={<UserRound className="h-4 w-4" />}
					{...pair(data.faturamentoClientesRecorrentes, money)}
					previousLabel={previousLabel}
				/>
				<StatUnitCard
					variant="horizontal"
					title="NOVOS CLIENTES"
					icon={<UserRoundPlus className="h-4 w-4" />}
					{...pair(data.faturamentoNovosClientes, money)}
					previousLabel={previousLabel}
				/>
				<StatUnitCard
					variant="horizontal"
					title="NÃO IDENTIFICADOS"
					icon={<UserRoundX className="h-4 w-4" />}
					{...pair(data.faturamentoNaoIdentificados, money)}
					previousLabel={previousLabel}
				/>
			</div>
		</div>
	);
}

function PeriodLegend({ color, label, days, muted }: { color: string; label: string; days: number; muted?: boolean }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
			<span className={muted ? "text-muted-foreground font-medium" : "font-bold"}>{label}</span>
			<span className="text-muted-foreground tabular-nums">
				({days} {days === 1 ? "dia" : "dias"})
			</span>
		</span>
	);
}
