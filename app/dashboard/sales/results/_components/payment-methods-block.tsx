"use client";

import type { TSalesResults } from "@/lib/sales/results";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { getPaymentMethodIcon } from "@/lib/payments/icons";
import { formatPaymentMethod } from "@/lib/payments/labels";
import { buildSalesHistoryHref, type TSalesHistoryUrlState } from "@/lib/sales/history-url-state";
import { ArrowDownLeft, ArrowUpRight, Equal, Wallet } from "lucide-react";
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
					linha.saidas.trocoDeOutrosMetodos > 0 ? ` — ${formatToMoney(linha.saidas.trocoDeOutrosMetodos)} de vendas recebidas em outro método` : ""
				}`
			: null,
		linha.saidas.taxasCanal > 0 ? `taxas do canal ${formatToMoney(linha.saidas.taxasCanal)}` : null,
	].filter((part): part is string => part !== null);

	return (
		<Link
			href={buildSalesHistoryHref({ ...historyFilters, paymentMethods: [linha.metodo] })}
			title="Ver as vendas deste método no histórico"
			className="flex flex-col gap-1 rounded-md -mx-1 px-1 py-0.5 transition-colors hover:bg-muted/60"
		>
			<div className="flex items-center justify-between gap-2 text-xs">
				<div className="flex items-center gap-1.5">
					<Icon className="h-3.5 w-3.5 min-h-3.5 min-w-3.5 text-muted-foreground" />
					<span className="font-semibold">{formatPaymentMethod(linha.metodo)}</span>
				</div>
				<div className="flex items-center gap-3 tabular-nums">
					<span className="text-muted-foreground">
						{linha.qtdeVendas} {linha.qtdeVendas === 1 ? "venda" : "vendas"}
					</span>
					{linha.valorPendente > 0 ? <span className="text-amber-700 dark:text-amber-400">a receber {formatToMoney(linha.valorPendente)}</span> : null}
					{linha.valorTaxas > 0 ? <span className="text-muted-foreground">taxas {formatToMoney(linha.valorTaxas)}</span> : null}
					<span className="font-medium">{formatToMoney(linha.valor)}</span>
					<span className="w-12 text-right text-muted-foreground">{formatDecimalPlaces(linha.participacaoPercentual, 1, 1)}%</span>
				</div>
			</div>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, linha.participacaoPercentual))}%` }} />
			</div>
			{hasOutflow ? (
				// Fluxo do método: o valor acima é o que entrou; aqui fica claro quanto saiu e quanto ficou.
				<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
					<span className="flex items-center gap-0.5 text-green-700 dark:text-green-400">
						<ArrowDownLeft className="h-3 w-3" />
						entrou {formatToMoney(linha.valor)}
					</span>
					<span className="flex items-center gap-0.5 text-red-700 dark:text-red-400">
						<ArrowUpRight className="h-3 w-3" />
						saiu {formatToMoney(linha.saidas.total)} ({outflowParts.join(" + ")})
					</span>
					<span className="flex items-center gap-0.5 font-medium">
						<Equal className="h-3 w-3" />
						ficou {formatToMoney(linha.valorLiquido)}
					</span>
				</div>
			) : null}
		</Link>
	);
}
