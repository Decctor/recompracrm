import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useClientStatsById } from "@/lib/queries/clients";
import { useSales } from "@/lib/queries/sales";
import { isValidNumber } from "@/lib/validation";
import type { TGetClientStatsOutput } from "@/pages/api/clients/stats/by-client";
import type { TGetSalesOutputByClientId } from "@/pages/api/sales";
import type { TUserSession } from "@/schemas/users";
import dayjs from "dayjs";
import { BadgeDollarSign, Calendar, CirclePlus, ListFilter, Mail, Phone, ShoppingBag, UserRound } from "lucide-react";
import { useState } from "react";
import { BsCart, BsTicketPerforated } from "react-icons/bs";
import DateIntervalInput from "../Inputs/DateIntervalInput";
import ErrorComponent from "../Layouts/ErrorComponent";
import Header from "../Layouts/Header";
import LoadingComponent from "../Layouts/LoadingComponent";
import StatUnitCard from "../Stats/StatUnitCard";
import GeneralPaginationComponent from "../Utils/Pagination";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import ClientPurchasesFilterMenu from "./ClientPurchasesFilterMenu";

type ClientMainProps = {
	id: string;
	user: TAuthUserSession["user"];
};
export default function ClientMain({ id, user }: ClientMainProps) {
	const [purchasesFilterMenuIsOpen, setPurchasesFilterMenuIsOpen] = useState(false);
	const {
		data: stats,
		isLoading,
		isError,
		isSuccess,
		error,
		filters,
		updateFilters,
	} = useClientStatsById({
		clientId: id,
		initialFilters: { periodAfter: dayjs().startOf("month").toISOString(), periodBefore: dayjs().endOf("month").toISOString() },
	});
	const {
		data: purchasesResult,
		isLoading: isPurchasesLoading,
		isError: isPurchasesError,
		isSuccess: isPurchasesSuccess,
		error: purchasesError,
		params: purchasesParams,
		updateParams: updatePurchasesParams,
	} = useSales({
		initialParams: {
			page: 1,
			search: "",
			periodAfter: dayjs().startOf("month").toDate(),
			periodBefore: dayjs().endOf("month").toDate(),
			sellersIds: [],
			partnersIds: [],
			saleNatures: [],
			clientId: id,
			productGroups: [],
			productIds: [],
			totalMin: null,
			totalMax: null,
		},
	});
	const purchases = purchasesResult?.sales ?? [];
	const purchasesMatched = purchasesResult?.salesMatched ?? 0;
	const purchasesTotalPages = purchasesResult?.totalPages ?? 0;
	const purchasesShowing = purchases.length;

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;

	if (isSuccess)
		return (
			<>
				<div className="flex w-full items-center justify-between border-b border-primary pb-2 gap-2">
					<h1 className="text-base text-center lg:text-start lg:text-2xl font-black text-primary">Resultados do Cliente</h1>
					<div className="flex items-center justify-end">
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
				<div className="w-full flex flex-col gap-3">
					<div className="w-full flex items-center gap-2 flex-col md:flex-row">
						<div className="flex items-center justify-center w-full md:w-fit">
							<UserRound className="w-24 h-24 min-w-24 min-h-24" />
						</div>
						<div className="flex flex-col gap-2 grow">
							<div className="w-full flex items-center justify-between gap-2">
								<h1 className="text-lg font-bold tracking-tight">{stats?.cliente.nome}</h1>
							</div>

							<div className="w-full flex items-center gap-2 flex-wrap">
								<div className="flex items-center gap-2">
									<Mail className="w-4 min-w-4 h-4 min-h-4" />
									<p className="text-sm font-medium tracking-tight">{stats?.cliente.email ?? "EMAIL NÃO INFORMADO"}</p>
								</div>
								<div className="flex items-center gap-2">
									<Phone className="w-4 min-w-4 h-4 min-h-4" />
									<p className="text-sm font-medium tracking-tight">{stats?.cliente.telefone ?? "TELEFONE NÃO INFORMADO"}</p>
								</div>
							</div>
						</div>
					</div>

					<div className="w-full flex flex-col gap-2">
						<div className="flex w-full flex-col items-center justify-around gap-2 lg:flex-row">
							<StatUnitCard
								title="Número de Compras"
								icon={<CirclePlus className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats?.qtdeCompras || 0, format: (n) => formatDecimalPlaces(n) }}
								className="w-full lg:w-1/2"
							/>
							<StatUnitCard
								title="Valor Compro"
								icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats?.valorComproTotal || 0, format: (n) => formatToMoney(n) }}
								className="w-full lg:w-1/2"
							/>
						</div>
						<div className="flex w-full flex-col items-center justify-around gap-2 lg:flex-row">
							<StatUnitCard
								title="Ticket Médio"
								icon={<BsTicketPerforated className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats?.ticketMedio || 0, format: (n) => formatToMoney(n) }}
								className="w-full lg:w-1/2"
							/>
							<StatUnitCard
								title="Valor Diário Compro"
								icon={<BsCart className="w-4 h-4 min-w-4 min-h-4" />}
								current={{ value: stats?.valorComproGrupoPeriodo.dia || 0, format: (n) => formatToMoney(n) }}
								className="w-full lg:w-1/2"
							/>
						</div>
					</div>
					<div className="bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-4 py-4 shadow-2xs">
						<div className="flex w-full items-center justify-between gap-2">
							<h1 className="text-sm font-bold tracking-tight uppercase">Compras do Cliente</h1>
							<Button className="flex items-center gap-2" size="sm" onClick={() => setPurchasesFilterMenuIsOpen(true)}>
								<ListFilter className="w-4 h-4 min-w-4 min-h-4" />
								FILTROS
							</Button>
						</div>
						<GeneralPaginationComponent
							activePage={purchasesParams.page}
							queryLoading={isPurchasesLoading}
							selectPage={(page) => updatePurchasesParams({ page })}
							totalPages={purchasesTotalPages}
							itemsMatchedText={purchasesMatched > 1 ? `${purchasesMatched} compras encontradas.` : `${purchasesMatched} compra encontrada.`}
							itemsShowingText={purchasesShowing > 1 ? `Mostrando ${purchasesShowing} compras.` : `Mostrando ${purchasesShowing} compra.`}
						/>
						{isPurchasesLoading ? <LoadingComponent /> : null}
						{isPurchasesError ? <ErrorComponent msg={getErrorMessage(purchasesError)} /> : null}
						{isPurchasesSuccess && purchases.length > 0 ? purchases.map((sale) => <ClientPurchaseCard key={sale.id} sale={sale} />) : null}
						{isPurchasesSuccess && purchases.length === 0 ? <p className="w-full tracking-tight text-center">Nenhuma compra encontrada.</p> : null}
					</div>
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
					<div className="flex w-full flex-col lg:flex-row gap-2 items-stretch">
						<div className="w-full lg:w-1/3">
							<GroupedByProduct data={stats.resultadosAgrupados.produto} />
						</div>
						<div className="w-full lg:w-1/3">
							<GroupedBySeller data={stats.resultadosAgrupados.vendedor} />
						</div>
						<div className="w-full lg:w-1/3">
							<GroupedByProductGroup data={stats.resultadosAgrupados.grupo} />
						</div>
					</div>
				</div>
				{purchasesFilterMenuIsOpen ? (
					<ClientPurchasesFilterMenu
						queryParams={purchasesParams}
						updateQueryParams={updatePurchasesParams}
						closeMenu={() => setPurchasesFilterMenuIsOpen(false)}
					/>
				) : null}
			</>
		);

	return <></>;
}

function ClientPurchaseCard({ sale }: { sale: TGetSalesOutputByClientId["sales"][number] }) {
	return (
		<div className="bg-background border-primary/20 flex w-full flex-col gap-2 rounded-xl border px-3 py-3">
			<div className="flex w-full items-center justify-between gap-2">
				<h1 className="text-sm font-semibold tracking-tight uppercase">{sale.cliente?.nome ?? "AO CONSUMIDOR"}</h1>
				<h1 className="text-sm font-black text-primary">{formatToMoney(sale.valorTotal)}</h1>
			</div>
			<div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
				<span className="bg-secondary px-2 py-0.5 rounded-md">{formatDateAsLocale(sale.dataVenda, true)}</span>
				<span className="bg-secondary px-2 py-0.5 rounded-md">{sale.natureza}</span>
				{sale.vendedor?.nome ? <span className="bg-secondary px-2 py-0.5 rounded-md">{sale.vendedor.nome}</span> : null}
				{sale.parceiro?.nome ? <span className="bg-secondary px-2 py-0.5 rounded-md">{sale.parceiro.nome}</span> : null}
			</div>
			<p className="text-xs tracking-tight text-muted-foreground">{sale.itens.length} item(ns) na compra.</p>
		</div>
	);
}

function GroupedByMonthDay({ data }: { data: TGetClientStatsOutput["data"]["resultadosAgrupados"]["dia"] }) {
	// Calculate color intensity based on performance ranking
	const maxValue = Math.max(...data.map((item) => item.total), 0);
	const minValue = Math.min(...data.map((item) => item.total), 0);
	const range = maxValue - minValue;

	const bestDayIndex = data.length > 0 ? data.reduce((max, item) => (item.total > max.total ? item : max), data[0]).dia : null;
	const worstDayIndex = data.length > 0 ? data.reduce((min, item) => (item.total < min.total ? item : min), data[0]).dia : null;

	console.log("[INFO] [GROUPED_BY_MONTH_DAY] Best day index: ", bestDayIndex);
	console.log("[INFO] [GROUPED_BY_MONTH_DAY] Worst day index: ", worstDayIndex);

	function getDayResult(index: number) {
		return data.find((item) => item.dia === index + 1);
	}

	function getColorIntensity(value: number): number {
		if (range === 0) return 0.3;
		const normalized = (value - minValue) / range;
		// Map to 0.1 - 1.0 range for visibility
		return 0.1 + normalized * 0.9;
	}

	function DayCard({ index }: { index: number }) {
		const result = getDayResult(index);
		const intensity = result ? getColorIntensity(result.total) : 0;
		const bgColor = result ? `rgba(254, 173, 0, ${intensity})` : "transparent";
		const ticketMedio = result && result.quantidade > 0 ? result.total / result.quantidade : 0;

		return (
			<Tooltip delayDuration={200}>
				<TooltipTrigger asChild>
					<div
						key={index.toString()}
						className="flex flex-col items-center justify-center p-2 rounded-md border border-primary/20 w-full gap-1 min-h-[60px] transition-all hover:scale-[1.02] cursor-pointer"
						style={{ backgroundColor: bgColor }}
					>
						<h1 className="text-xs font-bold tracking-tight">{index + 1}</h1>
					</div>
				</TooltipTrigger>
				{result ? (
					<TooltipContent className="bg-primary text-primary-foreground p-3 min-w-[180px]">
						<div className="flex flex-col gap-2">
							<h3 className="text-sm font-semibold mb-1">DIA {index + 1}</h3>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-1">
									<CirclePlus className="w-5 h-5 min-w-5 min-h-5" />
									<span className="text-xs font-medium tracking-tight">VENDAS</span>
								</div>
								<span className="text-sm font-bold">{formatDecimalPlaces(result.quantidade)}</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-1">
									<BadgeDollarSign className="w-5 h-5 min-w-5 min-h-5" />
									<span className="text-xs font-medium tracking-tight">FATURAMENTO</span>
								</div>
								<span className="text-sm font-bold">{formatToMoney(result.total)}</span>
							</div>
							<div className="border-t border-primary-foreground/80 mt-1 pt-2 flex flex-col gap-1">
								<div className="flex items-center justify-between gap-4">
									<span className="text-xs font-medium tracking-tight">TICKET MÉDIO</span>
									<span className="text-sm font-bold">{formatToMoney(ticketMedio)}</span>
								</div>
							</div>
						</div>
					</TooltipContent>
				) : (
					<TooltipContent className="bg-primary text-primary-foreground p-3">
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
			<div className={"bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full"}>
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">POR DIA DO MÊS</h1>
					<div className="flex items-center gap-2">
						<Calendar className="w-4 h-4 min-w-4 min-h-4" />
					</div>
				</div>
				<div className="w-full flex flex-col gap-1">
					{isValidNumber(bestDayIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-green-100 text-green-600 text-xs rounded-lg font-medium">
							O dia preferido para compra foi {bestDayIndex}
						</div>
					) : null}
					{isValidNumber(worstDayIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-red-100 text-red-600 text-xs rounded-lg font-medium">
							O pior dia para compra foi {worstDayIndex}
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
function GroupedByMonth({ data }: { data: TGetClientStatsOutput["data"]["resultadosAgrupados"]["mes"] }) {
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

	// Calculate color intensity based on performance ranking
	const maxValue = Math.max(...data.map((item) => item.total), 0);
	const minValue = Math.min(...data.map((item) => item.total), 0);
	const range = maxValue - minValue;

	const bestMonthIndex = data.length > 0 ? data.reduce((max, item) => (item.total > max.total ? item : max), data[0]).mes : null;
	const worstMonthIndex = data.length > 0 ? data.reduce((min, item) => (item.total < min.total ? item : min), data[0]).mes : null;

	console.log("[INFO] [GROUPED_BY_MONTH] Best month index: ", bestMonthIndex);
	console.log("[INFO] [GROUPED_BY_MONTH] Worst month index: ", worstMonthIndex);

	function getMonthResult(index: number) {
		return data.find((item) => item.mes === index + 1);
	}

	function getColorIntensity(value: number): number {
		if (range === 0) return 0.3;
		const normalized = (value - minValue) / range;
		// Map to 0.1 - 1.0 range for visibility
		return 0.1 + normalized * 0.9;
	}

	function MonthCard({ index }: { index: number }) {
		const result = getMonthResult(index);
		const intensity = result ? getColorIntensity(result.total) : 0;
		const bgColor = result ? `rgba(254, 173, 0, ${intensity})` : "transparent";
		const ticketMedio = result && result.quantidade > 0 ? result.total / result.quantidade : 0;

		return (
			<Tooltip delayDuration={200}>
				<TooltipTrigger asChild>
					<div
						key={index.toString()}
						className="flex flex-col items-center justify-center p-3 rounded-md border border-primary/20 w-full gap-1 min-h-[70px] transition-all hover:scale-[1.02] cursor-pointer"
						style={{ backgroundColor: bgColor }}
					>
						<h1 className="text-xs font-bold tracking-tight uppercase">{MONTH_MAP[(index + 1) as keyof typeof MONTH_MAP]}</h1>
					</div>
				</TooltipTrigger>
				{result ? (
					<TooltipContent className="bg-primary text-primary-foreground p-3 min-w-[180px]">
						<div className="flex flex-col gap-2">
							<h3 className="text-sm font-semibold mb-1">{MONTH_MAP[(index + 1) as keyof typeof MONTH_MAP]}</h3>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-1">
									<CirclePlus className="w-5 h-5 min-w-5 min-h-5" />
									<span className="text-xs font-medium tracking-tight">VENDAS</span>
								</div>
								<span className="text-sm font-bold">{formatDecimalPlaces(result.quantidade)}</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-1">
									<BadgeDollarSign className="w-5 h-5 min-w-5 min-h-5" />
									<span className="text-xs font-medium tracking-tight">FATURAMENTO</span>
								</div>
								<span className="text-sm font-bold">{formatToMoney(result.total)}</span>
							</div>
							<div className="border-t border-primary-foreground/80 mt-1 pt-2 flex flex-col gap-1">
								<div className="flex items-center justify-between gap-4">
									<span className="text-xs font-medium tracking-tight">TICKET MÉDIO</span>
									<span className="text-sm font-bold">{formatToMoney(ticketMedio)}</span>
								</div>
							</div>
						</div>
					</TooltipContent>
				) : (
					<TooltipContent className="bg-primary text-primary-foreground p-3">
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
			<div className={"bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full"}>
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">POR MÊS</h1>
					<div className="flex items-center gap-2">
						<Calendar className="w-4 h-4 min-w-4 min-h-4" />
					</div>
				</div>
				<div className="w-full flex flex-col gap-1">
					{isValidNumber(bestMonthIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-green-100 text-green-600 text-xs rounded-lg font-medium">
							O mês preferido para compra foi {MONTH_MAP[bestMonthIndex as keyof typeof MONTH_MAP]}
						</div>
					) : null}

					{isValidNumber(worstMonthIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-red-100 text-red-600 text-xs rounded-lg font-medium">
							O pior mês para compra foi {MONTH_MAP[worstMonthIndex as keyof typeof MONTH_MAP]}
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
function GroupedByWeekDay({ data }: { data: TGetClientStatsOutput["data"]["resultadosAgrupados"]["diaSemana"] }) {
	const WEEKDAY_MAP = {
		0: "Domingo",
		1: "Segunda",
		2: "Terça",
		3: "Quarta",
		4: "Quinta",
		5: "Sexta",
		6: "Sábado",
	};

	// Calculate color intensity based on performance ranking
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
		// Map to 0.1 - 1.0 range for visibility
		return 0.1 + normalized * 0.9;
	}

	function WeekDayCard({ index }: { index: number }) {
		const result = getWeekDayResult(index);
		const intensity = result ? getColorIntensity(result.total) : 0;
		const bgColor = result ? `rgba(254, 173, 0, ${intensity})` : "transparent";
		const ticketMedio = result && result.quantidade > 0 ? result.total / result.quantidade : 0;

		return (
			<Tooltip delayDuration={200}>
				<TooltipTrigger asChild>
					<div
						key={index.toString()}
						className="flex flex-col items-center justify-center p-3 rounded-md border border-primary/20 w-full gap-1 min-h-[70px] transition-all hover:scale-[1.02] cursor-pointer"
						style={{ backgroundColor: bgColor }}
					>
						<h1 className="text-xs font-bold tracking-tight uppercase">{WEEKDAY_MAP[index as keyof typeof WEEKDAY_MAP]}</h1>
					</div>
				</TooltipTrigger>
				{result ? (
					<TooltipContent className="bg-primary text-primary-foreground p-3 min-w-[180px]">
						<div className="flex flex-col gap-2">
							<h3 className="text-sm font-semibold mb-1">{WEEKDAY_MAP[index as keyof typeof WEEKDAY_MAP]}</h3>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-1">
									<CirclePlus className="w-5 h-5 min-w-5 min-h-5" />
									<span className="text-xs font-medium tracking-tight">VENDAS</span>
								</div>
								<span className="text-sm font-bold">{formatDecimalPlaces(result.quantidade)}</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-1">
									<BadgeDollarSign className="w-5 h-5 min-w-5 min-h-5" />
									<span className="text-xs font-medium tracking-tight">FATURAMENTO</span>
								</div>
								<span className="text-sm font-bold">{formatToMoney(result.total)}</span>
							</div>
							<div className="border-t border-primary-foreground/80 mt-1 pt-2 flex flex-col gap-1">
								<div className="flex items-center justify-between gap-4">
									<span className="text-xs font-medium tracking-tight">TICKET MÉDIO</span>
									<span className="text-sm font-bold">{formatToMoney(ticketMedio)}</span>
								</div>
							</div>
						</div>
					</TooltipContent>
				) : (
					<TooltipContent className="bg-primary text-primary-foreground p-3">
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
			<div className={"bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full"}>
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">POR DIA DA SEMANA</h1>
					<div className="flex items-center gap-2">
						<Calendar className="w-4 h-4 min-w-4 min-h-4" />
					</div>
				</div>
				<div className="w-full flex flex-col gap-1">
					{isValidNumber(bestDayIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-green-100 text-green-600 text-xs rounded-lg font-medium">
							O dia da semana preferido para compra foi {WEEKDAY_MAP[bestDayIndex as keyof typeof WEEKDAY_MAP]}
						</div>
					) : null}
					{isValidNumber(worstDayIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-red-100 text-red-600 text-xs rounded-lg font-medium">
							O pior dia da semana para compra foi {WEEKDAY_MAP[worstDayIndex as keyof typeof WEEKDAY_MAP]}
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

function GroupedByProduct({ data }: { data: TGetClientStatsOutput["data"]["resultadosAgrupados"]["produto"] }) {
	const [sortMode, setSortMode] = useState<"value" | "quantity">("value");

	const sortedData = [...data].sort((a, b) => {
		if (sortMode === "value") {
			return b.total - a.total;
		}
		return b.quantidade - a.quantidade;
	});

	function ProductCard({
		index,
		product,
		mode,
	}: { index: number; product: TGetClientStatsOutput["data"]["resultadosAgrupados"]["produto"][number]; mode: "value" | "quantity" }) {
		return (
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-1 flex-1 min-w-0">
					<div className="w-6 h-6 min-w-6 min-h-6 rounded-full flex items-center justify-center border border-primary text-xs">{index + 1}º</div>
					<h1 className="text-xs font-medium tracking-tight uppercase truncate">{product.produtoDescricao}</h1>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs font-bold tracking-tight">
						{mode === "value" ? formatToMoney(product.total) : formatDecimalPlaces(product.quantidade)}
					</span>
				</div>
			</div>
		);
	}
	return (
		<TooltipProvider>
			<div className={"bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full"}>
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">TOP 10 PRODUTOS</h1>
					<div className="flex items-center gap-2">
						<ShoppingBag className="w-4 h-4 min-w-4 min-h-4" />
					</div>
				</div>
				<div className="flex items-center gap-1 w-full">
					<button
						type="button"
						onClick={() => setSortMode("value")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "value" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
						}`}
					>
						VALOR
					</button>
					<button
						type="button"
						onClick={() => setSortMode("quantity")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "quantity" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
						}`}
					>
						QUANTIDADE
					</button>
				</div>
				<div className="w-full flex flex-col gap-2">
					{sortedData.slice(0, 10).map((item, index) => (
						<ProductCard key={item.produtoId} index={index} product={item} mode={sortMode} />
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}

function GroupedBySeller({ data }: { data: TGetClientStatsOutput["data"]["resultadosAgrupados"]["vendedor"] }) {
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
	}: { index: number; client: TGetClientStatsOutput["data"]["resultadosAgrupados"]["vendedor"][number]; mode: "value" | "quantity" }) {
		return (
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-1 flex-1 min-w-0">
					<div className="w-6 h-6 min-w-6 min-h-6 rounded-full flex items-center justify-center border border-primary text-xs">{index + 1}º</div>
					<h1 className="text-xs font-medium tracking-tight uppercase truncate">{client.vendedorNome ?? "VENDEDOR NÃO INFORMADO"}</h1>
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
			<div className={"bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full"}>
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">TOP 10 VENDEDORES</h1>
					<div className="flex items-center gap-2">
						<UserRound className="w-4 h-4 min-w-4 min-h-4" />
					</div>
				</div>
				<div className="flex items-center gap-1 w-full">
					<button
						type="button"
						onClick={() => setSortMode("value")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "value" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
						}`}
					>
						VALOR
					</button>
					<button
						type="button"
						onClick={() => setSortMode("quantity")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "quantity" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
						}`}
					>
						QUANTIDADE
					</button>
				</div>
				<div className="w-full flex flex-col gap-2">
					{sortedData.slice(0, 10).map((item, index) => (
						<ClientCard key={item.vendedorId} index={index} client={item} mode={sortMode} />
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}

function GroupedByProductGroup({ data }: { data: TGetClientStatsOutput["data"]["resultadosAgrupados"]["grupo"] }) {
	const [sortMode, setSortMode] = useState<"value" | "quantity">("value");

	const sortedData = [...data].sort((a, b) => {
		if (sortMode === "value") {
			return b.total - a.total;
		}
		return b.quantidade - a.quantidade;
	});

	function ProductGroupCard({
		index,
		productGroup,
		mode,
	}: { index: number; productGroup: TGetClientStatsOutput["data"]["resultadosAgrupados"]["grupo"][number]; mode: "value" | "quantity" }) {
		return (
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-1 flex-1 min-w-0">
					<div className="w-6 h-6 min-w-6 min-h-6 rounded-full flex items-center justify-center border border-primary text-xs">{index + 1}º</div>
					<h1 className="text-xs font-medium tracking-tight uppercase truncate">{productGroup.grupo}</h1>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs font-bold tracking-tight">
						{mode === "value" ? formatToMoney(productGroup.total) : formatDecimalPlaces(productGroup.quantidade)}
					</span>
				</div>
			</div>
		);
	}
	return (
		<TooltipProvider>
			<div className={"bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs h-full"}>
				<div className="flex items-center justify-between">
					<h1 className="text-xs font-medium tracking-tight uppercase">TOP 10 GRUPOS DE PRODUTO</h1>
					<div className="flex items-center gap-2">
						<ShoppingBag className="w-4 h-4 min-w-4 min-h-4" />
					</div>
				</div>
				<div className="flex items-center gap-1 w-full">
					<button
						type="button"
						onClick={() => setSortMode("value")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "value" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
						}`}
					>
						VALOR
					</button>
					<button
						type="button"
						onClick={() => setSortMode("quantity")}
						className={`px-2 py-1 text-[10px] font-medium tracking-tight rounded transition-colors ${
							sortMode === "quantity" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
						}`}
					>
						QUANTIDADE
					</button>
				</div>
				<div className="w-full flex flex-col gap-2">
					{sortedData.slice(0, 10).map((item, index) => (
						<ProductGroupCard key={item.grupo} index={index} productGroup={item} mode={sortMode} />
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}
