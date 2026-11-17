import { resolveGoalPermissions } from "@/lib/permissions/goals";
import { canViewCosts } from "@/lib/permissions/sensitive-data";
import GoalPaceChip from "@/components/Goals/GoalPaceChip";
import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { GoalTrackingBar } from "@/components/Stats/GoalTrackingBar";
import { useGoalsStats } from "@/lib/queries/goals";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useOverallSalesStats } from "@/lib/queries/stats/overall";
import type { TOverallSalesStats } from "@/app/api/stats/sales-overall/route";
import type { TSaleStatsGeneralQueryParams } from "@/schemas/query-params-utils";
import { BadgeDollarSign, Percent, ShoppingBag, UserRoundX } from "lucide-react";
import { useEffect, useState } from "react";
import { BsCart } from "react-icons/bs";
import { BsFileEarmarkText, BsTicketPerforated } from "react-icons/bs";
import { VscDiffAdded } from "react-icons/vsc";
import { useDebounce } from "use-debounce";

type OverallStatsBlockProps = {
	user: TAuthUserSession["user"];
	userMembership: NonNullable<TAuthUserSession["membership"]>;
	userOrg: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	generalQueryParams: TSaleStatsGeneralQueryParams;
};
function OverallStatsBlock({ user, userMembership, userOrg, generalQueryParams }: OverallStatsBlockProps) {
	const isUserAllowedToSeeSensitiveData = canViewCosts(userMembership.permissoes);
	// O ritmo vem de /api/goals/stats, que exige `visualizarMetas`: sem ela o chip nem consulta.
	const canViewGoals = resolveGoalPermissions(userMembership.permissoes).visualizar;
	const [queryParams, setQueryParams] = useState<TSaleStatsGeneralQueryParams>(generalQueryParams);
	const { getPrimaryGradientStyle } = useOrgColors();

	const [debouncedQueryParams] = useDebounce(queryParams, 1000);

	const { data: overallStats, isLoading: overallStatsLoading } = useOverallSalesStats(debouncedQueryParams);
	useEffect(() => {
		setQueryParams(generalQueryParams);
	}, [generalQueryParams]);
	return (
		<div className="w-full flex flex-col gap-2 py-2">
			<div className="bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h1 className="text-xs font-medium tracking-tight uppercase">ACOMPANHAMENTO DE META DO PERÍODO</h1>
					<div className="flex items-center gap-2">
						{canViewGoals ? <ActiveGoalPaceChip /> : null}
						<VscDiffAdded size={12} />
					</div>
				</div>
				<div className="w-full flex items-center justify-center p-2">
					<GoalTrackingBar
						barStyle={getPrimaryGradientStyle()}
						barHeight="25px"
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
				<OverallStatsBlockPlus overallStats={overallStats} isUserAllowedToSeeSensitiveData={isUserAllowedToSeeSensitiveData} />
			)}
		</div>
	);
}

/**
 * O veredito de ritmo da meta ativa, ao lado da barra de acompanhamento.
 *
 * A barra mostra o quanto do período já foi feito; o chip diz se isso é bom para o dia de hoje —
 * é a informação que falta para a barra virar decisão. Fica silencioso quando não há meta ativa,
 * porque um período sem meta não tem ritmo a comparar.
 */
function ActiveGoalPaceChip() {
	const { data } = useGoalsStats();
	const ritmo = data?.activeGoal?.ritmo;
	if (!ritmo) return null;

	return <GoalPaceChip situacao={ritmo.situacao} diferenca={ritmo.diferenca} size="sm" />;
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
						<p className="text-xs font-bold text-foreground">{formatDecimalPlaces(overallStats?.faturamentoViaClientesRecorrentes.porcentagem ?? 0)}%</p>
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
						<p className="text-xs font-bold text-foreground">{formatDecimalPlaces(overallStats?.faturamentoViaNovosClientes.porcentagem ?? 0)}%</p>
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
						<p className="text-xs font-bold text-foreground">
							{formatDecimalPlaces(overallStats?.faturamentoViaClientesNaoIdentificados.porcentagem ?? 0)}%
						</p>
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
	isUserAllowedToSeeSensitiveData: boolean;
};
function OverallStatsBlockPlus({ overallStats, isUserAllowedToSeeSensitiveData }: OverallStatsBlockPlusProps) {
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
					className={isUserAllowedToSeeSensitiveData ? "w-full lg:w-1/4" : "w-full lg:w-1/2"}
				/>
				<StatUnitCard
					title="Faturamento"
					icon={<BsFileEarmarkText className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: overallStats?.faturamento.atual || 0, format: (n) => formatToMoney(n) }}
					previous={overallStats?.faturamento.anterior ? { value: overallStats.faturamento.anterior || 0, format: (n) => formatToMoney(n) } : undefined}
					className={isUserAllowedToSeeSensitiveData ? "w-full lg:w-1/4" : "w-full lg:w-1/2"}
				/>
				{isUserAllowedToSeeSensitiveData ? (
					<>
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
					</>
				) : null}
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

