"use client";
import type { TGetCampaignAnalyticsInput } from "@/app/api/campaigns/analytics/route";
import type { TGetCampaignsOutputDefault } from "@/app/api/campaigns/route";
import CampaignsBySegmentation from "@/components/Campaigns/CampaignsBySegmentation";
import CampaignsConversionQuality from "@/components/Campaigns/CampaignsConversionQuality";
import CampaignsFunnel from "@/components/Campaigns/CampaignsFunnel";
import CampaignsGraphs from "@/components/Campaigns/CampaignsGraphs";
import CampaignsRanking from "@/components/Campaigns/CampaignsRanking";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import ControlCampaign from "@/components/Modals/Campaigns/ControlCampaign";
import NewCampaign from "@/components/Modals/Campaigns/NewCampaign";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useCampaignAnalytics, useCampaigns, useConversionQuality } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
	BadgeDollarSign,
	CircleCheck,
	Database,
	Grid3x3,
	ListFilter,
	MessageCircle,
	MousePointerClick,
	PencilIcon,
	Plus,
	RefreshCw,
	TrendingUp,
	UserPlus,
	Zap,
} from "lucide-react";
import { useState } from "react";

type CampaignsPageProps = {
	user: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};
export default function CampaignsPage({ user, membership }: CampaignsPageProps) {
	const [viewMode, setViewMode] = useState<"stats" | "database">("stats");
	const [newCampaignModalIsOpen, setNewCampaignModalIsOpen] = useState<boolean>(false);

	return (
		<div className="w-full h-full flex flex-col gap-3">
			<Tabs value={viewMode} onValueChange={(v: string) => setViewMode(v as "stats" | "database")}>
				<TabsList className="flex items-center gap-1.5 w-fit h-fit self-start rounded-lg px-2 py-1">
					<TabsTrigger value="stats" className="flex items-center gap-1.5 px-2 py-2 rounded-lg">
						<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />
						Estatísticas
					</TabsTrigger>
					<TabsTrigger value="database" className="flex items-center gap-1.5 px-2 py-2 rounded-lg">
						<Database className="w-4 h-4 min-w-4 min-h-4" />
						Minhas Campanhas
					</TabsTrigger>
				</TabsList>
				<TabsContent value="stats" className="flex flex-col gap-3">
					<CampaignsStatsView />
				</TabsContent>
				<TabsContent value="database" className="flex flex-col gap-3">
					<CampaignsDatabaseView user={user} membership={membership} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function CampaignsDatabaseView({ user, membership }: { user: TAuthUserSession["user"]; membership: NonNullable<TAuthUserSession["membership"]> }) {
	const queryClient = useQueryClient();
	const [filterMenuIsOpen, setFilterMenuIsOpen] = useState<boolean>(false);
	const [newCampaignModalIsOpen, setNewCampaignModalIsOpen] = useState<boolean>(false);
	const [editCampaignModalId, setEditCampaignModalId] = useState<string | null>(null);
	const {
		data: campaignsResult,
		queryKey,
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
		},
	});
	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey: queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey: queryKey });
	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center justify-end gap-2">
				<Button className="flex items-center gap-2" size="sm" onClick={() => setNewCampaignModalIsOpen(true)}>
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					NOVA CAMPANHA
				</Button>
			</div>
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar campanha..."
					onChange={(e) => updateFilters({ search: e.target.value })}
					className="grow rounded-xl"
				/>
				<Button className="flex items-center gap-2" size="sm" onClick={() => setFilterMenuIsOpen(true)}>
					<ListFilter className="w-4 h-4 min-w-4 min-h-4" />
					FILTROS
				</Button>
			</div>

			{isLoading ? <p className="w-full flex items-center justify-center animate-pulse">Carregando campanhas...</p> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				<div className="w-full flex flex-col gap-1.5">
					{campaignsResult && campaignsResult.length > 0 ? (
						campaignsResult.map((campaign) => (
							<CampaignsPageCampaignCard key={campaign.id} campaign={campaign} handleEditClick={() => setEditCampaignModalId(campaign.id)} />
						))
					) : (
						<p className="w-full flex items-center justify-center">Nenhuma campanha encontrada</p>
					)}
				</div>
			) : null}

			{newCampaignModalIsOpen ? (
				<NewCampaign
					user={user}
					organizationId={membership.organizacao.id}
					closeModal={() => setNewCampaignModalIsOpen(false)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
			{editCampaignModalId ? (
				<ControlCampaign
					campaignId={editCampaignModalId}
					user={user}
					organizationId={membership.organizacao.id}
					closeModal={() => setEditCampaignModalId(null)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
		</div>
	);
}

function CampaignsStatsView() {
	const initialStartDate = dayjs().startOf("month");
	const initialEndDate = dayjs().endOf("month");
	const [filters, setFilters] = useState<{
		startDate: Date | null;
		endDate: Date | null;
	}>({
		startDate: initialStartDate.toDate(),
		endDate: initialEndDate.toDate(),
	});
	const [comparingFilters, setComparingFilters] = useState<{
		startDate: Date | null;
		endDate: Date | null;
	}>({
		startDate: initialStartDate.subtract(1, "month").toDate(),
		endDate: initialEndDate.subtract(1, "month").toDate(),
	});
	const { data: analytics, isLoading } = useCampaignAnalytics({
		startDate: filters.startDate ?? undefined,
		endDate: filters.endDate ?? undefined,
	});

	const { data: qualityData } = useConversionQuality({
		startDate: filters.startDate ?? undefined,
		endDate: filters.endDate ?? undefined,
	});

	const totals = analytics?.totais;

	// Calculate quality percentages
	const aquisicoes = qualityData?.distribuicaoTipos.find((t) => t.tipo === "AQUISICAO");
	const reativacoes = qualityData?.distribuicaoTipos.find((t) => t.tipo === "REATIVACAO");
	const aceleracoes = qualityData?.distribuicaoTipos.find((t) => t.tipo === "ACELERACAO");

	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center justify-end">
				<DateIntervalInput
					label="Período"
					labelClassName="hidden"
					className="hover:bg-accent hover:text-accent-foreground border-none shadow-none"
					value={{
						after: filters.startDate ? new Date(filters.startDate) : undefined,
						before: filters.endDate ? new Date(filters.endDate) : undefined,
					}}
					handleChange={(value) => {
						const newStartDate = value.after ? new Date(value.after) : null;
						const newEndDate = value.before ? new Date(value.before) : null;

						setFilters({
							startDate: newStartDate,
							endDate: newEndDate,
						});

						// Auto-update comparison period
						if (newStartDate && newEndDate) {
							const diffDays = dayjs(newEndDate).diff(dayjs(newStartDate), "day");
							setComparingFilters({
								startDate: dayjs(newStartDate)
									.subtract(diffDays + 1, "day")
									.toDate(),
								endDate: dayjs(newStartDate).subtract(1, "day").toDate(),
							});
						}
					}}
				/>
			</div>
			{/* Primary KPIs */}
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="TOTAL DE CAMPANHAS"
					icon={<Grid3x3 className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: totals?.campanhas || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="INTERAÇÕES"
					icon={<MessageCircle className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: totals?.interacoes || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="CONVERSÕES"
					icon={<MousePointerClick className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: totals?.conversoes || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="TAXA DE CONVERSÃO"
					icon={<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: totals?.taxaConversaoGeral || 0,
						format: (n) => `${formatDecimalPlaces(n)}%`,
					}}
				/>
				<StatUnitCard
					title="RECEITA GERADA"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: totals?.receita || 0,
						format: (n) => formatToMoney(n),
					}}
				/>
			</div>
			{/* Conversion Quality KPIs */}
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="AQUISIÇÕES"
					subtitle="Novos clientes"
					icon={<UserPlus className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: aquisicoes?.quantidade || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="REATIVAÇÕES"
					subtitle="Clientes resgatados"
					icon={<RefreshCw className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: reativacoes?.quantidade || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="ACELERAÇÕES"
					subtitle="Compraram mais rápido"
					icon={<Zap className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: aceleracoes?.quantidade || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="ANTECIPAÇÃO MÉDIA"
					subtitle="Dias economizados"
					icon={<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: qualityData?.impactoFrequencia?.mediasDiasAntecipados || 0,
						format: (n) => `${formatDecimalPlaces(n)} dias`,
					}}
				/>
				<StatUnitCard
					title="IMPACTO NO TICKET"
					subtitle="Variação média"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: qualityData?.impactoMonetario?.deltaMonetarioPercentualMedio || 0,
						format: (n) => `${n > 0 ? "+" : ""}${formatDecimalPlaces(n)}%`,
					}}
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3 h-[550px]">
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<CampaignsGraphs
						startDate={filters.startDate ?? null}
						endDate={filters.endDate ?? null}
						comparingStartDate={comparingFilters.startDate}
						comparingEndDate={comparingFilters.endDate}
					/>
				</div>
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<CampaignsRanking
						startDate={filters.startDate ?? null}
						endDate={filters.endDate ?? null}
						comparingStartDate={comparingFilters.startDate}
						comparingEndDate={comparingFilters.endDate}
					/>
				</div>
			</div>
			<div className="w-full h-[550px]">
				<CampaignsFunnel startDate={filters.startDate ?? null} endDate={filters.endDate ?? null} />
			</div>
			<div className="w-full h-[550px]">
				<CampaignsBySegmentation startDate={filters.startDate ?? null} endDate={filters.endDate ?? null} />
			</div>
			{/* <div className="w-full h-[450px]">
				<CampaignsConversionQuality startDate={filters.startDate ?? null} endDate={filters.endDate ?? null} />
			</div> */}
		</div>
	);
}

function CampaignsPageCampaignCard({ campaign, handleEditClick }: { campaign: TGetCampaignsOutputDefault[number]; handleEditClick: () => void }) {
	return (
		<div className={cn("bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="w-full flex flex-col gap-0.5">
				<div className="w-full flex items-center justify-between gap-2">
					<h1 className="text-xs font-bold tracking-tight lg:text-sm">{campaign.titulo}</h1>
					<div
						className={cn("flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[0.65rem] font-bold bg-primary/10 text-primary", {
							"bg-green-500 dark:bg-green-600 text-white": campaign.ativo,
							"bg-gray-500 dark:bg-gray-600 text-white": !campaign.ativo,
						})}
					>
						<CircleCheck className="w-4 min-w-4 h-4 min-h-4" />
						<p className="text-xs font-bold tracking-tight uppercase">{campaign.ativo ? "ATIVO" : "INATIVO"}</p>
					</div>
				</div>
				<p className="text-xs font-medium tracking-tight text-muted-foreground">{campaign.descricao}</p>
			</div>
			<div className="w-full flex items-center justify-between gap-2 flex-wrap">
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<div className={cn("flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[0.65rem] font-bold bg-primary/10 text-primary")}>
								<Grid3x3 className="w-4 min-w-4 h-4 min-h-4" />
								<p className="text-xs font-bold tracking-tight uppercase">{campaign.segmentacoes.length} SEGMENTAÇÔES</p>
							</div>
						</TooltipTrigger>
						<TooltipContent className="max-w-xs">Incluindo {campaign.segmentacoes.map((s) => s.segmentacao).join(", ")}</TooltipContent>
					</Tooltip>
				</TooltipProvider>
				<Button variant="ghost" className="flex items-center gap-1.5" size="sm" onClick={handleEditClick}>
					<PencilIcon className="w-3 min-w-3 h-3 min-h-3" />
					EDITAR
				</Button>
			</div>
		</div>
	);
}
