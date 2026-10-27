"use client";

import { ResponsiveMenuAnimatedBody } from "@/components/Utils/ResponsiveMenuAnimatedBody";
import { LoadingButton } from "@/components/loading-button";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";

import { TSyncSegmentationsInput } from "@/app/api/segmentations/sync/route";
import { buildSalesIntegrationFilterOptions } from "@/components/Sales/sales-integration-filter-options";
import CheckboxInput from "@/components/Inputs/CheckboxInput";
import MultipleSalesSelectInput from "@/components/Inputs/SelectMultipleSalesInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import EditRFMConfig from "@/components/Modals/RFMConfig/EditRFMConfig";
import NewRFMConfig from "@/components/Modals/RFMConfig/NewRFMConfig";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { InteractiveFilter, type InteractiveFilterOption } from "@/components/ui/interactive-filter";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { getExcelFromJSON } from "@/lib/excel-utils";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import {
	formatInteractiveCountSummary,
	formatInteractiveDateRangeSummary,
	formatInteractiveOptionSummary,
} from "@/components/ui/interactive-filter-formatting";
import { syncSegmentations } from "@/lib/mutations/segmentations";
import { useClients, useClientsBySearch } from "@/lib/queries/clients";
import { fetchClientExportation } from "@/lib/queries/exportations";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useRFMLabelledStats } from "@/lib/queries/stats/rfm-labelled";
import { cn } from "@/lib/utils";
import type { TRFMLabelledStats } from "@/app/api/stats/sales-rfm-labelled/route";
import type { TGetClientsInput, TGetClientsOutputDefault } from "@/app/api/clients/route";
import { RFMLabels, type TRFMConfig, getRFMConfigByLabel } from "@/utils/rfm";
import { AspectRatio } from "@radix-ui/react-aspect-ratio";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
	BadgeDollarSign,
	BadgePercent,
	Download,
	Grid3x3,
	Info,
	Mail,
	Megaphone,
	Package,
	Phone,
	RefreshCcw,
	Settings2,
	ShoppingCart,
	UsersRound,
	Filter,
	FilterX,
	Grid3X3,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BsCalendar } from "react-icons/bs";
import { toast } from "sonner";
import { CustomersAcquisitionChannels } from "@/utils/select-options";
import SegmentsPageRFMHealth from "./rfm-health-section";

type SegmentsPageProps = {
	user: TAuthUserSession["user"];
	orgRFMConfig: TRFMConfig | null;
};
export default function SegmentsPage({ user, orgRFMConfig }: SegmentsPageProps) {
	const [configMenuIsOpen, setConfigMenuIsOpen] = useState(false);
	// A listagem mora aqui, e não no bloco de clientes, porque a matriz também escreve no filtro de segmentação.
	const clientsQuery = useClients({
		initialFilters: {
			statsPeriodAfter: dayjs().startOf("month").toDate(),
			statsPeriodBefore: dayjs().endOf("month").toDate(),
		},
	});
	const selectedSegments = clientsQuery.filters.segmentationTitles ?? [];
	// Cada clique soma o segmento à listagem; clicar de novo num segmento já filtrado o retira.
	const toggleSegment = (rfmLabel: string) =>
		clientsQuery.updateFilters({
			segmentationTitles: selectedSegments.includes(rfmLabel) ? selectedSegments.filter((label) => label !== rfmLabel) : [...selectedSegments, rfmLabel],
			page: 1,
		});
	return (
		<div className="w-full h-full flex flex-col gap-3">
			<div className="flex w-full flex-col items-stretch gap-3 lg:flex-row">
				<div className="w-full lg:w-1/2">
					<SegmentsPageMatrixRFM onOpenConfig={() => setConfigMenuIsOpen(true)} selectedSegments={selectedSegments} onToggleSegment={toggleSegment} />
				</div>
				<div className="w-full lg:w-1/2">
					<SegmentsPageClients clientsQuery={clientsQuery} />
				</div>
			</div>
			<SegmentsPageRFMHealth onOpenConfig={() => setConfigMenuIsOpen(true)} />
			{configMenuIsOpen ? (
				orgRFMConfig ? (
					<EditRFMConfig user={user} rfmConfig={orgRFMConfig} closeModal={() => setConfigMenuIsOpen(false)} />
				) : (
					<NewRFMConfig user={user} closeModal={() => setConfigMenuIsOpen(false)} />
				)
			) : null}
		</div>
	);
}

/**
 *
 * CLIENTS RELATED COMPONENTS
 */
function SegmentsPageClients({ clientsQuery }: { clientsQuery: ReturnType<typeof useClients> }) {
	const { data: clientsResult, isSuccess, isLoading, isError, error, filters, updateFilters } = clientsQuery;
	const clients = clientsResult?.clients;
	const clientsShowing = clients ? clients.length : 0;
	const clientsMatched = clientsResult?.clientsMatched || 0;
	const totalPages = clientsResult?.totalPages;

	async function handleExportData() {
		try {
			const data = await fetchClientExportation({
				filters: {
					acquisitionChannels: filters.acquisitionChannels,
					page: filters.page,
					name: filters.search ?? "",
					excludedSalesIds: filters.statsExcludedSalesIds,
					period: {
						after: filters.statsPeriodAfter ? filters.statsPeriodAfter.toISOString() : null,
						before: filters.statsPeriodBefore ? filters.statsPeriodBefore.toISOString() : null,
					},
					phone: filters.search ?? "",
					rfmTitles: filters.segmentationTitles,
					total: { min: null, max: null },
				},
			});
			getExcelFromJSON(data, `CLIENTES ${dayjs().format("DD-MM-YYYY")}`);

			return toast.success("Dados exportados com sucesso !");
		} catch (error) {
			const msg = getErrorMessage(error);
			return toast.error(msg);
		}
	}
	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs h-full")}>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<UsersRound className="w-4 h-4 min-w-4 min-h-4" />
					<h1 className="text-xs font-medium tracking-tight uppercase">CLIENTES</h1>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={handleExportData}>
						<Download className="w-4 h-4 min-w-4 min-h-4" />
						EXPORTAR
					</Button>
				</div>
			</div>

			<SegmentsClientsInlineFilters filters={filters} updateFilters={updateFilters} />
			<div className="w-full flex-1 max-h-[700px] flex flex-col gap-2 overflow-y-auto overscroll-y-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 px-2">
				<GeneralPaginationComponent
					activePage={filters.page}
					queryLoading={isLoading}
					selectPage={(page) => updateFilters({ page })}
					totalPages={totalPages || 0}
					itemsMatchedText={clientsMatched > 0 ? `${clientsMatched} clientes encontrados.` : `${clientsMatched} cliente encontrado.`}
					itemsShowingText={clientsShowing > 0 ? `Mostrando ${clientsShowing} clientes.` : `Mostrando ${clientsShowing} cliente.`}
				/>
				{isLoading ? <LoadingComponent /> : null}
				{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
				{isSuccess && clients ? (
					clients.length > 0 ? (
						clients.map((client) => (
							<SegmentsPageClientCard
								key={client.id}
								client={client}
								period={{
									after: filters.statsPeriodAfter ? new Date(filters.statsPeriodAfter) : new Date(),
									before: filters.statsPeriodBefore ? new Date(filters.statsPeriodBefore) : new Date(),
								}}
							/>
						))
					) : (
						<p className="w-full tracking-tight text-center">Nenhum cliente encontrado.</p>
					)
				) : null}
			</div>
		</div>
	);
}

type SegmentsClientsInlineFiltersProps = {
	filters: TGetClientsInput;
	updateFilters: (params: Partial<TGetClientsInput>) => void;
};

function SegmentsClientsInlineFilters({ filters, updateFilters }: SegmentsClientsInlineFiltersProps) {
	const { data: filterOptions } = useSaleQueryFilterOptions();
	const integrationOptions = buildSalesIntegrationFilterOptions(filterOptions?.integrations);
	const acquisitionChannelOptions = CustomersAcquisitionChannels as InteractiveFilterOption<string>[];
	const segmentationOptions = RFMLabels.map((item, index) => ({
		id: index + 1,
		label: item.text,
		value: item.text,
	})) satisfies InteractiveFilterOption<string>[];
	const hasAcquisitionChannels = (filters.acquisitionChannels ?? []).length > 0;
	const hasSegmentationTitles = (filters.segmentationTitles ?? []).length > 0;
	const hasIntegrations = (filters.statsIntegrationsIds ?? []).length > 0;
	const hasExcludedSales = (filters.statsExcludedSalesIds ?? []).length > 0;

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

			{hasAcquisitionChannels ? (
				<SegmentsMultiFilter
					label="AQUISIÇÃO"
					options={acquisitionChannelOptions}
					value={filters.acquisitionChannels ?? []}
					onChange={(acquisitionChannels) => updateFilters({ acquisitionChannels, page: 1 })}
					onClear={() => updateFilters({ acquisitionChannels: [], page: 1 })}
				/>
			) : null}
			{hasSegmentationTitles ? (
				<SegmentsMultiFilter
					label="SEGMENTAÇÃO"
					options={segmentationOptions}
					value={filters.segmentationTitles ?? []}
					onChange={(segmentationTitles) => updateFilters({ segmentationTitles, page: 1 })}
					onClear={() => updateFilters({ segmentationTitles: [], page: 1 })}
				/>
			) : null}
			{hasIntegrations ? (
				<SegmentsMultiFilter
					label="INTEGRAÇÕES"
					options={integrationOptions}
					value={filters.statsIntegrationsIds ?? []}
					onChange={(statsIntegrationsIds) => updateFilters({ statsIntegrationsIds, page: 1 })}
					onClear={() => updateFilters({ statsIntegrationsIds: [], page: 1 })}
				/>
			) : null}
			{hasExcludedSales ? <SegmentsExcludedSalesFilter filters={filters} updateFilters={updateFilters} /> : null}

			<InteractiveFilter.AddFilterRoot className="w-fit">
				<InteractiveFilter.AddFilterTrigger>
					<Filter className="h-4 w-4" />
					<InteractiveFilter.Label>ADICIONAR FILTRO</InteractiveFilter.Label>
				</InteractiveFilter.AddFilterTrigger>
				<InteractiveFilter.AddFilterContent>
					<InteractiveFilter.AddFilterSection heading="Filtros">
						{!hasAcquisitionChannels ? (
							<InteractiveFilter.AddFilterItem id="acquisition" label="AQUISIÇÃO" icon={<Filter className="h-4 w-4" />}>
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
							<InteractiveFilter.AddFilterItem id="segmentation" label="SEGMENTAÇÃO" icon={<Filter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={segmentationOptions}
									value={filters.segmentationTitles ?? []}
									onChange={(segmentationTitles) => updateFilters({ segmentationTitles, page: 1 })}
									onClear={() => updateFilters({ segmentationTitles: [], page: 1 })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasIntegrations ? (
							<InteractiveFilter.AddFilterItem id="integrations" label="INTEGRAÇÕES" icon={<Filter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={integrationOptions}
									value={filters.statsIntegrationsIds ?? []}
									onChange={(statsIntegrationsIds) => updateFilters({ statsIntegrationsIds, page: 1 })}
									onClear={() => updateFilters({ statsIntegrationsIds: [], page: 1 })}
									clearLabel="TODAS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasExcludedSales ? (
							<InteractiveFilter.AddFilterItem id="excludedSales" label="VENDAS EXCLUÍDAS" icon={<Filter className="h-4 w-4" />}>
								<SegmentsExcludedSalesFilterContent filters={filters} updateFilters={updateFilters} />
							</InteractiveFilter.AddFilterItem>
						) : null}
					</InteractiveFilter.AddFilterSection>
				</InteractiveFilter.AddFilterContent>
			</InteractiveFilter.AddFilterRoot>
		</div>
	);
}

function SegmentsExcludedSalesFilter({ filters, updateFilters }: SegmentsClientsInlineFiltersProps) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<Filter className="h-4 w-4" />
					<InteractiveFilter.Label>VENDAS EXCLUÍDAS</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveCountSummary(filters.statsExcludedSalesIds ?? [])}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={() => updateFilters({ statsExcludedSalesIds: [], page: 1 })} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-80 p-3">
				<SegmentsExcludedSalesFilterContent filters={filters} updateFilters={updateFilters} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function SegmentsExcludedSalesFilterContent({ filters, updateFilters }: SegmentsClientsInlineFiltersProps) {
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

function SegmentsMultiFilter({
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
					<Filter className="h-4 w-4" />
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

type SegmentsPageClientCardProps = {
	client: TGetClientsOutputDefault["clients"][number];
	period: { after: Date; before: Date };
};

function formatUltimaCompraRecenciaPhrase(ultimaCompra: Date | string | null | undefined): string {
	if (!ultimaCompra) return "Sem compra registrada";

	const d = typeof ultimaCompra === "string" ? dayjs(ultimaCompra) : dayjs(ultimaCompra);
	const days = dayjs().startOf("day").diff(d.startOf("day"), "day");

	if (days <= 0) return "Última compra: hoje";
	if (days === 1) return "Última compra: há 1 dia";
	return `Última compra: há ${days} dias`;
}

function SegmentsPageClientCard({ client, period }: SegmentsPageClientCardProps) {
	const rfmRecencia = client.analiseRFMNotasRecencia?.trim();
	const rfmFrequencia = client.analiseRFMNotasFrequencia?.trim();
	const rfmMonetario = client.analiseRFMNotasMonetario?.trim();
	const hasRfmScores = Boolean(rfmRecencia && rfmFrequencia && rfmMonetario);

	const lifetimeCompras = client.metadataTotalCompras ?? 0;
	const lifetimeValor = client.metadataValorTotalCompras != null ? Number(client.metadataValorTotalCompras) : 0;
	const hasLifetimeStats = lifetimeCompras > 0 || lifetimeValor > 0;

	const cashbackDisponivel =
		client.saldos?.reduce(
			(acc, s) => acc + (typeof s.saldoValorDisponivel === "number" ? s.saldoValorDisponivel : Number(s.saldoValorDisponivel ?? 0)),
			0,
		) ?? 0;

	const periodLabelShort = `${formatDateAsLocale(period.after) ?? ""} até ${formatDateAsLocale(period.before) ?? ""}`;

	const rfmStyling = useMemo(() => getRFMConfigByLabel(client.analiseRFMTitulo), [client.analiseRFMTitulo]);
	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0 flex-1 space-y-1.5">
					<p className="truncate text-sm font-semibold tracking-tight text-foreground">{client.nome}</p>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] text-muted-foreground">
						<span className="inline-flex items-center gap-1">
							<Phone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
							<span className="tabular-nums">{client.telefone}</span>
						</span>
						{client.email ? (
							<span className="inline-flex min-w-0 items-center gap-1">
								<Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
								<span className="truncate">{client.email}</span>
							</span>
						) : null}
						{client.canalAquisicao ? (
							<span className="inline-flex items-center gap-1">
								<Megaphone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
								<span>{client.canalAquisicao}</span>
							</span>
						) : null}
					</div>
				</div>
				<div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
					{client.analiseRFMTitulo ? (
						<div className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem]", rfmStyling.backgroundCollor, rfmStyling.textCollor)}>
							<Grid3X3 className="w-4 h-4 min-w-4 min-h-4" />
							<p className={cn("text-xs font-medium tracking-tight uppercase")}>{client.analiseRFMTitulo}</p>
						</div>
					) : null}
					<Button variant="link" className="flex items-center gap-1.5" size="sm" asChild>
						<Link href={appRoutes.customers.details(client.id)}>
							<Info className="w-3 min-w-3 h-3 min-h-3" />
							DETALHES
						</Link>
					</Button>
				</div>
			</div>

			{hasRfmScores ? (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">Notas RFM</span>
					<div className="flex flex-wrap gap-1">
						<Badge variant="secondary" className="font-mono text-[0.65rem] tabular-nums">
							R {rfmRecencia}
						</Badge>
						<Badge variant="secondary" className="font-mono text-[0.65rem] tabular-nums">
							F {rfmFrequencia}
						</Badge>
						<Badge variant="secondary" className="font-mono text-[0.65rem] tabular-nums">
							M {rfmMonetario}
						</Badge>
					</div>
				</div>
			) : null}

			<Separator />

			<div className="flex flex-col gap-2">
				<p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">Relação com a loja</p>
				<div className="grid gap-2 sm:grid-cols-2">
					<div className="rounded-md border border-border bg-muted/30 px-2.5 py-2">
						<p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">Recência</p>
						<p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{formatUltimaCompraRecenciaPhrase(client.ultimaCompraData)}</p>
						{client.ultimaCompraData ? <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{formatDateAsLocale(client.ultimaCompraData)}</p> : null}
					</div>
					<div className="rounded-md border border-border bg-muted/30 px-2.5 py-2">
						<p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">Histórico de compras</p>
						{hasLifetimeStats ? (
							<>
								<p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
									{lifetimeCompras} {lifetimeCompras === 1 ? "compra" : "compras"} · {formatToMoney(lifetimeValor)}
								</p>
								{client.metadataGrupoProdutoMaisComprado ? (
									<p className="mt-1 flex items-start gap-1 text-[0.65rem] text-muted-foreground">
										<Package className="mt-0.5 size-3 shrink-0" aria-hidden />
										<span>Mais comprado: {client.metadataGrupoProdutoMaisComprado}</span>
									</p>
								) : null}
							</>
						) : (
							<p className="mt-1 text-sm font-medium text-muted-foreground">Sem totais agregados ainda.</p>
						)}
					</div>
				</div>
				{cashbackDisponivel > 0 ? (
					<div className="flex items-center gap-2 rounded-md border border-brand/30 bg-brand/20 px-2.5 py-2">
						<BadgePercent className="size-3.5 shrink-0 text-brand" aria-hidden />
						<span className="text-[0.65rem] font-bold uppercase tracking-wide text-brand">Cashback disponível</span>
						<span className="ml-auto text-sm font-black tabular-nums text-brand">{formatToMoney(cashbackDisponivel)}</span>
					</div>
				) : null}
			</div>

			<Separator />

			<div className="flex flex-col gap-2">
				<p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">No período filtrado</p>
				<p className="text-[0.65rem] text-muted-foreground">{periodLabelShort}</p>
				<div className="flex w-full flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
					<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-2">
						<div className="flex items-baseline gap-2">
							<BsCalendar className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
							<div>
								<p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">Primeira compra no período</p>
								<p className="text-sm font-semibold tabular-nums text-foreground">{formatDateAsLocale(client.estatisticas.primeiraCompraData) || "—"}</p>
							</div>
						</div>
						<div className="flex items-baseline gap-2">
							<BsCalendar className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
							<div>
								<p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">Última compra no período</p>
								<p className="text-sm font-semibold tabular-nums text-foreground">{formatDateAsLocale(client.estatisticas.ultimaCompraData) || "—"}</p>
							</div>
						</div>
					</div>
					<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-2 lg:justify-end">
						<div className="flex items-baseline gap-2">
							<ShoppingCart className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
							<div>
								<p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">Compras no período</p>
								<p className="text-sm font-semibold tabular-nums text-foreground">{client.estatisticas.comprasQtdeTotal}</p>
							</div>
						</div>
						<div className="flex items-baseline gap-2">
							<BadgeDollarSign className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
							<div>
								<p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">Total comprado no período</p>
								<p className="text-sm font-semibold tabular-nums text-foreground">{formatToMoney(client.estatisticas.comprasValorTotal)}</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

/**
 * RFM MATRIX RELATED COMPONENTS
 */

const RFM_SEGMENT_STYLES: Record<string, { gradient: string; text: string; badge: string; badgeText: string }> = {
	CAMPEÕES: {
		gradient: "bg-gradient-to-br from-orange-400 via-orange-500 to-amber-600",
		text: "text-white",
		badge: "bg-white/20 border border-white/30 backdrop-blur-sm",
		badgeText: "text-white",
	},
	"CLIENTES LEAIS": {
		gradient: "bg-gradient-to-br from-emerald-400 via-emerald-500 to-green-600",
		text: "text-white",
		badge: "bg-white/20 border border-white/30 backdrop-blur-sm",
		badgeText: "text-white",
	},
	"POTENCIAIS CLIENTES LEAIS": {
		gradient: "bg-gradient-to-br from-amber-800 via-amber-900 to-yellow-950",
		text: "text-amber-100",
		badge: "bg-amber-100/20 border border-amber-100/30 backdrop-blur-sm",
		badgeText: "text-amber-100",
	},
	"CLIENTES RECENTES": {
		gradient: "bg-gradient-to-br from-teal-400 via-teal-500 to-cyan-600",
		text: "text-white",
		badge: "bg-white/20 border border-white/30 backdrop-blur-sm",
		badgeText: "text-white",
	},
	PROMISSORES: {
		gradient: "bg-gradient-to-br from-pink-400 via-pink-500 to-rose-600",
		text: "text-white",
		badge: "bg-white/20 border border-white/30 backdrop-blur-sm",
		badgeText: "text-white",
	},
	"PRECISAM DE ATENÇÃO": {
		gradient: "bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-600",
		text: "text-white",
		badge: "bg-white/20 border border-white/30 backdrop-blur-sm",
		badgeText: "text-white",
	},
	"PRESTES A DORMIR": {
		gradient: "bg-gradient-to-br from-yellow-500 via-yellow-600 to-amber-700",
		text: "text-white",
		badge: "bg-white/20 border border-white/30 backdrop-blur-sm",
		badgeText: "text-white",
	},
	"EM RISCO": {
		gradient: "bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500",
		text: "text-yellow-950",
		badge: "bg-yellow-950/15 border border-yellow-950/20 backdrop-blur-sm",
		badgeText: "text-yellow-950",
	},
	"NÃO PODE PERDÊ-LOS": {
		gradient: "bg-gradient-to-br from-blue-400 via-blue-500 to-sky-600",
		text: "text-white",
		badge: "bg-white/20 border border-white/30 backdrop-blur-sm",
		badgeText: "text-white",
	},
	HIBERNANDO: {
		gradient: "bg-gradient-to-br from-purple-400 via-purple-500 to-violet-600",
		text: "text-white",
		badge: "bg-white/20 border border-white/30 backdrop-blur-sm",
		badgeText: "text-white",
	},
	PERDIDOS: {
		gradient: "bg-gradient-to-br from-red-400 via-red-500 to-rose-700",
		text: "text-white",
		badge: "bg-white/20 border border-white/30 backdrop-blur-sm",
		badgeText: "text-white",
	},
};

const DEFAULT_SEGMENT_STYLE = {
	gradient: "bg-gradient-to-br from-gray-400 to-gray-500",
	text: "text-white",
	badge: "bg-white/20 border border-white/30",
	badgeText: "text-white",
};

function getSegmentStyle(label: string) {
	return RFM_SEGMENT_STYLES[label] || DEFAULT_SEGMENT_STYLE;
}

/**
 * Layout config per segment.
 * PERDIDOS spans a 2×2 grid area and uses clip-path to carve an L-shape
 * (cutting out the top-right quadrant where HIBERNANDO sits).
 * Content is pushed to the bottom-left quadrant of that L.
 */
type SegmentLayout = {
	clipPath?: string;
	/** Extra classes for content alignment (defaults to centered) */
	contentWrapper?: string;
};

function getSegmentLayout(label: string): SegmentLayout {
	if (label === "PERDIDOS") {
		return {
			// L-shape: full left column + bottom-right quadrant. Cuts top-right.
			clipPath: "polygon(0 0, 50% 0, 50% 50%, 100% 50%, 100% 100%, 0 100%)",
			// Place content in the bottom-left quadrant of the 2×2 block
			contentWrapper: "absolute bottom-0 left-0 h-1/2 w-1/2",
		};
	}
	return {};
}

/** Single-cell segments that need badge-only treatment on very narrow screens. */
const RFM_COMPACT_SEGMENTS = new Set(["CAMPEÕES", "PRECISAM DE ATENÇÃO", "HIBERNANDO", "PROMISSORES", "CLIENTES RECENTES"]);

/** Paint order for overlapping grid areas (treemap-style matrix). */
const RFM_SEGMENT_Z_INDEX: Record<string, number> = {
	CAMPEÕES: 30,
	HIBERNANDO: 30,
	"PRECISAM DE ATENÇÃO": 25,
	PROMISSORES: 25,
	"CLIENTES RECENTES": 25,
	"PRESTES A DORMIR": 15,
	"NÃO PODE PERDÊ-LOS": 12,
	"EM RISCO": 12,
	"POTENCIAIS CLIENTES LEAIS": 12,
	"CLIENTES LEAIS": 8,
	PERDIDOS: 5,
};

const RFM_SEGMENT_DETAIL_PANEL_CLASS = "w-[min(280px,calc(100vw-2rem))] p-4";

type RFMSegmentDetailContentProps = {
	item: TRFMLabelledStats[number];
	style: ReturnType<typeof getSegmentStyle>;
	formatDecimal: (value: number, fractionDigits?: number) => string;
	isSelected: boolean;
	// Só no toque: lá o toque abre os detalhes, então filtrar precisa de um botão próprio.
	onToggle?: () => void;
};

function RFMSegmentDetailContent({ item, style, formatDecimal, isSelected, onToggle }: RFMSegmentDetailContentProps) {
	return (
		<div className="flex w-full flex-col gap-2">
			<div className="flex items-center gap-2">
				<div className={cn("h-2.5 w-2.5 shrink-0 rounded-full", style.gradient)} />
				<h3 className="text-sm font-bold tracking-tight">{item.rfmLabel}</h3>
			</div>
			<p className="-mt-1 text-[0.7rem] text-muted-foreground">
				Últimos 12 meses · {item.clientsQty} {item.clientsQty === 1 ? "cliente" : "clientes"}
			</p>
			<div className="h-px w-full bg-border" />
			<div className="flex flex-col gap-1.5">
				<div className="flex w-full items-center justify-between gap-3 text-[0.75rem]">
					<p className="text-muted-foreground">Receita total</p>
					<p className="font-semibold">{formatToMoney(item.segmentPeriodStats.totalRevenue)}</p>
				</div>
				<div className="flex w-full items-center justify-between gap-3 text-[0.75rem]">
					<p className="text-muted-foreground">Total de compras</p>
					<p className="font-semibold">{item.segmentPeriodStats.totalPurchasesQty}</p>
				</div>
				<div className="flex w-full items-center justify-between gap-3 text-[0.75rem]">
					<p className="text-muted-foreground">Ticket médio</p>
					<p className="font-semibold">{formatToMoney(item.segmentPeriodStats.avgTicket)}</p>
				</div>
				<div className="flex w-full items-center justify-between gap-3 text-[0.75rem]">
					<p className="text-muted-foreground">Basket médio</p>
					<p className="font-semibold">{formatDecimal(item.segmentPeriodStats.avgBasketSize, 2)} itens</p>
				</div>
				<div className="h-px w-full bg-border" />
				<div className="flex w-full items-center justify-between gap-3 text-[0.75rem]">
					<p className="text-muted-foreground">Ciclo de recompra (mediana)</p>
					<p className="font-semibold">
						{item.segmentPeriodStats.cycleSampleClientsQty > 0 ? `${formatDecimal(item.segmentPeriodStats.medianPurchaseCycleDays)} dias` : "—"}
					</p>
				</div>
				<p className="-mt-1 text-[0.65rem] text-muted-foreground">
					Baseado em {item.segmentPeriodStats.cycleSampleClientsQty} de {item.clientsQty} clientes (2+ compras no período)
				</p>
				<div className="flex w-full items-center justify-between gap-3 text-[0.75rem]">
					<p className="text-muted-foreground">Taxa de recompra</p>
					<p className="font-semibold">{formatDecimal(item.segmentPeriodStats.repeatPurchaseRate * 100)}%</p>
				</div>
				<div className="flex w-full items-center justify-between gap-3 text-[0.75rem]">
					<p className="text-muted-foreground">Recência média</p>
					<p className="font-semibold">{formatDecimal(item.segmentPeriodStats.avgRecencyDays)} dias</p>
				</div>
				<div className="flex w-full items-center justify-between gap-3 text-[0.75rem]">
					<p className="text-muted-foreground">Atraso (vs. ciclo)</p>
					<p className="font-semibold">
						{item.segmentPeriodStats.cycleLagRatio !== null ? `${formatDecimal(item.segmentPeriodStats.cycleLagRatio)}x` : "—"}
					</p>
				</div>
			</div>
			<div className="h-px w-full bg-border" />
			{onToggle ? (
				<Button variant={isSelected ? "secondary" : "default"} size="sm" className="w-full gap-1.5" onClick={onToggle}>
					{isSelected ? <FilterX className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" /> : <Filter className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />}
					{isSelected ? "REMOVER DA LISTAGEM" : "FILTRAR LISTAGEM"}
				</Button>
			) : (
				<p className="text-[0.7rem] text-muted-foreground">
					{isSelected ? "Clique para remover este segmento da listagem." : "Clique para filtrar a listagem por este segmento."}
				</p>
			)}
		</div>
	);
}

type RFMSegmentCellProps = {
	item: TRFMLabelledStats[number];
	index: number;
	formatDecimal: (value: number, fractionDigits?: number) => string;
	prefersHoverInteraction: boolean;
	openSegmentKey: string | null;
	onOpenSegmentKeyChange: (key: string | null) => void;
	isSelected: boolean;
	// Com algum segmento filtrado, os demais esmaecem: a matriz mostra o que está na listagem.
	hasSelection: boolean;
	onToggle: () => void;
};

function RFMSegmentCell({
	item,
	index,
	formatDecimal,
	prefersHoverInteraction,
	openSegmentKey,
	onOpenSegmentKeyChange,
	isSelected,
	hasSelection,
	onToggle,
}: RFMSegmentCellProps) {
	const style = getSegmentStyle(item.rfmLabel);
	const layout = getSegmentLayout(item.rfmLabel);
	const hasClipPath = !!layout.clipPath;
	const isCompactSegment = RFM_COMPACT_SEGMENTS.has(item.rfmLabel);
	const segmentKey = `${item.rfmLabel}-${index}`;
	const detailContent = (
		<RFMSegmentDetailContent
			item={item}
			style={style}
			formatDecimal={formatDecimal}
			isSelected={isSelected}
			onToggle={prefersHoverInteraction ? undefined : onToggle}
		/>
	);
	const detailPanelProps = {
		align: "center" as const,
		sideOffset: 8,
		collisionPadding: 16,
		className: RFM_SEGMENT_DETAIL_PANEL_CLASS,
	};

	const content = (
		<>
			<h2
				className={cn(
					"relative z-10 px-0.5 text-center font-semibold uppercase leading-none tracking-wide",
					isCompactSegment || hasClipPath
						? "hidden text-[0.4rem] sm:block sm:text-[0.5rem] md:text-[0.55rem] lg:text-[0.45rem] xl:text-[0.6rem]"
						: "line-clamp-2 text-[0.38rem] sm:text-[0.5rem] md:text-[0.6rem] lg:text-[0.45rem] xl:text-[0.65rem]",
					style.text,
				)}
			>
				{item.rfmLabel}
			</h2>
			<div
				className={cn(
					"relative z-10 flex shrink-0 items-center justify-center rounded-full",
					style.badge,
					isCompactSegment || hasClipPath
						? "h-5 w-5 min-h-5 min-w-5 sm:h-7 sm:w-7 sm:min-h-7 sm:min-w-7 md:h-8 md:w-8 md:min-h-8 md:min-w-8 lg:h-7 lg:w-7 lg:min-h-7 lg:min-w-7 xl:h-10 xl:w-10 xl:min-h-10 xl:min-w-10"
						: "h-6 w-6 min-h-6 min-w-6 sm:h-8 sm:w-8 sm:min-h-8 sm:min-w-8 md:h-10 md:w-10 md:min-h-10 md:min-w-10 lg:h-8 lg:w-8 lg:min-h-8 lg:min-w-8 xl:h-12 xl:w-12 xl:min-h-12 xl:min-w-12",
				)}
			>
				<span
					className={cn(
						"font-bold tabular-nums",
						isCompactSegment || hasClipPath
							? "text-[0.45rem] sm:text-[0.6rem] lg:text-[0.5rem] xl:text-xs"
							: "text-[0.5rem] sm:text-xs lg:text-[0.5rem] xl:text-sm",
						style.badgeText,
					)}
				>
					{item.clientsQty}
				</span>
			</div>
			<p
				className={cn(
					"relative z-10 hidden text-[0.6rem] font-medium tracking-tight opacity-85 md:block lg:hidden xl:block xl:text-[0.65rem]",
					style.text,
				)}
			>
				{formatToMoney(item.segmentPeriodStats.totalRevenue)}
			</p>
		</>
	);

	const block = (
		<div
			className={cn(
				style.gradient,
				"relative min-h-0 min-w-0 cursor-pointer overflow-hidden rounded-lg shadow-sm",
				"transition-[box-shadow,filter,opacity] duration-200 lg:hover:scale-[1.02] lg:hover:shadow-md lg:hover:brightness-105",
				hasSelection && !isSelected && "opacity-40 lg:hover:opacity-80",
				!hasClipPath && "flex flex-col items-center justify-center gap-0.5 p-0.5 sm:gap-1 sm:p-1 md:p-1.5 lg:gap-2 lg:p-3",
				!prefersHoverInteraction && openSegmentKey === segmentKey && "ring-2 ring-inset ring-primary/70",
				isSelected && "ring-2 ring-inset ring-foreground/80",
			)}
			aria-pressed={isSelected}
			onClick={prefersHoverInteraction ? onToggle : undefined}
			style={{
				gridArea: item.gridArea,
				zIndex: RFM_SEGMENT_Z_INDEX[item.rfmLabel] ?? 10,
				...(layout.clipPath ? { clipPath: layout.clipPath } : {}),
			}}
		>
			<div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-b from-white/10 to-transparent" />
			{hasClipPath && layout.contentWrapper ? (
				<div className={cn(layout.contentWrapper, "flex flex-col items-center justify-center gap-0.5 p-0.5 sm:gap-1 sm:p-1 md:p-1.5 lg:gap-2 lg:p-3")}>
					{content}
				</div>
			) : (
				content
			)}
		</div>
	);

	if (prefersHoverInteraction) {
		return (
			<HoverCard>
				<HoverCardTrigger delay={150} render={block} />
				<HoverCardContent {...detailPanelProps}>{detailContent}</HoverCardContent>
			</HoverCard>
		);
	}

	return (
		<Popover open={openSegmentKey === segmentKey} onOpenChange={(open) => onOpenSegmentKeyChange(open ? segmentKey : null)}>
			<PopoverTrigger render={block} />
			<PopoverContent side="bottom" {...detailPanelProps}>
				{detailContent}
			</PopoverContent>
		</Popover>
	);
}

type SegmentsPageMatrixRFMProps = {
	onOpenConfig: () => void;
	selectedSegments: string[];
	onToggleSegment: (rfmLabel: string) => void;
};
function SegmentsPageMatrixRFM({ onOpenConfig, selectedSegments, onToggleSegment }: SegmentsPageMatrixRFMProps) {
	const queryClient = useQueryClient();

	const [syncMenuIsOpen, setSyncMenuIsOpen] = useState(false);
	const [openSegmentKey, setOpenSegmentKey] = useState<string | null>(null);
	const prefersHoverInteraction = useMediaQuery("(hover: hover) and (pointer: fine)");
	const { data: rfmStats, queryKey } = useRFMLabelledStats();

	function formatDecimal(value: number, fractionDigits = 1) {
		if (!Number.isFinite(value)) return "0";

		return new Intl.NumberFormat("pt-BR", {
			minimumFractionDigits: fractionDigits,
			maximumFractionDigits: fractionDigits,
		}).format(value);
	}

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey: queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey: queryKey });

	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-2 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-between gap-2 flex-col lg:flex-row">
				<div className="flex items-center gap-2">
					<Grid3x3 className="w-4 h-4 min-w-4 min-h-4" />
					<h1 className="text-xs font-medium tracking-tight uppercase">MATRIZ RFM</h1>
				</div>
				<div className="flex items-center gap-2 flex-wrap justify-center lg:justify-end">
					<Button variant="ghost" size="sm" className="flex items-center gap-2 text-[0.6rem] lg:text-sm" onClick={onOpenConfig}>
						<Settings2 className="w-3 h-3 min-w-3 min-h-3 lg:w-4 lg:h-4 lg:min-w-4 lg:min-h-4" />
						CONFIGURAR
					</Button>
					<Button variant="ghost" size="sm" className="flex items-center gap-2 text-[0.6rem] lg:text-sm" onClick={() => setSyncMenuIsOpen(true)}>
						<RefreshCcw className="w-3 h-3 min-w-3 min-h-3 lg:w-4 lg:h-4 lg:min-w-4 lg:min-h-4" />
						SINCRONIZAR
					</Button>
				</div>
			</div>
			<div className="flex w-full max-w-full items-center justify-center gap-1 self-center rounded-lg bg-primary/10 px-2 py-1 text-center text-[0.65rem] font-medium tracking-tight text-foreground/80">
				<Info className="h-3 w-3 min-h-3 min-w-3 shrink-0" />
				<span>
					Análise RFM dos últimos 12 meses.{" "}
					{prefersHoverInteraction
						? "Passe o mouse no bloco para detalhes e clique para filtrar a listagem."
						: "Toque no bloco para ver detalhes e filtrar a listagem."}
				</span>
			</div>
			<AspectRatio ratio={1}>
				<div className="isolate grid h-full w-full grid-cols-5 grid-rows-5 gap-px sm:gap-0.5">
					{rfmStats?.map((item, index) => (
						<RFMSegmentCell
							key={`${item.rfmLabel}-${index}`}
							item={item}
							index={index}
							formatDecimal={formatDecimal}
							prefersHoverInteraction={prefersHoverInteraction}
							openSegmentKey={openSegmentKey}
							onOpenSegmentKeyChange={setOpenSegmentKey}
							isSelected={selectedSegments.includes(item.rfmLabel)}
							hasSelection={selectedSegments.length > 0}
							onToggle={() => onToggleSegment(item.rfmLabel)}
						/>
					))}
				</div>
			</AspectRatio>
			{syncMenuIsOpen ? (
				<SegmentsPageMatrixRFMSyncMenu
					closeMenu={() => setSyncMenuIsOpen(false)}
					callbacks={{
						onMutate: handleOnMutate,
						onSettled: handleOnSettled,
					}}
				/>
			) : null}
		</div>
	);
}

type SegmentsPageMatrixRFMSyncMenuProps = {
	closeMenu: () => void;
	callbacks?: {
		onMutate?: (variables: TSyncSegmentationsInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};
function SegmentsPageMatrixRFMSyncMenu({ closeMenu, callbacks }: SegmentsPageMatrixRFMSyncMenuProps) {
	const [params, setParams] = useState<TSyncSegmentationsInput>({
		runCampaigns: false,
	});

	const { mutate: handleSyncSegmentations, isPending } = useMutation({
		mutationKey: ["sync-segmentations"],
		mutationFn: syncSegmentations,
		onMutate: (variables) => {
			callbacks?.onMutate?.(variables);
		},
		onSuccess: (data) => {
			toast.success(data.message);
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			callbacks?.onSettled?.();
		},
	});
	return (
		<ResponsiveMenu.Root
			open
			onOpenChange={(open) => {
				if (!open) closeMenu();
			}}
		>
			<ResponsiveMenu.Content drawerClassName="max-h-[70dvh]">
				<ResponsiveMenu.Header>
					<ResponsiveMenu.Title>SINCRONIZAR SEGMENTAÇÕES</ResponsiveMenu.Title>
					<ResponsiveMenu.Description>Sincronize as segmentações RFM para atualizar os dados da matriz.</ResponsiveMenu.Description>
				</ResponsiveMenu.Header>
				<ResponsiveMenuAnimatedBody stateKey="content" className="overflow-x-hidden overflow-y-auto">
					<p className="text-sm text-muted-foreground">Esta ação irá recomputar as segmentações RFM de toda a sua base de clientes.</p>
					<CheckboxInput
						checked={params.runCampaigns}
						labelTrue="DESEJO EXECUTAR AS CAMPANHAS"
						labelFalse="DESEJO EXECUTAR AS CAMPANHAS"
						handleChange={(value) => setParams({ ...params, runCampaigns: value })}
					/>
				</ResponsiveMenuAnimatedBody>
				<ResponsiveMenu.Footer>
					<ResponsiveMenu.Close variant="outline">CANCELAR</ResponsiveMenu.Close>
					<LoadingButton loading={isPending} onClick={() => handleSyncSegmentations({ runCampaigns: false })}>
						SINCRONIZAR
					</LoadingButton>
				</ResponsiveMenu.Footer>
			</ResponsiveMenu.Content>
		</ResponsiveMenu.Root>
	);
}
