import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useOverallSalesStats } from "@/lib/queries/stats/overall";
import { cn } from "@/lib/utils";
import type { TOverallSalesStats } from "@/pages/api/stats/sales-overall";
import type { TSaleStatsGeneralQueryParams } from "@/schemas/query-params-utils";
import { BadgeDollarSign, Percent, ShoppingBag, UserRoundX } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { BsCart } from "react-icons/bs";
import { BsFileEarmarkText, BsTicketPerforated } from "react-icons/bs";
import { VscDiffAdded } from "react-icons/vsc";
import { useDebounce } from "use-debounce";

type OverallStatsBlockProps = {
	user: TAuthUserSession["user"];
	userOrg: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	generalQueryParams: TSaleStatsGeneralQueryParams;
};
function OverallStatsBlock({ user, userOrg, generalQueryParams }: OverallStatsBlockProps) {
	const [queryParams, setQueryParams] = useState<TSaleStatsGeneralQueryParams>(generalQueryParams);
	const { getPrimaryGradientStyle } = useOrgColors();

	const [debouncedQueryParams] = useDebounce(queryParams, 1000);

	const { data: overallStats, isLoading: overallStatsLoading } = useOverallSalesStats(debouncedQueryParams);
	useEffect(() => {
		setQueryParams(generalQueryParams);
	}, [generalQueryParams]);
	return (
		<div className="w-full flex flex-col gap-2 py-2">
			<div className="bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs">
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">ACOMPANHAMENTO DE META DO PERÍODO</h1>
					<VscDiffAdded size={12} />
				</div>
				<div className="w-full flex items-center justify-center p-2">
					<GoalTrackingBar
						barStyle={getPrimaryGradientStyle()}
						goalText={`${overallStats?.faturamentoMeta || "..."}`}
						barHeigth="25px"
						valueGoal={overallStats?.faturamentoMeta || 0}
						valueHit={overallStats?.faturamento.atual || 0}
						formattedValueGoal={formatToMoney(overallStats?.faturamentoMeta || 0)}
						formattedValueHit={formatToMoney(overallStats?.faturamento.atual || 0)}
					/>
				</div>
			</div>
			{userOrg?.assinaturaPlano === "ESSENCIAL" ? (
				<OverallStatsBlockStarter overallStats={overallStats} />
			) : (
				<OverallStatsBlockPlus overallStats={overallStats} />
			)}
		</div>
	);
}

export default OverallStatsBlock;

type OverallStatsBlockStarterProps = {
	overallStats: TOverallSalesStats | undefined;
};
function RevenueBreakdownRow({ overallStats }: { overallStats: TOverallSalesStats | undefined }) {
	return (
		<div className="flex w-full flex-col items-center justify-around gap-2 lg:flex-row">
			<StatUnitCard
				title="FATURAMENTO POR CLIENTES EXISTENTES"
				icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
				current={{
					value: overallStats?.faturamentoViaClientesRecorrentes.atual ?? 0,
					format: (n) => formatToMoney(n),
				}}
				previous={
					overallStats?.faturamentoViaClientesRecorrentes.anterior != null
						? { value: overallStats.faturamentoViaClientesRecorrentes.anterior, format: (n) => formatToMoney(n) }
						: undefined
				}
				footer={
					<div className="flex items-center gap-1">
						<p className="text-xs text-muted-foreground tracking-tight">REPRESENTATIVIDADE:</p>
						<p className="text-xs font-bold text-primary">{formatDecimalPlaces(overallStats?.faturamentoViaClientesRecorrentes.porcentagem ?? 0)}%</p>
					</div>
				}
				className="w-full lg:w-1/3"
			/>
			<StatUnitCard
				title="FATURAMENTO POR CLIENTES NOVOS"
				icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
				current={{
					value: overallStats?.faturamentoViaNovosClientes.atual ?? 0,
					format: (n) => formatToMoney(n),
				}}
				previous={
					overallStats?.faturamentoViaNovosClientes.anterior != null
						? { value: overallStats.faturamentoViaNovosClientes.anterior, format: (n) => formatToMoney(n) }
						: undefined
				}
				footer={
					<div className="flex items-center gap-1">
						<p className="text-xs text-muted-foreground tracking-tight">REPRESENTATIVIDADE:</p>
						<p className="text-xs font-bold text-primary">{formatDecimalPlaces(overallStats?.faturamentoViaNovosClientes.porcentagem ?? 0)}%</p>
					</div>
				}
				className="w-full lg:w-1/3"
			/>
			<StatUnitCard
				title="FATURAMENTO AO CONSUMIDOR"
				icon={<UserRoundX className="w-4 h-4 min-w-4 min-h-4" />}
				current={{
					value: overallStats?.faturamentoViaClientesNaoIdentificados.atual ?? 0,
					format: (n) => formatToMoney(n),
				}}
				previous={
					overallStats?.faturamentoViaClientesNaoIdentificados.anterior != null
						? { value: overallStats.faturamentoViaClientesNaoIdentificados.anterior, format: (n) => formatToMoney(n) }
						: undefined
				}
				footer={
					<div className="flex items-center gap-1">
						<p className="text-xs text-muted-foreground tracking-tight">REPRESENTATIVIDADE:</p>
						<p className="text-xs font-bold text-primary">{formatDecimalPlaces(overallStats?.faturamentoViaClientesNaoIdentificados.porcentagem ?? 0)}%</p>
					</div>
				}
				className="w-full lg:w-1/3"
			/>
		</div>
	);
}

function OverallStatsBlockStarter({ overallStats }: OverallStatsBlockStarterProps) {
	return (
		<>
			<div className="flex w-full flex-col items-center justify-around gap-2 lg:flex-row">
				<StatUnitCard
					title="Número de Vendas"
					icon={<VscDiffAdded className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: overallStats?.qtdeVendas.atual || 0, format: (n) => formatDecimalPlaces(n) }}
					previous={
						overallStats?.qtdeVendas.anterior ? { value: overallStats?.qtdeVendas.anterior || 0, format: (n) => formatDecimalPlaces(n) } : undefined
					}
					className="w-full lg:w-1/2"
				/>
				<StatUnitCard
					title="Faturamento"
					icon={<BsFileEarmarkText className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: overallStats?.faturamento.atual || 0, format: (n) => formatToMoney(n) }}
					previous={overallStats?.faturamento.anterior ? { value: overallStats.faturamento.anterior || 0, format: (n) => formatToMoney(n) } : undefined}
					className="w-full lg:w-1/2"
				/>
			</div>
			<div className="flex w-full flex-col items-center justify-around gap-2 lg:flex-row">
				<StatUnitCard
					title="Ticket Médio"
					icon={<BsTicketPerforated className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: overallStats?.ticketMedio.atual || 0, format: (n) => formatToMoney(n) }}
					previous={overallStats?.ticketMedio.anterior ? { value: overallStats.ticketMedio.anterior || 0, format: (n) => formatToMoney(n) } : undefined}
					className="w-full lg:w-1/2"
				/>
				<StatUnitCard
					title="Valor Diário Vendido"
					icon={<BsCart className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: overallStats?.valorDiarioVendido.atual || 0, format: (n) => formatToMoney(n) }}
					previous={
						overallStats?.valorDiarioVendido.anterior
							? { value: overallStats.valorDiarioVendido.anterior || 0, format: (n) => formatToMoney(n) }
							: undefined
					}
					className="w-full lg:w-1/2"
				/>
			</div>
			<RevenueBreakdownRow overallStats={overallStats} />
		</>
	);
}

type OverallStatsBlockPlusProps = {
	overallStats: TOverallSalesStats | undefined;
};
function OverallStatsBlockPlus({ overallStats }: OverallStatsBlockPlusProps) {
	return (
		<>
			<div className="flex w-full flex-col items-center justify-around gap-2 lg:flex-row">
				<StatUnitCard
					title="Número de Vendas"
					icon={<VscDiffAdded className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: overallStats?.qtdeVendas.atual || 0, format: (n) => formatDecimalPlaces(n) }}
					previous={
						overallStats?.qtdeVendas.anterior ? { value: overallStats?.qtdeVendas.anterior || 0, format: (n) => formatDecimalPlaces(n) } : undefined
					}
					className="w-full lg:w-1/4"
				/>
				<StatUnitCard
					title="Faturamento"
					icon={<BsFileEarmarkText className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: overallStats?.faturamento.atual || 0, format: (n) => formatToMoney(n) }}
					previous={overallStats?.faturamento.anterior ? { value: overallStats.faturamento.anterior || 0, format: (n) => formatToMoney(n) } : undefined}
					className="w-full lg:w-1/4"
				/>
				<StatUnitCard
					title="Margem Bruta"
					icon={<BsFileEarmarkText className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: overallStats?.margemBruta.atual || 0, format: (n) => formatToMoney(n) }}
					previous={overallStats?.margemBruta.anterior ? { value: overallStats.margemBruta.anterior || 0, format: (n) => formatToMoney(n) } : undefined}
					className="w-full lg:w-1/4"
				/>
				<StatUnitCard
					title="Margem"
					icon={<Percent className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: (100 * (overallStats?.margemBruta.atual || 0)) / (overallStats?.faturamento.atual || 0),
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						overallStats?.margemBruta.anterior && overallStats?.faturamento.anterior
							? {
									value: (100 * (overallStats.margemBruta.anterior || 0)) / (overallStats.faturamento.anterior || 0),
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
					className="w-full lg:w-1/4"
				/>
			</div>
			<div className="flex w-full flex-col items-center justify-around gap-2 lg:flex-row">
				<StatUnitCard
					title="Ticket Médio"
					icon={<BsTicketPerforated className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: overallStats?.ticketMedio.atual || 0, format: (n) => formatToMoney(n) }}
					previous={overallStats?.ticketMedio.anterior ? { value: overallStats.ticketMedio.anterior || 0, format: (n) => formatToMoney(n) } : undefined}
					className="w-full lg:w-1/3"
				/>
				<StatUnitCard
					title="Valor Diário Vendido"
					icon={<BsCart className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: overallStats?.valorDiarioVendido.atual || 0, format: (n) => formatToMoney(n) }}
					previous={
						overallStats?.valorDiarioVendido.anterior
							? { value: overallStats.valorDiarioVendido.anterior || 0, format: (n) => formatToMoney(n) }
							: undefined
					}
					className="w-full lg:w-1/3"
				/>
				<StatUnitCard
					title="Média de Itens por Venda"
					icon={<ShoppingBag className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: overallStats?.itensPorVendaMedio.atual || 0, format: (n) => formatDecimalPlaces(n) }}
					previous={
						overallStats?.itensPorVendaMedio.anterior
							? { value: overallStats.itensPorVendaMedio.anterior || 0, format: (n) => formatDecimalPlaces(n) }
							: undefined
					}
					className="w-full lg:w-1/3"
				/>
			</div>
			<RevenueBreakdownRow overallStats={overallStats} />
		</>
	);
}

type GoalTrackingBarProps = {
	valueGoal?: number;
	valueHit: number;
	formattedValueGoal?: string;
	formattedValueHit?: string;
	goalText: string;
	barHeigth: string;
	barStyle?: React.CSSProperties;
};
function GoalTrackingBar({ valueGoal, valueHit, formattedValueGoal, formattedValueHit, goalText, barHeigth, barStyle }: GoalTrackingBarProps) {
	function getPercentage({ goal, hit }: { goal: number | undefined; hit: number | undefined }) {
		if (!hit || hit === 0) return "0%";
		if (!goal && hit) return "100%";
		if (goal && !hit) return "0%";
		if (goal && hit) {
			const percentage = ((hit / goal) * 100).toFixed(2);
			return `${percentage}%`;
		}
	}
	function getWidth({ goal, hit }: { goal: number | undefined; hit: number | undefined }) {
		if (!hit || hit === 0) return "0%";
		if (!goal && hit) return "100%";
		if (goal && !hit) return "0%";
		if (goal && hit) {
			let percentage: number | string = (hit / goal) * 100;
			percentage = percentage > 100 ? 100 : percentage.toFixed(2);
			return `${percentage}%`;
		}
	}

	return (
		<div className="flex w-full items-center gap-1">
			<div className="flex grow gap-2">
				<div className="grow">
					<div
						style={{
							width: getWidth({ goal: valueGoal, hit: valueHit }),
							height: barHeigth,
							...barStyle,
						}}
						className="flex items-center justify-center rounded-sm text-xs text-white shadow-xs"
					/>
				</div>
			</div>
			<div className="flex min-w-[70px] flex-col items-end justify-end lg:min-w-[100px]">
				<p className="text-xs font-medium uppercase tracking-tight lg:text-sm">{getPercentage({ goal: valueGoal, hit: valueHit })}</p>
				<p className="text-[0.5rem] italic text-gray-500 lg:text-[0.65rem]">
					<strong>{formattedValueHit || valueHit?.toLocaleString("pt-br", { maximumFractionDigits: 2 }) || 0}</strong> de{" "}
					<strong>
						{formattedValueGoal ||
							valueGoal?.toLocaleString("pt-br", {
								maximumFractionDigits: 2,
							}) ||
							0}
					</strong>{" "}
				</p>
			</div>
		</div>
	);
}
