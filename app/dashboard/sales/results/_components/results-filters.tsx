"use client";

import { InteractiveFilter, type InteractiveFilterDateRangePreset, type InteractiveFilterOption } from "@/components/ui/interactive-filter";
import { formatInteractiveDateRangeSummary, formatInteractiveOptionSummary } from "@/components/ui/interactive-filter-formatting";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import type { TSalesResultsParams } from "@/lib/queries/sales-results";
import dayjs from "dayjs";
import { Calendar, ListFilter, Store, UserRound, WalletCards } from "lucide-react";

const RESULTS_DATE_PRESETS: readonly InteractiveFilterDateRangePreset[] = [
	{ id: "today", label: "HOJE", getValue: (ref) => ({ from: dayjs(ref).startOf("day").toDate(), to: dayjs(ref).endOf("day").toDate() }) },
	{
		id: "yesterday",
		label: "ONTEM",
		getValue: (ref) => ({ from: dayjs(ref).subtract(1, "day").startOf("day").toDate(), to: dayjs(ref).subtract(1, "day").endOf("day").toDate() }),
	},
	{ id: "this-week", label: "ESTA SEMANA", getValue: (ref) => ({ from: dayjs(ref).startOf("week").toDate(), to: dayjs(ref).endOf("day").toDate() }) },
	{ id: "this-month", label: "ESTE MÊS", getValue: (ref) => ({ from: dayjs(ref).startOf("month").toDate(), to: dayjs(ref).endOf("day").toDate() }) },
	{
		id: "last-month",
		label: "MÊS ANTERIOR",
		getValue: (ref) => ({
			from: dayjs(ref).subtract(1, "month").startOf("month").toDate(),
			to: dayjs(ref).subtract(1, "month").endOf("month").toDate(),
		}),
	},
];

type ResultsFiltersProps = {
	params: TSalesResultsParams;
	updateParams: (next: Partial<TSalesResultsParams>) => void;
	channelOptions: string[];
	financialAccountOptions: Array<{ id: string; nome: string }>;
	showSellersFilter: boolean;
};

export function ResultsFilters({ params, updateParams, channelOptions, financialAccountOptions, showSellersFilter }: ResultsFiltersProps) {
	const { data: filterOptions } = useSaleQueryFilterOptions();
	const sellerOptions = (filterOptions?.sellers ?? []) as InteractiveFilterOption<string>[];
	const channelFilterOptions = channelOptions.map((canal) => ({ id: canal, label: canal, value: canal })) satisfies InteractiveFilterOption<string>[];
	const accountFilterOptions = financialAccountOptions.map((conta) => ({
		id: conta.id,
		label: conta.nome,
		value: conta.id,
	})) satisfies InteractiveFilterOption<string>[];

	const hasSellers = params.sellersIds.length > 0;
	const hasChannels = params.channels.length > 0;
	const hasExcludedAccounts = params.excludedFinancialAccountIds.length > 0;

	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			<InteractiveFilter.Root className="w-fit">
				<InteractiveFilter.Trigger>
					<InteractiveFilter.Icon>
						<Calendar className="h-4 w-4" />
						<InteractiveFilter.Label>PERÍODO</InteractiveFilter.Label>
					</InteractiveFilter.Icon>
					<InteractiveFilter.Value>{formatInteractiveDateRangeSummary(params.after.toISOString(), params.before.toISOString())}</InteractiveFilter.Value>
				</InteractiveFilter.Trigger>
				<InteractiveFilter.Content className="w-auto p-0">
					<InteractiveFilter.DateRangeContent
						value={{ from: params.after, to: params.before }}
						presets={RESULTS_DATE_PRESETS}
						onChange={(period) => updateParams({ after: period.from ?? params.after, before: period.to ?? params.before })}
					/>
				</InteractiveFilter.Content>
			</InteractiveFilter.Root>

			{hasSellers && showSellersFilter ? (
				<ResultsMultiFilter
					label="VENDEDORES"
					icon={<UserRound className="h-4 w-4" />}
					options={sellerOptions}
					value={params.sellersIds}
					onChange={(sellersIds) => updateParams({ sellersIds })}
					onClear={() => updateParams({ sellersIds: [] })}
				/>
			) : null}
			{hasChannels ? (
				<ResultsMultiFilter
					label="CANAIS"
					icon={<Store className="h-4 w-4" />}
					options={channelFilterOptions}
					value={params.channels}
					onChange={(channels) => updateParams({ channels })}
					onClear={() => updateParams({ channels: [] })}
				/>
			) : null}
			{hasExcludedAccounts ? (
				<ResultsMultiFilter
					label="CONTAS FINANCEIRAS DESCONSIDERADAS"
					icon={<WalletCards className="h-4 w-4" />}
					options={accountFilterOptions}
					value={params.excludedFinancialAccountIds}
					onChange={(excludedFinancialAccountIds) => updateParams({ excludedFinancialAccountIds })}
					onClear={() => updateParams({ excludedFinancialAccountIds: [] })}
					formatSummary={formatExcludedAccountsSummary}
					clearLabel="NENHUMA EXCLUSÃO"
				/>
			) : null}

			{(!hasSellers && showSellersFilter) || !hasChannels || !hasExcludedAccounts ? (
				<InteractiveFilter.AddFilterRoot className="w-fit">
					<InteractiveFilter.AddFilterTrigger>
						<ListFilter className="h-4 w-4" />
						<InteractiveFilter.Label>ADICIONAR FILTRO</InteractiveFilter.Label>
					</InteractiveFilter.AddFilterTrigger>
					<InteractiveFilter.AddFilterContent>
						<InteractiveFilter.AddFilterSection heading="Filtros">
							{!hasSellers && showSellersFilter ? (
								<InteractiveFilter.AddFilterItem id="sellers" label="VENDEDORES" icon={<UserRound className="h-4 w-4" />}>
									<InteractiveFilter.MultiContent
										options={sellerOptions}
										value={params.sellersIds}
										onChange={(sellersIds) => updateParams({ sellersIds })}
										onClear={() => updateParams({ sellersIds: [] })}
										clearLabel="TODOS"
									/>
								</InteractiveFilter.AddFilterItem>
							) : null}
							{!hasChannels ? (
								<InteractiveFilter.AddFilterItem id="channels" label="CANAIS" icon={<Store className="h-4 w-4" />}>
									<InteractiveFilter.MultiContent
										options={channelFilterOptions}
										value={params.channels}
										onChange={(channels) => updateParams({ channels })}
										onClear={() => updateParams({ channels: [] })}
										clearLabel="TODOS"
									/>
								</InteractiveFilter.AddFilterItem>
							) : null}
							{!hasExcludedAccounts ? (
								<InteractiveFilter.AddFilterItem id="financial-accounts" label="CONTAS FINANCEIRAS" icon={<WalletCards className="h-4 w-4" />}>
									<InteractiveFilter.MultiContent
										options={accountFilterOptions}
										value={params.excludedFinancialAccountIds}
										onChange={(excludedFinancialAccountIds) => updateParams({ excludedFinancialAccountIds })}
										onClear={() => updateParams({ excludedFinancialAccountIds: [] })}
										clearLabel="NENHUMA EXCLUSÃO"
										isCleared={params.excludedFinancialAccountIds.length === 0}
										emptyLabel="Nenhuma conta financeira vinculada a vendas."
									/>
								</InteractiveFilter.AddFilterItem>
							) : null}
						</InteractiveFilter.AddFilterSection>
					</InteractiveFilter.AddFilterContent>
				</InteractiveFilter.AddFilterRoot>
			) : null}
		</div>
	);
}

function ResultsMultiFilter({
	label,
	icon,
	options,
	value,
	onChange,
	onClear,
	formatSummary = formatInteractiveOptionSummary,
	clearLabel = "TODOS",
}: {
	label: string;
	icon: React.ReactNode;
	options: InteractiveFilterOption<string>[];
	value: string[];
	onChange: (value: string[]) => void;
	onClear: () => void;
	formatSummary?: (options: InteractiveFilterOption<string>[], value: string[]) => string;
	clearLabel?: string;
}) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					{icon}
					<InteractiveFilter.Label>{label}</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatSummary(options, value)}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={onClear} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-72 p-0">
				<InteractiveFilter.MultiContent options={options} value={value} onChange={onChange} onClear={onClear} clearLabel={clearLabel} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function formatExcludedAccountsSummary(options: InteractiveFilterOption<string>[], values: string[]) {
	const labels = options.filter((option) => values.includes(option.value)).map((option) => option.label);
	if (labels.length === 1) return `EXCETO ${labels[0]}`;
	return `${values.length} CONTAS EXCLUÍDAS`;
}
