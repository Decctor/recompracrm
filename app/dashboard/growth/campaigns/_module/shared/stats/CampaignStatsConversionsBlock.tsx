"use client";

import type { TGetCampaignConversionsInput } from "@/app/api/campaigns/conversions/route";
import { CampaignConversionCard, CONVERSION_TYPE_CONFIG } from "@/components/Campaigns/Conversions/CampaignConversionCard";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { getErrorMessage } from "@/lib/errors";
import { formatDecimalPlaces } from "@/lib/formatting";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useCampaignsConversions } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import { Search, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";

type CampaignStatsConversionsBlockProps = {
	startDate: Date | null;
	endDate: Date | null;
};

export function CampaignStatsConversionsBlock({ startDate, endDate }: CampaignStatsConversionsBlockProps) {
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
			campaignId: undefined,
			page: 1,
			pageSize: DEFAULT_PAGE_SIZE,
			search: "",
			types: [],
			periodAfter: startDate ?? undefined,
			periodBefore: endDate ?? undefined,
		},
	});

	const periodStartIso = startDate?.toISOString() ?? "";
	const periodEndIso = endDate?.toISOString() ?? "";

	useEffect(() => {
		updateFilters({
			periodAfter: startDate ?? undefined,
			periodBefore: endDate ?? undefined,
			page: 1,
		});
	}, [periodStartIso, periodEndIso]);

	const items = conversionsData?.items ?? [];
	const conversionsMatched = conversionsData?.conversionsMatched ?? 0;
	const totalPages = conversionsData?.totalPages ?? 0;

	const toggleType = (key: string) => {
		const next = selectedTypes.includes(key) ? selectedTypes.filter((k) => k !== key) : [...selectedTypes, key];
		setSelectedTypes(next);
		updateFilters({ types: next as TGetCampaignConversionsInput["types"], page: 1 });
	};

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<ShoppingCart />
				</Section.Icon>
				<Section.Title>Últimas conversões no período</Section.Title>
				<Section.Count>{formatDecimalPlaces(conversionsMatched)}</Section.Count>
				<p className="w-full text-[0.7rem] leading-snug text-muted-foreground">
					Cada card mostra o que mudou para o cliente: se voltou antes do esperado, reativou após ficar ausente ou gastou mais (ou menos) que o habitual.
				</p>
			</Section.Header>
			<Section.Body>
				<div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
					<div className="relative grow">
						<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={filters.search ?? ""}
							placeholder="Pesquisar por cliente..."
							onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
							className="rounded-xl pl-9"
						/>
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
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
				</div>

				{isLoading ? <LoadingComponent /> : null}
				{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
				{isSuccess ? (
					items.length > 0 ? (
						<div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
							{items.map((conversion) => (
								<CampaignConversionCard.Provider key={conversion.id} conversion={conversion}>
									<CampaignConversionCard.Frame>
										<CampaignConversionCard.CampaignLink />
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
							))}
						</div>
					) : (
						<p className="flex w-full items-center justify-center py-6 text-sm text-muted-foreground">
							Nenhuma conversão neste período. Ajuste as datas ou os filtros de tipo acima.
						</p>
					)
				) : null}

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
