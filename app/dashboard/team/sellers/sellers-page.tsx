"use client";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import EditSeller from "@/components/Modals/Sellers/EditSeller";
import NewSeller from "@/components/Modals/Sellers/NewSeller";
import SalesTeamFilterMenu from "@/components/SalesTeam/SalesTeamFilterMenu";
import SalesTeamFilterShowcase from "@/components/SalesTeam/SalesTeamFilterShowcase";
import SellersGraphs from "@/components/Sellers/SellersGraphs";
import SellersRanking from "@/components/Sellers/SellersRanking";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatBadge } from "@/components/ui/stat-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDecimalPlaces, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { useSellers, useSellersOverallStats } from "@/lib/queries/sellers";
import { cn } from "@/lib/utils";
import type { TGetSellersOutputDefault } from "@/pages/api/sellers";
import type { TGetSellersDefaultInput } from "@/pages/api/sellers";
import type { TGetSellersOverallStatsInput } from "@/pages/api/sellers/stats/overall";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
	Activity,
	AreaChart,
	BadgeDollarSign,
	CirclePlus,
	ListFilter,
	Mail,
	Pencil,
	Phone,
	Plus,
	Target,
	Ticket,
	TrendingUp,
	Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type SellersPageProps = {
	user: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};
export default function SellersPage({ user, membership }: SellersPageProps) {
	const [viewMode, setViewMode] = useState<"stats" | "database">("stats");
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
					<SellersStatsView />
				</TabsContent>
				<TabsContent value="database">
					<SellersDatabaseView user={user} membership={membership} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function SellersDatabaseView({ user, membership }: { user: TAuthUserSession["user"]; membership: NonNullable<TAuthUserSession["membership"]> }) {
	const queryClient = useQueryClient();
	const [newSellerModalIsOpen, setNewSellerModalIsOpen] = useState(false);
	const [editSellerId, setEditSellerId] = useState<string | null>(null);
	const [filterMenuIsOpen, setFilterMenuIsOpen] = useState(false);
	const {
		data: sellersResult,
		queryKey,
		isLoading,
		isError,
		isSuccess,
		error,
		filters,
		updateFilters,
	} = useSellers({
		initialFilters: {
			statsPeriodAfter: dayjs().startOf("month").toDate(),
			statsPeriodBefore: dayjs().endOf("month").toDate(),
		},
	});
	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey: queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey: queryKey });

	const sellers = sellersResult?.sellers;
	const sellersShowing = sellers ? sellers.length : 0;
	const sellersMatched = sellersResult?.sellersMatched || 0;
	const totalPages = sellersResult?.totalPages;
	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center justify-end gap-2">
				<Button className="flex items-center gap-2" size="sm" onClick={() => setFilterMenuIsOpen(true)}>
					<ListFilter className="w-4 h-4 min-w-4 min-h-4" />
					FILTROS
				</Button>
				<Button className="flex items-center gap-2" size="sm" onClick={() => setNewSellerModalIsOpen(true)}>
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					NOVO VENDEDOR
				</Button>
			</div>
			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={sellersMatched > 0 ? `${sellersMatched} vendedores encontrados.` : `${sellersMatched} vendedor encontrado.`}
				itemsShowingText={sellersShowing > 0 ? `Mostrando ${sellersShowing} vendedores.` : `Mostrando ${sellersShowing} vendedor.`}
			/>
			<SalesTeamFilterShowcase queryParams={filters} updateQueryParams={updateFilters} />

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && sellers ? (
				<div className="w-full flex flex-col gap-1.5">
					{sellers.length > 0 ? (
						sellers.map((seller) => (
							<SellersPageSellerCard
								key={seller.id}
								seller={seller}
								handleEditClick={setEditSellerId}
								userHasEditPermission={
									membership.permissoes.resultados.visualizar && (!membership.permissoes.resultados.escopo || membership.permissoes.resultados.escopo?.includes(seller.id))
								}
								userHasViewPermission={
									membership.permissoes.resultados.visualizar && (!membership.permissoes.resultados.escopo || membership.permissoes.resultados.escopo?.includes(seller.id))
								}
							/>
						))
					) : (
						<p className="w-full flex items-center justify-center">Nenhum vendedor encontrado</p>
					)}
				</div>
			) : null}
			{editSellerId ? (
				<EditSeller
					sellerId={editSellerId}
					user={user}
					closeModal={() => setEditSellerId(null)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
			{filterMenuIsOpen ? (
				<SalesTeamFilterMenu queryParams={filters} updateQueryParams={updateFilters} closeMenu={() => setFilterMenuIsOpen(false)} />
			) : null}
			{newSellerModalIsOpen ? (
				<NewSeller user={user} closeModal={() => setNewSellerModalIsOpen(false)} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
			) : null}
		</div>
	);
}

function SellersStatsView() {
	const initialStartDate = dayjs().startOf("month");
	const initialEndDate = dayjs().endOf("month");
	const [filters, setFilters] = useState<TGetSellersOverallStatsInput>({
		periodAfter: initialStartDate.toDate(),
		periodBefore: initialEndDate.toDate(),
		comparingPeriodAfter: initialStartDate.subtract(1, "month").toDate(),
		comparingPeriodBefore: initialEndDate.subtract(1, "month").toDate(),
	});
	const { data: sellersOverallStats, isLoading: sellersOverallStatsLoading } = useSellersOverallStats({
		periodAfter: filters.periodAfter ?? null,
		periodBefore: filters.periodBefore ?? null,
		comparingPeriodAfter: filters.comparingPeriodAfter ?? null,
		comparingPeriodBefore: filters.comparingPeriodBefore ?? null,
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
					title="TOTAL DE VENDEDORES"
					icon={<Users className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: sellersOverallStats?.totalSellers.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						sellersOverallStats?.totalSellers.comparison
							? {
									value: sellersOverallStats?.totalSellers.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="VENDEDORES ATIVOS"
					icon={<Activity className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: sellersOverallStats?.activeSellers.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						sellersOverallStats?.activeSellers.comparison
							? {
									value: sellersOverallStats?.activeSellers.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="FATURAMENTO TOTAL"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: sellersOverallStats?.totalRevenue.current || 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						sellersOverallStats?.totalRevenue.comparison
							? {
									value: sellersOverallStats?.totalRevenue.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="TICKET MÉDIO GERAL"
					icon={<Ticket className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: sellersOverallStats?.averageTicket.current || 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						sellersOverallStats?.averageTicket.comparison
							? {
									value: sellersOverallStats?.averageTicket.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="META VS REALIZADO"
					icon={<Target className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: sellersOverallStats?.goalAchievement.current || 0,
						format: (n) => `${formatDecimalPlaces(n)}%`,
					}}
					previous={
						sellersOverallStats?.goalAchievement.comparison
							? {
									value: sellersOverallStats?.goalAchievement.comparison || 0,
									format: (n) => `${formatDecimalPlaces(n)}%`,
								}
							: undefined
					}
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3 h-[550px]">
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<SellersGraphs periodAfter={filters.periodAfter} periodBefore={filters.periodBefore} />
				</div>
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<SellersRanking
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

type SellerCardProps = {
	seller: TGetSellersOutputDefault["sellers"][number];
	handleEditClick: (sellerId: string) => void;
	userHasViewPermission: boolean;
	userHasEditPermission: boolean;
};
function SellersPageSellerCard({ seller, handleEditClick, userHasViewPermission, userHasEditPermission }: SellerCardProps) {
	return (
		<div className={cn("bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-between flex-col md:flex-row gap-3">
				<div className="flex items-center gap-3">
					<Avatar className="w-6 h-6 min-w-6 min-h-6">
						<AvatarImage src={seller.avatarUrl ?? undefined} alt={seller.nome} />
						<AvatarFallback>{formatNameAsInitials(seller.nome)}</AvatarFallback>
					</Avatar>
					<h1 className="text-xs font-bold tracking-tight uppercase">{seller.nome}</h1>
					{seller.telefone ? (
						<div className="flex items-center gap-1.5">
							<Phone className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs tracking-tight uppercase">{seller.telefone ?? "TELEFONE NÃO INFORMADO"}</p>
						</div>
					) : null}
					{seller.email ? (
						<div className="flex items-center gap-1.5">
							<Mail className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs tracking-tight uppercase">{seller.email}</p>
						</div>
					) : null}
				</div>
				<div className="flex items-center gap-3 flex-col md:flex-row gap-y-1">
					<div className="flex items-center gap-3">
						<StatBadge
							icon={<CirclePlus className="w-3 min-w-3 h-3 min-h-3" />}
							value={seller.estatisticas.vendasQtdeTotal}
							tooltipContent="Quantidade total de vendas no período de filtro"
							className="rounded-md px-1.5 py-1.5 font-bold bg-primary/10 text-primary"
							valueClassName="font-bold"
						/>
						<StatBadge
							icon={<BadgeDollarSign className="w-3 min-w-3 h-3 min-h-3" />}
							value={formatToMoney(seller.estatisticas.vendasValorTotal)}
							tooltipContent="Valor total de vendas no período de filtro"
							className="rounded-md px-1.5 py-1.5 font-bold bg-primary/10 text-primary"
							valueClassName="font-bold"
						/>
					</div>
					<div className="flex items-center gap-3">
						{userHasEditPermission ? (
							<Button variant="ghost" className="flex items-center gap-1.5" size="sm" onClick={() => handleEditClick(seller.id)}>
								<Pencil className="w-3 min-w-3 h-3 min-h-3" />
								EDITAR
							</Button>
						) : null}
						{userHasViewPermission ? (
							<Button variant="link" className="flex items-center gap-1.5" size="sm" asChild>
								<Link href={`/dashboard/team/sellers/id/${seller.id}`}>
									<AreaChart className="w-3 min-w-3 h-3 min-h-3" />
									RESULTADOS
								</Link>
							</Button>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
