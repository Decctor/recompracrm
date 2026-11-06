"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQueryState } from "nuqs";
import {
	ArrowRight,
	BookOpen,
	CalendarDays,
	CheckCircle2,
	CircleDashed,
	CircleDollarSign,
	CircleOff,
	Clock3,
	ArrowDownNarrowWide,
	ArrowUpNarrowWide,
	ListFilter,
	Pencil,
	Plus,
} from "lucide-react";
import type { TAccountingEntryTransactionStatus, TGetAccountingEntriesOutputDefault } from "@/app/api/finances/accounting-entries/route";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InteractiveFilter } from "@/components/ui/interactive-filter";
import { Input } from "@/components/ui/input";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ControlAccountingEntry from "@/components/Modals/AccountingEntries/ControlAccountingEntry";
import NewAccountingEntry from "@/components/Modals/AccountingEntries/NewAccountingEntry";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { formatDateAsLocale, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { getErrorMessage } from "@/lib/errors";
import { useFinancesAccountingEntries } from "@/lib/queries/finances";
import { cn } from "@/lib/utils";
import { AccountingEntryOriginTypeOptions } from "@/utils/select-options";
import { BsCalendar } from "react-icons/bs";

const TRANSACTION_STATUS_OPTIONS: {
	id: TAccountingEntryTransactionStatus;
	value: TAccountingEntryTransactionStatus;
	label: string;
	icon: ReactNode;
	className: string;
}[] = [
	{
		id: "PAGO",
		value: "PAGO",
		label: "Pago",
		icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
		className: "bg-green-100 text-green-700 dark:bg-green-200/25 dark:text-green-600",
	},
	{
		id: "PARCIALMENTE_PAGO",
		value: "PARCIALMENTE_PAGO",
		label: "Parcialmente pago",
		icon: <CircleDashed className="h-4 w-4 text-amber-600" />,
		className: "bg-amber-100 text-amber-700 dark:bg-amber-200/25 dark:text-amber-500",
	},
	{
		id: "PENDENTE",
		value: "PENDENTE",
		label: "Pendente",
		icon: <Clock3 className="h-4 w-4 text-blue-600" />,
		className: "bg-blue-100 text-blue-700 dark:bg-blue-200/25 dark:text-blue-500",
	},
	{
		id: "SEM_TRANSACOES",
		value: "SEM_TRANSACOES",
		label: "Sem transações",
		icon: <CircleOff className="h-4 w-4 text-muted-foreground" />,
		className: "bg-muted text-muted-foreground",
	},
];

const SORT_ORDER_OPTIONS = [
	{ id: "desc", value: "desc" as const, label: "Mais recentes", icon: <ArrowDownNarrowWide className="h-4 w-4 text-primary" /> },
	{ id: "asc", value: "asc" as const, label: "Mais antigos", icon: <ArrowUpNarrowWide className="h-4 w-4 text-muted-foreground" /> },
];

export default function FinanceEntriesPage() {
	const [newEntryMenuIsOpen, setNewEntryMenuIsOpen] = useState(false);
	// Na URL, e não em `useState`: é assim que a venda consegue linkar direto para o lançamento que
	// originou o pagamento (`appRoutes.finance.entry`) sem que esta página saiba de onde a navegação veio.
	const [editingEntryId, setEditingEntryId] = useQueryState("entryId");
	const { data, isLoading, isError, isSuccess, error, filters, updateFilters } = useFinancesAccountingEntries({
		initialFilters: { page: 1, search: "" },
	});

	const entries = data?.entries ?? [];
	const entriesMatched = data?.entriesMatched ?? 0;
	const totalPages = data?.totalPages ?? 0;

	const selectedOriginTypesLabel = useMemo(
		() => filters.originTypes?.map((originType) => AccountingEntryOriginTypeOptions.find((o) => o.value === originType)?.label ?? originType) ?? [],
		[filters.originTypes],
	).join(", ");
	const selectedCompetencePeriodLabel = useMemo(() => {
		return filters.periodAfter && filters.periodBefore
			? `${formatDateAsLocale(filters.periodAfter)} - ${formatDateAsLocale(filters.periodBefore)}`
			: "N/A";
	}, [filters.periodAfter, filters.periodBefore]);
	const selectedTransactionStatusesLabel = useMemo(
		() => filters.transactionStatuses?.map((status) => TRANSACTION_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status) ?? [],
		[filters.transactionStatuses],
	).join(", ");
	const selectedSortOrderLabel = SORT_ORDER_OPTIONS.find((option) => option.value === filters.sortOrder)?.label ?? "Mais recentes";
	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex flex-col gap-2 lg:flex-row lg:items-center">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar lançamento..."
					onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
					className="grow rounded-xl"
				/>
				<Button type="button" className="gap-1.5" onClick={() => setNewEntryMenuIsOpen(true)}>
					<Plus className="h-4 w-4" />
					NOVO LANÇAMENTO
				</Button>
			</div>
			<div className="flex flex-col gap-3 lg:flex-row lg:items-end justify-end">
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							{filters.sortOrder === "asc" ? (
								<ArrowUpNarrowWide className="h-4 w-4 min-h-4 min-w-4" />
							) : (
								<ArrowDownNarrowWide className="h-4 w-4 min-h-4 min-w-4" />
							)}
							<InteractiveFilter.Label>ORDENAÇÃO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>
							<strong>{selectedSortOrderLabel}</strong>
						</InteractiveFilter.Value>
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-64 p-0">
						<InteractiveFilter.SingleContent
							options={SORT_ORDER_OPTIONS.map((option) => ({ ...option, startContent: option.icon }))}
							value={filters.sortOrder}
							onChange={(sortOrder) => updateFilters({ sortOrder, page: 1 })}
							searchPlaceholder="Buscar ordenação..."
							emptyLabel="Nenhuma ordenação encontrada."
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<CircleDollarSign className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>STATUS DO PAGAMENTO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>
							{selectedTransactionStatusesLabel ? <strong>{selectedTransactionStatusesLabel}</strong> : <span>TODOS</span>}
						</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ transactionStatuses: [], page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-72 p-0">
						<InteractiveFilter.MultiContent
							options={TRANSACTION_STATUS_OPTIONS.map((option) => ({
								...option,
								startContent: option.icon,
							}))}
							value={filters.transactionStatuses ?? []}
							onChange={(transactionStatuses) => updateFilters({ transactionStatuses, page: 1 })}
							onClear={() => updateFilters({ transactionStatuses: [], page: 1 })}
							isCleared={filters.transactionStatuses?.length === 0}
							searchPlaceholder="Buscar status..."
							emptyLabel="Nenhum status encontrado."
							clearLabel="Todos"
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<ListFilter className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>TIPO DE ORIGEM</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>
							{selectedOriginTypesLabel.length > 0 ? <strong>{selectedOriginTypesLabel}</strong> : <span>NENHUM</span>}
						</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ originTypes: [] })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-72 p-0">
						<InteractiveFilter.MultiContent
							options={AccountingEntryOriginTypeOptions.map((o) => ({
								...o,
								startContent: o.icon,
							}))}
							value={filters.originTypes ?? []}
							onChange={(nextOriginTypes) => updateFilters({ originTypes: nextOriginTypes })}
							onClear={() => updateFilters({ originTypes: [] })}
							isCleared={filters.originTypes?.length === 0}
							searchPlaceholder="Buscar tipo de origem..."
							emptyLabel="Nenhum tipo de origem encontrado."
							clearLabel="N/A"
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>

				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<CalendarDays className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>PERÍODO DE COMPETÊNCIA</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{selectedCompetencePeriodLabel}</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ periodAfter: null, periodBefore: null, page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0">
						<InteractiveFilter.DateRangeContent
							value={{ from: filters.periodAfter ?? undefined, to: filters.periodBefore ?? undefined }}
							onChange={(nextPeriod) =>
								updateFilters({
									periodAfter: nextPeriod.from ?? filters.periodAfter ?? undefined,
									periodBefore: nextPeriod.to ?? filters.periodBefore ?? undefined,
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
				pageSize={filters.pageSize}
				onPageSizeChange={(pageSize) => updateFilters({ pageSize, page: 1 })}
				itemsMatchedText={entriesMatched === 1 ? "1 lançamento encontrado" : `${entriesMatched} lançamentos encontrados`}
				itemsShowingText={`mostrando ${entries.length}`}
			/>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && entries ? (
				entries.length > 0 ? (
					entries.map((entry) => <AccountingEntryCard key={entry.id} entry={entry} onEditClick={() => setEditingEntryId(entry.id)} />)
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<BookOpen />
							</EmptyMedia>
							<EmptyTitle>Nenhum lançamento encontrado</EmptyTitle>
							<EmptyDescription>Não há lançamentos contábeis para os filtros selecionados.</EmptyDescription>
						</EmptyHeader>
						<EmptyContent />
					</Empty>
				)
			) : null}

			{newEntryMenuIsOpen ? <NewAccountingEntry closeModal={() => setNewEntryMenuIsOpen(false)} /> : null}
			{editingEntryId ? <ControlAccountingEntry entryId={editingEntryId} closeModal={() => setEditingEntryId(null)} /> : null}
		</div>
	);
}

type AccountingEntryCardProps = {
	entry: TGetAccountingEntriesOutputDefault["entries"][number];
	onEditClick: () => void;
};
function AccountingEntryCard({ entry, onEditClick }: AccountingEntryCardProps) {
	const originTypeConfig = useMemo(() => AccountingEntryOriginTypeOptions.find((o) => o.value === entry.origemTipo) ?? null, [entry.origemTipo]);
	const transactionStatusConfig = TRANSACTION_STATUS_OPTIONS.find((option) => option.value === entry.statusTransacoes);
	return (
		<div className="bg-card border-border flex w-full flex-col gap-1.5 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex w-full flex-col items-start justify-between gap-2 lg:flex-row lg:items-center">
				<div className="flex items-center gap-2">
					{originTypeConfig ? (
						<span
							className={cn(
								"flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem]",
								originTypeConfig.colors.background,
								originTypeConfig.colors.text,
							)}
						>
							{originTypeConfig.icon}
							{originTypeConfig.label}
						</span>
					) : null}
					{transactionStatusConfig ? (
						<Chip.Root size="sm" shape="pill" className={transactionStatusConfig.className}>
							<Chip.Icon>{transactionStatusConfig.icon}</Chip.Icon>
							<Chip.Label caps weight="bold">
								{transactionStatusConfig.label}
							</Chip.Label>
						</Chip.Root>
					) : null}
					<h1 className="text-xs font-bold tracking-tight lg:text-sm">{entry.titulo || "TÍTULO NÃO DEFINIDO"}</h1>
				</div>
				<span className="text-sm font-semibold">{formatToMoney(entry.valor)}</span>
			</div>

			<div className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
				<span className="font-medium">{entry.contaDebito?.nome ?? "—"}</span>
				<ArrowRight className="w-4 h-4 min-w-4 min-h-4" />
				<span className="font-medium">{entry.contaCredito?.nome ?? "—"}</span>
			</div>

			{entry.anotacoes ? <p className="text-[0.65rem] text-muted-foreground line-clamp-1">{entry.anotacoes}</p> : null}

			<div className="flex w-full flex-col items-start justify-between gap-2 lg:flex-row lg:items-center">
				<div className="flex flex-wrap items-center gap-2">
					<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-foreground")}>
						<BsCalendar className="w-4 h-4 min-w-4 min-h-4" />
						<p className="text-xs font-medium tracking-tight uppercase">COMPETÊNCIA: {formatDateAsLocale(entry.dataCompetencia)}</p>
					</div>
					{entry.autor ? (
						<div className="flex items-center gap-1.5">
							<Avatar className="h-4 w-4">
								<AvatarImage src={entry.autor.avatarUrl || undefined} alt={entry.autor.nome || "N/A"} />
								<AvatarFallback className="text-[0.5rem]">{formatNameAsInitials(entry.autor.nome || "N/A")}</AvatarFallback>
							</Avatar>
							<span className="text-[0.65rem] text-muted-foreground">{entry.autor.nome}</span>
						</div>
					) : null}
					<span className="text-[0.65rem] text-muted-foreground">{formatDateAsLocale(entry.dataInsercao, true)}</span>
				</div>
				<Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={onEditClick}>
					<Pencil className="h-4 w-4" />
					EDITAR
				</Button>
			</div>
		</div>
	);
}
