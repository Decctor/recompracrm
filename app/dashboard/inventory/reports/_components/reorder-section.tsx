"use client";

import { Button } from "@/components/ui/button";
import { appRoutes } from "@/lib/navigation/routes";
import { type TStockReportPeriod, useStockReportReorder } from "@/lib/queries/inventory-reports";
import { formatDays, formatMoney, formatQuantity } from "@/lib/stock/analytics/format";
import { cn } from "@/lib/utils";
import { Info, Repeat } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MetricLabel, ReportSection, ReportSectionState } from "./report-section";

const INITIAL_ROWS = 6;

export function ReorderSection({ period }: { period: TStockReportPeriod }) {
	const [expanded, setExpanded] = useState(false);
	const { data, isLoading, error } = useStockReportReorder({ period });
	const rows = data ? (expanded ? data.itens : data.itens.slice(0, INITIAL_ROWS)) : [];

	return (
		<ReportSection
			id="reposicao"
			icon={Repeat}
			title="Ponto de pedido"
			description="Produtos no ou abaixo do ponto de pedido. Prazo de reposição calculado das compras anteriores de cada produto."
			actions={
				data && data.total.produtos > 0 ? (
					<span className="text-xs font-semibold">
						{formatQuantity(data.total.produtos)} {data.total.produtos === 1 ? "produto" : "produtos"} ·{" "}
						<span className="text-info">{formatMoney(data.total.valorSugerido)}</span> em compras sugeridas
					</span>
				) : null
			}
		>
			<ReportSectionState
				isLoading={isLoading}
				error={error}
				isEmpty={!!data && data.itens.length === 0}
				emptyMessage="Nenhum produto no ponto de pedido."
			>
				<div className="flex flex-col gap-2">
					{rows.map((item) => {
						const scaleMax = Math.max(item.pontoPedido * 2, item.saldo * 1.2, 1);
						const percent = (value: number) => Math.max(0, Math.min(100, (value / scaleMax) * 100));
						const critical = item.coberturaDias != null && item.coberturaDias <= item.prazoReposicaoDias;
						return (
							<div
								key={item.produtoId}
								className="bg-card border-border hover:border-primary/40 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border p-3 shadow-2xs transition-colors"
							>
								<div className="flex min-w-0 flex-[1_1_220px] flex-col">
									<span className="text-sm font-bold tracking-tight">{item.nome}</span>
									<span className="text-foreground/70 text-[0.65rem] font-medium">
										{item.codigo} · {item.grupo}
									</span>
								</div>
								<div className="flex min-w-[200px] flex-[2_1_260px] flex-col gap-1">
									<div className="relative flex h-2 overflow-hidden rounded-full">
										<div className="bg-destructive-surface" style={{ width: `${percent(item.estoqueSeguranca)}%` }} />
										<div className="bg-warning-surface" style={{ width: `${percent(item.pontoPedido) - percent(item.estoqueSeguranca)}%` }} />
										<div className="bg-success-surface flex-1" />
									</div>
									<div className="relative h-3.5">
										<div className="bg-foreground absolute -top-4 h-4 w-[3px] -translate-x-1/2 rounded-sm" style={{ left: `${percent(item.saldo)}%` }} />
										<span className="absolute top-px -translate-x-1/2 whitespace-nowrap text-[10px] font-bold" style={{ left: `${percent(item.saldo)}%` }}>
											SALDO {formatQuantity(item.saldo)}
										</span>
										<span
											className="text-warning-surface-foreground absolute top-px -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold"
											style={{ left: `${percent(item.pontoPedido)}%` }}
										>
											PP {formatQuantity(item.pontoPedido)}
										</span>
									</div>
								</div>
								<div className="flex shrink-0 items-center gap-4">
									<div className="flex flex-col items-end gap-0.5">
										<MetricLabel>Cobertura</MetricLabel>
										<span className={cn("text-xs font-bold", critical ? "text-red-600" : "text-yellow-700 dark:text-yellow-500")}>
											{formatDays(item.coberturaDias)}
										</span>
									</div>
									<div className="flex flex-col items-end gap-0.5">
										<MetricLabel>Prazo</MetricLabel>
										<span
											className="text-xs font-semibold"
											title={item.prazoReposicaoOrigem === "PADRAO" ? "Sem compras com datas de pedido e recebimento: prazo padrão." : undefined}
										>
											{formatDays(item.prazoReposicaoDias)}
											{item.prazoReposicaoOrigem === "PADRAO" ? "*" : ""}
										</span>
									</div>
									<div className="flex flex-col items-end gap-0.5">
										<MetricLabel>Sugestão</MetricLabel>
										<span className="text-info text-base font-bold tabular-nums">
											{formatQuantity(item.sugestao)} {item.unidade.toLowerCase()}
										</span>
									</div>
									<Button variant="ghost" size="sm" asChild>
										<Link href={appRoutes.catalog.product(item.produtoId)}>
											<Info className="size-3.5" />
											DETALHES
										</Link>
									</Button>
								</div>
							</div>
						);
					})}
					{data && data.itens.some((item) => item.prazoReposicaoOrigem === "PADRAO") ? (
						<p className="text-muted-foreground text-[11px]">* Sem compras com data de pedido e de recebimento: usa o prazo padrão de 7 dias.</p>
					) : null}
					{data && data.itens.length > INITIAL_ROWS ? (
						<Button variant="ghost" size="sm" className="self-center" onClick={() => setExpanded((current) => !current)}>
							{expanded ? "VER MENOS" : `VER TODOS (${data.itens.length})`}
						</Button>
					) : null}
				</div>
			</ReportSectionState>
		</ReportSection>
	);
}
