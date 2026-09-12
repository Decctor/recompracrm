"use client";
import { buildSalesIntegrationFilterOptions } from "@/components/Sales/sales-integration-filter-options";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { ActionToolbar } from "@/components/ui/action-toolbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { InteractiveFilter, type InteractiveFilterOption } from "@/components/ui/interactive-filter";
import { Input } from "@/components/ui/input";
import {
	DropdownMenuGroup,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { formatInteractiveDateRangeSummary, formatInteractiveOptionSummary } from "@/components/ui/interactive-filter-formatting";
import { organizationHasPrinterForFinalidade, useAgentPrinters } from "@/lib/queries/desktop-agent";
import { createManualPrintJob } from "@/lib/mutations/desktop-agent";
import { PAYMENT_METHOD_CHIP_LABELS } from "@/lib/payments/labels";
import { DeliveryModeEnum, PaymentMethodEnum } from "@/schemas/enums";
import { SALE_FINANCIAL_STATUS_PRESENTATION, SALE_FISCAL_STATUS_PRESENTATION, SALE_STATUS_LABELS } from "@/lib/sales/status-presentation";
import { useSalesQuery } from "@/lib/queries/sales";
import { salesHistoryParsers, toSalesHistoryInput } from "@/lib/sales/history-url-state";
import { useQueryStates } from "nuqs";
import { DELIVERY_MODE_META } from "@/app/dashboard/sales/_components/fulfillment/config";
import { useSaleQueryFilterOptions } from "@/lib/queries/stats/utils";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { appRoutes } from "@/lib/navigation/routes";
import type { TGetSalesInput, TGetSalesOutputDefault } from "@/app/api/sales/route";
import type {
	TDeliveryModeEnum,
	TPaymentMethodEnum,
	TSaleFinancialDerivedStatusEnum,
	TSaleFiscalDerivedStatusEnum,
	TSaleStatusEnum,
} from "@/schemas/enums";
import {
	ArrowRight,
	BadgeDollarSign,
	BadgePercent,
	Ban,
	Calendar,
	CheckCircle2,
	CircleAlert,
	CircleDashed,
	CircleOff,
	CircleUser,
	Clock,
	CreditCard,
	FileSpreadsheet,
	FileText,
	FileX2,
	Info,
	ListFilter,
	LoaderCircle,
	Megaphone,
	MoreHorizontal,
	Package,
	PencilLine,
	Plus,
	Printer,
	ReceiptText,
	ShoppingBag,
	Tag,
	TrendingDown,
	TrendingUp,
	Truck,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SalesIntegrationPill } from "@/components/Sales/SalesIntegrationPill";
import ManualFiscalEmission from "@/components/Modals/FiscalDocument/ManualFiscalEmission";
import ExportSales from "@/components/Modals/Sales/ExportSales";

type SalesPageProps = {
	organization: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	canEditSales: boolean;
	canEmitFiscal: boolean;
	canConfigureFiscal: boolean;
	exceptionalPresenceEnabled: boolean;
};

export default function SalesPage({ organization, canEditSales, canEmitFiscal, canConfigureFiscal, exceptionalPresenceEnabled }: SalesPageProps) {
	return (
		<div className="flex h-full w-full flex-col gap-3">
			<div className="flex items-center justify-end">
				<SalesModuleActions orgHasERPAccess={organization.configuracao.recursos.erp.acesso} />
			</div>
			<SalesHistoryView
				canEditSales={canEditSales}
				canEmitFiscal={canEmitFiscal}
				canConfigureFiscal={canConfigureFiscal}
				exceptionalPresenceEnabled={exceptionalPresenceEnabled}
				orgHasERPAccess={organization.configuracao.recursos.erp.acesso}
			/>
		</div>
	);
}
/*

	// Organizações sem o módulo de ERP não veem a interface de abas: só o histórico.
	return (
		<div className="flex h-full w-full flex-col gap-3">
			<Tabs
				value={activeView}
				onValueChange={(value) => void setViewMode(value as SalesView, { history: "replace" })}
				className="flex h-full w-full flex-col"
			>
				<div className={tabsPageToolbarClassName}>
					<TabsList variant="page">
						<TabsTrigger value="historico">
							<ReceiptText className="h-4 w-4 min-h-4 min-w-4" />
							Histórico
						</TabsTrigger>
						<TabsTrigger value="atendimento">
							<LayoutGrid className="h-4 w-4 min-h-4 min-w-4" />
							Atendimento
						</TabsTrigger>
						<TabsTrigger value="preparo">
							<ChefHat className="h-4 w-4 min-h-4 min-w-4" />
							Preparo
						</TabsTrigger>
						<TabsTrigger value="aprovacoes">
							<GitPullRequestArrow className="h-4 w-4 min-h-4 min-w-4" />
							Aprovações
						</TabsTrigger>
					</TabsList>
					<div className={tabsPageToolbarActionsClassName}>
						<SalesModuleActions orgHasERPAccess />
					</div>
				</div>
				<TabsContent value="historico" className="mt-3 flex flex-col gap-3">
					<SalesHistoryView canEditSales={canEditSales} />
				</TabsContent>
				<TabsContent value="atendimento" className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
					<FulfillmentBoard
						organizationId={organization.id}
						organizationConfig={organization.configuracao}
						canEditSales={canEditSales}
						onViewDetails={(saleId) => void setSelectedSaleId(saleId, { history: "push" })}
					/>
				</TabsContent>
				<TabsContent value="preparo" className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
					<PreparationBoard />
				</TabsContent>
				<TabsContent value="aprovacoes" className="mt-3 flex flex-col gap-3">
					<ActionApprovalsQueue orgId={organization.id} canApprove={canApproveActionRequests} />
				</TabsContent>
			</Tabs>
			{selectedSaleId ? (
				<SaleFulfillmentDetailsMenu saleId={selectedSaleId} closeMenu={closeSaleDetails} canEditSales={canEditSales} canDeleteSales={canDeleteSales} />
			) : null}
		</div>
	);
}

*/
export function SalesModuleActions({ orgHasERPAccess }: { orgHasERPAccess: boolean }) {
	return (
		<ActionToolbar>
			<ActionToolbar.Action asChild icon={FileSpreadsheet}>
				<Link href={appRoutes.sales.import()}>IMPORTAR VENDAS</Link>
			</ActionToolbar.Action>
			{orgHasERPAccess ? (
				<ActionToolbar.Primary asChild icon={Plus}>
					<Link href={appRoutes.sales.new()}>NOVA VENDA</Link>
				</ActionToolbar.Primary>
			) : null}
		</ActionToolbar>
	);
}

export function SalesHistoryView({
	canEditSales,
	canEmitFiscal,
	canConfigureFiscal,
	exceptionalPresenceEnabled,
	orgHasERPAccess,
}: {
	canEditSales: boolean;
	canEmitFiscal: boolean;
	canConfigureFiscal: boolean;
	exceptionalPresenceEnabled: boolean;
	orgHasERPAccess: boolean;
}) {
	// Filtros na URL (nuqs): compartilháveis e alvo de links de outras telas (ex.: resultados).
	const [urlState, setUrlState] = useQueryStates(salesHistoryParsers, {
		history: "replace",
	});
	const params = toSalesHistoryInput(urlState);
	const updateParams = (next: Partial<TGetSalesInput>) => {
		const { clientId: _clientId, ...urlNext } = next;
		void setUrlState(urlNext);
	};
	const { data: salesResult, isLoading, isError, isSuccess, error } = useSalesQuery({ params });
	const [exportSalesModalIsOpen, setExportSalesModalIsOpen] = useState(false);

	const sales = salesResult?.sales;
	const salesShowing = sales ? sales.length : 0;
	const salesMatched = salesResult?.salesMatched || 0;
	const totalPages = salesResult?.totalPages;

	return (
		<div className="flex h-full w-full flex-col gap-3">
			<div className="flex w-full items-center gap-2">
				<Input
					value={params.search ?? ""}
					placeholder="Pesquisar venda (nome do cliente)..."
					onChange={(e) => updateParams({ search: e.target.value })}
					className="grow rounded-xl"
				/>
				<Button variant="ghost" className="flex items-center gap-2" size="sm" onClick={() => setExportSalesModalIsOpen(true)}>
					<FileSpreadsheet className="h-4 w-4 min-h-4 min-w-4" />
					EXPORTAR
				</Button>
			</div>
			<SalesInlineFilters filters={params} updateFilters={updateParams} orgHasERPAccess={orgHasERPAccess} />

			<GeneralPaginationComponent
				activePage={params.page}
				queryLoading={isLoading}
				selectPage={(page) => updateParams({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={salesMatched > 0 ? `${salesMatched} vendas encontradas.` : `${salesMatched} venda encontrada.`}
				itemsShowingText={salesShowing > 0 ? `Mostrando ${salesShowing} vendas.` : `Mostrando ${salesShowing} venda.`}
			/>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && sales ? (
				sales.length > 0 ? (
					sales.map((sale) => (
						<SaleCard
							key={sale.id}
							sale={sale}
							canEditSales={canEditSales}
							canEmitFiscal={canEmitFiscal}
							canConfigureFiscal={canConfigureFiscal}
							exceptionalPresenceEnabled={exceptionalPresenceEnabled}
						/>
					))
				) : (
					<p className="w-full tracking-tight text-center">Nenhuma venda encontrada.</p>
				)
			) : null}
			{exportSalesModalIsOpen ? <ExportSales filters={params} closeModal={() => setExportSalesModalIsOpen(false)} /> : null}
		</div>
	);
}

const FINANCIAL_STATUS_FILTER_OPTIONS: InteractiveFilterOption<TSaleFinancialDerivedStatusEnum>[] = [
	{
		id: "NAO_GERADO",
		value: "NAO_GERADO",
		label: "NÃO GERADO",
		startContent: <CircleOff className="h-4 w-4 text-muted-foreground" />,
	},
	{
		id: "PENDENTE",
		value: "PENDENTE",
		label: "A RECEBER",
		startContent: <Clock className="h-4 w-4 text-blue-600" />,
	},
	{
		id: "PARCIALMENTE_RECEBIDA",
		value: "PARCIALMENTE_RECEBIDA",
		label: "PARCIALMENTE RECEBIDA",
		startContent: <CircleDashed className="h-4 w-4 text-amber-600" />,
	},
	{
		id: "RECEBIDA",
		value: "RECEBIDA",
		label: "RECEBIDA",
		startContent: <CheckCircle2 className="h-4 w-4 text-green-600" />,
	},
	{
		id: "EM_ATRASO",
		value: "EM_ATRASO",
		label: "EM ATRASO",
		startContent: <CircleAlert className="h-4 w-4 text-destructive" />,
	},
];

const FISCAL_STATUS_FILTER_OPTIONS: InteractiveFilterOption<TSaleFiscalDerivedStatusEnum>[] = [
	{
		id: "NAO_EMITIDO",
		value: "NAO_EMITIDO",
		label: "SEM NOTA",
		startContent: <CircleOff className="h-4 w-4 text-muted-foreground" />,
	},
	{
		id: "PENDENTE",
		value: "PENDENTE",
		label: "PENDENTE",
		startContent: <Clock className="h-4 w-4 text-blue-600" />,
	},
	{
		id: "EM_PROCESSAMENTO",
		value: "EM_PROCESSAMENTO",
		label: "EM PROCESSAMENTO",
		startContent: <LoaderCircle className="h-4 w-4 text-blue-600" />,
	},
	{
		id: "AUTORIZADO",
		value: "AUTORIZADO",
		label: "AUTORIZADA",
		startContent: <CheckCircle2 className="h-4 w-4 text-green-600" />,
	},
	{
		id: "REJEITADO",
		value: "REJEITADO",
		label: "REJEITADA",
		startContent: <CircleAlert className="h-4 w-4 text-destructive" />,
	},
	{
		id: "ERRO",
		value: "ERRO",
		label: "ERRO FISCAL",
		startContent: <CircleAlert className="h-4 w-4 text-destructive" />,
	},
	{
		id: "CANCELADO",
		value: "CANCELADO",
		label: "CANCELADA",
		startContent: <Ban className="h-4 w-4 text-muted-foreground" />,
	},
	{
		id: "INUTILIZADO",
		value: "INUTILIZADO",
		label: "INUTILIZADA",
		startContent: <FileX2 className="h-4 w-4 text-muted-foreground" />,
	},
];

/**
 * Status comercial da venda. `CONFIRMADA` não tem entrada de propósito: é a norma do histórico, e um
 * selo em toda linha não diferencia nada.
 *
 * `ORCAMENTO` sai do cinza dos demais metadados porque não é um atributo da venda — é o aviso de que
 * ela não aconteceu ainda. O azul é o mesmo que a pill de orçamentos usa no PDV e no atendimento:
 * uma cor só para "em aberto" nas três superfícies.
 */
const SALE_STATUS_CHIP_META: Record<string, { label: string; className: string; icon: ReactNode }> = {
	ORCAMENTO: {
		label: SALE_STATUS_LABELS.ORCAMENTO,
		className: "border-primary/25 bg-primary/10 text-primary",
		icon: <FileText className="w-3 h-3" />,
	},
	CONDICIONAL: {
		label: SALE_STATUS_LABELS.CONDICIONAL,
		className: "border-border/60 bg-muted/30 text-foreground/80",
		icon: <Info className="w-3 h-3" />,
	},
	CANCELADA: {
		label: SALE_STATUS_LABELS.CANCELADA,
		className: "border-destructive/30 bg-destructive/10 text-destructive",
		icon: <Ban className="w-3 h-3" />,
	},
};

const PAYMENT_METHOD_FILTER_OPTIONS: InteractiveFilterOption<TPaymentMethodEnum>[] = PaymentMethodEnum.options.map((metodo) => ({
	id: metodo,
	value: metodo,
	label: PAYMENT_METHOD_CHIP_LABELS[metodo],
}));

const DELIVERY_MODE_FILTER_OPTIONS: InteractiveFilterOption<TDeliveryModeEnum>[] = DeliveryModeEnum.options.map((modalidade) => {
	const meta = DELIVERY_MODE_META[modalidade];
	const Icon = meta?.icon;
	return {
		id: modalidade,
		value: modalidade,
		label: (meta?.label ?? modalidade).toUpperCase(),
		startContent: Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : undefined,
	};
});

const SALE_STATUS_FILTER_OPTIONS: InteractiveFilterOption<TSaleStatusEnum>[] = [
	{
		id: "ORCAMENTO",
		value: "ORCAMENTO",
		label: "ORÇAMENTO",
		startContent: <FileText className="h-4 w-4 text-primary" />,
	},
	{
		id: "CONDICIONAL",
		value: "CONDICIONAL",
		label: "CONDICIONAL",
		startContent: <Info className="h-4 w-4 text-blue-600" />,
	},
	{
		id: "CONFIRMADA",
		value: "CONFIRMADA",
		label: "CONFIRMADA",
		startContent: <CheckCircle2 className="h-4 w-4 text-green-600" />,
	},
	{
		id: "CANCELADA",
		value: "CANCELADA",
		label: "CANCELADA",
		startContent: <Ban className="h-4 w-4 text-destructive" />,
	},
];

/**
 * Vive fora de `SaleErpSummaryChips` porque não é informação de ERP: `sale.erp` vem null nas
 * organizações sem o módulo, e a linha de um orçamento não pode deixar de dizer que é um orçamento
 * por causa do plano contratado.
 */
function SaleStatusChip({ statusVenda }: { statusVenda: string | null }) {
	const meta = statusVenda ? SALE_STATUS_CHIP_META[statusVenda] : undefined;
	if (!meta) return null;

	return (
		<SaleChip icon={meta.icon} className={meta.className}>
			{meta.label}
		</SaleChip>
	);
}

// Pill padrão de metadados do card de venda (data, itens, chips de ERP).
// Uma única geometria para toda a linha de metadados; a cor é o que diferencia o estado.
function SaleChip({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[0.65rem] font-semibold tracking-tight text-foreground/80",
				className,
			)}
		>
			{icon}
			{children}
		</span>
	);
}

// Chips de resumo ERP: métodos de pagamento + situação do recebimento e da emissão fiscal.
// Retorna um fragmento para compor a mesma linha de metadados do card.
// Só renderiza para organizações com o módulo de ERP (sale.erp vem null nas demais).
function SaleErpSummaryChips({ sale }: { sale: TGetSalesOutputDefault["sales"][number] }) {
	const erp = sale.erp;
	if (!erp) return null;

	const financialMeta = SALE_FINANCIAL_STATUS_PRESENTATION[erp.financeiro.status];
	const fiscalMeta = SALE_FISCAL_STATUS_PRESENTATION[erp.fiscal.status];
	// Com um único método o rótulo fica só no nome; com mais de um, cada método carrega seu valor
	// líquido — o sinal cobre o troco cruzado (pagou PIX, levou troco em espécie: "DINHEIRO −R$ 22,00").
	const paymentLabel = erp.financeiro.metodos
		.map((pagamento) => {
			const label = PAYMENT_METHOD_CHIP_LABELS[pagamento.metodo] ?? pagamento.metodo;
			if (erp.financeiro.metodos.length <= 1) return label;
			return `${label} ${pagamento.valor < 0 ? "−" : ""}${formatToMoney(Math.abs(pagamento.valor))}`;
		})
		.join(" + ");
	const installmentsLabel = erp.financeiro.maxParcelas && erp.financeiro.maxParcelas > 1 ? ` ${erp.financeiro.maxParcelas}x` : "";
	const fiscalNumberLabel = erp.fiscal.documento?.numero ? `${erp.fiscal.documento.tipo} Nº ${erp.fiscal.documento.numero} · ` : "";

	return (
		<>
			{financialMeta && paymentLabel ? (
				<SaleChip icon={<Wallet className="w-3 h-3" />} className={financialMeta.className}>
					{paymentLabel}
					{installmentsLabel} · {financialMeta.chipLabel}
				</SaleChip>
			) : null}
			{fiscalMeta ? (
				<SaleChip icon={<ReceiptText className="w-3 h-3" />} className={fiscalMeta.className}>
					{fiscalNumberLabel}
					{fiscalMeta.chipLabel}
				</SaleChip>
			) : null}
		</>
	);
}

function SaleCard({
	sale,
	canEditSales,
	canEmitFiscal,
	canConfigureFiscal,
	exceptionalPresenceEnabled,
}: {
	sale: TGetSalesOutputDefault["sales"][number];
	canEditSales: boolean;
	canEmitFiscal: boolean;
	canConfigureFiscal: boolean;
	exceptionalPresenceEnabled: boolean;
}) {
	// O orçamento é a única linha do histórico que ainda não é dinheiro. A borda lateral marca isso
	// na varredura vertical, antes de qualquer selo ser lido.
	const isQuote = sale.statusVenda === "ORCAMENTO";

	return (
		<div
			className={cn(
				"bg-card border-border flex w-full flex-col gap-2.5 rounded-xl border px-4 py-3 shadow-2xs hover:border-border hover:shadow-sm transition-all cursor-pointer",
				isQuote && "border-l-2 border-l-primary/60 bg-primary/[0.03]",
			)}
		>
			<div className="flex flex-col md:flex-row md:items-start justify-between gap-2.5">
				{/* Client Info & Sale Basics */}
				<div className="flex flex-col gap-1.5 grow min-w-0">
					<div className="flex items-center gap-2">
						<CircleUser className="w-4 h-4 shrink-0 text-foreground/70" />
						<h1 className="text-sm font-bold tracking-tight uppercase truncate">{sale.cliente?.nome ?? "AO CONSUMIDOR"}</h1>
					</div>
					{/* Linha única de metadados: data, itens e chips de ERP compartilham a mesma geometria de pill */}
					<div className="flex items-center gap-1.5 flex-wrap">
						<SaleChip icon={<Calendar className="w-3 h-3" />}>{formatDateAsLocale(sale.dataVenda, true)}</SaleChip>
						<SaleChip icon={<Package className="w-3 h-3" />}>
							{sale.itens.length} {sale.itens.length === 1 ? "item" : "itens"}
						</SaleChip>
						<SaleStatusChip statusVenda={sale.statusVenda} />
						<SalesIntegrationPill integracao={sale.integracao} />
						<SaleErpSummaryChips sale={sale} />
					</div>
				</div>

				{/* Financials Summary — envolve no mobile, onde os três selos não cabem em uma linha */}
				<div className="flex items-center gap-1.5 flex-wrap md:flex-nowrap md:shrink-0">
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
					<div className="flex items-center gap-1.5 bg-primary/10 text-foreground px-2.5 py-1 rounded-md w-fit">
						<BadgeDollarSign className="w-4 h-4" />
						<span className="font-bold text-sm">{formatToMoney(sale.valorTotal)}</span>
					</div>
				</div>
			</div>

			{/* Rodapé: participantes à esquerda, ação à direita — uma linha só, sem meia-linha vazia */}
			<div className="flex items-center justify-between gap-3 pt-2.5 border-t border-border/50">
				<div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap min-w-0">
					{sale.vendedor && <SaleParticipant role="Vendedor" name={sale.vendedor.nome} avatarUrl={sale.vendedor.avatarUrl} />}
					{sale.parceiro && <SaleParticipant role="Parceiro" name={sale.parceiro.nome} avatarUrl={sale.parceiro.avatarUrl} />}
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<ManualFiscalEmissionButton
						sale={sale}
						canEmitFiscal={canEmitFiscal}
						canConfigureFiscal={canConfigureFiscal}
						exceptionalPresenceEnabled={exceptionalPresenceEnabled}
					/>
					<QuoteCheckoutButton sale={sale} canEditSales={canEditSales} />
					<Button variant="link" className="flex items-center gap-1.5 h-auto shrink-0 p-0" size="sm" asChild>
						<Link href={appRoutes.sales.details(sale.id)}>
							<Info className="w-3 min-w-3 h-3 min-h-3" />
							DETALHES
						</Link>
					</Button>
					<SaleCardActionsMenu sale={sale} canEditSales={canEditSales} />
				</div>
			</div>
		</div>
	);
}

/**
 * Converter é a ação principal de um orçamento — a venda existe justamente para ser cobrada. Ficava
 * só no menu de três pontos, ao lado de "imprimir cupom", como se fosse mais um atalho.
 *
 * Ocupa o mesmo lugar que "EMITIR NOTA FISCAL" ocupa numa venda confirmada: os dois estados são
 * excludentes, então a linha do rodapé nunca cresce.
 */
function QuoteCheckoutButton({ sale, canEditSales }: { sale: TGetSalesOutputDefault["sales"][number]; canEditSales: boolean }) {
	// Mesma habilitação otimista do menu de ações: o checkout é o GET autoritativo.
	if (!canEditSales || sale.statusVenda !== "ORCAMENTO" || sale.processamentoOrigem !== "INTERNO") return null;

	return (
		<Button asChild type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[0.65rem] font-bold">
			<Link href={appRoutes.sales.checkout(sale.id)}>
				<ShoppingBag className="h-3.5 w-3.5" />
				ABRIR CHECKOUT
			</Link>
		</Button>
	);
}

const MANUALLY_EMITTABLE_FISCAL_STATUSES = new Set(["NAO_EMITIDO", "REJEITADO", "ERRO", "CANCELADO", "INUTILIZADO"]);

function ManualFiscalEmissionButton({
	sale,
	canEmitFiscal,
	canConfigureFiscal,
	exceptionalPresenceEnabled,
}: {
	sale: TGetSalesOutputDefault["sales"][number];
	canEmitFiscal: boolean;
	canConfigureFiscal: boolean;
	exceptionalPresenceEnabled: boolean;
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	const fiscalStatus = sale.erp?.fiscal.status;
	const canEmit = canEmitFiscal && sale.statusVenda === "CONFIRMADA" && !!fiscalStatus && MANUALLY_EMITTABLE_FISCAL_STATUSES.has(fiscalStatus);

	if (!canEmit) return null;

	return (
		<>
			<Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[0.65rem] font-bold" onClick={() => setMenuOpen(true)}>
				<ReceiptText className="h-3.5 w-3.5" />
				EMITIR NOTA FISCAL
			</Button>
			{menuOpen ? (
				<ManualFiscalEmission
					saleId={sale.id}
					entregaModalidade={sale.entregaModalidade}
					exceptionalPresenceEnabled={exceptionalPresenceEnabled}
					canConfigureFiscal={canConfigureFiscal}
					closeMenu={() => setMenuOpen(false)}
				/>
			) : null}
		</>
	);
}

// Participante do rodapé em linha única: avatar + papel + nome, para manter o card compacto.
function SaleParticipant({ role, name, avatarUrl }: { role: string; name: string; avatarUrl: string | null }) {
	return (
		<div className="flex items-center gap-1.5 min-w-0">
			<Avatar className="w-5 h-5 shrink-0">
				<AvatarImage src={avatarUrl ?? undefined} alt={name} />
				<AvatarFallback className="text-[0.55rem]">{formatNameAsInitials(name)}</AvatarFallback>
			</Avatar>
			<span className="text-[0.6rem] text-muted-foreground font-medium uppercase tracking-tight">{role}</span>
			<span className="text-xs font-bold tracking-tight truncate">{name}</span>
		</div>
	);
}

// Menu de ações rápidas da venda (mesmo padrão do módulo fiscal): atalhos + impressão de cupom
// via agente desktop. O botão de impressão fica desabilitado enquanto nenhuma impressora ativa
// atender à finalidade CUPOM_VENDA.
function SaleCardActionsMenu({ sale, canEditSales }: { sale: TGetSalesOutputDefault["sales"][number]; canEditSales: boolean }) {
	const { data: printers } = useAgentPrinters();
	const canPrintCupom = organizationHasPrinterForFinalidade(printers, "CUPOM_VENDA");

	// Habilitação otimista: as linhas da lista não carregam transações/documentos, então a página
	// de edição (GET autoritativo) renderiza a recusa com a razão quando a política não permitir.
	const saleIsInternal = sale.processamentoOrigem === "INTERNO";
	const editHref = sale.statusVenda === "ORCAMENTO" ? appRoutes.sales.checkout(sale.id) : appRoutes.sales.edit(sale.id);
	const canOpenEdit = canEditSales && saleIsInternal && (sale.statusVenda === "CONFIRMADA" || sale.statusVenda === "ORCAMENTO");

	const { mutate: printCupom, isPending: printIsPending } = useMutation({
		mutationKey: ["print-sale-cupom", sale.id],
		mutationFn: createManualPrintJob,
		onSuccess: (data) => toast.success(data.message),
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="ghost" size="icon" aria-label="Mais ações da venda">
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Ações rápidas</DropdownMenuLabel>
					<DropdownMenuItem
						render={
							<Link href={appRoutes.sales.details(sale.id)}>
								<Info className="h-4 w-4" />
								VER DETALHES
							</Link>
						}
					/>
					{canOpenEdit ? (
						<DropdownMenuItem
							render={
								<Link href={editHref}>
									<PencilLine className="h-4 w-4" />
									{sale.statusVenda === "ORCAMENTO" ? "ABRIR CHECKOUT" : "EDITAR VENDA"}
								</Link>
							}
						/>
					) : null}
					{sale.cliente ? (
						<DropdownMenuItem
							render={
								<Link href={appRoutes.customers.details(sale.cliente.id)}>
									<CircleUser className="h-4 w-4" />
									VER CLIENTE
								</Link>
							}
						/>
					) : (
						<DropdownMenuItem disabled>
							<CircleUser className="h-4 w-4" />
							VER CLIENTE
						</DropdownMenuItem>
					)}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem disabled={!canPrintCupom || printIsPending} onClick={() => printCupom({ finalidade: "CUPOM_VENDA", vendaId: sale.id })}>
						<Printer className="h-4 w-4" />
						IMPRIMIR CUPOM
					</DropdownMenuItem>
					{!canPrintCupom ? (
						<p className="px-2 pb-1.5 pt-0.5 text-[0.65rem] leading-tight text-muted-foreground">
							Nenhuma impressora ativa atende a cupons. Configure em Configurações → Dispositivos.
						</p>
					) : null}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// Presença de desconto: o valor vai à URL como "true"/"false" (nuqs parseAsBoolean) e à API igual.
type TDiscountFilterValue = "true" | "false";
const DISCOUNT_FILTER_OPTIONS: InteractiveFilterOption<TDiscountFilterValue>[] = [
	{
		id: "with-discount",
		value: "true",
		label: "COM DESCONTO",
		startContent: <BadgePercent className="h-4 w-4 text-orange-600" />,
	},
	{
		id: "without-discount",
		value: "false",
		label: "SEM DESCONTO",
		startContent: <CircleOff className="h-4 w-4 text-muted-foreground" />,
	},
];
function toDiscountFilterValue(hasDiscount: boolean | null | undefined): TDiscountFilterValue | null {
	return hasDiscount === true ? "true" : hasDiscount === false ? "false" : null;
}

type SalesInlineFiltersProps = {
	filters: TGetSalesInput;
	updateFilters: (filters: Partial<TGetSalesInput>) => void;
	orgHasERPAccess: boolean;
};

function SalesInlineFilters({ filters, updateFilters, orgHasERPAccess }: SalesInlineFiltersProps) {
	const { data: filterOptions } = useSaleQueryFilterOptions();
	const integrationOptions = buildSalesIntegrationFilterOptions(filterOptions?.integrations);
	const sellerOptions = (filterOptions?.sellers ?? []) as InteractiveFilterOption<string>[];
	const partnerOptions = (filterOptions?.partners ?? []) as InteractiveFilterOption<string>[];
	const hasIntegrations = (filters.integrationsIds ?? []).length > 0;
	const hasSellers = (filters.sellersIds ?? []).length > 0;
	const hasPartners = (filters.partnersIds ?? []).length > 0;
	const hasFinancialStatuses = filters.financialStatuses.length > 0;
	const hasFiscalStatuses = filters.fiscalStatuses.length > 0;
	const hasPaymentMethods = filters.paymentMethods.length > 0;
	const hasDeliveryModes = filters.deliveryModes.length > 0;
	const hasSaleStatuses = filters.saleStatuses.length > 0;
	const discountFilterValue = toDiscountFilterValue(filters.hasDiscount);
	const hasDiscountFilter = discountFilterValue !== null;

	return (
		<div className="flex w-full flex-wrap items-center gap-2">
			<InteractiveFilter.Root className="w-fit">
				<InteractiveFilter.Trigger>
					<InteractiveFilter.Icon>
						<Calendar className="h-4 w-4" />
						<InteractiveFilter.Label>PERÍODO</InteractiveFilter.Label>
					</InteractiveFilter.Icon>
					<InteractiveFilter.Value>{formatInteractiveDateRangeSummary(filters.periodAfter, filters.periodBefore)}</InteractiveFilter.Value>
					<InteractiveFilter.Clear onClear={() => updateFilters({ periodAfter: null, periodBefore: null, page: 1 })} />
				</InteractiveFilter.Trigger>
				<InteractiveFilter.Content className="w-auto p-0">
					<InteractiveFilter.DateRangeContent
						value={{
							from: filters.periodAfter ? new Date(filters.periodAfter) : undefined,
							to: filters.periodBefore ? new Date(filters.periodBefore) : undefined,
						}}
						onChange={(period) =>
							updateFilters({
								periodAfter: period.from ?? null,
								periodBefore: period.to ?? null,
								page: 1,
							})
						}
					/>
				</InteractiveFilter.Content>
			</InteractiveFilter.Root>

			{hasIntegrations ? (
				<SalesMultiFilter
					icon={<Tag className="h-4 w-4" />}
					label="INTEGRAÇÕES"
					options={integrationOptions}
					value={filters.integrationsIds ?? []}
					onChange={(integrationsIds) => updateFilters({ integrationsIds, page: 1 })}
					onClear={() => updateFilters({ integrationsIds: [], page: 1 })}
					clearLabel="TODAS"
				/>
			) : null}
			{hasSellers ? (
				<SalesMultiFilter
					icon={<CircleUser className="h-4 w-4" />}
					label="VENDEDORES"
					options={sellerOptions}
					value={filters.sellersIds ?? []}
					onChange={(sellersIds) => updateFilters({ sellersIds, page: 1 })}
					onClear={() => updateFilters({ sellersIds: [], page: 1 })}
				/>
			) : null}
			{hasPartners ? (
				<SalesMultiFilter
					icon={<CircleUser className="h-4 w-4" />}
					label="PARCEIROS"
					options={partnerOptions}
					value={filters.partnersIds ?? []}
					onChange={(partnersIds) => updateFilters({ partnersIds, page: 1 })}
					onClear={() => updateFilters({ partnersIds: [], page: 1 })}
				/>
			) : null}
			{hasSaleStatuses ? (
				<SalesMultiFilter
					icon={<FileText className="h-4 w-4" />}
					label="STATUS"
					options={SALE_STATUS_FILTER_OPTIONS}
					value={filters.saleStatuses}
					onChange={(saleStatuses) => updateFilters({ saleStatuses, page: 1 })}
					onClear={() => updateFilters({ saleStatuses: [], page: 1 })}
				/>
			) : null}
			{orgHasERPAccess && hasFinancialStatuses ? (
				<SalesMultiFilter
					icon={<Wallet className="h-4 w-4" />}
					label="RECEBIMENTO"
					options={FINANCIAL_STATUS_FILTER_OPTIONS}
					value={filters.financialStatuses}
					onChange={(financialStatuses) => updateFilters({ financialStatuses, page: 1 })}
					onClear={() => updateFilters({ financialStatuses: [], page: 1 })}
				/>
			) : null}
			{orgHasERPAccess && hasFiscalStatuses ? (
				<SalesMultiFilter
					icon={<ReceiptText className="h-4 w-4" />}
					label="FISCAL"
					options={FISCAL_STATUS_FILTER_OPTIONS}
					value={filters.fiscalStatuses}
					onChange={(fiscalStatuses) => updateFilters({ fiscalStatuses, page: 1 })}
					onClear={() => updateFilters({ fiscalStatuses: [], page: 1 })}
				/>
			) : null}
			{orgHasERPAccess && hasPaymentMethods ? (
				<SalesMultiFilter
					icon={<CreditCard className="h-4 w-4" />}
					label="PAGAMENTO"
					options={PAYMENT_METHOD_FILTER_OPTIONS}
					value={filters.paymentMethods}
					onChange={(paymentMethods) => updateFilters({ paymentMethods, page: 1 })}
					onClear={() => updateFilters({ paymentMethods: [], page: 1 })}
				/>
			) : null}
			{hasDeliveryModes ? (
				<SalesMultiFilter
					icon={<Truck className="h-4 w-4" />}
					label="MODALIDADE"
					options={DELIVERY_MODE_FILTER_OPTIONS}
					value={filters.deliveryModes}
					onChange={(deliveryModes) => updateFilters({ deliveryModes, page: 1 })}
					onClear={() => updateFilters({ deliveryModes: [], page: 1 })}
				/>
			) : null}
			{hasDiscountFilter ? (
				<SalesSingleFilter
					icon={<BadgePercent className="h-4 w-4" />}
					label="DESCONTO"
					options={DISCOUNT_FILTER_OPTIONS}
					value={discountFilterValue}
					onChange={(value) => updateFilters({ hasDiscount: value === "true", page: 1 })}
					onClear={() => updateFilters({ hasDiscount: null, page: 1 })}
				/>
			) : null}

			<InteractiveFilter.AddFilterRoot className="w-fit">
				<InteractiveFilter.AddFilterTrigger>
					<ListFilter className="h-4 w-4" />
					<InteractiveFilter.Label>ADICIONAR FILTRO</InteractiveFilter.Label>
				</InteractiveFilter.AddFilterTrigger>
				<InteractiveFilter.AddFilterContent>
					<InteractiveFilter.AddFilterSection heading="Filtros">
						{!hasIntegrations ? (
							<InteractiveFilter.AddFilterItem id="integrations" label="INTEGRAÇÕES" icon={<Tag className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={integrationOptions}
									value={filters.integrationsIds ?? []}
									onChange={(integrationsIds) => updateFilters({ integrationsIds, page: 1 })}
									onClear={() => updateFilters({ integrationsIds: [], page: 1 })}
									clearLabel="TODAS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasSellers ? (
							<InteractiveFilter.AddFilterItem id="sellers" label="VENDEDORES" icon={<CircleUser className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={sellerOptions}
									value={filters.sellersIds ?? []}
									onChange={(sellersIds) => updateFilters({ sellersIds, page: 1 })}
									onClear={() => updateFilters({ sellersIds: [], page: 1 })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasPartners ? (
							<InteractiveFilter.AddFilterItem id="partners" label="PARCEIROS" icon={<CircleUser className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={partnerOptions}
									value={filters.partnersIds ?? []}
									onChange={(partnersIds) => updateFilters({ partnersIds, page: 1 })}
									onClear={() => updateFilters({ partnersIds: [], page: 1 })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasSaleStatuses ? (
							<InteractiveFilter.AddFilterItem id="sale-statuses" label="STATUS" icon={<FileText className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={SALE_STATUS_FILTER_OPTIONS}
									value={filters.saleStatuses}
									onChange={(saleStatuses) => updateFilters({ saleStatuses, page: 1 })}
									onClear={() => updateFilters({ saleStatuses: [], page: 1 })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{orgHasERPAccess && !hasFinancialStatuses ? (
							<InteractiveFilter.AddFilterItem id="financial-statuses" label="RECEBIMENTO" icon={<Wallet className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={FINANCIAL_STATUS_FILTER_OPTIONS}
									value={filters.financialStatuses}
									onChange={(financialStatuses) => updateFilters({ financialStatuses, page: 1 })}
									onClear={() => updateFilters({ financialStatuses: [], page: 1 })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{orgHasERPAccess && !hasFiscalStatuses ? (
							<InteractiveFilter.AddFilterItem id="fiscal-statuses" label="FISCAL" icon={<ReceiptText className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={FISCAL_STATUS_FILTER_OPTIONS}
									value={filters.fiscalStatuses}
									onChange={(fiscalStatuses) => updateFilters({ fiscalStatuses, page: 1 })}
									onClear={() => updateFilters({ fiscalStatuses: [], page: 1 })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{orgHasERPAccess && !hasPaymentMethods ? (
							<InteractiveFilter.AddFilterItem id="payment-methods" label="PAGAMENTO" icon={<CreditCard className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={PAYMENT_METHOD_FILTER_OPTIONS}
									value={filters.paymentMethods}
									onChange={(paymentMethods) => updateFilters({ paymentMethods, page: 1 })}
									onClear={() => updateFilters({ paymentMethods: [], page: 1 })}
									clearLabel="TODOS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasDeliveryModes ? (
							<InteractiveFilter.AddFilterItem id="delivery-modes" label="MODALIDADE" icon={<Truck className="h-4 w-4" />}>
								<InteractiveFilter.MultiContent
									options={DELIVERY_MODE_FILTER_OPTIONS}
									value={filters.deliveryModes}
									onChange={(deliveryModes) => updateFilters({ deliveryModes, page: 1 })}
									onClear={() => updateFilters({ deliveryModes: [], page: 1 })}
									clearLabel="TODAS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
						{!hasDiscountFilter ? (
							<InteractiveFilter.AddFilterItem id="discount" label="DESCONTO" icon={<BadgePercent className="h-4 w-4" />}>
								<InteractiveFilter.SingleContent
									options={DISCOUNT_FILTER_OPTIONS}
									value={discountFilterValue}
									onChange={(value) => updateFilters({ hasDiscount: value === "true", page: 1 })}
									onClear={() => updateFilters({ hasDiscount: null, page: 1 })}
									clearLabel="TODAS"
								/>
							</InteractiveFilter.AddFilterItem>
						) : null}
					</InteractiveFilter.AddFilterSection>
				</InteractiveFilter.AddFilterContent>
			</InteractiveFilter.AddFilterRoot>
		</div>
	);
}

function SalesSingleFilter<T extends string>({
	icon,
	label,
	options,
	value,
	onChange,
	onClear,
	clearLabel = "TODAS",
}: {
	icon: ReactNode;
	label: string;
	options: InteractiveFilterOption<T>[];
	value: T | null;
	onChange: (value: T) => void;
	onClear: () => void;
	clearLabel?: string;
}) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					{icon}
					<InteractiveFilter.Label>{label}</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveOptionSummary(options, value === null ? [] : [value])}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={onClear} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-60 p-0">
				<InteractiveFilter.SingleContent options={options} value={value} onChange={onChange} onClear={onClear} clearLabel={clearLabel} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function SalesMultiFilter<T extends string>({
	icon,
	label,
	options,
	value,
	onChange,
	onClear,
	clearLabel = "TODOS",
}: {
	icon: ReactNode;
	label: string;
	options: InteractiveFilterOption<T>[];
	value: T[];
	onChange: (value: T[]) => void;
	onClear: () => void;
	clearLabel?: string;
}) {
	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					{icon}
					<InteractiveFilter.Label>{label}</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveOptionSummary(options, value)}</InteractiveFilter.Value>
				<InteractiveFilter.Clear onClear={onClear} />
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-72 p-0">
				<InteractiveFilter.MultiContent options={options} value={value} onChange={onChange} onClear={onClear} clearLabel={clearLabel} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}
