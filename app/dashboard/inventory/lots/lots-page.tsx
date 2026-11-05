"use client";

import type { TInventoryPermissions } from "@/lib/permissions/inventory";
import type { TGetProductStockLotsDefaultInput, TGetProductStockLotsOutputDefault } from "@/app/api/products/stock-lots/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import DiscardStockLot from "@/components/Modals/Internal/StockLots/DiscardStockLot";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import { useProductStockLots } from "@/lib/queries/product-stock-lots";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCheck, Factory, PackageSearch, PackageX, Printer, ShoppingCart, Trash2 } from "lucide-react";
import { useState } from "react";

const STOCK_LOT_STATUS_CONFIG = {
	ATIVO: {
		label: "ATIVO",
		icon: <CheckCheck className="h-4 w-4 min-h-4 min-w-4 text-green-600" />,
		className: "bg-green-200 text-green-600",
	},
	ESGOTADO: {
		label: "ESGOTADO",
		icon: <PackageX className="h-4 w-4 min-h-4 min-w-4 text-gray-600" />,
		className: "bg-gray-200 text-gray-600",
	},
	VENCIDO: {
		label: "VENCIDO",
		icon: <AlertTriangle className="h-4 w-4 min-h-4 min-w-4 text-red-600" />,
		className: "bg-red-200 text-red-600",
	},
	DESCARTADO: {
		label: "DESCARTADO",
		icon: <Trash2 className="h-4 w-4 min-h-4 min-w-4 text-yellow-600" />,
		className: "bg-yellow-200 text-yellow-600",
	},
} as const;

const STOCK_LOT_STATUS_FILTERS: {
	label: string;
	status: TGetProductStockLotsDefaultInput["status"];
	dueInDays: TGetProductStockLotsDefaultInput["dueInDays"];
}[] = [
	{ label: "TODOS", status: [], dueInDays: null },
	{ label: "ATIVOS", status: ["ATIVO"], dueInDays: null },
	{ label: "VENCENDO EM 7 DIAS", status: ["ATIVO"], dueInDays: 7 },
	{ label: "VENCIDOS", status: ["VENCIDO"], dueInDays: null },
	{ label: "ESGOTADOS", status: ["ESGOTADO"], dueInDays: null },
	{ label: "DESCARTADOS", status: ["DESCARTADO"], dueInDays: null },
];

function isStockLotFilterActive(filters: TGetProductStockLotsDefaultInput, filter: (typeof STOCK_LOT_STATUS_FILTERS)[number]) {
	return JSON.stringify(filters.status ?? []) === JSON.stringify(filter.status) && (filters.dueInDays ?? null) === (filter.dueInDays ?? null);
}

export default function StockLotsPage({ permissions }: { permissions: TInventoryPermissions }) {
	const queryClient = useQueryClient();
	const [discardingStockLot, setDiscardingStockLot] = useState<TGetProductStockLotsOutputDefault["stockLots"][number] | null>(null);
	const query = useProductStockLots({
		initialFilters: { page: 1, search: "", status: [], productId: null, productVariantId: null, dueInDays: null },
	});

	const handleStockLotsOnMutate = async () => await queryClient.cancelQueries({ queryKey: query.queryKey });
	const handleStockLotsOnSettled = async () => await queryClient.invalidateQueries({ queryKey: ["product-stock-lots"] });

	const stockLots = query.data?.stockLots ?? [];
	const stockLotsMatched = query.data?.stockLotsMatched ?? 0;
	const totalPages = query.data?.totalPages ?? 0;

	return (
		<div className="flex w-full flex-col gap-3">
			<Input
				value={query.filters.search ?? ""}
				placeholder="Pesquisar lote..."
				onChange={(event) => query.updateFilters({ search: event.target.value, page: 1 })}
				className="grow rounded-xl"
			/>
			<div className="flex w-full flex-wrap items-center gap-1.5">
				{STOCK_LOT_STATUS_FILTERS.map((filter) => (
					<Button
						key={filter.label}
						variant={isStockLotFilterActive(query.filters, filter) ? "default" : "ghost"}
						size="fit"
						className="rounded-lg px-2 py-1 text-xs"
						onClick={() => query.updateFilters({ status: filter.status, dueInDays: filter.dueInDays, page: 1 })}
					>
						{filter.label}
					</Button>
				))}
			</div>

			<GeneralPaginationComponent
				activePage={query.filters.page}
				queryLoading={query.isLoading}
				selectPage={(page) => query.updateFilters({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={stockLotsMatched === 1 ? "1 lote encontrado." : `${stockLotsMatched} lotes encontrados.`}
				itemsShowingText={stockLots.length === 1 ? "Mostrando 1 lote." : `Mostrando ${stockLots.length} lotes.`}
			/>

			{query.isLoading ? <LoadingComponent /> : null}
			{query.isError ? <ErrorComponent msg={getErrorMessage(query.error)} /> : null}

			{query.isSuccess && stockLots.length > 0
				? stockLots.map((stockLot) => (
						<StockLotCard
							key={stockLot.id}
							stockLot={stockLot}
				onPrint={() => window.open(`${appRoutes.inventory.lotLabelsPreview()}?ids=${stockLot.id}`, "_blank", "noopener,noreferrer")}
							onDiscard={permissions.ajustar ? () => setDiscardingStockLot(stockLot) : undefined}
						/>
					))
				: null}

			{query.isSuccess && stockLots.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<PackageSearch />
						</EmptyMedia>
						<EmptyTitle>{query.filters.search ? "Nenhum lote corresponde à busca" : "Nenhum lote encontrado"}</EmptyTitle>
						<EmptyDescription>
							{query.filters.search
								? "Revise o termo pesquisado ou limpe a busca para ver todos os lotes."
								: "Lotes serão gerados por compras e produções de produtos com rastreamento de estoque ativo."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent />
				</Empty>
			) : null}

			{discardingStockLot ? (
				<DiscardStockLot
					stockLot={discardingStockLot}
					closeModal={() => setDiscardingStockLot(null)}
					callbacks={{ onMutate: handleStockLotsOnMutate, onSettled: handleStockLotsOnSettled }}
				/>
			) : null}
		</div>
	);
}

type StockLotCardProps = {
	stockLot: TGetProductStockLotsOutputDefault["stockLots"][number];
	onPrint: () => void;
	// Ausente = membro sem `estoque.ajustar`: o botão não aparece.
	onDiscard?: () => void;
};

function StockLotCard({ stockLot, onPrint, onDiscard }: StockLotCardProps) {
	const statusConfig = STOCK_LOT_STATUS_CONFIG[stockLot.statusEfetivo as keyof typeof STOCK_LOT_STATUS_CONFIG] ?? STOCK_LOT_STATUS_CONFIG.ATIVO;
	const productName = stockLot.produtoVariante?.nome ?? stockLot.produto?.nome ?? "Produto sem nome";
	const productCode = stockLot.produtoVariante?.codigo ?? stockLot.produto?.codigo ?? null;
	const canDiscard = stockLot.quantidadeAtual > 0 && stockLot.statusEfetivo !== "DESCARTADO" && stockLot.statusEfetivo !== "ESGOTADO";
	const validityTone =
		stockLot.statusEfetivo === "VENCIDO"
			? "text-destructive"
			: stockLot.diasAteValidade != null && stockLot.diasAteValidade <= 7
				? "text-yellow-700"
				: "text-muted-foreground";

	return (
		<div className="bg-card border-border flex w-full flex-col gap-1.5 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex w-full flex-col items-start justify-between gap-2 lg:flex-row lg:items-center">
				<div className="min-w-0">
					<h1 className="text-xs font-bold tracking-tight lg:text-sm">{productName}</h1>
					<p className="line-clamp-1 text-[0.65rem] text-muted-foreground">
						{stockLot.codigoLote ? `Lote ${stockLot.codigoLote}` : "Lote sem código"}
						{productCode ? ` · Código ${productCode}` : ""}
					</p>
				</div>
				<div className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1", statusConfig.className)}>
					{statusConfig.icon}
					<span className="text-xs font-medium uppercase tracking-tight">{statusConfig.label}</span>
				</div>
			</div>

			<div className="flex w-full flex-col items-start justify-between gap-2 lg:flex-row lg:items-center">
				<div className="flex flex-wrap items-center gap-2">
					<div className="flex items-center gap-1">
						<PackageX className="h-4 w-4 min-h-4 min-w-4" />
						<span className="text-[0.65rem] font-medium uppercase tracking-tight text-muted-foreground">
							SALDO: {stockLot.quantidadeAtual} / {stockLot.quantidadeInicial}
						</span>
					</div>
					<div className="flex items-center gap-1">
						<CalendarClock className={cn("h-4 w-4 min-h-4 min-w-4", validityTone)} />
						<span className={cn("text-[0.65rem] font-medium uppercase tracking-tight", validityTone)}>
							VALIDADE: {stockLot.dataValidade ? formatDateAsLocale(stockLot.dataValidade, false) : "SEM VALIDADE"}
						</span>
					</div>
					<div className="flex items-center gap-1">
						<Factory className="h-4 w-4 min-h-4 min-w-4" />
						<span className="text-[0.65rem] font-medium uppercase tracking-tight text-muted-foreground">
							PRODUÇÃO: {stockLot.producao?.titulo ?? "SEM PRODUÇÃO"}
						</span>
					</div>
					<div className="flex items-center gap-1">
						<ShoppingCart className="h-4 w-4 min-h-4 min-w-4" />
						<span className="text-[0.65rem] font-medium uppercase tracking-tight text-muted-foreground">
							COMPRA: {stockLot.compra?.titulo ?? "SEM COMPRA"}
						</span>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button variant="ghost-default" size="xs" onClick={onPrint}>
						<Printer className="h-4 w-4" />
						IMPRIMIR
					</Button>
					{canDiscard && onDiscard ? (
						<Button variant="ghost-destructive" size="xs" onClick={onDiscard}>
							<Trash2 className="h-4 w-4" />
							DESCARTAR
						</Button>
					) : null}
				</div>
			</div>

			{stockLot.statusEfetivo === "VENCIDO" ? (
				<div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
					<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
					<span>Este lote está vencido e deve ser retirado do fluxo de consumo.</span>
				</div>
			) : null}
		</div>
	);
}
