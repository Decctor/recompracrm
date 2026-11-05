"use client";

import { toast } from "sonner";
import type { TInventoryPermissions } from "@/lib/permissions/inventory";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import ConfirmStockRecount from "@/components/Modals/Internal/StockRecount/ConfirmStockRecount";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { appRoutes } from "@/lib/navigation/routes";
import { useStockRecountRows } from "@/lib/queries/stock-recount";
import { useStockRecountDraft } from "@/state-hooks/use-stock-recount-draft";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Boxes, ClipboardList, PackageSearch } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import RecountTable from "./_components/RecountTable";

type RecountPageProps = {
	organizationId: string;
	permissions: TInventoryPermissions;
};

export default function RecountPage({ organizationId, permissions }: RecountPageProps) {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, isSuccess, error, filters, updateFilters } = useStockRecountRows({});
	const draft = useStockRecountDraft({ organizationId });
	const [confirmMenuIsOpen, setConfirmMenuIsOpen] = useState(false);

	const rows = data?.rows ?? [];
	const productsMatched = data?.productsMatched ?? 0;
	const totalPages = data?.totalPages ?? 0;

	function handleRecountApplied() {
		draft.discardAll();
		queryClient.invalidateQueries({ queryKey: ["stock-recount-rows"] });
		queryClient.invalidateQueries({ queryKey: ["stock-recount-balances"] });
		queryClient.invalidateQueries({ queryKey: ["products-stock"] });
		queryClient.invalidateQueries({ queryKey: ["products"] });
		queryClient.invalidateQueries({ queryKey: ["product-stock-transactions"] });
		queryClient.invalidateQueries({ queryKey: ["product-by-id"] });
	}

	return (
		<div className="flex w-full flex-col gap-4">
			{/* Cabeçalho — o que esta tela faz e o estado do rascunho */}
			<div className="flex w-full flex-col gap-1">
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="text-xl font-bold tracking-tight">Recontagem de estoque</h1>
					{draft.isDirty ? (
						<span className="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold tabular-nums">
							{draft.count === 1 ? "1 item contado" : `${draft.count} itens contados`}
						</span>
					) : null}
				</div>
				<p className="text-muted-foreground text-sm">
					Informe a quantidade física contada de cada item; ao aplicar, o sistema calcula a diferença e registra o ajuste de estoque. O rascunho fica salvo
					neste navegador e cobre todas as páginas.
				</p>
			</div>

			{/* Toolbar — busca e atalhos do módulo */}
			<div className="flex w-full flex-col-reverse items-stretch gap-2 lg:flex-row lg:items-center">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar produto por nome ou código..."
					onChange={(e) => updateFilters({ search: e.target.value, page: 1 })}
					className="grow rounded-xl"
				/>
				<Button variant="outline" size="sm" className="shrink-0" asChild>
					<Link href={appRoutes.inventory.root()}>
						<Boxes className="h-4 w-4 min-h-4 min-w-4" />
						VISÃO GERAL
					</Link>
				</Button>
				<Button variant="outline" size="sm" className="shrink-0" asChild>
					<Link href={appRoutes.inventory.movements()}>
						<ArrowLeftRight className="h-4 w-4 min-h-4 min-w-4" />
						TRANSAÇÕES
					</Link>
				</Button>
			</div>

			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={productsMatched === 1 ? "1 produto encontrado." : `${productsMatched} produtos encontrados.`}
				itemsShowingText={rows.length === 1 ? "Mostrando 1 item." : `Mostrando ${rows.length} itens.`}
			/>

			{isLoading ? (
				<div className="flex flex-col gap-2">
					{Array.from({ length: 8 }).map((_, index) => (
						<Skeleton key={index} className="h-12 w-full rounded-lg" />
					))}
				</div>
			) : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}

			{isSuccess && rows.length > 0 ? <RecountTable rows={rows} draft={draft} /> : null}

			{isSuccess && rows.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<PackageSearch />
						</EmptyMedia>
						<EmptyTitle>{filters.search ? "Nenhum produto corresponde à busca" : "Nenhum produto com rastreamento de estoque ativo"}</EmptyTitle>
						<EmptyDescription>
							{filters.search
								? "Revise o termo pesquisado ou limpe a busca para ver todos os produtos recontáveis."
								: "Ative o rastreamento de estoque no cadastro dos produtos (ou de suas variantes) para poder recontá-los aqui."}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : null}

			<SectionApplyBar
				isDirty={draft.isDirty}
				isPending={false}
				message={
					draft.count === 1 ? "1 item contado no rascunho — cobre todas as páginas" : `${draft.count} itens contados no rascunho — cobre todas as páginas`
				}
				applyButtonText="APLICAR RECONTAGEM"
				// Sem `estoque.ajustar` o rascunho continua possível (conferência), mas aplicar fica com quem pode ajustar.
				onApply={() => (permissions.ajustar ? setConfirmMenuIsOpen(true) : toast.error("Você não possui permissão para aplicar a recontagem."))}
				onDiscard={draft.discardAll}
			/>

			{confirmMenuIsOpen ? (
				<ConfirmStockRecount
					entries={draft.entriesList}
					clearEntry={draft.clearEntry}
					closeModal={() => setConfirmMenuIsOpen(false)}
					callbacks={{ onSuccess: handleRecountApplied }}
				/>
			) : null}

			{/* Nota de escopo — recontagem ajusta o saldo do produto/variante; lotes não são reconciliados */}
			{draft.isDirty ? null : (
				<p className="text-muted-foreground flex items-center gap-1.5 text-xs">
					<ClipboardList className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
					Cada ajuste aplicado gera uma movimentação de estoque do tipo AJUSTE com o motivo informado.
				</p>
			)}
		</div>
	);
}
