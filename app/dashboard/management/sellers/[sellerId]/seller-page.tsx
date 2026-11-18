"use client";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import EditSeller from "@/components/Modals/Sellers/EditSeller";
import { WeeklyRevenueHeatmap } from "@/components/SalesStats/Blocks/WeeklyRevenueHeatmap";
import {
	SellerResultsByMonthBlock,
	SellerResultsByMonthDayBlock,
	SellerResultsByWeekDayBlock,
} from "@/components/SellerStats/Blocks/PeriodHeatmapBlocks";
import { SellerTopClientsBlock, SellerTopProductGroupsBlock, SellerTopProductsBlock } from "@/components/SellerStats/Blocks/TopRankingBlocks";
import { GoalTrackingCard } from "@/components/Stats/GoalTrackingBar";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDecimalPlaces, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { useSellerStats } from "@/lib/queries/sellers";
import dayjs from "dayjs";
import { BadgeDollarSign, CirclePlus, Code, Mail, Pencil, Phone, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { BsCart, BsTicketPerforated } from "react-icons/bs";

type SellerPageProps = {
	user: TAuthUserSession["user"];
	id: string;
	/** usuarios.editar: sem ela o botão de editar some (a API recusa). */
	canEditSeller: boolean;
};
export default function SellerPage({ user, id, canEditSeller }: SellerPageProps) {
	const [editSellerMenuIsOpen, setEditSellerMenuIsOpen] = useState<boolean>(false);
	const {
		data: stats,
		isLoading,
		isError,
		isSuccess,
		error,
		filters,
		updateFilters,
	} = useSellerStats({
		sellerId: id,
		initialFilters: { periodAfter: dayjs().startOf("month").toISOString(), periodBefore: dayjs().endOf("month").toISOString() },
	});

	return (
		<div className="w-full h-full flex flex-col gap-3">
			<div className="w-full flex items-center justify-end gap-2">
				<div className="flex items-center gap-2">
					<DateIntervalInput
						label="Período"
						value={{
							after: filters.periodAfter ? new Date(filters.periodAfter) : undefined,
							before: filters.periodBefore ? new Date(filters.periodBefore) : undefined,
						}}
						handleChange={(value) => updateFilters({ periodAfter: value.after?.toISOString(), periodBefore: value.before?.toISOString() })}
					/>
				</div>
			</div>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				<>
					<div className="w-full flex items-center gap-2 flex-col md:flex-row">
						<div className="flex items-center justify-center w-full md:w-fit">
							<Avatar className="w-24 h-24 min-w-24 min-h-24">
								<AvatarImage src={stats.vendedor.avatarUrl ?? undefined} />
								<AvatarFallback>{formatNameAsInitials(stats.vendedor.nome)}</AvatarFallback>
							</Avatar>
						</div>
						<div className="flex flex-col gap-2 grow">
							<div className="w-full flex items-center justify-between gap-2">
								<h1 className="text-lg font-bold tracking-tight">{stats.vendedor.nome}</h1>
								{canEditSeller ? (
									<Button variant="ghost" className="flex items-center gap-2" onClick={() => setEditSellerMenuIsOpen(true)}>
										<Pencil className="w-4 min-w-4 h-4 min-h-4" />
										EDITAR
									</Button>
								) : null}
							</div>
							<div className="flex items-center gap-2">
								<Code className="w-4 min-w-4 h-4 min-h-4" />
								<p className="text-sm font-medium tracking-tight">{stats.vendedor.identificador ?? "IDENTIFICADOR NÃO INFORMADO"}</p>
							</div>
							<div className="w-full flex items-center gap-2 flex-wrap">
								<div className="flex items-center gap-2">
									<Mail className="w-4 min-w-4 h-4 min-h-4" />
									<p className="text-sm font-medium tracking-tight">{stats.vendedor.email ?? "EMAIL NÃO INFORMADO"}</p>
								</div>
								<div className="flex items-center gap-2">
									<Phone className="w-4 min-w-4 h-4 min-h-4" />
									<p className="text-sm font-medium tracking-tight">{stats.vendedor.telefone ?? "TELEFONE NÃO INFORMADO"}</p>
								</div>
							</div>
						</div>
					</div>
					<GoalTrackingCard
						valueGoal={stats.faturamentoMeta}
						valueHit={stats.faturamentoBrutoTotal}
						formattedValueGoal={stats.faturamentoMeta.toLocaleString("pt-br", { maximumFractionDigits: 2 })}
						formattedValueHit={stats.faturamentoBrutoTotal.toLocaleString("pt-br", { maximumFractionDigits: 2 })}
						goalText="Faturamento Meta"
						barHeight="25px"
						barClassName="bg-linear-to-r from-yellow-200 to-amber-400"
					/>
					<div className="w-full flex flex-col gap-2">
						<div className="flex w-full flex-col items-center justify-around gap-2 lg:flex-row">
							<StatUnitCard
								title="Número de Vendas"
								icon={<CirclePlus className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats.qtdeVendas || 0, format: (n) => formatDecimalPlaces(n) }}
								className="w-full lg:w-1/2"
							/>
							<StatUnitCard
								title="Faturamento"
								icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats.faturamentoBrutoTotal || 0, format: (n) => formatToMoney(n) }}
								className="w-full lg:w-1/2"
							/>
						</div>
						<div className="flex w-full flex-col items-center justify-around gap-2 lg:flex-row">
							<StatUnitCard
								title="Ticket Médio"
								icon={<BsTicketPerforated className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats.ticketMedio || 0, format: (n) => formatToMoney(n) }}
								className="w-full lg:w-1/2"
							/>
							<StatUnitCard
								title="Valor Diário Vendido"
								icon={<BsCart className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats.faturamentoBrutoPorDia || 0, format: (n) => formatToMoney(n) }}
								className="w-full lg:w-1/2"
							/>
							<StatUnitCard
								title="Média de Itens por Venda"
								icon={<ShoppingBag className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats.qtdeItensPorVendaMedio || 0, format: (n) => formatDecimalPlaces(n) }}
								className="w-full lg:w-1/2"
							/>
						</div>
					</div>
					<div className="flex w-full flex-col lg:flex-row gap-2 items-stretch">
						<div className="w-full lg:w-1/3">
							<SellerResultsByMonthDayBlock data={stats.resultadosAgrupados.dia} />
						</div>
						<div className="w-full lg:w-1/3">
							<SellerResultsByMonthBlock data={stats.resultadosAgrupados.mes} />
						</div>
						<div className="w-full lg:w-1/3">
							<SellerResultsByWeekDayBlock data={stats.resultadosAgrupados.diaSemana} />
						</div>
					</div>
					<div className="w-full">
						<WeeklyRevenueHeatmap.Frame hint="A intensidade da cor indica o volume de faturamento em cada horário. Passe o mouse para ver os detalhes.">
							<WeeklyRevenueHeatmap.WeekDayStrip
								data={stats.resultadosAgrupados.diaSemana.map((item) => ({ diaSemana: item.diaSemana, qtde: item.quantidade, total: item.total }))}
							/>
							<WeeklyRevenueHeatmap.Grid
								data={stats.resultadosAgrupados.diaSemanaHora.map((item) => ({
									diaSemana: item.diaSemana,
									hora: item.hora,
									qtde: item.quantidade,
									total: item.total,
								}))}
							/>
						</WeeklyRevenueHeatmap.Frame>
					</div>
					<div className="flex w-full flex-col lg:flex-row gap-2 items-stretch">
						<div className="w-full lg:w-1/3">
							<SellerTopProductsBlock data={stats.resultadosAgrupados.produto} />
						</div>
						<div className="w-full lg:w-1/3">
							<SellerTopClientsBlock data={stats.resultadosAgrupados.cliente} />
						</div>
						<div className="w-full lg:w-1/3">
							<SellerTopProductGroupsBlock data={stats.resultadosAgrupados.grupo} />
						</div>
					</div>
					{editSellerMenuIsOpen ? <EditSeller sellerId={id} user={user} closeModal={() => setEditSellerMenuIsOpen(false)} /> : null}
				</>
			) : null}
		</div>
	);
}
