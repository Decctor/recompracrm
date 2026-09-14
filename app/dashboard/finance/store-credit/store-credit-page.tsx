"use client";

import { AlertCircle, CalendarDays, CheckCircle2, Clock, HandCoins, ListFilter, NotebookPen, Timer, TrendingUp, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import type { TGetStoreCreditOutputDefault } from "@/app/api/finances/store-credit/route";
import { DeltaBadge } from "@/app/dashboard/finance/_components/delta-badge";
import { StatCard } from "@/app/dashboard/finance/_components/stat-card";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InteractiveFilter } from "@/components/ui/interactive-filter";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { getErrorMessage } from "@/lib/errors";
import { STORE_CREDIT_AGING_BUCKETS, type TStoreCreditAgingBucket } from "@/lib/finances/store-credit/aging";
import type { TStoreCreditSortField, TStoreCreditStatus } from "@/lib/finances/store-credit/constants";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useStoreCreditClients, useStoreCreditStats } from "@/lib/queries/store-credit";
import { ReceiveStoreCreditMenu } from "@/components/Modals/Finances/ReceiveStoreCreditMenu";
import { StoreCreditAging } from "./_components/store-credit-aging";
import { StoreCreditClientCard } from "./_components/store-credit-client-card";

type StoreCreditClient = TGetStoreCreditOutputDefault["clientes"][number];

const STATUS_OPTIONS = [
	{ id: "EM_ABERTO", value: "EM_ABERTO" as TStoreCreditStatus, label: "EM ABERTO", startContent: <Clock className="h-4 w-4 text-blue-600" /> },
	{ id: "VENCIDO", value: "VENCIDO" as TStoreCreditStatus, label: "VENCIDO", startContent: <AlertCircle className="h-4 w-4 text-red-600" /> },
	{ id: "QUITADO", value: "QUITADO" as TStoreCreditStatus, label: "QUITADO", startContent: <CheckCircle2 className="h-4 w-4 text-green-600" /> },
];

const AGING_OPTIONS = STORE_CREDIT_AGING_BUCKETS.map((bucket) => ({
	id: bucket.chave,
	value: bucket.chave as TStoreCreditAgingBucket,
	label: bucket.rotulo.toUpperCase(),
}));

const SORT_FIELD_OPTIONS = [
	{ id: "saldo", value: "saldo" as TStoreCreditSortField, label: "SALDO EM ABERTO" },
	{ id: "previsao", value: "previsao" as TStoreCreditSortField, label: "VENCIMENTO MAIS ANTIGO" },
	{ id: "nome", value: "nome" as TStoreCreditSortField, label: "NOME DO CLIENTE" },
];

type ReceiveTarget = { cliente: StoreCreditClient; transacaoId: string | null };

export default function StoreCreditPage({ organizationId, canReceive }: { organizationId: string; canReceive: boolean }) {
	const [receiveTarget, setReceiveTarget] = useState<ReceiveTarget | null>(null);

	const { data: stats, isLoading: statsLoading, isError: statsError, error: statsErrorObject, params, updateParams } = useStoreCreditStats({});
	const { data, isLoading, isError, isSuccess, error, filters, updateFilters } = useStoreCreditClients({});

	const clientes = data?.clientes ?? [];
	const clientesMatched = data?.clientesMatched ?? 0;
	const totalPages = data?.totalPages ?? 0;

	const selectedStatusesLabel = useMemo(
		() => filters.statuses.map((status) => STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status).join(", "),
		[filters.statuses],
	);
	const selectedAgingLabel = useMemo(
		() => filters.agingBuckets.map((bucket) => AGING_OPTIONS.find((option) => option.value === bucket)?.label ?? bucket).join(", "),
		[filters.agingBuckets],
	);
	const selectedSortLabel = useMemo(
		() => SORT_FIELD_OPTIONS.find((option) => option.value === filters.sortField)?.label ?? "SALDO EM ABERTO",
		[filters.sortField],
	);
	const selectedPeriodLabel = useMemo(
		() => `${formatDateAsLocale(params.periodAfter)} - ${formatDateAsLocale(params.periodBefore)}`,
		[params.periodAfter, params.periodBefore],
	);

	const hasActiveFilters = filters.search.trim().length > 0 || filters.statuses.length > 0 || filters.agingBuckets.length > 0;

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex min-h-8 flex-col items-start justify-between gap-2 lg:flex-row lg:items-center">
				<div className="flex items-center gap-2">
					<NotebookPen className="h-4 w-4 min-h-4 min-w-4" />
					<h1 className="text-xs font-bold tracking-tight uppercase">FIADOS</h1>
				</div>
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<CalendarDays className="h-4 w-4 min-h-4 min-w-4" />
							{/* O período governa só o indicador de recebimento: dívida em aberto não tem período, tem idade. */}
							<InteractiveFilter.Label>PERÍODO DO RECEBIDO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{selectedPeriodLabel}</InteractiveFilter.Value>
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0" align="end">
						<InteractiveFilter.DateRangeContent
							value={{ from: params.periodAfter, to: params.periodBefore }}
							onChange={(nextPeriod) =>
								updateParams({
									periodAfter: nextPeriod.from ?? params.periodAfter,
									periodBefore: nextPeriod.to ?? params.periodBefore,
								})
							}
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			</div>

			{statsError ? <ErrorComponent msg={getErrorMessage(statsErrorObject)} /> : null}

			<div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
				<StatCard
					icon={<Wallet className="h-4 w-4 min-h-4 min-w-4" />}
					iconWrapperClassName="bg-blue-200 text-blue-600"
					label="EM ABERTO"
					value={
						<div className="flex items-center gap-2">
							<h1 className="text-sm font-medium">{statsLoading ? "..." : formatToMoney(stats?.totalEmAberto ?? 0)}</h1>
							<span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
								{stats?.clientesEmAberto ?? 0} {stats?.clientesEmAberto === 1 ? "CLIENTE" : "CLIENTES"}
							</span>
						</div>
					}
				/>
				<StatCard
					icon={<AlertCircle className="h-4 w-4 min-h-4 min-w-4" />}
					iconWrapperClassName="bg-red-200 text-red-600"
					label="VENCIDO"
					value={
						<div className="flex items-center gap-2">
							<h1 className="text-sm font-medium text-red-600 dark:text-red-400">{statsLoading ? "..." : formatToMoney(stats?.totalVencido ?? 0)}</h1>
							<span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
								{stats?.clientesVencidos ?? 0} {stats?.clientesVencidos === 1 ? "CLIENTE" : "CLIENTES"}
							</span>
						</div>
					}
				/>
				<StatCard
					icon={<TrendingUp className="h-4 w-4 min-h-4 min-w-4" />}
					iconWrapperClassName="bg-green-200 text-green-600"
					label="RECEBIDO NO PERÍODO"
					value={
						<div className="flex items-center gap-2">
							<h1 className="text-sm font-medium">{statsLoading ? "..." : formatToMoney(stats?.recebidoNoPeriodo ?? 0)}</h1>
							<DeltaBadge current={stats?.recebidoNoPeriodo ?? 0} previous={stats?.recebidoNoPeriodoAnterior ?? 0} />
						</div>
					}
				/>
				<StatCard
					icon={<Timer className="h-4 w-4 min-h-4 min-w-4" />}
					iconWrapperClassName="bg-purple-200 text-purple-600"
					label="PRAZO MÉDIO DE QUITAÇÃO"
					title="Dias entre a venda a prazo e a entrada do dinheiro, nas quitações do período"
					value={
						statsLoading
							? "..."
							: // Sem quitação no período não há média. Zero seria uma afirmação que o dado não faz.
								stats?.prazoMedioQuitacaoDias === null || stats?.prazoMedioQuitacaoDias === undefined
								? "—"
								: `${formatDecimalPlaces(stats.prazoMedioQuitacaoDias, 0, 1)} dias`
					}
				/>
			</div>

			<StoreCreditAging faixas={stats?.faixas} isLoading={statsLoading} />

			<div className="flex flex-col gap-2 sm:flex-row">
				<Input
					value={filters.search}
					placeholder="Pesquisar cliente..."
					onChange={(event) => updateFilters({ search: event.target.value, page: 1 })}
					className="grow rounded-xl"
				/>
			</div>

			<div className="flex flex-col gap-3 justify-end lg:flex-row lg:items-end">
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<ListFilter className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>STATUS</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{selectedStatusesLabel || "TODOS"}</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ statuses: [], page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0">
						<InteractiveFilter.MultiContent
							options={STATUS_OPTIONS}
							value={filters.statuses}
							onChange={(nextStatuses) => updateFilters({ statuses: nextStatuses, page: 1 })}
							onClear={() => updateFilters({ statuses: [], page: 1 })}
							isCleared={filters.statuses.length === 0}
							searchPlaceholder="Buscar status..."
							emptyLabel="Nenhum status encontrado."
							clearLabel="TODOS"
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>

				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<Clock className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>FAIXA DE ATRASO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{selectedAgingLabel || "TODAS"}</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ agingBuckets: [], page: 1 })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0">
						<InteractiveFilter.MultiContent
							options={AGING_OPTIONS}
							value={filters.agingBuckets}
							onChange={(nextBuckets) => updateFilters({ agingBuckets: nextBuckets, page: 1 })}
							onClear={() => updateFilters({ agingBuckets: [], page: 1 })}
							isCleared={filters.agingBuckets.length === 0}
							searchPlaceholder="Buscar faixa..."
							emptyLabel="Nenhuma faixa encontrada."
							clearLabel="TODAS"
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>

				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<Users className="h-4 w-4 min-h-4 min-w-4" />
							<InteractiveFilter.Label>ORDENAR POR</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>{selectedSortLabel}</InteractiveFilter.Value>
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0">
						<InteractiveFilter.SortContent
							fieldOptions={SORT_FIELD_OPTIONS}
							value={{ field: filters.sortField, direction: filters.sortDirection }}
							onChange={(nextSort) => updateFilters({ sortField: nextSort.field, sortDirection: nextSort.direction, page: 1 })}
							searchPlaceholder="Buscar campo..."
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			</div>

			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages}
				itemsMatchedText={`${clientesMatched} ${clientesMatched === 1 ? "cliente encontrado" : "clientes encontrados"}.`}
				itemsShowingText={`Mostrando ${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}.`}
			/>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				clientes.length > 0 ? (
					<div className="flex w-full flex-col gap-2">
						{clientes.map((cliente) => (
							<StoreCreditClientCard
								key={cliente.clienteId}
								cliente={cliente}
								canReceive={canReceive}
								onReceiveClient={(target) => setReceiveTarget({ cliente: target, transacaoId: null })}
								onReceiveTitle={(target, transacaoId) => setReceiveTarget({ cliente: target, transacaoId })}
							/>
						))}
					</div>
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<HandCoins />
							</EmptyMedia>
							<EmptyTitle>{hasActiveFilters ? "Nenhum cliente para estes filtros" : "Nenhum fiado registrado"}</EmptyTitle>
							<EmptyDescription>
								{hasActiveFilters
									? "Ajuste a pesquisa ou os filtros para encontrar o cliente que você procura."
									: "Quando uma venda for fechada com o método Fiado / nota, o saldo do cliente aparece aqui."}
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent />
					</Empty>
				)
			) : null}

			{receiveTarget ? (
				<ReceiveStoreCreditMenu
					organizationId={organizationId}
					cliente={receiveTarget.cliente}
					initialTransacaoId={receiveTarget.transacaoId}
					closeMenu={() => setReceiveTarget(null)}
				/>
			) : null}
		</div>
	);
}
