"use client";
import type { TGetCampaignStatsOutput } from "@/app/api/campaigns/stats/by-campaign/route";
import type { TGetCampaignInteractionsOutputItems } from "@/app/api/campaigns/interactions/route";
import type { TGetConversionQualityOutput } from "@/app/api/campaigns/stats/conversion-quality/route";
import { CampaignConversionCard, CONVERSION_TYPE_CONFIG } from "@/components/Campaigns/Conversions/CampaignConversionCard";
import CampaignsGraphs from "@/app/dashboard/growth/campaigns/_module/shared/stats/CampaignsGraphs";
import CampaignDispatchesSection from "@/app/dashboard/growth/campaigns/_module/detail/components/campaign-dispatches-section";
import ClientHoverCard from "@/components/Clients/ClientHoverCard";
import { InteractionCard } from "@/components/Interactions/InteractionCard";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { retryCampaignInteraction } from "@/lib/mutations/campaigns";
import { useCampaignInteractionsLogs, useCampaignStats, useCampaignsConversions, useConversionQuality } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
	BadgeDollarSign,
	CalendarCheck,
	CalendarClock,
	CircleCheck,
	CircleX,
	Clock,
	Diamond,
	MessageCircle,
	MousePointerClick,
	RefreshCw,
	Rocket,
	Send,
	ShieldAlert,
	ShoppingCart,
	Sparkles,
	Ticket,
	TrendingUp,
	UserPlus,
	UserRound,
	UserRoundCheck,
	Users,
	Zap,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import { toast } from "sonner";
import { InteractionsSentStatusOptions } from "@/utils/select-options";

type CampaignStatsViewProps = {
	campaignId: string;
};

export default function CampaignStatsView({ campaignId }: CampaignStatsViewProps) {
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

	const { data: performance } = useCampaignStats({
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
			startDate: dayjs(newStart)
				.subtract(diffDays + 1, "day")
				.toDate(),
			endDate: dayjs(newStart).subtract(1, "day").toDate(),
		});
	};

	return (
		<div className="w-full flex flex-col gap-4">
			{/* Period filter */}
			<div className="w-full flex justify-end">
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
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="CONVERSÕES INCREMENTAIS"
					icon={<Sparkles className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.conversoesIncrementais ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="RECEITA INCREMENTAL"
					icon={<Sparkles className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.receitaIncremental ?? 0, format: (n) => formatToMoney(n) }}
				/>
			</div>
			{/* Section B — Delivery & Reach KPIs */}
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="CLIENTES ALCANÇADOS"
					icon={<Users className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.clientesAlcancados ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="CLIENTES CONVERTIDOS"
					icon={<UserRoundCheck className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.clientesConvertidos ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="MENSAGENS ENTREGUES"
					icon={<Send className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.totalEntregues ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="FALHAS DE ENVIO"
					icon={<CircleX className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.totalFalhas ?? 0, format: (n) => formatDecimalPlaces(n) }}
					lowerIsBetter
				/>
				<StatUnitCard
					title="TICKET MÉDIO DAS CONVERSÕES"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: performance?.ticketMedioConversao ?? 0, format: (n) => formatToMoney(n) }}
				/>
			</div>

			{/* Section C — Conversion Quality KPIs */}
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="AQUISIÇÕES"
					icon={<UserPlus className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: aquisicoes?.quantidade ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="REATIVAÇÕES"
					icon={<RefreshCw className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: reativacoes?.quantidade ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="ACELERAÇÕES"
					icon={<Zap className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: aceleracoes?.quantidade ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="ANTECIPAÇÃO MÉDIA"
					icon={<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: qualityData?.impactoFrequencia?.mediasDiasAntecipados ?? 0,
						format: (n) => `${formatDecimalPlaces(n, 1, 1)} dias`,
					}}
				/>
				<StatUnitCard
					title="IMPACTO NO TICKET"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: qualityData?.impactoMonetario?.deltaMonetarioPercentualMedio ?? 0,
						format: (n) => `${n > 0 ? "+" : ""}${formatDecimalPlaces(n)}%`,
					}}
				/>
			</div>

			{/* Section D — Time-Series Chart */}
			<WeeklyLimitSection performance={performance} />
			<div className="w-full lg:h-[480px]">
				<CampaignsGraphs
					startDate={filters.startDate}
					endDate={filters.endDate}
					comparingStartDate={comparingFilters.startDate}
					comparingEndDate={comparingFilters.endDate}
					campaignId={campaignId}
				/>
			</div>

			{/* Section E — Conversion Type Distribution */}
			{qualityData ? (
				<>
					<CampaignConversionTypeDistributionSection distribution={qualityData.distribuicaoTipos} />
					<div className="w-full flex flex-col lg:flex-row gap-3">
						<div className="w-full lg:w-1/2">
							<CampaignFrequencyImpactSection frequency={qualityData.impactoFrequencia} />
						</div>
						<div className="w-full lg:w-1/2">
							<CampaignMonetaryImpactSection monetary={qualityData.impactoMonetario} />
						</div>
					</div>
				</>
			) : (
				<div className="w-full flex flex-col gap-3">
					<p className="text-sm text-muted-foreground">Não há dados de qualidade das conversões para exibir.</p>
				</div>
			)}

			<CampaignDispatchesSection campaignId={campaignId} />

			<div className="w-full flex flex-col lg:flex-row gap-3">
				<div className="w-full lg:w-1/2">
					<InteractionsSection campaignId={campaignId} />
				</div>
				<div className="w-full lg:w-1/2">
					<ConversionsSection campaignId={campaignId} startDate={filters.startDate} endDate={filters.endDate} />
				</div>
			</div>
		</div>
	);
}

function CampaignConversionTypeDistributionSection({ distribution }: { distribution: TGetConversionQualityOutput["data"]["distribuicaoTipos"] }) {
	const ConversionTypeDistributionItem = memo(
		function ConversionTypeDistributionItem({ item }: { item: TGetConversionQualityOutput["data"]["distribuicaoTipos"][number] }) {
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
							<span className="text-xs font-semibold text-primary">{formatToMoney(item.receitaIncremental)} incr.</span>
						</div>
					</div>
					<div className="w-full bg-secondary rounded-full h-2">
						<div className={cn("h-2 rounded-full", config.bgClass)} style={{ width: `${Math.min(item.percentual, 100)}%` }} />
					</div>
				</div>
			);
		},
		(prev, next) => prev.item.tipo === next.item.tipo,
	);
	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-between">
				<div className="flex flex-col">
					<h1 className="text-xs font-medium tracking-tight uppercase">CONVERSÕES POR TIPO</h1>
				</div>
				<div className="flex items-center gap-2">
					<Diamond className="w-4 h-4 min-w-4 min-h-4" />
				</div>
			</div>
			<div className="flex w-full flex-col gap-1">
				{distribution.map((item) => (
					<ConversionTypeDistributionItem key={item.tipo} item={item} />
				))}
			</div>
		</div>
	);
}

function CampaignFrequencyImpactSection({ frequency }: { frequency: TGetConversionQualityOutput["data"]["impactoFrequencia"] }) {
	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-between">
				<div className="flex flex-col">
					<h1 className="text-xs font-medium tracking-tight uppercase">IMPACTO NA FREQUÊNCIA</h1>
				</div>
				<div className="flex items-center gap-2">
					<Rocket className="w-4 h-4 min-w-4 min-h-4" />
				</div>
			</div>
			<div className="flex w-full flex-col gap-1">
				<div className="flex flex-col gap-2">
					<ImpactRow label="Compras aceleradas" value={formatDecimalPlaces(frequency.totalAceleradas)} positive />
					<ImpactRow label="Compras atrasadas" value={formatDecimalPlaces(frequency.totalAtrasadas)} positive={false} />
					<ImpactRow label="Antecipação média" value={`${formatDecimalPlaces(frequency.mediasDiasAntecipados, 1, 1)} dias`} positive />
				</div>
			</div>
		</div>
	);
}
function CampaignMonetaryImpactSection({ monetary }: { monetary: TGetConversionQualityOutput["data"]["impactoMonetario"] }) {
	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-between">
				<div className="flex flex-col">
					<h1 className="text-xs font-medium tracking-tight uppercase">IMPACTO NO TICKET</h1>
				</div>
				<div className="flex items-center gap-2">
					<Ticket className="w-4 h-4 min-w-4 min-h-4" />
				</div>
			</div>
			<div className="flex w-full flex-col gap-3">
				<div className="flex flex-col gap-2">
					<ImpactRow label="Compras acima do ticket médio" value={formatDecimalPlaces(monetary.totalAcimaTicket)} positive />
					<ImpactRow label="Compras abaixo do ticket médio" value={formatDecimalPlaces(monetary.totalAbaixoTicket)} positive={false} />
					<ImpactRow
						label="Variação média"
						value={`${monetary.deltaMonetarioPercentualMedio > 0 ? "+" : ""}${formatDecimalPlaces(monetary.deltaMonetarioPercentualMedio)}%`}
						positive={monetary.deltaMonetarioPercentualMedio >= 0}
					/>
				</div>
			</div>
		</div>
	);
}

function ImpactRow({ label, value, positive }: { label: string; value: string; positive: boolean }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-xs font-medium">{label}</span>
			<span className={cn("text-xs font-bold", positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>{value}</span>
		</div>
	);
}

function WeeklyLimitSection({ performance }: { performance: TGetCampaignStatsOutput["data"] | undefined }) {
	const quota = performance?.quota;
	if (!quota) return null;
	const weekly = quota.find((window) => window.tipo === "SEMANAL");
	const daily = quota.find((window) => window.tipo === "DIARIO");
	if (!weekly || !daily) return null;

	// Um envio só sai quando TODAS as janelas têm saldo: o saldo efetivo é o menor entre elas.
	const remainingCandidates = [weekly.campanha.restante, weekly.organizacao.restante, daily.organizacao.restante].filter(
		(value): value is number => value != null,
	);
	const effectiveRemaining = remainingCandidates.length > 0 ? Math.min(...remainingCandidates) : null;

	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="LIMITE SEMANAL DA CAMPANHA"
					icon={<CalendarClock className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: weekly.campanha.limite ?? 0, format: () => formatWeeklyLimitValue(weekly.campanha.limite) }}
				/>
				<StatUnitCard
					title="USADO NESTA SEMANA"
					icon={<Send className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: weekly.campanha.usados, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="SALDO DISPONÍVEL AGORA"
					subtitle="menor saldo entre os limites da campanha (semana) e da organização (dia e semana)"
					icon={<Clock className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: effectiveRemaining ?? 0, format: () => formatWeeklyLimitValue(effectiveRemaining) }}
				/>
				<StatUnitCard
					title="ORGANIZAÇÃO: SEMANA / DIA"
					subtitle={`usados ${formatDecimalPlaces(weekly.organizacao.usados)} de ${formatWeeklyLimitValue(weekly.organizacao.limite)} na semana · ${formatDecimalPlaces(daily.organizacao.usados)} de ${formatWeeklyLimitValue(daily.organizacao.limite)} hoje`}
					icon={<ShieldAlert className="w-4 h-4 min-w-4 min-h-4" />}
					current={{ value: weekly.organizacao.restante ?? 0, format: () => formatWeeklyLimitValue(weekly.organizacao.restante) }}
				/>
			</div>
		</div>
	);
}

function formatWeeklyLimitValue(value: number | null | undefined) {
	if (value == null) return "N/A";
	return formatDecimalPlaces(value);
}

function ConversionsSection({ campaignId, startDate, endDate }: { campaignId: string; startDate: Date; endDate: Date }) {
	const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

	const {
		data: conversionsData,
		isLoading,
		isError,
		isSuccess,
		error,
		filters,
		updateFilters,
	} = useCampaignsConversions({
		initialFilters: {
			campaignId,
			page: 1,
			search: "",
			types: [],
			periodAfter: startDate,
			periodBefore: endDate,
		},
	});

	// Sync parent date filter changes into the hook's internal state
	useEffect(() => {
		updateFilters({ periodAfter: startDate, periodBefore: endDate, page: 1 });
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
		updateFilters({ types: next as typeof filters.types, page: 1 });
	};

	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-between">
				<div className="flex flex-col">
					<h1 className="text-xs font-medium tracking-tight uppercase">CONVERSÕES</h1>
				</div>
				<div className="flex items-center gap-2">
					<ShoppingCart className="w-4 h-4 min-w-4 min-h-4" />
				</div>
			</div>
			<div className="flex w-full flex-col gap-3">
				<div className="w-full flex flex-col gap-1.5">
					<Input
						value={filters.search ?? ""}
						placeholder="Pesquisar por cliente..."
						onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
						className="grow rounded-xl"
					/>
					<div className="w-full flex items-center gap-1.5 flex-wrap">
						{conversionTypeOptions.map((opt) => (
							<button
								key={opt.key}
								type="button"
								onClick={() => toggleType(opt.key)}
								className={cn(
									"flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.65rem] font-bold uppercase transition-colors border",
									selectedTypes.includes(opt.key)
										? `${opt.bgClass} text-white border-transparent`
										: "bg-secondary text-foreground border-transparent hover:bg-secondary/80",
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
				<div className="w-full flex flex-col gap-1.5 max-h-[500px] overflow-y-auto overscroll-y-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 px-2">
					{isLoading ? <LoadingComponent /> : null}
					{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
					{isSuccess ? (
						<div className="w-full flex flex-col gap-1.5">
							{items.length > 0 ? (
								items.map((conversion) => (
									<CampaignConversionCard.Provider key={conversion.id} conversion={conversion}>
										<CampaignConversionCard.Frame>
											<CampaignConversionCard.Header>
												<CampaignConversionCard.Leading>
													<CampaignConversionCard.ConversionType />
													<CampaignConversionCard.ClientChip />
												</CampaignConversionCard.Leading>
												<CampaignConversionCard.Metadata>
													<CampaignConversionCard.ConversionDate />
													<CampaignConversionCard.TimeToConversion />
												</CampaignConversionCard.Metadata>
											</CampaignConversionCard.Header>
											<CampaignConversionCard.Metrics>
												<CampaignConversionCard.SaleValue />
												<CampaignConversionCard.MetricDivider />
												<CampaignConversionCard.AttributedRevenue />
											</CampaignConversionCard.Metrics>
											<CampaignConversionCard.Impacts>
												<CampaignConversionCard.FrequencyImpact />
												<CampaignConversionCard.TicketImpact />
											</CampaignConversionCard.Impacts>
										</CampaignConversionCard.Frame>
									</CampaignConversionCard.Provider>
								))
							) : (
								<p className="w-full flex items-center justify-center text-sm text-muted-foreground py-4">Nenhuma conversão encontrada para este período.</p>
							)}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

function InteractionsSection({ campaignId }: { campaignId: string }) {
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
			orderByField: "dataExecucao",
			orderByDirection: "desc",
			campanhaId: campaignId,
		},
	});

	const items = interactionsResult?.items ?? [];
	const interactionsMatched = interactionsResult?.interactionsMatched ?? 0;
	const totalPages = interactionsResult?.totalPages ?? 0;

	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-between">
				<div className="flex flex-col">
					<h1 className="text-xs font-medium tracking-tight uppercase">INTERAÇÕES</h1>
				</div>
				<div className="flex items-center gap-2">
					<MessageCircle className="w-4 h-4 min-w-4 min-h-4" />
				</div>
			</div>
			<div className="flex w-full flex-col gap-3">
				<div className="w-full flex flex-col gap-1.5">
					<Input
						value={filters.search ?? ""}
						placeholder="Pesquisar interações (título, descrição, cliente)..."
						onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
						className="grow rounded-xl"
					/>
					<div className="w-full flex items-center gap-1.5 flex-wrap">
						{InteractionsSentStatusOptions.map((opt) => {
							const isSelected = filters.status.includes(opt.value);
							return (
								<button
									key={opt.id}
									type="button"
									onClick={() =>
										updateFilters({
											status: isSelected ? filters.status.filter((s) => s !== opt.value) : [...filters.status, opt.value],
											page: 1,
										})
									}
									className={cn(
										"flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.65rem] font-bold uppercase transition-colors border",
										isSelected && opt.className,
									)}
								>
									{opt.label}
								</button>
							);
						})}
					</div>
				</div>
				<GeneralPaginationComponent
					activePage={filters.page ?? 1}
					queryLoading={isLoading}
					selectPage={(page) => updateFilters({ page })}
					totalPages={totalPages}
					itemsMatchedText={`${interactionsMatched} ${interactionsMatched === 1 ? "interação encontrada." : "interações encontradas."}`}
					itemsShowingText={`${items.length} ${items.length === 1 ? "interação exibida." : "interações exibidas."}`}
				/>
				<div className="w-full flex flex-col gap-1.5 max-h-[500px] overflow-y-auto overscroll-y-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 px-2">
					{isLoading ? <LoadingComponent /> : null}
					{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
					{isSuccess ? (
						items.length > 0 ? (
							items.map((interaction) => <InteractionLogCard key={interaction.id} interaction={interaction} />)
						) : (
							<p className="w-full flex items-center justify-center text-sm text-muted-foreground py-4">Nenhuma interação encontrada.</p>
						)
					) : null}
				</div>
			</div>
		</div>
	);
}

function InteractionLogCard({ interaction }: { interaction: TGetCampaignInteractionsOutputItems[number] }) {
	const queryClient = useQueryClient();
	const { mutate: handleRetryInteraction, isPending: retryIsPending } = useMutation({
		mutationKey: ["retry-campaign-interaction", interaction.id],
		mutationFn: async () => await retryCampaignInteraction({ interactionId: interaction.id }),
		onSuccess: async (response) => {
			toast.success(response.message);
			await queryClient.invalidateQueries({ queryKey: ["campaign-interactions-logs"] });
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});
	const sentAt = interaction.dataEnvio ?? interaction.dataExecucao;
	const executionStatus = interaction.statusEnvio === "FALHOU" ? "FALHOU" : "ENVIADA";
	const executionDateText = sentAt ? formatDateAsLocale(sentAt, true) : "Não enviada";

	return (
		<InteractionCard.Provider interaction={interaction}>
			<div className="bg-card border-border flex w-full flex-col gap-2 rounded-xl border px-3 py-4 shadow-2xs">
				<div className="w-full flex flex-col gap-0.5">
					<div className="w-full flex items-center justify-between gap-2">
						<div className="flex items-center gap-3 flex-wrap">
							<ClientHoverCard clientId={interaction.cliente.id}>
								<div className="flex items-center gap-1.5 bg-secondary rounded-xl px-3 py-1.5 cursor-pointer">
									<UserRound className="w-4 h-4 min-w-4 min-h-4" />
									<p className="text-[0.65rem] font-medium tracking-tight uppercase">{interaction.cliente.nome ?? "NÃO INFORMADO"}</p>
								</div>
							</ClientHoverCard>
						</div>
						<div className="flex items-center gap-3">
							<InteractionCard.MessagePreview />
							<InteractionCard.DataForNerds />
							{interaction.erroEnvio ? (
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger
											render={
												<div className="flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[0.65rem] font-bold bg-red-500 text-white">
													<CircleX className="w-4 min-w-4 h-4 min-h-4" />
													<p className="text-[0.65rem] font-medium tracking-tight">FALHOU</p>
												</div>
											}
										/>
										<TooltipContent>
											<p className="text-xs font-medium tracking-tight text-red-500">{interaction.erroEnvio}</p>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							) : null}
							<div
								className={cn("flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[0.65rem] font-bold", {
									"bg-red-500 text-white": executionStatus === "FALHOU",
									"bg-green-500 text-white": executionStatus === "ENVIADA",
								})}
							>
								<CircleCheck className="w-4 min-w-4 h-4 min-h-4" />
								<p className="text-xs font-bold tracking-tight uppercase">{executionStatus}</p>
							</div>
							{interaction.statusEnvio === "FALHOU" ? (
								<Button
									size="sm"
									variant="outline"
									onClick={() => handleRetryInteraction()}
									disabled={retryIsPending}
									className="h-7 text-[0.65rem] font-semibold"
								>
									<RefreshCw className={cn("w-3.5 h-3.5 min-w-3.5 min-h-3.5", { "animate-spin": retryIsPending })} />
									{retryIsPending ? "REENVIANDO..." : "TENTAR NOVAMENTE"}
								</Button>
							) : null}
						</div>
					</div>
					{interaction.descricao && <p className="text-xs font-medium tracking-tight text-muted-foreground">{interaction.descricao}</p>}
				</div>
				<div className="w-full flex items-center justify-end gap-2 flex-wrap">
					<div className="flex items-center gap-1 text-green-500 dark:text-green-400">
						<CalendarCheck className="w-4 h-4 min-w-4 min-h-4" />
						<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic">{executionDateText}</h1>
					</div>
				</div>
			</div>
		</InteractionCard.Provider>
	);
}
