"use client";

import { useMemo, useState } from "react";
import { Banknote, CalendarDays, Plus } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InteractiveFilter } from "@/components/ui/interactive-filter";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { formatDateAsLocale } from "@/lib/formatting";
import { getErrorMessage } from "@/lib/errors";
import { useFinancesAccounts } from "@/lib/queries/finances";
import { Button } from "@/components/ui/button";
import NewFinancialAccount from "@/components/Modals/Finances/FinancialAccounts/NewFinancialAccount";
import ControlFinancialAccount from "@/components/Modals/Finances/FinancialAccounts/ControlFinancialAccount";
import { AccountCard } from "./_components/account-card";
import { AccountsSummary } from "./_components/accounts-summary";

const ACCOUNT_STATUS_OPTIONS = [
	{ id: "active", value: "true", label: "Somente ativas" },
	{ id: "all", value: "false", label: "Todas as contas" },
];

type FinanceAccountsPageProps = {
	canCreateAccounts?: boolean;
	canEditAccounts?: boolean;
};

export default function FinanceAccountsPage({ canCreateAccounts = false, canEditAccounts = false }: FinanceAccountsPageProps) {
	const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
	const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
	const { data, isLoading, isError, isSuccess, error, filters, updateFilters } = useFinancesAccounts({ initialFilters: {} });
	const accounts = data?.accounts ?? [];

	const selectedStatusLabel = filters.activeOnly ? "SOMENTE ATIVAS" : "TODAS AS CONTAS";
	const selectedPeriodLabel = useMemo(() => {
		return filters.statsPeriodAfter && filters.statsPeriodBefore
			? `${formatDateAsLocale(filters.statsPeriodAfter)} - ${formatDateAsLocale(filters.statsPeriodBefore)}`
			: "N/A";
	}, [filters.statsPeriodAfter, filters.statsPeriodBefore]);

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex flex-col gap-3 justify-end lg:flex-row lg:items-end">
				{canCreateAccounts ? (
					<Button className="gap-2 lg:order-last" size="sm" onClick={() => setIsNewAccountOpen(true)}>
						<Plus className="h-4 w-4" />
						NOVA CONTA
					</Button>
				) : null}
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<Banknote className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>STATUS</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>
							<strong>{selectedStatusLabel}</strong>
						</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ activeOnly: true })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-56 p-0">
						<InteractiveFilter.SingleContent
							options={ACCOUNT_STATUS_OPTIONS}
							value={filters.activeOnly ? "true" : "false"}
							onChange={(nextValue) => updateFilters({ activeOnly: nextValue === "true" })}
							searchPlaceholder="Buscar status..."
							emptyLabel="Nenhum status encontrado."
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>

				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<CalendarDays className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>PERÍODO DE ESTATÍSTICAS</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{selectedPeriodLabel}</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ statsPeriodAfter: null, statsPeriodBefore: null })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0">
						<InteractiveFilter.DateRangeContent
							value={{ from: filters.statsPeriodAfter ?? undefined, to: filters.statsPeriodBefore ?? undefined }}
							onChange={(nextPeriod) =>
								updateFilters({
									statsPeriodAfter: nextPeriod.from ?? filters.statsPeriodAfter ?? null,
									statsPeriodBefore: nextPeriod.to ?? filters.statsPeriodBefore ?? null,
								})
							}
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			</div>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && accounts ? (
				accounts.length > 0 ? (
					<div className="w-full flex flex-col gap-3">
						<AccountsSummary accounts={accounts} />
						{accounts.map((account) => (
							<AccountCard
								key={account.id}
								account={account}
								statsPeriodAfter={filters.statsPeriodAfter}
								statsPeriodBefore={filters.statsPeriodBefore}
								canEdit={canEditAccounts}
								onEdit={() => setEditingAccountId(account.id)}
							/>
						))}
					</div>
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Banknote />
							</EmptyMedia>
							<EmptyTitle>Nenhuma conta financeira encontrada</EmptyTitle>
							<EmptyDescription>{filters.activeOnly ? "Não há contas financeiras ativas." : "Não há contas financeiras cadastradas."}</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							{canCreateAccounts ? (
								<Button className="gap-2" onClick={() => setIsNewAccountOpen(true)}>
									<Plus className="h-4 w-4" />
									CRIAR PRIMEIRA CONTA
								</Button>
							) : null}
						</EmptyContent>
					</Empty>
				)
			) : null}
			{isNewAccountOpen ? <NewFinancialAccount closeMenu={() => setIsNewAccountOpen(false)} /> : null}
			{editingAccountId ? <ControlFinancialAccount accountId={editingAccountId} closeMenu={() => setEditingAccountId(null)} /> : null}
		</div>
	);
}
