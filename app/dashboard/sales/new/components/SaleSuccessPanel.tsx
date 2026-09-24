"use client";

import { Button } from "@/components/ui/button";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import type { TSaleSuccess } from "@/state-hooks/use-sale-state";
import { SalePaymentMethodsOptions } from "@/utils/select-options";
import {
	ArrowRight,
	Check,
	CircleAlert,
	Clock,
	PackageCheck,
	ReceiptText,
	RotateCcw,
	ShoppingBag,
	Sparkles,
	UserRound,
	WalletCards,
} from "lucide-react";
import Link from "next/link";

const DELIVERY_LABELS: Record<TSaleSuccess["entregaModalidade"], string> = {
	PRESENCIAL: "Presencial",
	RETIRADA: "Retirada",
	ENTREGA: "Entrega",
	COMANDA: "Comanda",
};

type SaleSuccessPanelProps = {
	success: TSaleSuccess;
	onStartNewSale: () => void;
};

function getPaymentLabel(method: TSaleSuccess["pagamentos"][number]["metodo"]) {
	return SalePaymentMethodsOptions.find((option) => option.value === method)?.label ?? method;
}

export default function SaleSuccessPanel({ success, onStartNewSale }: SaleSuccessPanelProps) {
	const showAttendance = success.mode === "ORCAMENTO" || success.entregaModalidade !== "PRESENCIAL";
	const saleReference = success.saleId.slice(-8).toUpperCase();
	const historyHref = appRoutes.sales.root();
	const attendanceHref = `${appRoutes.sales.orders()}?saleId=${encodeURIComponent(success.saleId)}`;
	// O orçamento existe para ser cobrado depois — mas "depois" costuma ser agora mesmo, quando o
	// cliente decide fechar no balcão. Sem este atalho o caminho de volta era o histórico.
	const checkoutHref = success.mode === "ORCAMENTO" ? appRoutes.sales.checkout(success.saleId) : null;

	return (
		<div className="flex min-h-[calc(100vh-8rem)] w-full items-center justify-center p-4">
			<section
				className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
				aria-labelledby="sale-success-title"
				aria-live="polite"
			>
				<div className="flex flex-col items-center gap-3 px-5 pb-5 pt-6 text-center sm:px-8 sm:pt-8">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
						<Check className="h-6 w-6" aria-hidden="true" />
					</div>
					<div className="space-y-1">
						<p className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
							{success.mode === "ORCAMENTO" ? "Orçamento registrado" : "Venda concluída"}
						</p>
						<h1 id="sale-success-title" className="text-balance text-xl font-black tracking-tight sm:text-2xl">
							{success.title}
						</h1>
						<p className="text-sm text-muted-foreground">{success.description}</p>
					</div>
					<Link
						href={appRoutes.sales.details(success.saleId)}
						className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
					>
						VENDA #{saleReference}
						<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
					</Link>
				</div>

				<div className="grid border-y border-border bg-muted/25 sm:grid-cols-3">
					<div className="flex items-center gap-3 px-5 py-4 sm:border-r sm:border-border">
						<ReceiptText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						<div className="min-w-0">
							<p className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Total</p>
							<p className="truncate text-lg font-black tabular-nums">{formatToMoney(success.valorFinal)}</p>
						</div>
					</div>
					<div className="flex items-center gap-3 border-t border-border px-5 py-4 sm:border-r sm:border-t-0">
						<PackageCheck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						<div className="min-w-0">
							<p className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Itens</p>
							<p className="truncate text-sm font-bold">
								{success.itemCount} {success.itemCount === 1 ? "item" : "itens"}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-3 border-t border-border px-5 py-4 sm:border-t-0">
						<UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						<div className="min-w-0">
							<p className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Cliente</p>
							<p className="truncate text-sm font-bold">{success.clienteNome ?? "Consumidor"}</p>
						</div>
					</div>
				</div>

				<div className="space-y-3 px-5 py-5 sm:px-8">
					<div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
						<div>
							<p className="text-xs font-semibold text-muted-foreground">Vendedor</p>
							<p className="font-bold">{success.vendedorNome ?? "Não informado"}</p>
						</div>
						<div>
							<p className="text-xs font-semibold text-muted-foreground">Modalidade</p>
							<p className="font-bold">{DELIVERY_LABELS[success.entregaModalidade]}</p>
						</div>
					</div>

					{success.pagamentos.length > 0 ? (
						<div className="flex items-start gap-2.5 border-t border-border pt-3">
							<WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<div className="min-w-0 text-sm">
								<p className="font-semibold text-muted-foreground">Pagamento</p>
								<p className="font-bold">
									{success.pagamentos.map((payment) => `${getPaymentLabel(payment.metodo)} ${formatToMoney(payment.valor)}`).join(" + ")}
								</p>
								{success.troco > 0 ? <p className="text-xs text-muted-foreground">Troco: {formatToMoney(success.troco)}</p> : null}
							</div>
						</div>
					) : null}

					{success.cashbackAcumulado && success.cashbackAcumulado > 0 ? (
						<div className="flex items-center gap-2.5 border-t border-border pt-3 text-sm">
							<Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
							<p>
								Cashback gerado: <strong>{formatToMoney(success.cashbackAcumulado)}</strong>
							</p>
						</div>
					) : null}

					{success.fiscal?.status === "SOLICITADO" ? (
						<div className="flex items-center gap-2.5 border-t border-border pt-3 text-sm">
							<Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
							<p>Emissão fiscal solicitada com sucesso.</p>
						</div>
					) : null}

					{success.fiscal?.status === "AGENDADO" ? (
						<div className="flex items-center gap-2.5 border-t border-border pt-3 text-sm">
							<Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<p>
								Emissão fiscal agendada
								{success.fiscal.agendadaPara ? (
									<>
										{" "}
										para <strong>{formatDateAsLocale(success.fiscal.agendadaPara, true)}</strong>
									</>
								) : null}
								.
							</p>
						</div>
					) : null}

					{success.fiscal?.status === "ERRO" ? (
						<div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
							<CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
							<div>
								<p className="font-bold">A venda foi concluída, mas a emissão fiscal falhou.</p>
								<p className="mt-0.5 text-xs">{success.fiscal.error ?? "Tente emitir o documento novamente pelos detalhes da venda."}</p>
							</div>
						</div>
					) : null}
				</div>

				<div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:px-8">
					<Button onClick={onStartNewSale} size="lg" className="w-full sm:w-auto">
						<RotateCcw className="h-4 w-4" aria-hidden="true" />
						NOVA VENDA
					</Button>
					{checkoutHref ? (
						<Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
							<Link href={checkoutHref}>
								<ShoppingBag className="h-4 w-4" aria-hidden="true" />
								ABRIR CHECKOUT
							</Link>
						</Button>
					) : null}
					{showAttendance ? (
						<Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
							<Link href={attendanceHref}>VER NO ATENDIMENTO</Link>
						</Button>
					) : null}
					<Button asChild variant="ghost" size="lg" className="w-full sm:ml-auto sm:w-auto">
						<Link href={historyHref}>IR PARA O HISTÓRICO</Link>
					</Button>
				</div>
			</section>
		</div>
	);
}
