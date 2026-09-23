"use client";

import type { TGetPublicShopOrderOutput } from "@/app/api/shop/[orgId]/orders/[token]/route";
import { OrgColorsProvider } from "@/components/Providers/OrgColorsProvider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { usePublicShopOrder } from "@/lib/queries/shop";
import type { TSaleAttendanceStatusEnum } from "@/schemas/enums";
import {
	AlertCircle,
	Check,
	Clock3,
	CreditCard,
	Gift,
	Package,
	Receipt,
	RefreshCw,
	RotateCcw,
	ShoppingBag,
	Sparkles,
	StickyNote,
	Store,
	Ticket,
	Truck,
	WalletCards,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type PublicOrderPageProps = {
	orgId: string;
	slug: string;
	token: string;
};

type PublicOrderData = TGetPublicShopOrderOutput["data"];
type PublicOrder = PublicOrderData["order"];

const STATUS_LABELS: Record<TSaleAttendanceStatusEnum, string> = {
	NAO_INICIADO: "Confirmado",
	EM_PREPARO: "Em preparo",
	PRONTO: "Pronto",
	EM_ENTREGA: "Em entrega",
	ENTREGUE: "Entregue",
	PARCIALMENTE_ENTREGUE: "Entrega parcial",
	CANCELADO: "Cancelado",
};

const STATUS_MESSAGES: Record<TSaleAttendanceStatusEnum, string> = {
	NAO_INICIADO: "A loja recebeu seu pedido e vai iniciar o atendimento.",
	EM_PREPARO: "Seu pedido está sendo preparado ou separado.",
	PRONTO: "Seu pedido está pronto para retirada ou envio.",
	EM_ENTREGA: "Seu pedido saiu para entrega.",
	ENTREGUE: "Seu pedido foi entregue. Obrigado pela compra!",
	PARCIALMENTE_ENTREGUE: "Uma parte do pedido foi entregue. A loja seguirá com os itens restantes.",
	CANCELADO: "Este pedido foi cancelado.",
};

const PAYMENT_LABELS: Record<string, string> = {
	DINHEIRO: "Dinheiro",
	PIX: "PIX",
	CARTAO_DEBITO: "Cartão de débito",
	CARTAO_CREDITO: "Cartão de crédito",
};

function getStatusSteps(deliveryMode: PublicOrder["deliveryMode"]): TSaleAttendanceStatusEnum[] {
	const base: TSaleAttendanceStatusEnum[] = ["NAO_INICIADO", "EM_PREPARO", "PRONTO"];
	return deliveryMode === "ENTREGA" ? [...base, "EM_ENTREGA", "ENTREGUE"] : [...base, "ENTREGUE"];
}

function getCurrentStepIndex(order: PublicOrder, steps: TSaleAttendanceStatusEnum[]) {
	if (order.statusAtendimento === "PARCIALMENTE_ENTREGUE") return steps.length - 1;
	const index = steps.indexOf(order.statusAtendimento);
	return Math.max(0, index);
}

function OrderLoading() {
	return (
		<div className="min-h-screen bg-background">
			<div className="border-b bg-card">
				<div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
					<Skeleton className="size-11 rounded-full" />
					<div className="flex flex-1 flex-col gap-2">
						<Skeleton className="h-4 w-36" />
						<Skeleton className="h-3 w-24" />
					</div>
				</div>
			</div>
			<main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
				<Skeleton className="h-48 rounded-2xl" />
				<div className="grid gap-4 md:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
					<Skeleton className="h-96 rounded-2xl" />
					<Skeleton className="h-80 rounded-2xl" />
				</div>
			</main>
		</div>
	);
}

function OrderError({ slug, retry }: { slug: string; retry: () => void }) {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
			<div className="flex w-full max-w-sm flex-col items-center text-center">
				<div className="mb-5 flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
					<AlertCircle className="size-8" />
				</div>
				<h1 className="text-xl font-black">Pedido não encontrado</h1>
				<p className="mt-2 text-sm leading-relaxed text-muted-foreground">O link pode estar incompleto ou o pedido ainda não está disponível.</p>
				<div className="mt-6 flex w-full flex-col gap-2">
					<Button className="h-11 rounded-xl font-bold" onClick={retry}>
						<RefreshCw className="size-4" />
						TENTAR NOVAMENTE
					</Button>
					<Button asChild variant="outline" className="h-11 rounded-xl font-bold">
						<Link href={"/shop/" + slug}>VOLTAR PARA A LOJA</Link>
					</Button>
				</div>
			</div>
		</main>
	);
}

function StoreHeader({ organization, slug }: { organization: PublicOrderData["organization"]; slug: string }) {
	return (
		<header className="border-b border-brand-foreground/20 bg-brand text-brand-foreground rounded-bl-2xl rounded-br-2xl">
			<div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:py-4">
				{organization.logoUrl ? (
					<div className="relative size-11 shrink-0 overflow-hidden rounded-full bg-background ring-2 ring-brand-foreground ring-offset-2 ring-offset-brand sm:size-12">
						<Image src={organization.logoUrl} alt={organization.nome} fill className="object-cover" sizes="48px" priority />
					</div>
				) : (
					<div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-foreground text-lg font-black text-brand ring-2 ring-brand-foreground ring-offset-2 ring-offset-brand sm:size-12">
						{organization.nome.charAt(0).toUpperCase()}
					</div>
				)}
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-black text-brand-foreground sm:text-base">{organization.nome}</p>
					<p className="truncate text-xs text-brand-foreground/70">Acompanhamento do pedido</p>
				</div>
				<Button
					asChild
					variant="none"
					size="sm"
					className="shrink-0 rounded-xl bg-brand-foreground/10 font-bold text-brand-foreground transition-colors hover:bg-brand-foreground/20"
				>
					<Link href={"/shop/" + slug}>
						<Store className="size-4" />
						<span className="hidden sm:inline">VER LOJA</span>
					</Link>
				</Button>
			</div>
		</header>
	);
}

function OrderStatus({ order, isRefetching, onRefresh }: { order: PublicOrder; isRefetching: boolean; onRefresh: () => void }) {
	const steps = getStatusSteps(order.deliveryMode);
	const currentIndex = getCurrentStepIndex(order, steps);
	const isCanceled = order.statusAtendimento === "CANCELADO" || order.status === "CANCELADA";

	return (
		<section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-live="polite">
			<div className="flex flex-col gap-4 p-5 sm:p-6">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Pedido #{order.orderNumber}</p>
						<h1 className={"mt-1 text-2xl font-black tracking-tight sm:text-3xl " + (isCanceled ? "text-destructive" : "text-foreground")}>
							{isCanceled ? "Pedido cancelado" : STATUS_LABELS[order.statusAtendimento]}
						</h1>
						<p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">{STATUS_MESSAGES[order.statusAtendimento]}</p>
					</div>
					<div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
						<Clock3 className="size-3.5" />
						{order.createdAt ? formatDateAsLocale(order.createdAt, true) : "Pedido recente"}
					</div>
				</div>

				{isCanceled ? (
					<div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
						<AlertCircle className="size-5 shrink-0 text-destructive" />
						<span>Entre em contato com a loja se precisar de mais informações.</span>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						<div className={"grid gap-0 pt-2 " + (steps.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
							{steps.map((step, index) => {
								const isComplete = index < currentIndex || order.statusAtendimento === "ENTREGUE";
								const isCurrent = index === currentIndex && order.statusAtendimento !== "ENTREGUE";
								return (
									<div key={step} className="relative flex min-w-0 flex-col items-center gap-2 text-center">
										{index > 0 ? (
											<div
												className={"absolute top-[0.9375rem] right-1/2 h-0.5 w-full " + (index <= currentIndex ? "bg-brand" : "bg-border")}
												aria-hidden="true"
											/>
										) : null}
										<div
											className={
												"relative z-10 flex size-8 items-center justify-center rounded-full border-2 text-xs font-black " +
												(isComplete
													? "border-brand bg-brand text-brand-foreground"
													: isCurrent
														? "border-brand bg-card text-foreground ring-4 ring-brand/15"
														: "border-border bg-muted text-muted-foreground")
											}
										>
											{isComplete ? <Check className="size-4" strokeWidth={3} /> : index + 1}
										</div>
										<span
											className={
												"hidden text-[0.625rem] leading-tight font-bold sm:block sm:text-xs " +
												(index <= currentIndex ? "text-foreground" : "text-muted-foreground")
											}
										>
											{STATUS_LABELS[step]}
										</span>
									</div>
								);
							})}
						</div>
						<p className="text-center text-xs font-bold text-muted-foreground sm:hidden">
							Etapa {currentIndex + 1} de {steps.length}
						</p>
					</div>
				)}
			</div>

			<div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-3 sm:px-6">
				<p className="text-xs text-muted-foreground">
					Atualizado às {new Date(order.checkedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
				</p>
				<Button variant="ghost" size="sm" className="rounded-xl font-bold" disabled={isRefetching} onClick={onRefresh}>
					<RefreshCw className={"size-4 " + (isRefetching ? "animate-spin" : "")} />
					ATUALIZAR
				</Button>
			</div>
		</section>
	);
}

function CashbackEarnedBanner({ order }: { order: PublicOrder }) {
	if (order.cashback.accumulated <= 0) return null;
	const isCanceled = order.statusAtendimento === "CANCELADO" || order.status === "CANCELADA";
	if (isCanceled) return null;

	return (
		<section className="flex items-center gap-4 rounded-2xl bg-brand p-5 text-brand-foreground shadow-sm sm:p-6">
			<span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-foreground/10">
				<Sparkles className="size-6" />
			</span>
			<div className="min-w-0">
				<p className="text-xs font-extrabold tracking-[0.08em] uppercase opacity-80">Você ganhou</p>
				<p className="text-2xl font-black tabular-nums leading-tight sm:text-3xl">{formatToMoney(order.cashback.accumulated)} de volta</p>
				<p className="mt-1 text-sm leading-relaxed opacity-90">Esse valor fica guardado para você. Use no seu próximo pedido e pague menos.</p>
			</div>
		</section>
	);
}

function OrderItems({ order }: { order: PublicOrder }) {
	return (
		<section className="rounded-2xl border bg-card shadow-sm">
			<div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
				<div className="flex items-center gap-2">
					<ShoppingBag className="size-5 text-brand-secondary" />
					<h2 className="font-black">Itens do pedido</h2>
				</div>
				<span className="text-xs font-bold text-muted-foreground">
					{order.items.length} {order.items.length === 1 ? "item" : "itens"}
				</span>
			</div>
			<div className="divide-y">
				{order.items.map((item) => (
					<div key={item.id} className="flex gap-3 px-5 py-4 sm:gap-4 sm:px-6">
						{item.imageUrl ? (
							<div className="relative size-16 shrink-0 overflow-hidden rounded-xl border bg-muted sm:size-20">
								<Image src={item.imageUrl} alt="" fill className="object-cover" sizes="80px" />
							</div>
						) : (
							<div className="flex size-16 shrink-0 items-center justify-center rounded-xl border bg-muted text-muted-foreground sm:size-20">
								<Package className="size-7" />
							</div>
						)}
						<div className="min-w-0 flex-1">
							<div className="flex items-start justify-between gap-3">
								<div>
									<h3 className="text-sm font-bold leading-snug">{item.name}</h3>
									<p className="mt-1 text-xs text-muted-foreground">
										{item.quantity} × {formatToMoney(item.unitPrice)}
									</p>
								</div>
								<p className="shrink-0 text-sm font-black tabular-nums">{formatToMoney(item.total)}</p>
							</div>
							{item.modifiers.length > 0 ? (
								<ul className="mt-2 flex flex-col gap-1">
									{item.modifiers.map((modifier) => (
										<li key={modifier.id} className="flex justify-between gap-3 text-xs text-muted-foreground">
											<span>
												+ {modifier.quantity}× {modifier.name}
											</span>
											<span className="tabular-nums">{formatToMoney(modifier.total)}</span>
										</li>
									))}
								</ul>
							) : null}
							{item.discount > 0 ? (
								<p className="mt-2 text-xs font-semibold text-green-700 dark:text-green-400">Desconto: {formatToMoney(item.discount)}</p>
							) : null}
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function PriceSummary({ order }: { order: PublicOrder }) {
	const couponDiscount = order.coupon?.discount ?? 0;
	const cashbackDiscount = order.cashback.redeemed;
	// Cada recompensa é um item grátis; o "outros descontos" subtrai TODAS, senão o valor das demais
	// apareceria como desconto avulso.
	const rewardDiscount = order.rewards.reduce((sum, reward) => sum + reward.commercialValue * reward.quantity, 0);
	const otherDiscount = Math.max(0, order.discount - couponDiscount - cashbackDiscount - rewardDiscount);

	return (
		<section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
			<div className="flex items-center gap-2">
				<Receipt className="size-5 text-brand-secondary" />
				<h2 className="font-black">Resumo do pedido</h2>
			</div>
			<div className="mt-4 flex flex-col gap-2.5 text-sm">
				<div className="flex justify-between gap-3 text-muted-foreground">
					<span>Subtotal</span>
					<span className="tabular-nums">{formatToMoney(order.subtotal)}</span>
				</div>
				{order.coupon ? (
					<div className="flex justify-between gap-3 text-muted-foreground">
						<span className="inline-flex min-w-0 items-center gap-1.5">
							<Ticket className="size-3.5 shrink-0" />
							<span className="truncate">Cupom {order.coupon.code ?? ""}</span>
						</span>
						<span className="tabular-nums">- {formatToMoney(couponDiscount)}</span>
					</div>
				) : null}
				{cashbackDiscount > 0 ? (
					<div className="flex justify-between gap-3 text-muted-foreground">
						<span>Cashback usado</span>
						<span className="tabular-nums">- {formatToMoney(cashbackDiscount)}</span>
					</div>
				) : null}
				{order.rewards.map((reward, index) => (
					<div key={`${reward.title}-${index}`} className="flex justify-between gap-3 text-muted-foreground">
						<span className="inline-flex min-w-0 items-center gap-1.5">
							<Gift className="size-3.5 shrink-0" />
							<span className="truncate">
								Recompensa: {reward.title}
								{reward.quantity > 1 ? ` ×${reward.quantity}` : ""}
							</span>
						</span>
						<span className="tabular-nums">- {formatToMoney(reward.commercialValue * reward.quantity)}</span>
					</div>
				))}
				{otherDiscount > 0 ? (
					<div className="flex justify-between gap-3 text-muted-foreground">
						<span>Descontos</span>
						<span className="tabular-nums">- {formatToMoney(otherDiscount)}</span>
					</div>
				) : null}
				{order.additions > 0 ? (
					<div className="flex justify-between gap-3 text-muted-foreground">
						<span>Acréscimos</span>
						<span className="tabular-nums">{formatToMoney(order.additions)}</span>
					</div>
				) : null}
				<div className="mt-1 flex items-end justify-between gap-3 border-t pt-4">
					<span className="font-bold">Total</span>
					<span className="text-xl font-black tabular-nums text-brand-secondary">{formatToMoney(order.total)}</span>
				</div>
			</div>
		</section>
	);
}

function DeliveryAndPayment({ order }: { order: PublicOrder }) {
	const address = order.deliveryAddress;
	const addressLines = address
		? [
				[address.logradouro, address.numero].filter(Boolean).join(", "),
				[address.bairro, address.cidade, address.estado].filter(Boolean).join(", "),
				address.cep ? "CEP " + address.cep : null,
			].filter(Boolean)
		: [];

	return (
		<section className="rounded-2xl border bg-card shadow-sm">
			<div className="flex gap-3 px-5 py-4 sm:px-6">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-foreground">
					{order.deliveryMode === "ENTREGA" ? <Truck className="size-5" /> : <Package className="size-5" />}
				</div>
				<div>
					<h2 className="text-sm font-black">{order.deliveryMode === "ENTREGA" ? "Entrega" : "Retirada no local"}</h2>
					{addressLines.length > 0 ? (
						<div className="mt-1 flex flex-col text-xs leading-relaxed text-muted-foreground">
							{addressLines.map((line) => (
								<span key={line}>{line}</span>
							))}
						</div>
					) : (
						<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
							{order.deliveryMode === "ENTREGA" ? "Endereço protegido por privacidade." : "Retire o pedido diretamente na loja."}
						</p>
					)}
				</div>
			</div>
			<div className="flex gap-3 border-t px-5 py-4 sm:px-6">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-secondary/10 text-brand-secondary">
					<CreditCard className="size-5" />
				</div>
				<div>
					<h2 className="text-sm font-black">Pagamento</h2>
					<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
						{order.payment.method ? (PAYMENT_LABELS[order.payment.method] ?? order.payment.method) : "Forma de pagamento não informada"}
					</p>
					{order.payment.description ? <p className="mt-0.5 text-xs text-muted-foreground">{order.payment.description}</p> : null}
				</div>
			</div>
		</section>
	);
}

function CashbackSummary({ order }: { order: PublicOrder }) {
	if (order.cashback.redeemed <= 0 && order.cashback.accumulated <= 0) return null;
	return (
		<section className="rounded-2xl border border-brand/30 bg-brand/10 p-5 sm:p-6">
			<div className="flex items-center gap-2">
				<WalletCards className="size-5 text-brand-secondary" />
				<h2 className="font-black">Cashback</h2>
			</div>
			<div className="mt-3 flex flex-col gap-2 text-sm">
				{order.cashback.redeemed > 0 ? (
					<div className="flex justify-between gap-3">
						<span>Usado neste pedido</span>
						<span className="font-black tabular-nums">{formatToMoney(order.cashback.redeemed)}</span>
					</div>
				) : null}
				{order.cashback.accumulated > 0 ? (
					<div className="flex justify-between gap-3">
						<span>Gerado com a compra</span>
						<span className="font-black tabular-nums">{formatToMoney(order.cashback.accumulated)}</span>
					</div>
				) : null}
			</div>
		</section>
	);
}

function OrderContent({
	data,
	slug,
	isRefetching,
	onRefresh,
}: {
	data: PublicOrderData;
	slug: string;
	isRefetching: boolean;
	onRefresh: () => void;
}) {
	const { order, organization } = data;
	return (
		<div className="min-h-screen bg-muted/30">
			<StoreHeader organization={organization} slug={slug} />
			<main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-5 sm:py-7">
				<OrderStatus order={order} isRefetching={isRefetching} onRefresh={onRefresh} />
				<CashbackEarnedBanner order={order} />
				<div className="grid items-start gap-4 md:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
					<OrderItems order={order} />
					<div className="flex flex-col gap-4">
						<PriceSummary order={order} />
						<DeliveryAndPayment order={order} />
						<CashbackSummary order={order} />
						{order.notes ? (
							<section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
								<div className="flex items-center gap-2">
									<StickyNote className="size-5 text-brand-secondary" />
									<h2 className="font-black">Observações</h2>
								</div>
								<p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{order.notes}</p>
							</section>
						) : null}
					</div>
				</div>
				<div className="flex flex-col items-center gap-2 py-4 text-center">
					<p className="text-xs text-muted-foreground">Esta página atualiza automaticamente enquanto o pedido está em andamento.</p>
					<Button asChild variant="ghost" size="sm" className="rounded-xl">
						<Link href={"/shop/" + slug}>
							<RotateCcw className="size-4" />
							FAZER OUTRO PEDIDO
						</Link>
					</Button>
				</div>
			</main>
		</div>
	);
}

export default function PublicOrderPage({ orgId, slug, token }: PublicOrderPageProps) {
	const { data, isLoading, isError, isRefetching, refetch } = usePublicShopOrder({ orgId, token });

	if (isLoading) return <OrderLoading />;
	if (isError || !data) return <OrderError slug={slug} retry={() => void refetch()} />;

	const { organization } = data;
	return (
		<OrgColorsProvider
			scoped
			corPrimaria={organization.corPrimaria}
			corPrimariaForeground={organization.corPrimariaForeground}
			corSecundaria={organization.corSecundaria}
			corSecundariaForeground={organization.corSecundariaForeground}
		>
			<OrderContent data={data} slug={slug} isRefetching={isRefetching} onRefresh={() => void refetch()} />
		</OrgColorsProvider>
	);
}
