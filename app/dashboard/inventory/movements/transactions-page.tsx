"use client";

import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { appRoutes } from "@/lib/navigation/routes";
import { formatDecimalPlaces } from "@/lib/formatting";
import { useProductStockTransactions } from "@/lib/queries/product-stock-transactions";
import type { TStockMovementOriginEnum, TStockMovementTypeEnum } from "@/schemas/enums";
import dayjs from "dayjs";
import NewStockTransaction from "@/components/Modals/StockTransactions/NewStockTransaction";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Boxes, ListChecks, Package, PackageSearch, Plus, Scale } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import StockTransactionRow from "./_components/StockTransactionRow";

const MOVEMENT_TYPE_FILTERS: { label: string; types: TStockMovementTypeEnum[] }[] = [
	{ label: "TODAS", types: [] },
	{ label: "ENTRADAS", types: ["ENTRADA_AQUISICAO", "ENTRADA_DEVOLUCAO", "ENTRADA_PRODUCAO"] },
	{ label: "SAÍDAS", types: ["SAIDA", "SAIDA_PRODUCAO"] },
	{ label: "AJUSTES", types: ["AJUSTE"] },
	{ label: "DESCARTES", types: ["DESCARTE"] },
];

const MOVEMENT_ORIGIN_FILTERS: { label: string; origin: TStockMovementOriginEnum | null }[] = [
	{ label: "TODAS AS ORIGENS", origin: null },
	{ label: "AUTOMÁTICAS", origin: "SISTEMA" },
	{ label: "MANUAIS", origin: "MANUAL" },
];

function isMovementFilterActive(active: TStockMovementTypeEnum[], filter: TStockMovementTypeEnum[]) {
	return JSON.stringify([...active].sort()) === JSON.stringify([...filter].sort());
}

export default function StockTransactionsPage() {
	const queryClient = useQueryClient();
	const [newTransactionModalIsOpen, setNewTransactionModalIsOpen] = useState(false);
	const { data, isLoading, isError, isSuccess, error, filters, updateFilters } = useProductStockTransactions({
		initialFilters: {
			periodAfter: dayjs().startOf("month").toDate(),
			periodBefore: dayjs().endOf("month").toDate(),
		},
	});

	const transactions = data?.transactions ?? [];
	const resumo = data?.resumo;
	const transactionsMatched = data?.transactionsMatched ?? 0;
	const totalPages = data?.totalPages ?? 0;
	const saldoLiquido = (resumo?.totalEntradas ?? 0) - (resumo?.totalSaidas ?? 0);

	return (
		<div className="flex w-full flex-col gap-4">
			{/* Resumo do período — entradas, saídas e balanço da movimentação filtrada */}
			<div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<StatUnitCard
					title="Entradas"
					subtitle="Unidades que entraram no período"
					icon={<ArrowUpRight className="h-4 w-4 min-h-4 min-w-4" />}
					current={{ value: resumo?.totalEntradas ?? 0, format: (n) => `${formatDecimalPlaces(n)} un` }}
				/>
				<StatUnitCard
					title="Saídas"
					subtitle="Unidades que saíram no período"
					icon={<ArrowDownRight className="h-4 w-4 min-h-4 min-w-4" />}
					current={{ value: resumo?.totalSaidas ?? 0, format: (n) => `${formatDecimalPlaces(n)} un` }}
				/>
				<StatUnitCard
					title="Saldo líquido"
					subtitle="Entradas menos saídas"
					icon={<Scale className="h-4 w-4 min-h-4 min-w-4" />}
					current={{ value: saldoLiquido, format: (n) => `${n > 0 ? "+" : ""}${formatDecimalPlaces(n)} un` }}
				/>
				<StatUnitCard
					title="Movimentações"
					subtitle="Registros no período"
					icon={<ListChecks className="h-4 w-4 min-h-4 min-w-4" />}
					current={{ value: resumo?.totalMovimentacoes ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
			</div>

			{/* Toolbar — busca, tipo de movimento, período e volta ao estoque */}
			<div className="flex w-full flex-col gap-2">
				<div className="flex w-full flex-col-reverse items-stretch gap-2 lg:flex-row lg:items-center">
					<Input
						value={filters.search ?? ""}
						placeholder="Pesquisar por produto, código ou motivo..."
						onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
						className="grow rounded-xl"
					/>
					<DateIntervalInput
						label="Período"
						labelClassName="hidden"
						className="hover:bg-accent hover:text-accent-foreground border-none shadow-none"
						value={{
							after: filters.periodAfter ? new Date(filters.periodAfter) : undefined,
							before: filters.periodBefore ? new Date(filters.periodBefore) : undefined,
						}}
						handleChange={(value) =>
							updateFilters({
								periodAfter: value.after ? new Date(value.after) : null,
								periodBefore: value.before ? new Date(value.before) : null,
								page: 1,
							})
						}
					/>
					<Button size="sm" className="shrink-0" onClick={() => setNewTransactionModalIsOpen(true)}>
						<Plus className="h-4 w-4 min-h-4 min-w-4" />
						NOVA MOVIMENTAÇÃO
					</Button>
					<Button variant="outline" size="sm" className="shrink-0" asChild>
						<Link href={appRoutes.inventory.root()}>
							<Boxes className="h-4 w-4 min-h-4 min-w-4" />
							ESTOQUE
						</Link>
					</Button>
				</div>
				<div className="flex w-full flex-wrap items-center gap-1.5">
					{MOVEMENT_TYPE_FILTERS.map((filter) => (
						<Button
							key={filter.label}
							variant={isMovementFilterActive(filters.types, filter.types) ? "default" : "ghost"}
							size="fit"
							className="rounded-lg px-2 py-1 text-xs"
							onClick={() => updateFilters({ types: filter.types, page: 1 })}
						>
							{filter.label}
						</Button>
					))}
					<span className="bg-border mx-1 h-4 w-px" aria-hidden />
					{MOVEMENT_ORIGIN_FILTERS.map((filter) => (
						<Button
							key={filter.label}
							variant={filters.origin === filter.origin ? "default" : "ghost"}
							size="fit"
							className="rounded-lg px-2 py-1 text-xs"
							onClick={() => updateFilters({ origin: filter.origin, page: 1 })}
						>
							{filter.label}
						</Button>
					))}
				</div>
			</div>

			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={transactionsMatched === 1 ? "1 movimentação encontrada." : `${transactionsMatched} movimentações encontradas.`}
				itemsShowingText={transactions.length === 1 ? "Mostrando 1 movimentação." : `Mostrando ${transactions.length} movimentações.`}
			/>

			{isLoading ? (
				<div className="flex flex-col gap-2">
					{Array.from({ length: 8 }).map((_, index) => (
						<TransactionRowSkeleton key={index} />
					))}
				</div>
			) : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}

			{isSuccess && transactions.length > 0
				? transactions.map((transaction) => <StockTransactionRow key={transaction.id} transaction={transaction} />)
				: null}

			{isSuccess && transactions.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							{filters.search || filters.types.length > 0 || filters.origin ? <PackageSearch /> : <ArrowLeftRight />}
						</EmptyMedia>
						<EmptyTitle>
							{filters.search || filters.types.length > 0 || filters.origin ? "Nenhuma movimentação corresponde aos filtros" : "Nenhuma movimentação no período"}
						</EmptyTitle>
						<EmptyDescription>
							{filters.search || filters.types.length > 0 || filters.origin
								? "Ajuste os filtros de tipo, período ou o termo pesquisado para ampliar a auditoria."
								: "Compras, vendas, produções e ajustes de produtos com rastreamento de estoque aparecem aqui, com o saldo antes e depois de cada movimento."}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : null}

			{newTransactionModalIsOpen ? (
				<NewStockTransaction
					closeModal={() => setNewTransactionModalIsOpen(false)}
					callbacks={{
						onSuccess: () => {
							queryClient.invalidateQueries({ queryKey: ["product-stock-transactions"] });
							queryClient.invalidateQueries({ queryKey: ["product-stock-lots"] });
						},
					}}
				/>
			) : null}
		</div>
	);
}

function TransactionRowSkeleton() {
	return (
		<div className="bg-card border-border flex w-full items-center gap-3 rounded-xl border px-3 py-3 shadow-2xs">
			<Skeleton className="h-11 w-11 min-h-11 min-w-11 rounded-lg" />
			<div className="flex grow flex-col gap-2">
				<Skeleton className="h-4 w-40" />
				<Skeleton className="h-3 w-56" />
			</div>
			<div className="flex items-center gap-6">
				<Skeleton className="h-8 w-24" />
				<Skeleton className="h-8 w-16" />
			</div>
			<Package className="text-muted-foreground/20 h-5 w-5" />
		</div>
	);
}
