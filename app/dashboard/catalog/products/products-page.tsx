"use client";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import PlanRestrictionComponent from "@/components/Layouts/PlanRestrictionComponent";
import NewProduct from "@/components/Modals/Products/NewProduct";
import RecountProduct from "@/components/Modals/Internal/StockRecount/RecountProduct";
import ProductsAddOnsView from "@/app/dashboard/catalog/products/_components/ProductsAddOnsView";
import ProductsChannelsView from "@/app/dashboard/catalog/products/_components/channels/ProductsChannelsView";
import ProductsGraphs from "@/app/dashboard/catalog/products/_components/ProductsGraphs";
import ProductsInlineFilters from "@/app/dashboard/catalog/products/_components/ProductsInlineFilters";
import ProductsRanking from "@/app/dashboard/catalog/products/_components/ProductsRanking";
import ProductsPortfolioAnalysisSection from "@/app/dashboard/catalog/products/portfolio-analysis-section";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import ProductSearchInput from "@/components/Inputs/ProductSearchInput";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { useProducts, useProductsOverallStats } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import type { TGetProductsDefaultInput, TGetProductsOutputDefault } from "@/app/api/products/route";
import type { TGetProductsOverallStatsInput } from "@/app/api/products/stats/overall/route";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
	Activity,
	AlertCircle,
	AlertTriangle,
	BadgeDollarSign,
	ChevronDown,
	ChevronUp,
	ClipboardList,
	Code,
	Diamond,
	DollarSign,
	Info,
	Layers,
	Package,
	PencilIcon,
	Plus,
	RefreshCw,
	ShoppingCart,
	Store,
	TrendingUp,
	Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { type ReactNode, useState } from "react";

type ProductsPageProps = {
	user: TAuthUserSession["user"];
	userOrg: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	userMembership: NonNullable<TAuthUserSession["membership"]>;
};

export default function ProductsPage({ user, userOrg, userMembership }: ProductsPageProps) {
	const [viewMode, setViewMode] = useQueryState("view", parseAsStringEnum(["stats", "database", "add-ons", "channels"]));

	if (userOrg?.assinaturaPlano === "ESSENCIAL") {
		return (
			<PlanRestrictionComponent
				title="Recurso Exclusivo"
				message="Este recurso não está disponível no plano ESSENCIAL. Faça um upgrade para desbloquear todo o potencial."
			/>
		);
	}

	return (
		<div className="w-full h-full flex flex-col gap-3">
			<Tabs value={viewMode ?? "stats"} onValueChange={(v: string) => setViewMode(v as "stats" | "database" | "add-ons" | "channels")}>
				<TabsList variant="page">
					<TabsTrigger value="stats">
						<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />
						Estatísticas
					</TabsTrigger>
					<TabsTrigger value="database">
						<Users className="w-4 h-4 min-w-4 min-h-4" />
						Banco de Dados
					</TabsTrigger>
					<TabsTrigger value="add-ons">
						<Layers className="w-4 h-4 min-w-4 min-h-4" />
						Adicionais
					</TabsTrigger>
					<TabsTrigger value="channels">
						<Store className="w-4 h-4 min-w-4 min-h-4" />
						Canais
					</TabsTrigger>
				</TabsList>
				<TabsContent value="stats">
					<ProductsStatsView />
				</TabsContent>
				<TabsContent value="database">
					<ProductsDatabaseView user={user} userMembership={userMembership} organization={userOrg} />
				</TabsContent>
				<TabsContent value="add-ons">
					<ProductsAddOnsView />
				</TabsContent>
				<TabsContent value="channels">
					<ProductsChannelsView />
				</TabsContent>
			</Tabs>
		</div>
	);
}

type ProductsDatabaseViewProps = {
	user: TAuthUserSession["user"];
	userMembership: NonNullable<TAuthUserSession["membership"]>;
	organization: NonNullable<TAuthUserSession["membership"]>["organizacao"];
};
function ProductsDatabaseView({ user, userMembership, organization }: ProductsDatabaseViewProps) {
	const orgHasStockTracking = organization.configuracao.preferencias.rastreamentoEstoque;
	const queryClient = useQueryClient();
	const [newProductModalIsOpen, setNewProductModalIsOpen] = useState<boolean>(false);
	const [recountingProductId, setRecountingProductId] = useState<string | null>(null);
	const {
		data: productsResult,
		queryKey,
		isLoading,
		isError,
		isSuccess,
		error,
		filters,
		updateFilters,
	} = useProducts({
		initialFilters: {
			search: [],
			groups: [],
			statsPeriodAfter: dayjs().startOf("month").toDate(),
			statsPeriodBefore: dayjs().endOf("month").toDate(),
			statsIntegrationsIds: [],
			statsExcludedSalesIds: [],
			statsTotalMin: null,
			statsTotalMax: null,
			stockStatus: [],
			priceMin: null,
			priceMax: null,
			orderByField: "nome",
			orderByDirection: "asc",
		},
	});

	const products = productsResult?.products;
	const productsShowing = products ? products.length : 0;
	const productsMatched = productsResult?.productsMatched || 0;
	const totalPages = productsResult?.totalPages;

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey: queryKey });
	const handleOnSettled = async () => {
		await queryClient.invalidateQueries({ queryKey: queryKey });
		// Um produto novo pode ter estreado um grupo: o seletor de grupos precisa passar a oferecê-lo.
		await queryClient.invalidateQueries({ queryKey: ["product-groups"] });
	};

	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<ProductSearchInput value={filters.search} onChange={(search, immediate) => updateFilters({ search }, immediate)} className="grow" />
				<Button className="flex items-center gap-2" size="sm" onClick={() => setNewProductModalIsOpen(true)}>
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					NOVO PRODUTO
				</Button>
			</div>
			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={productsMatched > 0 ? `${productsMatched} produtos encontrados.` : `${productsMatched} produto encontrado.`}
				itemsShowingText={productsShowing > 0 ? `Mostrando ${productsShowing} produtos.` : `Mostrando ${productsShowing} produto.`}
			/>
			<ProductsInlineFilters filters={filters} updateFilters={updateFilters} />
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && products ? (
				products.length > 0 ? (
					products.map((product, index: number) => (
						<ProductCard
							key={product.id}
							product={product}
							periodAfter={filters.statsPeriodAfter}
							periodBefore={filters.statsPeriodBefore}
							showStockData={orgHasStockTracking}
							onRecount={() => setRecountingProductId(product.id)}
						/>
					))
				) : (
					<p className="w-full tracking-tight text-center">Nenhum produto encontrado.</p>
				)
			) : null}
			{newProductModalIsOpen ? (
				<NewProduct
					user={user}
					userMembership={userMembership}
					closeModal={() => setNewProductModalIsOpen(false)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
			{recountingProductId ? (
				<RecountProduct
					productId={recountingProductId}
					closeModal={() => setRecountingProductId(null)}
					callbacks={{
						onSuccess: () => {
							queryClient.invalidateQueries({ queryKey: queryKey });
							queryClient.invalidateQueries({ queryKey: ["products-stock"] });
							queryClient.invalidateQueries({ queryKey: ["product-stock-transactions"] });
							queryClient.invalidateQueries({ queryKey: ["stock-recount-rows"] });
						},
					}}
				/>
			) : null}
		</div>
	);
}

function ProductsStatsView() {
	const initialStartDate = dayjs().startOf("month");
	const initialEndDate = dayjs().endOf("month");
	const [filters, setFilters] = useState<TGetProductsOverallStatsInput>({
		periodAfter: initialStartDate.toDate(),
		periodBefore: initialEndDate.toDate(),
		comparingPeriodAfter: initialStartDate.subtract(1, "month").toDate(),
		comparingPeriodBefore: initialEndDate.subtract(1, "month").toDate(),
	});

	const { data: productsOverallStats, isLoading: productsOverallStatsLoading } = useProductsOverallStats({
		periodAfter: filters.periodAfter,
		periodBefore: filters.periodBefore,
		comparingPeriodAfter: filters.comparingPeriodAfter,
		comparingPeriodBefore: filters.comparingPeriodBefore,
	});

	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center justify-end">
				<DateIntervalInput
					label="Período"
					labelClassName="hidden"
					className="hover:bg-accent hover:text-accent-foreground border-none shadow-none"
					value={{
						after: filters.periodAfter ? new Date(filters.periodAfter) : undefined,
						before: filters.periodBefore ? new Date(filters.periodBefore) : undefined,
					}}
					handleChange={(value) =>
						setFilters((prev) => ({
							...prev,
							periodAfter: value.after ? new Date(value.after) : null,
							periodBefore: value.before ? new Date(value.before) : null,
							comparingPeriodAfter: value.after ? dayjs(value.after).subtract(1, "month").toDate() : null,
							comparingPeriodBefore: value.before ? dayjs(value.before).subtract(1, "month").toDate() : null,
						}))
					}
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="TOTAL DE PRODUTOS"
					icon={<Package className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: productsOverallStats?.totalProducts.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						productsOverallStats?.totalProducts.comparison
							? {
									value: productsOverallStats?.totalProducts.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="PRODUTOS ATIVOS"
					icon={<Activity className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: productsOverallStats?.activeProducts.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						productsOverallStats?.activeProducts.comparison
							? {
									value: productsOverallStats?.activeProducts.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="FATURAMENTO TOTAL"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: productsOverallStats?.totalRevenue.current || 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						productsOverallStats?.totalRevenue.comparison
							? {
									value: productsOverallStats?.totalRevenue.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="MARGEM MÉDIA"
					icon={<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: productsOverallStats?.averageMargin.current || 0,
						format: (n) => `${formatDecimalPlaces(n)}%`,
					}}
					previous={
						productsOverallStats?.averageMargin.comparison
							? {
									value: productsOverallStats?.averageMargin.comparison || 0,
									format: (n) => `${formatDecimalPlaces(n)}%`,
								}
							: undefined
					}
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="GIRO MÉDIO DE ESTOQUE"
					icon={<RefreshCw className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: productsOverallStats?.averageTurnoverDays.current || 0,
						format: (n) => `${formatDecimalPlaces(n)} dias`,
					}}
					previous={
						productsOverallStats?.averageTurnoverDays.comparison
							? {
									value: productsOverallStats?.averageTurnoverDays.comparison || 0,
									format: (n) => `${formatDecimalPlaces(n)} dias`,
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="PRODUTOS SEM ESTOQUE"
					icon={<AlertTriangle className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: productsOverallStats?.stockHealth.current?.outOfStock || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						productsOverallStats?.stockHealth.comparison
							? {
									value: productsOverallStats?.stockHealth.comparison?.outOfStock || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="PRODUTOS ESTOQUE BAIXO"
					icon={<AlertTriangle className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: productsOverallStats?.stockHealth.current?.lowStock || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						productsOverallStats?.stockHealth.comparison
							? {
									value: productsOverallStats?.stockHealth.comparison?.lowStock || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="ESTOQUE EM RISCO"
					icon={<AlertCircle className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: productsOverallStats?.atRiskInventory.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						productsOverallStats?.atRiskInventory.comparison
							? {
									value: productsOverallStats?.atRiskInventory.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3 h-[550px]">
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<ProductsGraphs periodAfter={filters.periodAfter} periodBefore={filters.periodBefore} />
				</div>
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<ProductsRanking
						periodAfter={filters.periodAfter}
						periodBefore={filters.periodBefore}
						comparingPeriodAfter={filters.comparingPeriodAfter}
						comparingPeriodBefore={filters.comparingPeriodBefore}
					/>
				</div>
			</div>
			<ProductsPortfolioAnalysisSection periodAfter={filters.periodAfter} periodBefore={filters.periodBefore} />
		</div>
	);
}

function ProductStatCell({ label, tooltip, children }: { label: string; tooltip?: ReactNode; children: ReactNode }) {
	const content = (
		<div className="flex min-w-0 flex-col items-start gap-1">
			<span className="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
			{children}
		</div>
	);

	if (!tooltip) return content;
	return (
		<Tooltip>
			<TooltipTrigger render={content} />
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	);
}

function ProductStatValue({ children, className }: { children: ReactNode; className?: string }) {
	if (children === null || children === undefined) {
		return <span className="text-sm font-semibold tracking-tight text-muted-foreground">—</span>;
	}
	return <span className={cn("text-sm font-semibold tracking-tight tabular-nums", className)}>{children}</span>;
}

function ProductCard({
	product,
	periodAfter,
	periodBefore,
	showStockData,
	onRecount,
}: {
	product: TGetProductsOutputDefault["products"][number];
	periodAfter: Date | null;
	periodBefore: Date | null;
	showStockData: boolean;
	onRecount: () => void;
}) {
	const [showMoreMetrics, setShowMoreMetrics] = useState(false);
	// Calculate stock status
	const quantidade = product.quantidade ?? 0;
	const getStockStatus = () => {
		if (quantidade === 0)
			return {
				status: "out",
				label: "SEM ESTOQUE",
				color: "bg-red-500 dark:bg-red-600 text-white",
			};
		if (quantidade <= 10)
			return {
				status: "low",
				label: `${quantidade} UN`,
				color: "bg-yellow-500 dark:bg-yellow-600 text-white",
			};
		if (quantidade <= 50)
			return {
				status: "healthy",
				label: `${quantidade} UN`,
				color: "bg-green-500 dark:bg-green-600 text-white",
			};
		return {
			status: "overstocked",
			label: `${quantidade} UN`,
			color: "bg-blue-500 dark:bg-blue-600 text-white",
		};
	};
	const stockStatus = getStockStatus();

	// Calculate turnover (days of stock remaining)
	const calculateTurnover = () => {
		const qtySold = product.estatisticas.vendasQtdeTotal;
		// If no sales in the period, we can't calculate turnover
		if (qtySold === 0) return null;

		// If no stock, return 0 days (product has no stock remaining)
		if (quantidade === 0) return { days: 0, isCapped: false };

		// Calculate days in period dynamically
		let daysInPeriod = 30; // Fallback to 30 days if period is not available
		if (periodAfter && periodBefore) {
			const diff = dayjs(periodBefore).diff(dayjs(periodAfter), "day") + 1; // +1 to include both start and end days
			if (diff > 0) {
				daysInPeriod = diff;
			}
		}

		const avgDailySales = qtySold / daysInPeriod;
		const daysOfStock = quantidade / avgDailySales;
		const roundedDays = Math.round(daysOfStock);

		// Cap at 365 days to keep display reasonable (anything over a year is problematic anyway)
		const isCapped = roundedDays > 365;
		return { days: Math.min(roundedDays, 365), isCapped };
	};
	const turnoverResult = calculateTurnover();
	const turnoverDays = turnoverResult?.days ?? null;

	const vendasQtde = product.estatisticas.vendasQtdeTotal;
	const vendasValor = product.estatisticas.vendasValorTotal;
	const vendasCusto = product.estatisticas.vendasCustoTotal;
	const hasSales = vendasQtde > 0;
	// Custo zerado quase sempre significa produto sem custo cadastrado no ERP — exibir "—" evita uma margem de 100% falsa
	const hasCost = vendasCusto > 0;
	const precoMedio = hasSales ? vendasValor / vendasQtde : null;
	const custoMedio = hasSales && hasCost ? vendasCusto / vendasQtde : null;
	const lucro = hasCost ? vendasValor - vendasCusto : null;
	const margem = hasCost && vendasValor > 0 ? ((vendasValor - vendasCusto) / vendasValor) * 100 : null;

	const noCostTooltip = "Sem custo registrado nas vendas do período. Verifique o preço de custo do produto.";
	const noSalesTooltip = "Sem vendas no período.";

	return (
		<div className={cn("bg-card border-border flex w-full flex-col sm:flex-row gap-2 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-start justify-center">
				<div className="relative h-16 max-h-16 min-h-16 w-16 max-w-16 min-w-16 overflow-hidden rounded-lg">
					{product.imagemCapaUrl ? (
						<Image src={product.imagemCapaUrl} alt="Imagem de capa do produto" fill={true} objectFit="cover" />
					) : (
						<div className="bg-primary/50 text-foreground-foreground flex h-full w-full items-center justify-center">
							<ShoppingCart className="h-6 w-6" />
						</div>
					)}
				</div>
			</div>
			<div className="flex flex-col grow gap-2">
				<div className="w-full flex items-start flex-col md:flex-row justify-between gap-2">
					<div className="flex flex-col gap-0.5">
						<div className="flex items-center gap-2 flex-wrap">
							<h1 className="text-xs font-bold tracking-tight lg:text-sm">{product.nome}</h1>
							<div className="flex items-center gap-1">
								<Code className="w-4 h-4 min-w-4 min-h-4" />
								<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic text-foreground/80">{product.codigo}</h1>
							</div>
							{product.grupo ? (
								<div className="flex items-center gap-1">
									<Diamond className="w-4 h-4 min-w-4 min-h-4" />
									<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic text-foreground/80">{product.grupo}</h1>
								</div>
							) : null}
						</div>
						<div className="flex items-center gap-1">
							<DollarSign className="w-4 h-4 min-w-4 min-h-4" />
							<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic text-foreground/80">
								{product.precoVenda ? `${formatToMoney(product.precoVenda)} / ${product.unidade}` : "PREÇO DE VENDA NÃO DEFINIDO"}
							</h1>
						</div>
					</div>
					<div className="flex items-center gap-1.5">
						{showStockData ? (
							<Button variant="ghost" className="flex items-center gap-1.5" size="sm" onClick={onRecount}>
								<ClipboardList className="w-3 min-w-3 h-3 min-h-3" />
								RECONTAR
							</Button>
						) : null}
						<Button variant="ghost" className="flex items-center gap-1.5" size="sm" asChild>
							<Link href={`${appRoutes.catalog.product(product.id)}?tab=cadastro`}>
								<PencilIcon className="w-3 min-w-3 h-3 min-h-3" />
								EDITAR
							</Link>
						</Button>
						<Button variant="link" className="flex items-center gap-1.5" size="sm" asChild>
							<Link href={appRoutes.catalog.product(product.id)}>
								<Info className="w-3 min-w-3 h-3 min-h-3" />
								DETALHES
							</Link>
						</Button>
					</div>
				</div>
				<TooltipProvider>
					<div
						className={cn(
							"grid w-full gap-x-2 gap-y-2 border-t border-border pt-2",
							showStockData ? "grid-cols-3 lg:grid-cols-6" : "grid-cols-2 lg:grid-cols-4",
						)}
					>
						{showStockData ? (
							<>
								<ProductStatCell label="Estoque" tooltip="Quantidade em estoque atual">
									<Chip.Root size="xs" shape="pill" className={cn(stockStatus.color)}>
										<Chip.Label caps weight="bold">
											{stockStatus.label}
										</Chip.Label>
									</Chip.Root>
								</ProductStatCell>
								<ProductStatCell
									label="Giro"
									tooltip={turnoverDays !== null ? "Dias de estoque restantes no ritmo de vendas do período" : "Sem vendas no período para calcular o giro."}
								>
									{turnoverDays !== null ? (
										<Chip.Root
											size="xs"
											shape="pill"
											className={cn({
												"bg-red-500 dark:bg-red-600 text-white": turnoverDays < 7,
												"bg-yellow-500 dark:bg-yellow-600 text-white": turnoverDays >= 7 && turnoverDays < 30,
												"bg-green-500 dark:bg-green-600 text-white": turnoverDays >= 30 && turnoverDays < 90,
												"bg-blue-500 dark:bg-blue-600 text-white": turnoverDays >= 90 && turnoverDays < 180,
												"bg-purple-500 dark:bg-purple-600 text-white": turnoverDays >= 180,
											})}
										>
											<Chip.Label caps weight="bold">
												{turnoverResult?.isCapped ? `${turnoverDays}+ dias` : `${turnoverDays} dias`}
											</Chip.Label>
										</Chip.Root>
									) : (
										<ProductStatValue>{null}</ProductStatValue>
									)}
								</ProductStatCell>
							</>
						) : null}
						<ProductStatCell
							label="Curva"
							tooltip={`Curva ABC: ${
								product.estatisticas.curvaABC === "A"
									? "80% do faturamento"
									: product.estatisticas.curvaABC === "B"
										? "15% do faturamento"
										: "5% do faturamento"
							}`}
						>
							<Chip.Root
								size="xs"
								shape="pill"
								className={cn({
									"bg-green-500 dark:bg-green-600 text-white": product.estatisticas.curvaABC === "A",
									"bg-yellow-500 dark:bg-yellow-600 text-white": product.estatisticas.curvaABC === "B",
									"bg-red-500 dark:bg-red-600 text-white": product.estatisticas.curvaABC === "C",
								})}
							>
								<Chip.Label caps weight="bold">
									{product.estatisticas.curvaABC}
								</Chip.Label>
							</Chip.Root>
						</ProductStatCell>
						<ProductStatCell label="Vendidos" tooltip="Quantidade total vendida no período">
							<ProductStatValue>{formatDecimalPlaces(vendasQtde)}</ProductStatValue>
						</ProductStatCell>
						<ProductStatCell label="Faturamento" tooltip="Faturamento total no período">
							<ProductStatValue>{formatToMoney(vendasValor)}</ProductStatValue>
						</ProductStatCell>
						<ProductStatCell
							label="Margem"
							tooltip={margem !== null ? "Margem bruta do período: (faturamento − custo) ÷ faturamento" : hasSales ? noCostTooltip : noSalesTooltip}
						>
							<ProductStatValue className={cn(margem !== null && margem < 0 && "text-red-600 dark:text-red-500")}>
								{margem !== null ? `${formatDecimalPlaces(margem)}%` : null}
							</ProductStatValue>
						</ProductStatCell>
					</div>
					{showMoreMetrics ? (
						<div className="grid w-full grid-cols-2 lg:grid-cols-5 gap-x-2 gap-y-2 rounded-lg bg-muted/40 p-2">
							<ProductStatCell label="Preço médio" tooltip={precoMedio !== null ? "Faturamento ÷ quantidade vendida no período" : noSalesTooltip}>
								<ProductStatValue>{precoMedio !== null ? formatToMoney(precoMedio) : null}</ProductStatValue>
							</ProductStatCell>
							<ProductStatCell
								label="Custo médio"
								tooltip={custoMedio !== null ? "Custo total ÷ quantidade vendida no período" : hasSales ? noCostTooltip : noSalesTooltip}
							>
								<ProductStatValue>{custoMedio !== null ? formatToMoney(custoMedio) : null}</ProductStatValue>
							</ProductStatCell>
							<ProductStatCell label="Custo total" tooltip={hasCost ? "Custo dos itens vendidos no período" : hasSales ? noCostTooltip : noSalesTooltip}>
								<ProductStatValue>{hasCost ? formatToMoney(vendasCusto) : null}</ProductStatValue>
							</ProductStatCell>
							<ProductStatCell label="Lucro" tooltip={lucro !== null ? "Faturamento − custo no período" : hasSales ? noCostTooltip : noSalesTooltip}>
								<ProductStatValue className={cn(lucro !== null && lucro < 0 && "text-red-600 dark:text-red-500")}>
									{lucro !== null ? formatToMoney(lucro) : null}
								</ProductStatValue>
							</ProductStatCell>
							<ProductStatCell label="Última venda" tooltip="Data da última venda do produto no período">
								<ProductStatValue>{product.estatisticas.dataUltimaVenda ? formatDateAsLocale(product.estatisticas.dataUltimaVenda) : null}</ProductStatValue>
							</ProductStatCell>
						</div>
					) : null}
				</TooltipProvider>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 w-full gap-1 text-[0.65rem] font-medium text-muted-foreground"
					onClick={() => setShowMoreMetrics((prev) => !prev)}
				>
					{showMoreMetrics ? <ChevronUp className="w-3 min-w-3 h-3 min-h-3" /> : <ChevronDown className="w-3 min-w-3 h-3 min-h-3" />}
					{showMoreMetrics ? "MENOS MÉTRICAS" : "MAIS MÉTRICAS"}
				</Button>
			</div>
		</div>
	);
}
