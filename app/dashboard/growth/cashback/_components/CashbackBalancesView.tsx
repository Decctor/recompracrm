"use client";

import type { TGetCashbackBalancesInput, TGetCashbackBalancesOutputDefault } from "@/app/api/cashback-programs/clients/balance/route";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InteractiveFilter, type InteractiveFilterOption, type InteractiveFilterSortValue } from "@/components/ui/interactive-filter";
import { formatInteractiveSortFieldSummary } from "@/components/ui/interactive-filter-formatting";
import { Input } from "@/components/ui/input";
import { formatCashbackValue, formatNameAsInitials } from "@/lib/formatting";
import { useCashbackBalances } from "@/lib/queries/cashback-programs";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { ArrowDownUp, Search, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

type TBalanceOrderByField = TGetCashbackBalancesInput["orderByField"];

const balanceOrderOptions: InteractiveFilterOption<TBalanceOrderByField>[] = [
	{ id: "clienteNome", value: "clienteNome", label: "CLIENTE" },
	{ id: "saldoValorDisponivel", value: "saldoValorDisponivel", label: "SALDO DISPONÍVEL" },
	{ id: "saldoValorAcumuladoTotal", value: "saldoValorAcumuladoTotal", label: "TOTAL ACUMULADO" },
	{ id: "saldoValorResgatadoTotal", value: "saldoValorResgatadoTotal", label: "TOTAL RESGATADO" },
];

export default function CashbackBalancesView({ terminology }: { terminology: TCashbackProgramTerminologyEnum }) {
	const { data, isLoading, filters, updateFilters } = useCashbackBalances({
		initialFilters: { page: 1, limit: 20, orderByField: "saldoValorDisponivel", orderByDirection: "desc" },
	});
	const balances = data?.balances ?? [];
	const balancesMatched = data?.balancesMatched ?? 0;
	const totalPages = data?.totalPages ?? 0;
	const sortValue: InteractiveFilterSortValue<TBalanceOrderByField> = {
		field: filters.orderByField,
		direction: filters.orderByDirection,
	};

	function updateSort(nextSort: InteractiveFilterSortValue<TBalanceOrderByField>) {
		updateFilters({ orderByField: nextSort.field, orderByDirection: nextSort.direction, page: 1 });
	}

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="relative w-full">
				<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={filters.search}
					placeholder="Pesquisar cliente..."
					onChange={(event) => updateFilters({ search: event.target.value, page: 1 })}
					className="w-full rounded-xl pl-9"
				/>
			</div>

			<div className="flex w-full flex-wrap items-center justify-end gap-2">
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<ArrowDownUp className="h-4 w-4" />
							<InteractiveFilter.Label>ORDENAR POR</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{formatInteractiveSortFieldSummary(balanceOrderOptions, sortValue.field)}</InteractiveFilter.Value>
						<InteractiveFilter.SortDirectionToggle
							direction={sortValue.direction}
							onDirectionChange={(direction) => updateSort({ ...sortValue, direction })}
						/>
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-72 p-0">
						<InteractiveFilter.SortContent fieldOptions={balanceOrderOptions} value={sortValue} onChange={updateSort} />
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			</div>

			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages}
				itemsMatchedText={balancesMatched === 1 ? "1 saldo encontrado" : `${balancesMatched} saldos encontrados`}
				itemsShowingText={`mostrando ${balances.length}`}
			/>

			{isLoading ? (
				<LoadingComponent />
			) : balances.length === 0 ? (
				<div className="rounded-xl border bg-card py-12 text-center text-sm text-muted-foreground">Nenhum saldo encontrado.</div>
			) : (
				<div className="flex flex-col gap-2">
					{balances.map((balance) => (
						<BalanceCard key={balance.id} balance={balance} terminology={terminology} />
					))}
				</div>
			)}
		</div>
	);
}

function BalanceCard({
	balance,
	terminology,
}: {
	balance: TGetCashbackBalancesOutputDefault["balances"][number];
	terminology: TCashbackProgramTerminologyEnum;
}) {
	return (
		<div className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-primary/[0.03] sm:flex-row sm:items-center">
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<Avatar className="h-9 w-9 shrink-0 border">
					<AvatarFallback className="text-xs font-bold">{formatNameAsInitials(balance.cliente.nome)}</AvatarFallback>
				</Avatar>
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold">{balance.cliente.nome}</p>
					<p className="flex items-center gap-1 text-[11px] text-muted-foreground">
						<WalletCards className="h-3 w-3" />
						Conta de fidelidade
					</p>
				</div>
			</div>

			<div className="grid grid-cols-3 gap-x-5 gap-y-2 border-t pt-3 sm:flex sm:shrink-0 sm:items-center sm:gap-5 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
				<BalanceValue label="TOTAL ACUMULADO" value={formatCashbackValue(balance.saldoValorAcumuladoTotal, terminology)} />
				<BalanceValue label="TOTAL RESGATADO" value={formatCashbackValue(balance.saldoValorResgatadoTotal, terminology)} />
				<BalanceValue label="SALDO DISPONÍVEL" value={formatCashbackValue(balance.saldoValorDisponivel, terminology)} valueClassname="text-brand" />
			</div>
		</div>
	);
}

function BalanceValue({ label, value, valueClassname }: { label: string; value: string; valueClassname?: string }) {
	return (
		<div className="flex flex-col gap-0.5 sm:text-right">
			<span className="text-[0.65rem] font-bold tracking-[0.05em] text-muted-foreground">{label}</span>
			<span className={cn("text-sm font-semibold", valueClassname)}>{value}</span>
		</div>
	);
}
