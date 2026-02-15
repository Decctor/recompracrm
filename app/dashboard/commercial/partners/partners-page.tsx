"use client";
import type { TGetPartnersInput, TGetPartnersOutputDefault } from "@/app/api/partners/route";
import type { TGetPartnersOverallStatsInput } from "@/app/api/partners/stats/overall/route";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import EditPartner from "@/components/Modals/Partners/EditPartner";
import NewPartner from "@/components/Modals/Partners/NewPartner";
import PartnersFilterMenu from "@/components/Partners/PartnersFilterMenu";
import PartnersGraphs from "@/components/Partners/PartnersGraphs";
import PartnersRanking from "@/components/Partners/PartnersRanking";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatBadge } from "@/components/ui/stat-badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { usePartners, usePartnersOverallStats } from "@/lib/queries/partners";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Activity, BadgeDollarSign, CirclePlus, IdCard, ListFilter, Mail, Pencil, Phone, Plus, Ticket, TrendingUp, Users, X } from "lucide-react";
import { useState } from "react";
import { BsCalendar } from "react-icons/bs";

type PartnersPageProps = {
	user: TAuthUserSession["user"];
};
export default function PartnersPage({ user }: PartnersPageProps) {
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
					<PartnersStatsView />
				</TabsContent>
				<TabsContent value="database">
					<PartnersDatabaseView user={user} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function PartnersDatabaseView({ user }: { user: TAuthUserSession["user"] }) {
	const queryClient = useQueryClient();
	const [filterMenuIsOpen, setFilterMenuIsOpen] = useState<boolean>(false);
	const [newPartnerModalIsOpen, setNewPartnerModalIsOpen] = useState<boolean>(false);
	const [editPartnerModalId, setEditPartnerModalId] = useState<string | null>(null);
	const {
		data: partnersResult,
		queryKey,
		isLoading,
		isError,
		isSuccess,
		error,
		queryParams,
		updateQueryParams,
	} = usePartners({
		initialParams: {
			search: "",
			statsPeriodAfter: dayjs().startOf("month").toDate(),
			statsPeriodBefore: dayjs().endOf("month").toDate(),
			statsSaleNatures: [],
			statsExcludedSalesIds: [],
			statsTotalMin: null,
			statsTotalMax: null,
		},
	});
	const partners = partnersResult?.partners;
	const partnersShowing = partners ? partners.length : 0;
	const partnersMatched = partnersResult?.partnersMatched || 0;
	const totalPages = partnersResult?.totalPages;
	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey: queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey: queryKey });
	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<Input
					value={queryParams.search ?? ""}
					placeholder="Pesquisar parceiro..."
					onChange={(e) => updateQueryParams({ search: e.target.value })}
					className="grow rounded-xl"
				/>

				<Button className="flex items-center gap-2" size="sm" onClick={() => setFilterMenuIsOpen(true)}>
					<ListFilter className="w-4 h-4 min-w-4 min-h-4" />
					FILTROS
				</Button>
				<Button className="flex items-center gap-2" size="sm" onClick={() => setNewPartnerModalIsOpen(true)}>
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					NOVO PARCEIRO
				</Button>
			</div>
			<GeneralPaginationComponent
				activePage={queryParams.page}
				queryLoading={isLoading}
				selectPage={(page) => updateQueryParams({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={partnersMatched > 0 ? `${partnersMatched} parceiros encontrados.` : `${partnersMatched} parceiro encontrado.`}
				itemsShowingText={partnersShowing > 0 ? `Mostrando ${partnersShowing} parceiros.` : `Mostrando ${partnersShowing} parceiro.`}
			/>
			<PartnersPageFilterShowcase queryParams={queryParams} updateQueryParams={updateQueryParams} />
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				<div className="w-full flex flex-col gap-1.5">
					{partners && partners.length > 0 ? (
						partners.map((partner) => <PartnersPagePartnerCard key={partner.id} partner={partner} handleEditClick={setEditPartnerModalId} />)
					) : (
						<p className="w-full flex items-center justify-center">Nenhum parceiro encontrado</p>
					)}
				</div>
			) : null}

			{filterMenuIsOpen ? (
				<PartnersFilterMenu queryParams={queryParams} updateQueryParams={updateQueryParams} closeMenu={() => setFilterMenuIsOpen(false)} />
			) : null}
			{editPartnerModalId ? (
				<EditPartner
					partnerId={editPartnerModalId}
					user={user}
					closeModal={() => setEditPartnerModalId(null)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
			{newPartnerModalIsOpen ? (
				<NewPartner user={user} closeModal={() => setNewPartnerModalIsOpen(false)} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
			) : null}
		</div>
	);
}

function PartnersStatsView() {
	const initialStartDate = dayjs().startOf("month");
	const initialEndDate = dayjs().endOf("month");
	const [filters, setFilters] = useState<TGetPartnersOverallStatsInput>({
		periodAfter: initialStartDate.toDate(),
		periodBefore: initialEndDate.toDate(),
		comparingPeriodAfter: initialStartDate.subtract(1, "month").toDate(),
		comparingPeriodBefore: initialEndDate.subtract(1, "month").toDate(),
	});
	const { data: partnersOverallStats, isLoading: partnersOverallStatsLoading } = usePartnersOverallStats({
		periodAfter: filters.periodAfter ?? null,
		periodBefore: filters.periodBefore ?? null,
		comparingPeriodAfter: filters.comparingPeriodAfter ?? null,
		comparingPeriodBefore: filters.comparingPeriodBefore ?? null,
	});
	console.log("[INFO] [PARTNERS RANKING] Starting:", {
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
					handleChange={(value) => {
						setFilters((prev) => ({
							...prev,
							periodAfter: value.after ? new Date(value.after) : null,
							periodBefore: value.before ? new Date(value.before) : null,
							comparingPeriodAfter: value.after ? dayjs(value.after).subtract(1, "month").toDate() : null,
							comparingPeriodBefore: value.before ? dayjs(value.before).subtract(1, "month").toDate() : null,
						}));
					}}
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="TOTAL DE PARCEIROS"
					icon={<Users className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: partnersOverallStats?.totalPartners.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						partnersOverallStats?.totalPartners.comparison
							? {
									value: partnersOverallStats?.totalPartners.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="PARCEIROS ATIVOS"
					icon={<Activity className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: partnersOverallStats?.activePartners.current || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
					previous={
						partnersOverallStats?.activePartners.comparison
							? {
									value: partnersOverallStats?.activePartners.comparison || 0,
									format: (n) => formatDecimalPlaces(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="FATURAMENTO TOTAL"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: partnersOverallStats?.totalRevenue.current || 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						partnersOverallStats?.totalRevenue.comparison
							? {
									value: partnersOverallStats?.totalRevenue.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
				/>
				<StatUnitCard
					title="TICKET MÉDIO GERAL"
					icon={<Ticket className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: partnersOverallStats?.averageTicket.current || 0,
						format: (n) => formatToMoney(n),
					}}
					previous={
						partnersOverallStats?.averageTicket.comparison
							? {
									value: partnersOverallStats?.averageTicket.comparison || 0,
									format: (n) => formatToMoney(n),
								}
							: undefined
					}
				/>
			</div>
			<div className="w-full flex items-start flex-col lg:flex-row gap-3 h-[550px]">
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<PartnersGraphs periodAfter={filters.periodAfter} periodBefore={filters.periodBefore} />
				</div>
				<div className="w-full lg:w-1/2 h-full min-h-0">
					<PartnersRanking
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

type PartnersPageFilterShowcaseProps = {
	queryParams: TGetPartnersInput;
	updateQueryParams: (params: Partial<TGetPartnersInput>) => void;
};

function PartnersPageFilterShowcase({ queryParams, updateQueryParams }: PartnersPageFilterShowcaseProps) {
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
			{queryParams.search && queryParams.search.trim().length > 0 && (
				<FilterTag label="PESQUISA" value={queryParams.search} onRemove={() => updateQueryParams({ search: "" })} />
			)}
			{queryParams.statsPeriodAfter && queryParams.statsPeriodBefore && (
				<FilterTag
					label="PERÍODO DAS ESTASTÍCAS"
					value={`${formatDateAsLocale(queryParams.statsPeriodAfter)} a ${formatDateAsLocale(queryParams.statsPeriodBefore)}`}
					onRemove={() => updateQueryParams({ statsPeriodAfter: null, statsPeriodBefore: null })}
				/>
			)}
			{queryParams.statsSaleNatures && queryParams.statsSaleNatures.length > 0 && (
				<FilterTag
					label="NATUREZAS DAS VENDAS"
					value={queryParams.statsSaleNatures.join(", ")}
					onRemove={() => updateQueryParams({ statsSaleNatures: [] })}
				/>
			)}
			{queryParams.statsTotalMin || queryParams.statsTotalMax ? (
				<FilterTag
					label="VALOR"
					value={`${queryParams.statsTotalMin ? `> ${formatToMoney(queryParams.statsTotalMin)}` : ""}${queryParams.statsTotalMin && queryParams.statsTotalMax ? " & " : ""}${queryParams.statsTotalMax ? `< ${formatToMoney(queryParams.statsTotalMax)}` : ""}`}
					onRemove={() => updateQueryParams({ statsTotalMin: null, statsTotalMax: null })}
				/>
			) : null}
		</div>
	);
}

function PartnersPagePartnerCard({
	partner,
	handleEditClick,
}: { partner: TGetPartnersOutputDefault["partners"][number]; handleEditClick: (id: string) => void }) {
	return (
		<div className={cn("bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="flex items-center justify-between flex-col md:flex-row gap-3">
				<div className="flex items-center gap-3">
					<Avatar className="w-6 h-6 min-w-6 min-h-6">
						<AvatarImage src={partner.avatarUrl ?? undefined} alt={partner.nome} />
						<AvatarFallback>{formatNameAsInitials(partner.nome)}</AvatarFallback>
					</Avatar>
					<h1 className="text-xs font-bold tracking-tight uppercase">{partner.nome}</h1>
					{partner.cpfCnpj ? (
						<div className="flex items-center gap-1.5">
							<IdCard className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs tracking-tight uppercase">{partner.cpfCnpj ?? "CPF/CNPJ NÃO INFORMADO"}</p>
						</div>
					) : null}
					{partner.telefone ? (
						<div className="flex items-center gap-1.5">
							<Phone className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs tracking-tight uppercase">{partner.telefone ?? "TELEFONE NÃO INFORMADO"}</p>
						</div>
					) : null}
					{partner.email ? (
						<div className="flex items-center gap-1.5">
							<Mail className="w-3 min-w-3 h-3 min-h-3" />
							<p className="text-xs tracking-tight uppercase">{partner.email}</p>
						</div>
					) : null}
				</div>
				<div className="flex items-center gap-3 flex-col md:flex-row gap-y-1">
					<div className="flex items-center gap-3">
						<StatBadge
							icon={<CirclePlus className="w-3 min-w-3 h-3 min-h-3" />}
							value={partner.estatisticas.vendasQtdeTotal}
							tooltipContent="Quantidade total de vendas no período de filtro"
							className="rounded-md px-1.5 py-1.5 font-bold bg-primary/10 text-primary"
							valueClassName="font-bold"
						/>
						<StatBadge
							icon={<BadgeDollarSign className="w-3 min-w-3 h-3 min-h-3" />}
							value={formatToMoney(partner.estatisticas.vendasValorTotal)}
							tooltipContent="Valor total de vendas no período de filtro"
							className="rounded-md px-1.5 py-1.5 font-bold bg-primary/10 text-primary"
							valueClassName="font-bold"
						/>
					</div>
				</div>
			</div>
			<div className="w-full flex items-center justify-center lg:justify-end gap-2 flex-wrap">
				<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-primary")}>
					<BsCalendar className="w-3 min-w-3 h-3 min-h-3" />
					<p className="text-xs font-medium tracking-tight uppercase">PRIMEIRA VENDA: {formatDateAsLocale(partner.estatisticas.dataPrimeiraVenda)}</p>
				</div>
				<div className={cn("flex items-center gap-1.5 text-[0.65rem] font-bold text-primary")}>
					<BsCalendar className="w-3 min-w-3 h-3 min-h-3" />
					<p className="text-xs font-medium tracking-tight uppercase">ÚLTIMA VENDA: {formatDateAsLocale(partner.estatisticas.dataUltimaVenda)}</p>
				</div>
				<Button
					variant="ghost"
					className="flex items-center gap-1.5"
					size="sm"
					onClick={(e) => {
						handleEditClick(partner.id);
					}}
				>
					<Pencil className="w-3 min-w-3 h-3 min-h-3" />
					EDITAR
				</Button>
			</div>
		</div>
	);
}
