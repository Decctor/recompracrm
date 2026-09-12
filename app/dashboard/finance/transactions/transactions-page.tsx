"use client";

import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { AlertCircle, ArrowRight, ArrowRightLeft, CalendarDays, CheckCircle2, Clock, DollarSign, ListFilter, Pencil, Wallet } from "lucide-react";
import type { TGetFinancialTransactionsOutputDefault } from "@/app/api/finances/financial-transactions/route";
import FinancialTransactionMenu from "@/components/Modals/Finances/FinancialTransactionMenu";
import NewFinancialTransfer from "@/components/Modals/Finances/NewFinancialTransfer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InteractiveFilter } from "@/components/ui/interactive-filter";
import { Input } from "@/components/ui/input";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { formatDateAsLocale, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { getErrorMessage } from "@/lib/errors";
import { useFinancesTransactions } from "@/lib/queries/finances";
import { cn } from "@/lib/utils";
import { FinancialAccountTypeOptions, FinancialTransactionTypeOptions, SalePaymentMethodsOptions } from "@/utils/select-options";
import { BsCalendar, BsCalendarCheck } from "react-icons/bs";

const TRANSACTION_STATUS_OPTIONS = [
	{
		id: "pendente",
		value: "pendente",
		label: "PENDENTE",
		icon: <Clock className="w-4 h-4 text-blue-600" />,
	},
	{
		id: "efetivada",
		value: "efetivada",
		label: "EFETIVADA",
		icon: <CheckCircle2 className="w-4 h-4 text-green-600" />,
	},
	{
		id: "em-atraso",
		value: "em-atraso",
		label: "EM ATRASO",
		icon: <AlertCircle className="w-4 h-4 text-red-600" />,
	},
];

export default function FinanceTransactionsPage() {
	const [viewingTransactionId, setViewingTransactionId] = useQueryState("transactionId");
	const [isCreatingTransfer, setIsCreatingTransfer] = useState(false);
	const { data, isLoading, isError, isSuccess, error, filters, updateFilters } = useFinancesTransactions({
		initialFilters: { page: 1, search: "" },
	});

	const transactions = data?.transactions ?? [];
	const transactionsMatched = data?.transactionsMatched ?? 0;
	const totalPages = data?.totalPages ?? 0;
	const selectedTypesLabel = useMemo(
		() => filters.types.map((type) => FinancialTransactionTypeOptions.find((option) => option.value === type)?.label ?? type).join(", "),
		[filters.types],
	);
	const selectedPaymentMethodsLabel = useMemo(
		() => filters.paymentMethods.map((method) => SalePaymentMethodsOptions.find((option) => option.value === method)?.label ?? method).join(", "),
		[filters.paymentMethods],
	);
	const selectedStatusesLabel = useMemo(
		() => filters.statuses.map((status) => TRANSACTION_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status).join(", "),
		[filters.statuses],
	);
	const selectedForecastPeriodLabel = useMemo(() => {
		return filters.periodAfter && filters.periodBefore
			? `${formatDateAsLocale(filters.periodAfter)} - ${formatDateAsLocale(filters.periodBefore)}`
			: "N/A";
	}, [filters.periodAfter, filters.periodBefore]);

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex flex-col gap-2 sm:flex-row">
				<Input
					value={filters.search}
					placeholder="Pesquisar movimentação..."
					onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
					className="grow rounded-xl"
				/>
				<Button type="button" onClick={() => setIsCreatingTransfer(true)} className="flex shrink-0 items-center gap-1.5">
					<ArrowRightLeft className="h-4 w-4" />
					NOVA TRANSFERÊNCIA
				</Button>
			</div>
			<div className="flex flex-col gap-3 justify-end lg:flex-row lg:items-end">
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<ArrowRight className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>TIPO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{selectedTypesLabel.length > 0 ? <strong>{selectedTypesLabel}</strong> : <span>NENHUM</span>}</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ types: [], page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-72 p-0">
						<InteractiveFilter.MultiContent
							options={FinancialTransactionTypeOptions.map((option) => ({
								...option,
								startContent: option.icon,
							}))}
							value={filters.types}
							onChange={(nextTypes) => updateFilters({ types: nextTypes, page: 1 })}
							onClear={() => updateFilters({ types: [], page: 1 })}
							isCleared={filters.types.length === 0}
							searchPlaceholder="Buscar tipo..."
							emptyLabel="Nenhum tipo encontrado."
							clearLabel="N/A"
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>

				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<Wallet className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>MÉTODO DE PAGAMENTO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>
							{selectedPaymentMethodsLabel.length > 0 ? <strong>{selectedPaymentMethodsLabel}</strong> : <span>NENHUM</span>}
						</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ paymentMethods: [], page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-80 p-0">
						<InteractiveFilter.MultiContent
							options={SalePaymentMethodsOptions.map((option) => ({
								...option,
								startContent: option.icon,
							}))}
							value={filters.paymentMethods}
							onChange={(nextPaymentMethods) => updateFilters({ paymentMethods: nextPaymentMethods, page: 1 })}
							onClear={() => updateFilters({ paymentMethods: [], page: 1 })}
							isCleared={filters.paymentMethods.length === 0}
							searchPlaceholder="Buscar método..."
							emptyLabel="Nenhum método encontrado."
							clearLabel="N/A"
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>

				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<ListFilter className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>STATUS</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>
							{selectedStatusesLabel.length > 0 ? <strong>{selectedStatusesLabel}</strong> : <span>NENHUM</span>}
						</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ statuses: [], page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-72 p-0">
						<InteractiveFilter.MultiContent
							options={TRANSACTION_STATUS_OPTIONS.map((option) => ({
								...option,
								startContent: option.icon,
							}))}
							value={filters.statuses}
							onChange={(nextStatuses) => updateFilters({ statuses: nextStatuses, page: 1 })}
							onClear={() => updateFilters({ statuses: [], page: 1 })}
							isCleared={filters.statuses.length === 0}
							searchPlaceholder="Buscar status..."
							emptyLabel="Nenhum status encontrado."
							clearLabel="N/A"
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>

				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<CalendarDays className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>PERÍODO DE PREVISÃO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{selectedForecastPeriodLabel}</InteractiveFilter.Value>
						<InteractiveFilter.Clear
							onClear={() =>
								updateFilters({
									periodAfter: null,
									periodBefore: null,
									page: 1,
								})
							}
						/>
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0">
						<InteractiveFilter.DateRangeContent
							value={{
								from: filters.periodAfter ?? undefined,
								to: filters.periodBefore ?? undefined,
							}}
							onChange={(nextPeriod) =>
								updateFilters({
									periodAfter: nextPeriod.from ?? null,
									periodBefore: nextPeriod.to ?? null,
									page: 1,
								})
							}
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			</div>

			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages}
				itemsMatchedText={`${transactionsMatched} ${transactionsMatched === 1 ? "movimentação encontrada" : "movimentações encontradas"}.`}
				itemsShowingText={`Mostrando ${transactions.length} ${transactions.length === 1 ? "movimentação" : "movimentações"}.`}
			/>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && transactions ? (
				transactions.length > 0 ? (
					transactions.map((tx) => <TransactionCard key={tx.id} transaction={tx} onOpenDetails={() => setViewingTransactionId(tx.id)} />)
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<DollarSign />
							</EmptyMedia>
							<EmptyTitle>Nenhuma movimentação encontrada</EmptyTitle>
							<EmptyDescription>Não há movimentações financeiras para os filtros selecionados.</EmptyDescription>
						</EmptyHeader>
						<EmptyContent />
					</Empty>
				)
			) : null}

			{viewingTransactionId ? <FinancialTransactionMenu transactionId={viewingTransactionId} closeMenu={() => setViewingTransactionId(null)} /> : null}
			{isCreatingTransfer ? <NewFinancialTransfer closeMenu={() => setIsCreatingTransfer(false)} /> : null}
		</div>
	);
}

type TransactionCardProps = {
	transaction: TGetFinancialTransactionsOutputDefault["transactions"][number];
	onOpenDetails: () => void;
};

function TransactionCard({ transaction, onOpenDetails }: TransactionCardProps) {
	const typeConfig = useMemo(() => FinancialTransactionTypeOptions.find((o) => o.value === transaction.tipo) ?? null, [transaction.tipo]);

	const now = new Date();
	const isEffective = !!transaction.dataEfetivacao;
	const isOverdue = !isEffective && transaction.dataPrevisao && new Date(transaction.dataPrevisao) < now;
	const statusConfig = useMemo(() => {
		return {
			label: isEffective ? "EFETIVADA" : isOverdue ? "EM ATRASO" : "PENDENTE",
			className: isEffective ? "bg-green-100 text-green-700" : isOverdue ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700",
			icon: isEffective ? <CheckCircle2 className="w-3 h-3" /> : isOverdue ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />,
		};
	}, [isEffective, isOverdue]);

	const paymentMethodConfig = useMemo(() => {
		return SalePaymentMethodsOptions.find((o) => o.value === transaction.metodo) ?? null;
	}, [transaction.metodo]);

	const financialAccountTypeConfig = useMemo(() => {
		return FinancialAccountTypeOptions.find((o) => o.value === transaction.contaFinanceira?.tipo) ?? null;
	}, [transaction.contaFinanceira?.tipo]);

	return (
		<div className="bg-card border-border flex w-full flex-col gap-1.5 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex w-full flex-col items-start justify-between gap-2 lg:flex-row lg:items-center">
				<div className="flex flex-wrap items-center gap-2">
					{typeConfig ? (
						<span className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem]", typeConfig.colors.background, typeConfig.colors.text)}>
							{typeConfig.icon}
							{typeConfig.label}
						</span>
					) : null}
					<h1 className="text-xs font-bold tracking-tight lg:text-sm">{transaction.titulo || "TÍTULO NÃO DEFINIDO"}</h1>
				</div>
				<div className="flex items-center gap-1.5">
					{statusConfig ? (
						<span className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem]", statusConfig.className)}>
							{statusConfig.icon}
							{statusConfig.label}
						</span>
					) : null}
					<span className="text-sm font-semibold">{formatToMoney(transaction.valor)}</span>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				{transaction.contaFinanceira ? (
					<span className={cn("flex items-center gap-1.5 text-[0.65rem]")}>
						{financialAccountTypeConfig?.icon}
						{transaction.contaFinanceira.nome}
					</span>
				) : null}
				{paymentMethodConfig ? (
					<span className={cn("flex items-center gap-1.5 text-[0.65rem]")}>
						{paymentMethodConfig.icon}
						{paymentMethodConfig.label}
					</span>
				) : null}

				{transaction.totalParcelas && transaction.totalParcelas > 1 ? (
					<span className="text-[0.65rem] text-muted-foreground">
						Parcela {transaction.parcela}/{transaction.totalParcelas}
					</span>
				) : null}
			</div>

			<div className="flex w-full flex-col items-start justify-between gap-2 lg:flex-row lg:items-center">
				<div className="flex flex-wrap items-center gap-2">
					{transaction.dataEfetivacao ? (
						<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground")}>
							<BsCalendarCheck className="h-3 min-h-3 w-3 min-w-3 text-green-600" />
							<p className="text-xs font-medium tracking-tight uppercase">EFETIVADA: {formatDateAsLocale(transaction.dataEfetivacao)}</p>
						</div>
					) : transaction.dataPrevisao ? (
						<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground")}>
							<BsCalendar className="h-3 min-h-3 w-3 min-w-3 text-amber-600" />
							<p className="text-xs font-medium tracking-tight uppercase">PREVISÃO: {formatDateAsLocale(transaction.dataPrevisao)}</p>
						</div>
					) : null}

					{transaction.autor ? (
						<div className="flex items-center gap-1">
							<Avatar className="h-4 w-4">
								<AvatarImage src={transaction.autor.avatarUrl || undefined} alt={transaction.autor.nome || "N/A"} />
								<AvatarFallback className="text-[0.5rem]">{formatNameAsInitials(transaction.autor.nome || "N/A")}</AvatarFallback>
							</Avatar>
							<span className="text-[0.65rem] text-muted-foreground">{transaction.autor.nome}</span>
						</div>
					) : null}
				</div>
				<Button type="button" size="sm" variant="ghost" onClick={onOpenDetails} className="flex items-center gap-1.5">
					<Pencil className="h-4 w-4 min-h-4 min-w-4" />
					VER DETALHES
				</Button>
			</div>
		</div>
	);
}
