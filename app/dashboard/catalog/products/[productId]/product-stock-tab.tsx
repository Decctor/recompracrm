"use client";

import StockTransactionRow from "@/app/dashboard/inventory/movements/_components/StockTransactionRow";
import type { TGetProductsOutput } from "@/app/api/products/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import NewStockTransaction from "@/components/Modals/StockTransactions/NewStockTransaction";
import { Button } from "@/components/ui/button";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import type { TProductStockAnalytics } from "@/app/api/products/stock-analytics/route";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import SegmentedControl from "@/components/Utils/SegmentedControl";
import { formatDateAsLocale, formatDecimalPlaces } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { type TProductStockAnalyticsPeriod, useProductStockAnalytics } from "@/lib/queries/product-stock-analytics";
import { formatDayMonth, formatDays } from "@/lib/stock/analytics/format";
import { useProductStockLots } from "@/lib/queries/product-stock-lots";
import { useProductStockTransactions } from "@/lib/queries/product-stock-transactions";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangle,
	ArrowLeftRight,
	ArrowRight,
	Boxes,
	CalendarClock,
	ChartPie,
	CheckCheck,
	History,
	Layers,
	PackageX,
	Plus,
	RefreshCw,
	TrendingDown,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import StockDeductionModeSection from "./_components/StockDeductionModeSection";
import { AbcPositionCard } from "./_components/stock/abc-position-card";
import { CostPriceChart } from "./_components/stock/cost-price-chart";
import { ReorderPointCard } from "./_components/stock/reorder-point-card";
import { StockEventChart } from "./_components/stock/stock-event-chart";

type Product = NonNullable<TGetProductsOutput["data"]["byId"]>;

type ProductStockTabProps = {
	product: Product;
	enabled?: boolean;
};

// Mesmas faixas de saldo usadas nas páginas de Estoque e Produtos.
function getSaldoTone(quantidade: number) {
	if (quantidade <= 0) return "bg-red-500 text-white dark:bg-red-600";
	if (quantidade <= 10) return "bg-yellow-500 text-white dark:bg-yellow-600";
	if (quantidade <= 50) return "bg-green-500 text-white dark:bg-green-600";
	return "bg-blue-500 text-white dark:bg-blue-600";
}

export default function ProductStockTab({ product, enabled = true }: ProductStockTabProps) {
	const variantesRastreadas = (product.variantes ?? []).filter((variante) => variante.rastreamentoEstoqueAtivo);
	const rastreamentoAtivo = product.rastreamentoEstoqueAtivo || variantesRastreadas.length > 0;

	if (!rastreamentoAtivo) {
		return (
			<div className="flex w-full flex-col gap-4">
				<StockDeductionModeSection
					productId={product.id}
					baixaEstoqueModo={product.baixaEstoqueModo}
					fichaTecnicaReceitaId={product.fichaTecnicaReceitaId}
				/>
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Boxes />
						</EmptyMedia>
						<EmptyTitle>Rastreamento de estoque desativado</EmptyTitle>
						<EmptyDescription>
							Ative o rastreamento de estoque no cadastro deste produto para acompanhar saldo, lotes e o histórico de movimentações.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return <TrackedProductStock product={product} variantesRastreadas={variantesRastreadas} enabled={enabled} />;
}

const PERIOD_OPTIONS: { value: TProductStockAnalyticsPeriod; label: string }[] = [
	{ value: 7, label: "7 dias" },
	{ value: 30, label: "30 dias" },
	{ value: 90, label: "90 dias" },
];

function TrackedProductStock({
	product,
	variantesRastreadas,
	enabled,
}: {
	product: Product;
	variantesRastreadas: NonNullable<Product["variantes"]>;
	enabled: boolean;
}) {
	const [period, setPeriod] = useState<TProductStockAnalyticsPeriod>(30);
	const { data: analytics, isLoading, error } = useProductStockAnalytics({ productId: product.id, period, enabled });
	// O saldo do painel soma produto e variantes rastreadas; enquanto carrega, o do próprio produto.
	const saldo = analytics?.produto.saldo ?? product.quantidade ?? 0;

	return (
		<div className="flex w-full flex-col gap-4 text-sm">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-1.5">
						<Boxes className="h-4 w-4 min-h-4 min-w-4" />
						<span className="text-xs font-bold uppercase tracking-wide">SALDO ATUAL</span>
					</div>
					<span className={cn("inline-flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1 text-lg font-bold tabular-nums", getSaldoTone(saldo))}>
						<Boxes className="h-4 w-4 min-h-4 min-w-4" />
						{formatDecimalPlaces(saldo)} {product.unidade}
					</span>
				</div>
				<SegmentedControl aria-label="Período da análise de estoque" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
			</div>

			{variantesRastreadas.length > 0 ? (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
					{variantesRastreadas.map((variante) => {
						const varianteSaldo = variante.quantidade ?? 0;
						return (
							<div key={variante.id} className="border-border flex flex-col gap-1 rounded-lg border px-2.5 py-2">
								<span className="truncate text-xs font-bold tracking-tight" title={variante.nome}>
									{variante.nome}
								</span>
								<span
									className={cn("inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums", getSaldoTone(varianteSaldo))}
								>
									{formatDecimalPlaces(varianteSaldo)} {product.unidade}
								</span>
							</div>
						);
					})}
				</div>
			) : null}

			{isLoading ? (
				<div className="flex flex-col gap-4">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
						{Array.from({ length: 4 }).map((_, index) => (
							<Skeleton key={index} className="h-[88px] w-full rounded-xl" />
						))}
					</div>
					<Skeleton className="h-[420px] w-full rounded-xl" />
				</div>
			) : null}
			{error ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{analytics ? <StockAnalyticsOverview analytics={analytics} period={period} /> : null}

			<CostPriceChart productId={product.id} unit={product.unidade} enabled={enabled} />
			<ProductLotsSection productId={product.id} />
			<ProductTransactionsSection product={product} enabled={enabled} />
			{/* Configuração, não análise: fica no fim da aba. */}
			<StockDeductionModeSection
				productId={product.id}
				baixaEstoqueModo={product.baixaEstoqueModo}
				fichaTecnicaReceitaId={product.fichaTecnicaReceitaId}
			/>
		</div>
	);
}

function StockAnalyticsOverview({ analytics, period }: { analytics: TProductStockAnalytics; period: TProductStockAnalyticsPeriod }) {
	const { kpis, reposicao, abc, produto } = analytics;
	const unit = produto.unidade.toLowerCase();
	const periodLabel = `${period} dias`;
	const perDay = (value: number) => `${formatDecimalPlaces(value, 0, 1)}/dia`;

	return (
		<>
			{reposicao.abaixoPontoPedido ? (
				<div className="border-warning/40 bg-warning-surface text-warning-surface-foreground flex w-full items-center gap-2.5 rounded-xl border p-3">
					<AlertTriangle className="size-4 shrink-0" />
					<p className="flex-1 text-pretty text-xs font-medium">
						Saldo abaixo do ponto de pedido ({formatDecimalPlaces(reposicao.pontoPedido)} {unit}). No ritmo atual de{" "}
						{formatDecimalPlaces(kpis.consumoMedioDia, 0, 1)} {unit}
						/dia, o estoque zera em cerca de {formatDecimalPlaces(kpis.coberturaDias ?? 0, 0, 0)} dias
						{reposicao.rupturaPrevista != null ? `, por volta de ${formatDayMonth(reposicao.rupturaPrevista)}` : ""}. Sugestão de compra:{" "}
						<b>
							{formatDecimalPlaces(reposicao.sugestao)} {unit}
						</b>
						.
					</p>
					<Link href={appRoutes.newPurchase()} className="flex items-center gap-1 whitespace-nowrap text-xs font-bold">
						NOVA COMPRA
						<ArrowRight className="size-3.5" />
					</Link>
				</div>
			) : null}

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<StatUnitCard
					variant="horizontal"
					title="Cobertura"
					subtitle="Saldo atual ÷ consumo médio diário"
					icon={<CalendarClock />}
					current={{ value: kpis.coberturaDias ?? 0, format: () => formatDays(kpis.coberturaDias, { cap: 365 }) }}
				/>
				<StatUnitCard
					variant="horizontal"
					title="Consumo médio"
					subtitle="Saídas dos últimos 30 dias, sem vendas atípicas"
					icon={<TrendingDown />}
					current={{ value: kpis.consumoMedioDia, format: perDay }}
					previous={{ value: kpis.consumoMedioAnterior, format: (value) => `${formatDecimalPlaces(value, 0, 1)} ${unit}/dia` }}
					previousLabel="NOS 30 DIAS ANTERIORES"
				/>
				<StatUnitCard
					variant="horizontal"
					title={`Giro (${periodLabel})`}
					subtitle="Saídas no período ÷ saldo médio"
					icon={<RefreshCw />}
					current={{ value: kpis.giro ?? 0, format: () => (kpis.giro != null ? `${formatDecimalPlaces(kpis.giro, 0, 1)}×` : "—") }}
				/>
				<StatUnitCard
					variant="horizontal"
					title="Classe ABC"
					subtitle={
						abc.posicao != null && abc.faturamento > 0 ? `${abc.posicao}º de ${abc.totalProdutos} em faturamento` : `Sem vendas nos últimos ${periodLabel}`
					}
					icon={<ChartPie />}
					current={{ value: 0, format: () => abc.classe }}
				/>
			</div>

			<StockEventChart analytics={analytics} />

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<ReorderPointCard analytics={analytics} />
				<AbcPositionCard analytics={analytics} periodLabel={periodLabel} />
			</div>
		</>
	);
}

function SectionHeader({ icon: Icon, title, children }: { icon: typeof Layers; title: string; children?: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<div className="flex items-center gap-1.5">
				<Icon className="text-muted-foreground h-4 w-4 min-h-4 min-w-4" />
				<h2 className="text-xs font-bold uppercase tracking-wide">{title}</h2>
			</div>
			{children}
		</div>
	);
}

function ProductLotsSection({ productId }: { productId: string }) {
	const { data, isLoading, isError, isSuccess, error } = useProductStockLots({
		initialFilters: { productId, status: ["ATIVO"] },
	});
	const lots = data?.stockLots ?? [];

	return (
		<div className="flex w-full flex-col gap-2">
			<SectionHeader icon={Layers} title="Lotes ativos">
				{isSuccess && data ? (
					<span className="text-muted-foreground text-[0.65rem] font-semibold">
						{data.stockLotsMatched === 1 ? "1 lote" : `${data.stockLotsMatched} lotes`}
					</span>
				) : null}
			</SectionHeader>

			{isLoading ? (
				<div className="flex flex-col gap-2">
					{Array.from({ length: 2 }).map((_, index) => (
						<Skeleton key={index} className="h-12 w-full rounded-xl" />
					))}
				</div>
			) : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}

			{isSuccess && lots.length > 0 ? (
				<div className="flex flex-col gap-2">
					{lots.map((lot) => (
						<ProductLotLine key={lot.id} lot={lot} />
					))}
				</div>
			) : null}

			{isSuccess && lots.length === 0 ? (
				<div className="border-border text-muted-foreground flex items-center gap-2 rounded-xl border border-dashed px-3 py-4 text-xs">
					<PackageX className="h-4 w-4 min-h-4 min-w-4" />
					Nenhum lote ativo para este produto.
				</div>
			) : null}
		</div>
	);
}

type StockLot = NonNullable<ReturnType<typeof useProductStockLots>["data"]>["stockLots"][number];

function ProductLotLine({ lot }: { lot: StockLot }) {
	const vencido = lot.statusEfetivo === "VENCIDO";
	const vencendo = lot.diasAteValidade != null && lot.diasAteValidade >= 0 && lot.diasAteValidade <= 7;
	const validityTone = vencido ? "text-destructive" : vencendo ? "text-yellow-700 dark:text-yellow-500" : "text-muted-foreground";

	return (
		<div className="bg-card border-border flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 shadow-2xs">
			<div className="flex items-center gap-2">
				{vencido ? (
					<AlertTriangle className="text-destructive h-4 w-4 min-h-4 min-w-4" />
				) : (
					<CheckCheck className="h-4 w-4 min-h-4 min-w-4 text-green-600" />
				)}
				<span className="text-sm font-bold tracking-tight">{lot.codigoLote ?? "Lote sem código"}</span>
				<span className="text-muted-foreground text-xs font-medium tabular-nums">
					{formatDecimalPlaces(lot.quantidadeAtual)}/{formatDecimalPlaces(lot.quantidadeInicial)}
				</span>
			</div>
			<div className={cn("inline-flex items-center gap-1 text-xs font-medium", validityTone)}>
				<CalendarClock className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
				{lot.dataValidade
					? vencido
						? `Vencido · ${formatDateAsLocale(lot.dataValidade, false)}`
						: `Vence ${formatDateAsLocale(lot.dataValidade, false)}`
					: "Sem validade"}
			</div>
		</div>
	);
}

function ProductTransactionsSection({ product, enabled }: { product: Product; enabled?: boolean }) {
	const queryClient = useQueryClient();
	const [newTransactionModalIsOpen, setNewTransactionModalIsOpen] = useState(false);
	const { data, isLoading, isError, isSuccess, error, filters, updateFilters } = useProductStockTransactions({
		initialFilters: { productId: product.id },
		enabled,
	});

	const transactions = data?.transactions ?? [];
	const transactionsMatched = data?.transactionsMatched ?? 0;
	const totalPages = data?.totalPages ?? 0;

	return (
		<div className="flex w-full flex-col gap-2">
			<SectionHeader icon={History} title="Movimentações recentes">
				<Button size="fit" variant="ghost" className="rounded-lg px-2 py-1 text-xs" onClick={() => setNewTransactionModalIsOpen(true)}>
					<Plus className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
					NOVA MOVIMENTAÇÃO
				</Button>
			</SectionHeader>

			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={transactionsMatched === 1 ? "1 movimentação registrada." : `${transactionsMatched} movimentações registradas.`}
				itemsShowingText={transactions.length === 1 ? "Mostrando 1 movimentação." : `Mostrando ${transactions.length} movimentações.`}
			/>

			{isLoading ? (
				<div className="flex flex-col gap-2">
					{Array.from({ length: 4 }).map((_, index) => (
						<Skeleton key={index} className="h-16 w-full rounded-xl" />
					))}
				</div>
			) : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}

			{isSuccess && transactions.length > 0
				? transactions.map((transaction) => <StockTransactionRow key={transaction.id} transaction={transaction} hideProduct />)
				: null}

			{isSuccess && transactions.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ArrowLeftRight />
						</EmptyMedia>
						<EmptyTitle>Nenhuma movimentação registrada</EmptyTitle>
						<EmptyDescription>
							Compras, vendas, produções e ajustes deste produto aparecerão aqui com o saldo antes e depois de cada movimento.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : null}

			{newTransactionModalIsOpen ? (
				<NewStockTransaction
					product={product}
					closeModal={() => setNewTransactionModalIsOpen(false)}
					callbacks={{
						onSuccess: () => {
							queryClient.invalidateQueries({ queryKey: ["product-stock-transactions"] });
							queryClient.invalidateQueries({ queryKey: ["product-stock-lots"] });
							queryClient.invalidateQueries({ queryKey: ["product-by-id", product.id] });
							queryClient.invalidateQueries({ queryKey: ["product-stock-analytics", product.id] });
							queryClient.invalidateQueries({ queryKey: ["product-price-cost-history", product.id] });
						},
					}}
				/>
			) : null}
		</div>
	);
}
