"use client";

import type { TProductStockAnalytics } from "@/app/api/products/stock-analytics/route";
import { formatQuantity } from "@/lib/stock/analytics/format";
import { LEAD_TIME_SAMPLE_SIZE, SUGGESTION_COVERAGE_DAYS } from "@/lib/stock/analytics/replenishment";
import { cn } from "@/lib/utils";
import { CircleCheck, ClockAlert, Repeat } from "lucide-react";

/** Régua do saldo frente à segurança e ao ponto de pedido, com o cálculo linha a linha. */
export function ReorderPointCard({ analytics }: { analytics: TProductStockAnalytics }) {
	const { reposicao, kpis, produto } = analytics;
	const unit = produto.unidade.toLowerCase();
	const hasConsumption = kpis.consumoMedioDia > 0;
	const scaleMax = Math.ceil(Math.max(reposicao.pontoPedido * 2, produto.saldo, 10) / 10) * 10;
	const percent = (value: number) => Math.max(0, Math.min(100, (value / scaleMax) * 100));
	const consumption = formatQuantity(kpis.consumoMedioDia, 1);

	const rows = [
		{
			label: "CONSUMO MÉDIO DIÁRIO",
			hint: `Últimos 30 dias, desvio padrão de ${formatQuantity(kpis.desvioPadrao, 1)} ${unit}/dia`,
			value: `${consumption} ${unit}`,
			tone: "",
		},
		{
			label: "PRAZO MÉDIO DE REPOSIÇÃO",
			hint:
				reposicao.prazoOrigem === "COMPRAS"
					? `Calculado ${reposicao.comprasConsideradas === 1 ? "da última compra" : `das últimas ${reposicao.comprasConsideradas} compras`} (pedido → entrada)`
					: `Sem compras com data de pedido e de entrada: prazo padrão (até ${LEAD_TIME_SAMPLE_SIZE} compras entram no cálculo)`,
			value: `${reposicao.prazoDias} ${reposicao.prazoDias === 1 ? "dia" : "dias"}`,
			tone: "",
		},
		{
			label: "ESTOQUE DE SEGURANÇA",
			hint: "1,65 × desvio × √prazo (95% de nível de serviço)",
			value: `${formatQuantity(reposicao.estoqueSeguranca)} ${unit}`,
			tone: "text-destructive-surface-foreground",
		},
		{
			label: "PONTO DE PEDIDO",
			hint: `${consumption} × ${reposicao.prazoDias} dias + ${formatQuantity(reposicao.estoqueSeguranca)} de segurança`,
			value: `${formatQuantity(reposicao.pontoPedido)} ${unit}`,
			tone: "font-bold text-warning-surface-foreground",
		},
		{
			label: "QUANTIDADE SUGERIDA",
			hint: `Cobre ${SUGGESTION_COVERAGE_DAYS} dias após a entrega e recompõe a segurança`,
			value: `${formatQuantity(reposicao.sugestao)} ${unit}`,
			tone: "font-bold text-info",
		},
	];

	return (
		<div className="bg-card border-border flex flex-col gap-3.5 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<div className="bg-primary/20 flex size-7 items-center justify-center rounded-full">
						<Repeat className="size-4" />
					</div>
					<h3 className="text-xs font-medium leading-none tracking-tight">PONTO DE PEDIDO</h3>
				</div>
				{hasConsumption ? (
					reposicao.abaixoPontoPedido ? (
						<span className="bg-warning-surface text-warning-surface-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold">
							<ClockAlert className="size-3" />
							REPOR AGORA
						</span>
					) : (
						<span className="bg-success-surface text-success-surface-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold">
							<CircleCheck className="size-3" />
							SALDO OK
						</span>
					)
				) : null}
			</div>

			{hasConsumption ? (
				<div className="flex flex-col gap-1.5 pt-6">
					<div className="relative flex h-3.5 overflow-hidden rounded-full">
						<div className="bg-destructive-surface" style={{ width: `${percent(reposicao.estoqueSeguranca)}%` }} />
						<div className="bg-warning-surface" style={{ width: `${percent(reposicao.pontoPedido) - percent(reposicao.estoqueSeguranca)}%` }} />
						<div className="bg-success-surface flex-1" />
					</div>
					<div className="relative h-[30px]">
						<div className="absolute -top-[22px] flex -translate-x-1/2 flex-col items-center" style={{ left: `${percent(produto.saldo)}%` }}>
							<div className="bg-foreground h-[18px] w-1 rounded-sm" />
							<span className="mt-1 whitespace-nowrap text-[11px] font-bold">AGORA · {formatQuantity(produto.saldo)}</span>
						</div>
						<GaugeLabel left={percent(reposicao.estoqueSeguranca)} className="text-destructive-surface-foreground" value={reposicao.estoqueSeguranca} />
						<GaugeLabel left={percent(reposicao.pontoPedido)} className="text-warning-surface-foreground" value={reposicao.pontoPedido} />
						<span className="text-success-surface-foreground absolute right-0 top-3 text-[10px] font-semibold">{scaleMax}</span>
					</div>
				</div>
			) : (
				<p className="text-muted-foreground text-xs">Sem saídas nos últimos 30 dias: não há consumo para calcular o ponto de pedido.</p>
			)}

			<div className="flex flex-col gap-2.5">
				{rows.map((row, index) => (
					<div key={row.label} className={cn("flex items-start justify-between gap-3 pb-2.5", index < rows.length - 1 && "border-border border-b")}>
						<div className="flex min-w-0 flex-col gap-0.5">
							<span className="text-xs font-medium tracking-tight">{row.label}</span>
							<span className="text-muted-foreground text-[11px]">{row.hint}</span>
						</div>
						<span className={cn("whitespace-nowrap text-sm font-semibold tabular-nums", row.tone)}>{row.value}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function GaugeLabel({ left, value, className }: { left: number; value: number; className: string }) {
	return (
		<span className={cn("absolute top-3 -translate-x-1/2 text-[10px] font-semibold", className)} style={{ left: `${left}%` }}>
			{formatQuantity(value)}
		</span>
	);
}
