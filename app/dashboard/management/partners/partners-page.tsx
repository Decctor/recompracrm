"use client";
import type { TGetPartnersInput, TGetPartnersOutputDefault } from "@/app/api/partners/route";
import type { TGetPartnersOverallStatsInput } from "@/app/api/partners/stats/overall/route";
import { buildSalesIntegrationFilterOptions } from "@/components/Sales/sales-integration-filter-options";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import EditPartner from "@/components/Modals/Partners/EditPartner";
import NewPartner from "@/components/Modals/Partners/NewPartner";
import PartnersGraphs from "@/components/Partners/PartnersGraphs";
import PartnersRanking from "@/components/Partners/PartnersRanking";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { InteractiveFilter, type InteractiveFilterOption } from "@/components/ui/interactive-filter";
import { Input } from "@/components/ui/input";
import { StatBadge } from "@/components/ui/stat-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import {
	formatInteractiveDateRangeSummary,
	formatInteractiveNumberRangeSummary,
	formatInteractiveOptionSummary,
} from "@/components/ui/interactive-filter-formatting";
import { usePartners, usePartnersOverallStats } from "@/lib/queries/partners";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Activity, BadgeDollarSign, CirclePlus, IdCard, ListFilter, Mail, Pencil, Phone, Plus, Ticket, TrendingUp, Users } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useState } from "react";
import { BsCalendar } from "react-icons/bs";

type PartnersPageProps = {
	user: TAuthUserSession["user"];
};
export default function PartnersPage({ user }: PartnersPageProps) {
	const [viewMode, setViewMode] = useQueryState("view", parseAsStringEnum(["stats", "database"]));

	return (
		<div className="w-full h-full flex flex-col gap-3">
			<Tabs value={viewMode ?? "stats"} onValueChange={(v: string) => setViewMode(v as "stats" | "database")}>
				<TabsList variant="page">
					<TabsTrigger value="stats">
						<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />
						Estatísticas
					</TabsTrigger>
					<TabsTrigger value="database">
						<Users className="w-4 h-4 min-w-4 min-h-4" />
						Banco de Dados
					</TabsTrigger>
				</TabsList>
				<TabsContent value="stats">
					<PartnersStatsView />
				</TabsContent>
				<TabsContent value="database">
					<PartnersDatabaseView user={user} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function PartnersDatabaseView({ user }: { user: TAuthUserSession["user"] }) {
	const queryClient = useQueryClient();
	const [newPartnerModalIsOpen, setNewPartnerModalIsOpen] = useState<boolean>(false);
	const [editPartnerModalId, setEditPartnerModalId] = useState<string | null>(null);
	const {
		data: partnersResult,
		queryKey,
		isLoading,
		isError,
		isSuccess,
		error,
		queryParams,
		updateQueryParams,
	} = usePartners({
		initialParams: {
			search: "",
			statsPeriodAfter: dayjs().startOf("month").toDate(),
			statsPeriodBefore: dayjs().endOf("month").toDate(),
			statsIntegrationsIds: [],
			statsExcludedSalesIds: [],
			statsTotalMin: null,
			statsTotalMax: null,
		},
	});
	const partners = partnersResult?.partners;
	const partnersShowing = partners ? partners.length : 0;
	const partnersMatched = partnersResult?.partnersMatched || 0;
	const totalPages = partnersResult?.totalPages;
	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey: queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey: queryKey });
	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<Input
					value={queryParams.search ?? ""}
					placeholder="Pesquisar parceiro..."
					onChange={(e) => updateQueryParams({ search: e.target.value })}
					className="grow rounded-xl"
				/>

				<Button className="flex items-center gap-2" size="sm" onClick={() => setNewPartnerModalIsOpen(true)}>
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					NOVO PARCEIRO
				</Button>
			</div>
			<PartnersInlineFilters queryParams={queryParams} updateQueryParams={updateQueryParams} />
			<GeneralPaginationComponent
				activePage={queryParams.page}
				queryLoading={isLoading}
				selectPage={(page) => updateQueryParams({ page })}
				totalPages={totalPages || 0}
				pageSize={queryParams.pageSize}
				onPageSizeChange={(pageSize) => updateQueryParams({ pageSize, page: 1 })}
				itemsMatchedText={partnersMatched === 1 ? "1 parceiro encontrado" : `${partnersMatched} parceiros encontrados`}
				itemsShowingText={`mostrando ${partnersShowing}`}
			/>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				<div className="w-full flex flex-col gap-1.5">
					{partners && partners.length > 0 ? (
						partners.map((partner) => <PartnersPagePartnerCard key={partner.id} partner={partner} handleEditClick={setEditPartnerModalId} />)
					) : (
						<p className="w-full flex items-center justify-center">Nenhum parceiro encontrado</p>
					)}
				</div>
			) : null}

			{editPartnerModalId ? (
				<EditPartner
					partnerId={editPartnerModalId}
					user={user}
					closeModal={() => setEditPartnerModalId(null)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
			{newPartnerModalIsOpen ? (
				<NewPartner user={user} closeModal={() => setNewPartnerModalIsOpen(false)} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
			) : null}
		</div>
	);
}

type PartnersInlineFiltersProps = {
	queryParams: TGetPartnersInput;
	updateQueryParams: (params: Partial<TGetPartnersInput>) => void;
};

function PartnersInlineFilters({ queryParams, updateQueryParams }: PartnersInlineFiltersProps) {
	const { data: filterOptions } = useSaleQueryFilterOptions();
	const integrationOptions = buildSalesIntegrationFilterOptions(filterOptions?.integrations);
	const hasIntegrations = (queryParams.statsIntegrationsIds ?? []).length > 0;
	const hasTotal = queryParams.statsTotalMin != null || queryParams.statsTotalMax != null;

	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			<InteractiveFilter.Root className="w-fit">
				<InteractiveFilter.Trigger>
					<InteractiveFilter.Icon>
						<BsCalendar className="h-4 w-4" />
						<InteractiveFilter.Label>PERÍODO</InteractiveFilter.Label>
					</InteractiveFilter.Icon>
					<InteractiveFilter.Value>
						{formatInteractiveDateRangeSummary(queryParams.statsPeriodAfter, queryParams.statsPeriodBefore)}
					</InteractiveFilter.Value>
					<InteractiveFilter.Clear onClear={() => updateQueryParams({ statsPeriodAfter: null, statsPeriodBefore: null, page: 1 })} />
				</InteractiveFilter.Trigger>
				<InteractiveFilter.Content className="w-auto p-0">
					<InteractiveFilter.DateRangeContent
						value={{
							from: queryParams.statsPeriodAfter ? new Date(queryParams.statsPeriodAfter) : undefined,
							to: queryParams.statsPeriodBefore ? new Date(queryParams.statsPeriodBefore) : undefined,
						}}
						onChange={(period) => updateQueryParams({ statsPeriodAfter: period.from ?? null, statsPeriodBefore: period.to ?? null, page: 1 })}
					/>
				</InteractiveFilter.Content>
			</InteractiveFilter.Root>

			{hasIntegrations ? (
				<PartnersIntegrationsFilter queryParams={queryParams} updateQueryParams={updateQueryParams} options={integrationOptions} />
			) : null}
			{hasTotal ? <PartnersTotalFilter queryParams={queryParams} updateQueryParams={updateQueryParams} /> : null}

			<InteractiveFilter.AddFilterRoot className="w-fit">
				<InteractiveFilter.AddFilterTrigger>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>ADICIONAR FILTRO</InteractiveFilter.Label>
				</InteractiveFilter.AddFilterTrigger>
				<InteractiveFilter.AddFilterContent>
					<InteractiveFilter.AddFilterSection heading="Filtros">
						{!hasIntegrations ? (
							<InteractiveFilter.AddFilterItem id="integrations" label="INTEGRAÇÕES" icon={<ListFilter className="h-4 w-4" />}>
								<PartnersIntegrationsContent queryParams={queryParams} updateQueryParams={updateQueryParams} options={integrationOptions} />
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasTotal ? (
							<InteractiveFilter.AddFilterItem id="total" label="VALOR" icon={<BadgeDollarSign className="h-4 w-4" />}>
								<PartnersTotalContent queryParams={queryParams} updateQueryParams={updateQueryParams} />
							</InteractiveFilter.AddFilterItem>
						) : null}
					</InteractiveFilter.AddFilterSection>
				</InteractiveFilter.AddFilterContent>
			</InteractiveFilter.AddFilterRoot>
		</div>
	);
}

function PartnersIntegrationsFilter({
	queryParams,
	updateQueryParams,
	options,
}: PartnersInlineFiltersProps & { options: InteractiveFilterOption<string>[] }) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>INTEGRAÇÕES</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveOptionSummary(options, queryParams.statsIntegrationsIds ?? [])}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={() => updateQueryParams({ statsIntegrationsIds: [], page: 1 })} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-72 p-0">
				<PartnersIntegrationsContent queryParams={queryParams} updateQueryParams={updateQueryParams} options={options} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function PartnersIntegrationsContent({
	queryParams,
	updateQueryParams,
	options,
}: PartnersInlineFiltersProps & { options: InteractiveFilterOption<string>[] }) {
	return (
		<InteractiveFilter.MultiContent
			options={options}
			value={queryParams.statsIntegrationsIds ?? []}
			onChange={(statsIntegrationsIds) => updateQueryParams({ statsIntegrationsIds, page: 1 })}
			onClear={() => updateQueryParams({ statsIntegrationsIds: [], page: 1 })}
			clearLabel="TODAS"
		/>
	);
}

function PartnersTotalFilter({ queryParams, updateQueryParams }: PartnersInlineFiltersProps) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<BadgeDollarSign className="h-4 w-4" />
					<InteractiveFilter.Label>VALOR</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveNumberRangeSummary(queryParams.statsTotalMin, queryParams.statsTotalMax)}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={() => updateQueryParams({ statsTotalMin: null, statsTotalMax: null, page: 1 })} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-80 p-0">
				<PartnersTotalContent queryParams={queryParams} updateQueryParams={updateQueryParams} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function PartnersTotalContent({ queryParams, updateQueryParams }: PartnersInlineFiltersProps) {
	return (
		<InteractiveFilter.NumberRangeContent
			value={{ greaterThan: queryParams.statsTotalMin, lessThan: queryParams.statsTotalMax }}
			onChange={({ greaterThan, lessThan }) => updateQueryParams({ statsTotalMin: greaterThan, statsTotalMax: lessThan, page: 1 })}
			onClear={() => updateQueryParams({ statsTotalMin: null, statsTotalMax: null, page: 1 })}
			minPlaceholder="Valor mínimo"
			maxPlaceholder="Valor máximo"
		/>
	);
}

function PartnersStatsView() {
	const initialStartDate = dayjs().startOf("month");
	const initialEndDate = dayjs().endOf("month");
	const [filters, setFilters] = useState<TGetPartnersOverallStatsInput>({
		periodAfter: initialStartDate.toDate(),
		periodBefore: initialEndDate.toDate(),
		comparingPeriodAfter: initialStartDate.subtract(1, "month").toDate(),
		comparingPeriodBefore: initialEndDate.subtract(1, "month").toDate(),
	});
	const { data: partnersOverallStats, isLoading: partnersOverallStatsLoading } = usePartnersOverallStats({
		periodAfter: filters.periodAfter ?? null,
		periodBefore: filters.periodBefore ?? null,
		comparingPeriodAfter: filters.comparingPeriodAfter ?? null,
		comparingPeriodBefore: filters.comparingPeriodBefore ?? null,
	});
	console.log("[INFO] [PARTNERS RANKING] Starting:", {
		periodAfter: filters.periodAfter,
		periodBefore: filters.periodBefore,
		comparingPeriodAfter: filters.comparingPeriodAfter,
		comparingPeriodBefore: filters.comparingPeriodBefore,
	});
	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center justify-end">
				<DateIntervalInput
					label="Período"
					labelClassName="hidden"
					className="hover:bg-accent hover:text-accent-foreground border-none shadow-none"
					value={{
						after: filters.periodAfter ? new Date(filters.periodAfter) : undefined,
						before: filters.periodBefore ? new Date(filters.periodBefore) : undefined,
					}}
					handleChange={(value) => {
						setFilters((prev) => ({
							...prev,
							periodAfter: value.after ? new Date(value.after) : null,
							periodBefore: value.before ? new Date(value.before) : null,
							comparingPeriodAfter: value.after ? dayjs(value.after).subtract(1, "month").toDate() : null,
							comparingPeriodBefore: value.before ? dayjs(value.before).subtract(1, "month").toDate() : null,
						}));
					}}
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="TOTAL DE PARCEIROS"
					icon={<Users className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: partnersOverallStats?.totalPartners.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						partnersOverallStats?.totalPartners.comparison
							? {
									value: partnersOverallStats?.totalPartners.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="PARCEIROS ATIVOS"
					icon={<Activity className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: partnersOverallStats?.activePartners.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						partnersOverallStats?.activePartners.comparison
							? {
									value: partnersOverallStats?.activePartners.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="FATURAMENTO TOTAL"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: partnersOverallStats?.totalRevenue.current || 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						partnersOverallStats?.totalRevenue.comparison
							? {
									value: partnersOverallStats?.totalRevenue.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="TICKET MÉDIO GERAL"
					icon={<Ticket className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: partnersOverallStats?.averageTicket.current || 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						partnersOverallStats?.averageTicket.comparison
							? {
									value: partnersOverallStats?.averageTicket.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3 h-[550px]">
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<PartnersGraphs periodAfter={filters.periodAfter} periodBefore={filters.periodBefore} />
				</div>
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<PartnersRanking
						periodAfter={filters.periodAfter}
						periodBefore={filters.periodBefore}
						comparingPeriodAfter={filters.comparingPeriodAfter}
						comparingPeriodBefore={filters.comparingPeriodBefore}
					/>
				</div>
			</div>
		</div>
	);
}

function PartnersPagePartnerCard({
	partner,
	handleEditClick,
}: {
	partner: TGetPartnersOutputDefault["partners"][number];
	handleEditClick: (id: string) => void;
}) {
	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-between flex-col md:flex-row gap-3">
				<div className="flex items-center gap-3">
					<Avatar className="w-6 h-6 min-w-6 min-h-6">
						<AvatarImage src={partner.avatarUrl ?? undefined} alt={partner.nome} />
						<AvatarFallback>{formatNameAsInitials(partner.nome)}</AvatarFallback>
					</Avatar>
					<h1 className="text-xs font-bold tracking-tight uppercase">{partner.nome}</h1>
					{partner.cpfCnpj ? (
						<div className="flex items-center gap-1.5">
							<IdCard className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs tracking-tight uppercase">{partner.cpfCnpj ?? "CPF/CNPJ NÃO INFORMADO"}</p>
						</div>
					) : null}
					{partner.telefone ? (
						<div className="flex items-center gap-1.5">
							<Phone className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs tracking-tight uppercase">{partner.telefone ?? "TELEFONE NÃO INFORMADO"}</p>
						</div>
					) : null}
					{partner.email ? (
						<div className="flex items-center gap-1.5">
							<Mail className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs tracking-tight uppercase">{partner.email}</p>
						</div>
					) : null}
				</div>
				<div className="flex items-center gap-3 flex-col md:flex-row gap-y-1">
					<div className="flex items-center gap-3">
						<StatBadge
							icon={<CirclePlus className="w-3 min-w-3 h-3 min-h-3" />}
							value={partner.estatisticas.vendasQtdeTotal}
							tooltipContent="Quantidade total de vendas no período de filtro"
							className="rounded-md px-1.5 py-1.5 font-bold bg-primary/10 text-foreground"
							valueClassName="font-bold"
						/>
						<StatBadge
							icon={<BadgeDollarSign className="w-3 min-w-3 h-3 min-h-3" />}
							value={formatToMoney(partner.estatisticas.vendasValorTotal)}
							tooltipContent="Valor total de vendas no período de filtro"
							className="rounded-md px-1.5 py-1.5 font-bold bg-primary/10 text-foreground"
							valueClassName="font-bold"
						/>
					</div>
				</div>
			</div>
			<div className="w-full flex items-center justify-center lg:justify-end gap-2 flex-wrap">
				<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground")}>
					<BsCalendar className="w-3 min-w-3 h-3 min-h-3" />
					<p className="text-xs font-medium tracking-tight uppercase">PRIMEIRA VENDA: {formatDateAsLocale(partner.estatisticas.dataPrimeiraVenda)}</p>
				</div>
				<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground")}>
					<BsCalendar className="w-3 min-w-3 h-3 min-h-3" />
					<p className="text-xs font-medium tracking-tight uppercase">ÚLTIMA VENDA: {formatDateAsLocale(partner.estatisticas.dataUltimaVenda)}</p>
				</div>
				<Button
					variant="ghost"
					className="flex items-center gap-1.5"
					size="sm"
					onClick={(e) => {
						handleEditClick(partner.id);
					}}
				>
					<Pencil className="w-3 min-w-3 h-3 min-h-3" />
					EDITAR
				</Button>
			</div>
		</div>
	);
}
