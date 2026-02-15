"use client";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import PlanRestrictionComponent from "@/components/Layouts/PlanRestrictionComponent";
import ControlProduct from "@/components/Modals/Products/ControlProduct";
import NewProduct from "@/components/Modals/Products/NewProduct";
import ProductsFilterMenu from "@/components/Products/ProductsFilterMenu";
import ProductsGraphs from "@/components/Products/ProductsGraphs";
import ProductsRanking from "@/components/Products/ProductsRanking";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatBadge } from "@/components/ui/stat-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useProducts, useProductsOverallStats } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import type { TGetProductsDefaultInput, TGetProductsOutputDefault } from "@/pages/api/products";
import type { TGetProductsOverallStatsInput } from "@/pages/api/products/stats/overall";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
	Activity,
	AlertCircle,
	AlertTriangle,
	BadgeDollarSign,
	CirclePlus,
	Clock,
	Code,
	Diamond,
	DollarSign,
	Info,
	ListFilter,
	Package,
	PencilIcon,
	Plus,
	RefreshCw,
	ShoppingBag,
	ShoppingCart,
	Star,
	TrendingUp,
	Users,
	X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type ProductsPageProps = {
	user: TAuthUserSession["user"];
	userOrg: NonNullable<TAuthUserSession["membership"]>["organizacao"];
};

export default function ProductsPage({ user, userOrg }: ProductsPageProps) {
	const [viewMode, setViewMode] = useState<"stats" | "database">("stats");

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
			<Tabs value={viewMode} onValueChange={(v: string) => setViewMode(v as "stats" | "database")}>
				<TabsList className="flex items-center gap-1.5 w-fit h-fit self-start rounded-lg px-2 py-1">
					<TabsTrigger value="stats" className="flex items-center gap-1.5 px-2 py-2 rounded-lg">
						<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />
						Estatísticas
					</TabsTrigger>
					<TabsTrigger value="database" className="flex items-center gap-1.5 px-2 py-2 rounded-lg">
						<Users className="w-4 h-4 min-w-4 min-h-4" />
						Banco de Dados
					</TabsTrigger>
				</TabsList>
				<TabsContent value="stats">
					<ProductsStatsView />
				</TabsContent>
				<TabsContent value="database">
					<ProductsDatabaseView user={user} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function ProductsDatabaseView({ user }: { user: TAuthUserSession["user"] }) {
	const queryClient = useQueryClient();
	const [filterMenuIsOpen, setFilterMenuIsOpen] = useState<boolean>(false);
	const [newProductModalIsOpen, setNewProductModalIsOpen] = useState<boolean>(false);
	const [editProductModalId, setEditProductModalId] = useState<string | null>(null);
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
			search: "",
			groups: [],
			statsPeriodAfter: dayjs().startOf("month").toDate(),
			statsPeriodBefore: dayjs().endOf("month").toDate(),
			statsSaleNatures: [],
			statsExcludedSalesIds: [],
			statsTotalMin: null,
			statsTotalMax: null,
			stockStatus: [],
			priceMin: null,
			priceMax: null,
			orderByField: "descricao",
			orderByDirection: "asc",
		},
	});

	const products = productsResult?.products;
	const productsShowing = products ? products.length : 0;
	const productsMatched = productsResult?.productsMatched || 0;
	const totalPages = productsResult?.totalPages;

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey: queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey: queryKey });

	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar produto..."
					onChange={(e) => updateFilters({ search: e.target.value })}
					className="grow rounded-xl"
				/>
				<Button className="flex items-center gap-2" size="sm" onClick={() => setFilterMenuIsOpen(true)}>
					<ListFilter className="w-4 h-4 min-w-4 min-h-4" />
					FILTROS
				</Button>
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
			<ProductsFiltersShowcase filters={filters} updateFilters={updateFilters} />
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && products ? (
				products.length > 0 ? (
					products.map((product, index: number) => (
						<ProductCard
							key={product.id}
							product={product}
							handleEditClick={() => setEditProductModalId(product.id)}
							periodAfter={filters.statsPeriodAfter}
							periodBefore={filters.statsPeriodBefore}
						/>
					))
				) : (
					<p className="w-full tracking-tight text-center">Nenhum produto encontrado.</p>
				)
			) : null}
			{editProductModalId ? (
				<ControlProduct
					productId={editProductModalId}
					user={user}
					closeModal={() => setEditProductModalId(null)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
			{filterMenuIsOpen ? (
				<ProductsFilterMenu queryParams={filters} updateQueryParams={updateFilters} closeMenu={() => setFilterMenuIsOpen(false)} />
			) : null}
			{newProductModalIsOpen ? (
				<NewProduct user={user} closeModal={() => setNewProductModalIsOpen(false)} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
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
		</div>
	);
}

function ProductCard({
	product,
	handleEditClick,
	periodAfter,
	periodBefore,
}: {
	product: TGetProductsOutputDefault["products"][number];
	handleEditClick: () => void;
	periodAfter: Date | null;
	periodBefore: Date | null;
}) {
	// Calculate stock status
	const quantidade = product.quantidade ?? 0;
	const getStockStatus = () => {
		if (quantidade === 0) return { status: "out", label: "SEM ESTOQUE", color: "bg-red-500 dark:bg-red-600 text-white" };
		if (quantidade <= 10) return { status: "low", label: `${quantidade} UN`, color: "bg-yellow-500 dark:bg-yellow-600 text-white" };
		if (quantidade <= 50) return { status: "healthy", label: `${quantidade} UN`, color: "bg-green-500 dark:bg-green-600 text-white" };
		return { status: "overstocked", label: `${quantidade} UN`, color: "bg-blue-500 dark:bg-blue-600 text-white" };
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

	return (
		<div className={cn("bg-card border-primary/20 flex w-full flex-col sm:flex-row gap-2 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-center">
				<div className="relative h-16 max-h-16 min-h-16 w-16 max-w-16 min-w-16 overflow-hidden rounded-lg">
					{product.imagemCapaUrl ? (
						<Image src={product.imagemCapaUrl} alt="Imagem de capa do produto" fill={true} objectFit="cover" />
					) : (
						<div className="bg-primary/50 text-primary-foreground flex h-full w-full items-center justify-center">
							<ShoppingCart className="h-6 w-6" />
						</div>
					)}
				</div>
			</div>
			<div className=" flex flex-col grow gap-1">
				<div className="w-full flex items-center flex-col md:flex-row justify-between gap-2">
					<div className="flex items-center gap-2 flex-wrap">
						<h1 className="text-xs font-bold tracking-tight lg:text-sm">{product.descricao}</h1>
						<div className="flex items-center gap-1">
							<Code className="w-4 h-4 min-w-4 min-h-4" />
							<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic text-primary/80">{product.codigo}</h1>
						</div>
						{product.grupo ? (
							<div className="flex items-center gap-1">
								<Diamond className="w-4 h-4 min-w-4 min-h-4" />
								<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic text-primary/80">{product.grupo}</h1>
							</div>
						) : null}
					</div>
					<div className="flex items-center gap-3 flex-col md:flex-row gap-y-1">
						<TooltipProvider>
							<div className="flex items-center gap-3 flex-wrap">
								{/* Stock Status Badge */}
								<StatBadge
									icon={<Package className="w-4 min-w-4 h-4 min-h-4" />}
									value={stockStatus.label}
									tooltipContent="Quantidade em estoque atual"
									className={cn(stockStatus.color)}
								/>
								{/* Turnover Indicator */}
								{turnoverDays !== null && (
									<StatBadge
										icon={<Clock className="w-4 min-w-4 h-4 min-h-4" />}
										value={turnoverResult?.isCapped ? `${turnoverDays}+D` : `${turnoverDays}D`}
										tooltipContent="Dias de estoque restantes no ritmo de vendas atual"
										className={cn({
											"bg-red-500 dark:bg-red-600 text-white": turnoverDays < 7,
											"bg-yellow-500 dark:bg-yellow-600 text-white": turnoverDays >= 7 && turnoverDays < 30,
											"bg-green-500 dark:bg-green-600 text-white": turnoverDays >= 30 && turnoverDays < 90,
											"bg-blue-500 dark:bg-blue-600 text-white": turnoverDays >= 90 && turnoverDays < 180,
											"bg-purple-500 dark:bg-purple-600 text-white": turnoverDays >= 180,
										})}
									/>
								)}
								<StatBadge
									icon={<CirclePlus className="w-4 min-w-4 h-4 min-h-4" />}
									value={product.estatisticas.vendasQtdeTotal}
									tooltipContent="Quantidade total vendida no período"
								/>
								<StatBadge
									icon={<BadgeDollarSign className="w-4 min-w-4 h-4 min-h-4" />}
									value={formatToMoney(product.estatisticas.vendasValorTotal)}
									tooltipContent="Faturamento total no período"
								/>
								<StatBadge
									icon={<Star className="w-4 min-w-4 h-4 min-h-4" />}
									value={product.estatisticas.curvaABC}
									tooltipContent={`Curva ABC: ${
										product.estatisticas.curvaABC === "A"
											? "80% do faturamento"
											: product.estatisticas.curvaABC === "B"
												? "15% do faturamento"
												: "5% do faturamento"
									}`}
									className={cn({
										"bg-green-500 dark:bg-green-600 text-white": product.estatisticas.curvaABC === "A",
										"bg-yellow-500 dark:bg-yellow-600 text-white": product.estatisticas.curvaABC === "B",
										"bg-red-500 dark:bg-red-600 text-white": product.estatisticas.curvaABC === "C",
									})}
								/>
							</div>
						</TooltipProvider>
					</div>
				</div>
				<div className="w-full flex items-center justify-between gap-2 flex-wrap">
					<div className="flex items-center gap-1.5">
						<div className="flex items-center gap-1">
							<DollarSign className="w-4 h-4 min-w-4 min-h-4" />
							<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic text-primary/80">
								{product.precoVenda ? `${formatToMoney(product.precoVenda)} / ${product.unidade}` : "PREÇO DE VENDA NÃO DEFINIDO"}
							</h1>
						</div>
					</div>
					<div className="flex items-center gap-1.5">
						<Button variant="ghost" className="flex items-center gap-1.5" size="sm" onClick={handleEditClick}>
							<PencilIcon className="w-3 min-w-3 h-3 min-h-3" />
							EDITAR
						</Button>
						<Button variant="link" className="flex items-center gap-1.5" size="sm" asChild>
							<Link href={`/dashboard/commercial/products/id/${product.id}`}>
								<Info className="w-3 min-w-3 h-3 min-h-3" />
								DETALHES
							</Link>
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

type ProductsFiltersShowcaseProps = {
	filters: TGetProductsDefaultInput;
	updateFilters: (filters: Partial<TGetProductsDefaultInput>) => void;
};
function ProductsFiltersShowcase({ filters, updateFilters }: ProductsFiltersShowcaseProps) {
	const ORDERING_FIELDS_MAP = {
		descricao: "DESCRIÇÃO",
		codigo: "CÓDIGO",
		grupo: "GRUPO",
		vendasValorTotal: "VALOR TOTAL DE VENDAS",
		vendasQtdeTotal: "QUANTIDADE TOTAL DE VENDAS",
		quantidade: "QUANTIDADE EM ESTOQUE",
	};
	const ORDERING_DIRECTION_MAP = {
		asc: "CRESCENTE",
		desc: "DECRESCENTE",
	};
	const STOCK_STATUS_MAP = {
		out: "SEM ESTOQUE",
		low: "ESTOQUE BAIXO",
		healthy: "ESTOQUE SAUDÁVEL",
		overstocked: "EXCESSO DE ESTOQUE",
	};
	const FilterTag = ({
		label,
		value,
		onRemove,
	}: {
		label: string;
		value: string;
		onRemove?: () => void;
	}) => (
		<div className="flex items-center gap-1 bg-secondary text-[0.65rem] rounded-lg px-2 py-1">
			<p className="text-primary/80">
				{label}: <strong>{value}</strong>
			</p>
			{onRemove && (
				<button type="button" onClick={onRemove} className="bg-transparent text-primary hover:bg-primary/20 rounded-lg p-1">
					<X size={12} />
				</button>
			)}
		</div>
	);
	return (
		<div className="flex items-center justify-center lg:justify-end flex-wrap gap-2">
			{filters.search && filters.search.trim().length > 0 && (
				<FilterTag label="PESQUISA" value={filters.search} onRemove={() => updateFilters({ search: "" })} />
			)}
			{filters.groups.length > 0 && <FilterTag label="GRUPOS" value={filters.groups.join(", ")} onRemove={() => updateFilters({ groups: [] })} />}
			{filters.statsTotalMin || filters.statsTotalMax ? (
				<FilterTag
					label="ESTATÍSTICAS - VALOR"
					value={`${filters.statsTotalMin ? `> ${formatToMoney(filters.statsTotalMin)}` : ""}${filters.statsTotalMin && filters.statsTotalMax ? " & " : ""}${filters.statsTotalMax ? `< ${formatToMoney(filters.statsTotalMax)}` : ""}`}
					onRemove={() => updateFilters({ statsTotalMin: null, statsTotalMax: null })}
				/>
			) : null}
			{filters.statsPeriodAfter && filters.statsPeriodBefore && (
				<FilterTag
					label="ESTATÍSTICAS - PERÍODO"
					value={`${formatDateAsLocale(filters.statsPeriodAfter)} a ${formatDateAsLocale(filters.statsPeriodBefore)}`}
					onRemove={() => updateFilters({ statsPeriodAfter: null, statsPeriodBefore: null })}
				/>
			)}
			{filters.statsSaleNatures.length > 0 && (
				<FilterTag
					label="ESTATÍSTICAS - NATUREZAS DAS VENDAS"
					value={filters.statsSaleNatures.join(", ")}
					onRemove={() => updateFilters({ statsSaleNatures: [] })}
				/>
			)}
			{filters.stockStatus && filters.stockStatus.length > 0 && (
				<FilterTag
					label="STATUS DE ESTOQUE"
					value={filters.stockStatus.map((status: string) => STOCK_STATUS_MAP[status as keyof typeof STOCK_STATUS_MAP] || status).join(", ")}
					onRemove={() => updateFilters({ stockStatus: [] })}
				/>
			)}
			{(filters.priceMin || filters.priceMax) && (
				<FilterTag
					label="FAIXA DE PREÇO"
					value={`${filters.priceMin ? `≥ ${formatToMoney(filters.priceMin)}` : ""}${filters.priceMin && filters.priceMax ? " & " : ""}${filters.priceMax ? `≤ ${formatToMoney(filters.priceMax)}` : ""}`}
					onRemove={() => updateFilters({ priceMin: null, priceMax: null })}
				/>
			)}
			{filters.orderByField && filters.orderByDirection && (
				<FilterTag
					label="ORDENAÇÃO"
					value={`${ORDERING_FIELDS_MAP[filters.orderByField]} - ${ORDERING_DIRECTION_MAP[filters.orderByDirection]}`}
					onRemove={() => updateFilters({ orderByField: null, orderByDirection: null })}
				/>
			)}
		</div>
	);
}
