"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { getErrorMessage } from "@/lib/errors";
import { appRoutes } from "@/lib/navigation/routes";
import { DEFAULT_PURCHASES_FILTERS, usePurchases } from "@/lib/queries/purchases";
import { Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import PurchaseListCard from "./PurchaseListCard";
import PurchasesInlineFilters from "./PurchasesInlineFilters";

export default function PurchasesListTab({ canCreate }: { canCreate: boolean }) {
	const { data, isLoading, isError, isSuccess, error, filters, updateFilters } = usePurchases({});
	const purchases = data?.purchases ?? [];
	const purchasesMatched = data?.purchasesMatched ?? 0;
	const hasActiveFilters =
		!!filters.search?.trim() ||
		filters.status.length > 0 ||
		!!filters.periodAfter ||
		!!filters.periodBefore ||
		filters.supplierIds.length > 0 ||
		filters.origins.length > 0 ||
		filters.valueMin != null ||
		filters.valueMax != null;

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex w-full flex-col gap-2">
				<div className="flex w-full flex-col-reverse items-center gap-2 lg:flex-row">
					<Input
						value={filters.search ?? ""}
						placeholder="Pesquisar por título, fornecedor ou nº da nota..."
						onChange={(event) => updateFilters({ search: event.target.value, page: 1 })}
						className="grow rounded-xl"
					/>
					{canCreate ? (
						<Button className="flex w-full items-center gap-2 lg:w-fit" size="sm" asChild>
							<Link href={appRoutes.newPurchase()}>
								<Plus className="h-4 w-4 min-h-4 min-w-4" />
								NOVA COMPRA
							</Link>
						</Button>
					) : null}
				</div>
				<PurchasesInlineFilters filters={filters} updateFilters={updateFilters} />
			</div>
			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={data?.totalPages ?? 0}
				pageSize={filters.pageSize}
				onPageSizeChange={(pageSize) => updateFilters({ pageSize, page: 1 })}
				itemsMatchedText={purchasesMatched === 1 ? "1 compra encontrada" : `${purchasesMatched} compras encontradas`}
				itemsShowingText={`mostrando ${purchases.length}`}
			/>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				purchases.length > 0 ? (
					<div className="flex w-full flex-col gap-3">
						{purchases.map((purchase) => (
							<PurchaseListCard key={purchase.id} purchase={purchase} />
						))}
					</div>
				) : hasActiveFilters ? (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ShoppingCart />
							</EmptyMedia>
							<EmptyTitle>Nenhuma compra com esses filtros</EmptyTitle>
							<EmptyDescription>Ajuste a busca ou os filtros para ver outras compras.</EmptyDescription>
						</EmptyHeader>
						<EmptyContent className="flex-row justify-center gap-2">
							<Button variant="outline" onClick={() => updateFilters({ ...DEFAULT_PURCHASES_FILTERS, pageSize: filters.pageSize })}>
								LIMPAR FILTROS
							</Button>
						</EmptyContent>
					</Empty>
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ShoppingCart />
							</EmptyMedia>
							<EmptyTitle>Nenhuma compra ainda</EmptyTitle>
							<EmptyDescription>Registre a primeira compra a partir de uma nota recebida ou digitando os itens.</EmptyDescription>
						</EmptyHeader>
						{canCreate ? (
							<EmptyContent className="flex-row justify-center gap-2">
								<Button asChild>
									<Link href={appRoutes.newPurchase()}>CRIAR NOVA COMPRA</Link>
								</Button>
							</EmptyContent>
						) : null}
					</Empty>
				)
			) : null}
		</div>
	);
}
