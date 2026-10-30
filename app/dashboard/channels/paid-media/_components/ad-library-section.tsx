"use client";

import type { TMetaAdsLibraryItem } from "@/app/api/integrations/meta/ads/library/route";
import { HubTable } from "@/app/dashboard/_hub/hub-table";
import { Panel } from "@/app/dashboard/_hub/panel";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import SegmentedControl from "@/components/Utils/SegmentedControl";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale } from "@/lib/formatting";
import { useDebouncedText } from "@/lib/hooks/use-debounced-text";
import { syncMetaAdsCatalog } from "@/lib/mutations/meta-ads";
import { META_RESULT_LABELS, costPer, formatAdsCurrency, formatAdsNumber, formatAdsPercent } from "@/lib/paid-media/format";
import { type TMetaAdsLibraryParams, type TMetaAdsLibrarySort, useMetaAdsLibrary } from "@/lib/queries/meta-ads";
import type { TMediaAdMediaTypeEnum } from "@/schemas/enums";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GalleryHorizontalEnd, Images, LayoutGrid, Play, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type TPaidMediaSheetEntry, usePaidMedia } from "./paid-media-context";
import { AdsStatusChip } from "./paid-media-ui";

const STATUS_OPTIONS: { value: TMetaAdsLibraryParams["status"]; label: string }[] = [
	{ value: "all", label: "Todos os status" },
	{ value: "active", label: "Ativos" },
	{ value: "paused", label: "Pausados" },
	{ value: "review", label: "Em análise" },
	{ value: "issues", label: "Com problemas" },
	{ value: "archived", label: "Arquivados" },
];

const MEDIA_OPTIONS: { value: TMediaAdMediaTypeEnum | "all"; label: string }[] = [
	{ value: "all", label: "Todos os formatos" },
	{ value: "IMAGEM", label: "Imagem" },
	{ value: "VIDEO", label: "Vídeo" },
	{ value: "CARROSSEL", label: "Carrossel" },
];

const PAGE_SIZE = 24;

type TFilterSelectProps<T extends string> = {
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
	ariaLabel: string;
	className?: string;
};

function FilterSelect<T extends string>({ value, options, onChange, ariaLabel, className }: TFilterSelectProps<T>) {
	return (
		<Select
			items={options}
			value={value}
			onValueChange={(next) => {
				if (next !== null) onChange(next as T);
			}}
		>
			<SelectTrigger size="sm" aria-label={ariaLabel} className={cn("w-full sm:w-auto", className)}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

function toEntry(ad: TMetaAdsLibraryItem): TPaidMediaSheetEntry {
	return { type: "ad", id: ad.anuncioId, name: ad.anuncioNome };
}

/**
 * Biblioteca de anúncios: a lista vem do catálogo (`media_ads`), então filtros, busca e paginação
 * acontecem no banco e anúncios sem entrega no período também aparecem; as métricas do período são
 * cruzadas no servidor.
 */
export function AdLibrarySection({ integrationId, canManage }: { integrationId: string; canManage: boolean }) {
	const { scope, currency, resultKey, sheet } = usePaidMedia();
	const queryClient = useQueryClient();
	const [view, setView] = useState<"cards" | "table">("cards");
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebouncedText(search);
	const [filters, setFilters] = useState<Omit<TMetaAdsLibraryParams, "search" | "resultKey" | "pageSize">>({
		status: "all",
		campaignId: null,
		mediaType: null,
		sort: "spend",
		page: 1,
	});
	const params: TMetaAdsLibraryParams = { ...filters, search: debouncedSearch, resultKey, pageSize: PAGE_SIZE };
	const library = useMetaAdsLibrary({ scope, params });
	const resultLabel = META_RESULT_LABELS[resultKey];

	const updateFilters = (changes: Partial<typeof filters>) => setFilters((previous) => ({ ...previous, page: 1, ...changes }));

	const { mutate: runSync, isPending: isSyncing } = useMutation({
		mutationKey: ["sync-meta-ads-catalog", integrationId],
		mutationFn: syncMetaAdsCatalog,
		onSuccess: async (data) => {
			toast.success(data.message);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["meta-ads-library"] }),
				queryClient.invalidateQueries({ queryKey: ["meta-ads-hierarchy"] }),
				queryClient.invalidateQueries({ queryKey: ["integrations"] }),
			]);
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const sortOptions: { value: TMetaAdsLibrarySort; label: string }[] = [
		{ value: "spend", label: "Maior investimento" },
		{ value: "results", label: `Mais ${resultLabel.plural.toLowerCase()}` },
		{ value: "costPerResult", label: `Menor ${resultLabel.costLabel.toLowerCase()}` },
		{ value: "ctr", label: "Maior CTR" },
		{ value: "roas", label: "Maior ROAS" },
		{ value: "recent", label: "Mais recentes" },
		{ value: "name", label: "Nome" },
	];
	const campaignOptions = [
		{ value: "all", label: "Todas as campanhas" },
		...(library.data?.campaigns ?? []).map((campaign) => ({ value: campaign.campanhaId, label: campaign.campanhaNome ?? "Campanha sem nome" })),
	];

	const ads = library.data?.ads ?? [];
	const siblings = ads.map(toEntry);
	const catalog = library.data?.catalog;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Images />
				</Section.Icon>
				<Section.Title>Biblioteca de anúncios</Section.Title>
				{library.data ? <Section.Count>{library.data.pagination.total}</Section.Count> : null}
				<Section.Actions>
					{catalog?.lastAttemptAt ? (
						<span className="text-micro hidden text-muted-foreground sm:inline">Catálogo lido em {formatDateAsLocale(catalog.lastAttemptAt, true)}</span>
					) : null}
					{canManage ? (
						<Button type="button" variant="outline" size="xs" disabled={isSyncing} onClick={() => runSync({ integrationId })}>
							<RefreshCw className={cn(isSyncing && "animate-spin")} />
							{isSyncing ? "SINCRONIZANDO" : "SINCRONIZAR"}
						</Button>
					) : null}
					<SegmentedControl
						aria-label="Visualização"
						value={view}
						onChange={setView}
						options={[
							{ value: "cards", label: "Cards" },
							{ value: "table", label: "Tabela" },
						]}
					/>
				</Section.Actions>
			</Section.Header>

			<Section.Body className="gap-4">
				<div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
					<div className="relative w-full lg:w-64">
						<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Buscar anúncio, campanha ou título"
							className="h-8 pl-9"
						/>
					</div>
					<FilterSelect ariaLabel="Status" value={filters.status} options={STATUS_OPTIONS} onChange={(status) => updateFilters({ status })} />
					<FilterSelect
						ariaLabel="Campanha"
						value={filters.campaignId ?? "all"}
						options={campaignOptions}
						onChange={(value) => updateFilters({ campaignId: value === "all" ? null : value })}
						className="lg:max-w-64"
					/>
					<FilterSelect
						ariaLabel="Formato"
						value={filters.mediaType ?? "all"}
						options={MEDIA_OPTIONS}
						onChange={(value) => updateFilters({ mediaType: value === "all" ? null : value })}
					/>
					<FilterSelect
						ariaLabel="Ordenação"
						value={filters.sort}
						options={sortOptions}
						onChange={(sort) => updateFilters({ sort })}
						className="lg:ml-auto"
					/>
				</div>

				{catalog?.pending ? (
					<Callout.Root tone="info">
						<Callout.Title>Lendo os anúncios da conta</Callout.Title>
						<Callout.Description>
							A primeira sincronização do catálogo ainda não terminou. Em alguns minutos os anúncios aparecem aqui
							{canManage ? ", ou sincronize agora." : "."}
						</Callout.Description>
					</Callout.Root>
				) : null}
				{catalog?.truncated ? (
					<Callout.Root tone="warning">
						<Callout.Title>Catálogo parcial</Callout.Title>
						<Callout.Description>A conta tem mais de 10 mil anúncios; só os primeiros foram lidos.</Callout.Description>
					</Callout.Root>
				) : null}

				{library.isLoading ? (
					<Panel.Loading rows={6} />
				) : library.isError ? (
					<Panel.Error error={library.error} />
				) : ads.length === 0 ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						{catalog?.pending ? "Nenhum anúncio lido ainda." : "Nenhum anúncio encontrado com esses filtros."}
					</p>
				) : view === "cards" ? (
					<div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4", library.isPlaceholderData && "opacity-60")}>
						{ads.map((ad) => (
							<AdCard key={ad.id} ad={ad} currency={currency} resultKey={resultKey} onOpen={() => sheet.open(toEntry(ad), { siblings })} />
						))}
					</div>
				) : (
					<div className={cn("text-numeric -mx-3", library.isPlaceholderData && "opacity-60")}>
						<HubTable
							columns={[
								{ id: "ad", header: "Anúncio", track: "minmax(0,2.4fr)" },
								{ id: "status", header: "Status", track: "minmax(0,1fr)" },
								{ id: "spend", header: "Investimento", track: "minmax(0,1fr)", align: "right" },
								{ id: "results", header: resultLabel.plural, track: "minmax(0,0.8fr)", align: "right" },
								{ id: "cost", header: "Custo/result.", track: "minmax(0,1fr)", align: "right" },
								{ id: "ctr", header: "CTR", track: "minmax(0,0.7fr)", align: "right" },
							]}
							rows={ads.map((ad) => ({
								id: ad.id,
								onSelect: () => sheet.open(toEntry(ad), { siblings }),
								cells: {
									ad: (
										<span className="flex min-w-0 items-center gap-2.5">
											<AdThumb ad={ad} className="size-9" />
											<span className="flex min-w-0 flex-col">
												<span className="truncate">{ad.anuncioNome}</span>
												<span className="text-micro truncate font-normal text-muted-foreground">{ad.campanhaNome ?? "—"}</span>
											</span>
										</span>
									),
									status: <AdsStatusChip status={ad.status} />,
									spend: formatAdsCurrency(ad.metrics?.spend, currency),
									results: formatAdsNumber(ad.metrics?.[resultKey]),
									cost: formatAdsCurrency(ad.metrics ? costPer(ad.metrics.spend, ad.metrics[resultKey]) : null, currency),
									ctr: formatAdsPercent(ad.metrics?.ctr),
								},
							}))}
						/>
					</div>
				)}

				{library.data && library.data.pagination.totalPages > 1 ? (
					<GeneralPaginationComponent
						activePage={filters.page}
						totalPages={library.data.pagination.totalPages}
						selectPage={(page) => setFilters((previous) => ({ ...previous, page }))}
						queryLoading={library.isFetching}
						itemsMatchedText={`${library.data.pagination.total} anúncios encontrados`}
						itemsShowingText={`Mostrando ${ads.length} anúncios`}
						showSteppersText={false}
						pageIconSize="sm"
					/>
				) : null}
			</Section.Body>
		</Section.Root>
	);
}

export function AdThumb({ ad, className }: { ad: Pick<TMetaAdsLibraryItem, "capaUrl" | "anuncioNome" | "tipoMidia">; className?: string }) {
	const MediaIcon = ad.tipoMidia === "VIDEO" ? Play : ad.tipoMidia === "CARROSSEL" ? GalleryHorizontalEnd : LayoutGrid;
	return (
		<span
			className={cn(
				"relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground ring-1 ring-border",
				className,
			)}
		>
			{ad.capaUrl ? (
				// Capas vêm do storage da organização ou, até a cópia, da CDN da Meta — hosts fora do `remotePatterns`.
				// eslint-disable-next-line @next/next/no-img-element
				<img src={ad.capaUrl} alt="" loading="lazy" className="size-full object-cover" />
			) : (
				<MediaIcon className="size-4" />
			)}
		</span>
	);
}

function AdCard({
	ad,
	currency,
	resultKey,
	onOpen,
}: {
	ad: TMetaAdsLibraryItem;
	currency: string;
	resultKey: keyof typeof META_RESULT_LABELS;
	onOpen: () => void;
}) {
	const metrics = ad.metrics;
	const resultLabel = META_RESULT_LABELS[resultKey];
	const MediaIcon = ad.tipoMidia === "VIDEO" ? Play : ad.tipoMidia === "CARROSSEL" ? GalleryHorizontalEnd : null;
	return (
		<button
			type="button"
			onClick={onOpen}
			className="group flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-2xs transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
				{ad.capaUrl ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={ad.capaUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
				) : (
					<div className="flex size-full items-center justify-center text-muted-foreground">
						<Images className="size-6" />
					</div>
				)}
				<div className="absolute top-2 left-2 flex items-center gap-1">
					<AdsStatusChip status={ad.status} />
				</div>
				{MediaIcon ? (
					<span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-foreground/70 text-background">
						<MediaIcon className="size-3.5" />
					</span>
				) : null}
			</div>
			<div className="flex flex-1 flex-col gap-3 p-3">
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="line-clamp-2 text-sm font-bold leading-snug">{ad.anuncioNome}</span>
					<span className="text-micro truncate text-muted-foreground">{[ad.campanhaNome, ad.conjuntoNome].filter(Boolean).join(" · ") || "—"}</span>
				</div>
				<div className="text-numeric mt-auto grid grid-cols-3 gap-2 border-border border-t pt-2.5">
					<CardMetric label="Investido" value={formatAdsCurrency(metrics?.spend, currency)} />
					<CardMetric label={resultLabel.plural} value={formatAdsNumber(metrics?.[resultKey])} />
					<CardMetric label="Custo" value={formatAdsCurrency(metrics ? costPer(metrics.spend, metrics[resultKey]) : null, currency)} />
				</div>
			</div>
		</button>
	);
}

function CardMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<span className="text-micro truncate text-muted-foreground">{label}</span>
			<span className="truncate text-sm font-bold">{value}</span>
		</div>
	);
}
