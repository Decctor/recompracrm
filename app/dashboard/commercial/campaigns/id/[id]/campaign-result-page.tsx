"use client";
import type { TGetCampaignConversionsOutputItems } from "@/app/api/campaigns/[id]/conversions/route";
import type { TGetCampaignInteractionsOutputItems } from "@/app/api/campaigns/interactions/route";
import CampaignInteractionsFilterMenu from "@/components/Campaigns/CampaignInteractionsFilterMenu";
import CampaignsGraphs from "@/components/Campaigns/CampaignsGraphs";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import {
	useCampaignById,
	useCampaignConversions,
	useCampaignInteractionsLogs,
	useCampaignPerformance,
	useConversionQuality,
} from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import type { TCampaignTriggerTypeEnum } from "@/schemas/enums";
import dayjs from "dayjs";
import {
	ArrowLeft,
	BadgeDollarSign,
	Calendar,
	CircleCheck,
	CircleX,
	Clock,
	Grid3x3,
	ListFilter,
	MessageCircle,
	MousePointerClick,
	RefreshCw,
	Send,
	TrendingUp,
	UserPlus,
	UserRound,
	UserRoundCheck,
	Users,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type CampaignResultPageProps = {
	campaignId: string;
	user: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};

const TRIGGER_TYPE_LABELS: Record<TCampaignTriggerTypeEnum, string> = {
	"NOVA-COMPRA": "Nova Compra",
	"PRIMEIRA-COMPRA": "Primeira Compra",
	"PERMANÊNCIA-SEGMENTAÇÃO": "Permanência em Segmentação",
	"ENTRADA-SEGMENTAÇÃO": "Entrada em Segmentação",
	"CASHBACK-ACUMULADO": "Cashback Acumulado",
	"CASHBACK-EXPIRANDO": "Cashback Expirando",
	ANIVERSARIO_CLIENTE: "Aniversário do Cliente",
	"QUANTIDADE-TOTAL-COMPRAS": "Qtd. Total de Compras",
	"VALOR-TOTAL-COMPRAS": "Valor Total de Compras",
	RECORRENTE: "Recorrente",
};

const ATTRIBUTION_MODEL_LABELS: Record<string, string> = {
	LAST_TOUCH: "Último Toque",
	FIRST_TOUCH: "Primeiro Toque",
	LINEAR: "Linear",
};

const CONVERSION_TYPE_CONFIG: Record<
	string,
	{ label: string; bgClass: string; textClass: string }
> = {
	AQUISICAO: { label: "Aquisição", bgClass: "bg-green-500", textClass: "text-green-600 dark:text-green-400" },
	REATIVACAO: { label: "Reativação", bgClass: "bg-blue-500", textClass: "text-blue-600 dark:text-blue-400" },
	ACELERACAO: { label: "Aceleração", bgClass: "bg-yellow-500", textClass: "text-yellow-600 dark:text-yellow-400" },
	REGULAR: { label: "Regular", bgClass: "bg-gray-400", textClass: "text-gray-600 dark:text-gray-400" },
	ATRASADA: { label: "Atrasada", bgClass: "bg-red-500", textClass: "text-red-600 dark:text-red-400" },
};

export default function CampaignResultPage({ campaignId }: CampaignResultPageProps) {
	const initialStartDate = dayjs().startOf("month").toDate();
	const initialEndDate = dayjs().endOf("month").toDate();

	const [filters, setFilters] = useState<{ startDate: Date; endDate: Date }>({
		startDate: initialStartDate,
		endDate: initialEndDate,
	});
	const [comparingFilters, setComparingFilters] = useState<{ startDate: Date; endDate: Date }>({
		startDate: dayjs().startOf("month").subtract(1, "month").toDate(),
		endDate: dayjs().endOf("month").subtract(1, "month").toDate(),
	});

	const { data: campaign, isLoading: campaignLoading, isError: campaignError } = useCampaignById({ id: campaignId });

	const { data: performance, isLoading: performanceLoading } = useCampaignPerformance({
		campaignId,
		startDate: filters.startDate,
		endDate: filters.endDate,
	});

	const { data: qualityData } = useConversionQuality({
		campanhaId: campaignId,
		startDate: filters.startDate,
		endDate: filters.endDate,
	});

	const aquisicoes = qualityData?.distribuicaoTipos.find((t) => t.tipo === "AQUISICAO");
	const reativacoes = qualityData?.distribuicaoTipos.find((t) => t.tipo === "REATIVACAO");
	const aceleracoes = qualityData?.distribuicaoTipos.find((t) => t.tipo === "ACELERACAO");

	const handleDateChange = (value: { after?: Date; before?: Date }) => {
		const newStart = value.after ? new Date(value.after) : filters.startDate;
		const newEnd = value.before ? new Date(value.before) : filters.endDate;
		setFilters({ startDate: newStart, endDate: newEnd });
		const diffDays = dayjs(newEnd).diff(dayjs(newStart), "day");
		setComparingFilters({
			startDate: dayjs(newStart).subtract(diffDays + 1, "day").toDate(),
			endDate: dayjs(newStart).subtract(1, "day").toDate(),
		});
	};

	if (campaignLoading) return <LoadingComponent />;
	if (campaignError || !campaign) return <ErrorComponent msg="Campanha não encontrada." />;

	return (
		<div className="w-full flex flex-col gap-4">
			{/* Header */}
			<div className="w-full flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="sm" asChild className="flex items-center gap-1.5 px-2">
						<Link href="/dashboard/commercial/campaigns">
							<ArrowLeft className="w-4 h-4 min-w-4 min-h-4" />
							Campanhas
						</Link>
					</Button>
				</div>
				<div className="w-full flex items-start justify-between gap-3 flex-col lg:flex-row">
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center gap-3 flex-wrap">
							<h1 className="text-xl font-bold tracking-tight">{campaign.titulo}</h1>
							<div
								className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1 text-white text-xs font-bold", {
									"bg-green-500 dark:bg-green-600": campaign.ativo,
									"bg-gray-500 dark:bg-gray-600": !campaign.ativo,
								})}
							>
								<CircleCheck className="w-3.5 h-3.5 min-w-3.5 min-h-3.5" />
								{campaign.ativo ? "ATIVA" : "INATIVA"}
							</div>
						</div>
						{campaign.descricao && (
							<p className="text-sm text-muted-foreground">{campaign.descricao}</p>
						)}
						<div className="flex items-center gap-2 flex-wrap mt-1">
							<div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1 text-xs font-medium">
								<Zap className="w-3.5 h-3.5 min-w-3.5 min-h-3.5" />
								{TRIGGER_TYPE_LABELS[campaign.gatilhoTipo as TCampaignTriggerTypeEnum] ?? campaign.gatilhoTipo}
							</div>
							<div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1 text-xs font-medium">
								<TrendingUp className="w-3.5 h-3.5 min-w-3.5 min-h-3.5" />
								{ATTRIBUTION_MODEL_LABELS[campaign.atribuicaoModelo ?? "LAST_TOUCH"] ?? campaign.atribuicaoModelo}
							</div>
							{campaign.atribuicaoJanelaDias && (
								<div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1 text-xs font-medium">
									<Clock className="w-3.5 h-3.5 min-w-3.5 min-h-3.5" />
									Janela: {campaign.atribuicaoJanelaDias} dias
								</div>
							)}
							{campaign.segmentacoes && campaign.segmentacoes.length > 0 && (
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1 text-xs font-medium cursor-default">
												<Grid3x3 className="w-3.5 h-3.5 min-w-3.5 min-h-3.5" />
												{campaign.segmentacoes.length} {campaign.segmentacoes.length === 1 ? "segmentação" : "segmentações"}
											</div>
										</TooltipTrigger>
										<TooltipContent className="max-w-xs">
											{campaign.segmentacoes.map((s) => s.segmentacao).join(", ")}
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)}
						</div>
					</div>
					<DateIntervalInput
						label="Período"
						labelClassName="hidden"
						className="hover:bg-accent hover:text-accent-foreground border-none shadow-none shrink-0"
						value={{
							after: filters.startDate,
							before: filters.endDate,
						}}
						handleChange={handleDateChange}
					/>
				</div>
			</div>

			{/* Section A — Core KPIs */}
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="INTERAÇÕES ENVIADAS"
					icon={<MessageCircle className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.interacoesEnviadas ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="CONVERSÕES"
					icon={<MousePointerClick className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.conversoes ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="TAXA DE CONVERSÃO"
					icon={<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.taxaConversao ?? 0, format: (n) => `${formatDecimalPlaces(n)}%` }}
				/>
				<StatUnitCard
					title="RECEITA ATRIBUÍDA"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.receitaAtribuida ?? 0, format: (n) => formatToMoney(n) }}
				/>
				<StatUnitCard
					title="TEMPO MÉDIO DE CONVERSÃO"
					icon={<Clock className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: performance?.tempoMedioConversaoHoras ?? 0,
						format: (n) => `${formatDecimalPlaces(n, 1, 1)} horas`,
					}}
				/>
			</div>

			{/* Section B — Delivery & Reach KPIs */}
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="CLIENTES ALCANÇADOS"
					subtitle="Únicos que receberam"
					icon={<Users className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.clientesAlcancados ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="CLIENTES CONVERTIDOS"
					subtitle="Únicos que converteram"
					icon={<UserRoundCheck className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.clientesConvertidos ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="MENSAGENS ENTREGUES"
					subtitle="Status DELIVERED ou READ"
					icon={<Send className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.totalEntregues ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="FALHAS DE ENVIO"
					subtitle="Status FAILED"
					icon={<CircleX className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.totalFalhas ?? 0, format: (n) => formatDecimalPlaces(n) }}
					lowerIsBetter
				/>
				<StatUnitCard
					title="TICKET MÉDIO DAS CONVERSÕES"
					subtitle="Valor médio das vendas"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.ticketMedioConversao ?? 0, format: (n) => formatToMoney(n) }}
				/>
			</div>

			{/* Section C — Conversion Quality KPIs */}
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="AQUISIÇÕES"
					subtitle="Novos clientes"
					icon={<UserPlus className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: aquisicoes?.quantidade ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="REATIVAÇÕES"
					subtitle="Clientes resgatados"
					icon={<RefreshCw className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: reativacoes?.quantidade ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="ACELERAÇÕES"
					subtitle="Compraram mais rápido"
					icon={<Zap className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: aceleracoes?.quantidade ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="ANTECIPAÇÃO MÉDIA"
					subtitle="Dias economizados"
					icon={<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: qualityData?.impactoFrequencia?.mediasDiasAntecipados ?? 0,
						format: (n) => `${formatDecimalPlaces(n, 1, 1)} dias`,
					}}
				/>
				<StatUnitCard
					title="IMPACTO NO TICKET"
					subtitle="Variação média vs. histórico"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: qualityData?.impactoMonetario?.deltaMonetarioPercentualMedio ?? 0,
						format: (n) => `${n > 0 ? "+" : ""}${formatDecimalPlaces(n)}%`,
					}}
				/>
			</div>

			{/* Section D — Time-Series Chart */}
			<div className="w-full h-[480px]">
				<CampaignsGraphs
					startDate={filters.startDate}
					endDate={filters.endDate}
					comparingStartDate={comparingFilters.startDate}
					comparingEndDate={comparingFilters.endDate}
					campaignId={campaignId}
				/>
			</div>

			{/* Section E — Conversion Type Distribution */}
			{qualityData && qualityData.distribuicaoTipos.length > 0 && (
				<div className="w-full flex flex-col lg:flex-row gap-3">
					{/* Distribution */}
					<div className="bg-card border-primary/20 flex flex-col gap-3 rounded-xl border px-4 py-4 shadow-2xs w-full lg:w-2/3">
						<h2 className="text-xs font-medium tracking-tight uppercase">DISTRIBUIÇÃO DE CONVERSÕES</h2>
						<div className="flex flex-col gap-3">
							{qualityData.distribuicaoTipos.map((item) => {
								const config = CONVERSION_TYPE_CONFIG[item.tipo ?? ""] ?? {
									label: item.tipo,
									bgClass: "bg-gray-400",
									textClass: "text-gray-600",
								};
								return (
									<div key={item.tipo} className="flex flex-col gap-1">
										<div className="flex items-center justify-between gap-2">
											<div className="flex items-center gap-2">
												<div className={cn("w-2.5 h-2.5 rounded-full shrink-0", config.bgClass)} />
												<span className="text-xs font-medium">{config.label}</span>
											</div>
											<div className="flex items-center gap-3">
												<span className="text-xs text-muted-foreground">{formatDecimalPlaces(item.quantidade)} conv.</span>
												<span className={cn("text-xs font-bold", config.textClass)}>{formatDecimalPlaces(item.percentual)}%</span>
												<span className="text-xs text-muted-foreground">{formatToMoney(item.receita)}</span>
											</div>
										</div>
										<div className="w-full bg-secondary rounded-full h-2">
											<div
												className={cn("h-2 rounded-full", config.bgClass)}
												style={{ width: `${Math.min(item.percentual, 100)}%` }}
											/>
										</div>
									</div>
								);
							})}
						</div>
					</div>

					{/* Frequency & Monetary Impact */}
					<div className="flex flex-col gap-3 w-full lg:w-1/3">
						<div className="bg-card border-primary/20 flex flex-col gap-3 rounded-xl border px-4 py-4 shadow-2xs h-full">
							<h2 className="text-xs font-medium tracking-tight uppercase">IMPACTO NA FREQUÊNCIA</h2>
							<div className="flex flex-col gap-2">
								<ImpactRow
									label="Aceleradas"
									value={formatDecimalPlaces(qualityData.impactoFrequencia.totalAceleradas)}
									positive
								/>
								<ImpactRow
									label="Atrasadas"
									value={formatDecimalPlaces(qualityData.impactoFrequencia.totalAtrasadas)}
									positive={false}
								/>
								<ImpactRow
									label="Antecipação média"
									value={`${formatDecimalPlaces(qualityData.impactoFrequencia.mediasDiasAntecipados, 1, 1)} dias`}
									positive
								/>
							</div>
							<h2 className="text-xs font-medium tracking-tight uppercase mt-1">IMPACTO NO TICKET</h2>
							<div className="flex flex-col gap-2">
								<ImpactRow
									label="Acima do ticket médio"
									value={formatDecimalPlaces(qualityData.impactoMonetario.totalAcimaTicket)}
									positive
								/>
								<ImpactRow
									label="Abaixo do ticket médio"
									value={formatDecimalPlaces(qualityData.impactoMonetario.totalAbaixoTicket)}
									positive={false}
								/>
								<ImpactRow
									label="Variação média"
									value={`${qualityData.impactoMonetario.deltaMonetarioPercentualMedio > 0 ? "+" : ""}${formatDecimalPlaces(qualityData.impactoMonetario.deltaMonetarioPercentualMedio)}%`}
									positive={qualityData.impactoMonetario.deltaMonetarioPercentualMedio >= 0}
								/>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Section F — Conversions Detail List */}
			<ConversionsSection campaignId={campaignId} startDate={filters.startDate} endDate={filters.endDate} />

			{/* Section G — Interactions Log */}
			<InteractionsSection campaignId={campaignId} />
		</div>
	);
}

function ImpactRow({ label, value, positive }: { label: string; value: string; positive: boolean }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className={cn("text-xs font-bold", positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
				{value}
			</span>
		</div>
	);
}

function ConversionsSection({ campaignId, startDate, endDate }: { campaignId: string; startDate: Date; endDate: Date }) {
	const [filterMenuOpen, setFilterMenuOpen] = useState(false);
	const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

	const {
		data: conversionsData,
		isLoading,
		isError,
		isSuccess,
		error,
		filters,
		updateFilters,
	} = useCampaignConversions({
		campaignId,
		initialFilters: {
			page: 1,
			search: "",
			tipoConversao: [],
			startDate,
			endDate,
		},
	});

	// Sync parent date filter changes into the hook's internal state
	useEffect(() => {
		updateFilters({ startDate, endDate, page: 1 });
	}, [startDate.toISOString(), endDate.toISOString()]);

	const items = conversionsData?.items ?? [];
	const conversionsMatched = conversionsData?.conversionsMatched ?? 0;
	const totalPages = conversionsData?.totalPages ?? 0;

	const conversionTypeOptions = Object.entries(CONVERSION_TYPE_CONFIG).map(([key, val]) => ({
		key,
		label: val.label,
		bgClass: val.bgClass,
	}));

	const toggleType = (key: string) => {
		const next = selectedTypes.includes(key) ? selectedTypes.filter((k) => k !== key) : [...selectedTypes, key];
		setSelectedTypes(next);
		updateFilters({ tipoConversao: next as typeof filters.tipoConversao, page: 1 });
	};

	return (
		<div className="w-full flex flex-col gap-3">
			<h2 className="text-sm font-bold tracking-tight uppercase">CONVERSÕES DETALHADAS</h2>
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar por cliente..."
					onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
					className="grow rounded-xl"
				/>
				<div className="flex items-center gap-1.5 flex-wrap">
					{conversionTypeOptions.map((opt) => (
						<button
							key={opt.key}
							type="button"
							onClick={() => toggleType(opt.key)}
							className={cn(
								"flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.65rem] font-bold uppercase transition-colors border",
								selectedTypes.includes(opt.key)
									? `${opt.bgClass} text-white border-transparent`
									: "bg-secondary text-primary border-transparent hover:bg-secondary/80",
							)}
						>
							{opt.label}
						</button>
					))}
				</div>
			</div>

			<GeneralPaginationComponent
				activePage={filters.page ?? 1}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages}
				itemsMatchedText={`${conversionsMatched} ${conversionsMatched === 1 ? "conversão encontrada." : "conversões encontradas."}`}
				itemsShowingText={`${items.length} ${items.length === 1 ? "conversão exibida." : "conversões exibidas."}`}
			/>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				<div className="w-full flex flex-col gap-1.5">
					{items.length > 0 ? (
						items.map((conversion) => <ConversionCard key={conversion.id} conversion={conversion} />)
					) : (
						<p className="w-full flex items-center justify-center text-sm text-muted-foreground py-4">
							Nenhuma conversão encontrada para este período.
						</p>
					)}
				</div>
			) : null}
		</div>
	);
}

function ConversionCard({ conversion }: { conversion: TGetCampaignConversionsOutputItems[number] }) {
	const config = CONVERSION_TYPE_CONFIG[conversion.tipoConversao ?? ""] ?? {
		label: conversion.tipoConversao ?? "Desconhecido",
		bgClass: "bg-gray-400",
		textClass: "text-gray-600",
	};

	const tempoHoras = conversion.tempoParaConversaoMinutos
		? Math.round((conversion.tempoParaConversaoMinutos / 60) * 10) / 10
		: null;

	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-2 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="w-full flex items-center justify-between gap-2 flex-wrap">
				<div className="flex items-center gap-3 flex-wrap">
					<div className="flex items-center gap-1.5 bg-secondary rounded-xl px-3 py-1.5">
						<UserRound className="w-4 h-4 min-w-4 min-h-4" />
						<p className="text-[0.65rem] font-medium tracking-tight uppercase">
							{conversion.cliente?.nome ?? "Cliente não encontrado"}
						</p>
					</div>
					<div className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-white text-[0.65rem] font-bold uppercase", config.bgClass)}>
						{config.label}
					</div>
				</div>
				<div className="flex items-center gap-2 text-[0.65rem] font-medium flex-wrap">
					{conversion.dataConversao && (
						<div className="flex items-center gap-1 text-muted-foreground">
							<Calendar className="w-3.5 h-3.5 min-w-3.5 min-h-3.5" />
							{formatDateAsLocale(conversion.dataConversao)}
						</div>
					)}
					{tempoHoras !== null && (
						<div className="flex items-center gap-1 text-muted-foreground">
							<Clock className="w-3.5 h-3.5 min-w-3.5 min-h-3.5" />
							{tempoHoras} h após envio
						</div>
					)}
				</div>
			</div>
			<div className="w-full flex items-center gap-3 flex-wrap">
				<div className="flex flex-col gap-0.5">
					<p className="text-[0.6rem] uppercase text-muted-foreground font-medium">Valor da Venda</p>
					<p className="text-sm font-bold">{formatToMoney(conversion.vendaValor ?? 0)}</p>
				</div>
				<div className="w-px h-8 bg-border" />
				<div className="flex flex-col gap-0.5">
					<p className="text-[0.6rem] uppercase text-muted-foreground font-medium">Receita Atribuída</p>
					<p className="text-sm font-bold">{formatToMoney(conversion.atribuicaoReceita ?? 0)}</p>
				</div>
				{conversion.deltaMonetarioPercentual !== null && conversion.deltaMonetarioPercentual !== undefined && (
					<>
						<div className="w-px h-8 bg-border" />
						<div className="flex flex-col gap-0.5">
							<p className="text-[0.6rem] uppercase text-muted-foreground font-medium">Δ Ticket</p>
							<p
								className={cn("text-sm font-bold", {
									"text-green-600 dark:text-green-400": conversion.deltaMonetarioPercentual > 0,
									"text-red-600 dark:text-red-400": conversion.deltaMonetarioPercentual < 0,
								})}
							>
								{conversion.deltaMonetarioPercentual > 0 ? "+" : ""}
								{formatDecimalPlaces(conversion.deltaMonetarioPercentual)}%
							</p>
						</div>
					</>
				)}
				{conversion.deltaFrequencia !== null && conversion.deltaFrequencia !== undefined && (
					<>
						<div className="w-px h-8 bg-border" />
						<div className="flex flex-col gap-0.5">
							<p className="text-[0.6rem] uppercase text-muted-foreground font-medium">Δ Ciclo</p>
							<p
								className={cn("text-sm font-bold", {
									"text-green-600 dark:text-green-400": conversion.deltaFrequencia > 0,
									"text-red-600 dark:text-red-400": conversion.deltaFrequencia < 0,
								})}
							>
								{conversion.deltaFrequencia > 0 ? "+" : ""}
								{conversion.deltaFrequencia} dias
							</p>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function InteractionsSection({ campaignId }: { campaignId: string }) {
	const [filterMenuIsOpen, setFilterMenuIsOpen] = useState(false);

	const {
		data: interactionsResult,
		isLoading,
		isError,
		isSuccess,
		error,
		filters,
		updateFilters,
	} = useCampaignInteractionsLogs({
		initialFilters: {
			page: 1,
			search: "",
			status: [],
			orderByField: "agendamentoData",
			orderByDirection: "desc",
			campanhaId: campaignId,
		},
	});

	const items = interactionsResult?.items ?? [];
	const interactionsMatched = interactionsResult?.interactionsMatched ?? 0;
	const totalPages = interactionsResult?.totalPages ?? 0;

	return (
		<div className="w-full flex flex-col gap-3">
			<h2 className="text-sm font-bold tracking-tight uppercase">INTERAÇÕES</h2>
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar interações (título, descrição, cliente)..."
					onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
					className="grow rounded-xl"
				/>
				<Button className="flex items-center gap-2" size="sm" onClick={() => setFilterMenuIsOpen(true)}>
					<ListFilter className="w-4 h-4 min-w-4 min-h-4" />
					FILTROS
				</Button>
			</div>

			<GeneralPaginationComponent
				activePage={filters.page ?? 1}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages}
				itemsMatchedText={`${interactionsMatched} ${interactionsMatched === 1 ? "interação encontrada." : "interações encontradas."}`}
				itemsShowingText={`${items.length} ${items.length === 1 ? "interação exibida." : "interações exibidas."}`}
			/>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				<div className="w-full flex flex-col gap-1.5">
					{items.length > 0 ? (
						items.map((interaction) => <InteractionLogCard key={interaction.id} interaction={interaction} />)
					) : (
						<p className="w-full flex items-center justify-center text-sm text-muted-foreground py-4">
							Nenhuma interação encontrada.
						</p>
					)}
				</div>
			) : null}

			{filterMenuIsOpen ? (
				<CampaignInteractionsFilterMenu filters={filters} updateFilters={updateFilters} closeMenu={() => setFilterMenuIsOpen(false)} />
			) : null}
		</div>
	);
}

function InteractionLogCard({ interaction }: { interaction: TGetCampaignInteractionsOutputItems[number] }) {
	const executionStatus = interaction.dataExecucao ? "EXECUTADA" : "AGENDADA";
	const scheduleDateText = interaction.agendamentoDataReferencia
		? dayjs(interaction.agendamentoDataReferencia).format("DD/MM/YYYY")
		: "Não definido";
	const scheduleBlockText = interaction.agendamentoBlocoReferencia ?? "--:--";
	const executionDateText = interaction.dataExecucao ? formatDateAsLocale(interaction.dataExecucao, true) : "Não executada";

	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-2 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="w-full flex flex-col gap-0.5">
				<div className="w-full flex items-center justify-between gap-2">
					<div className="flex items-center gap-3 flex-wrap">
						<div className="flex items-center gap-1.5 bg-secondary rounded-xl px-3 py-1.5">
							<UserRound className="w-4 h-4 min-w-4 min-h-4" />
							<p className="text-[0.65rem] font-medium tracking-tight uppercase">
								{interaction.cliente.nome ?? "NÃO INFORMADO"}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-3">
						{interaction.erroEnvio ? (
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<div className="flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[0.65rem] font-bold bg-red-500 text-white">
											<CircleX className="w-4 min-w-4 h-4 min-h-4" />
											<p className="text-[0.65rem] font-medium tracking-tight">FALHOU</p>
										</div>
									</TooltipTrigger>
									<TooltipContent>
										<p className="text-xs font-medium tracking-tight text-red-500">{interaction.erroEnvio}</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						) : null}
						<div
							className={cn("flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[0.65rem] font-bold", {
								"bg-blue-500 text-white": executionStatus === "AGENDADA",
								"bg-green-500 text-white": executionStatus === "EXECUTADA",
							})}
						>
							<CircleCheck className="w-4 min-w-4 h-4 min-h-4" />
							<p className="text-xs font-bold tracking-tight uppercase">{executionStatus}</p>
						</div>
					</div>
				</div>
				{interaction.descricao && (
					<p className="text-xs font-medium tracking-tight text-muted-foreground">{interaction.descricao}</p>
				)}
			</div>
			<div className="w-full flex items-center justify-end gap-2 flex-wrap">
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1">
						<Calendar className="w-4 h-4 min-w-4 min-h-4" />
						<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic">
							AGENDADO PARA: {scheduleDateText} ({scheduleBlockText})
						</h1>
					</div>
					<div
						className={cn("flex items-center gap-1", {
							"text-green-500 dark:text-green-400": !!interaction.dataExecucao,
						})}
					>
						<Calendar className="w-4 h-4 min-w-4 min-h-4" />
						<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic">{executionDateText}</h1>
					</div>
				</div>
			</div>
		</div>
	);
}
