"use client";

import MultipleSalesSelectInput from "@/components/Inputs/SelectMultipleSalesInput";
import { buildSalesIntegrationFilterOptions } from "@/components/Sales/sales-integration-filter-options";
import { InteractiveFilter, type InteractiveFilterOption, type InteractiveFilterSortValue } from "@/components/ui/interactive-filter";
import {
	formatInteractiveCountSummary,
	formatInteractiveDateRangeSummary,
	formatInteractiveNumberRangeSummary,
	formatInteractiveOptionSummary,
	formatInteractiveSortFieldSummary,
	isInteractiveSortActive,
} from "@/components/ui/interactive-filter-formatting";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import { useSupplierOptions } from "@/lib/queries/suppliers";
import type { TGetProductsDefaultInput } from "@/app/api/products/route";
import { BadgeDollarSign, Calendar, ListFilter, Truck } from "lucide-react";

type ProductsInlineFiltersProps = {
	filters: TGetProductsDefaultInput;
	updateFilters: (filters: Partial<TGetProductsDefaultInput>) => void;
	// Fornecedores ficam atrás da permissão de visualizar compras.
	showMainSupplierFilter?: boolean;
};

// Opção sintética do filtro de fornecedor principal: vira `withoutMainSupplier` na consulta.
const WITHOUT_MAIN_SUPPLIER_OPTION = "__sem_fornecedor_principal__";

export default function ProductsInlineFilters({ filters, updateFilters, showMainSupplierFilter = false }: ProductsInlineFiltersProps) {
	const { data: filterOptions } = useSaleQueryFilterOptions();
	const { data: supplierOptionsResult } = useSupplierOptions({ enabled: showMainSupplierFilter });
	const mainSupplierOptions = [
		{ id: WITHOUT_MAIN_SUPPLIER_OPTION, label: "SEM FORNECEDOR PRINCIPAL", value: WITHOUT_MAIN_SUPPLIER_OPTION },
		...(supplierOptionsResult ?? []).map((supplier) => ({ id: supplier.id, label: supplier.nome, value: supplier.id })),
	] satisfies InteractiveFilterOption<string>[];
	const mainSupplierValue = [...(filters.mainSupplierIds ?? []), ...(filters.withoutMainSupplier ? [WITHOUT_MAIN_SUPPLIER_OPTION] : [])];
	const updateMainSupplierFilter = (value: string[]) =>
		updateFilters({
			mainSupplierIds: value.filter((id) => id !== WITHOUT_MAIN_SUPPLIER_OPTION),
			withoutMainSupplier: value.includes(WITHOUT_MAIN_SUPPLIER_OPTION),
			page: 1,
		});
	const clearMainSupplierFilter = () => updateFilters({ mainSupplierIds: [], withoutMainSupplier: false, page: 1 });
	const groupOptions = (filterOptions?.productsGroups ?? []) as InteractiveFilterOption<string>[];
	const integrationOptions = buildSalesIntegrationFilterOptions(filterOptions?.integrations);
	const sellerOptions = (filterOptions?.sellers ?? []) as InteractiveFilterOption<string>[];
	const stockStatusOptions = [
		{ id: "out", label: "SEM ESTOQUE", value: "out" },
		{ id: "low", label: "ESTOQUE BAIXO", value: "low" },
		{ id: "healthy", label: "ESTOQUE SAUDÁVEL", value: "healthy" },
		{ id: "overstocked", label: "EXCESSO DE ESTOQUE", value: "overstocked" },
	] satisfies InteractiveFilterOption<string>[];
	const abcClassOptions = [
		{ id: "A", label: "A", value: "A" },
		{ id: "B", label: "B", value: "B" },
		{ id: "C", label: "C", value: "C" },
	] satisfies InteractiveFilterOption<string>[];
	const orderFieldOptions = [
		{ id: "nome", label: "DESCRIÇÃO", value: "nome" },
		{ id: "codigo", label: "CÓDIGO", value: "codigo" },
		{ id: "grupo", label: "GRUPO", value: "grupo" },
		{ id: "vendasValorTotal", label: "VALOR TOTAL DE VENDAS", value: "vendasValorTotal" },
		{ id: "vendasQtdeTotal", label: "QUANTIDADE TOTAL DE VENDAS", value: "vendasQtdeTotal" },
		{ id: "quantidade", label: "QUANTIDADE EM ESTOQUE", value: "quantidade" },
	] satisfies InteractiveFilterOption<NonNullable<TGetProductsDefaultInput["orderByField"]>>[];
	const defaultSort = {
		field: "nome",
		direction: "asc",
	} satisfies InteractiveFilterSortValue<NonNullable<TGetProductsDefaultInput["orderByField"]>>;
	const sortValue = {
		field: filters.orderByField ?? defaultSort.field,
		direction: filters.orderByDirection ?? defaultSort.direction,
	} satisfies InteractiveFilterSortValue<NonNullable<TGetProductsDefaultInput["orderByField"]>>;
	const hasGroups = (filters.groups ?? []).length > 0;
	const hasIntegrations = (filters.statsIntegrationsIds ?? []).length > 0;
	const hasSellers = (filters.statsSellerIds ?? []).length > 0;
	const hasStock = (filters.stockStatus ?? []).length > 0;
	const hasMainSupplier = mainSupplierValue.length > 0;
	const hasABCClasses = (filters.abcClasses ?? []).length > 0;
	const hasPrice = filters.priceMin != null || filters.priceMax != null;
	const hasStatsTotal = filters.statsTotalMin != null || filters.statsTotalMax != null;
	const hasExcludedSales = (filters.statsExcludedSalesIds ?? []).length > 0;
	const hasActiveSort = isInteractiveSortActive(sortValue, defaultSort);

	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			<InteractiveFilter.Root className="w-fit">
				<InteractiveFilter.Trigger>
					<InteractiveFilter.Icon>
						<Calendar className="h-4 w-4" />
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

			{hasGroups ? (
				<ProductsMultiFilter
					label="GRUPOS"
					options={groupOptions}
					value={filters.groups ?? []}
					onChange={(groups) => updateFilters({ groups, page: 1 })}
					onClear={() => updateFilters({ groups: [], page: 1 })}
				/>
			) : null}
			{hasIntegrations ? (
				<ProductsMultiFilter
					label="INTEGRAÇÕES"
					options={integrationOptions}
					value={filters.statsIntegrationsIds ?? []}
					onChange={(statsIntegrationsIds) => updateFilters({ statsIntegrationsIds, page: 1 })}
					onClear={() => updateFilters({ statsIntegrationsIds: [], page: 1 })}
				/>
			) : null}
			{hasSellers ? (
				<ProductsMultiFilter
					label="VENDEDORES"
					options={sellerOptions}
					value={filters.statsSellerIds ?? []}
					onChange={(statsSellerIds) => updateFilters({ statsSellerIds, page: 1 })}
					onClear={() => updateFilters({ statsSellerIds: [], page: 1 })}
				/>
			) : null}
			{hasStock ? (
				<ProductsMultiFilter
					label="ESTOQUE"
					options={stockStatusOptions}
					value={filters.stockStatus ?? []}
					onChange={(stockStatus) => updateFilters({ stockStatus, page: 1 })}
					onClear={() => updateFilters({ stockStatus: [], page: 1 })}
				/>
			) : null}
			{showMainSupplierFilter && hasMainSupplier ? (
				<ProductsMultiFilter
					label="FORNECEDOR PRINCIPAL"
					options={mainSupplierOptions}
					value={mainSupplierValue}
					onChange={updateMainSupplierFilter}
					onClear={clearMainSupplierFilter}
				/>
			) : null}
			{hasABCClasses ? (
				<ProductsMultiFilter
					label="CURVA ABC"
					options={abcClassOptions}
					value={filters.abcClasses ?? []}
					onChange={(abcClasses) => updateFilters({ abcClasses, page: 1 })}
					onClear={() => updateFilters({ abcClasses: [], page: 1 })}
				/>
			) : null}
			{hasPrice ? (
				<ProductsNumberRangeFilter
					label="PREÇO"
					min={filters.priceMin}
					max={filters.priceMax}
					onChange={({ greaterThan, lessThan }) => updateFilters({ priceMin: greaterThan, priceMax: lessThan, page: 1 })}
					onClear={() => updateFilters({ priceMin: null, priceMax: null, page: 1 })}
				/>
			) : null}
			{hasStatsTotal ? (
				<ProductsNumberRangeFilter
					label="VALOR VENDIDO"
					min={filters.statsTotalMin}
					max={filters.statsTotalMax}
					onChange={({ greaterThan, lessThan }) => updateFilters({ statsTotalMin: greaterThan, statsTotalMax: lessThan, page: 1 })}
					onClear={() => updateFilters({ statsTotalMin: null, statsTotalMax: null, page: 1 })}
				/>
			) : null}
			{hasExcludedSales ? <ProductsExcludedSalesFilter filters={filters} updateFilters={updateFilters} /> : null}
			{hasActiveSort ? (
				<ProductsSortFilter
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
						{!hasGroups ? (
							<InteractiveFilter.AddFilterItem id="groups" label="GRUPOS" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={groupOptions}
									value={filters.groups ?? []}
									onChange={(groups) => updateFilters({ groups, page: 1 })}
									onClear={() => updateFilters({ groups: [], page: 1 })}
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
						{!hasSellers ? (
							<InteractiveFilter.AddFilterItem id="sellers" label="VENDEDORES" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={sellerOptions}
									value={filters.statsSellerIds ?? []}
									onChange={(statsSellerIds) => updateFilters({ statsSellerIds, page: 1 })}
									onClear={() => updateFilters({ statsSellerIds: [], page: 1 })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasStock ? (
							<InteractiveFilter.AddFilterItem id="stock" label="ESTOQUE" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={stockStatusOptions}
									value={filters.stockStatus ?? []}
									onChange={(stockStatus) => updateFilters({ stockStatus, page: 1 })}
									onClear={() => updateFilters({ stockStatus: [], page: 1 })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{showMainSupplierFilter && !hasMainSupplier ? (
							<InteractiveFilter.AddFilterItem id="mainSupplier" label="FORNECEDOR PRINCIPAL" icon={<Truck className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={mainSupplierOptions}
									value={mainSupplierValue}
									onChange={updateMainSupplierFilter}
									onClear={clearMainSupplierFilter}
									searchPlaceholder="Buscar fornecedor..."
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasABCClasses ? (
							<InteractiveFilter.AddFilterItem id="abcClasses" label="CURVA ABC" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={abcClassOptions}
									value={filters.abcClasses ?? []}
									onChange={(abcClasses) => updateFilters({ abcClasses, page: 1 })}
									onClear={() => updateFilters({ abcClasses: [], page: 1 })}
									clearLabel="TODAS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasPrice ? (
							<InteractiveFilter.AddFilterItem id="price" label="PREÇO" icon={<BadgeDollarSign className="h-4 w-4" />}>
								<InteractiveFilter.NumberRangeContent
									value={{ greaterThan: filters.priceMin, lessThan: filters.priceMax }}
									onChange={({ greaterThan, lessThan }) => updateFilters({ priceMin: greaterThan, priceMax: lessThan, page: 1 })}
									onClear={() => updateFilters({ priceMin: null, priceMax: null, page: 1 })}
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasStatsTotal ? (
							<InteractiveFilter.AddFilterItem id="statsTotal" label="VALOR VENDIDO" icon={<BadgeDollarSign className="h-4 w-4" />}>
								<InteractiveFilter.NumberRangeContent
									value={{ greaterThan: filters.statsTotalMin, lessThan: filters.statsTotalMax }}
									onChange={({ greaterThan, lessThan }) => updateFilters({ statsTotalMin: greaterThan, statsTotalMax: lessThan, page: 1 })}
									onClear={() => updateFilters({ statsTotalMin: null, statsTotalMax: null, page: 1 })}
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasExcludedSales ? (
							<InteractiveFilter.AddFilterItem id="excludedSales" label="VENDAS EXCLUÍDAS" icon={<ListFilter className="h-4 w-4" />}>
								<ProductsExcludedSalesFilterContent filters={filters} updateFilters={updateFilters} />
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

function ProductsSortFilter<TField extends string>({
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

function ProductsExcludedSalesFilter({ filters, updateFilters }: ProductsInlineFiltersProps) {
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
				<ProductsExcludedSalesFilterContent filters={filters} updateFilters={updateFilters} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function ProductsExcludedSalesFilterContent({ filters, updateFilters }: ProductsInlineFiltersProps) {
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

function ProductsMultiFilter({
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

function ProductsNumberRangeFilter({
	label,
	min,
	max,
	onChange,
	onClear,
}: {
	label: string;
	min?: number | null;
	max?: number | null;
	onChange: (value: { greaterThan?: number | null; lessThan?: number | null }) => void;
	onClear: () => void;
}) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<BadgeDollarSign className="h-4 w-4" />
					<InteractiveFilter.Label>{label}</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveNumberRangeSummary(min, max)}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={onClear} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-80 p-0">
				<InteractiveFilter.NumberRangeContent value={{ greaterThan: min, lessThan: max }} onChange={onChange} onClear={onClear} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}
