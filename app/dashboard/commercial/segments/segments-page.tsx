"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import RFMAnalysisQueryParamsMenu from "@/components/RFMAnalysis/RFMAnalysisQueryParamsMenu";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { getExcelFromJSON } from "@/lib/excel-utils";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { useClients, useClientsBySearch } from "@/lib/queries/clients";
import { fetchClientExportation } from "@/lib/queries/exportations";
import { useRFMLabelledStats } from "@/lib/queries/stats/rfm-labelled";
import { cn } from "@/lib/utils";
import type { TGetClientsInput, TGetClientsOutputDefault } from "@/pages/api/clients";
import { RFMLabels } from "@/utils/rfm";
import { AspectRatio } from "@radix-ui/react-aspect-ratio";
import dayjs from "dayjs";
import { BadgeDollarSign, Download, Filter, Grid3x3, Info, Mail, Megaphone, Phone, ShoppingCart, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { BsCalendar } from "react-icons/bs";
import { toast } from "sonner";

const initialPeriodStart = dayjs().startOf("month").toISOString();
const initialPeriodEnd = dayjs().endOf("day").toISOString();
type SegmentsPageProps = {
	user: TAuthUserSession["user"];
};
export default function SegmentsPage({ user }: SegmentsPageProps) {
	return (
		<div className="w-full h-full flex flex-col gap-3">
			<div className="w-full flex items-stretch gap-3 flex-col md:flex-row">
				<div className="w-full md:w-1/2">
					<SegmentsPageMatrixRFM />
				</div>
				<div className="w-full md:w-1/2">
					<SegmentsPageClients />
				</div>
			</div>
		</div>
	);
}

/**
 *
 * CLIENTS RELATED COMPONENTS
 */
function SegmentsPageClients() {
	const [filterMenuIsOpen, setFilterMenuIsOpen] = useState(false);
	const {
		data: clientsResult,
		isSuccess,
		isLoading,
		isError,
		error,
		filters,
		updateFilters,
	} = useClients({
		initialFilters: {
			statsPeriodAfter: dayjs().startOf("month").toDate(),
			statsPeriodBefore: dayjs().endOf("month").toDate(),
		},
	});
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
					saleNatures: filters.statsSaleNatures,
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
		<div className={cn("bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs h-full")}>
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
					<Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={() => setFilterMenuIsOpen(true)}>
						<Filter className="w-4 h-4 min-w-4 min-h-4" />
						FILTROS
					</Button>
				</div>
			</div>

			<SegmentsPageClientsFiltersShowcase filters={filters} updateFilters={updateFilters} />
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
						clients.map((client, index: number) => (
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
			{filterMenuIsOpen ? (
				<RFMAnalysisQueryParamsMenu filters={filters} updateFilters={updateFilters} closeMenu={() => setFilterMenuIsOpen(false)} />
			) : null}
		</div>
	);
}
type SegmentsPageClientsFiltersShowcaseProps = {
	filters: TGetClientsInput;
	updateFilters: (params: Partial<TGetClientsInput>) => void;
};
function SegmentsPageClientsFiltersShowcase({ filters, updateFilters }: SegmentsPageClientsFiltersShowcaseProps) {
	function FilterTag({ label, value, onRemove }: { label: string; value: string; onRemove?: () => void }) {
		return (
			<div className="flex items-center gap-1 bg-secondary text-[0.65rem] rounded-lg px-2 py-1">
				<p className="text-primary/80">
					{label}: <strong>{value}</strong>
				</p>
				{onRemove && (
					<button type="button" onClick={onRemove} className="bg-transparent text-primary hover:bg-primary/20 rounded-lg p-1">
						<X size={12} />
					</button>
				)}
			</div>
		);
	}
	return (
		<div className="flex items-center justify-center lg:justify-end flex-wrap gap-2">
			{filters.search && filters.search.trim().length > 0 ? (
				<FilterTag label="NOME" value={filters.search} onRemove={() => updateFilters({ search: "" })} />
			) : null}
			{filters.acquisitionChannels.length > 0 ? (
				<FilterTag
					label="CANAL DE AQUISIÇÃO"
					value={filters.acquisitionChannels.map((channel) => channel).join(", ")}
					onRemove={() => updateFilters({ acquisitionChannels: [] })}
				/>
			) : null}
			{filters.segmentationTitles.length > 0 ? (
				<FilterTag
					label="SEGMENTAÇÃO"
					value={filters.segmentationTitles.map((title) => title).join(", ")}
					onRemove={() => updateFilters({ segmentationTitles: [] })}
				/>
			) : null}
			{filters.statsSaleNatures.length > 0 ? (
				<FilterTag
					label="NATUREZA DA VENDA"
					value={filters.statsSaleNatures.map((nature) => nature).join(", ")}
					onRemove={() => updateFilters({ statsSaleNatures: [] })}
				/>
			) : null}
			{filters.statsPeriodAfter && filters.statsPeriodBefore ? (
				<FilterTag
					label="PERÍODO"
					value={`${formatDateAsLocale(filters.statsPeriodAfter)} a ${formatDateAsLocale(filters.statsPeriodBefore)}`}
					onRemove={() => updateFilters({ statsPeriodAfter: null, statsPeriodBefore: null })}
				/>
			) : null}
			{filters.statsExcludedSalesIds.length > 0 ? (
				<FilterTag
					label="VENDAS EXCLUÍDAS"
					value={filters.statsExcludedSalesIds.map((id) => id).join(", ")}
					onRemove={() => updateFilters({ statsExcludedSalesIds: [] })}
				/>
			) : null}
			{filters.orderByField && filters.orderByDirection ? (
				<FilterTag
					label="ORDENAÇÃO"
					value={`${filters.orderByField} (${filters.orderByDirection})`}
					onRemove={() => updateFilters({ orderByField: "nome", orderByDirection: "asc" })}
				/>
			) : null}
		</div>
	);
}
type SegmentsPageClientCardProps = {
	client: TGetClientsOutputDefault["clients"][number];
	period: { after: Date; before: Date };
};
function SegmentsPageClientCard({ client, period }: SegmentsPageClientCardProps) {
	function getRFMColor(rfmLabel: string) {
		const rfm = RFMLabels.find((x) => x.text === rfmLabel);
		return rfm?.backgroundCollor || "bg-gray-400";
	}

	return (
		<div className={cn("bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="w-full flex items-center justify-between gap-2 flex-col lg:flex-row">
				<div className="flex items-center gap-2 flex-wrap">
					<h1 className="text-xs font-bold tracking-tight lg:text-sm">{client.nome}</h1>
					<div className="flex items-center gap-1">
						<Phone className="w-4 h-4 min-w-4 min-h-4" />
						<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic text-primary/80">{client.telefone}</h1>
					</div>
					{client.email ? (
						<div className="flex items-center gap-1">
							<Mail className="w-4 h-4 min-w-4 min-h-4" />
							<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic text-primary/80">{client.email}</h1>
						</div>
					) : null}
					{client.canalAquisicao ? (
						<div className="flex items-center gap-1">
							<Megaphone width={15} height={15} />
							<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic text-primary/80">{client.canalAquisicao || "N/A"}</h1>
						</div>
					) : null}
				</div>
				<div className="flex items-center gap-2 flex-wrap">
					<h1 className={cn("px-2 py-0.5 rounded-lg text-white text-[0.6rem]", getRFMColor(client.analiseRFMTitulo || ""))}>{client.analiseRFMTitulo}</h1>
				</div>
			</div>
			<div className="flex w-full flex-col items-center justify-between gap-2 lg:flex-row">
				<div className="flex w-full flex-wrap items-center justify-center gap-2 lg:grow lg:justify-start">
					<div className="flex items-center gap-1">
						<BsCalendar className="w-4 h-4 min-w-4 min-h-4" />
						<h1 className="py-0.5 text-center text-[0.6rem] font-medium italic text-primary/80">ÚLTIMA COMPRA</h1>
						<h1 className="py-0.5 text-center text-[0.65rem] font-bold  text-primary">{formatDateAsLocale(client.ultimaCompraData) || "N/A"}</h1>
					</div>
					<div className="flex items-center gap-1">
						<BsCalendar className="w-4 h-4 min-w-4 min-h-4" />
						<h1 className="py-0.5 text-center text-[0.6rem] font-medium italic text-primary/80">PRIMEIRA COMPRA</h1>
						<h1 className="py-0.5 text-center text-[0.65rem] font-bold  text-primary">{formatDateAsLocale(client.primeiraCompraData) || "N/A"}</h1>
					</div>
				</div>
				<div className="flex w-full flex-wrap items-center justify-center gap-2 lg:min-w-fit lg:justify-end">
					<div className="flex items-center gap-1">
						<ShoppingCart width={14} height={14} />
						<h1 className="py-0.5 text-center text-[0.6rem] font-medium italic text-primary/80">Nº DE COMPRAS NO PERÍODO</h1>
						<h1 className="py-0.5 text-center text-[0.65rem] font-bold  text-primary">{client.estatisticas.comprasQtdeTotal}</h1>
					</div>
					<div className="flex items-center gap-1">
						<BadgeDollarSign width={14} height={14} />
						<h1 className="py-0.5 text-center text-[0.6rem] font-medium italic text-primary/80">TOTAL COMPRO NO PERÍODO</h1>
						<h1 className="py-0.5 text-center text-[0.65rem] font-bold  text-primary">{formatToMoney(client.estatisticas.comprasValorTotal)}</h1>
					</div>
				</div>
			</div>
		</div>
	);
}

/**
 * RFM MATRIX RELATED COMPONENTS
 */

function SegmentsPageMatrixRFM() {
	const { data: rfmStats } = useRFMLabelledStats();

	function formatDecimal(value: number, fractionDigits = 1) {
		if (!Number.isFinite(value)) return "0";

		return new Intl.NumberFormat("pt-BR", {
			minimumFractionDigits: fractionDigits,
			maximumFractionDigits: fractionDigits,
		}).format(value);
	}

	return (
		<div className={cn("bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-between gap-2 flex-col lg:flex-row">
				<div className="flex items-center gap-2">
					<Grid3x3 className="w-4 h-4 min-w-4 min-h-4" />
					<h1 className="text-xs font-medium tracking-tight uppercase">MATRIZ RFM</h1>
				</div>
				<div className="px-2 py-1 flex items-center gap-1 rounded-lg bg-primary/10 text-primary/80 text-[0.65rem] font-medium tracking-tight text-center">
					<Info className="w-4 h-4 min-w-4 min-h-4" />
					Os números representam uma análise de matriz RFM nos últimos 12 meses. Passe o mouse no bloco para ver os detalhes.
				</div>
			</div>
			<AspectRatio ratio={10 / 10}>
				<div className="grid grid-cols-5 grid-rows-5 w-full h-full p-1 lg:p-4">
					{rfmStats?.map((item, index) => {
						const isLostExtension = item.rfmLabel === "PERDIDOS (extensão)";

						const block = (
							<div
								className={cn(
									`${item.backgroundCollor} flex flex-col gap-2 items-center justify-center p-2 text-primary-foreground font-bold text-center`,
									!isLostExtension ? "cursor-pointer" : undefined,
								)}
								style={{ gridArea: item.gridArea }}
							>
								{!isLostExtension ? <h1 className="text-[0.4rem] lg:text-base">{item.rfmLabel}</h1> : null}
								{!isLostExtension ? (
									<div className="bg-primary h-5 w-5 min-h-5 min-w-5 lg:h-16 lg:w-16 lg:min-h-16 lg:min-w-16 p-2 rounded-full flex items-center justify-center">
										<h1 className="text-[0.4rem] lg:text-sm font-bold text-primary-foreground">{item.clientsQty}</h1>
									</div>
								) : null}
								{!isLostExtension ? (
									<p className="hidden lg:block text-[0.6rem] tracking-tight">Receita: {formatToMoney(item.segmentPeriodStats.totalRevenue)}</p>
								) : null}
							</div>
						);

						if (isLostExtension) {
							return (
								<div
									key={`${item.rfmLabel}-${index}`}
									className={`${item.backgroundCollor} flex flex-col gap-2 items-center justify-center p-2 text-primary-foreground font-bold text-center`}
									style={{ gridArea: item.gridArea }}
								/>
							);
						}

						return (
							<HoverCard key={`${item.rfmLabel}-${index}`} openDelay={150}>
								<HoverCardTrigger asChild>{block}</HoverCardTrigger>
								<HoverCardContent className="w-[290px]">
									<div className="w-full flex flex-col gap-1">
										<h1 className="text-xs font-bold">{item.rfmLabel}</h1>
										<p className="text-[0.7rem] text-muted-foreground">Período: últimos 12 meses</p>
										<div className="w-full flex items-center justify-between gap-3 text-[0.75rem]">
											<p>Receita total</p>
											<p className="font-semibold">{formatToMoney(item.segmentPeriodStats.totalRevenue)}</p>
										</div>
										<div className="w-full flex items-center justify-between gap-3 text-[0.75rem]">
											<p>Total de compras</p>
											<p className="font-semibold">{item.segmentPeriodStats.totalPurchasesQty}</p>
										</div>
										<div className="w-full flex items-center justify-between gap-3 text-[0.75rem]">
											<p>Ticket médio</p>
											<p className="font-semibold">{formatToMoney(item.segmentPeriodStats.avgTicket)}</p>
										</div>
										<div className="w-full flex items-center justify-between gap-3 text-[0.75rem]">
											<p>Ciclo médio de compra</p>
											<p className="font-semibold">{formatDecimal(item.segmentPeriodStats.avgPurchaseCycleDays)} dias</p>
										</div>
										<div className="w-full flex items-center justify-between gap-3 text-[0.75rem]">
											<p>Basket médio</p>
											<p className="font-semibold">{formatDecimal(item.segmentPeriodStats.avgBasketSize, 2)} itens</p>
										</div>
									</div>
								</HoverCardContent>
							</HoverCard>
						);
					})}
				</div>
			</AspectRatio>
		</div>
	);
}
