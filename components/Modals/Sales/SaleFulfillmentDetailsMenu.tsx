"use client";

import type { TGetSalesFulfillmentOutputById } from "@/app/api/sales/fulfillment/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney, formatToPhone } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments/labels";
import { useSalesFulfillmentById } from "@/lib/queries/sales-fulfillment";
import { SALE_FINANCIAL_STATUS_PRESENTATION, SALE_FISCAL_STATUS_PRESENTATION, type TSaleStatusTone } from "@/lib/sales/status-presentation";
import { cn } from "@/lib/utils";
import type { TSaleFinancialDerivedStatusEnum, TSaleFiscalDerivedStatusEnum } from "@/schemas/enums";
import {
	BadgeCheck,
	Banknote,
	ChevronDown,
	CircleCheck,
	CircleDollarSign,
	CircleMinus,
	CircleX,
	ClipboardList,
	Clock3,
	FileCheck2,
	FileClock,
	FileMinus,
	FileX2,
	MapPin,
	MessageSquareText,
	Package,
	PackageCheck,
	PackageOpen,
	PencilLine,
	Phone,
	PhoneCall,
	ReceiptText,
	RefreshCw,
	Store,
	TriangleAlert,
	Truck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { FaWhatsapp } from "react-icons/fa6";
import { CancelConfirmedSaleDialog } from "./CancelConfirmedSaleDialog";

type SaleFulfillmentDetailsMenuProps = {
	saleId: string;
	closeMenu: () => void;
	canEditSales?: boolean;
	canDeleteSales?: boolean;
};

type SaleFulfillmentDetailsPreviewProps = Omit<SaleFulfillmentDetailsMenuProps, "saleId"> & {
	sale: TGetSalesFulfillmentOutputById;
};

const ATTENDANCE_META: Record<string, { label: string; icon: ReactNode }> = {
	NAO_INICIADO: { label: "Aguardando início", icon: <Clock3 className="size-4" /> },
	EM_PREPARO: { label: "Em preparo", icon: <PackageOpen className="size-4" /> },
	PRONTO: { label: "Pronto", icon: <PackageCheck className="size-4" /> },
	EM_ENTREGA: { label: "Saiu para entrega", icon: <Truck className="size-4" /> },
	ENTREGUE: { label: "Entregue", icon: <CircleCheck className="size-4" /> },
	PARCIALMENTE_ENTREGUE: { label: "Entrega parcial", icon: <PackageCheck className="size-4" /> },
	CANCELADO: { label: "Cancelado", icon: <CircleX className="size-4" /> },
};

const FINANCIAL_STATUS_ICONS: Record<TSaleFinancialDerivedStatusEnum, ReactNode> = {
	NAO_GERADO: <CircleMinus className="size-4" />,
	PENDENTE: <Clock3 className="size-4" />,
	PARCIALMENTE_RECEBIDA: <CircleDollarSign className="size-4" />,
	RECEBIDA: <BadgeCheck className="size-4" />,
	EM_ATRASO: <TriangleAlert className="size-4" />,
};

const FISCAL_STATUS_ICONS: Record<TSaleFiscalDerivedStatusEnum, ReactNode> = {
	NAO_EMITIDO: <FileMinus className="size-4" />,
	PENDENTE: <FileClock className="size-4" />,
	EM_PROCESSAMENTO: <RefreshCw className="size-4" />,
	AUTORIZADO: <FileCheck2 className="size-4" />,
	REJEITADO: <FileX2 className="size-4" />,
	CANCELADO: <FileX2 className="size-4" />,
	INUTILIZADO: <FileMinus className="size-4" />,
	ERRO: <TriangleAlert className="size-4" />,
};

const DELIVERY_META: Record<string, { label: string; icon: ReactNode }> = {
	PRESENCIAL: { label: "Presencial", icon: <Store className="size-4" /> },
	RETIRADA: { label: "Retirada", icon: <Package className="size-4" /> },
	ENTREGA: { label: "Entrega", icon: <Truck className="size-4" /> },
	COMANDA: { label: "Comanda", icon: <ClipboardList className="size-4" /> },
};

const FISCAL_DOCUMENT_TYPE_LABELS: Record<string, string> = {
	NFCE: "NFC-e",
	NFE: "NF-e",
	NFSE: "NFS-e",
};

const FISCAL_DOCUMENT_STATUS_LABELS: Record<string, string> = {
	PENDENTE: "Pendente",
	EM_PROCESSAMENTO: "Em processamento",
	AUTORIZADO: "Autorizada",
	REJEITADO: "Rejeitada",
	CANCELAMENTO_PENDENTE: "Cancelamento pendente",
	CANCELADO: "Cancelada",
	INUTILIZADO: "Inutilizada",
	ERRO: "Erro",
};

export function SaleFulfillmentDetailsMenu({ saleId, closeMenu, canEditSales, canDeleteSales }: SaleFulfillmentDetailsMenuProps) {
	const query = useSalesFulfillmentById({ saleId });

	return (
		<SaleDetailsShell
			sale={query.data}
			closeMenu={closeMenu}
			canEditSales={canEditSales}
			canDeleteSales={canDeleteSales}
			isLoading={query.isLoading}
			error={query.isError ? query.error : null}
			isFetching={query.isFetching}
			retry={() => query.refetch()}
		/>
	);
}

export function SaleFulfillmentDetailsPreview({ sale, closeMenu, canEditSales = true, canDeleteSales = true }: SaleFulfillmentDetailsPreviewProps) {
	return (
		<SaleDetailsShell
			sale={sale}
			closeMenu={closeMenu}
			canEditSales={canEditSales}
			canDeleteSales={canDeleteSales}
			isLoading={false}
			error={null}
			isFetching={false}
			retry={() => undefined}
		/>
	);
}

function SaleDetailsShell({
	sale,
	closeMenu,
	canEditSales,
	canDeleteSales,
	isLoading,
	error,
	isFetching,
	retry,
}: {
	sale?: TGetSalesFulfillmentOutputById;
	closeMenu: () => void;
	canEditSales?: boolean;
	canDeleteSales?: boolean;
	isLoading: boolean;
	error: unknown;
	isFetching: boolean;
	retry: () => void;
}) {
	return (
		<ResponsiveMenu
			menuTitle={sale?.idExterno ? `Pedido #${sale.idExterno}` : "Detalhes do pedido"}
			menuDescription="Conferência de itens, entrega e recebimento."
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
			dialogVariant="xl"
			drawerVariant="xl"
			mode="read-only"
			dialogContentClassName="w-[min(760px,calc(100vw-2rem))] min-w-0 max-w-[760px] lg:max-w-[760px]"
			contentClassName="gap-4"
			titleClassName="text-xl font-extrabold tracking-tight"
			descriptionClassName="text-sm"
		>
			{isLoading ? <SaleDetailsSkeleton /> : null}
			{error ? <SaleDetailsError error={error} isFetching={isFetching} retry={retry} /> : null}
			{sale ? <SaleFulfillmentDetailsContent key={sale.id} sale={sale} canEditSales={canEditSales} canDeleteSales={canDeleteSales} /> : null}
		</ResponsiveMenu>
	);
}

function SaleDetailsSkeleton() {
	return (
		<div className="flex flex-col gap-4" aria-label="Carregando detalhes do pedido">
			<Skeleton className="h-40 rounded-2xl" />
			<Skeleton className="h-72 rounded-2xl" />
			<Skeleton className="h-44 rounded-2xl" />
		</div>
	);
}

function SaleDetailsError({ error, isFetching, retry }: { error: unknown; isFetching: boolean; retry: () => void }) {
	return (
		<div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card px-6 text-center">
			<div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
				<RefreshCw className={cn("size-5", isFetching && "animate-spin")} />
			</div>
			<div className="space-y-1">
				<p className="text-base font-extrabold">Não foi possível carregar o pedido</p>
				<p className="max-w-sm text-sm text-muted-foreground">{getErrorMessage(error)}</p>
			</div>
			<Button variant="outline" size="lg" onClick={retry} disabled={isFetching}>
				<RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
				Tentar novamente
			</Button>
		</div>
	);
}

function SaleFulfillmentDetailsContent({
	sale,
	canEditSales,
	canDeleteSales,
}: {
	sale: TGetSalesFulfillmentOutputById;
	canEditSales?: boolean;
	canDeleteSales?: boolean;
}) {
	const [itemsExpanded, setItemsExpanded] = useState(false);
	const visibleItems = itemsExpanded ? sale.itens : sale.itens.slice(0, 3);
	const hiddenItemsCount = Math.max(0, sale.itens.length - 3);

	return (
		<div className="flex flex-col gap-4">
			<OrderSummary sale={sale} />
			<section className="overflow-hidden rounded-2xl border border-border bg-card">
				<SectionHeading title="Itens" count={sale.itens.length} />
				{sale.itens.length > 0 ? (
					<div className="divide-y divide-border/70 px-4 sm:px-5">
						{visibleItems.map((item, index) => (
							<SaleItemRow key={item.id} item={item} reveal={itemsExpanded && index >= 3} />
						))}
					</div>
				) : (
					<EmptyDetail icon={<Package className="size-5" />} text="Nenhum item nesta venda." />
				)}
				{hiddenItemsCount > 0 ? (
					<div className="border-t border-border px-4 py-3 sm:px-5">
						<Button
							variant="ghost"
							size="sm"
							className="w-full rounded-xl font-bold"
							onClick={() => setItemsExpanded((expanded) => !expanded)}
							aria-expanded={itemsExpanded}
						>
							<ChevronDown
								className={cn("size-4 transition-transform duration-200 ease-out motion-reduce:transition-none", itemsExpanded && "rotate-180")}
							/>
							{itemsExpanded ? "Mostrar menos" : `Mostrar mais ${hiddenItemsCount} ${hiddenItemsCount === 1 ? "item" : "itens"}`}
						</Button>
					</div>
				) : null}
			</section>
			<OrderDetails sale={sale} />
			<SaleActionsFooter sale={sale} canEditSales={canEditSales} canDeleteSales={canDeleteSales} />
		</div>
	);
}

function OrderSummary({ sale }: { sale: TGetSalesFulfillmentOutputById }) {
	const phoneLinks = sale.cliente?.telefone ? getCustomerPhoneLinks(sale.cliente.telefone) : null;
	const attendance = getAttendanceMeta(sale.statusAtendimento, sale.entregaModalidade);
	const financial = SALE_FINANCIAL_STATUS_PRESENTATION[sale.financeiro];
	const fiscal = SALE_FISCAL_STATUS_PRESENTATION[sale.fiscal];

	return (
		<section className="overflow-hidden rounded-2xl bg-secondary/55">
			<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted-foreground">
						{sale.integracaoCanal || sale.canal ? <span className="text-brand">{sale.integracaoCanal ?? sale.canal}</span> : null}
						{sale.dataVenda ? <span>{formatDateAsLocale(sale.dataVenda, true)}</span> : null}
					</div>
					<h2 className="mt-1 truncate text-lg font-extrabold tracking-tight sm:text-xl">{sale.cliente?.nome ?? "Ao consumidor"}</h2>
					{sale.cliente?.telefone ? (
						<p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
							<Phone className="size-3.5" />
							{formatToPhone(sale.cliente.telefone)}
						</p>
					) : null}
					{phoneLinks ? (
						<div className="mt-3 flex flex-wrap gap-2">
							<ContactLink href={phoneLinks.tel} label="Ligar" icon={<PhoneCall className="size-4" />} />
							<ContactLink href={phoneLinks.whatsapp} label="WhatsApp" icon={<FaWhatsapp className="size-4" />} external tone="success" />
						</div>
					) : null}
				</div>
				<div className="shrink-0 text-right">
					<p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Total</p>
					<p className="mt-0.5 text-2xl font-extrabold tracking-tight tabular-nums">{formatToMoney(sale.valorTotal)}</p>
					{sale.descontosTotal && sale.descontosTotal > 0 ? (
						<p className="mt-1 text-xs font-semibold text-success">{formatToMoney(sale.descontosTotal)} de desconto</p>
					) : null}
					{sale.acrescimosTotal && sale.acrescimosTotal > 0 ? (
						<p className="mt-1 text-xs text-muted-foreground">{formatToMoney(sale.acrescimosTotal)} de acréscimo</p>
					) : null}
				</div>
			</div>
			<div className="grid border-t border-border/80 bg-card/70 sm:grid-cols-3 sm:divide-x sm:divide-border/80">
				<StatusSummary label="Atendimento" value={attendance.label} icon={attendance.icon} />
				<StatusSummary label="Pagamento" value={financial.label} icon={FINANCIAL_STATUS_ICONS[sale.financeiro]} tone={financial.tone} />
				<StatusSummary label="Fiscal" value={fiscal.label} icon={FISCAL_STATUS_ICONS[sale.fiscal]} tone={fiscal.tone} />
			</div>
		</section>
	);
}

function ContactLink({
	href,
	label,
	icon,
	external,
	tone = "default",
}: {
	href: string;
	label: string;
	icon: ReactNode;
	external?: boolean;
	tone?: "default" | "success";
}) {
	return (
		<a
			href={href}
			target={external ? "_blank" : undefined}
			rel={external ? "noreferrer" : undefined}
			aria-label={label}
			className={cn(
				"inline-flex size-9 items-center justify-center gap-2 rounded-xl border text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto sm:px-3",
				tone === "default" && "border-border bg-card hover:bg-secondary",
				tone === "success" && "border-success/25 bg-success/10 text-success hover:bg-success/15",
			)}
		>
			{icon}
			<span className="sr-only sm:not-sr-only">{label}</span>
		</a>
	);
}

function StatusSummary({ label, value, icon, tone = "neutral" }: { label: string; value: string; icon: ReactNode; tone?: TSaleStatusTone }) {
	return (
		<div className="flex items-center gap-2.5 border-b border-border/80 px-4 py-3 last:border-b-0 sm:border-b-0 sm:px-5">
			<span
				className={cn(
					"text-muted-foreground",
					tone === "success" && "text-success",
					tone === "warning" && "text-warning-surface-foreground",
					tone === "danger" && "text-destructive",
				)}
			>
				{icon}
			</span>
			<div className="min-w-0">
				<p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
				<p className="truncate text-xs font-bold">{value}</p>
			</div>
		</div>
	);
}

function SectionHeading({ title, count }: { title: string; count?: number }) {
	return (
		<div className="flex min-h-12 items-center gap-2 border-b border-border px-4 sm:px-5">
			<h2 className="text-sm font-extrabold">{title}</h2>
			{count !== undefined ? <span className="text-xs font-bold tabular-nums text-muted-foreground">{count}</span> : null}
		</div>
	);
}

function SaleItemRow({ item, reveal }: { item: TGetSalesFulfillmentOutputById["itens"][number]; reveal: boolean }) {
	const imageUrl = item.produtoVariante?.imagemCapaUrl ?? item.produto?.imagemCapaUrl ?? null;
	const hasDiscount = item.valorTotalDesconto > 0;
	return (
		<div className={cn("flex gap-3 py-4", reveal && "animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none")}>
			<div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary">
				{imageUrl ? (
					<Image src={imageUrl} alt={item.produto?.nome ?? "Produto do pedido"} fill sizes="56px" className="object-cover" />
				) : (
					<div className="flex size-full items-center justify-center text-brand/45">
						<Package className="size-6" />
					</div>
				)}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h3 className="line-clamp-2 text-sm font-bold leading-snug">{item.produto?.nome ?? "Produto"}</h3>
						<p className="mt-1 text-xs text-muted-foreground">
							<span className="font-bold text-brand">{item.quantidade}x</span>
							{item.produtoVariante?.nome ? ` · ${item.produtoVariante.nome}` : ""}
							{item.produto?.codigo ? ` · Cód. ${item.produto.codigo}` : ""}
						</p>
					</div>
					<div className="shrink-0 text-right">
						<p className="text-sm font-extrabold tabular-nums">{formatToMoney(item.valorVendaTotalLiquido)}</p>
						{hasDiscount ? <p className="text-xs tabular-nums text-muted-foreground line-through">{formatToMoney(item.valorVendaTotalBruto)}</p> : null}
					</div>
				</div>
				{item.adicionais.length > 0 ? (
					<ul className="mt-2 space-y-1 text-xs text-muted-foreground">
						{item.adicionais.map((additional) => (
							<li key={additional.id} className="flex items-start justify-between gap-3">
								<span className="min-w-0">
									+ {additional.quantidade > 1 ? `${additional.quantidade}x ` : ""}
									{additional.opcao?.nome ?? "Adicional"}
								</span>
								<span className="shrink-0 tabular-nums">{additional.valorTotal ? formatToMoney(additional.valorTotal) : "Incluso"}</span>
							</li>
						))}
					</ul>
				) : null}
			</div>
		</div>
	);
}

function OrderDetails({ sale }: { sale: TGetSalesFulfillmentOutputById }) {
	const delivery = sale.entregaModalidade ? DELIVERY_META[sale.entregaModalidade] : null;
	return (
		<section className="overflow-hidden rounded-2xl border border-border bg-card">
			<SectionHeading title="Detalhes" />
			<div className="divide-y divide-border px-4 sm:px-5">
				<DetailGroup icon={delivery?.icon ?? <MapPin className="size-4" />} title="Entrega">
					<p className="text-sm font-bold">{delivery?.label ?? "Modalidade não informada"}</p>
					{sale.comandaNumero ? <p className="text-sm text-muted-foreground">Comanda {sale.comandaNumero}</p> : null}
					{sale.entregaLocalizacao ? <DeliveryAddress location={sale.entregaLocalizacao} /> : null}
					{sale.entregaModalidade === "ENTREGA" && !sale.entregaLocalizacao ? (
						<p className="text-sm text-muted-foreground">Endereço não informado.</p>
					) : null}
				</DetailGroup>
				<DetailGroup icon={<Banknote className="size-4" />} title="Pagamento">
					{sale.pagamentos.length > 0 ? (
						<div className="space-y-2.5">
							{sale.pagamentos.map((payment) => {
								const paymentState = getPaymentState(payment);
								return (
									<div key={payment.id} className="flex items-start justify-between gap-4">
										<div className="min-w-0">
											<p className="truncate text-sm font-bold">{PAYMENT_METHOD_LABELS[payment.metodo] ?? payment.metodo}</p>
											<p className={cn("mt-0.5 text-xs", paymentState.className)}>{paymentState.label}</p>
										</div>
										<p className="shrink-0 text-sm font-extrabold tabular-nums">{formatToMoney(payment.valor)}</p>
									</div>
								);
							})}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">Nenhum recebimento gerado.</p>
					)}
				</DetailGroup>
				<DetailGroup icon={<ReceiptText className="size-4" />} title="Fiscal">
					{sale.documentosFiscais.length > 0 ? (
						<div className="space-y-2.5">
							{sale.documentosFiscais.map((document) => (
								<div key={document.id} className="flex items-start justify-between gap-4">
									<div className="min-w-0">
										<p className="truncate text-sm font-bold">
											{FISCAL_DOCUMENT_TYPE_LABELS[document.tipo] ?? document.tipo} {document.numero ? `nº ${document.numero}` : "sem numeração"}
										</p>
										{document.serie ? <p className="text-xs text-muted-foreground">Série {document.serie}</p> : null}
									</div>
									<p className="shrink-0 text-xs font-bold text-muted-foreground">
										{FISCAL_DOCUMENT_STATUS_LABELS[document.statusInterno] ?? document.statusInterno}
									</p>
								</div>
							))}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">Nenhum documento emitido.</p>
					)}
				</DetailGroup>
				{sale.observacoes || sale.pagamentoObservacoes ? (
					<DetailGroup icon={<MessageSquareText className="size-4" />} title="Observações">
						<div className="space-y-2">
							{sale.observacoes ? <DetailLine label="Pedido" value={sale.observacoes} /> : null}
							{sale.pagamentoObservacoes ? <DetailLine label="Pagamento" value={sale.pagamentoObservacoes} /> : null}
						</div>
					</DetailGroup>
				) : null}
			</div>
		</section>
	);
}

function DetailGroup({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
	return (
		<div className="grid gap-2.5 py-4 sm:grid-cols-[116px_minmax(0,1fr)] sm:gap-4">
			<div className="flex items-center gap-2 self-start text-muted-foreground">
				{icon}
				<h3 className="text-xs font-extrabold uppercase tracking-[0.08em]">{title}</h3>
			</div>
			<div className="min-w-0">{children}</div>
		</div>
	);
}

function DeliveryAddress({ location }: { location: NonNullable<TGetSalesFulfillmentOutputById["entregaLocalizacao"]> }) {
	const firstLine = [location.localizacaoLogradouro, location.localizacaoNumero].filter(Boolean).join(", ");
	const secondLine = [location.localizacaoBairro, location.localizacaoCidade, location.localizacaoEstado].filter(Boolean).join(" · ");
	return (
		<address className="mt-1 not-italic text-sm leading-relaxed text-muted-foreground">
			{location.titulo ? <p className="font-semibold text-foreground">{location.titulo}</p> : null}
			{firstLine ? <p>{firstLine}</p> : null}
			{location.localizacaoComplemento ? <p>{location.localizacaoComplemento}</p> : null}
			{secondLine ? <p>{secondLine}</p> : null}
			{location.localizacaoCep ? <p className="tabular-nums">CEP {location.localizacaoCep}</p> : null}
		</address>
	);
}

function EmptyDetail({ icon, text }: { icon: ReactNode; text: string }) {
	return (
		<div className="flex items-center justify-center gap-3 px-4 py-10 text-center text-muted-foreground">
			<span className="text-brand/60">{icon}</span>
			<p className="text-sm font-medium">{text}</p>
		</div>
	);
}

function DetailLine({ label, value }: { label: string; value: string }) {
	return (
		<div className="text-sm leading-relaxed">
			<span className="font-bold">{label}: </span>
			<span className="whitespace-pre-wrap text-foreground/80">{value}</span>
		</div>
	);
}

function getAttendanceMeta(status: string, deliveryMode: string | null) {
	if (status === "PRONTO") {
		if (deliveryMode === "RETIRADA") return { label: "Pronto para retirada", icon: <PackageCheck className="size-4" /> };
		if (deliveryMode === "ENTREGA") return { label: "Pronto para despacho", icon: <PackageCheck className="size-4" /> };
	}
	return ATTENDANCE_META[status] ?? { label: status, icon: <Clock3 className="size-4" /> };
}

function getCustomerPhoneLinks(phone: string) {
	const digits = phone.replace(/\D/g, "");
	if (digits.length < 10) return null;
	const internationalNumber = digits.length <= 11 ? `55${digits}` : digits;
	return { tel: `tel:+${internationalNumber}`, whatsapp: `https://wa.me/${internationalNumber}` };
}

function getPaymentState(payment: TGetSalesFulfillmentOutputById["pagamentos"][number]) {
	if (payment.dataEfetivacao) return { label: `Recebido em ${formatDateAsLocale(payment.dataEfetivacao, true)}`, className: "text-success" };
	if (payment.provedorStatus === "CANCELADO" || payment.provedorStatus === "ESTORNADO")
		return { label: "Cancelado ou estornado", className: "text-destructive" };
	return { label: "Pendente", className: "text-muted-foreground" };
}

function SaleActionsFooter({
	sale,
	canEditSales,
	canDeleteSales,
}: {
	sale: TGetSalesFulfillmentOutputById;
	canEditSales?: boolean;
	canDeleteSales?: boolean;
}) {
	const [cancelDialogIsOpen, setCancelDialogIsOpen] = useState(false);
	const editability = sale.editabilidade;
	const showEdit = !!canEditSales && (editability.nivel === "TOTAL" || editability.rascunho || editability.motivos.length > 0);
	const showCancel = !!canDeleteSales && editability.cancelamentoDisponivel;
	if (!showEdit && !showCancel) return null;
	const editHref = editability.rascunho ? appRoutes.sales.checkout(sale.id) : appRoutes.sales.edit(sale.id);
	const editIsEnabled = editability.nivel === "TOTAL" || editability.rascunho;
	return (
		<section className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
			{showEdit && !editIsEnabled ? <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{editability.motivos[0]}</p> : <span />}
			<div className="flex flex-wrap items-center justify-end gap-2">
				{showCancel ? (
					<Button variant="ghost-destructive" onClick={() => setCancelDialogIsOpen(true)}>
						<CircleX className="size-4" />
						Cancelar venda
					</Button>
				) : null}
				{showEdit ? (
					editIsEnabled ? (
						<Button asChild>
							<Link href={editHref}>
								<PencilLine className="size-4" />
								{editability.rascunho ? "Abrir checkout" : "Editar venda"}
							</Link>
						</Button>
					) : (
						<Button disabled>
							<PencilLine className="size-4" />
							Editar venda
						</Button>
					)
				) : null}
			</div>
			{cancelDialogIsOpen ? (
				<CancelConfirmedSaleDialog
					saleId={sale.id}
					idExterno={sale.idExterno}
					valorTotal={sale.valorTotal}
					clienteNome={sale.cliente?.nome}
					exigeCancelamentoFiscal={editability.cancelamentoExigeFiscal}
					closeModal={() => setCancelDialogIsOpen(false)}
				/>
			) : null}
		</section>
	);
}
