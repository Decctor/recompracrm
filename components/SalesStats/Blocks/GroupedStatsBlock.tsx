import { hexToRgba, useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { formatDateAsLocale, formatDecimalPlaces, formatLongString, formatNameAsInitials } from "@/lib/formatting";
import { formatToMoney } from "@/lib/formatting";
import { useGroupedSalesStats } from "@/lib/queries/stats/grouped";
import type { TGroupedSalesStats } from "@/pages/api/stats/sales-grouped";
import type { TSaleStatsGeneralQueryParams } from "@/schemas/query-params-utils";
import { useEffect, useMemo, useState } from "react";
import { useDebounce } from "use-debounce";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { getExcelFromJSON } from "@/lib/excel-utils";
import { isValidNumber } from "@/lib/validation";
import { BadgeDollarSign, Calendar, CirclePlus, Download, Flame } from "lucide-react";
import { FaRankingStar } from "react-icons/fa6";
import { VariableSizeList as List, VariableSizeList } from "react-window";
import { Bar, BarChart, LabelList, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
type GroupedStatsBlockProps = {
	generalQueryParams: TSaleStatsGeneralQueryParams;
	user: TAuthUserSession["user"];
	userOrg: NonNullable<TAuthUserSession["membership"]>["organizacao"];
};
function GroupedStatsBlock({ generalQueryParams, user, userOrg }: GroupedStatsBlockProps) {
	const [queryParams, setQueryParams] = useState<TSaleStatsGeneralQueryParams>(generalQueryParams);

	const [debouncedQueryParams] = useDebounce(queryParams, 1000);

	const { data: groupedStats, isLoading: groupedStatsLoading } = useGroupedSalesStats(debouncedQueryParams);

	useEffect(() => {
		setQueryParams(generalQueryParams);
	}, [generalQueryParams]);
	return (
		<div className="w-full flex flex-col gap-2 py-2">
			<div className="w-full flex flex-col items-center gap-2 lg:flex-row">
				<div className="w-full lg:w-[50%]">
					<ResultsByPartnerGraph data={groupedStats?.porParceiro || []} />
				</div>
				<div className="w-full lg:w-[50%]">
					<ResultsBySellerGraph data={groupedStats?.porVendedor || []} />
				</div>
			</div>
			{userOrg?.assinaturaPlano === "CRESCIMENTO" ? (
				<div className="w-full flex flex-col items-center gap-2 lg:flex-row">
					<div className="w-full lg:w-[50%]">
						<ResultsByItemGraph data={groupedStats?.porItem || []} />
					</div>
					<div className="w-full lg:w-[50%]">
						<ResultsByProductGroupGraph data={groupedStats?.porGrupo || []} />
					</div>
				</div>
			) : null}

			<div className="w-full flex flex-col items-center gap-2 lg:flex-row">
				<div className="w-full lg:w-[50%]">
					<ResultsByChannelGraph data={groupedStats?.porCanal || []} />
				</div>
				<div className="w-full lg:w-[50%]">
					<ResultsByFulfillmentMethodGraph data={groupedStats?.porEntregaModalidade || []} />
				</div>
			</div>

			<div className="flex w-full flex-col lg:flex-row gap-2 items-stretch">
				<div className="w-full lg:w-1/2">
					<GroupedByMonthDay data={groupedStats?.porDiaDoMes || []} />
				</div>
				<div className="w-full lg:w-1/2">
					<GroupedByMonth data={groupedStats?.porMes || []} />
				</div>
			</div>
			<div className="w-full">
				<WeeklyStatsBlock
					porDiaDaSemana={groupedStats?.porDiaDaSemana || []}
					porDiaSemanaHora={groupedStats?.porDiaSemanaHora || []}
					period={queryParams.period}
				/>
			</div>
		</div>
	);
}

export default GroupedStatsBlock;

/// [TODO   ] VIRTUALIZE LIST OF PRODUCTS
function ResultsByItemGraph({ data }: { data: TGroupedSalesStats["porItem"] }) {
	const [type, setType] = useState<"qtde" | "total">("total");
	const dataSorted = data.sort((a, b) => (type === "total" ? b.total - a.total : b.qtde - a.qtde));

	const maxValue = useMemo(() => {
		if (data.length === 0) return 0;
		return Math.max(...data.map((item) => (type === "total" ? item.total : item.qtde)));
	}, [data, type]);

	async function handleExportData(data: TGroupedSalesStats["porItem"] | undefined) {
		try {
			if (!data) throw new Error("Não há dados para exportar");
			const exportationJSON = data.map((item) => ({
				ITEM: item.titulo,
				"VALOR VENDIDO": item.total,
				"Nº DE VENDAS": item.qtde,
			}));
			getExcelFromJSON(exportationJSON, "RESULTADOS_POR_ITEM.xlsx");
			return toast.success("Dados exportados com sucesso");
		} catch (error) {
			const msg = getErrorMessage(error);
			return toast.error(msg);
		}
	}
	const ProductsList = ({
		height,
		width,
		list,
	}: {
		height: number | string;
		width: number | string;
		list: TGroupedSalesStats["porItem"];
	}) => (
		<VariableSizeList
			height={height}
			width={width}
			itemCount={list ? list.length : 0}
			itemSize={(index) => 30} // Adjust the item height as needed
			className="overflow-y-auto overscroll-y-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30"
		>
			{({ index, style }) => {
				const value = type === "total" ? list[index].total : list[index].qtde;
				const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
				return (
					<div style={style} key={`${list[index].titulo}-${index}`} className="w-full">
						<HoverCard>
							<HoverCardTrigger asChild>
								<div className="flex items-center gap-4 w-full hover:bg-primary/10 rounded-lg transition-all px-2 py-0.5">
									<div className="flex items-center gap-3 w-[250px] min-w-[250px]">
										<span className="text-xs font-bold text-muted-foreground w-6">#{index + 1}</span>

										<div className="flex items-center gap-2 cursor-pointer">
											<div className="flex flex-col">
												<span className="text-sm font-medium truncate max-w-[150px] leading-none" title={list[index].titulo}>
													{list[index].titulo}
												</span>
												{/* <span className="text-[0.6rem] text-muted-foreground">ID: {list[index].identificador}</span> */}
											</div>
										</div>
									</div>

									<div className="flex-1 flex flex-col justify-center h-full">
										<Progress value={percentage} className="h-2 w-full" />
									</div>

									<div className="w-[100px] text-right font-bold text-sm">{type === "total" ? formatToMoney(value) : value}</div>
								</div>
							</HoverCardTrigger>
							<HoverCardContent className="flex flex-col w-80">
								<div className="w-full flex items-center gap-2">
									<h2 className="text-sm font-semibold">{list[index].titulo}</h2>
								</div>
								<div className="w-full flex flex-col gap-1">
									<div className="w-full flex items-center gap-2 justify-between">
										<p className="text-xs text-muted-foreground">Nº DE VENDAS</p>
										<p className="text-xs font-medium">{list[index].qtde}</p>
									</div>
									<div className="w-full flex items-center gap-2 justify-between">
										<p className="text-xs text-muted-foreground">VALOR VENDIDO</p>
										<p className="text-xs font-medium">{formatToMoney(list[index].total)}</p>
									</div>
									<div className="w-full flex items-center gap-2 justify-between">
										<p className="text-xs text-muted-foreground">TICKET MÉDIO</p>
										<p className="text-xs font-medium">{formatToMoney(list[index].total / list[index].qtde)}</p>
									</div>
								</div>
							</HoverCardContent>
						</HoverCard>
					</div>
				);
			}}
		</VariableSizeList>
	);

	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex items-center justify-between">
				<h1 className="text-xs font-medium tracking-tight uppercase">PARTICIPAÇÃO POR ITEM</h1>
				<div className="flex items-center gap-2">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={"ghost"} size="fit" className="rounded-lg p-2" onClick={() => handleExportData(data)}>
									<Download className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Baixar</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={type === "total" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setType("total")}>
									<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Valor Vendido</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={type === "qtde" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setType("qtde")}>
									<CirclePlus className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Quantidade de Vendas</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>
			<div className="px-6 py-2 flex w-full flex-col gap-2 h-[300px] lg:h-[350px] max-h-[300px] lg:max-h-[350px] items-center justify-center overflow-y-auto overscroll-y-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
				<ProductsList height={330} width={"100%"} list={dataSorted} />
			</div>
		</div>
	);
}

function ResultsByProductGroupGraph({ data }: { data: TGroupedSalesStats["porGrupo"] }) {
	const [type, setType] = useState<"qtde" | "total">("total");
	const { colors } = useOrgColors();

	async function handleExportData(data: TGroupedSalesStats["porGrupo"] | undefined) {
		try {
			if (!data) throw new Error("Não há dados para exportar");
			const exportationJSON = data.map((item) => ({
				GRUPO: item.titulo,
				"VALOR VENDIDO": item.total,
				"Nº DE VENDAS": item.qtde,
			}));
			getExcelFromJSON(exportationJSON, "RESULTADOS_POR_GRUPO.xlsx");
			return toast.success("Dados exportados com sucesso");
		} catch (error) {
			const msg = getErrorMessage(error);
			return toast.error(msg);
		}
	}
	const chartColorsList = useMemo(() => [colors.secondary, colors.primary, "#ff595e", "#8ac926", "#6a4c93", "#5adbff"], [colors]);
	const total = useMemo(() => data.reduce((acc, current) => (type === "total" ? acc + current.total : acc + current.qtde), 0), [data, type]);
	const graphData = useMemo(
		() =>
			data
				.filter((d) => d.qtde > 100)
				.sort((a, b) => b.qtde - a.qtde)
				.map((p, index) => ({ ...p, fill: chartColorsList[index] || "#000" })),
		[data, chartColorsList],
	);
	const projectTypesChartConfig = { titulo: { label: "GRUPO" } };
	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex items-center justify-between">
				<h1 className="text-xs font-medium tracking-tight uppercase">PARTICIPAÇÃO POR GRUPO</h1>
				<div className="flex items-center gap-2">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={"ghost"} size="fit" className="rounded-lg p-2" onClick={() => handleExportData(data)}>
									<Download className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Baixar</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={type === "total" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setType("total")}>
									<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Valor Vendido</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={type === "qtde" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setType("qtde")}>
									<CirclePlus className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Quantidade de Vendas</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>
			<div className="px-6 py-2 flex w-full flex-col gap-2 h-[300px] lg:h-[350px] max-h-[300px] lg:max-h-[350px] items-center justify-center">
				<ChartContainer config={projectTypesChartConfig} className="h-[250px] w-[250px]">
					<PieChart>
						<ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
						<Pie
							data={graphData}
							dataKey={type}
							nameKey="titulo"
							label={(x) => {
								return `${formatDecimalPlaces((100 * (x.value as number)) / total)}%`;
							}}
							innerRadius={60}
							strokeWidth={2}
						/>
						<ChartLegend
							content={<ChartLegendContent payload={graphData} verticalAlign="bottom" />}
							className="-translate-y-2 flex-wrap gap-2 *:basis-1/4 *:justify-center"
						/>
					</PieChart>
				</ChartContainer>
			</div>
		</div>
	);
}

function ResultsBySellerGraph({ data }: { data: TGroupedSalesStats["porVendedor"] }) {
	const [type, setType] = useState<"qtde" | "total">("total");

	console.log("ResultsBySellerGraph data", data);
	const dataSorted = useMemo(() => [...data].sort((a, b) => (type === "total" ? b.total - a.total : b.qtde - a.qtde)), [data, type]);

	const maxValue = useMemo(() => {
		if (data.length === 0) return 0;
		return Math.max(...data.map((item) => (type === "total" ? item.total : item.qtde)));
	}, [data, type]);

	async function handleExportData(data: TGroupedSalesStats["porVendedor"] | undefined) {
		try {
			if (!data) throw new Error("Não há dados para exportar");
			const exportationJSON = data.map((item) => ({
				"NOME DO VENDEDOR": item.vendedor.nome,
				"VALOR VENDIDO": item.total,
				"Nº DE VENDAS": item.qtde,
			}));
			getExcelFromJSON(exportationJSON, "RESULTADOS_POR_VENDEDOR.xlsx");
			return toast.success("Dados exportados com sucesso");
		} catch (error) {
			const msg = getErrorMessage(error);
			return toast.error(msg);
		}
	}

	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex items-center justify-between">
				<h1 className="text-xs font-medium tracking-tight uppercase">RANKING DE VENDEDORES</h1>
				<div className="flex items-center gap-2">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={"ghost"} size="fit" className="rounded-lg p-2" onClick={() => handleExportData(data)}>
									<Download className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Baixar</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={type === "total" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setType("total")}>
									<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Valor Vendido</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={type === "qtde" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setType("qtde")}>
									<CirclePlus className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Quantidade de Vendas</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>

			<ScrollArea className="h-[450px] w-full pr-4">
				<div className="flex flex-col gap-4 py-2">
					{dataSorted.map((item, index) => {
						const value = type === "total" ? item.total : item.qtde;
						const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
						console.log("VENDEDOR: ", item.vendedor);

						return (
							<HoverCard key={item.vendedor.id}>
								<HoverCardTrigger asChild>
									<div key={item.vendedor.id} className="flex items-center gap-4 w-full group">
										<div className="flex items-center gap-3 w-[250px] min-w-[250px]">
											<span className="text-xs font-bold text-muted-foreground w-6">#{index + 1}</span>

											<div className="flex items-center gap-2 cursor-pointer">
												<Avatar className="h-9 w-9 border-2 border-transparent group-hover:border-primary transition-colors">
													<AvatarImage src={item.vendedor.avatarUrl || undefined} alt={item.vendedor.nome} />
													<AvatarFallback className="font-bold text-primary">{formatNameAsInitials(item.vendedor.nome)}</AvatarFallback>
												</Avatar>
												<div className="flex flex-col">
													<span className="text-sm font-medium truncate max-w-[150px] leading-none" title={item.vendedor.nome}>
														{item.vendedor.nome}
													</span>
													<span className="text-[0.6rem] text-muted-foreground">ID: {item.vendedor.identificador}</span>
												</div>
											</div>
										</div>

										<div className="flex-1 flex flex-col justify-center h-full">
											<Progress value={percentage} className="h-2 w-full" />
										</div>

										<div className="w-[100px] text-right font-bold text-sm">{type === "total" ? formatToMoney(value) : value}</div>
									</div>
								</HoverCardTrigger>
								<HoverCardContent className="flex flex-col w-80">
									<div className="w-full flex items-center gap-2">
										<Avatar className="h-12 w-12 min-h-12 min-w-12">
											<AvatarImage src={item.vendedor.avatarUrl || undefined} />
											<AvatarFallback>{formatNameAsInitials(item.vendedor.nome)}</AvatarFallback>
										</Avatar>
										<h2 className="text-sm font-semibold">{item.vendedor.nome}</h2>
									</div>
									<div className="w-full flex flex-col gap-1">
										<div className="w-full flex items-center gap-2 justify-between">
											<p className="text-xs text-muted-foreground">IDENTIFICADOR</p>
											<p className="text-xs font-medium">{item.vendedor.identificador}</p>
										</div>
										<div className="w-full flex items-center gap-2 justify-between">
											<p className="text-xs text-muted-foreground">Nº DE VENDAS</p>
											<p className="text-xs font-medium">{item.qtde}</p>
										</div>
										<div className="w-full flex items-center gap-2 justify-between">
											<p className="text-xs text-muted-foreground">VALOR VENDIDO</p>
											<p className="text-xs font-medium">{formatToMoney(item.total)}</p>
										</div>
										<div className="w-full flex items-center gap-2 justify-between">
											<p className="text-xs text-muted-foreground">TICKET MÉDIO</p>
											<p className="text-xs font-medium">{formatToMoney(item.total / item.qtde)}</p>
										</div>
									</div>
								</HoverCardContent>
							</HoverCard>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
}
function ResultsByPartnerGraph({ data }: { data: TGroupedSalesStats["porParceiro"] }) {
	const [type, setType] = useState<"qtde" | "total">("total");

	async function handleExportData(data: TGroupedSalesStats["porParceiro"] | undefined) {
		try {
			if (!data) throw new Error("Não há dados para exportar");
			const exportationJSON = data.map((item) => ({
				"CPF-CPNJ DO PARCEIRO": item.parceiro.identificador,
				"VALOR VENDIDO": item.total,
				"Nº DE VENDAS": item.qtde,
				"ÚLTIMA COMPRA": item.ultimaCompra ? formatDateAsLocale(item.ultimaCompra) : "N/A",
				"VENDEDOR MAIS FREQUENTE": item.vendedorMaisFrequente,
				"DATA DE CADASTRO": item.tempoAtividade ? formatDateAsLocale(item.tempoAtividade) : "N/A",
			}));
			getExcelFromJSON(exportationJSON, "RESULTADOS_POR_PARCEIRO.xlsx");
			return toast.success("Dados exportados com sucesso");
		} catch (error) {
			const msg = getErrorMessage(error);
			return toast.error(msg);
		}
	}
	const dataSorted = useMemo(() => [...data].sort((a, b) => (type === "total" ? b.total - a.total : b.qtde - a.qtde)), [data, type]);

	const maxValue = useMemo(() => {
		if (data.length === 0) return 0;
		return Math.max(...data.map((item) => (type === "total" ? item.total : item.qtde)));
	}, [data, type]);

	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex items-center justify-between">
				<h1 className="text-xs font-medium tracking-tight uppercase">RANKING DE PARCEIROS</h1>
				<div className="flex items-center gap-2">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={"ghost"} size="fit" className="rounded-lg p-2" onClick={() => handleExportData(data)}>
									<Download className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Baixar</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={type === "total" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setType("total")}>
									<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Valor Vendido</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={type === "qtde" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setType("qtde")}>
									<CirclePlus className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Quantidade de Vendas</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>

			<ScrollArea className="h-[450px] w-full pr-4">
				<div className="flex flex-col gap-4 py-2">
					{dataSorted.map((item, index) => {
						const value = type === "total" ? item.total : item.qtde;
						const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;

						return (
							<HoverCard key={item.parceiro.id}>
								<HoverCardTrigger asChild>
									<div className="flex items-center gap-4 w-full hover:bg-primary/10 rounded-lg transition-all px-2 py-">
										<div className="flex items-center gap-3 w-fit min-w-fit lg:w-[250px] lg:min-w-[250px]">
											<span className="text-xs font-bold text-muted-foreground w-6">#{index + 1}</span>
											<div className="flex items-center gap-2 cursor-pointer">
												<Avatar className="h-9 w-9 border-2 border-transparent transition-colors">
													<AvatarImage src={item.parceiro.avatarUrl || undefined} alt={item.parceiro.nome} />
													<AvatarFallback className="font-bold text-primary">{formatNameAsInitials(item.parceiro.nome)}</AvatarFallback>
												</Avatar>
												<div className="flex flex-col">
													<span className="text-sm font-medium truncate max-w-[150px] leading-none" title={item.parceiro.nome}>
														{item.parceiro.nome}
													</span>
													<span className="text-[0.6rem] text-muted-foreground">ID: {item.parceiro.identificador}</span>
												</div>
											</div>
										</div>

										<div className="hidden lg:flex flex-1 flex-col justify-center h-full">
											<Progress value={percentage} className="h-2 w-full" />
										</div>

										<div className="w-fit lg:w-[100px] text-right font-bold text-sm">{type === "total" ? formatToMoney(value) : value}</div>
									</div>
								</HoverCardTrigger>
								<HoverCardContent className="flex flex-col w-80">
									<div className="w-full flex items-center gap-2">
										<Avatar className="h-12 w-12 min-h-12 min-w-12">
											<AvatarImage src={item.parceiro.avatarUrl || undefined} />
											<AvatarFallback>{formatNameAsInitials(item.parceiro.nome)}</AvatarFallback>
										</Avatar>
										<h2 className="text-sm font-semibold">{item.parceiro.nome}</h2>
									</div>
									<div className="w-full flex flex-col gap-1">
										<div className="w-full flex items-center gap-2 justify-between">
											<p className="text-xs text-muted-foreground">IDENTIFICADOR</p>
											<p className="text-xs font-medium">{item.parceiro.identificador}</p>
										</div>
										<div className="w-full flex items-center gap-2 justify-between">
											<p className="text-xs text-muted-foreground">CPF/CNPJ</p>
											<p className="text-xs font-medium">{item.parceiro.cpfCnpj}</p>
										</div>
										<div className="w-full flex items-center gap-2 justify-between">
											<p className="text-xs text-muted-foreground">Nº DE VENDAS</p>
											<p className="text-xs font-medium">{item.qtde}</p>
										</div>
										<div className="w-full flex items-center gap-2 justify-between">
											<p className="text-xs text-muted-foreground">VALOR VENDIDO</p>
											<p className="text-xs font-medium">{formatToMoney(item.total)}</p>
										</div>
										<div className="w-full flex items-center gap-2 justify-between">
											<p className="text-xs text-muted-foreground">TICKET MÉDIO</p>
											<p className="text-xs font-medium">{formatToMoney(item.total / item.qtde)}</p>
										</div>
									</div>
								</HoverCardContent>
							</HoverCard>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
}

type WeeklyStatsBlockProps = {
	porDiaDaSemana: TGroupedSalesStats["porDiaDaSemana"];
	porDiaSemanaHora: TGroupedSalesStats["porDiaSemanaHora"];
	period: TSaleStatsGeneralQueryParams["period"];
};

function WeeklyStatsBlock({ porDiaDaSemana, porDiaSemanaHora, period }: WeeklyStatsBlockProps) {
	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs min-h-[420px]">
			<div className="flex items-center justify-between">
				<h1 className="text-xs font-medium tracking-tight uppercase">ANÁLISE DE FATURAMENTO SEMANAL</h1>
				<div className="flex items-center gap-2">
					<Flame className="w-4 h-4 min-w-4 min-h-4" />
				</div>
			</div>

			<p className="text-[0.65rem] text-muted-foreground italic shrink-0">
				A intensidade da cor indica o volume de faturamento em cada horário. Passe o mouse sobre as células para ver os detalhes.
			</p>
			{/* Faixa resumo por dia (7 células) + Heatmap (ocupa espaço restante) */}
			<div className="flex flex-col gap-3 flex-1 min-h-0">
				<GroupedByWeekDayStrip data={porDiaDaSemana} />
				<div className="flex-1 min-h-0 flex flex-col overflow-x-auto overflow-y-hidden">
					<RevenueHeatmapCore data={porDiaSemanaHora} />
				</div>
			</div>
		</div>
	);
}

/** Faixa horizontal com 7 dias: total por dia da semana (resumo acima do heatmap) */
function GroupedByWeekDayStrip({ data }: { data: TGroupedSalesStats["porDiaDaSemana"] }) {
	const { colors } = useOrgColors();
	const maxValue = Math.max(...data.map((item) => item.total), 0);
	const minValue = Math.min(...data.map((item) => item.total), 0);
	const range = maxValue - minValue;

	function getWeekDayResult(index: number) {
		return data.find((item) => Number(item.diaSemana) === index);
	}

	function getColorIntensity(value: number): number {
		if (range === 0) return 0.3;
		const normalized = (value - minValue) / range;
		return 0.1 + normalized * 0.9;
	}

	function DayCell({ index }: { index: number }) {
		const result = getWeekDayResult(index);
		const intensity = result ? getColorIntensity(result.total) : 0;
		const bgColor = result ? hexToRgba(colors.primary, intensity) : "rgba(0,0,0,0.03)";
		const ticketMedio = result && result.qtde > 0 ? result.total / result.qtde : 0;

		return (
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<div
						className="flex flex-col items-center justify-center py-2 px-1 rounded-md border border-primary/20 min-h-[44px] min-w-0 flex-1 transition-all hover:scale-[1.02] cursor-pointer"
						style={{ backgroundColor: bgColor }}
					>
						<span className="text-[0.6rem] font-bold tracking-tight uppercase">{WEEKDAY_MAP_HEATMAP[index as keyof typeof WEEKDAY_MAP_HEATMAP]}</span>
						{result ? (
							<span className="text-[0.6rem] font-medium text-primary/80 truncate max-w-full text-center">{formatToMoney(result.total)}</span>
						) : (
							<span className="text-[0.6rem] text-primary/80">—</span>
						)}
					</div>
				</TooltipTrigger>
				{result ? (
					<TooltipContent className="bg-primary text-primary-foreground p-3 min-w-[180px]">
						<div className="flex flex-col gap-2">
							<h3 className="text-sm font-semibold mb-1">{WEEKDAY_MAP_FULL[index as keyof typeof WEEKDAY_MAP_FULL]}</h3>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-1">
									<CirclePlus className="w-5 h-5 min-w-5 min-h-5" />
									<span className="text-xs font-medium tracking-tight">VENDAS</span>
								</div>
								<span className="text-sm font-bold">{formatDecimalPlaces(result.qtde)}</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-1">
									<BadgeDollarSign className="w-5 h-5 min-w-5 min-h-5" />
									<span className="text-xs font-medium tracking-tight">FATURAMENTO</span>
								</div>
								<span className="text-sm font-bold">{formatToMoney(result.total)}</span>
							</div>
							<div className="border-t border-primary-foreground/80 mt-1 pt-2">
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
							<h3 className="text-sm font-semibold">{WEEKDAY_MAP_FULL[index as keyof typeof WEEKDAY_MAP_FULL]}</h3>
							<span className="text-xs">SEM DADOS</span>
						</div>
					</TooltipContent>
				)}
			</Tooltip>
		);
	}

	return (
		<TooltipProvider>
			<div className="flex gap-1.5 w-full">
				{[0, 1, 2, 3, 4, 5, 6].map((diaIndex) => (
					<DayCell key={WEEKDAY_MAP_HEATMAP[diaIndex as keyof typeof WEEKDAY_MAP_HEATMAP]} index={diaIndex} />
				))}
			</div>
		</TooltipProvider>
	);
}

const WEEKDAY_MAP_HEATMAP = {
	0: "Dom",
	1: "Seg",
	2: "Ter",
	3: "Qua",
	4: "Qui",
	5: "Sex",
	6: "Sáb",
} as const;

function formatHourLabel(hour: number): string {
	return `${hour}:00`;
	// if (hour === 0) return "12a";
	// if (hour <= 11) return `${hour}a`;
	// if (hour === 12) return "12p";
	// return `${hour - 12}p`;
}

/** Grid do heatmap (sem card): dias x horas */
function RevenueHeatmapCore({ data }: { data: TGroupedSalesStats["porDiaSemanaHora"] }) {
	const { colors } = useOrgColors();
	const dataMap = useMemo(() => {
		const map = new Map<string, { qtde: number; total: number }>();
		for (const item of data) {
			map.set(`${item.diaSemana}-${item.hora}`, { qtde: item.qtde, total: item.total });
		}
		return map;
	}, [data]);

	const maxTotal = useMemo(() => (data.length > 0 ? Math.max(...data.map((d) => d.total)) : 0), [data]);

	function getCellValue(diaSemana: number, hora: number) {
		return dataMap.get(`${diaSemana}-${hora}`);
	}

	function getColorIntensity(value: number): number {
		if (maxTotal === 0) return 0;
		const normalized = value / maxTotal;
		return 0.1 + normalized * 0.9;
	}

	const HOURS = Array.from({ length: 24 }, (_, i) => i);

	function HeatmapCell({ diaSemana, hora }: { diaSemana: number; hora: number }) {
		const result = getCellValue(diaSemana, hora);
		const intensity = result ? getColorIntensity(result.total) : 0;
		const bgColor = result ? hexToRgba(colors.primary, intensity) : "rgba(0,0,0,0.03)";
		const ticketMedio = result && result.qtde > 0 ? result.total / result.qtde : 0;

		return (
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<div className="flex-1 min-w-0 min-h-0 flex items-center justify-center p-0.5">
						<div
							className="w-full aspect-square max-w-full max-h-full rounded-full transition-all hover:scale-110 hover:z-10 cursor-pointer border border-primary/10"
							style={{ backgroundColor: bgColor }}
						/>
					</div>
				</TooltipTrigger>
				{result ? (
					<TooltipContent className="bg-primary text-primary-foreground p-3 min-w-[180px]">
						<div className="flex flex-col gap-2">
							<h3 className="text-sm font-semibold">
								{WEEKDAY_MAP_HEATMAP[diaSemana as keyof typeof WEEKDAY_MAP_HEATMAP]} às {formatHourLabel(hora)}
							</h3>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-1">
									<CirclePlus className="w-4 h-4 min-w-4 min-h-4" />
									<span className="text-xs font-medium tracking-tight">VENDAS</span>
								</div>
								<span className="text-sm font-bold">{formatDecimalPlaces(result.qtde)}</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-1">
									<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />
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
							<h3 className="text-sm font-semibold">
								{WEEKDAY_MAP_HEATMAP[diaSemana as keyof typeof WEEKDAY_MAP_HEATMAP]} às {formatHourLabel(hora)}
							</h3>
							<span className="text-xs">SEM DADOS</span>
						</div>
					</TooltipContent>
				)}
			</Tooltip>
		);
	}

	return (
		<TooltipProvider>
			<div className="w-full h-full min-h-[200px] min-w-[520px] flex flex-col overflow-hidden">
				{/* Eixo horizontal: horas */}
				<div className="flex gap-0.5 pl-12 shrink-0">
					{HOURS.map((h) => (
						<div key={h} className="flex-1 min-w-0 flex items-center justify-center text-[0.6rem] text-muted-foreground">
							{formatHourLabel(h)}
						</div>
					))}
				</div>
				{/* Grid: dias x horas - ocupa o espaço restante */}
				<div className="flex-1 min-h-0 flex flex-col gap-0.5 mt-1">
					{[0, 1, 2, 3, 4, 5, 6].map((diaSemana) => (
						<div key={diaSemana} className="flex-1 min-h-0 flex items-stretch gap-1">
							<div className="w-10 shrink-0 flex items-center text-[0.65rem] font-medium text-muted-foreground">
								{WEEKDAY_MAP_HEATMAP[diaSemana as keyof typeof WEEKDAY_MAP_HEATMAP]}
							</div>
							<div className="flex-1 min-w-0 flex gap-0.5">
								{HOURS.map((hora) => (
									<HeatmapCell key={`${diaSemana}-${hora}`} diaSemana={diaSemana} hora={hora} />
								))}
							</div>
						</div>
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}

function GroupedByMonthDay({ data }: { data: TGroupedSalesStats["porDiaDoMes"] }) {
	const { colors } = useOrgColors();
	// Calculate color intensity based on performance ranking
	const maxValue = Math.max(...data.map((item) => item.total), 0);
	const minValue = Math.min(...data.map((item) => item.total), 0);
	const range = maxValue - minValue;

	const bestDayIndex = data.length > 0 ? data.reduce((max, item) => (item.total > max.total ? item : max), data[0]).dia : null;
	const worstDayIndex = data.length > 0 ? data.reduce((min, item) => (item.total < min.total ? item : min), data[0]).dia : null;

	function getDayResult(index: number) {
		return data.find((item) => Number(item.dia) === index + 1);
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
		const bgColor = result ? hexToRgba(colors.primary, intensity) : "transparent";
		const ticketMedio = result && result.qtde > 0 ? result.total / result.qtde : 0;

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
								<span className="text-sm font-bold">{formatDecimalPlaces(result.qtde)}</span>
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
							O melhor dia para vender foi {bestDayIndex}
						</div>
					) : null}
					{isValidNumber(worstDayIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-red-100 text-red-600 text-xs rounded-lg font-medium">
							O pior dia para vender foi {worstDayIndex}
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

function GroupedByMonth({ data }: { data: TGroupedSalesStats["porMes"] }) {
	const { colors } = useOrgColors();
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

	function getMonthResult(index: number) {
		return data.find((item) => Number(item.mes) === index + 1);
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
		const bgColor = result ? hexToRgba(colors.primary, intensity) : "transparent";
		const ticketMedio = result && result.qtde > 0 ? result.total / result.qtde : 0;

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
								<span className="text-sm font-bold">{formatDecimalPlaces(result.qtde)}</span>
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
							O melhor mês para vender foi {MONTH_MAP[bestMonthIndex as keyof typeof MONTH_MAP]}
						</div>
					) : null}

					{isValidNumber(worstMonthIndex) ? (
						<div className="w-fit text-center self-center px-4 py-1 bg-red-100 text-red-600 text-xs rounded-lg font-medium">
							O pior mês para vender foi {MONTH_MAP[worstMonthIndex as keyof typeof MONTH_MAP]}
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

const WEEKDAY_MAP_FULL = {
	0: "Domingo",
	1: "Segunda",
	2: "Terça",
	3: "Quarta",
	4: "Quinta",
	5: "Sexta",
	6: "Sábado",
} as const;

function ResultsByChannelGraph({ data }: { data: TGroupedSalesStats["porCanal"] }) {
	const [type, setType] = useState<"qtde" | "total">("total");
	const { colors } = useOrgColors();

	async function handleExportData(data: TGroupedSalesStats["porCanal"] | undefined) {
		try {
			if (!data) throw new Error("Não há dados para exportar");
			const exportationJSON = data.map((item) => ({
				CANAL: item.titulo,
				"VALOR VENDIDO": item.total,
				"Nº DE VENDAS": item.qtde,
			}));
			getExcelFromJSON(exportationJSON, "RESULTADOS_POR_CANAL.xlsx");
			return toast.success("Dados exportados com sucesso");
		} catch (error) {
			const msg = getErrorMessage(error);
			return toast.error(msg);
		}
	}
	const chartColorsList = useMemo(() => [colors.secondary, colors.primary, "#ff595e", "#8ac926", "#6a4c93", "#5adbff"], [colors]);
	const total = useMemo(() => data.reduce((acc, current) => (type === "total" ? acc + current.total : acc + current.qtde), 0), [data, type]);
	const graphData = useMemo(
		() => data.sort((a, b) => b.qtde - a.qtde).map((p, index) => ({ ...p, fill: chartColorsList[index % chartColorsList.length] || "#000" })),
		[data, chartColorsList],
	);
	const chartConfig = { titulo: { label: "CANAL" } };
	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex items-center justify-between">
				<h1 className="text-xs font-medium tracking-tight uppercase">PARTICIPAÇÃO POR CANAL</h1>
				<div className="flex items-center gap-2">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={"ghost"} size="fit" className="rounded-lg p-2" onClick={() => handleExportData(data)}>
									<Download className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Baixar</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={type === "total" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setType("total")}>
									<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Valor Vendido</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={type === "qtde" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setType("qtde")}>
									<CirclePlus className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Quantidade de Vendas</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>
			<div className="px-6 py-2 flex w-full flex-col gap-2 h-[300px] lg:h-[350px] max-h-[300px] lg:max-h-[350px] items-center justify-center">
				<ChartContainer config={chartConfig} className="h-[250px] w-[250px]">
					<PieChart>
						<ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
						<Pie
							data={graphData}
							dataKey={type}
							nameKey="titulo"
							label={(x) => {
								return `${formatDecimalPlaces((100 * (x.value as number)) / total)}%`;
							}}
							innerRadius={60}
							strokeWidth={2}
						/>
						<ChartLegend
							content={<ChartLegendContent payload={graphData} verticalAlign="bottom" />}
							className="-translate-y-2 flex-wrap gap-2 *:basis-1/4 *:justify-center"
						/>
					</PieChart>
				</ChartContainer>
			</div>
		</div>
	);
}

function ResultsByFulfillmentMethodGraph({ data }: { data: TGroupedSalesStats["porEntregaModalidade"] }) {
	const [type, setType] = useState<"qtde" | "total">("total");
	const { colors } = useOrgColors();

	async function handleExportData(data: TGroupedSalesStats["porEntregaModalidade"] | undefined) {
		try {
			if (!data) throw new Error("Não há dados para exportar");
			const exportationJSON = data.map((item) => ({
				MODALIDADE: item.titulo,
				"VALOR VENDIDO": item.total,
				"Nº DE VENDAS": item.qtde,
			}));
			getExcelFromJSON(exportationJSON, "RESULTADOS_POR_MODALIDADE.xlsx");
			return toast.success("Dados exportados com sucesso");
		} catch (error) {
			const msg = getErrorMessage(error);
			return toast.error(msg);
		}
	}
	const chartColorsList = useMemo(() => [colors.secondary, colors.primary, "#ff595e", "#8ac926", "#6a4c93", "#5adbff"], [colors]);
	const total = useMemo(() => data.reduce((acc, current) => (type === "total" ? acc + current.total : acc + current.qtde), 0), [data, type]);
	const graphData = useMemo(
		() => data.sort((a, b) => b.qtde - a.qtde).map((p, index) => ({ ...p, fill: chartColorsList[index % chartColorsList.length] || "#000" })),
		[data, chartColorsList],
	);
	const chartConfig = { titulo: { label: "MODALIDADE" } };
	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex items-center justify-between">
				<h1 className="text-xs font-medium tracking-tight uppercase">PARTICIPAÇÃO POR MODALIDADE</h1>
				<div className="flex items-center gap-2">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={"ghost"} size="fit" className="rounded-lg p-2" onClick={() => handleExportData(data)}>
									<Download className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Baixar</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={type === "total" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setType("total")}>
									<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Valor Vendido</p>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={type === "qtde" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setType("qtde")}>
									<CirclePlus className="h-4 min-h-4 w-4 min-w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Quantidade de Vendas</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>
			<div className="px-6 py-2 flex w-full flex-col gap-2 h-[300px] lg:h-[350px] max-h-[300px] lg:max-h-[350px] items-center justify-center">
				<ChartContainer config={chartConfig} className="h-[250px] w-[250px]">
					<PieChart>
						<ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
						<Pie
							data={graphData}
							dataKey={type}
							nameKey="titulo"
							label={(x) => {
								return `${formatDecimalPlaces((100 * (x.value as number)) / total)}%`;
							}}
							innerRadius={60}
							strokeWidth={2}
						/>
						<ChartLegend
							content={<ChartLegendContent payload={graphData} verticalAlign="bottom" />}
							className="-translate-y-2 flex-wrap gap-2 *:basis-1/4 *:justify-center"
						/>
					</PieChart>
				</ChartContainer>
			</div>
		</div>
	);
}
