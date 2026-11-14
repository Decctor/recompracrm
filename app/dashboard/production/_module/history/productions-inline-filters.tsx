"use client";

import type { TGetProductionsDefaultInput } from "@/app/api/productions/route";
import { InlineFilter, PeriodFilter, StatusOptionIcon } from "@/app/dashboard/purchases/components/PurchasesInlineFilters";
import { InteractiveFilter, type InteractiveFilterOption, type InteractiveFilterSortValue } from "@/components/ui/interactive-filter";
import {
	formatInteractiveOptionSummary,
	formatInteractiveSortFieldSummary,
	isInteractiveSortActive,
} from "@/components/ui/interactive-filter-formatting";
import { useProductionRecipes } from "@/lib/queries/productions";
import type { TProductionCompositionEnum, TProductionStatusEnum, TProductionsSortFieldEnum } from "@/schemas/enums";
import { ArrowDownUp, CircleDashed, ClipboardList, FileText, ListFilter } from "lucide-react";
import { PRODUCTION_STATUS_META, PRODUCTION_STATUS_ORDER } from "./production-status-meta";

type ProductionsInlineFiltersProps = {
	filters: TGetProductionsDefaultInput;
	updateFilters: (filters: Partial<TGetProductionsDefaultInput>) => void;
};

const STATUS_OPTIONS = PRODUCTION_STATUS_ORDER.map((status) => ({
	id: status,
	value: status,
	label: PRODUCTION_STATUS_META[status].label,
	startContent: <StatusOptionIcon icon={PRODUCTION_STATUS_META[status].icon} className={PRODUCTION_STATUS_META[status].chipClassName} />,
})) satisfies InteractiveFilterOption<TProductionStatusEnum>[];

const COMPOSITION_OPTIONS = [
	{ id: "RECEITA", value: "RECEITA", label: "RECEITA" },
	{ id: "MANUAL", value: "MANUAL", label: "MANUAL" },
	{ id: "SALDO_REINCORPORADO", value: "SALDO_REINCORPORADO", label: "COM SALDO REINCORPORADO" },
] satisfies InteractiveFilterOption<TProductionCompositionEnum>[];

const ORDER_FIELD_OPTIONS = [
	{ id: "DATA", value: "DATA", label: "DATA DE INÍCIO" },
	{ id: "TITULO", value: "TITULO", label: "TÍTULO" },
	{ id: "SAIDA", value: "SAIDA", label: "SAÍDA" },
	{ id: "CUSTO", value: "CUSTO", label: "CUSTO" },
	{ id: "MARGEM", value: "MARGEM", label: "MARGEM" },
] satisfies InteractiveFilterOption<TProductionsSortFieldEnum>[];

export const DEFAULT_PRODUCTIONS_SORT = { field: "DATA", direction: "desc" } satisfies InteractiveFilterSortValue<TProductionsSortFieldEnum>;

export default function ProductionsInlineFilters({ filters, updateFilters }: ProductionsInlineFiltersProps) {
	// Receitas arquivadas continuam no filtro: produções antigas ainda apontam para elas.
	const { data: recipesResult } = useProductionRecipes({
		initialFilters: { activeOnly: false, orderBy: "NOME", orderByDirection: "asc", pageSize: 100 },
	});
	const recipeOptions = (recipesResult?.recipes ?? []).map((recipe) => ({
		id: recipe.id,
		value: recipe.id,
		label: recipe.titulo.toUpperCase(),
	})) satisfies InteractiveFilterOption<string>[];
	const sortValue = { field: filters.orderBy, direction: filters.orderByDirection } satisfies InteractiveFilterSortValue<TProductionsSortFieldEnum>;

	const hasRecipes = filters.recipeIds.length > 0;
	const hasCompositions = filters.compositions.length > 0;
	const hasSort = isInteractiveSortActive(sortValue, DEFAULT_PRODUCTIONS_SORT);

	const setStatus = (status: TProductionStatusEnum[]) => updateFilters({ status, page: 1 });
	const setRecipes = (recipeIds: string[]) => updateFilters({ recipeIds, page: 1 });
	const setCompositions = (compositions: TProductionCompositionEnum[]) => updateFilters({ compositions, page: 1 });
	const setSort = ({ field, direction }: InteractiveFilterSortValue<TProductionsSortFieldEnum>) =>
		updateFilters({ orderBy: field, orderByDirection: direction, page: 1 });

	const recipesContent = (
		<InteractiveFilter.MultiContent
			options={recipeOptions}
			value={filters.recipeIds}
			onChange={setRecipes}
			onClear={() => setRecipes([])}
			searchPlaceholder="Buscar receita..."
			clearLabel="TODAS"
		/>
	);
	const compositionsContent = (
		<InteractiveFilter.MultiContent
			options={COMPOSITION_OPTIONS}
			value={filters.compositions}
			onChange={setCompositions}
			onClear={() => setCompositions([])}
			clearLabel="TODAS"
		/>
	);

	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			<InlineFilter
				icon={CircleDashed}
				label="STATUS"
				summary={formatInteractiveOptionSummary(STATUS_OPTIONS, filters.status)}
				onClear={() => setStatus([])}
			>
				<InteractiveFilter.MultiContent
					options={STATUS_OPTIONS}
					value={filters.status}
					onChange={setStatus}
					onClear={() => setStatus([])}
					clearLabel="TODOS"
				/>
			</InlineFilter>

			<PeriodFilter
				after={filters.periodAfter}
				before={filters.periodBefore}
				onChange={(periodAfter, periodBefore) => updateFilters({ periodAfter, periodBefore, page: 1 })}
			/>

			{hasCompositions ? (
				<InlineFilter
					icon={FileText}
					label="ORIGEM"
					summary={formatInteractiveOptionSummary(COMPOSITION_OPTIONS, filters.compositions)}
					onClear={() => setCompositions([])}
				>
					{compositionsContent}
				</InlineFilter>
			) : null}
			{hasRecipes ? (
				<InlineFilter
					icon={ClipboardList}
					label="RECEITA"
					summary={formatInteractiveOptionSummary(recipeOptions, filters.recipeIds)}
					onClear={() => setRecipes([])}
				>
					{recipesContent}
				</InlineFilter>
			) : null}
			{hasSort ? (
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<ArrowDownUp className="h-4 w-4" />
							<InteractiveFilter.Label>ORDENAR POR</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{formatInteractiveSortFieldSummary(ORDER_FIELD_OPTIONS, sortValue.field)}</InteractiveFilter.Value>
						<InteractiveFilter.SortDirectionToggle
							direction={sortValue.direction}
							onDirectionChange={(direction) => setSort({ ...sortValue, direction })}
						/>
						<InteractiveFilter.Clear onClear={() => setSort(DEFAULT_PRODUCTIONS_SORT)} label="Limpar ordenação" />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-72 p-0">
						<InteractiveFilter.SortContent fieldOptions={ORDER_FIELD_OPTIONS} value={sortValue} onChange={setSort} />
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			) : null}

			{!hasCompositions || !hasRecipes || !hasSort ? (
				<InteractiveFilter.AddFilterRoot className="w-fit">
					<InteractiveFilter.AddFilterTrigger>
						<ListFilter className="h-4 w-4" />
						<InteractiveFilter.Label>ADICIONAR FILTRO</InteractiveFilter.Label>
					</InteractiveFilter.AddFilterTrigger>
					<InteractiveFilter.AddFilterContent>
						<InteractiveFilter.AddFilterSection heading="Filtros">
							{!hasCompositions ? (
								<InteractiveFilter.AddFilterItem id="compositions" label="ORIGEM" icon={<FileText className="h-4 w-4" />}>
									{compositionsContent}
								</InteractiveFilter.AddFilterItem>
							) : null}
							{!hasRecipes ? (
								<InteractiveFilter.AddFilterItem id="recipes" label="RECEITA" icon={<ClipboardList className="h-4 w-4" />}>
									{recipesContent}
								</InteractiveFilter.AddFilterItem>
							) : null}
							{!hasSort ? (
								<InteractiveFilter.AddFilterItem id="sort" label="ORDENAR POR" icon={<ArrowDownUp className="h-4 w-4" />}>
									<InteractiveFilter.SortContent fieldOptions={ORDER_FIELD_OPTIONS} value={sortValue} onChange={setSort} />
								</InteractiveFilter.AddFilterItem>
							) : null}
						</InteractiveFilter.AddFilterSection>
					</InteractiveFilter.AddFilterContent>
				</InteractiveFilter.AddFilterRoot>
			) : null}
		</div>
	);
}
