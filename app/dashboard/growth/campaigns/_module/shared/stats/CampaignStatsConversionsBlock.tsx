"use client";

import type { TGetCampaignConversionsInput } from "@/app/api/campaigns/conversions/route";
import { CampaignConversionCard, CONVERSION_TYPE_CONFIG } from "@/components/Campaigns/Conversions/CampaignConversionCard";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useCampaignsConversions } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import { ShoppingCart } from "lucide-react";
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

	const conversionTypeOptions = Object.entries(CONVERSION_TYPE_CONFIG).map(([key, val]) => ({
		key,
		label: val.label,
		bgClass: val.bgClass,
	}));

	const toggleType = (key: string) => {
		const next = selectedTypes.includes(key) ? selectedTypes.filter((k) => k !== key) : [...selectedTypes, key];
		setSelectedTypes(next);
		updateFilters({ types: next as TGetCampaignConversionsInput["types"], page: 1 });
	};

	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-between gap-2 flex-wrap">
				<div className="flex flex-col gap-0.5 min-w-0">
					<h2 className="text-xs font-bold tracking-tight uppercase">Últimas conversões no período</h2>
					<p className="text-[0.7rem] text-muted-foreground leading-snug max-w-xl">
						Cada card mostra o que mudou para o cliente: se voltou antes do esperado, reativou após ficar ausente ou gastou mais (ou menos) que o habitual.
					</p>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<ShoppingCart className="w-4 h-4 min-w-4 min-h-4 text-muted-foreground" />
				</div>
			</div>

			<div className="w-full flex flex-col gap-1.5">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar por cliente..."
					onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
					className="grow rounded-xl"
				/>
				<div className="w-full flex items-center gap-1.5 flex-wrap">
					{conversionTypeOptions.map((opt) => (
						<button
							key={opt.key}
							type="button"
							onClick={() => toggleType(opt.key)}
							className={cn(
								"flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.65rem] font-bold uppercase transition-colors border",
								selectedTypes.includes(opt.key)
									? `${opt.bgClass} text-white border-transparent`
									: "bg-secondary text-foreground border-transparent hover:bg-secondary/80",
							)}
						>
							{opt.label}
						</button>
					))}
				</div>
			</div>

			<GeneralPaginationComponent
				activePage={filters.page ?? 1}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages}
				pageSize={filters.pageSize}
				onPageSizeChange={(pageSize) => updateFilters({ pageSize, page: 1 })}
				itemsMatchedText={conversionsMatched === 1 ? "1 conversão encontrada" : `${conversionsMatched} conversões encontradas`}
				itemsShowingText={`mostrando ${items.length}`}
				sticky={false}
			/>

			<div className="w-full flex flex-col gap-1.5 max-h-[520px] overflow-y-auto overscroll-y-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
				{isLoading ? <LoadingComponent /> : null}
				{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
				{isSuccess ? (
					items.length > 0 ? (
						items.map((conversion) => (
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
						))
					) : (
						<p className="w-full flex items-center justify-center text-sm text-muted-foreground py-6">
							Nenhuma conversão neste período. Ajuste as datas ou os filtros de tipo acima.
						</p>
					)
				) : null}
			</div>
		</div>
	);
}
