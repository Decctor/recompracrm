"use client";
import { CashbackTransaction, ProgramCashbackTransactionRow } from "@/components/CashbackPrograms/CashbackTransactionCard";
import { InteractiveFilter, type InteractiveFilterOption } from "@/components/ui/interactive-filter";
import { formatInteractiveDateRangeSummary, formatInteractiveOptionSummary } from "@/components/ui/interactive-filter-formatting";
import { Input } from "@/components/ui/input";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { useCashbackProgramTransactions } from "@/lib/queries/cashback-programs";
import { useSellers } from "@/lib/queries/sellers";
import { Calendar, History, ListFilter, Search, TrendingDown, TrendingUp, UserRound } from "lucide-react";
import dayjs from "dayjs";
import type { TGetCashbackProgramTransactionsInput } from "@/app/api/cashback-programs/transactions/route";

type TTransactionFilterType = TGetCashbackProgramTransactionsInput["types"][number];

const transactionTypeOptions: InteractiveFilterOption<TTransactionFilterType>[] = [
	{ id: "ACÚMULO", value: "ACÚMULO", label: "ACÚMULO", startContent: <TrendingUp className="h-4 w-4 text-green-600" /> },
	{ id: "RESGATE", value: "RESGATE", label: "RESGATE", startContent: <TrendingDown className="h-4 w-4 text-blue-600" /> },
	{ id: "EXPIRAÇÃO", value: "EXPIRAÇÃO", label: "EXPIRAÇÃO", startContent: <History className="h-4 w-4 text-red-600" /> },
];

export default function CashbackTransactionsView({ terminology }: { terminology: TCashbackProgramTerminologyEnum }) {
	const { data: sellersData } = useSellers({
		initialFilters: {
			page: 1,
			activeOnly: true,
			orderByField: "nome",
			orderByDirection: "asc",
		},
	});
	const sellerOptions: InteractiveFilterOption<string>[] = (sellersData?.sellers ?? []).map((seller) => ({
		id: seller.id,
		value: seller.id,
		label: seller.nome,
	}));
	const { data, isLoading, filters, updateFilters } = useCashbackProgramTransactions({
		initialFilters: {
			page: 1,
			limit: 20,
			periodAfter: dayjs().startOf("month").toDate(),
			periodBefore: dayjs().endOf("month").toDate(),
		},
	});

	const transactions = data?.transactions || [];
	const totalPages = data?.totalPages ?? 0;
	const transactionsMatched = data?.transactionsMatched ?? 0;
	const hasOperatorFilter = filters.operatorSellerIds.length > 0;
	const selectedTypesLabel = filters.types.map((type) => transactionTypeOptions.find((option) => option.value === type)?.label ?? type).join(", ");

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="relative w-full">
				<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={filters.search}
					placeholder="Pesquisar por cliente, operador, prêmio ou produto..."
					onChange={(event) => updateFilters({ search: event.target.value, page: 1 })}
					className="w-full rounded-xl pl-9"
				/>
			</div>

			<div className="flex w-full flex-wrap items-center justify-end gap-2">
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<ListFilter className="h-4 w-4" />
							<InteractiveFilter.Label>TIPO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{selectedTypesLabel ? <strong>{selectedTypesLabel}</strong> : <span>TODOS</span>}</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ types: [], page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-72 p-0">
						<InteractiveFilter.MultiContent
							options={transactionTypeOptions}
							value={filters.types}
							onChange={(types) => updateFilters({ types, page: 1 })}
							onClear={() => updateFilters({ types: [], page: 1 })}
							isCleared={filters.types.length === 0}
							searchPlaceholder="Buscar tipo..."
							emptyLabel="Nenhum tipo encontrado."
							clearLabel="TODOS"
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>

				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<Calendar className="h-4 w-4" />
							<InteractiveFilter.Label>PERÍODO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{formatInteractiveDateRangeSummary(filters.periodAfter, filters.periodBefore)}</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ periodAfter: null, periodBefore: null, page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0">
						<InteractiveFilter.DateRangeContent
							value={{ from: filters.periodAfter ?? undefined, to: filters.periodBefore ?? undefined }}
							onChange={(period) => updateFilters({ periodAfter: period.from ?? null, periodBefore: period.to ?? null, page: 1 })}
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>

				{hasOperatorFilter ? (
					<OperatorFilter
						options={sellerOptions}
						value={filters.operatorSellerIds}
						onChange={(operatorSellerIds) => updateFilters({ operatorSellerIds, page: 1 })}
					/>
				) : null}

				{!hasOperatorFilter ? (
					<InteractiveFilter.AddFilterRoot className="w-fit">
						<InteractiveFilter.AddFilterTrigger>
							<ListFilter className="h-4 w-4" />
							<InteractiveFilter.Label>ADICIONAR FILTRO</InteractiveFilter.Label>
						</InteractiveFilter.AddFilterTrigger>
						<InteractiveFilter.AddFilterContent>
							<InteractiveFilter.AddFilterSection heading="Filtros">
								<InteractiveFilter.AddFilterItem id="operatorSellerIds" label="OPERADORES" icon={<UserRound className="h-4 w-4" />}>
									<InteractiveFilter.MultiContent
										options={sellerOptions}
										value={filters.operatorSellerIds}
										onChange={(operatorSellerIds) => updateFilters({ operatorSellerIds, page: 1 })}
										onClear={() => updateFilters({ operatorSellerIds: [], page: 1 })}
										clearLabel="TODOS"
									/>
								</InteractiveFilter.AddFilterItem>
							</InteractiveFilter.AddFilterSection>
						</InteractiveFilter.AddFilterContent>
					</InteractiveFilter.AddFilterRoot>
				) : null}
			</div>

			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages}
				itemsMatchedText={transactionsMatched === 1 ? "1 transação encontrada" : `${transactionsMatched} transações encontradas`}
				itemsShowingText={`mostrando ${transactions.length}`}
			/>

			{isLoading ? (
				<LoadingComponent />
			) : (
				<CashbackTransaction.List>
					{transactions.length === 0 ? (
						<div className="text-sm text-muted-foreground text-center py-8">Nenhuma transação encontrada</div>
					) : (
						transactions.map((transaction) => <ProgramCashbackTransactionRow key={transaction.id} transaction={transaction} terminology={terminology} />)
					)}
				</CashbackTransaction.List>
			)}
		</div>
	);
}

function OperatorFilter({
	options,
	value,
	onChange,
}: {
	options: InteractiveFilterOption<string>[];
	value: string[];
	onChange: (value: string[]) => void;
}) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<UserRound className="h-4 w-4" />
					<InteractiveFilter.Label>OPERADORES</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveOptionSummary(options, value)}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={() => onChange([])} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-72 p-0">
				<InteractiveFilter.MultiContent options={options} value={value} onChange={onChange} onClear={() => onChange([])} clearLabel="TODOS" />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}
