"use client";
import type { TGetCampaignInteractionsOutputItems } from "@/app/api/campaigns/interactions/route";
import type { TGetConversionQualityOutput } from "@/app/api/campaigns/stats/conversion-quality/route";
import { getTriggerMeta } from "@/app/dashboard/growth/campaigns/_module/builder/helpers/triggers";
import CampaignDispatchesSection from "@/app/dashboard/growth/campaigns/_module/detail/components/campaign-dispatches-section";
import { DISPATCH_ORIGIN_LABELS, formatDispatchMoment } from "@/app/dashboard/growth/campaigns/_module/detail/helpers/dispatch-labels";
import { CampaignsTrendChart } from "@/app/dashboard/growth/campaigns/_module/shared/stats/campaigns-trend-chart";
import {
	FunnelStrip,
	ResultHeadline,
	RevenueSplitBar,
	SplitFigure,
	StripBadge,
} from "@/app/dashboard/growth/campaigns/_module/shared/stats/result-panel";
import { CampaignConversionCard, CONVERSION_TYPE_CONFIG } from "@/components/Campaigns/Conversions/CampaignConversionCard";
import ClientHoverCard from "@/components/Clients/ClientHoverCard";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import { InteractionCard } from "@/components/Interactions/InteractionCard";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import {
	CAMPAIGN_STATS_PERIOD_PRESETS,
	formatCampaignStatsPeriodLabel,
	formatCampaignStatsPeriodRange,
	resolveCampaignStatsComparisonPeriod,
	type TStatsPeriod,
} from "@/lib/campaigns/stats-period";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { retryCampaignInteraction } from "@/lib/mutations/campaigns";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useCampaignInteractionsLogs, useCampaignStats, useCampaignsConversions, useConversionQuality } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import { InteractionsSentStatusOptions } from "@/utils/select-options";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	BadgeDollarSign,
	CalendarCheck,
	CalendarX,
	ChevronDown,
	ChevronUp,
	CircleCheck,
	CircleX,
	Clock,
	Code,
	Diamond,
	FileText,
	Megaphone,
	MessageCircle,
	RefreshCw,
	Rocket,
	Search,
	Send,
	ShoppingCart,
	Sparkles,
	Ticket,
	UserRound,
	UserRoundCheck,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type CampaignStatsViewProps = {
	campaignId: string;
};

function percentage(part: number, total: number) {
	return total > 0 ? (part / total) * 100 : 0;
}

export default function CampaignStatsView({ campaignId }: CampaignStatsViewProps) {
	const [period, setPeriod] = useState<TStatsPeriod>(() => CAMPAIGN_STATS_PERIOD_PRESETS[0].getValue(new Date()));
	const comparingPeriod = resolveCampaignStatsComparisonPeriod(period);

	const { data: performance } = useCampaignStats({ campaignId, ...period });
	const { data: previousPerformance } = useCampaignStats({ campaignId, ...comparingPeriod });
	const { data: qualityData, isLoading: qualityLoading } = useConversionQuality({ campanhaId: campaignId, ...period });

	const comparingLabel = formatCampaignStatsPeriodLabel(comparingPeriod);
	const previousPrefix = /^\d/.test(comparingLabel) ? "No período anterior" : "No mês anterior";
	const receita = performance?.receitaAtribuida ?? 0;
	const receitaIncremental = performance?.receitaIncremental ?? 0;
	const interacoes = performance?.interacoesEnviadas ?? 0;
	const clientesAlcancados = performance?.clientesAlcancados ?? 0;
	const clientesConvertidos = performance?.clientesConvertidos ?? 0;
	const conversoes = performance?.conversoes ?? 0;
	const falhasEnvio = performance?.totalFalhasEnvio ?? 0;
	const falhasPosEnvio = performance?.totalFalhasPosEnvio ?? 0;

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex w-full items-center justify-end">
				<DateIntervalInput
					label="Período"
					labelClassName="hidden"
					className="shrink-0 border-none shadow-none hover:bg-accent hover:text-accent-foreground"
					value={{ after: period.startDate, before: period.endDate }}
					handleChange={(value) => {
						if (!value.after || !value.before) return;
						setPeriod({ startDate: new Date(value.after), endDate: new Date(value.before) });
					}}
				/>
			</div>

			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<BadgeDollarSign />
					</Section.Icon>
					<Section.Title>Resultado da campanha</Section.Title>
					<Section.Actions>
						<span className="text-[0.7rem] font-medium text-muted-foreground">Comparado com {formatCampaignStatsPeriodRange(comparingPeriod)}</span>
					</Section.Actions>
				</Section.Header>
				<Section.Body>
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
						<div className="flex flex-col gap-4 lg:border-r lg:border-border lg:pr-6">
							<ResultHeadline
								label="Receita atribuída"
								value={receita}
								previous={previousPerformance?.receitaAtribuida}
								previousText={previousPerformance ? `${previousPrefix}: ${formatToMoney(previousPerformance.receitaAtribuida)}` : undefined}
							/>
							<RevenueSplitBar part={receitaIncremental} total={receita} />
							<p className="flex flex-wrap items-center gap-x-1.5 text-[0.7rem] text-muted-foreground">
								<Sparkles className="size-3.5 min-h-3.5 min-w-3.5 text-[#E0A100]" />
								<strong className="text-sm text-foreground tabular-nums">{formatToMoney(receitaIncremental)}</strong>
								receita incremental · {formatDecimalPlaces(percentage(receitaIncremental, receita))}% ·{" "}
								{formatDecimalPlaces(performance?.conversoesIncrementais ?? 0)} conversões
							</p>
							<div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
								<SplitFigure icon={BadgeDollarSign} label="Ticket médio das conversões" value={formatToMoney(performance?.ticketMedioConversao ?? 0)} />
								<SplitFigure
									icon={Clock}
									label="Tempo médio de conversão"
									value={`${formatDecimalPlaces(performance?.tempoMedioConversaoHoras ?? 0, 1, 1)} horas`}
								/>
							</div>
						</div>
						<CampaignsTrendChart
							campaignId={campaignId}
							startDate={period.startDate}
							endDate={period.endDate}
							comparingStartDate={comparingPeriod.startDate}
							comparingEndDate={comparingPeriod.endDate}
							currentLabel={formatCampaignStatsPeriodLabel(period)}
							comparingLabel={comparingLabel}
						/>
					</div>
				</Section.Body>
				<Section.Bleed>
					<FunnelStrip
						cells={[
							{
								key: "sent",
								title: "Interações enviadas",
								icon: MessageCircle,
								value: formatDecimalPlaces(interacoes),
								hint: previousPerformance ? `${previousPrefix}: ${formatDecimalPlaces(previousPerformance.interacoesEnviadas)}` : undefined,
							},
							{
								key: "delivered",
								title: "Mensagens entregues",
								icon: Send,
								value: formatDecimalPlaces(performance?.totalEntregues ?? 0),
								hint:
									falhasEnvio + falhasPosEnvio > 0 ? (
										<span className="flex flex-col normal-case">
											<span className="text-red-600 dark:text-red-400">
												{formatDecimalPlaces(percentage(performance?.totalEntregues ?? 0, interacoes))}% · {formatDecimalPlaces(falhasEnvio + falhasPosEnvio)}{" "}
												falhas
											</span>
											<span>
												{formatDecimalPlaces(falhasEnvio)} no envio · {formatDecimalPlaces(falhasPosEnvio)} reportadas pela Meta
											</span>
										</span>
									) : (
										`${formatDecimalPlaces(percentage(performance?.totalEntregues ?? 0, interacoes))}% das enviadas`
									),
								flowsFromPrevious: true,
							},
							{
								key: "reached",
								title: "Clientes alcançados",
								icon: Users,
								value: formatDecimalPlaces(clientesAlcancados),
								hint: "clientes únicos",
								flowsFromPrevious: true,
							},
							{
								key: "converted",
								title: "Clientes convertidos",
								icon: UserRoundCheck,
								value: formatDecimalPlaces(clientesConvertidos),
								hint: `${formatDecimalPlaces(percentage(clientesConvertidos, clientesAlcancados))}% dos alcançados`,
								flowsFromPrevious: true,
							},
							{
								key: "conversions",
								title: "Total de conversões",
								icon: Sparkles,
								value: formatDecimalPlaces(conversoes),
								badge: <StripBadge>{formatDecimalPlaces(performance?.taxaConversao ?? 0)}% taxa</StripBadge>,
								hint: `${formatDecimalPlaces(clientesConvertidos > 0 ? conversoes / clientesConvertidos : 0)} por cliente convertido`,
							},
						]}
					/>
				</Section.Bleed>
			</Section.Root>

			<ConversionTypesSection quality={qualityData} isLoading={qualityLoading} />

			<CampaignDispatchesSection campaignId={campaignId} />

			<div className="grid w-full grid-cols-1 items-start gap-3 lg:grid-cols-2">
				<InteractionsSection campaignId={campaignId} />
				<ConversionsSection campaignId={campaignId} startDate={period.startDate} endDate={period.endDate} />
			</div>
		</div>
	);
}

function ConversionTypesSection({ quality, isLoading }: { quality: TGetConversionQualityOutput["data"] | undefined; isLoading: boolean }) {
	const distribution = [...(quality?.distribuicaoTipos ?? [])].sort((a, b) => b.quantidade - a.quantidade);
	const total = distribution.reduce((acc, item) => acc + item.quantidade, 0);
	const frequency = quality?.impactoFrequencia;
	const monetary = quality?.impactoMonetario;
	const ticketDelta = monetary?.deltaMonetarioPercentualMedio ?? 0;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Diamond />
				</Section.Icon>
				<Section.Title>Conversões por tipo</Section.Title>
				<Section.Count>{formatDecimalPlaces(total)}</Section.Count>
			</Section.Header>
			<Section.Bleed>
				<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
					<div className={cn("flex flex-col gap-3 px-4 py-4", isLoading && "animate-pulse")}>
						<div className="flex h-2.5 w-full gap-1">
							{total > 0 ? (
								distribution.map((item) => (
									<div
										key={item.tipo}
										className={cn("h-full min-w-2 rounded-full", CONVERSION_TYPE_CONFIG[item.tipo ?? ""]?.bgClass ?? "bg-gray-400")}
										style={{ width: `${percentage(item.quantidade, total)}%` }}
									/>
								))
							) : (
								<div className="h-full w-full rounded-full bg-muted" />
							)}
						</div>
						{distribution.length > 0 ? (
							<table className="w-full text-xs tabular-nums">
								<thead>
									<tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase">
										<th className="py-1.5 text-left font-bold">Tipo</th>
										<th className="py-1.5 text-right font-bold">Conv.</th>
										<th className="py-1.5 text-right font-bold">%</th>
										<th className="hidden py-1.5 text-right font-bold sm:table-cell">Receita</th>
										<th className="py-1.5 text-right font-bold">Incremental</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{distribution.map((item) => {
										const config = CONVERSION_TYPE_CONFIG[item.tipo ?? ""];
										const Icon = config?.icon;
										return (
											<tr key={item.tipo}>
												<td className="py-2">
													<span className="flex items-center gap-1.5 font-semibold">
														{Icon ? <Icon className={cn("size-3.5 min-h-3.5 min-w-3.5", config.textClass)} /> : null}
														{config?.label ?? item.label}
													</span>
												</td>
												<td className="py-2 text-right font-bold">{formatDecimalPlaces(item.quantidade)}</td>
												<td className={cn("py-2 text-right font-semibold", config?.textClass)}>{formatDecimalPlaces(item.percentual)}%</td>
												<td className="hidden py-2 text-right text-muted-foreground sm:table-cell">{formatToMoney(item.receita)}</td>
												<td className="py-2 text-right font-bold text-primary">{item.receitaIncremental > 0 ? formatToMoney(item.receitaIncremental) : "—"}</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						) : (
							<p className="py-4 text-center text-sm text-muted-foreground">Nenhuma conversão no período.</p>
						)}
					</div>
					<div className="flex flex-col border-t border-border lg:border-t-0 lg:border-l">
						<ImpactBar
							icon={Rocket}
							title="Impacto na frequência"
							value={`${formatDecimalPlaces(frequency?.mediasDiasAntecipados ?? 0)} dias`}
							valueClassName="text-green-600 dark:text-green-400"
							positive={{ value: frequency?.totalAceleradas ?? 0, label: "compras aceleradas" }}
							negative={{ value: frequency?.totalAtrasadas ?? 0, label: "atrasadas" }}
							hint="Antecipação média"
						/>
						<ImpactBar
							icon={Ticket}
							title="Impacto no ticket"
							value={`${ticketDelta > 0 ? "+" : ""}${formatDecimalPlaces(ticketDelta)}%`}
							valueClassName={ticketDelta >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
							positive={{ value: monetary?.totalAcimaTicket ?? 0, label: "acima do ticket médio" }}
							negative={{ value: monetary?.totalAbaixoTicket ?? 0, label: "abaixo" }}
							hint="Variação média"
							className="border-t border-border"
						/>
					</div>
				</div>
			</Section.Bleed>
		</Section.Root>
	);
}

type ImpactBarProps = {
	icon: typeof Rocket;
	title: string;
	value: string;
	valueClassName?: string;
	positive: { value: number; label: string };
	negative: { value: number; label: string };
	hint: string;
	className?: string;
};

function ImpactBar({ icon: Icon, title, value, valueClassName, positive, negative, hint, className }: ImpactBarProps) {
	const total = positive.value + negative.value;
	return (
		<div className={cn("flex flex-1 flex-col gap-2 px-4 py-4", className)}>
			<div className="flex items-center justify-between gap-2">
				<span className="flex items-center gap-1.5 text-label">
					<Icon className="size-4 min-h-4 min-w-4" />
					{title}
				</span>
				<span className={cn("text-xl font-extrabold tracking-tight tabular-nums", valueClassName)}>{value}</span>
			</div>
			<div className="flex h-1.5 w-full gap-1">
				{total > 0 ? (
					<>
						{positive.value > 0 ? <div className="h-full rounded-full bg-green-500" style={{ width: `${percentage(positive.value, total)}%` }} /> : null}
						{negative.value > 0 ? <div className="h-full flex-1 rounded-full bg-red-500" /> : null}
					</>
				) : (
					<div className="h-full w-full rounded-full bg-muted" />
				)}
			</div>
			<div className="flex items-center justify-between gap-2 text-[0.7rem] font-semibold tabular-nums">
				<span className="text-green-600 dark:text-green-400">
					{formatDecimalPlaces(positive.value)} {positive.label}
				</span>
				<span className="text-red-600 dark:text-red-400">
					{formatDecimalPlaces(negative.value)} {negative.label}
				</span>
			</div>
			<span className="text-[0.7rem] text-muted-foreground">{hint}</span>
		</div>
	);
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
			pageSize: DEFAULT_PAGE_SIZE,
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

	const toggleType = (key: string) => {
		const next = selectedTypes.includes(key) ? selectedTypes.filter((k) => k !== key) : [...selectedTypes, key];
		setSelectedTypes(next);
		updateFilters({ types: next as typeof filters.types, page: 1 });
	};

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<ShoppingCart />
				</Section.Icon>
				<Section.Title>Conversões</Section.Title>
				<Section.Count>{formatDecimalPlaces(conversionsMatched)}</Section.Count>
			</Section.Header>
			<Section.Body>
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={filters.search ?? ""}
						placeholder="Pesquisar por cliente..."
						onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
						className="rounded-xl pl-9"
					/>
				</div>
				<div className="flex w-full flex-wrap items-center gap-1.5">
					{Object.entries(CONVERSION_TYPE_CONFIG).map(([key, config]) => {
						const Icon = config.icon;
						const active = selectedTypes.includes(key);
						return (
							<button
								key={key}
								type="button"
								aria-pressed={active}
								onClick={() => toggleType(key)}
								className={cn(
									"flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.65rem] font-bold uppercase transition-colors",
									active ? `${config.bgClass} border-transparent text-white` : "border-border bg-card text-foreground hover:bg-secondary",
								)}
							>
								<Icon className="size-3.5 min-h-3.5 min-w-3.5" />
								{config.label}
							</button>
						);
					})}
				</div>
				<div className="flex max-h-[640px] w-full flex-col gap-1.5 overflow-y-auto overscroll-y-auto pr-1 scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
					{isLoading ? <LoadingComponent /> : null}
					{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
					{isSuccess ? (
						items.length > 0 ? (
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
							<p className="flex w-full items-center justify-center py-4 text-sm text-muted-foreground">Nenhuma conversão encontrada para este período.</p>
						)
					) : null}
				</div>
				<GeneralPaginationComponent
					activePage={filters.page ?? 1}
					queryLoading={isLoading}
					selectPage={(page) => updateFilters({ page })}
					totalPages={totalPages}
					pageSize={filters.pageSize}
					onPageSizeChange={(pageSize) => updateFilters({ pageSize, page: 1 })}
					itemsMatchedText={conversionsMatched === 1 ? "1 conversão encontrada" : `${formatDecimalPlaces(conversionsMatched)} conversões encontradas`}
					itemsShowingText={`mostrando ${items.length}`}
					sticky={false}
				/>
			</Section.Body>
		</Section.Root>
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
			pageSize: DEFAULT_PAGE_SIZE,
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
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<MessageCircle />
				</Section.Icon>
				<Section.Title>Interações</Section.Title>
				<Section.Count>{formatDecimalPlaces(interactionsMatched)}</Section.Count>
			</Section.Header>
			<Section.Body>
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={filters.search ?? ""}
						placeholder="Pesquisar interações (título, descrição, cliente)..."
						onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
						className="rounded-xl pl-9"
					/>
				</div>
				<div className="flex w-full flex-wrap items-center gap-1.5">
					{InteractionsSentStatusOptions.map((opt) => {
						const isSelected = filters.status.includes(opt.value);
						return (
							<button
								key={opt.id}
								type="button"
								aria-pressed={isSelected}
								onClick={() =>
									updateFilters({
										status: isSelected ? filters.status.filter((s) => s !== opt.value) : [...filters.status, opt.value],
										page: 1,
									})
								}
								className={cn(
									"flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.65rem] font-bold uppercase transition-colors [&_svg]:size-3.5",
									isSelected ? opt.className : "border-border bg-card hover:bg-secondary",
								)}
							>
								{opt.icon}
								{opt.label}
							</button>
						);
					})}
				</div>
				<div className="flex max-h-[640px] w-full flex-col gap-1.5 overflow-y-auto overscroll-y-auto pr-1 scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
					{isLoading ? <LoadingComponent /> : null}
					{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
					{isSuccess ? (
						items.length > 0 ? (
							items.map((interaction) => <InteractionLogCard key={interaction.id} interaction={interaction} />)
						) : (
							<p className="flex w-full items-center justify-center py-4 text-sm text-muted-foreground">Nenhuma interação encontrada.</p>
						)
					) : null}
				</div>
				<GeneralPaginationComponent
					activePage={filters.page ?? 1}
					queryLoading={isLoading}
					selectPage={(page) => updateFilters({ page })}
					totalPages={totalPages}
					pageSize={filters.pageSize}
					onPageSizeChange={(pageSize) => updateFilters({ pageSize, page: 1 })}
					itemsMatchedText={interactionsMatched === 1 ? "1 interação encontrada" : `${formatDecimalPlaces(interactionsMatched)} interações encontradas`}
					itemsShowingText={`mostrando ${items.length}`}
					sticky={false}
				/>
			</Section.Body>
		</Section.Root>
	);
}

function InteractionLogCard({ interaction }: { interaction: TGetCampaignInteractionsOutputItems[number] }) {
	const queryClient = useQueryClient();
	const [expanded, setExpanded] = useState(false);
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
	const failed = interaction.statusEnvio === "FALHOU";
	const sentAt = interaction.dataEnvio ?? interaction.dataExecucao;
	const trigger = getTriggerMeta(interaction.campanha?.gatilhoTipo);
	const TriggerIcon = trigger?.icon ?? Megaphone;
	const templateName = interaction.campanha?.whatsappTemplate?.nome;

	return (
		<InteractionCard.Provider interaction={interaction}>
			<div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-card px-3 py-3 shadow-2xs">
				<div className="flex w-full flex-wrap items-center justify-between gap-2">
					<ClientHoverCard clientId={interaction.cliente.id}>
						<div className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-secondary px-3 py-1.5">
							<UserRound className="size-4 min-h-4 min-w-4" />
							<p className="text-[0.65rem] font-medium tracking-tight uppercase">{interaction.cliente.nome ?? "NÃO INFORMADO"}</p>
						</div>
					</ClientHoverCard>
					<div className="flex items-center gap-1.5">
						<InteractionCard.MessagePreview />
						<InteractionCard.DataForNerds />
						{failed ? (
							<Button
								size="sm"
								variant="outline"
								onClick={() => handleRetryInteraction()}
								disabled={retryIsPending}
								className="h-7 text-[0.65rem] font-semibold"
							>
								<RefreshCw className={cn("size-3.5", { "animate-spin": retryIsPending })} />
								{retryIsPending ? "REENVIANDO..." : "TENTAR NOVAMENTE"}
							</Button>
						) : null}
						<span
							className={cn(
								"flex items-center gap-1 rounded-md px-1.5 py-1 text-[0.65rem] font-bold uppercase text-white",
								failed ? "bg-red-500" : "bg-green-500",
							)}
						>
							{failed ? <CircleX className="size-3.5" /> : <CircleCheck className="size-3.5" />}
							{failed ? "Falhou" : "Enviada"}
						</span>
					</div>
				</div>
				{interaction.descricao ? <p className="text-xs font-medium text-muted-foreground">{interaction.descricao}</p> : null}
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] text-muted-foreground">
					{interaction.campanha?.titulo ? (
						<span className="flex items-center gap-1">
							<TriggerIcon className="size-3.5 min-h-3.5 min-w-3.5" />
							{interaction.campanha.titulo}
						</span>
					) : null}
					{templateName ? (
						<span className="flex items-center gap-1 font-mono">
							<FileText className="size-3.5 min-h-3.5 min-w-3.5" />
							{templateName}
						</span>
					) : null}
				</div>
				<div className="flex w-full items-center justify-between gap-2">
					<button
						type="button"
						onClick={() => setExpanded((value) => !value)}
						aria-expanded={expanded}
						className="flex items-center gap-1 text-[0.65rem] font-bold text-primary uppercase hover:underline"
					>
						{expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
						{expanded ? "Ocultar detalhes" : "Detalhes"}
					</button>
					<span
						className={cn(
							"flex items-center gap-1 text-[0.65rem] italic",
							sentAt && !failed ? "text-green-600 dark:text-green-400" : "text-muted-foreground",
						)}
					>
						{sentAt && !failed ? <CalendarCheck className="size-3.5" /> : <CalendarX className="size-3.5" />}
						{sentAt && !failed ? formatDateAsLocale(sentAt, true) : "Não enviada"}
					</span>
				</div>
				{expanded ? <InteractionTimeline interaction={interaction} /> : null}
			</div>
		</InteractionCard.Provider>
	);
}

function InteractionTimeline({ interaction }: { interaction: TGetCampaignInteractionsOutputItems[number] }) {
	const failed = interaction.statusEnvio === "FALHOU";
	const sentAt = interaction.dataEnvio ?? interaction.dataExecucao;
	const steps: { key: string; label: string; date: string | null; detail?: string | null; tone: "muted" | "green" | "red" }[] = [
		{
			key: "created",
			label: "Criada",
			date: formatDateAsLocale(interaction.dataInsercao, true),
			detail: interaction.disparo
				? `Disparo ${formatDispatchMoment(interaction.disparo)} · ${DISPATCH_ORIGIN_LABELS[interaction.disparo.origem]}`
				: null,
			tone: "muted",
		},
		failed
			? { key: "failed", label: "Falhou", date: sentAt ? formatDateAsLocale(sentAt, true) : null, detail: interaction.erroEnvio, tone: "red" }
			: { key: "sent", label: "Enviada", date: sentAt ? formatDateAsLocale(sentAt, true) : null, tone: "green" },
	];

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3">
			<ol className="flex flex-col gap-3">
				{steps.map((step) => (
					<li key={step.key} className="flex items-start gap-2">
						<span
							className={cn(
								"mt-1 size-2.5 shrink-0 rounded-full",
								step.tone === "green" && "bg-green-500",
								step.tone === "red" && "bg-red-500",
								step.tone === "muted" && "bg-muted-foreground/50",
							)}
						/>
						<div className="flex min-w-0 flex-col">
							<span className="text-[0.7rem] font-bold uppercase">
								{step.label} {step.date ? <span className="font-normal text-muted-foreground normal-case">{step.date}</span> : null}
							</span>
							{step.detail ? (
								<span className={cn("text-[0.7rem]", step.tone === "red" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{step.detail}</span>
							) : null}
						</div>
					</li>
				))}
			</ol>
			<div className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
				<Code className="size-3.5" />
				<span>ID</span>
				<span className="truncate font-mono">{interaction.id}</span>
				<CopyButton value={interaction.id} label="Copiar ID da interação" />
			</div>
		</div>
	);
}
