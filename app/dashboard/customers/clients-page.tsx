"use client";
import { buildSalesIntegrationFilterOptions } from "@/components/Sales/sales-integration-filter-options";
import ClientsGraphs from "@/components/Clients/ClientsGraphs";
import { ClientReconciliationQueue } from "@/components/Clients/duplicates/ClientReconciliationQueue";
import ClientsRanking from "@/components/Clients/ClientsRanking";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import {
	InteractiveFilter,
	type InteractiveFilterDateRangePreset,
	type InteractiveFilterOption,
	type InteractiveFilterSortValue,
} from "@/components/ui/interactive-filter";
import { Input } from "@/components/ui/input";
import { StatBadge } from "@/components/ui/stat-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import {
	formatInteractiveDateRangeSummary,
	formatInteractiveOptionSummary,
	formatInteractiveSortFieldSummary,
	isInteractiveSortActive,
} from "@/components/ui/interactive-filter-formatting";
import { useClientsOverallStats, useClientsQuery } from "@/lib/queries/clients";
import { clientsDatabaseParsers, toClientsInput, type TClientsDatabaseUrlState } from "@/lib/clients/database-url-state";
import { useDebounceMemo } from "@/lib/hooks/use-debounce";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import { cn } from "@/lib/utils";
import type { TGetClientsInput, TGetClientsOutputDefault } from "@/app/api/clients/route";
import type { TGetClientsOverallStatsInput } from "@/app/api/clients/stats/overall/route";
import dayjs from "dayjs";
import {
	FileSpreadsheet,
	BadgeDollarSign,
	BadgePercent,
	Cake,
	CirclePlus,
	Info,
	ListFilter,
	Mail,
	Megaphone,
	Phone,
	ShoppingCart,
	TrendingUp,
	UserPlus,
	UserRoundX,
	Users,
	Plus,
} from "lucide-react";
import Link from "next/link";
import { parseAsStringEnum, useQueryState, useQueryStates } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { BsCalendar } from "react-icons/bs";
import { CustomersAcquisitionChannels } from "@/utils/select-options";
import { RFMLabels } from "@/utils/rfm";
import ControlClient from "@/components/Modals/Clients/ControlClient";
import { Pencil } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import NewClient from "@/components/Modals/Clients/NewClient";
import ExportClients from "@/components/Modals/Clients/ExportClients";
import { ClientsGeographicMap } from "@/components/Stats/ClientsGeographicMap";
type ClientsPageProps = {
	user: TAuthUserSession["user"];
	canReconcileClients: boolean;
};
export default function ClientsPage({ user, canReconcileClients }: ClientsPageProps) {
	const [viewMode, setViewMode] = useQueryState("view", parseAsStringEnum(["stats", "database"]));
	return (
		<div className="w-full h-full flex flex-col gap-3">
			<Tabs value={viewMode ?? "stats"} onValueChange={(v: string) => setViewMode(v as "stats" | "database")}>
				<div className="w-full flex items-center justify-between gap-2 flex-wrap">
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
					<ClientReconciliationQueue canReconcile={canReconcileClients} />
				</div>
				<TabsContent value="stats">
					<ClientsStatsView />
				</TabsContent>
				<TabsContent value="database">
					<ClientsDatabaseView />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function ClientsDatabaseView() {
	const queryClient = useQueryClient();
	const [newClientModalIsOpen, setNewClientModalIsOpen] = useState<boolean>(false);
	const [exportClientsModalIsOpen, setExportClientsModalIsOpen] = useState<boolean>(false);
	const [editingClientId, setEditingClientId] = useState<string | null>(null);
	// Filtros na URL (nuqs): compartilháveis e alvo de links de outras telas (ex.: dashboard) — o
	// mesmo padrão do histórico de vendas. Ver `lib/clients/database-url-state.ts`.
	const [urlState, setUrlState] = useQueryStates(clientsDatabaseParsers, { history: "replace" });
	const filters = useMemo(() => toClientsInput(urlState), [urlState]);
	const updateFilters = (next: Partial<TClientsDatabaseUrlState>) => void setUrlState(next);

	// O período padrão das estatísticas segue sendo o mês corrente — mas só quando a página abre sem
	// período na URL. Ele é semeado NA URL (e não aplicado por fora) para que o chip mostre o que
	// realmente vale; o ref garante que "limpar o período" não seja re-semeado dentro da sessão.
	const monthSeededRef = useRef(false);
	useEffect(() => {
		if (monthSeededRef.current) return;
		monthSeededRef.current = true;
		if (!urlState.statsPeriodAfter && !urlState.statsPeriodBefore) {
			void setUrlState({ statsPeriodAfter: dayjs().startOf("month").toDate(), statsPeriodBefore: dayjs().endOf("month").toDate() });
		}
	}, [urlState, setUrlState]);

	const debouncedFilters = useDebounceMemo(filters, 1000);
	const { data: clientsResult, queryKey, isSuccess, isLoading, isError, error } = useClientsQuery({ params: debouncedFilters });
	const clients = clientsResult?.clients;
	const clientsShowing = clients ? clients.length : 0;
	const clientsMatched = clientsResult?.clientsMatched || 0;
	const totalPages = clientsResult?.totalPages;

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey: queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey: queryKey });
	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center gap-2">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar cliente..."
					onChange={(e) => updateFilters({ search: e.target.value })}
					className="grow rounded-xl"
				/>
				<div className="flex items-center gap-2">
					<Button variant="ghost" className="flex items-center gap-2" size="sm" onClick={() => setExportClientsModalIsOpen(true)}>
						<FileSpreadsheet className="w-4 h-4 min-w-4 min-h-4" />
						EXPORTAR
					</Button>
					<Button variant={"ghost"} className="flex items-center gap-2" size="sm" asChild>
						<Link href={appRoutes.customers.import()}>
							<FileSpreadsheet className="w-4 h-4 min-w-4 min-h-4" />
							IMPORTAR
						</Link>
					</Button>
					<Button className="flex items-center gap-2" size="sm" onClick={() => setNewClientModalIsOpen(true)}>
						<Plus className="w-4 h-4 min-w-4 min-h-4" />
						NOVO CLIENTE
					</Button>
				</div>
			</div>
			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={clientsMatched > 0 ? `${clientsMatched} clientes encontrados.` : `${clientsMatched} cliente encontrado.`}
				itemsShowingText={clientsShowing > 0 ? `Mostrando ${clientsShowing} clientes.` : `Mostrando ${clientsShowing} cliente.`}
			/>
			<ClientsInlineFilters filters={filters} updateFilters={updateFilters} />
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && clients ? (
				clients.length > 0 ? (
					clients.map((client, index: number) => <ClientPageCard key={client.id} client={client} handleEditClick={() => setEditingClientId(client.id)} />)
				) : (
					<p className="w-full tracking-tight text-center">Nenhum cliente encontrado.</p>
				)
			) : null}
			{editingClientId ? (
				<ControlClient
					clientId={editingClientId}
					closeModal={() => setEditingClientId(null)}
					callbacks={{
						onMutate: handleOnMutate,
						onSettled: handleOnSettled,
					}}
				/>
			) : null}
			{newClientModalIsOpen ? (
				<NewClient closeModal={() => setNewClientModalIsOpen(false)} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
			) : null}
			{exportClientsModalIsOpen ? <ExportClients filters={filters} closeModal={() => setExportClientsModalIsOpen(false)} /> : null}
		</div>
	);
}

// Presets de aniversário olham para a frente ("quem faz aniversário em breve"), ao contrário dos
// presets padrão do DateRange, que recortam o passado.
const birthdayRangePresets = [
	{ id: "today", label: "HOJE", getValue: (ref: Date) => ({ from: dayjs(ref).startOf("day").toDate(), to: dayjs(ref).endOf("day").toDate() }) },
	{
		id: "next-7-days",
		label: "PRÓXIMOS 7 DIAS",
		getValue: (ref: Date) => ({ from: dayjs(ref).startOf("day").toDate(), to: dayjs(ref).add(6, "day").endOf("day").toDate() }),
	},
	{
		id: "this-month",
		label: "ESTE MÊS",
		getValue: (ref: Date) => ({ from: dayjs(ref).startOf("month").toDate(), to: dayjs(ref).endOf("month").toDate() }),
	},
	{
		id: "next-month",
		label: "PRÓXIMO MÊS",
		getValue: (ref: Date) => ({ from: dayjs(ref).add(1, "month").startOf("month").toDate(), to: dayjs(ref).add(1, "month").endOf("month").toDate() }),
	},
] satisfies InteractiveFilterDateRangePreset[];

type ClientsInlineFiltersProps = {
	filters: TGetClientsInput;
	updateFilters: (filters: Partial<TClientsDatabaseUrlState>) => void;
};

function ClientsInlineFilters({ filters, updateFilters }: ClientsInlineFiltersProps) {
	const { data: filterOptions } = useSaleQueryFilterOptions();
	const integrationOptions = buildSalesIntegrationFilterOptions(filterOptions?.integrations);
	const acquisitionChannelOptions = CustomersAcquisitionChannels as InteractiveFilterOption<string>[];
	const segmentationOptions = RFMLabels.map((item, index) => ({
		id: index + 1,
		label: item.text,
		value: item.text,
	})) satisfies InteractiveFilterOption<string>[];
	const orderFieldOptions = [
		{ id: "nome", label: "NOME", value: "nome" },
		{ id: "comprasValorTotal", label: "VALOR TOTAL DE COMPRAS", value: "comprasValorTotal" },
		{ id: "comprasQtdeTotal", label: "QUANTIDADE TOTAL DE COMPRAS", value: "comprasQtdeTotal" },
		{ id: "primeiraCompraData", label: "PRIMEIRA COMPRA", value: "primeiraCompraData" },
		{ id: "ultimaCompraData", label: "ÚLTIMA COMPRA", value: "ultimaCompraData" },
	] satisfies InteractiveFilterOption<NonNullable<TGetClientsInput["orderByField"]>>[];
	const defaultSort = {
		field: "nome",
		direction: "asc",
	} satisfies InteractiveFilterSortValue<NonNullable<TGetClientsInput["orderByField"]>>;
	const sortValue = {
		field: filters.orderByField ?? defaultSort.field,
		direction: filters.orderByDirection ?? defaultSort.direction,
	} satisfies InteractiveFilterSortValue<NonNullable<TGetClientsInput["orderByField"]>>;
	const hasIntegrations = (filters.statsIntegrationsIds ?? []).length > 0;
	const hasAcquisitionChannels = (filters.acquisitionChannels ?? []).length > 0;
	const hasSegmentationTitles = (filters.segmentationTitles ?? []).length > 0;
	const hasBirthdays = !!(filters.birthdaysPeriodAfter || filters.birthdaysPeriodBefore);
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

			{hasIntegrations ? (
				<ClientsMultiFilter
					label="INTEGRAÇÕES"
					options={integrationOptions}
					value={filters.statsIntegrationsIds ?? []}
					onChange={(statsIntegrationsIds) => updateFilters({ statsIntegrationsIds, page: 1 })}
					onClear={() => updateFilters({ statsIntegrationsIds: [], page: 1 })}
				/>
			) : null}
			{hasAcquisitionChannels ? (
				<ClientsMultiFilter
					label="AQUISIÇÃO"
					options={acquisitionChannelOptions}
					value={filters.acquisitionChannels ?? []}
					onChange={(acquisitionChannels) => updateFilters({ acquisitionChannels, page: 1 })}
					onClear={() => updateFilters({ acquisitionChannels: [], page: 1 })}
				/>
			) : null}
			{hasSegmentationTitles ? (
				<ClientsMultiFilter
					label="SEGMENTAÇÃO"
					options={segmentationOptions}
					value={filters.segmentationTitles ?? []}
					onChange={(segmentationTitles) => updateFilters({ segmentationTitles, page: 1 })}
					onClear={() => updateFilters({ segmentationTitles: [], page: 1 })}
				/>
			) : null}
			{hasBirthdays ? (
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<Cake className="h-4 w-4" />
							<InteractiveFilter.Label>ANIVERSARIANTES</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>
							{formatInteractiveDateRangeSummary(filters.birthdaysPeriodAfter, filters.birthdaysPeriodBefore)}
						</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ birthdaysPeriodAfter: null, birthdaysPeriodBefore: null, page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0">
						<InteractiveFilter.DateRangeContent
							presets={birthdayRangePresets}
							value={{ from: filters.birthdaysPeriodAfter ?? undefined, to: filters.birthdaysPeriodBefore ?? undefined }}
							onChange={(period) => updateFilters({ birthdaysPeriodAfter: period.from ?? null, birthdaysPeriodBefore: period.to ?? null, page: 1 })}
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			) : null}
			{hasActiveSort ? (
				<ClientsSortFilter
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
						{!hasAcquisitionChannels ? (
							<InteractiveFilter.AddFilterItem id="acquisitionChannels" label="AQUISIÇÃO" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={acquisitionChannelOptions}
									value={filters.acquisitionChannels ?? []}
									onChange={(acquisitionChannels) => updateFilters({ acquisitionChannels, page: 1 })}
									onClear={() => updateFilters({ acquisitionChannels: [], page: 1 })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasSegmentationTitles ? (
							<InteractiveFilter.AddFilterItem id="segmentation" label="SEGMENTAÇÃO" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={segmentationOptions}
									value={filters.segmentationTitles ?? []}
									onChange={(segmentationTitles) => updateFilters({ segmentationTitles, page: 1 })}
									onClear={() => updateFilters({ segmentationTitles: [], page: 1 })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasBirthdays ? (
							<InteractiveFilter.AddFilterItem id="birthdays" label="ANIVERSARIANTES" icon={<Cake className="h-4 w-4" />}>
								<InteractiveFilter.DateRangeContent
									presets={birthdayRangePresets}
									value={{ from: filters.birthdaysPeriodAfter ?? undefined, to: filters.birthdaysPeriodBefore ?? undefined }}
									onChange={(period) => updateFilters({ birthdaysPeriodAfter: period.from ?? null, birthdaysPeriodBefore: period.to ?? null, page: 1 })}
								/>
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

function ClientsSortFilter<TField extends string>({
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

function ClientsMultiFilter({
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

// Eyebrow que separa os grupos de métricas por escopo temporal (período filtrado vs. base acumulada).
function StatsScopeHeading({ label, description }: { label: string; description?: string }) {
	return (
		<div className="mt-1 flex w-full items-baseline gap-2">
			<h2 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">{label}</h2>
			{description ? <span className="hidden text-[0.65rem] text-muted-foreground/70 sm:inline">{description}</span> : null}
		</div>
	);
}

function ClientsStatsView() {
	const initialStartDate = dayjs().startOf("month");
	const initialEndDate = dayjs().endOf("month");
	const [filters, setFilters] = useState<TGetClientsOverallStatsInput>({
		periodAfter: initialStartDate.toDate(),
		periodBefore: initialEndDate.toDate(),
		comparingPeriodAfter: initialStartDate.subtract(1, "month").toDate(),
		comparingPeriodBefore: initialEndDate.subtract(1, "month").toDate(),
	});
	const { data: clientsOverallStats, isLoading: clientsOverallStatsLoading } = useClientsOverallStats({
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
					handleChange={(value) =>
						setFilters({
							periodAfter: value.after ? new Date(value.after) : null,
							periodBefore: value.before ? new Date(value.before) : null,
							comparingPeriodAfter: value.after ? dayjs(value.after).subtract(1, "month").toDate() : null,
							comparingPeriodBefore: value.before ? dayjs(value.before).subtract(1, "month").toDate() : null,
						})
					}
				/>
			</div>
			<StatsScopeHeading label="Base acumulada" description="retrato da sua base até o fim do período" />
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="TOTAL DE CLIENTES"
					subtitle="Número de clientes identificados"
					icon={<Users className="w-4 h-4 min-w-4 min-h-4" />}
					temporalScope={{ tipo: "ACUMULADO", ate: filters.periodBefore }}
					previousLabel="NO FIM DO PERÍODO ANTERIOR"
					current={{
						value: clientsOverallStats?.totalClients.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						clientsOverallStats?.totalClients.comparison
							? {
									value: clientsOverallStats?.totalClients.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="LTV"
					subtitle="Gasto médio por cliente ao longo da vida"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					temporalScope={{ tipo: "ACUMULADO", ate: filters.periodBefore }}
					previousLabel="NO FIM DO PERÍODO ANTERIOR"
					current={{
						value: clientsOverallStats?.ltv.current || 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						clientsOverallStats?.ltv.comparison
							? {
									value: clientsOverallStats?.ltv.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="LIFETIME MÉDIO"
					subtitle="Da 1ª à última compra, clientes com 2+ compras"
					icon={<BsCalendar className="w-4 h-4 min-w-4 min-h-4" />}
					temporalScope={{ tipo: "ACUMULADO", ate: filters.periodBefore }}
					previousLabel="NO FIM DO PERÍODO ANTERIOR"
					current={{
						value: clientsOverallStats?.avgLifetime.current || 0,
						format: (n) => `${formatDecimalPlaces(n)} dias`,
					}}
					previous={
						clientsOverallStats?.avgLifetime.comparison
							? {
									value: clientsOverallStats?.avgLifetime.comparison || 0,
									format: (n) => `${formatDecimalPlaces(n)} dias`,
								}
							: undefined
					}
				/>
			</div>
			<StatsScopeHeading label="No período selecionado" description="o que aconteceu dentro da janela filtrada" />
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="TOTAL DE CLIENTES NOVOS"
					icon={<UserPlus className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: clientsOverallStats?.totalNewClients.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						clientsOverallStats?.totalNewClients.comparison
							? {
									value: clientsOverallStats?.totalNewClients.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
					className="w-full lg:w-1/2"
				/>
				<StatUnitCard
					title="RECEITA MÉDIA POR CLIENTE"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: clientsOverallStats?.periodRevenuePerClient.current || 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						clientsOverallStats?.periodRevenuePerClient.comparison
							? {
									value: clientsOverallStats?.periodRevenuePerClient.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
					className="w-full lg:w-1/2"
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="FATURAMENTO POR CLIENTES EXISTENTES"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: clientsOverallStats?.revenueFromRecurrentClients.current ? Number(clientsOverallStats?.revenueFromRecurrentClients.current) : 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						clientsOverallStats?.revenueFromRecurrentClients.comparison
							? {
									value: clientsOverallStats?.revenueFromRecurrentClients.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
					footer={
						<div className="flex items-center gap-1">
							<p className="text-xs text-muted-foreground tracking-tight">REPRESENTATIVIDADE:</p>
							<p className="text-xs font-bold text-foreground">{formatDecimalPlaces(clientsOverallStats?.revenueFromRecurrentClients.percentage || 0)}%</p>
						</div>
					}
					className="w-full lg:w-1/3"
				/>
				<StatUnitCard
					title="FATURAMENTO POR CLIENTES NOVOS"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: clientsOverallStats?.revenueFromNewClients.current ? Number(clientsOverallStats?.revenueFromNewClients.current) : 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						clientsOverallStats?.revenueFromNewClients.comparison
							? {
									value: clientsOverallStats?.revenueFromNewClients.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
					footer={
						<div className="flex items-center gap-1">
							<p className="text-xs text-muted-foreground tracking-tight">REPRESENTATIVIDADE:</p>
							<p className="text-xs font-bold text-foreground">{formatDecimalPlaces(clientsOverallStats?.revenueFromNewClients.percentage || 0)}%</p>
						</div>
					}
					className="w-full lg:w-1/3"
				/>
				<StatUnitCard
					title="FATURAMENTO AO CONSUMIDOR"
					icon={<UserRoundX className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: clientsOverallStats?.revenueFromNonIdentifiedClients.current ? Number(clientsOverallStats?.revenueFromNonIdentifiedClients.current) : 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						clientsOverallStats?.revenueFromNonIdentifiedClients.comparison
							? {
									value: clientsOverallStats?.revenueFromNonIdentifiedClients.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
					footer={
						<div className="flex items-center gap-1">
							<p className="text-xs text-muted-foreground tracking-tight">REPRESENTATIVIDADE:</p>
							<p className="text-xs font-bold text-foreground">
								{formatDecimalPlaces(clientsOverallStats?.revenueFromNonIdentifiedClients.percentage || 0)}%
							</p>
						</div>
					}
					className="w-full lg:w-1/3"
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3 h-[550px]">
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<ClientsGraphs
						periodAfter={filters.periodAfter}
						periodBefore={filters.periodBefore}
						comparingPeriodAfter={filters.comparingPeriodAfter}
						comparingPeriodBefore={filters.comparingPeriodBefore}
					/>
				</div>
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<ClientsRanking
						periodAfter={filters.periodAfter}
						periodBefore={filters.periodBefore}
						comparingPeriodAfter={filters.comparingPeriodAfter}
						comparingPeriodBefore={filters.comparingPeriodBefore}
					/>
				</div>
			</div>
			<ClientsGeographicMap />
		</div>
	);
}

type ClientCardProps = {
	client: TGetClientsOutputDefault["clients"][number];
	handleEditClick: () => void;
};
function ClientPageCard({ client, handleEditClick }: ClientCardProps) {
	const clientCashbackBalance = client.saldos.length > 0 ? client.saldos[0] : null;

	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="w-full flex items-center justify-between flex-col md:flex-row gap-2">
				<div className="flex items-center gap-2 flex-wrap">
					<h1 className="text-xs font-bold tracking-tight lg:text-sm">{client.nome}</h1>
					<div className={cn("flex items-center gap-1")}>
						<Phone className="w-4 h-4 min-w-4 min-h-4" />
						<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic">{client.telefone || "NÃO DEFINIDO"}</h1>
					</div>
					{client.email ? (
						<div className="flex items-center gap-1">
							<Mail className="w-4 h-4 min-w-4 min-h-4" />
							<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic">{client.email}</h1>
						</div>
					) : null}
					{client.canalAquisicao ? (
						<div className="flex items-center gap-1">
							<Megaphone className="w-4 h-4 min-w-4 min-h-4" />
							<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic">{client.canalAquisicao || "N/A"}</h1>
						</div>
					) : null}
				</div>
				<div className="flex items-center gap-3 flex-col md:flex-row gap-y-1">
					<div className="flex items-center gap-3">
						<StatBadge
							icon={<CirclePlus className="w-4 min-w-4 h-4 min-h-4" />}
							value={client.estatisticas.comprasQtdeTotal}
							tooltipContent="Quantidade total de compras no período de filtro"
						/>
						<StatBadge
							icon={<BadgeDollarSign className="w-4 min-w-4 h-4 min-h-4" />}
							value={formatToMoney(client.estatisticas.comprasValorTotal)}
							tooltipContent="Valor total de compras no período de filtro"
						/>
						{clientCashbackBalance ? (
							<StatBadge
								icon={<BadgePercent className="w-4 min-w-4 h-4 min-h-4" />}
								value={`CASHBACK: ${formatToMoney(clientCashbackBalance.saldoValorDisponivel)}`}
								tooltipContent="Saldo em cashback disponível"
							/>
						) : null}
					</div>
				</div>
			</div>
			<div className="w-full flex items-center justify-center lg:justify-between gap-2 flex-wrap">
				<div className="flex items-center gap-2">
					{client.estatisticas.primeiraCompraData ? (
						<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground")}>
							<BsCalendar className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs font-medium tracking-tight uppercase">PRIMEIRA VENDA: {formatDateAsLocale(client.estatisticas.primeiraCompraData)}</p>
						</div>
					) : null}
					{client.estatisticas.ultimaCompraData ? (
						<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground")}>
							<BsCalendar className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs font-medium tracking-tight uppercase">ÚLTIMA VENDA: {formatDateAsLocale(client.estatisticas.ultimaCompraData)}</p>
						</div>
					) : null}
					{client.metadataGrupoProdutoMaisComprado ? (
						<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground")}>
							<ShoppingCart className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs font-medium tracking-tight uppercase">PREFERÊNCIA: {client.metadataGrupoProdutoMaisComprado}</p>
						</div>
					) : null}
				</div>
				<div className="flex items-center gap-3">
					<Button variant="ghost" className="flex items-center gap-1.5" size="sm" onClick={handleEditClick}>
						<Pencil className="w-3 min-w-3 h-3 min-h-3" />
						EDITAR
					</Button>
					<Button variant="link" className="flex items-center gap-1.5" size="sm" asChild>
						<Link href={appRoutes.customers.details(client.id)}>
							<Info className="w-3 min-w-3 h-3 min-h-3" />
							DETALHES
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
