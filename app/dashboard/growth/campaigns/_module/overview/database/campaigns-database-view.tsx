"use client";

import type { TGetCampaignsInput, TGetCampaignsOutputDefault } from "@/app/api/campaigns/route";
import { canEditCampaign, useCampaignPermissions } from "@/app/dashboard/growth/campaigns/_module/shared/campaign-permissions";
import TestCampaign from "@/app/dashboard/growth/campaigns/_module/shared/form/TestCampaign";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import TemplatePreview from "@/components/MessageTemplates/TemplatePreview";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { InteractiveFilter, type InteractiveFilterOption } from "@/components/ui/interactive-filter";
import { formatInteractiveDateRangeSummary, formatInteractiveOptionSummary } from "@/components/ui/interactive-filter-formatting";
import { Input } from "@/components/ui/input";
import { StatBadge } from "@/components/ui/stat-badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getErrorMessage } from "@/lib/errors";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { useCampaigns } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import type { TCampaignTriggerTypeEnum } from "@/schemas/enums";
import { CampaignTriggerTypeOptions } from "@/utils/select-options";
import dayjs from "dayjs";
import {
	AlertTriangle,
	AreaChart,
	BadgeDollarSign,
	Calendar,
	CircleCheck,
	Coins,
	Eye,
	Grid3x3,
	ListFilter,
	MessageCircle,
	MousePointerClick,
	PencilIcon,
	Send,
	SparklesIcon,
	TrendingUp,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export type CampaignsDatabaseInlineFiltersProps = {
	filters: TGetCampaignsInput;
	updateFilters: (filters: Partial<TGetCampaignsInput>) => void;
};
function CampaignsDatabaseInlineFilters({ filters, updateFilters }: CampaignsDatabaseInlineFiltersProps) {
	const triggerOptions = CampaignTriggerTypeOptions as InteractiveFilterOption<TCampaignTriggerTypeEnum>[];
	const hasTriggerTypes = (filters.triggerTypes ?? []).length > 0;
	const hasActiveOnly = Boolean(filters.activeOnly);
	const hasActionWhatsappOnly = Boolean(filters.actionWhatsappOnly);
	const hasCashbackGenerationOnly = Boolean(filters.cashbackGenerationOnly);

	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			<InteractiveFilter.Root className="w-fit">
				<InteractiveFilter.Trigger>
					<InteractiveFilter.Icon>
						<Calendar className="h-4 w-4" />
						<InteractiveFilter.Label>PERÍODO DOS CARDS</InteractiveFilter.Label>
					</InteractiveFilter.Icon>
					<InteractiveFilter.Value>{formatInteractiveDateRangeSummary(filters.statsPeriodAfter, filters.statsPeriodBefore)}</InteractiveFilter.Value>
					<InteractiveFilter.Clear onClear={() => updateFilters({ statsPeriodAfter: null, statsPeriodBefore: null })} />
				</InteractiveFilter.Trigger>
				<InteractiveFilter.Content className="w-auto p-0">
					<InteractiveFilter.DateRangeContent
						value={{
							from: filters.statsPeriodAfter ? new Date(filters.statsPeriodAfter) : undefined,
							to: filters.statsPeriodBefore ? new Date(filters.statsPeriodBefore) : undefined,
						}}
						onChange={(period) => updateFilters({ statsPeriodAfter: period.from ?? null, statsPeriodBefore: period.to ?? null })}
					/>
				</InteractiveFilter.Content>
			</InteractiveFilter.Root>

			{hasTriggerTypes ? (
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<Zap className="h-4 w-4" />
							<InteractiveFilter.Label>GATILHOS</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{formatInteractiveOptionSummary(triggerOptions, filters.triggerTypes ?? [])}</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ triggerTypes: [] })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-80 p-0">
						<CampaignTriggerFilterContent options={triggerOptions} filters={filters} updateFilters={updateFilters} />
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			) : null}

			{hasActiveOnly ? (
				<CampaignBooleanFilter
					label="APENAS ATIVAS"
					value={Boolean(filters.activeOnly)}
					onChange={(activeOnly) => updateFilters({ activeOnly })}
					onClear={() => updateFilters({ activeOnly: false })}
				/>
			) : null}
			{hasActionWhatsappOnly ? (
				<CampaignBooleanFilter
					label="AÇÃO WHATSAPP"
					value={Boolean(filters.actionWhatsappOnly)}
					onChange={(actionWhatsappOnly) => updateFilters({ actionWhatsappOnly })}
					onClear={() => updateFilters({ actionWhatsappOnly: false })}
				/>
			) : null}
			{hasCashbackGenerationOnly ? (
				<CampaignBooleanFilter
					label="GERA CASHBACK"
					value={Boolean(filters.cashbackGenerationOnly)}
					onChange={(cashbackGenerationOnly) => updateFilters({ cashbackGenerationOnly })}
					onClear={() => updateFilters({ cashbackGenerationOnly: false })}
				/>
			) : null}

			<InteractiveFilter.AddFilterRoot className="w-fit">
				<InteractiveFilter.AddFilterTrigger>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>ADICIONAR FILTRO</InteractiveFilter.Label>
				</InteractiveFilter.AddFilterTrigger>
				<InteractiveFilter.AddFilterContent>
					<InteractiveFilter.AddFilterSection heading="Filtros">
						{!hasTriggerTypes ? (
							<InteractiveFilter.AddFilterItem id="triggerTypes" label="GATILHOS" icon={<Zap className="h-4 w-4" />}>
								<CampaignTriggerFilterContent options={triggerOptions} filters={filters} updateFilters={updateFilters} />
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasActiveOnly ? (
							<InteractiveFilter.AddFilterItem id="activeOnly" label="APENAS ATIVAS" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.BooleanContent
									value={Boolean(filters.activeOnly)}
									onChange={(activeOnly) => updateFilters({ activeOnly })}
									label="APENAS ATIVAS"
									trueLabel="ATIVAR"
									falseLabel="DESATIVAR"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasActionWhatsappOnly ? (
							<InteractiveFilter.AddFilterItem id="actionWhatsappOnly" label="AÇÃO WHATSAPP" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.BooleanContent
									value={Boolean(filters.actionWhatsappOnly)}
									onChange={(actionWhatsappOnly) => updateFilters({ actionWhatsappOnly })}
									label="AÇÃO WHATSAPP"
									trueLabel="ATIVAR"
									falseLabel="DESATIVAR"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasCashbackGenerationOnly ? (
							<InteractiveFilter.AddFilterItem id="cashbackGenerationOnly" label="GERA CASHBACK" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.BooleanContent
									value={Boolean(filters.cashbackGenerationOnly)}
									onChange={(cashbackGenerationOnly) => updateFilters({ cashbackGenerationOnly })}
									label="GERA CASHBACK"
									trueLabel="ATIVAR"
									falseLabel="DESATIVAR"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
					</InteractiveFilter.AddFilterSection>
				</InteractiveFilter.AddFilterContent>
			</InteractiveFilter.AddFilterRoot>
		</div>
	);
}

function CampaignTriggerFilterContent({
	options,
	filters,
	updateFilters,
}: {
	options: InteractiveFilterOption<TCampaignTriggerTypeEnum>[];
	filters: TGetCampaignsInput;
	updateFilters: (filters: Partial<TGetCampaignsInput>) => void;
}) {
	return (
		<InteractiveFilter.MultiContent
			options={options}
			value={filters.triggerTypes ?? []}
			onChange={(triggerTypes) => updateFilters({ triggerTypes })}
			onClear={() => updateFilters({ triggerTypes: [] })}
			clearLabel="TODOS"
		/>
	);
}

function CampaignBooleanFilter({
	label,
	value,
	onChange,
	onClear,
}: {
	label: string;
	value: boolean;
	onChange: (value: boolean) => void;
	onClear: () => void;
}) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>{label}</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{value ? "SIM" : "NÃO"}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={onClear} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-64 p-0">
				<InteractiveFilter.BooleanContent value={value} onChange={onChange} onClear={onClear} label={label} trueLabel="ATIVAR" falseLabel="DESATIVAR" />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}
export function CampaignsDatabaseView() {
	const [testingCampaignId, setTestingCampaignId] = useState<string | null>(null);
	const initialStatsPeriodAfter = dayjs().startOf("month").toDate();
	const initialStatsPeriodBefore = dayjs().endOf("month").toDate();
	const {
		data: campaignsResult,
		isLoading,
		isError,
		isSuccess,
		error,
		filters,
		updateFilters,
	} = useCampaigns({
		initialFilters: {
			search: "",
			activeOnly: true,
			statsPeriodAfter: initialStatsPeriodAfter,
			statsPeriodBefore: initialStatsPeriodBefore,
		},
	});
	return (
		<div className="w-full flex flex-col gap-3">
			<div className="flex w-full min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar campanha..."
					onChange={(e) => updateFilters({ search: e.target.value })}
					className="min-w-0 flex-1 rounded-xl"
				/>

				<div className="w-fit shrink-0">
					<DateIntervalInput
						label="Período dos cards"
						labelClassName="hidden"
						className="w-fit hover:bg-accent hover:text-accent-foreground border-none shadow-none"
						value={{
							after: filters.statsPeriodAfter ? new Date(filters.statsPeriodAfter) : undefined,
							before: filters.statsPeriodBefore ? new Date(filters.statsPeriodBefore) : undefined,
						}}
						handleChange={(value) =>
							updateFilters({
								statsPeriodAfter: value.after ? new Date(value.after) : null,
								statsPeriodBefore: value.before ? new Date(value.before) : null,
							})
						}
					/>
				</div>
			</div>
			<CampaignsDatabaseInlineFilters filters={filters} updateFilters={updateFilters} />
			{isLoading ? <p className="w-full flex items-center justify-center animate-pulse">Carregando campanhas...</p> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				<div className="w-full flex flex-col gap-1.5">
					{campaignsResult && campaignsResult.length > 0 ? (
						campaignsResult.map((campaign) => (
							<CampaignsPageCampaignCard key={campaign.id} campaign={campaign} onTestCampaign={() => setTestingCampaignId(campaign.id)} />
						))
					) : (
						<p className="w-full flex items-center justify-center">Nenhuma campanha encontrada</p>
					)}
				</div>
			) : null}
			{testingCampaignId ? <TestCampaign campaignId={testingCampaignId} closeModal={() => setTestingCampaignId(null)} /> : null}
		</div>
	);
}

function CampaignsPageCampaignCard({ campaign, onTestCampaign }: { campaign: TGetCampaignsOutputDefault[number]; onTestCampaign: () => void }) {
	const campaignPermissions = useCampaignPermissions();
	const stats = campaign.estatisticas ?? {
		envios: 0,
		entregues: 0,
		convertidos: 0,
		taxaConversao: 0,
		receita: 0,
	};

	const triggerType = useMemo(() => {
		return CampaignTriggerTypeOptions.find((t) => t.value === campaign.gatilhoTipo);
	}, [campaign.gatilhoTipo]);
	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="w-full flex flex-col gap-0.5">
				<div className="w-full flex items-center justify-between gap-2 flex-col-reverse lg:flex-row">
					<div className="flex items-center gap-2">
						<h1 className="text-xs font-bold tracking-tight lg:text-sm">{campaign.titulo}</h1>
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger
									render={
										<Chip.Root variant="ghost" size="md" shape="xl" className="cursor-default text-foreground">
											<Chip.Icon>
												<Grid3x3 className="w-4 min-w-4 h-4 min-h-4" />
											</Chip.Icon>
											<Chip.Label caps weight="bold">
												{campaign.segmentacoes.length} SEGMENTAÇÕES
											</Chip.Label>
										</Chip.Root>
									}
								/>
								<TooltipContent className="max-w-xs">Incluindo {campaign.segmentacoes.map((s) => s.segmentacao).join(", ")}</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
					<div className="flex items-center gap-2">
						<HoverCard>
							<HoverCardTrigger
								delay={200}
								render={
									<Button type="button" size="sm" variant="ghost" className="flex items-center gap-1.5">
										<Eye className="h-3.5 w-3.5" />
										PREVIEW DO TEMPLATE
									</Button>
								}
							/>
							<HoverCardContent
								className="w-[360px] p-2 overflow-auto max-h-[70vh] scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30"
								side="left"
								align="center"
							>
								<TemplatePreview content={campaign.whatsappTemplate.conteudo} />
							</HoverCardContent>
						</HoverCard>
						{!campaign.whatsappConexaoTelefoneId ? (
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger
										render={
											<Chip.Root variant="brand" size="md" shape="xl">
												<Chip.Icon>
													<AlertTriangle className="w-4 min-w-4 h-4 min-h-4" />
												</Chip.Icon>
												<Chip.Label caps weight="bold">
													WHATSAPP NÃO CONFIGURADO
												</Chip.Label>
											</Chip.Root>
										}
									/>
									<TooltipContent className="max-w-xs">
										Sem uma conexão de WhatsApp, a campanha seguirá apenas por e-mail quando houver endereço disponível.
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						) : null}

						<Chip.Root variant={campaign.ativo ? "positiveSolid" : "neutralSolid"} size="md" shape="xl">
							<Chip.Icon>
								<CircleCheck className="w-4 min-w-4 h-4 min-h-4" />
							</Chip.Icon>
							<Chip.Label caps weight="bold">
								{campaign.ativo ? "ATIVO" : "INATIVO"}
							</Chip.Label>
						</Chip.Root>
					</div>
				</div>
				<p className="text-xs font-medium tracking-tight text-muted-foreground">{campaign.descricao}</p>
			</div>
			{/** CONFIG BADGES */}
			<div className="w-full flex items-center justify-start gap-2 flex-wrap">
				<StatBadge
					icon={<SparklesIcon className="w-4 h-4 min-w-4 min-h-4" />}
					value={`GATILHO: ${triggerType?.label}`}
					tooltipContent={triggerType?.description}
				/>
				<StatBadge
					icon={<Coins className="w-4 h-4 min-w-4 min-h-4" />}
					value={campaign.cashbackGeracaoAtivo ? "GERAÇÃO DE CASHBACK ATIVA" : "GERAÇÃO DE CASHBACK INATIVA"}
					tooltipContent="Configuração de geração de cashback para clientes que ativarem esta campanha."
				/>
			</div>
			<div className="w-full flex items-center justify-center lg:justify-between gap-2 flex-wrap">
				<div className="flex items-center gap-2 flex-wrap py-1.5">
					<StatBadge
						icon={<MessageCircle className="w-4 h-4 min-w-4 min-h-4" />}
						value={`${formatDecimalPlaces(stats.envios)} ENVIOS`}
						tooltipContent="Total de mensagens enviadas no período selecionado."
					/>
					{/* <StatBadge
						icon={<UserRoundCheck className="w-4 h-4 min-w-4 min-h-4" />}
						value={`${formatDecimalPlaces(stats.entregues)} ENTREGUES`}
						tooltipContent="Mensagens com status DELIVERED ou READ."
					/> */}
					<StatBadge
						icon={<MousePointerClick className="w-4 h-4 min-w-4 min-h-4" />}
						value={`${formatDecimalPlaces(stats.convertidos)} CONVERTIDOS`}
						tooltipContent="Quantidade de conversões atribuídas à campanha no período."
					/>
					<StatBadge
						icon={<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />}
						value={`${formatDecimalPlaces(stats.taxaConversao)}% TAXA`}
						tooltipContent="Taxa de conversão calculada por convertidos/envios."
					/>
					<StatBadge
						icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
						value={formatToMoney(stats.receita)}
						tooltipContent="Receita total atribuída às conversões da campanha."
					/>
				</div>
				<div className="flex items-center gap-1.5">
					{campaignPermissions.editar ? (
						<Button variant="ghost" className="flex items-center gap-1.5" size="sm" onClick={onTestCampaign}>
							<Send className="w-3 min-w-3 h-3 min-h-3" />
							TESTAR
						</Button>
					) : null}
					{canEditCampaign(campaignPermissions, campaign) ? (
						<Button variant="ghost" className="flex items-center gap-1.5" size="sm" asChild>
							<Link href={`${appRoutes.growth.campaign(campaign.id)}?view=config`}>
								<PencilIcon className="w-3 min-w-3 h-3 min-h-3" />
								EDITAR
							</Link>
						</Button>
					) : null}
					<Button variant="link" className="flex items-center gap-1.5" size="sm" asChild>
						<Link href={appRoutes.growth.campaign(campaign.id)}>
							<AreaChart className="w-3 min-w-3 h-3 min-h-3" />
							VER RESULTADOS
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
