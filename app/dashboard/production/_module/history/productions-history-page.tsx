"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { getErrorMessage } from "@/lib/errors";
import { appRoutes } from "@/lib/navigation/routes";
import { REPORT_PERIOD_PRESETS } from "@/lib/period-presets";
import type { TProductionPermissions } from "@/lib/permissions/productions";
import { useProductions } from "@/lib/queries/productions";
import { Factory, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ProductionListCard from "./production-list-card";
import ProductionsInlineFilters, { DEFAULT_PRODUCTIONS_SORT } from "./productions-inline-filters";

/** O servidor corta a página em 50; o seletor padrão oferece 25/50/100. */
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

function getThisMonthPeriod() {
	const preset = REPORT_PERIOD_PRESETS.find((item) => item.id === "this-month");
	const period = preset?.getValue(new Date());
	return { periodAfter: period?.from ?? null, periodBefore: period?.to ?? null };
}

/** Relógio de minuto: "iniciada há 1h 20min" acompanha a tela aberta no balcão. */
function useMinuteClock() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const interval = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(interval);
	}, []);
	return now;
}

export default function ProductionsHistoryPage({ permissions }: { permissions: TProductionPermissions }) {
	const now = useMinuteClock();
	const { data, isLoading, isError, isSuccess, error, filters, updateFilters } = useProductions({
		initialFilters: { ...getThisMonthPeriod(), pageSize: DEFAULT_PAGE_SIZE },
	});
	const productions = data?.productions ?? [];
	const productionsMatched = data?.productionsMatched ?? 0;
	const hasActiveFilters =
		!!filters.search?.trim() ||
		filters.status.length > 0 ||
		filters.recipeIds.length > 0 ||
		filters.compositions.length > 0 ||
		!!filters.periodAfter ||
		!!filters.periodBefore;

	function clearFilters() {
		updateFilters({
			page: 1,
			search: "",
			status: [],
			recipeIds: [],
			compositions: [],
			periodAfter: null,
			periodBefore: null,
			orderBy: DEFAULT_PRODUCTIONS_SORT.field,
			orderByDirection: DEFAULT_PRODUCTIONS_SORT.direction,
		});
	}

	const newProductionButton = permissions.criar ? (
		<Button className="flex w-full items-center gap-2 lg:w-fit" size="sm" asChild>
			<Link href={appRoutes.productions.new()}>
				<Plus className="h-4 w-4 min-h-4 min-w-4" />
				NOVA PRODUÇÃO
			</Link>
		</Button>
	) : null;

	return (
		<div className="flex w-full flex-col gap-3 tabular-nums">
			<div className="flex w-full flex-col gap-2">
				<div className="flex w-full flex-col-reverse items-center gap-2 lg:flex-row">
					<Input
						value={filters.search ?? ""}
						placeholder="Pesquisar por título, receita ou responsável..."
						onChange={(event) => updateFilters({ search: event.target.value, page: 1 })}
						className="grow rounded-xl"
					/>
					{newProductionButton}
				</div>
				<ProductionsInlineFilters filters={filters} updateFilters={updateFilters} />
			</div>
			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={data?.totalPages ?? 0}
				pageSize={filters.pageSize}
				onPageSizeChange={(pageSize) => updateFilters({ pageSize: Math.min(pageSize, MAX_PAGE_SIZE), page: 1 })}
				itemsMatchedText={productionsMatched === 1 ? "1 produção encontrada" : `${productionsMatched} produções encontradas`}
				itemsShowingText={`mostrando ${productions.length}`}
			/>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				productions.length > 0 ? (
					<div className="flex w-full flex-col gap-3">
						{productions.map((production) => (
							<ProductionListCard key={production.id} production={production} now={now} />
						))}
					</div>
				) : hasActiveFilters ? (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Factory />
							</EmptyMedia>
							<EmptyTitle>Nenhuma produção com esses filtros</EmptyTitle>
							<EmptyDescription>Ajuste a busca ou os filtros para ver outras produções.</EmptyDescription>
						</EmptyHeader>
						<EmptyContent className="flex-row justify-center gap-2">
							<Button variant="outline" onClick={clearFilters}>
								LIMPAR FILTROS
							</Button>
						</EmptyContent>
					</Empty>
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Factory />
							</EmptyMedia>
							<EmptyTitle>Nenhuma produção ainda</EmptyTitle>
							<EmptyDescription>Registre produções para controlar insumos consumidos e produtos gerados.</EmptyDescription>
						</EmptyHeader>
						{permissions.criar ? (
							<EmptyContent className="flex-row justify-center gap-2">
								<Button asChild>
									<Link href={appRoutes.productions.new()}>CRIAR PRODUÇÃO</Link>
								</Button>
							</EmptyContent>
						) : null}
					</Empty>
				)
			) : null}
		</div>
	);
}
