"use client";

import { InteractionCard } from "@/components/Interactions/InteractionCard";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { InteractiveFilter, type InteractiveFilterOption, type InteractiveFilterSortValue } from "@/components/ui/interactive-filter";
import {
	formatInteractiveOptionSummary,
	formatInteractiveSortFieldSummary,
	isInteractiveSortActive,
} from "@/components/ui/interactive-filter-formatting";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { useCampaignInteractionsLogs } from "@/lib/queries/campaigns";
import { InteractionsSentStatusOptions } from "@/utils/select-options";
import { ListFilter } from "lucide-react";

export function CampaignsInteractionsView() {
	const {
		data: interactionsResult,
		isLoading,
		isError,
		isSuccess,
		error,
		filters,
		updateFilters,
	} = useCampaignInteractionsLogs({
		initialFilters: {
			page: 1,
			search: "",
			status: [],
			orderByField: "dataExecucao",
			orderByDirection: "desc",
		},
	});

	const interactionsItems = interactionsResult?.items ?? [];
	const interactionsShowing = interactionsItems.length;
	const interactionsMatched = interactionsResult?.interactionsMatched ?? 0;
	const totalPages = interactionsResult?.totalPages ?? 0;

	return (
		<div className="flex w-full min-w-0 flex-col gap-3">
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar interações (título, descrição, cliente)..."
					onChange={(e) =>
						updateFilters({
							search: e.target.value,
							page: 1,
						})
					}
					className="grow rounded-xl"
				/>
			</div>
			<CampaignInteractionsInlineFilters filters={filters} updateFilters={updateFilters} />

			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages}
				itemsMatchedText={`${interactionsMatched} ${interactionsMatched === 1 ? "interação encontrada." : "interações encontradas."}`}
				itemsShowingText={`${interactionsShowing} ${interactionsShowing === 1 ? "interação exibida." : "interações exibidas."}`}
			/>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				<div className="flex w-full min-w-0 flex-col gap-2">
					{interactionsItems.length > 0 ? (
						interactionsItems.map((interaction) => (
							<InteractionCard.Provider key={interaction.id} interaction={interaction}>
								<InteractionCard.ListItem />
							</InteractionCard.Provider>
						))
					) : (
						<p className="w-full flex items-center justify-center">Nenhuma interação encontrada</p>
					)}
				</div>
			) : null}
		</div>
	);
}

function CampaignInteractionsInlineFilters({
	filters,
	updateFilters,
}: {
	filters: ReturnType<typeof useCampaignInteractionsLogs>["filters"];
	updateFilters: ReturnType<typeof useCampaignInteractionsLogs>["updateFilters"];
}) {
	const statusOptions = InteractionsSentStatusOptions as InteractiveFilterOption<(typeof filters.status)[number]>[];
	const orderFieldOptions = [
		{ id: "dataExecucao", label: "DATA DE EXECUÇÃO", value: "dataExecucao" },
		{ id: "dataEnvio", label: "DATA DE ENVIO", value: "dataEnvio" },
	] as const satisfies InteractiveFilterOption<NonNullable<typeof filters.orderByField>>[];
	const defaultSort = {
		field: "dataExecucao",
		direction: "desc",
	} satisfies InteractiveFilterSortValue<NonNullable<typeof filters.orderByField>>;
	const sortValue = {
		field: filters.orderByField ?? defaultSort.field,
		direction: filters.orderByDirection ?? defaultSort.direction,
	} satisfies InteractiveFilterSortValue<NonNullable<typeof filters.orderByField>>;
	const hasActiveSort = isInteractiveSortActive(sortValue, defaultSort);

	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			<InteractiveFilter.Root className="w-fit">
				<InteractiveFilter.Trigger>
					<InteractiveFilter.Icon>
						<ListFilter className="h-4 w-4" />
						<InteractiveFilter.Label>STATUS</InteractiveFilter.Label>
					</InteractiveFilter.Icon>
					<InteractiveFilter.Value>{formatInteractiveOptionSummary(statusOptions, filters.status ?? [])}</InteractiveFilter.Value>
					<InteractiveFilter.Clear onClear={() => updateFilters({ status: [], page: 1 })} />
				</InteractiveFilter.Trigger>
				<InteractiveFilter.Content className="w-72 p-0">
					<InteractiveFilter.MultiContent
						options={statusOptions}
						value={filters.status ?? []}
						onChange={(status) => updateFilters({ status, page: 1 })}
						onClear={() => updateFilters({ status: [], page: 1 })}
						clearLabel="TODOS"
					/>
				</InteractiveFilter.Content>
			</InteractiveFilter.Root>

			{hasActiveSort ? (
				<CampaignInteractionSortFilter
					fieldOptions={[...orderFieldOptions]}
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
						{!hasActiveSort ? (
							<InteractiveFilter.AddFilterItem id="sort" label="ORDENAR POR" icon={<ListFilter className="h-4 w-4" />}>
								<InteractiveFilter.SortContent
									fieldOptions={[...orderFieldOptions]}
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

function CampaignInteractionSortFilter<TField extends string>({
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
