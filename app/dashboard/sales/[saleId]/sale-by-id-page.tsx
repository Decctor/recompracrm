"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { ClientDuplicatePill } from "@/components/Clients/duplicates/ClientDuplicatePill";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { PageHeader } from "@/components/Layouts/PageHeader";
import { CancelConfirmedSaleDialog } from "@/components/Modals/Sales/CancelConfirmedSaleDialog";
import { LoadingButton } from "@/components/loading-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Section } from "@/components/ui/section";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getAgeFromBirthdayDate } from "@/lib/dates";
import { getErrorMessage } from "@/lib/errors";
import { appRoutes } from "@/lib/navigation/routes";
import { formatDateAsLocale, formatDateBirthdayAsLocale, formatNameAsInitials, formatToMoney, formatToPhone } from "@/lib/formatting";
import { FiscalProblemCta } from "@/components/Fiscal/FiscalProblemCta";
import {
	FISCAL_PROBLEM_CATEGORY_LABELS,
	findFiscalAction,
	formatRemainingTime,
	pickPrimaryFiscalProblem,
} from "@/components/Fiscal/fiscal-problem-presentation";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments/labels";
import { SALE_FINANCIAL_STATUS_PRESENTATION, SALE_FISCAL_STATUS_PRESENTATION } from "@/lib/sales/status-presentation";
import { mapInternalFiscalStatus } from "@/lib/sales/utils";
import { useSalesById } from "@/lib/queries/sales";
import { cn } from "@/lib/utils";
import type { TGetSalesOutputById } from "@/app/api/sales/route";
import {
	AlertTriangle,
	ArrowRight,
	BadgeDollarSign,
	BadgePercent,
	Calendar,
	CircleUser,
	CircleX,
	Clock,
	Code,
	Diamond,
	FileCode,
	FileText,
	Grid3X3,
	Mail,
	MapPin,
	Megaphone,
	Package,
	PencilLine,
	Phone,
	Receipt,
	ReceiptText,
	ShoppingCart,
	Tag,
	Ticket,
	Trash,
	TrendingDown,
	TrendingUp,
	Truck,
	Wallet,
	SquareArrowOutUpRight,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteSale } from "@/lib/mutations/sales";
import { useRouter } from "next/navigation";

type SaleByIdPageProps = {
	saleId: string;
	orgHasERPAccess: boolean;
	userCanDeleteSales: boolean;
	userCanEditSales: boolean;
	userCanReconcileClients: boolean;
	userCanViewFinances: boolean;
	userFiscalPermissions: {
		view: boolean;
		configure: boolean;
		emit: boolean;
		cancel: boolean;
	};
};

// Helper function to format time to conversion
function formatTimeToConversion(minutes: number): string {
	if (minutes < 60) return `${minutes}min`;
	if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
	return `${Math.round(minutes / 1440)}d`;
}

function formatCouponSource(source: TGetSalesOutputById["resgatesCupom"][number]["origemResgate"]) {
	if (source === "POS") return "POS";
	if (source === "LOJA_DIGITAL") return "Loja digital";
	if (source === "PONTO_INTERACAO") return "Ponto de interação";
	return source;
}

function formatCouponValidationMode(snapshot: TGetSalesOutputById["resgatesCupom"][number]["beneficioSnapshot"]) {
	if (!snapshot || typeof snapshot !== "object" || !("validacaoModo" in snapshot)) return null;
	const mode = snapshot.validacaoModo;
	if (mode === "AUTOMATICA") return "Validação automática";
	if (mode === "MANUAL") return "Validação manual";
	return typeof mode === "string" ? mode : null;
}

export default function SaleByIdPage({
	saleId,
	userCanDeleteSales,
	userCanEditSales,
	userCanReconcileClients,
	userCanViewFinances,
	userFiscalPermissions,
}: SaleByIdPageProps) {
	// `orgHasERPAccess` não é lido aqui de propósito: o gate real é o da API, que devolve
	// `erp: null` sem o módulo e `erp.fiscal: null` sem permissão fiscal. `userFiscalPermissions`
	// só decide se a CTA de resolver um problema fiscal (ex.: perfil do produto) fica habilitada.
	// Duplicar a regra no cliente criaria duas fontes de verdade que podem divergir.
	const { data: sale, isLoading, isError, error, isSuccess } = useSalesById({ id: saleId });

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!isSuccess || !sale) return <ErrorComponent msg="Venda não encontrada." />;

	return (
		// `min-h-full` e não `h-full`: esta página tem mais conteúdo que a viewport, e declarar
		// altura fixa faria as seções ou serem espremidas ou vazarem para fora de uma caixa que o
		// scrollport do layout não mede. Com altura mínima, a página cresce e o scroll é do layout.
		<div className="w-full flex flex-col gap-6 py-3">
			<PageHeader.Root>
				<PageHeader.Bar>
					<PageHeader.Back href={appRoutes.sales.root()} />
					<PageHeader.Actions>
						<SaleEditButton sale={sale} userCanEditSales={userCanEditSales} />
						<SaleCancelButton sale={sale} userCanDeleteSales={userCanDeleteSales} />
						<SaleDeleteButton sale={sale} userCanDeleteSales={userCanDeleteSales} />
					</PageHeader.Actions>
				</PageHeader.Bar>
				<PageHeader.Heading>
					<PageHeader.Title>Venda de {formatDateAsLocale(sale.dataVenda, true)}</PageHeader.Title>
				</PageHeader.Heading>
			</PageHeader.Root>

			{/* Sale Overview Section */}
			<div className="w-full flex flex-col lg:flex-row gap-4 lg:items-stretch">
				<div className="w-full lg:w-1/2 flex">
					<SaleOverviewSection sale={sale} />
				</div>
				<div className="w-full lg:w-1/2 flex">
					<ClientSection client={sale.cliente} canReconcile={userCanReconcileClients} />
				</div>
			</div>
			<div className="w-full flex flex-col lg:flex-row gap-4 lg:items-stretch">
				<div className="w-full lg:w-1/2 flex">
					<CampaignAttributionSection attribution={sale.atribuicaoCampanhaConversao} saleDate={sale.dataVenda} />
				</div>
				<div className="w-full lg:w-1/2 flex">
					<SaleBenefitsSection cashbackTransactions={sale.transacoesCashback} couponRedemptions={sale.resgatesCupom} />
				</div>
			</div>
			{/* ERP Section: só existe para organizações com o módulo (a API devolve erp: null nas demais). */}
			{sale.erp ? (
				<div className="w-full flex flex-col lg:flex-row gap-4 lg:items-stretch">
					<div className="w-full lg:w-1/2 flex">
						<SalePaymentsSection
							financeiro={sale.erp.financeiro}
							saleTotal={sale.valorTotal}
							processamentoOrigem={sale.processamentoOrigem}
							integracao={sale.integracao}
							userCanViewFinances={userCanViewFinances}
						/>
					</div>
					{sale.erp.fiscal ? (
						<div className="w-full lg:w-1/2 flex">
							<SaleFiscalSection fiscal={sale.erp.fiscal} canConfigureFiscal={userFiscalPermissions.configure} />
						</div>
					) : null}
				</div>
			) : null}
			{/* Sale Items Section */}
			<SaleItemsSection items={sale.itens} />
		</div>
	);
}

function SaleOverviewSection({ sale }: { sale: TGetSalesOutputById }) {
	const sellerName = sale.vendedor?.nome ?? "Não atribuído";
	const partnerName = sale.parceiro?.nome ?? "Não atribuído";
	const activeCouponRedemptions = sale.resgatesCupom.filter((redemption) => redemption.status === "UTILIZADO");
	const totalCouponDiscount = activeCouponRedemptions.reduce((sum, redemption) => sum + redemption.valorDesconto, 0);
	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Receipt className="w-4 h-4 min-w-4 min-h-4" />
				</Section.Icon>
				<Section.Title>VISÃO GERAL DA VENDA</Section.Title>
			</Section.Header>
			<Section.Body>
				<div className="w-full flex flex-col gap-2">
					<h1 className="text-xs leading-none tracking-tight">INFORMAÇÕES GERAIS</h1>
					<div className="w-full flex flex-col gap-1.5">
						<div className="w-full flex items-center gap-1.5">
							<Code className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">IDENTIFICADOR EXTERNO</h3>
							<h3 className="text-sm font-semibold tracking-tight">{sale.idExterno}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<BadgeDollarSign className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">VALOR</h3>
							<h3 className="text-sm font-semibold tracking-tight">{formatToMoney(sale.valorTotal)}</h3>
						</div>
						{activeCouponRedemptions.length > 0 ? (
							<div className="w-fit max-w-full flex items-center gap-1.5 rounded-full border border-brand/35 bg-brand/15 px-2.5 py-1 text-xs font-bold text-foreground">
								<Ticket className="w-3.5 h-3.5 text-brand" />
								<span className="truncate">
									{activeCouponRedemptions.length === 1 ? `CUPOM ${activeCouponRedemptions[0].cupomCodigo}` : `${activeCouponRedemptions.length} CUPONS`}
								</span>
								<span className="tabular-nums">-{formatToMoney(totalCouponDiscount)}</span>
							</div>
						) : null}

						<div className="w-full flex items-center gap-1.5">
							<Calendar className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">DATA DA VENDA</h3>
							<h3 className="text-sm font-semibold tracking-tight">{formatDateAsLocale(sale.dataVenda, true) || "DATA DA VENDA NÃO DEFINIDA"}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<Calendar className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">CANAL</h3>
							<h3 className="text-sm font-semibold tracking-tight">{sale.canal || "CANAL NÃO DEFINIDO"}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<Truck className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">MODALIDADE</h3>
							<h3 className="text-sm font-semibold tracking-tight">{sale.entregaModalidade || "MODALIDADE NÃO DEFINIDA"}</h3>
						</div>
						<div className="flex items-center gap-1.5">
							<Tag className="w-4 h-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">NATUREZA</h3>
							<h3 className="text-sm font-semibold tracking-tight">{sale.natureza}</h3>
						</div>
					</div>
				</div>
				<div className="w-full flex flex-col gap-2">
					<h1 className="text-xs leading-none tracking-tight">PARTICIPANTES</h1>
					<div className="w-full flex flex-col gap-1.5">
						<div className="w-full flex items-center gap-1.5">
							<Avatar className="w-5 h-5 min-w-5 min-h-5">
								<AvatarImage src={sale.vendedor?.avatarUrl ?? undefined} alt={sellerName} />
								<AvatarFallback className="text-xs uppercase">{formatNameAsInitials(sellerName)}</AvatarFallback>
							</Avatar>
							<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">VENDEDOR</h3>
							<h3 className="text-sm font-semibold tracking-tight">{sellerName}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<Avatar className="w-5 h-5 min-w-5 min-h-5">
								<AvatarImage src={sale.parceiro?.avatarUrl ?? undefined} alt={partnerName} />
								<AvatarFallback className="text-xs uppercase">{formatNameAsInitials(partnerName)}</AvatarFallback>
							</Avatar>
							<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">PARCEIRO</h3>
							<h3 className="text-sm font-semibold tracking-tight">{partnerName}</h3>
						</div>
					</div>
				</div>
			</Section.Body>
		</Section.Root>
	);
}

function ClientSection({ client, canReconcile }: { client: TGetSalesOutputById["cliente"]; canReconcile: boolean }) {
	if (!client)
		return (
			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<CircleUser className="w-4 h-4 min-w-4 min-h-4" />
					</Section.Icon>
					<Section.Title>CLIENTE</Section.Title>
				</Section.Header>
				<Section.Body>
					<div className="w-full flex flex-col items-center justify-center gap-3">
						<span className="text-sm font-medium text-muted-foreground">CLIENTE NÃO ATRIBUÍDO</span>
					</div>
				</Section.Body>
			</Section.Root>
		);
	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<CircleUser className="w-4 h-4 min-w-4 min-h-4" />
				</Section.Icon>
				<Section.Title>CLIENTE</Section.Title>
				<Section.Actions>
					<Button variant="ghost" size="xs" asChild>
						<Link href={`${appRoutes.customers.root()}/${client.id}`}>
							VER PERFIL
							<ArrowRight className="w-3 h-3 ml-1" />
						</Link>
					</Button>
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				<div className="w-full flex flex-col gap-3">
					{/* Name */}
					<div className="flex items-center gap-1.5">
						<CircleUser className="w-4 h-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">NOME</h3>
						<h3 className="text-sm font-semibold tracking-tight">{client.nome}</h3>
						<ClientDuplicatePill entityType="client" entityId={client.id} canReconcile={canReconcile} />
					</div>

					{/* Phone */}
					{client.telefone && (
						<div className="flex items-center gap-1.5">
							<Phone className="w-4 h-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">TELEFONE</h3>
							<h3 className="text-sm font-semibold tracking-tight">{formatToPhone(client.telefone)}</h3>
						</div>
					)}

					{/* Email */}
					{client.email && (
						<div className="flex items-center gap-1.5">
							<Mail className="w-4 h-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">EMAIL</h3>
							<h3 className="text-sm font-semibold tracking-tight">{client.email}</h3>
						</div>
					)}

					{/* Birth Date */}
					<div className="flex items-center gap-1.5">
						<Calendar className="w-4 h-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">IDADE</h3>
						<h3 className="text-sm font-semibold tracking-tight">
							{client.dataNascimento
								? `${getAgeFromBirthdayDate(client.dataNascimento)} ANOS (NASCIDO EM: ${formatDateBirthdayAsLocale(client.dataNascimento, true)})`
								: "NÃO DEFINIDO"}
						</h3>
					</div>
					<div className="flex items-center gap-1.5">
						<Grid3X3 className="w-4 h-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">SEGMENTAÇÃO RFM</h3>
						<Badge variant="secondary" className="text-xs">
							{client.analiseRFMTitulo}
						</Badge>
						{(client.analiseRFMNotasRecencia || client.analiseRFMNotasFrequencia || client.analiseRFMNotasMonetario) && (
							<div className="flex items-center gap-3 text-xs text-muted-foreground">
								{client.analiseRFMNotasRecencia !== null && (
									<span>
										R: <strong>{client.analiseRFMNotasRecencia}</strong>
									</span>
								)}
								{client.analiseRFMNotasFrequencia !== null && (
									<span>
										F: <strong>{client.analiseRFMNotasFrequencia}</strong>
									</span>
								)}
								{client.analiseRFMNotasMonetario !== null && (
									<span>
										M: <strong>{client.analiseRFMNotasMonetario}</strong>
									</span>
								)}
							</div>
						)}
					</div>

					{/* Location */}
					<div className="flex items-center gap-1.5">
						<MapPin className="w-4 h-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">LOCALIZAÇÃO</h3>
						<h3 className="text-sm font-semibold tracking-tight">
							{[client.localizacaoCidade, client.localizacaoEstado].filter(Boolean).join(", ") || "NÃO DEFINIDO"}
						</h3>
					</div>
					<div className="flex items-center gap-1.5">
						<BadgeDollarSign className="w-4 h-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">VALOR TOTAL COMPRO</h3>
						<h3 className="text-sm font-semibold tracking-tight">{formatToMoney(client.metadataValorTotalCompras || 0)}</h3>
					</div>
					<div className="flex items-center gap-1.5">
						<ShoppingCart className="w-4 h-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">TOTAL DE COMPRAS</h3>
						<h3 className="text-sm font-semibold tracking-tight">{client.metadataTotalCompras || 0}</h3>
					</div>
				</div>
			</Section.Body>
		</Section.Root>
	);
}

function CampaignAttributionSection({
	saleDate,
	attribution,
}: {
	saleDate: TGetSalesOutputById["dataVenda"];
	attribution: TGetSalesOutputById["atribuicaoCampanhaConversao"];
}) {
	if (!attribution)
		return (
			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<Megaphone className="w-4 h-4 min-w-4 min-h-4 text-violet-600 dark:text-violet-400" />
					</Section.Icon>
					<Section.Title>ATRIBUIÇÃO DE CAMPANHA</Section.Title>
				</Section.Header>
				<Section.Body>
					<div className="w-full flex flex-col items-center justify-center gap-3">
						<span className="text-sm font-medium text-muted-foreground">CAMPANHA NÃO ATRIBUÍDA</span>
					</div>
				</Section.Body>
			</Section.Root>
		);
	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Megaphone className="w-4 h-4 min-w-4 min-h-4 text-violet-600 dark:text-violet-400" />
				</Section.Icon>
				<Section.Title>ATRIBUIÇÃO DE CAMPANHA</Section.Title>
			</Section.Header>
			<Section.Body>
				<div className="w-full flex flex-col gap-4">
					{/* Timeline */}
					<div className="flex items-center gap-3">
						<div className="flex flex-col items-center gap-1">
							<div className="w-2 h-2 rounded-full bg-blue-500" />
							<div className="w-px h-8 bg-linear-to-b from-blue-500 to-green-500" />
							<div className="w-2 h-2 rounded-full bg-green-500" />
						</div>
						<div className="flex flex-col gap-4 flex-1">
							<div className="flex flex-col">
								<span className="text-[0.65rem] text-muted-foreground uppercase">Interação Enviada</span>
								<span className="text-sm font-medium">{formatDateAsLocale(attribution.dataInteracao, true)}</span>
							</div>
							<div className="flex flex-col">
								<span className="text-[0.65rem] text-muted-foreground uppercase">Converteu em</span>
								<span className="text-sm font-medium">{formatDateAsLocale(saleDate, true)}</span>
							</div>
						</div>
					</div>

					{/* Stats Grid */}
					<div className="grid grid-cols-2 gap-2">
						{/* Time to Conversion */}
						<div className="flex flex-col items-center p-3 bg-secondary/50 rounded-lg">
							<span className="text-[0.65rem] text-muted-foreground uppercase">Tempo para Conversão</span>
							<span className="text-sm font-bold">{formatTimeToConversion(attribution.tempoParaConversaoMinutos)}</span>
						</div>

						{/* Conversion Type */}
						{attribution.tipoConversao && (
							<div className="flex flex-col items-center p-3 bg-secondary/50 rounded-lg">
								<span className="text-[0.65rem] text-muted-foreground uppercase">Tipo</span>
								<span className="text-sm font-bold">{attribution.tipoConversao}</span>
							</div>
						)}

						{/* Delta Frequency */}
						{attribution.deltaFrequencia !== null && attribution.deltaFrequencia !== undefined && (
							<div className="flex flex-col items-center p-3 bg-blue-500/10 rounded-lg">
								<span className="text-[0.65rem] text-muted-foreground uppercase">Delta Frequência</span>
								<span className="text-sm font-bold text-blue-600 dark:text-blue-400">
									{attribution.deltaFrequencia > 0 ? "+" : ""}
									{attribution.deltaFrequencia}
								</span>
							</div>
						)}

						{/* Delta Monetary */}
						{attribution.deltaMonetarioAbsoluto !== null && attribution.deltaMonetarioAbsoluto !== undefined && (
							<div className="flex flex-col items-center p-3 bg-green-500/10 rounded-lg">
								<span className="text-[0.65rem] text-muted-foreground uppercase">Delta Monetário</span>
								<span className="text-sm font-bold text-green-600 dark:text-green-400">{formatToMoney(attribution.deltaMonetarioAbsoluto)}</span>
							</div>
						)}
					</div>

					{/* Days Since Last Purchase */}
					{attribution.diasDesdeUltimaCompra !== null && attribution.diasDesdeUltimaCompra !== undefined && (
						<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
							<Clock className="w-4 h-4" />
							<span>{attribution.diasDesdeUltimaCompra} dias desde a última compra</span>
						</div>
					)}
				</div>
			</Section.Body>
		</Section.Root>
	);
}

function SaleBenefitsSection({
	cashbackTransactions,
	couponRedemptions,
}: {
	cashbackTransactions: TGetSalesOutputById["transacoesCashback"];
	couponRedemptions: TGetSalesOutputById["resgatesCupom"];
}) {
	const activeCouponRedemptions = couponRedemptions.filter((redemption) => redemption.status === "UTILIZADO");
	const totalCouponDiscount = activeCouponRedemptions.reduce((sum, redemption) => sum + redemption.valorDesconto, 0);
	const activeCouponCodes = activeCouponRedemptions.map((redemption) => redemption.cupomCodigo).join(", ");
	const hasBenefits = couponRedemptions.length > 0 || cashbackTransactions.length > 0;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<BadgePercent className="w-4 h-4 min-w-4 min-h-4 text-brand" />
				</Section.Icon>
				<Section.Title>BENEFÍCIOS DA VENDA</Section.Title>
			</Section.Header>
			<Section.Body>
				{!hasBenefits ? (
					<div className="w-full flex flex-col items-center justify-center gap-1 rounded-lg bg-secondary/30 px-3 py-6 text-center">
						<span className="text-sm font-semibold text-muted-foreground">NENHUM BENEFÍCIO APLICADO NESTA VENDA</span>
						<span className="text-xs text-muted-foreground">Cupons e movimentações de cashback aparecerão aqui quando existirem.</span>
					</div>
				) : (
					<div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-3">
						<div className="flex min-w-0 flex-col gap-2 rounded-lg bg-secondary/30 p-3">
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-1.5">
									<Ticket className="w-4 h-4 text-brand" />
									<span className="text-xs font-bold uppercase tracking-tight">Cupons</span>
								</div>
								{activeCouponRedemptions.length > 0 ? <span className="text-xs font-bold tabular-nums">-{formatToMoney(totalCouponDiscount)}</span> : null}
							</div>
							{couponRedemptions.length === 0 ? (
								<p className="text-xs text-muted-foreground">Nenhum cupom usado nesta venda.</p>
							) : (
								<div className="flex flex-col gap-2">
									{couponRedemptions.map((redemption) => (
										<CouponRedemptionBenefitCard key={redemption.id} redemption={redemption} />
									))}
								</div>
							)}
						</div>
						<div className="flex min-w-0 flex-col gap-2 rounded-lg bg-secondary/30 p-3">
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-1.5">
									<BadgePercent className="w-4 h-4 text-primary" />
									<span className="text-xs font-bold uppercase tracking-tight">Cashback</span>
								</div>
								{cashbackTransactions.length > 0 ? (
									<span className="text-xs font-semibold text-muted-foreground">
										{cashbackTransactions.length === 1 ? "1 movimentação" : `${cashbackTransactions.length} movimentações`}
									</span>
								) : null}
							</div>
							{cashbackTransactions.length === 0 ? (
								<p className="text-xs text-muted-foreground">Nenhuma movimentação de cashback encontrada.</p>
							) : (
								<div className="flex flex-col gap-2">
									{cashbackTransactions.map((transaction, index) => (
										<CashbackTransactionBenefitCard key={index.toString()} transaction={transaction} />
									))}
								</div>
							)}
						</div>
					</div>
				)}
			</Section.Body>
		</Section.Root>
	);
}

function CouponRedemptionBenefitCard({ redemption }: { redemption: TGetSalesOutputById["resgatesCupom"][number] }) {
	const validationMode = formatCouponValidationMode(redemption.beneficioSnapshot);
	const isCanceled = redemption.status === "CANCELADO";

	return (
		<div className={cn("rounded-lg border border-border bg-card px-3 py-2", isCanceled && "opacity-70")}>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex flex-col gap-0.5">
					<div className="flex min-w-0 items-center gap-1.5">
						<span className="truncate text-xs font-bold uppercase">{redemption.cupomCodigo}</span>
						<Badge
							variant="outline"
							className={cn("h-5 rounded-full px-2 text-[0.6rem]", isCanceled ? "text-muted-foreground" : "border-brand/35 bg-brand/15")}
						>
							{isCanceled ? "CANCELADO" : "UTILIZADO"}
						</Badge>
					</div>
					<span className="line-clamp-1 text-xs text-muted-foreground">{redemption.cupomTitulo}</span>
				</div>
				<span className={cn("shrink-0 text-sm font-bold tabular-nums", isCanceled ? "text-muted-foreground line-through" : "text-foreground")}>
					-{formatToMoney(redemption.valorDesconto)}
				</span>
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-[0.65rem] text-muted-foreground">
				<span className="flex items-center gap-1">
					<Calendar className="w-3 h-3" />
					{formatDateAsLocale(redemption.dataInsercao)}
				</span>
				<span>{formatCouponSource(redemption.origemResgate)}</span>
				{validationMode ? <span>{validationMode}</span> : null}
			</div>
		</div>
	);
}

function CashbackTransactionBenefitCard({ transaction }: { transaction: TGetSalesOutputById["transacoesCashback"][number] }) {
	const isAccumulation = transaction.tipo === "ACÚMULO";

	return (
		<div className="rounded-lg border border-border bg-card px-3 py-2">
			<div className="flex items-center justify-between gap-3">
				<div
					className={cn(
						"flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase",
						isAccumulation ? "bg-primary/10 text-primary" : "bg-brand/15 text-foreground",
					)}
				>
					{isAccumulation ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3 text-brand" />}
					{transaction.tipo}
				</div>
				<span className={cn("text-sm font-bold tabular-nums", isAccumulation ? "text-primary" : "text-foreground")}>
					{isAccumulation ? "+" : "-"}
					{formatToMoney(Math.abs(transaction.valor))}
				</span>
			</div>
			<div className="mt-2 flex items-center gap-2 text-[0.65rem] text-muted-foreground">
				<span>{formatToMoney(transaction.saldoValorAnterior)}</span>
				<ArrowRight className="w-3 h-3" />
				<span className="font-medium text-foreground">{formatToMoney(transaction.saldoValorPosterior)}</span>
			</div>
			<div className="mt-2 flex items-center justify-between gap-3 border-t border-border/40 pt-2 text-[0.6rem] text-muted-foreground">
				<div className="flex items-center gap-1">
					<Calendar className="w-3 h-3" />
					{formatDateAsLocale(transaction.dataInsercao)}
				</div>
				{transaction.expiracaoData ? (
					<div className="flex items-center gap-1 text-foreground">
						<Clock className="w-3 h-3 text-brand" />
						Expira: {formatDateAsLocale(transaction.expiracaoData)}
					</div>
				) : null}
			</div>
		</div>
	);
}

type SaleErpDetail = NonNullable<TGetSalesOutputById["erp"]>;

/**
 * Selo de status no slot `actions` da seção: a resposta ("recebeu?", "emitiu?") chega no
 * cabeçalho, antes de qualquer linha do corpo ser lida. É o que faz a leitura de relance funcionar.
 */
function SectionStatusBadge({ label, className }: { label: string; className: string }) {
	return <span className={cn("rounded-full border px-2.5 py-1 text-[0.65rem] font-bold tracking-tight", className)}>{label}</span>;
}

function SalePaymentsSection({
	financeiro,
	saleTotal,
	processamentoOrigem,
	integracao,
	userCanViewFinances,
}: {
	financeiro: SaleErpDetail["financeiro"];
	saleTotal: number;
	processamentoOrigem: TGetSalesOutputById["processamentoOrigem"];
	integracao: TGetSalesOutputById["integracao"];
	userCanViewFinances: boolean;
}) {
	const presentation = SALE_FINANCIAL_STATUS_PRESENTATION[financeiro.status];
	const integrationName = integracao?.apelido ?? integracao?.tipo ?? null;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Wallet className="w-4 h-4 min-w-4 min-h-4" />
				</Section.Icon>
				<Section.Title>PAGAMENTOS</Section.Title>
				<Section.Actions>
					<SectionStatusBadge label={presentation.chipLabel} className={presentation.className} />
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				{financeiro.pagamentos.length === 0 ? (
					<div className="w-full flex flex-col items-center justify-center gap-1 rounded-lg bg-secondary/30 px-3 py-6 text-center">
						<span className="text-sm font-semibold text-muted-foreground">NENHUM RECEBIMENTO REGISTRADO</span>
						<span className="text-xs text-muted-foreground">
							{processamentoOrigem === "EXTERNO"
								? `Venda importada${integrationName ? ` de ${integrationName}` : ""}: o recebimento foi registrado fora da plataforma.`
								: "Os recebimentos desta venda aparecerão aqui quando forem gerados."}
						</span>
					</div>
				) : (
					<div className="w-full flex flex-col gap-2">
						{financeiro.pagamentos.map((payment) => (
							<SalePaymentGroupRow key={payment.id} payment={payment} userCanViewFinances={userCanViewFinances} />
						))}
						<div className="w-full flex items-center justify-between gap-3 border-t border-border pt-2">
							<span className="text-xs font-bold uppercase tracking-tight text-muted-foreground">Recebido</span>
							<span className="text-sm font-bold tabular-nums">
								{formatToMoney(financeiro.valorRecebido)}
								<span className="ml-1 text-xs font-semibold text-muted-foreground">de {formatToMoney(saleTotal)}</span>
							</span>
						</div>
					</div>
				)}
			</Section.Body>
		</Section.Root>
	);
}

function SalePaymentGroupRow({
	payment,
	userCanViewFinances,
}: {
	payment: SaleErpDetail["financeiro"]["pagamentos"][number];
	userCanViewFinances: boolean;
}) {
	const isInstallment = payment.parcelasTotal > 1;
	const methodLabel = `${PAYMENT_METHOD_LABELS[payment.metodo] ?? payment.metodo}${isInstallment ? ` ${payment.parcelasTotal}x` : ""}`;

	const status = (() => {
		if (payment.cancelado) return { label: "Cancelado ou estornado", className: "text-destructive" };
		if (isInstallment) {
			const progress = `${payment.parcelasRecebidas} de ${payment.parcelasTotal} recebidas`;
			if (payment.emAtraso)
				return {
					label: `${progress} · parcela em atraso`,
					className: "text-destructive",
				};
			if (payment.proximoVencimento)
				return {
					label: `${progress} · próxima em ${formatDateAsLocale(payment.proximoVencimento)}`,
					className: "text-muted-foreground",
				};
			return { label: progress, className: "text-success" };
		}
		if (payment.ultimoRecebimento)
			return {
				label: `Recebido em ${formatDateAsLocale(payment.ultimoRecebimento)}`,
				className: "text-success",
			};
		if (payment.emAtraso)
			return {
				label: `Vencido em ${formatDateAsLocale(payment.proximoVencimento)}`,
				className: "text-destructive",
			};
		if (payment.proximoVencimento)
			return {
				label: `Vence em ${formatDateAsLocale(payment.proximoVencimento)}`,
				className: "text-muted-foreground",
			};
		return { label: "Pendente", className: "text-muted-foreground" };
	})();

	const content = (
		<>
			<div className="min-w-0 flex flex-col gap-0.5">
				<span className="truncate text-sm font-semibold tracking-tight">{methodLabel}</span>
				<span className={cn("text-xs font-semibold", status.className)}>{status.label}</span>
			</div>
			<div className="shrink-0 flex items-center gap-1.5">
				<span className="text-sm font-bold tabular-nums">{formatToMoney(payment.valor)}</span>
				{userCanViewFinances ? <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" /> : null}
			</div>
		</>
	);

	// Sem permissão no financeiro a linha fica estática: o destino devolveria "não autorizado".
	if (!userCanViewFinances) {
		return <div className="w-full flex items-start justify-between gap-3 rounded-lg bg-secondary/30 px-3 py-2.5">{content}</div>;
	}

	return (
		<div className="flex w-full items-stretch gap-1 rounded-lg bg-secondary/30 p-1">
			<Link
				href={appRoutes.finance.transaction(payment.transacaoFinanceiraId)}
				title="Editar movimentação financeira deste pagamento"
				className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/60"
			>
				{content}
			</Link>
			<Link
				href={appRoutes.finance.entry(payment.lancamentoContabilId)}
				title="Abrir lançamento contábil da venda"
				aria-label="Abrir lançamento contábil da venda"
				className="flex shrink-0 items-center justify-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40"
			>
				<FileText className="h-4 w-4" />
				<span className="hidden text-[11px] font-semibold uppercase sm:inline">Lançamento</span>
			</Link>
		</div>
	);
}

// Documento com arquivo em SEFAZ. Nos demais status (rascunho, rejeitada, em processamento,
// inutilizada) não existe XML nem DANFE para servir — a nota cancelada continua tendo os dois,
// porque o evento de cancelamento faz parte do próprio XML.
const FISCAL_STATUSES_WITH_ASSETS = new Set(["AUTORIZADO", "CANCELADO"]);

function SaleFiscalSection({ fiscal, canConfigureFiscal }: { fiscal: NonNullable<SaleErpDetail["fiscal"]>; canConfigureFiscal: boolean }) {
	const presentation = SALE_FISCAL_STATUS_PRESENTATION[fiscal.status];

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<ReceiptText className="w-4 h-4 min-w-4 min-h-4" />
				</Section.Icon>
				<Section.Title>FISCAL</Section.Title>
				<Section.Actions>
					<SectionStatusBadge label={presentation.chipLabel} className={presentation.className} />
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				{fiscal.documentos.length === 0 ? (
					<div className="w-full flex flex-col items-center justify-center gap-1 rounded-lg bg-secondary/30 px-3 py-6 text-center">
						<span className="text-sm font-semibold text-muted-foreground">NENHUM DOCUMENTO FISCAL EMITIDO</span>
						<span className="text-xs text-muted-foreground">As notas emitidas para esta venda aparecerão aqui.</span>
					</div>
				) : (
					<div className="w-full flex flex-col gap-2">
						{fiscal.documentos.map((document) => (
							<SaleFiscalDocumentRow key={document.id} document={document} canConfigureFiscal={canConfigureFiscal} />
						))}
					</div>
				)}
			</Section.Body>
		</Section.Root>
	);
}

function SaleFiscalDocumentRow({
	document,
	canConfigureFiscal,
}: {
	document: NonNullable<SaleErpDetail["fiscal"]>["documentos"][number];
	canConfigureFiscal: boolean;
}) {
	// `statusInterno` é o ciclo de vida do documento (RASCUNHO, CANCELAMENTO_PENDENTE...), mais
	// granular que o status derivado da venda. A mesma tradução que o cabeçalho usa.
	const derivedStatus = mapInternalFiscalStatus(document.statusInterno);
	const presentation = derivedStatus ? SALE_FISCAL_STATUS_PRESENTATION[derivedStatus] : null;
	const hasAssets = FISCAL_STATUSES_WITH_ASSETS.has(document.statusInterno);
	const isFailed = derivedStatus === "REJEITADO" || derivedStatus === "ERRO";
	const primaryProblem = isFailed ? pickPrimaryFiscalProblem(document.problemas ?? []) : null;
	const cancelAction = document.statusInterno === "AUTORIZADO" ? findFiscalAction(document.acoes, "CANCELAR") : null;
	const cancelRemaining = cancelAction?.prazoLimite ? formatRemainingTime(cancelAction.prazoLimite) : null;
	// Nota de homologação não tem valor fiscal. Sem esta marca, ela se lê como uma nota real.
	const isHomologation = document.ambiente === "HOMOLOGACAO";
	const openAsset = (asset: "xml" | "pdf") =>
		window.open(`/api/fiscal/document-assets?documentId=${document.id}&asset=${asset}`, "_blank", "noopener,noreferrer");

	const timeline = document.dataCancelamento
		? `Cancelada em ${formatDateAsLocale(document.dataCancelamento, true)}`
		: document.dataAutorizacao
			? `Autorizada em ${formatDateAsLocale(document.dataAutorizacao, true)}`
			: `Criada em ${formatDateAsLocale(document.dataInsercao, true)}`;

	return (
		<div className="w-full flex flex-col gap-2 rounded-lg bg-secondary/30 px-3 py-2.5">
			<div className="w-full flex items-start justify-between gap-3">
				<div className="min-w-0 flex flex-col gap-0.5">
					<span className="truncate text-sm font-semibold tracking-tight">
						{document.tipo} {document.numero ? `nº ${document.numero}` : "sem numeração"}
						{document.serie ? <span className="ml-1 font-medium text-muted-foreground">· Série {document.serie}</span> : null}
					</span>
					<span className="text-xs font-semibold text-muted-foreground">{timeline}</span>
					{document.documentoOrigemNumero ? (
						<span className="text-xs font-medium text-muted-foreground">Referente à nº {document.documentoOrigemNumero}</span>
					) : null}
				</div>
				<div className="shrink-0 flex flex-col items-end gap-1">
					{presentation ? <SectionStatusBadge label={presentation.chipLabel} className={presentation.className} /> : null}
					{isHomologation ? <SectionStatusBadge label="HOMOLOGAÇÃO" className="border-border/60 bg-muted/30 text-muted-foreground" /> : null}
				</div>
			</div>

			{/* Nota rejeitada sem explicação é um beco sem saída: o problema vem como dado (categoria,
			    mensagem, ação sugerida e alvo) e a CTA resolve o alvo daqui mesmo — perfil fiscal do
			    produto, série, certificado — sem passar pelo módulo fiscal. */}
			{isFailed ? (
				<div className="w-full flex flex-wrap items-start justify-between gap-2 rounded-md bg-destructive/10 px-2.5 py-2">
					<div className="min-w-0 flex flex-col gap-0.5">
						<span className="text-xs font-bold text-destructive">
							{document.codigoRejeicao ? `Rejeição ${document.codigoRejeicao}` : "Falha na emissão"}
							{primaryProblem ? ` · ${FISCAL_PROBLEM_CATEGORY_LABELS[primaryProblem.categoria]}` : ""}
						</span>
						<span className="text-xs text-destructive/90">
							{primaryProblem?.mensagem ?? document.mensagens?.[0] ?? "Sem detalhe registrado pelo provedor."}
						</span>
						{primaryProblem ? <span className="text-[11px] text-muted-foreground">{primaryProblem.acaoSugerida}</span> : null}
					</div>
					{primaryProblem && !primaryProblem.resolvidoAutomaticamente ? (
						<FiscalProblemCta problem={primaryProblem} vendaId={document.vendaId} canConfigureFiscal={canConfigureFiscal} />
					) : null}
				</div>
			) : null}

			{/* Autorizada: a janela de cancelamento é a informação que muda o que o operador faz a seguir. */}
			{cancelAction ? (
				<div className="w-full flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/60 px-2.5 py-1.5">
					<span className="text-[11px] text-muted-foreground">
						{cancelAction.disponivel
							? `Cancelamento disponível por mais ${cancelRemaining ?? "alguns minutos"}.`
							: `${cancelAction.motivoIndisponivel ?? "Cancelamento indisponível."}${cancelAction.alternativas.includes("DEVOLUCAO") ? " Saída: NF-e de devolução." : ""}`}
					</span>
					<Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-[0.6rem] font-bold" asChild>
						<Link href={appRoutes.fiscal.document(document.id)}>{cancelAction.disponivel ? "CANCELAR NOTA" : "GERAR DEVOLUÇÃO"}</Link>
					</Button>
				</div>
			) : null}

			{/* Sempre renderizada: mesmo sem XML nem DANFE (rascunho, rejeitada), o documento existe
			    no módulo fiscal e é lá que se age sobre ele. */}
			<div className="w-full flex items-center gap-1.5">
				<Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[0.65rem] font-bold" asChild>
					<Link href={appRoutes.fiscal.document(document.id)} title="Abrir este documento no módulo fiscal">
						<ReceiptText className="w-3.5 h-3.5" />
						VER DOCUMENTO
					</Link>
				</Button>
				{hasAssets ? (
					<>
						<Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[0.65rem] font-bold" onClick={() => openAsset("pdf")}>
							<FileText className="w-3.5 h-3.5" />
							DANFE
						</Button>
						<Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[0.65rem] font-bold" onClick={() => openAsset("xml")}>
							<FileCode className="w-3.5 h-3.5" />
							XML
						</Button>
					</>
				) : null}
				{document.chaveAcesso ? (
					<span className="ml-auto truncate font-mono text-[0.6rem] text-muted-foreground" title={document.chaveAcesso}>
						{document.chaveAcesso}
					</span>
				) : null}
			</div>
		</div>
	);
}

function SaleItemsSection({ items }: { items: TGetSalesOutputById["itens"] }) {
	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Package className="w-4 h-4 min-w-4 min-h-4" />
				</Section.Icon>
				<Section.Title>{`ITENS (${items.length})`}</Section.Title>
			</Section.Header>
			<Section.Body>
				<div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					{items.map((item) => (
						<SaleItemCard key={item.id} item={item} />
					))}
				</div>
			</Section.Body>
		</Section.Root>
	);
}

function SaleItemCard({ item }: { item: TGetSalesOutputById["itens"][number] }) {
	const imageUrl = item.produtoVariante?.imagemCapaUrl || item.produto?.imagemCapaUrl;

	return (
		<div className="bg-secondary/30 rounded-lg overflow-hidden flex flex-col">
			{/* Image */}
			<div className="w-full h-32 bg-secondary/50 flex items-center justify-center">
				{imageUrl ? (
					<img src={imageUrl} alt={item.produto?.nome || "Produto"} className="w-full h-full object-cover" />
				) : (
					<Package className="w-12 h-12 text-muted-foreground/50" />
				)}
			</div>

			{/* Content */}
			<div className="p-3 flex flex-col gap-2">
				{/* Product Info */}
				<div className="flex flex-col gap-0.5">
					<div className="w-full flex items-center justify-between gap-3">
						<h3 className="text-sm font-bold tracking-tight line-clamp-2">{item.produto?.nome || "Produto"}</h3>
						<Button asChild variant="ghost" size="icon" className="w-7 h-7" title="Ver produto">
							<Link href={`/dashboard/catalog/products/${item.produto.id}?tab=cadastro`} aria-label="Acessar página do produto">
								<SquareArrowOutUpRight className="w-4 h-4 min-w-4 min-h-4 text-muted-foreground" />
							</Link>
						</Button>
					</div>
					<div className="flex items-center flex-wrap gap-1.5">
						{item.produto.unidade ? (
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger
										render={
											<div className="flex items-center gap-1.5 px-1 py-0.5">
												<Package className="w-4 h-4 text-muted-foreground" />
												<h3 className="text-xs tracking-tighter">{item.produto.unidade}</h3>
											</div>
										}
									/>
									<TooltipContent>
										<p>Unidade de medida</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						) : null}
						{item.produto?.codigo ? (
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger
										render={
											<div className="flex items-center gap-1.5 px-1 py-0.5">
												<Code className="w-4 h-4 text-muted-foreground" />
												<h3 className="text-xs tracking-tighter">{item.produto.codigo}</h3>
											</div>
										}
									/>
									<TooltipContent>
										<p>Código do produto</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						) : null}
						{item.produto?.grupo ? (
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger
										render={
											<div className="flex items-center gap-1.5 px-1 py-0.5">
												<Diamond className="w-4 h-4 text-muted-foreground" />
												<h3 className="text-xs tracking-tighter">{item.produto.grupo}</h3>
											</div>
										}
									/>
									<TooltipContent>
										<p>Grupo do produto</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						) : null}
						{item.produtoVariante?.nome ? (
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger
										render={
											<div className="flex items-center gap-1.5 px-1 py-0.5">
												<Package className="w-4 h-4 text-muted-foreground" />
												<h3 className="text-xs tracking-tighter">{item.produtoVariante.nome}</h3>
											</div>
										}
									/>
									<TooltipContent>
										<p>Variante do produto</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						) : null}
					</div>
				</div>

				{/* Pricing */}
				<div className="flex flex-col gap-1 pt-2 border-t border-border/30">
					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground">QUANTIDADE:</span>
						<span className="font-medium">{item.quantidade}</span>
					</div>
					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground">UNITÁRIO:</span>
						<span className="font-medium">{formatToMoney(item.valorVendaUnitario)}</span>
					</div>
					{item.valorTotalDesconto > 0 && (
						<div className="flex items-center justify-between text-xs">
							<span className="text-muted-foreground">DESCONTO:</span>
							<span className="font-medium text-red-500">-{formatToMoney(item.valorTotalDesconto)}</span>
						</div>
					)}
					<div className="flex items-center justify-between text-sm font-bold pt-1">
						<span>TOTAL:</span>
						<span className="text-foreground">{formatToMoney(item.valorVendaTotalLiquido)}</span>
					</div>
				</div>

				{/* Adicionais */}
				{item.adicionais && item.adicionais.length > 0 && (
					<div className="flex flex-col gap-1 pt-2 border-t border-border/30">
						<span className="text-[0.65rem] font-semibold text-muted-foreground uppercase">ADICIONAIS</span>
						{item.adicionais.map((adicional) => (
							<div key={adicional.id} className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">
									{adicional.opcao?.nome || "Adicional"} x{adicional.quantidade}
								</span>
								<span className="font-medium">{formatToMoney(adicional.valorTotal)}</span>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

// Edição da venda: habilitada pela política derivada do servidor (`editabilidade`); quando
// bloqueada, a razão aparece em tooltip — nunca um botão morto sem explicação.
function SaleEditButton({ sale, userCanEditSales }: { sale: TGetSalesOutputById; userCanEditSales: boolean }) {
	const editability = sale.editabilidade;
	if (!userCanEditSales || !editability) return null;
	if (sale.processamentoOrigem !== "INTERNO") return null;

	const editIsEnabled = editability.nivel === "TOTAL" || editability.rascunho;
	const editHref = editability.rascunho ? appRoutes.sales.checkout(sale.id) : appRoutes.sales.edit(sale.id);

	if (editIsEnabled) {
		return (
			<Button variant="ghost" size="fit" asChild className="rounded-full flex items-center gap-1 px-2 py-2">
				<Link href={editHref}>
					<PencilLine className="w-5 h-5" />
					{editability.rascunho ? "ABRIR CHECKOUT" : "EDITAR VENDA"}
				</Link>
			</Button>
		);
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger
					render={
						<span>
							<Button variant="ghost" size="fit" disabled className="rounded-full flex items-center gap-1 px-2 py-2">
								<PencilLine className="w-5 h-5" />
								EDITAR VENDA
							</Button>
						</span>
					}
				/>
				<TooltipContent>{editability.motivos[0] ?? "Edição indisponível para o estado atual da venda."}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

// Cancelamento com estorno: o caminho correto para vendas confirmadas (a copy do delete finalmente
// aponta para um fluxo que existe).
function SaleCancelButton({ sale, userCanDeleteSales }: { sale: TGetSalesOutputById; userCanDeleteSales: boolean }) {
	const [cancelDialogIsOpen, setCancelDialogIsOpen] = useState(false);
	const editability = sale.editabilidade;
	if (!userCanDeleteSales || !editability?.cancelamentoDisponivel) return null;

	return (
		<>
			<Button
				variant="ghost-destructive"
				size="fit"
				onClick={() => setCancelDialogIsOpen(true)}
				className="rounded-full flex items-center gap-1 px-2 py-2"
			>
				<CircleX className="w-5 h-5" />
				CANCELAR VENDA
			</Button>
			{cancelDialogIsOpen ? (
				<CancelConfirmedSaleDialog
					saleId={sale.id}
					idExterno={sale.idExterno}
					valorTotal={sale.valorTotal}
					clienteNome={sale.cliente?.nome}
					exigeCancelamentoFiscal={editability.cancelamentoExigeFiscal}
					documentosFiscais={sale.erp?.fiscal?.documentos ?? []}
					closeModal={() => setCancelDialogIsOpen(false)}
				/>
			) : null}
		</>
	);
}

function SaleDeleteButton({ sale, userCanDeleteSales }: { sale: TGetSalesOutputById; userCanDeleteSales: boolean }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [deleteConfirmMenuIsOpen, setDeleteConfirmMenuIsOpen] = useState(false);
	const saleIsInternal = sale.processamentoOrigem === "INTERNO";
	const saleIsConfirmed = sale.statusVenda === "CONFIRMADA";
	const hasFiscalDocuments = sale.editabilidade.exclusaoBloqueadaPorFiscal;
	const canOpenDeleteFlow = saleIsInternal && userCanDeleteSales;
	const canSubmitDelete = canOpenDeleteFlow && !saleIsConfirmed && !hasFiscalDocuments;

	const { mutate: handleDeleteSale, isPending } = useMutation({
		mutationKey: ["delete-sale", sale.id],
		mutationFn: deleteSale,
		onSuccess: async (data) => {
			setDeleteConfirmMenuIsOpen(false);
			await queryClient.invalidateQueries({ queryKey: ["sales"] });
			await queryClient.invalidateQueries({
				queryKey: ["sales-by-id", sale.id],
			});
			toast.success(data.message);
			router.push(appRoutes.sales.root());
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	if (!saleIsInternal) return null;
	return (
		<>
			<Button
				variant="ghost-destructive"
				size="fit"
				disabled={!userCanDeleteSales}
				onClick={() => setDeleteConfirmMenuIsOpen(true)}
				className="rounded-full flex items-center gap-1 px-2 py-2"
			>
				<Trash className="w-5 h-5" />
				EXCLUIR VENDA
			</Button>
			<Dialog open={deleteConfirmMenuIsOpen} onOpenChange={(open) => (!isPending ? setDeleteConfirmMenuIsOpen(open) : null)}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<div className="flex items-center gap-2 text-destructive">
							<AlertTriangle className="h-5 w-5" />
							<DialogTitle>Excluir venda?</DialogTitle>
						</div>
						<DialogDescription>
							Essa ação exclui a venda permanentemente, reverte os efeitos de cashback vinculados e remove conversões de campanha associadas à venda.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
						<div className="flex items-center justify-between gap-3 text-sm">
							<span className="text-muted-foreground">Identificador</span>
							<span className="font-bold">{sale.idExterno}</span>
						</div>
						<div className="flex items-center justify-between gap-3 text-sm">
							<span className="text-muted-foreground">Valor</span>
							<span className="font-bold">{formatToMoney(sale.valorTotal)}</span>
						</div>
						<div className="flex items-center justify-between gap-3 text-sm">
							<span className="text-muted-foreground">Cliente</span>
							<span className="font-bold">{sale.cliente?.nome ?? "AO CONSUMIDOR"}</span>
						</div>
					</div>

					<div className="flex flex-col gap-2 text-sm text-muted-foreground">
						<p>Antes de excluir, o sistema validará se não há efeitos fiscais, contábeis, de estoque ou atendimento que impedem a exclusão.</p>
						{saleIsConfirmed ? <p className="font-medium text-destructive">Vendas confirmadas devem ser canceladas pelo fluxo de cancelamento.</p> : null}
						{hasFiscalDocuments ? (
							<p className="font-medium text-destructive">Esta venda possui documento fiscal vinculado e não pode ser excluída.</p>
						) : null}
						{!userCanDeleteSales ? <p className="font-medium text-destructive">Você não possui permissão para excluir vendas.</p> : null}
					</div>

					<DialogFooter>
						<Button variant="outline" disabled={isPending} onClick={() => setDeleteConfirmMenuIsOpen(false)}>
							CANCELAR
						</Button>
						<LoadingButton variant="destructive" loading={isPending} disabled={!canSubmitDelete} onClick={() => handleDeleteSale({ id: sale.id })}>
							EXCLUIR DEFINITIVAMENTE
						</LoadingButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
