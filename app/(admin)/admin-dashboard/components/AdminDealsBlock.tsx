"use client";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Input } from "@/components/ui/input";
import { useAdminDeals } from "@/lib/queries/deals";
import { useQueryClient } from "@tanstack/react-query";
import AdminDealRow from "./AdminDealRow";

export default function AdminDealsBlock() {
	const queryClient = useQueryClient();
	const { data, isLoading, error, queryKey, params, updateParams } = useAdminDeals();

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey });

	const deals = data?.deals;

	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<h2 className="text-lg font-semibold tracking-tight uppercase">Deals Personalizados</h2>
				<Input
					value={params.search ?? ""}
					onChange={(e) => updateParams({ search: e.target.value, page: 1 })}
					placeholder="Buscar por nome ou email do obtentor..."
					className="w-full sm:w-72"
				/>
			</div>
			<GeneralPaginationComponent
				activePage={params.page}
				totalPages={data?.totalPages || 0}
				selectPage={(page) => updateParams({ page })}
				queryLoading={isLoading}
				pageSize={params.pageSize}
				onPageSizeChange={(pageSize) => updateParams({ pageSize, page: 1 })}
				itemsMatchedText={data?.dealsMatched === 1 ? "1 deal encontrado" : `${data?.dealsMatched || 0} deals encontrados`}
				itemsShowingText={`mostrando ${deals?.length || 0}`}
			/>
			{isLoading ? <LoadingComponent /> : null}
			{error ? <ErrorComponent msg="Erro ao carregar deals" /> : null}
			{deals ? (
				deals.length > 0 ? (
					<div className="flex w-full flex-col gap-2">
						{deals.map((deal) => (
							<AdminDealRow key={deal.id} deal={deal} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
						))}
					</div>
				) : (
					<div className="bg-card border-border flex w-full flex-col items-center justify-center gap-2 rounded-xl border p-8">
						<p className="text-sm text-foreground/60">Nenhum deal encontrado.</p>
					</div>
				)
			) : null}
		</div>
	);
}
