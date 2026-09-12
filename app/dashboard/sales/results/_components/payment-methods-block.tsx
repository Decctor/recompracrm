"use client";

import type { TSalesResults } from "@/lib/sales/results";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { getPaymentMethodIcon } from "@/lib/payments/icons";
import { formatPaymentMethod } from "@/lib/payments/labels";
import { buildSalesHistoryHref, type TSalesHistoryUrlState } from "@/lib/sales/history-url-state";
import { cn } from "@/lib/utils";
import IfoodLogo from "@/utils/images/integrations/ifood-logo.png";
import { FinancialAccountTypeOptions } from "@/utils/select-options";
import { ArrowDownLeft, ArrowUpRight, Equal, Info, Landmark, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type PaymentMethodsBlockProps = {
	porMetodo: TSalesResults["porMetodo"];
	faturamento: number;
	/** Recorte do relatório (período, vendedores, status) que cada linha carrega para o histórico. */
	historyFilters: Partial<TSalesHistoryUrlState>;
};

export function PaymentMethodsBlock({ porMetodo, faturamento, historyFilters }: PaymentMethodsBlockProps) {
	const { linhas, totalRecebido, totalBruto, ajustes, cobertura } = porMetodo;
	const totalPendente = linhas.reduce((acc, linha) => acc + linha.valorPendente, 0);
	const adjustmentParts = [
		ajustes.troco > 0 ? `${formatToMoney(ajustes.troco)} de troco` : null,
		ajustes.taxasCanal > 0 ? `${formatToMoney(ajustes.taxasCanal)} de taxas do canal` : null,
		ajustes.naoClassificado > 0 ? `${formatToMoney(ajustes.naoClassificado)} ainda não classificados` : null,
	].filter((part): part is string => part !== null);

	return (
		<section className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-200 p-1 text-green-600">
						<Wallet className="h-4 w-4 min-h-4 min-w-4" />
					</div>
					<h1 className="text-xs font-medium leading-none tracking-tight">RECEBIMENTOS POR MÉTODO</h1>
				</div>
				<span className="text-sm font-medium tabular-nums">{formatToMoney(totalRecebido)}</span>
			</div>

			{linhas.length === 0 ? (
				<span className="text-xs text-muted-foreground">Nenhum recebimento registrado para as vendas do período.</span>
			) : (
				<div className="flex flex-col gap-2">
					{linhas.map((linha) => (
						<PaymentMethodRow key={linha.metodo} linha={linha} historyFilters={historyFilters} />
					))}
				</div>
			)}

			<div className="flex flex-col gap-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
				{ajustes.total > 0 ? (
					<span>
						Recebimentos brutos de {formatToMoney(totalBruto)}, menos {adjustmentParts.join(" e ")}.
					</span>
				) : null}
				{totalPendente > 0 ? <span>{formatToMoney(totalPendente)} ainda a receber (parcelas, boletos e prazos), atribuídos à data da venda.</span> : null}
				{cobertura.vendasSemPagamento > 0 ? (
					<span>
						{cobertura.vendasSemPagamento} {cobertura.vendasSemPagamento === 1 ? "venda" : "vendas"} ({formatToMoney(cobertura.valorSemPagamento)}) sem
						registro de pagamento, por isso os recebimentos não fecham com o faturamento de {formatToMoney(faturamento)}.
					</span>
				) : null}
			</div>
		</section>
	);
}

type PaymentMethodRowProps = {
	linha: TSalesResults["porMetodo"]["linhas"][number];
	historyFilters: Partial<TSalesHistoryUrlState>;
};

function PaymentMethodRow({ linha, historyFilters }: PaymentMethodRowProps) {
	const Icon = getPaymentMethodIcon(linha.metodo);
	const hasOutflow = linha.saidas.total > 0;
	const outflowParts = [
		linha.saidas.troco > 0
			? // O troco que excede o dinheiro recebido nas próprias vendas saiu por vendas pagas em outro
				// método (pagou PIX, levou troco em espécie) — sem a cláusula, "ficou" parece não fechar
				// com a soma das vendas em dinheiro.
				`troco ${formatToMoney(linha.saidas.troco)}${
					linha.saidas.trocoDeOutrosMetodos > 0 ? ` (${formatToMoney(linha.saidas.trocoDeOutrosMetodos)} de vendas recebidas em outro método)` : ""
				}`
			: null,
		linha.saidas.taxasCanal > 0 ? `taxas do canal ${formatToMoney(linha.saidas.taxasCanal)}` : null,
	].filter((part): part is string => part !== null);

	const trigger = (
		<Link
			href={buildSalesHistoryHref({ ...historyFilters, paymentMethods: [linha.metodo] })}
			title="Ver detalhes e abrir as vendas deste método no histórico"
			className="-mx-1 flex flex-col gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40"
		>
			<div className="flex items-center justify-between gap-2 text-xs">
				<div className="flex items-center gap-1.5">
					<Icon className="h-3.5 w-3.5 min-h-3.5 min-w-3.5 text-muted-foreground" />
					<span className="font-semibold">{formatPaymentMethod(linha.metodo)}</span>
				</div>
				<div className="flex items-center gap-2 tabular-nums sm:gap-3">
					<span className="text-muted-foreground">
						{linha.qtdeVendas} {linha.qtdeVendas === 1 ? "venda" : "vendas"}
					</span>
					<span className="font-medium">{formatToMoney(linha.valor)}</span>
					<span className="w-12 text-right text-muted-foreground">{formatDecimalPlaces(linha.participacaoPercentual, 1, 1)}%</span>
					<Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
				</div>
			</div>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-primary"
					style={{
						width: `${Math.min(100, Math.max(0, linha.participacaoPercentual))}%`,
					}}
				/>
			</div>
		</Link>
	);

	return (
		<HoverCard>
			<HoverCardTrigger delay={150} closeDelay={100} render={trigger} />
			<HoverCardContent align="end" side="right" className="w-80 overflow-hidden p-0">
				<div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2.5">
					<div className="flex min-w-0 items-center gap-2">
						<Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
						<strong className="truncate text-sm">{formatPaymentMethod(linha.metodo)}</strong>
					</div>
					<strong className="shrink-0 text-sm tabular-nums">{formatToMoney(linha.valor)}</strong>
				</div>

				<div className="flex flex-col gap-3 p-3">
					<section className="flex flex-col gap-2">
						<div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							<Landmark className="h-3.5 w-3.5" />
							Destino financeiro
						</div>
						{linha.contas.map((conta) => (
							<FinancialAccountDetail key={conta.contaFinanceiraId ?? "sem-conta"} conta={conta} />
						))}
						{linha.contas.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma entrada vinculada a uma conta financeira.</p> : null}
					</section>

					<section className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-[11px] tabular-nums">
						<FlowValue icon={ArrowDownLeft} label="Entrou" value={linha.valor} className="text-green-700 dark:text-green-400" />
						<FlowValue icon={ArrowUpRight} label="Saiu" value={linha.saidas.total} className="text-red-700 dark:text-red-400" />
						<FlowValue icon={Equal} label="Ficou" value={linha.valorLiquido} className="text-foreground" />
					</section>

					{linha.valorPendente > 0 || linha.valorTaxas > 0 || hasOutflow ? (
						<div className="flex flex-col gap-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
							{linha.valorPendente > 0 ? <span>A receber: {formatToMoney(linha.valorPendente)}</span> : null}
							{linha.valorTaxas > 0 ? <span>Taxas da transação: {formatToMoney(linha.valorTaxas)}</span> : null}
							{hasOutflow ? <span>Saídas: {outflowParts.join(" + ")}.</span> : null}
						</div>
					) : null}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

type FinancialAccountDetailProps = {
	conta: TSalesResults["porMetodo"]["linhas"][number]["contas"][number];
};

function FinancialAccountDetail({ conta }: FinancialAccountDetailProps) {
	const typeConfig = FinancialAccountTypeOptions.find((option) => option.value === conta.contaFinanceiraTipo);
	const isIfood = conta.contaFinanceiraChaveSistema === "IFOOD";

	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex min-w-0 items-center gap-2">
				<span
					className={cn(
						"flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
						isIfood ? "bg-background ring-1 ring-border" : (typeConfig?.colors.background ?? "bg-muted"),
						typeConfig?.colors.text ?? "text-muted-foreground",
					)}
				>
					{isIfood ? (
						<Image src={IfoodLogo} alt="" className="h-3 w-5 object-contain" />
					) : typeConfig ? (
						typeConfig.renderIcon("h-3.5 w-3.5")
					) : (
						<Wallet className="h-3.5 w-3.5" />
					)}
				</span>
				<div className="min-w-0">
					<p className="truncate text-xs font-medium">{conta.contaFinanceiraNome}</p>
					{conta.valorPendente > 0 ? (
						<p className="text-[10px] text-amber-700 dark:text-amber-400">{formatToMoney(conta.valorPendente)} a receber</p>
					) : null}
				</div>
			</div>
			<div className="shrink-0 text-right tabular-nums">
				<p className="text-xs font-semibold">{formatToMoney(conta.valor)}</p>
				<p className="text-[10px] text-muted-foreground">{formatDecimalPlaces(conta.participacaoPercentual, 1, 1)}%</p>
			</div>
		</div>
	);
}

type FlowValueProps = {
	icon: typeof ArrowDownLeft;
	label: string;
	value: number;
	className: string;
};

function FlowValue({ icon: Icon, label, value, className }: FlowValueProps) {
	return (
		<div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
			<span className="flex items-center gap-1 font-medium">
				<Icon className="h-3 w-3" />
				{label}
			</span>
			<strong className="truncate text-xs">{formatToMoney(value)}</strong>
		</div>
	);
}
