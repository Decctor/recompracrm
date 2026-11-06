"use client";
import { buildSalesIntegrationFilterOptions } from "@/components/Sales/sales-integration-filter-options";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import EditSeller from "@/components/Modals/Sellers/EditSeller";
import NewSeller from "@/components/Modals/Sellers/NewSeller";
import MultipleSalesSelectInput from "@/components/Inputs/SelectMultipleSalesInput";
import SellersGraphs from "@/components/Sellers/SellersGraphs";
import SellersRanking from "@/components/Sellers/SellersRanking";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { InteractiveFilter, type InteractiveFilterOption, type InteractiveFilterSortValue } from "@/components/ui/interactive-filter";
import { Input } from "@/components/ui/input";
import { StatBadge } from "@/components/ui/stat-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDecimalPlaces, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import {
	formatInteractiveCountSummary,
	formatInteractiveDateRangeSummary,
	formatInteractiveNumberRangeSummary,
	formatInteractiveOptionSummary,
	formatInteractiveSortFieldSummary,
	isInteractiveSortActive,
} from "@/components/ui/interactive-filter-formatting";
import { useSellers, useSellersOverallStats } from "@/lib/queries/sellers";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import { cn } from "@/lib/utils";
import type { TGetSellersOutputDefault } from "@/app/api/sellers/route";
import type { TGetSellersDefaultInput } from "@/app/api/sellers/route";
import type { TGetSellersOverallStatsInput } from "@/app/api/sellers/stats/overall/route";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
	Activity,
	AreaChart,
	BadgeDollarSign,
	CirclePlus,
	ListFilter,
	Mail,
	Pencil,
	Phone,
	Plus,
	Target,
	Ticket,
	TrendingUp,
	Users,
} from "lucide-react";
import Link from "next/link";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useState } from "react";
import { BsCalendar } from "react-icons/bs";

type SellersPageProps = {
	user: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};
export default function SellersPage({ user, membership }: SellersPageProps) {
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
					<SellersStatsView />
				</TabsContent>
				<TabsContent value="database">
					<SellersDatabaseView user={user} membership={membership} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function SellersDatabaseView({ user, membership }: { user: TAuthUserSession["user"]; membership: NonNullable<TAuthUserSession["membership"]> }) {
	const queryClient = useQueryClient();
	const [newSellerModalIsOpen, setNewSellerModalIsOpen] = useState(false);
	const [editSellerId, setEditSellerId] = useState<string | null>(null);
	const {
		data: sellersResult,
		queryKey,
		isLoading,
		isError,
		isSuccess,
		error,
		filters,
		updateFilters,
	} = useSellers({
		initialFilters: {
			activeOnly: false,
			statsPeriodAfter: dayjs().startOf("month").toDate(),
			statsPeriodBefore: dayjs().endOf("month").toDate(),
		},
	});
	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey: queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey: queryKey });

	const sellers = sellersResult?.sellers;
	const sellersShowing = sellers ? sellers.length : 0;
	const sellersMatched = sellersResult?.sellersMatched || 0;
	const totalPages = sellersResult?.totalPages;
	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar vendedor..."
					onChange={(event) => updateFilters({ search: event.target.value, page: 1 })}
					className="grow rounded-xl"
				/>
				<Button className="flex items-center gap-2" size="sm" onClick={() => setNewSellerModalIsOpen(true)}>
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					NOVO VENDEDOR
				</Button>
			</div>
			<SellersInlineFilters filters={filters} updateFilters={updateFilters} />
			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages || 0}
				pageSize={filters.pageSize}
				onPageSizeChange={(pageSize) => updateFilters({ pageSize, page: 1 })}
				itemsMatchedText={sellersMatched === 1 ? "1 vendedor encontrado" : `${sellersMatched} vendedores encontrados`}
				itemsShowingText={`mostrando ${sellersShowing}`}
			/>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && sellers ? (
				<div className="w-full flex flex-col gap-1.5">
					{sellers.length > 0 ? (
						sellers.map((seller) => (
							<SellersPageSellerCard
								key={seller.id}
								seller={seller}
								handleEditClick={setEditSellerId}
								userHasEditPermission={
									membership.permissoes.resultados.visualizar &&
									(!membership.permissoes.resultados.escopo || membership.permissoes.resultados.escopo?.includes(seller.id))
								}
								userHasViewPermission={
									membership.permissoes.resultados.visualizar &&
									(!membership.permissoes.resultados.escopo || membership.permissoes.resultados.escopo?.includes(seller.id))
								}
							/>
						))
					) : (
						<p className="w-full flex items-center justify-center">Nenhum vendedor encontrado</p>
					)}
				</div>
			) : null}
			{editSellerId ? (
				<EditSeller
					sellerId={editSellerId}
					user={user}
					closeModal={() => setEditSellerId(null)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
			{newSellerModalIsOpen ? (
				<NewSeller user={user} closeModal={() => setNewSellerModalIsOpen(false)} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
			) : null}
		</div>
	);
}

type SellersInlineFiltersProps = {
	filters: TGetSellersDefaultInput;
	updateFilters: (filters: Partial<TGetSellersDefaultInput>) => void;
};

function SellersInlineFilters({ filters, updateFilters }: SellersInlineFiltersProps) {
	const { data: filterOptions } = useSaleQueryFilterOptions();
	const sellerOptions = (filterOptions?.sellers ?? []) as InteractiveFilterOption<string>[];
	const integrationOptions = buildSalesIntegrationFilterOptions(filterOptions?.integrations);
	const orderFieldOptions = [
		{ id: "nome", label: "NOME", value: "nome" },
		{ id: "dataInsercao", label: "DATA DE INSERÇÃO", value: "dataInsercao" },
		{ id: "vendasValorTotal", label: "VALOR TOTAL DE VENDAS", value: "vendasValorTotal" },
		{ id: "vendasQtdeTotal", label: "QUANTIDADE TOTAL DE VENDAS", value: "vendasQtdeTotal" },
	] satisfies InteractiveFilterOption<NonNullable<TGetSellersDefaultInput["orderByField"]>>[];
	const defaultSort = {
		field: "nome",
		direction: "asc",
	} satisfies InteractiveFilterSortValue<NonNullable<TGetSellersDefaultInput["orderByField"]>>;
	const sortValue = {
		field: filters.orderByField ?? defaultSort.field,
		direction: filters.orderByDirection ?? defaultSort.direction,
	} satisfies InteractiveFilterSortValue<NonNullable<TGetSellersDefaultInput["orderByField"]>>;
	const hasSellers = (filters.sellersIds ?? []).length > 0;
	const hasIntegrations = (filters.statsIntegrationsIds ?? []).length > 0;
	const hasTotal = filters.statsTotalMin != null || filters.statsTotalMax != null;
	const hasExcludedSales = (filters.statsExcludedSalesIds ?? []).length > 0;
	const hasActiveSort = isInteractiveSortActive(sortValue, defaultSort);

	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			<InteractiveFilter.Root className="w-fit">
				<InteractiveFilter.Trigger>
					<InteractiveFilter.Icon>
						<BsCalendar className="h-4 w-4" />
						<InteractiveFilter.Label>PERÍODO</InteractiveFilter.Label>
					</InteractiveFilter.Icon>
					<InteractiveFilter.Value>{formatInteractiveDateRangeSummary(filters.statsPeriodAfter, filters.statsPeriodBefore)}</InteractiveFilter.Value>
					<InteractiveFilter.Clear onClear={() => updateFilters({ statsPeriodAfter: null, statsPeriodBefore: null, page: 1 })} />
				</InteractiveFilter.Trigger>
				<InteractiveFilter.Content className="w-auto p-0">
					<InteractiveFilter.DateRangeContent
						value={{
							from: filters.statsPeriodAfter ? new Date(filters.statsPeriodAfter) : undefined,
							to: filters.statsPeriodBefore ? new Date(filters.statsPeriodBefore) : undefined,
						}}
						onChange={(period) => updateFilters({ statsPeriodAfter: period.from ?? null, statsPeriodBefore: period.to ?? null, page: 1 })}
					/>
				</InteractiveFilter.Content>
			</InteractiveFilter.Root>

			{hasSellers ? (
				<SellersMultiFilter
					label="VENDEDORES"
					options={sellerOptions}
					value={filters.sellersIds ?? []}
					onChange={(sellersIds) => updateFilters({ sellersIds, page: 1 })}
					onClear={() => updateFilters({ sellersIds: [], page: 1 })}
				/>
			) : null}
			{hasIntegrations ? (
				<SellersMultiFilter
					label="INTEGRAÇÕES"
					options={integrationOptions}
					value={filters.statsIntegrationsIds ?? []}
					onChange={(statsIntegrationsIds) => updateFilters({ statsIntegrationsIds, page: 1 })}
					onClear={() => updateFilters({ statsIntegrationsIds: [], page: 1 })}
				/>
			) : null}
			{hasTotal ? <SellersTotalFilter filters={filters} updateFilters={updateFilters} /> : null}
			{hasExcludedSales ? <SellersExcludedSalesFilter filters={filters} updateFilters={updateFilters} /> : null}
			{hasActiveSort ? (
				<SellersSortFilter
					fieldOptions={orderFieldOptions}
					value={sortValue}
					onChange={({ field, direction }) => updateFilters({ orderByField: field, orderByDirection: direction, page: 1 })}
					onClear={() => updateFilters({ orderByField: defaultSort.field, orderByDirection: defaultSort.direction, page: 1 })}
				/>
			) : null}

			<InteractiveFilter.AddFilterRoot className="w-fit">
				<InteractiveFilter.AddFilterTrigger>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>ADICIONAR FILTRO</InteractiveFilter.Label>
				</InteractiveFilter.AddFilterTrigger>
				<InteractiveFilter.AddFilterContent>
					<InteractiveFilter.AddFilterSection heading="Filtros">
						{!hasSellers ? (
							<InteractiveFilter.AddFilterItem id="sellers" label="VENDEDORES" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={sellerOptions}
									value={filters.sellersIds ?? []}
									onChange={(sellersIds) => updateFilters({ sellersIds, page: 1 })}
									onClear={() => updateFilters({ sellersIds: [], page: 1 })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasIntegrations ? (
							<InteractiveFilter.AddFilterItem id="integrations" label="INTEGRAÇÕES" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={integrationOptions}
									value={filters.statsIntegrationsIds ?? []}
									onChange={(statsIntegrationsIds) => updateFilters({ statsIntegrationsIds, page: 1 })}
									onClear={() => updateFilters({ statsIntegrationsIds: [], page: 1 })}
									clearLabel="TODAS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasTotal ? (
							<InteractiveFilter.AddFilterItem id="total" label="VALOR" icon={<BadgeDollarSign className="h-4 w-4" />}>
								<SellersTotalFilterContent filters={filters} updateFilters={updateFilters} />
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasExcludedSales ? (
							<InteractiveFilter.AddFilterItem id="excludedSales" label="VENDAS EXCLUÍDAS" icon={<ListFilter className="h-4 w-4" />}>
								<SellersExcludedSalesFilterContent filters={filters} updateFilters={updateFilters} />
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasActiveSort ? (
							<InteractiveFilter.AddFilterItem id="sort" label="ORDENAR POR" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.SortContent
									fieldOptions={orderFieldOptions}
									value={sortValue}
									onChange={({ field, direction }) => updateFilters({ orderByField: field, orderByDirection: direction, page: 1 })}
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
					</InteractiveFilter.AddFilterSection>
				</InteractiveFilter.AddFilterContent>
			</InteractiveFilter.AddFilterRoot>
		</div>
	);
}

function SellersSortFilter<TField extends string>({
	fieldOptions,
	value,
	onChange,
	onClear,
}: {
	fieldOptions: InteractiveFilterOption<TField>[];
	value: InteractiveFilterSortValue<TField>;
	onChange: (nextValue: InteractiveFilterSortValue<TField>) => void;
	onClear: () => void;
}) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>ORDENAR POR</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveSortFieldSummary(fieldOptions, value.field)}</InteractiveFilter.Value>
				<InteractiveFilter.SortDirectionToggle direction={value.direction} onDirectionChange={(direction) => onChange({ ...value, direction })} />
				<InteractiveFilter.Clear onClear={onClear} label="Limpar ordenação" />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-72 p-0">
				<InteractiveFilter.SortContent fieldOptions={fieldOptions} value={value} onChange={onChange} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function SellersTotalFilter({ filters, updateFilters }: SellersInlineFiltersProps) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<BadgeDollarSign className="h-4 w-4" />
					<InteractiveFilter.Label>VALOR</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveNumberRangeSummary(filters.statsTotalMin, filters.statsTotalMax)}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={() => updateFilters({ statsTotalMin: null, statsTotalMax: null, page: 1 })} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-80 p-0">
				<SellersTotalFilterContent filters={filters} updateFilters={updateFilters} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function SellersTotalFilterContent({ filters, updateFilters }: SellersInlineFiltersProps) {
	return (
		<InteractiveFilter.NumberRangeContent
			value={{ greaterThan: filters.statsTotalMin, lessThan: filters.statsTotalMax }}
			onChange={({ greaterThan, lessThan }) => updateFilters({ statsTotalMin: greaterThan, statsTotalMax: lessThan, page: 1 })}
			onClear={() => updateFilters({ statsTotalMin: null, statsTotalMax: null, page: 1 })}
		/>
	);
}

function SellersExcludedSalesFilter({ filters, updateFilters }: SellersInlineFiltersProps) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>VENDAS EXCLUÍDAS</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveCountSummary(filters.statsExcludedSalesIds ?? [])}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={() => updateFilters({ statsExcludedSalesIds: [], page: 1 })} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-80 p-3">
				<SellersExcludedSalesFilterContent filters={filters} updateFilters={updateFilters} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function SellersExcludedSalesFilterContent({ filters, updateFilters }: SellersInlineFiltersProps) {
	return (
		<MultipleSalesSelectInput
			label="VENDAS EXCLUÍDAS"
			selected={filters.statsExcludedSalesIds ?? []}
			handleChange={(statsExcludedSalesIds) => updateFilters({ statsExcludedSalesIds: statsExcludedSalesIds as string[], page: 1 })}
			onReset={() => updateFilters({ statsExcludedSalesIds: [], page: 1 })}
			resetOptionLabel="VENDAS EXCLUÍDAS"
		/>
	);
}

function SellersMultiFilter({
	label,
	options,
	value,
	onChange,
	onClear,
}: {
	label: string;
	options: InteractiveFilterOption<string>[];
	value: string[];
	onChange: (value: string[]) => void;
	onClear: () => void;
}) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>{label}</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveOptionSummary(options, value)}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={onClear} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-72 p-0">
				<InteractiveFilter.MultiContent options={options} value={value} onChange={onChange} onClear={onClear} clearLabel="TODOS" />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function SellersStatsView() {
	const initialStartDate = dayjs().startOf("month");
	const initialEndDate = dayjs().endOf("month");
	const [filters, setFilters] = useState<TGetSellersOverallStatsInput>({
		periodAfter: initialStartDate.toDate(),
		periodBefore: initialEndDate.toDate(),
		comparingPeriodAfter: initialStartDate.subtract(1, "month").toDate(),
		comparingPeriodBefore: initialEndDate.subtract(1, "month").toDate(),
	});
	const { data: sellersOverallStats, isLoading: sellersOverallStatsLoading } = useSellersOverallStats({
		periodAfter: filters.periodAfter ?? null,
		periodBefore: filters.periodBefore ?? null,
		comparingPeriodAfter: filters.comparingPeriodAfter ?? null,
		comparingPeriodBefore: filters.comparingPeriodBefore ?? null,
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
					handleChange={(value) =>
						setFilters((prev) => ({
							...prev,
							periodAfter: value.after ? new Date(value.after) : null,
							periodBefore: value.before ? new Date(value.before) : null,
							comparingPeriodAfter: value.after ? dayjs(value.after).subtract(1, "month").toDate() : null,
							comparingPeriodBefore: value.before ? dayjs(value.before).subtract(1, "month").toDate() : null,
						}))
					}
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="TOTAL DE VENDEDORES"
					icon={<Users className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: sellersOverallStats?.totalSellers.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						sellersOverallStats?.totalSellers.comparison
							? {
									value: sellersOverallStats?.totalSellers.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="VENDEDORES ATIVOS"
					icon={<Activity className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: sellersOverallStats?.activeSellers.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						sellersOverallStats?.activeSellers.comparison
							? {
									value: sellersOverallStats?.activeSellers.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="FATURAMENTO TOTAL"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: sellersOverallStats?.totalRevenue.current || 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						sellersOverallStats?.totalRevenue.comparison
							? {
									value: sellersOverallStats?.totalRevenue.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="TICKET MÉDIO GERAL"
					icon={<Ticket className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: sellersOverallStats?.averageTicket.current || 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						sellersOverallStats?.averageTicket.comparison
							? {
									value: sellersOverallStats?.averageTicket.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="META VS REALIZADO"
					icon={<Target className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: sellersOverallStats?.goalAchievement.current || 0,
						format: (n) => `${formatDecimalPlaces(n)}%`,
					}}
					previous={
						sellersOverallStats?.goalAchievement.comparison
							? {
									value: sellersOverallStats?.goalAchievement.comparison || 0,
									format: (n) => `${formatDecimalPlaces(n)}%`,
								}
							: undefined
					}
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3 h-[550px]">
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<SellersGraphs periodAfter={filters.periodAfter} periodBefore={filters.periodBefore} />
				</div>
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<SellersRanking
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

type SellerCardProps = {
	seller: TGetSellersOutputDefault["sellers"][number];
	handleEditClick: (sellerId: string) => void;
	userHasViewPermission: boolean;
	userHasEditPermission: boolean;
};
function SellersPageSellerCard({ seller, handleEditClick, userHasViewPermission, userHasEditPermission }: SellerCardProps) {
	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-between flex-col md:flex-row gap-3">
				<div className="flex items-center gap-3">
					<Avatar className="w-6 h-6 min-w-6 min-h-6">
						<AvatarImage src={seller.avatarUrl ?? undefined} alt={seller.nome} />
						<AvatarFallback>{formatNameAsInitials(seller.nome)}</AvatarFallback>
					</Avatar>
					<h1 className="text-xs font-bold tracking-tight uppercase">{seller.nome}</h1>
					<span
						className={cn(
							"rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold tracking-tight",
							seller.ativo ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground",
						)}
					>
						{seller.ativo ? "ATIVO" : "INATIVO"}
					</span>
					{seller.telefone ? (
						<div className="flex items-center gap-1.5">
							<Phone className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs tracking-tight uppercase">{seller.telefone ?? "TELEFONE NÃO INFORMADO"}</p>
						</div>
					) : null}
					{seller.email ? (
						<div className="flex items-center gap-1.5">
							<Mail className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs tracking-tight uppercase">{seller.email}</p>
						</div>
					) : null}
				</div>
				<div className="flex items-center gap-3 flex-col md:flex-row gap-y-1">
					<div className="flex items-center gap-3">
						<StatBadge
							icon={<CirclePlus className="w-3 min-w-3 h-3 min-h-3" />}
							value={seller.estatisticas.vendasQtdeTotal}
							tooltipContent="Quantidade total de vendas no período de filtro"
							className="rounded-md px-1.5 py-1.5 font-bold bg-primary/10 text-foreground"
							valueClassName="font-bold"
						/>
						<StatBadge
							icon={<BadgeDollarSign className="w-3 min-w-3 h-3 min-h-3" />}
							value={formatToMoney(seller.estatisticas.vendasValorTotal)}
							tooltipContent="Valor total de vendas no período de filtro"
							className="rounded-md px-1.5 py-1.5 font-bold bg-primary/10 text-foreground"
							valueClassName="font-bold"
						/>
					</div>
					<div className="flex items-center gap-3">
						{userHasEditPermission ? (
							<Button variant="ghost" className="flex items-center gap-1.5" size="sm" onClick={() => handleEditClick(seller.id)}>
								<Pencil className="w-3 min-w-3 h-3 min-h-3" />
								EDITAR
							</Button>
						) : null}
						{userHasViewPermission ? (
							<Button variant="link" className="flex items-center gap-1.5" size="sm" asChild>
								<Link href={appRoutes.management.seller(seller.id)}>
									<AreaChart className="w-3 min-w-3 h-3 min-h-3" />
									RESULTADOS
								</Link>
							</Button>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
