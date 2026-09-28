"use client";
import ProductSearchInput from "@/components/Inputs/ProductSearchInput";

import type { TGetProductsOutputStock } from "@/app/api/products/route";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import RecountProduct from "@/components/Modals/Internal/StockRecount/RecountProduct";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useProductsStock } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import { appRoutes } from "@/lib/navigation/routes";
import dayjs from "dayjs";
import {
	AlertTriangle,
	ArrowDownRight,
	ArrowLeftRight,
	ArrowUpRight,
	BadgeDollarSign,
	Boxes,
	CalendarClock,
	ClipboardList,
	Code,
	Diamond,
	Info,
	Layers,
	Package,
	PackageSearch,
	ShoppingCart,
	Tag,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type StockProduct = TGetProductsOutputStock["products"][number];

export default function StocksPage() {
	const queryClient = useQueryClient();
	const [recountingProductId, setRecountingProductId] = useState<string | null>(null);
	const {
		data: stock,
		isLoading,
		isError,
		isSuccess,
		error,
		filters,
		updateFilters,
	} = useProductsStock({
		initialFilters: {
			statsPeriodAfter: dayjs().startOf("month").toDate(),
			statsPeriodBefore: dayjs().endOf("month").toDate(),
			orderByField: "nome",
			orderByDirection: "asc",
		},
	});

	const products = stock?.products ?? [];
	const resumo = stock?.resumo;
	const productsShowing = products.length;
	const productsMatched = stock?.productsMatched ?? 0;
	const totalPages = stock?.totalPages ?? 0;

	return (
		<div className="flex w-full flex-col gap-4">
			{/* Resumo — visão geral do estoque no conjunto filtrado */}
			<div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<StatUnitCard
					title="Em estoque"
					subtitle={resumo ? `${formatDecimalPlaces(resumo.produtosComEstoque)} produtos com saldo` : "Unidades disponíveis"}
					icon={<Boxes className="h-4 w-4 min-h-4 min-w-4" />}
					current={{ value: resumo?.totalEmEstoque ?? 0, format: (n) => `${formatDecimalPlaces(n)} un` }}
				/>
				<StatUnitCard
					title="Valor imobilizado"
					subtitle="Saldo × custo unitário"
					icon={<BadgeDollarSign className="h-4 w-4 min-h-4 min-w-4" />}
					current={{ value: resumo?.valorImobilizado ?? 0, format: (n) => formatToMoney(n) }}
				/>
				<StatUnitCard
					title="Sem estoque"
					subtitle="Produtos zerados"
					icon={<AlertTriangle className="h-4 w-4 min-h-4 min-w-4" />}
					current={{ value: resumo?.produtosSemEstoque ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
				<StatUnitCard
					title="Lotes vencendo"
					subtitle="Ativos com validade em 7 dias"
					icon={<CalendarClock className="h-4 w-4 min-h-4 min-w-4" />}
					current={{ value: resumo?.lotesVencendo7Dias ?? 0, format: (n) => formatDecimalPlaces(n) }}
				/>
			</div>

			{/* Toolbar — busca, período da movimentação e atalho para lotes */}
			<div className="flex w-full flex-col-reverse items-stretch gap-2 lg:flex-row lg:items-center">
				<ProductSearchInput value={filters.search} onChange={(search, immediate) => updateFilters({ search }, immediate)} className="grow" />
				<DateIntervalInput
					label="Movimentação no período"
					labelClassName="hidden"
					className="hover:bg-accent hover:text-accent-foreground border-none shadow-none"
					value={{
						after: filters.statsPeriodAfter ? new Date(filters.statsPeriodAfter) : undefined,
						before: filters.statsPeriodBefore ? new Date(filters.statsPeriodBefore) : undefined,
					}}
					handleChange={(value) =>
						updateFilters({
							statsPeriodAfter: value.after ? new Date(value.after) : null,
							statsPeriodBefore: value.before ? new Date(value.before) : null,
							page: 1,
						})
					}
				/>
				<Button variant="outline" size="sm" className="shrink-0" asChild>
					<Link href={appRoutes.inventory.lots()}>
						<Layers className="h-4 w-4 min-h-4 min-w-4" />
						LOTES
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
				itemsShowingText={productsShowing === 1 ? "Mostrando 1 produto." : `Mostrando ${productsShowing} produtos.`}
			/>

			{isLoading ? (
				<div className="flex flex-col gap-2">
					{Array.from({ length: 6 }).map((_, index) => (
						<StockCardSkeleton key={index} />
					))}
				</div>
			) : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}

			{isSuccess && products.length > 0
				? products.map((product) => <StockProductCard key={product.id} product={product} onRecount={() => setRecountingProductId(product.id)} />)
				: null}

			{recountingProductId ? (
				<RecountProduct
					productId={recountingProductId}
					closeModal={() => setRecountingProductId(null)}
					callbacks={{
						onSuccess: () => {
							queryClient.invalidateQueries({ queryKey: ["products-stock"] });
							queryClient.invalidateQueries({ queryKey: ["product-stock-transactions"] });
							queryClient.invalidateQueries({ queryKey: ["stock-recount-rows"] });
						},
					}}
				/>
			) : null}

			{isSuccess && products.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<PackageSearch />
						</EmptyMedia>
						<EmptyTitle>{filters.search ? "Nenhum produto corresponde à busca" : "Nenhum produto encontrado"}</EmptyTitle>
						<EmptyDescription>
							{filters.search
								? "Revise o termo pesquisado ou limpe a busca para ver todos os produtos."
								: "Cadastre produtos e ative o rastreamento de estoque para acompanhar saldos e movimentações aqui."}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : null}
		</div>
	);
}

// Faixas de saldo → cor, alinhadas às faixas usadas na página de Produtos.
function getSaldoTone(quantidade: number) {
	if (quantidade <= 0) return "bg-red-500 text-white dark:bg-red-600";
	if (quantidade <= 10) return "bg-yellow-500 text-white dark:bg-yellow-600";
	if (quantidade <= 50) return "bg-green-500 text-white dark:bg-green-600";
	return "bg-blue-500 text-white dark:bg-blue-600";
}

type StockProductCardProps = {
	product: StockProduct;
	onRecount: () => void;
};
function StockProductCard({ product, onRecount }: StockProductCardProps) {
	const quantidade = product.quantidade ?? 0;
	const saldoTone = getSaldoTone(quantidade);
	const { entradas, saidas } = product.movimentacao;
	const loteAtivo = product.loteAtivo;

	return (
		<div className="group bg-card border-border hover:border-primary/40 flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs transition-colors duration-200 sm:flex-row sm:items-center">
			{/* Identidade do produto */}
			<div className="flex min-w-0 items-center gap-3 sm:w-72 sm:shrink-0">
				<div className="relative h-14 w-14 min-h-14 min-w-14 overflow-hidden rounded-lg">
					{product.imagemCapaUrl ? (
						<Image src={product.imagemCapaUrl} alt={product.nome} fill className="object-cover" />
					) : (
						<div className="bg-primary/10 text-primary flex h-full w-full items-center justify-center">
							<ShoppingCart className="h-5 w-5" />
						</div>
					)}
				</div>
				<div className="min-w-0">
					<h2 className="truncate text-sm font-bold tracking-tight">{product.nome}</h2>
					<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.65rem] font-medium text-foreground/70">
						<span className="inline-flex items-center gap-1">
							<Code className="h-3 w-3 min-h-3 min-w-3" />
							{product.codigo}
						</span>
						{product.grupo ? (
							<span className="inline-flex items-center gap-1">
								<Diamond className="h-3 w-3 min-h-3 min-w-3" />
								{product.grupo}
							</span>
						) : null}
					</div>
				</div>
			</div>

			{/* Métricas operacionais */}
			<div className="flex grow flex-wrap items-center gap-x-6 gap-y-3">
				<div className="flex flex-col gap-1">
					<MetricLabel>Saldo</MetricLabel>
					<span className={cn("inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold tabular-nums", saldoTone)}>
						<Package className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
						{formatDecimalPlaces(quantidade)} {product.unidade}
					</span>
				</div>

				<Metric label="Preço unit." icon={<Tag className="h-3.5 w-3.5" />}>
					{product.precoVenda ? formatToMoney(product.precoVenda) : "—"}
				</Metric>

				<Metric label="Custo unit." icon={<BadgeDollarSign className="h-3.5 w-3.5" />} muted>
					{product.precoCusto ? formatToMoney(product.precoCusto) : "—"}
				</Metric>

				<Metric label="Entradas" icon={<ArrowUpRight className="h-3.5 w-3.5 text-green-600" />} tone={entradas > 0 ? "text-green-600" : undefined}>
					{entradas > 0 ? `+${formatDecimalPlaces(entradas)}` : "0"}
				</Metric>

				<Metric label="Saídas" icon={<ArrowDownRight className="h-3.5 w-3.5 text-red-600" />} tone={saidas > 0 ? "text-red-600" : undefined}>
					{saidas > 0 ? `-${formatDecimalPlaces(saidas)}` : "0"}
				</Metric>

				<div className="flex flex-col gap-1">
					<MetricLabel>Lote ativo</MetricLabel>
					{loteAtivo ? (
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="inline-flex items-center gap-1 text-sm font-bold tracking-tight tabular-nums">
								<Layers className="h-3.5 w-3.5 min-h-3.5 min-w-3.5 text-muted-foreground" />
								{loteAtivo.codigoLote ?? "s/ código"}
								<span className="text-muted-foreground font-medium">
									· {formatDecimalPlaces(loteAtivo.quantidadeAtual)}/{formatDecimalPlaces(loteAtivo.quantidadeInicial)}
								</span>
							</span>
							<ValidityChip diasAteValidade={loteAtivo.diasAteValidade} dataValidade={loteAtivo.dataValidade} />
							{product.lotesAtivosCount > 1 ? (
								<span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold">+{product.lotesAtivosCount - 1}</span>
							) : null}
						</div>
					) : (
						<span className="text-muted-foreground text-xs font-medium">Sem lote ativo</span>
					)}
				</div>
			</div>

			{/* Ações */}
			<div className="flex shrink-0 items-center justify-end gap-1">
				<Button variant="ghost" size="sm" onClick={onRecount}>
					<ClipboardList className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
					RECONTAR
				</Button>
				<Button variant="ghost" size="sm" asChild>
					<Link href={appRoutes.catalog.product(product.id)}>
						<Info className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
						DETALHES
					</Link>
				</Button>
			</div>
		</div>
	);
}

function MetricLabel({ children }: { children: React.ReactNode }) {
	return <span className="text-muted-foreground text-[0.6rem] font-semibold uppercase tracking-wide">{children}</span>;
}

function Metric({
	label,
	icon,
	tone,
	muted,
	children,
}: {
	label: string;
	icon: React.ReactNode;
	tone?: string;
	muted?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<MetricLabel>{label}</MetricLabel>
			<span className={cn("inline-flex items-center gap-1 text-sm font-bold tracking-tight tabular-nums", muted && "text-muted-foreground", tone)}>
				{icon}
				{children}
			</span>
		</div>
	);
}

function ValidityChip({ diasAteValidade, dataValidade }: { diasAteValidade: number | null; dataValidade: Date | string | null }) {
	if (diasAteValidade == null) {
		return <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold">sem validade</span>;
	}
	const tone =
		diasAteValidade <= 7
			? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
			: diasAteValidade <= 30
				? "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
				: "bg-muted text-muted-foreground";
	return (
		<span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold", tone)}>
			<CalendarClock className="h-3 w-3 min-h-3 min-w-3" />
			{diasAteValidade <= 0 ? "vencido" : `vence em ${diasAteValidade}d`}
			<span className="opacity-70">· {dataValidade ? formatDateAsLocale(dataValidade, false) : ""}</span>
		</span>
	);
}

function StockCardSkeleton() {
	return (
		<div className="bg-card border-border flex w-full items-center gap-3 rounded-xl border px-3 py-3 shadow-2xs">
			<Skeleton className="h-14 w-14 min-h-14 min-w-14 rounded-lg" />
			<div className="flex grow flex-col gap-2">
				<Skeleton className="h-4 w-48" />
				<div className="flex flex-wrap gap-4">
					<Skeleton className="h-8 w-24" />
					<Skeleton className="h-8 w-20" />
					<Skeleton className="h-8 w-20" />
					<Skeleton className="h-8 w-40" />
				</div>
			</div>
		</div>
	);
}
