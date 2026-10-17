"use client";

import MultipleSalesSelectInput from "@/components/Inputs/SelectMultipleSalesInput";
import { buildSalesIntegrationFilterOptions } from "@/components/Sales/sales-integration-filter-options";
import { InteractiveFilter, type InteractiveFilterOption } from "@/components/ui/interactive-filter";
import {
	formatInteractiveCountSummary,
	formatInteractiveDateRangeSummary,
	formatInteractiveNumberRangeSummary,
	formatInteractiveOptionSummary,
} from "@/components/ui/interactive-filter-formatting";
import { formatDateOnInputChange } from "@/lib/formatting";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import type { TSaleStatsGeneralQueryParams } from "@/schemas/query-params-utils";
import { RFMLabels } from "@/utils/rfm";
import { BadgeDollarSign, Calendar, ListFilter } from "lucide-react";
import type { ReactNode } from "react";

type CommercialInlineFiltersProps = {
	scopeSellersIds: string[] | null;
	queryParams: TSaleStatsGeneralQueryParams;
	updateQueryParams: (params: Partial<TSaleStatsGeneralQueryParams>) => void;
	/** Filtros extras logo depois do período (o comparativo põe aqui o "comparar com"). */
	children?: ReactNode;
};

/**
 * Linha de filtros da análise comercial: período, vendedores, integrações, RFM, valor e vendas
 * excluídas. O comparativo de períodos usa a mesma linha, para que o recorte seja um só.
 */
export function CommercialInlineFilters({ scopeSellersIds, queryParams, updateQueryParams, children }: CommercialInlineFiltersProps) {
	const { data: filterOptions } = useSaleQueryFilterOptions();
	const sellerOptions = ((scopeSellersIds ? filterOptions?.sellers.filter((s) => scopeSellersIds.includes(s.id)) : filterOptions?.sellers) ??
		[]) as InteractiveFilterOption<string>[];
	const integrationOptions = buildSalesIntegrationFilterOptions(filterOptions?.integrations);
	const rfmOptions = RFMLabels.map((item, index) => ({
		id: index + 1,
		label: item.text,
		value: item.text,
	})) satisfies InteractiveFilterOption<string>[];

	const hasSellers = queryParams.sellersIds.length > 0;
	const hasIntegrations = queryParams.integrationsIds.length > 0;
	const hasRFM = queryParams.clientRFMTitles.length > 0;
	const hasTotal = queryParams.total.min != null || queryParams.total.max != null;
	const hasExcludedSales = queryParams.excludedSalesIds.length > 0;

	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			<InteractiveFilter.Root className="w-fit">
				<InteractiveFilter.Trigger>
					<InteractiveFilter.Icon>
						<Calendar className="h-4 w-4" />
						<InteractiveFilter.Label>PERÍODO</InteractiveFilter.Label>
					</InteractiveFilter.Icon>
					<InteractiveFilter.Value>{formatInteractiveDateRangeSummary(queryParams.period.after, queryParams.period.before)}</InteractiveFilter.Value>
				</InteractiveFilter.Trigger>
				<InteractiveFilter.Content className="w-auto p-0">
					<InteractiveFilter.DateRangeContent
						value={{
							from: queryParams.period.after ? new Date(queryParams.period.after) : undefined,
							to: queryParams.period.before ? new Date(queryParams.period.before) : undefined,
						}}
						onChange={(period) =>
							updateQueryParams({
								period: {
									after: period.from ? (formatDateOnInputChange(period.from.toISOString(), "string", "start") as string) : queryParams.period.after,
									before: period.to ? (formatDateOnInputChange(period.to.toISOString(), "string", "end") as string) : queryParams.period.before,
								},
							})
						}
					/>
				</InteractiveFilter.Content>
			</InteractiveFilter.Root>

			{children}

			{hasSellers ? (
				<CommercialMultiFilter
					label="VENDEDORES"
					options={sellerOptions}
					value={queryParams.sellersIds}
					onChange={(sellersIds) => updateQueryParams({ sellersIds })}
					onClear={() => updateQueryParams({ sellersIds: [] })}
				/>
			) : null}
			{hasIntegrations ? (
				<CommercialMultiFilter
					label="INTEGRAÇÕES"
					options={integrationOptions}
					value={queryParams.integrationsIds}
					onChange={(integrationsIds) => updateQueryParams({ integrationsIds })}
					onClear={() => updateQueryParams({ integrationsIds: [] })}
				/>
			) : null}
			{hasRFM ? (
				<CommercialMultiFilter
					label="RFM"
					options={rfmOptions}
					value={queryParams.clientRFMTitles}
					onChange={(clientRFMTitles) => updateQueryParams({ clientRFMTitles })}
					onClear={() => updateQueryParams({ clientRFMTitles: [] })}
				/>
			) : null}
			{hasTotal ? <CommercialTotalFilter queryParams={queryParams} updateQueryParams={updateQueryParams} /> : null}
			{hasExcludedSales ? <CommercialExcludedSalesFilter queryParams={queryParams} updateQueryParams={updateQueryParams} /> : null}

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
									value={queryParams.sellersIds}
									onChange={(sellersIds) => updateQueryParams({ sellersIds })}
									onClear={() => updateQueryParams({ sellersIds: [] })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasIntegrations ? (
							<InteractiveFilter.AddFilterItem id="integrations" label="INTEGRAÇÕES" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={integrationOptions}
									value={queryParams.integrationsIds}
									onChange={(integrationsIds) => updateQueryParams({ integrationsIds })}
									onClear={() => updateQueryParams({ integrationsIds: [] })}
									clearLabel="TODAS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasRFM ? (
							<InteractiveFilter.AddFilterItem id="rfm" label="RFM" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={rfmOptions}
									value={queryParams.clientRFMTitles}
									onChange={(clientRFMTitles) => updateQueryParams({ clientRFMTitles })}
									onClear={() => updateQueryParams({ clientRFMTitles: [] })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasTotal ? (
							<InteractiveFilter.AddFilterItem id="total" label="VALOR" icon={<BadgeDollarSign className="h-4 w-4" />}>
								<InteractiveFilter.NumberRangeContent
									value={{ greaterThan: queryParams.total.min, lessThan: queryParams.total.max }}
									onChange={({ greaterThan, lessThan }) => updateQueryParams({ total: { min: greaterThan ?? undefined, max: lessThan ?? undefined } })}
									onClear={() => updateQueryParams({ total: {} })}
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasExcludedSales ? (
							<InteractiveFilter.AddFilterItem id="excludedSales" label="VENDAS EXCLUÍDAS" icon={<ListFilter className="h-4 w-4" />}>
								<MultipleSalesSelectInput
									label="VENDAS EXCLUÍDAS"
									selected={queryParams.excludedSalesIds}
									handleChange={(excludedSalesIds) => updateQueryParams({ excludedSalesIds: excludedSalesIds as string[] })}
									onReset={() => updateQueryParams({ excludedSalesIds: [] })}
									resetOptionLabel="VENDAS EXCLUÍDAS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
					</InteractiveFilter.AddFilterSection>
				</InteractiveFilter.AddFilterContent>
			</InteractiveFilter.AddFilterRoot>
		</div>
	);
}

function CommercialTotalFilter({ queryParams, updateQueryParams }: Pick<CommercialInlineFiltersProps, "queryParams" | "updateQueryParams">) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<BadgeDollarSign className="h-4 w-4" />
					<InteractiveFilter.Label>VALOR</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveNumberRangeSummary(queryParams.total.min, queryParams.total.max)}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={() => updateQueryParams({ total: {} })} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-80 p-0">
				<InteractiveFilter.NumberRangeContent
					value={{ greaterThan: queryParams.total.min, lessThan: queryParams.total.max }}
					onChange={({ greaterThan, lessThan }) => updateQueryParams({ total: { min: greaterThan ?? undefined, max: lessThan ?? undefined } })}
					onClear={() => updateQueryParams({ total: {} })}
				/>
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function CommercialExcludedSalesFilter({ queryParams, updateQueryParams }: Pick<CommercialInlineFiltersProps, "queryParams" | "updateQueryParams">) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>VENDAS EXCLUÍDAS</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveCountSummary(queryParams.excludedSalesIds)}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={() => updateQueryParams({ excludedSalesIds: [] })} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-80 p-3">
				<MultipleSalesSelectInput
					label="VENDAS EXCLUÍDAS"
					selected={queryParams.excludedSalesIds}
					handleChange={(excludedSalesIds) => updateQueryParams({ excludedSalesIds: excludedSalesIds as string[] })}
					onReset={() => updateQueryParams({ excludedSalesIds: [] })}
					resetOptionLabel="VENDAS EXCLUÍDAS"
				/>
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function CommercialMultiFilter({
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
