import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDateForInputValue, formatDateOnInputChange, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import type { TGetSalesInput, TGetSalesOutputByClientId } from "@/pages/api/sales";

import DateInput from "@/components/Inputs/DateInput";
import MultipleSelectInput from "@/components/Inputs/MultipleSelectInput";
import NumberInput from "@/components/Inputs/NumberInput";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSales } from "@/lib/queries/sales";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import {
	ArrowRight,
	BadgeDollarSign,
	BadgePercent,
	Calendar,
	CircleUser,
	Clock,
	Info,
	ListFilter,
	Megaphone,
	Package,
	Tag,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
type ClientPurchasesProps = {
	clientId: string;
};
export default function ClientPurchases({ clientId }: ClientPurchasesProps) {
	const [filtersMenuIsOpen, setFiltersMenuIsOpen] = useState(false);

	const {
		data: purchasesResult,
		isLoading: isPurchasesLoading,
		isError: isPurchasesError,
		isSuccess: isPurchasesSuccess,
		error: purchasesError,
		params: purchasesParams,
		updateParams: updatePurchasesParams,
	} = useSales({
		initialParams: {
			page: 1,
			search: "",
			periodAfter: dayjs().startOf("month").toDate(),
			periodBefore: dayjs().endOf("month").toDate(),
			sellersIds: [],
			partnersIds: [],
			saleNatures: [],
			clientId: clientId,
			productGroups: [],
			productIds: [],
			totalMin: null,
			totalMax: null,
		},
	});
	const purchases = purchasesResult?.sales ?? [];
	const purchasesMatched = purchasesResult?.salesMatched ?? 0;
	const purchasesTotalPages = purchasesResult?.totalPages ?? 0;
	const purchasesShowing = purchases.length;
	return (
		<div className="bg-card border-primary/20 flex h-full w-full flex-col gap-3 rounded-xl border px-4 py-4 shadow-2xs">
			<div className="flex w-full shrink-0 items-center justify-between gap-2">
				<h1 className="text-sm font-bold tracking-tight uppercase">Compras do Cliente</h1>
				<Button className="flex items-center gap-2" size="sm" onClick={() => setFiltersMenuIsOpen(true)}>
					<ListFilter className="w-4 h-4 min-w-4 min-h-4" />
					FILTROS
				</Button>
			</div>
			<div className="shrink-0">
				<GeneralPaginationComponent
					activePage={purchasesParams.page}
					queryLoading={isPurchasesLoading}
					selectPage={(page) => updatePurchasesParams({ page })}
					totalPages={purchasesTotalPages}
					itemsMatchedText={purchasesMatched > 1 ? `${purchasesMatched} compras encontradas.` : `${purchasesMatched} compra encontrada.`}
					itemsShowingText={purchasesShowing > 1 ? `Mostrando ${purchasesShowing} compras.` : `Mostrando ${purchasesShowing} compra.`}
				/>
			</div>
			<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 min-h-0 flex-1 overflow-y-auto">
				{isPurchasesLoading ? <LoadingComponent /> : null}
				{isPurchasesError ? <ErrorComponent msg={getErrorMessage(purchasesError)} /> : null}
				{isPurchasesSuccess && purchases.length > 0 ? purchases.map((sale) => <SaleCard key={sale.id} sale={sale} />) : null}
				{isPurchasesSuccess && purchases.length === 0 ? <p className="w-full tracking-tight text-center">Nenhuma compra encontrada.</p> : null}
			</div>

			{filtersMenuIsOpen ? (
				<ClientPurchasesFilterMenu
					queryParams={purchasesParams}
					updateQueryParams={updatePurchasesParams}
					closeMenu={() => setFiltersMenuIsOpen(false)}
				/>
			) : null}
		</div>
	);
}

function SaleCard({ sale }: { sale: TGetSalesOutputByClientId["sales"][number] }) {
	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-4 py-4 shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
			<div className="flex flex-col md:flex-row justify-between gap-3">
				{/* Client Info & Sale Basics */}
				<div className="flex flex-col gap-1.5 grow">
					<div className="flex items-center gap-2">
						<CircleUser className="w-4 h-4 text-primary/70" />
						<h1 className="text-sm font-bold tracking-tight uppercase">{sale.cliente?.nome ?? "AO CONSUMIDOR"}</h1>
					</div>
					<div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
						<div className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded-md">
							<Calendar className="w-3 h-3" />
							<span>{formatDateAsLocale(sale.dataVenda, true)}</span>
						</div>
						<div className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded-md">
							<Tag className="w-3 h-3" />
							<span>{sale.natureza}</span>
						</div>
					</div>
				</div>

				{/* Financials & Items Summary */}
				<div className="flex flex-col gap-2 md:items-end">
					<div className="flex items-center gap-1.5">
						{sale.atribuicaoCampanhaConversao ? (
							<HoverCard>
								<HoverCardTrigger>
									<div className="flex items-center gap-1.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2 py-1 rounded-md cursor-pointer hover:bg-violet-500/20 transition-colors">
										<Megaphone className="w-3.5 h-3.5" />
										<span className="text-xs font-medium tracking-tight">CONVERSÃO</span>
									</div>
								</HoverCardTrigger>
								<HoverCardContent className="w-72 p-0 overflow-hidden">
									{/* Header */}
									<div className="bg-violet-500/10 px-4 py-3 border-b border-violet-500/10">
										<div className="flex items-center gap-2">
											<div className="p-1.5 bg-violet-500/20 rounded-md">
												<Megaphone className="w-4 h-4 text-violet-600 dark:text-violet-400" />
											</div>
											<div className="flex flex-col">
												<span className="text-[0.6rem] text-muted-foreground uppercase tracking-wide">Campanha</span>
												<span className="text-sm font-semibold leading-tight">{sale.atribuicaoCampanhaConversao.campanha?.titulo}</span>
											</div>
										</div>
									</div>
									{/* Content */}
									<div className="p-4 space-y-3">
										{/* Timeline */}
										<div className="flex items-center gap-3">
											<div className="flex flex-col items-center gap-1">
												<div className="w-2 h-2 rounded-full bg-blue-500" />
												<div className="w-px h-6 bg-gradient-to-b from-blue-500 to-green-500" />
												<div className="w-2 h-2 rounded-full bg-green-500" />
											</div>
											<div className="flex flex-col gap-3 flex-1">
												<div className="flex flex-col">
													<span className="text-[0.6rem] text-muted-foreground uppercase">Interação Enviada</span>
													<span className="text-xs font-medium">{formatDateAsLocale(sale.atribuicaoCampanhaConversao.dataInteracao, true)}</span>
												</div>
												<div className="flex flex-col">
													<span className="text-[0.6rem] text-muted-foreground uppercase">Converteu em</span>
													<span className="text-xs font-medium">{formatDateAsLocale(sale.atribuicaoCampanhaConversao.dataConversao, true)}</span>
												</div>
											</div>
										</div>
										{/* Stats */}
										<div className="flex items-center gap-2 pt-2 border-t border-border/50">
											<div className="flex-1 flex flex-col items-center p-2 bg-secondary/50 rounded-lg">
												<span className="text-[0.6rem] text-muted-foreground uppercase">Tempo</span>
												<span className="text-xs font-bold">
													{sale.atribuicaoCampanhaConversao.tempoParaConversaoMinutos < 60
														? `${sale.atribuicaoCampanhaConversao.tempoParaConversaoMinutos}min`
														: sale.atribuicaoCampanhaConversao.tempoParaConversaoMinutos < 1440
															? `${Math.round(sale.atribuicaoCampanhaConversao.tempoParaConversaoMinutos / 60)}h`
															: `${Math.round(sale.atribuicaoCampanhaConversao.tempoParaConversaoMinutos / 1440)}d`}
												</span>
											</div>
											<div className="flex-1 flex flex-col items-center p-2 bg-green-500/10 rounded-lg">
												<span className="text-[0.6rem] text-muted-foreground uppercase">Receita</span>
												<span className="text-xs font-bold text-green-600 dark:text-green-400">
													{formatToMoney(sale.atribuicaoCampanhaConversao.atribuicaoReceita)}
												</span>
											</div>
										</div>
									</div>
								</HoverCardContent>
							</HoverCard>
						) : null}
						{sale.transacoesCashback.length > 0 ? (
							<HoverCard>
								<HoverCardTrigger>
									<div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-md cursor-pointer hover:bg-emerald-500/20 transition-colors">
										<BadgePercent className="w-3.5 h-3.5" />
										<span className="text-xs font-medium tracking-tight">CASHBACK</span>
									</div>
								</HoverCardTrigger>
								<HoverCardContent className="w-80 p-0 overflow-hidden">
									{/* Header */}
									<div className="bg-emerald-500/10 px-4 py-3 border-b border-emerald-500/10">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<div className="p-1.5 bg-emerald-500/20 rounded-md">
													<BadgePercent className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
												</div>
												<div className="flex flex-col">
													<span className="text-[0.6rem] text-muted-foreground uppercase tracking-wide">Transações</span>
													<span className="text-sm font-semibold leading-tight">
														{sale.transacoesCashback.length} {sale.transacoesCashback.length === 1 ? "movimento" : "movimentos"}
													</span>
												</div>
											</div>
										</div>
									</div>
									{/* Transactions */}
									<div className="p-3 space-y-2 max-h-64 overflow-y-auto">
										{sale.transacoesCashback.map((transaction) => (
											<div key={transaction.id} className="bg-secondary/30 rounded-lg p-3 space-y-2">
												{/* Type and Value */}
												<div className="flex items-center justify-between">
													<div
														className={cn(
															"flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold uppercase",
															transaction.tipo === "ACÚMULO"
																? "bg-green-500/15 text-green-600 dark:text-green-400"
																: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
														)}
													>
														{transaction.tipo === "ACÚMULO" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
														{transaction.tipo}
													</div>
													<span
														className={cn(
															"text-sm font-bold",
															transaction.tipo === "ACÚMULO" ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400",
														)}
													>
														{transaction.tipo === "ACÚMULO" ? "+" : "-"}
														{formatToMoney(transaction.valor)}
													</span>
												</div>
												{/* Balance Flow */}
												<div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground">
													<span>{formatToMoney(transaction.saldoValorAnterior)}</span>
													<ArrowRight className="w-3 h-3" />
													<span className="font-medium text-foreground">{formatToMoney(transaction.saldoValorPosterior)}</span>
												</div>
												{/* Date and Expiration */}
												<div className="flex items-center justify-between text-[0.6rem] text-muted-foreground pt-1 border-t border-border/30">
													<div className="flex items-center gap-1">
														<Calendar className="w-3 h-3" />
														{formatDateAsLocale(transaction.dataInsercao)}
													</div>
													{transaction.expiracaoData && (
														<div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
															<Clock className="w-3 h-3" />
															Expira: {formatDateAsLocale(transaction.expiracaoData)}
														</div>
													)}
												</div>
											</div>
										))}
									</div>
								</HoverCardContent>
							</HoverCard>
						) : null}
						<div className="flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-md w-fit">
							<BadgeDollarSign className="w-4 h-4" />
							<span className="font-bold text-sm">{formatToMoney(sale.valorTotal)}</span>
						</div>
					</div>

					<div className="flex items-center gap-1.5 text-xs text-muted-foreground w-fit">
						<Package className="w-3 h-3" />
						<span>
							{sale.itens.length} {sale.itens.length === 1 ? "item" : "itens"}
						</span>
					</div>
				</div>
			</div>

			{/* Participants (Seller & Partner) */}
			{(sale.vendedor || sale.parceiro) && (
				<div className="flex items-center gap-4 pt-3 border-t border-border/50">
					{sale.vendedor && (
						<div className="flex items-center gap-2">
							<Avatar className="w-6 h-6">
								<AvatarImage src={sale.vendedor.avatarUrl ?? undefined} alt={sale.vendedor.nome} />
								<AvatarFallback className="text-[0.6rem]">{formatNameAsInitials(sale.vendedor.nome)}</AvatarFallback>
							</Avatar>
							<div className="flex flex-col">
								<span className="text-[0.6rem] text-muted-foreground font-medium uppercase leading-none">Vendedor</span>
								<span className="text-xs font-bold leading-none mt-0.5">{sale.vendedor.nome}</span>
							</div>
						</div>
					)}
					{sale.parceiro && (
						<div className="flex items-center gap-2">
							<Avatar className="w-6 h-6">
								<AvatarImage src={sale.parceiro.avatarUrl ?? undefined} alt={sale.parceiro.nome} />
								<AvatarFallback className="text-[0.6rem]">{formatNameAsInitials(sale.parceiro.nome)}</AvatarFallback>
							</Avatar>
							<div className="flex flex-col">
								<span className="text-[0.6rem] text-muted-foreground font-medium uppercase leading-none">Parceiro</span>
								<span className="text-xs font-bold leading-none mt-0.5">{sale.parceiro.nome}</span>
							</div>
						</div>
					)}
				</div>
			)}
			<div className="w-full flex items-center justify-end">
				<Button variant="link" className="flex items-center gap-1.5" size="sm" asChild>
					<Link href={`/dashboard/commercial/sales/${sale.id}`}>
						<Info className="w-3 min-w-3 h-3 min-h-3" />
						DETALHES
					</Link>
				</Button>
			</div>
		</div>
	);
}

type ClientPurchasesFilterMenuProps = {
	queryParams: TGetSalesInput;
	updateQueryParams: (params: Partial<TGetSalesInput>) => void;
	closeMenu: () => void;
};

export function ClientPurchasesFilterMenu({ queryParams, updateQueryParams, closeMenu }: ClientPurchasesFilterMenuProps) {
	const [queryParamsHolder, setQueryParamsHolder] = useState<TGetSalesInput>(queryParams);
	const { data: filterOptions } = useSaleQueryFilterOptions();

	return (
		<Sheet open onOpenChange={closeMenu}>
			<SheetContent>
				<div className="flex h-full w-full flex-col">
					<SheetHeader>
						<SheetTitle>FILTRAR COMPRAS DO CLIENTE</SheetTitle>
						<SheetDescription>Escolha aqui parâmetros para filtrar as compras do cliente.</SheetDescription>
					</SheetHeader>

					<div className="flex h-full flex-col gap-y-4 overflow-y-auto overscroll-y-auto p-2 scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
						<div className="flex w-full flex-col gap-2">
							<MultipleSelectInput
								label="NATUREZAS DE VENDA"
								selected={queryParamsHolder.saleNatures ?? []}
								options={filterOptions?.saleNatures || []}
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, saleNatures: value as string[] }))}
								onReset={() => setQueryParamsHolder((prev) => ({ ...prev, saleNatures: [] }))}
								resetOptionLabel="NENHUMA DEFINIDA"
								width="100%"
							/>
							<MultipleSelectInput
								label="VENDEDORES"
								selected={queryParamsHolder.sellersIds ?? []}
								options={filterOptions?.sellers || []}
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, sellersIds: value as string[] }))}
								onReset={() => setQueryParamsHolder((prev) => ({ ...prev, sellersIds: [] }))}
								resetOptionLabel="NENHUM DEFINIDO"
								width="100%"
							/>
							<MultipleSelectInput
								label="PARCEIROS"
								selected={queryParamsHolder.partnersIds ?? []}
								options={filterOptions?.partners || []}
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, partnersIds: value as string[] }))}
								onReset={() => setQueryParamsHolder((prev) => ({ ...prev, partnersIds: [] }))}
								resetOptionLabel="NENHUM DEFINIDO"
								width="100%"
							/>
							<MultipleSelectInput
								label="GRUPOS DE PRODUTOS"
								selected={queryParamsHolder.productGroups ?? []}
								options={filterOptions?.productsGroups || []}
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, productGroups: value as string[] }))}
								onReset={() => setQueryParamsHolder((prev) => ({ ...prev, productGroups: [] }))}
								resetOptionLabel="NENHUM DEFINIDO"
								width="100%"
							/>
						</div>

						<div className="flex w-full flex-col gap-2">
							<h1 className="w-full text-xs tracking-tight text-primary">FILTRO POR VALOR TOTAL DA COMPRA</h1>
							<NumberInput
								label="VALOR MÍNIMO"
								value={queryParamsHolder.totalMin ?? undefined}
								placeholder="R$ 0,00"
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, totalMin: value }))}
								width="100%"
							/>
							<NumberInput
								label="VALOR MÁXIMO"
								value={queryParamsHolder.totalMax ?? undefined}
								placeholder="R$ 0,00"
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, totalMax: value }))}
								width="100%"
							/>
						</div>

						<div className="flex w-full flex-col gap-2">
							<h1 className="w-full text-xs tracking-tight text-primary">FILTRO POR PERÍODO</h1>
							<DateInput
								label="DEPOIS DE"
								value={formatDateForInputValue(queryParamsHolder.periodAfter)}
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, periodAfter: formatDateOnInputChange(value, "date") as Date }))}
								width="100%"
							/>
							<DateInput
								label="ANTES DE"
								value={formatDateForInputValue(queryParamsHolder.periodBefore)}
								handleChange={(value) => setQueryParamsHolder((prev) => ({ ...prev, periodBefore: formatDateOnInputChange(value, "date", "end") as Date }))}
								width="100%"
							/>
						</div>
					</div>

					<Button
						onClick={() => {
							updateQueryParams({ ...queryParamsHolder, page: 1 });
							closeMenu();
						}}
					>
						FILTRAR
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}
