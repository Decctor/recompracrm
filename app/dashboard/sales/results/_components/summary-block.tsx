"use client";

import type { TSalesResults } from "@/lib/sales/results";
import { DeltaBadge } from "@/app/dashboard/finance/_components/delta-badge";
import { StatCard } from "@/app/dashboard/finance/_components/stat-card";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { buildSalesHistoryHref, type TSalesHistoryUrlState } from "@/lib/sales/history-url-state";
import { cn } from "@/lib/utils";
import { BadgeDollarSign, Ban, Package, Percent, ReceiptText, Tag, Target, TrendingUp } from "lucide-react";

type SummaryBlockProps = {
	resumo: TSalesResults["resumo"];
	canViewSensitive: boolean;
	/** Recorte do relatório (período, vendedores, status) que os cartões clicáveis levam ao histórico. */
	historyFilters: Partial<TSalesHistoryUrlState>;
};

function MetricValue({ atual, anterior, format, invert }: { atual: number | null; anterior: number | null; format: (v: number) => string; invert?: boolean }) {
	return (
		<div className="flex items-center gap-2">
			<h1 className="text-sm font-medium">{atual === null ? "—" : format(atual)}</h1>
			{atual !== null && anterior !== null ? <DeltaBadge current={atual} previous={anterior} invert={invert} /> : null}
		</div>
	);
}

export function SummaryBlock({ resumo, canViewSensitive, historyFilters }: SummaryBlockProps) {
	const money = (v: number) => formatToMoney(v);
	// Cada cartão com recorte equivalente no histórico abre a listagem já filtrada. Ticket médio,
	// itens, margem e meta são derivados sem filtro correspondente e ficam estáticos.
	const salesHref = buildSalesHistoryHref(historyFilters);
	const discountedSalesHref = buildSalesHistoryHref({ ...historyFilters, hasDiscount: true });
	const cancelledSalesHref = buildSalesHistoryHref({ ...historyFilters, saleStatuses: ["CANCELADA"] });
	const integer = (v: number) => formatDecimalPlaces(v, 0, 0);
	const margemPercentual =
		resumo.margemBruta?.atual != null && (resumo.faturamento.atual ?? 0) > 0 ? (resumo.margemBruta.atual / (resumo.faturamento.atual as number)) * 100 : null;

	return (
		<div className="flex w-full flex-col gap-2">
			<div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
				<StatCard
					icon={<ReceiptText className="h-4 w-4 min-h-4 min-w-4" />}
					iconWrapperClassName="bg-blue-200 text-blue-600"
					label="VENDAS"
					value={<MetricValue atual={resumo.qtdeVendas.atual} anterior={resumo.qtdeVendas.anterior} format={integer} />}
					href={salesHref}
					title="Ver as vendas do período no histórico"
				/>
				<StatCard
					icon={<BadgeDollarSign className="h-4 w-4 min-h-4 min-w-4" />}
					iconWrapperClassName="bg-green-200 text-green-600"
					label="FATURAMENTO"
					value={<MetricValue atual={resumo.faturamento.atual} anterior={resumo.faturamento.anterior} format={money} />}
					href={salesHref}
					title="Ver as vendas do período no histórico"
				/>
				<StatCard
					icon={<TrendingUp className="h-4 w-4 min-h-4 min-w-4" />}
					iconWrapperClassName="bg-violet-200 text-violet-600"
					label="TICKET MÉDIO"
					value={<MetricValue atual={resumo.ticketMedio.atual} anterior={resumo.ticketMedio.anterior} format={money} />}
				/>
				<StatCard
					icon={<Package className="h-4 w-4 min-h-4 min-w-4" />}
					iconWrapperClassName="bg-amber-200 text-amber-600"
					label="ITENS VENDIDOS"
					value={<MetricValue atual={resumo.qtdeItens.atual} anterior={resumo.qtdeItens.anterior} format={integer} />}
				/>
			</div>
			<div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
				<StatCard
					icon={<Tag className="h-4 w-4 min-h-4 min-w-4" />}
					iconWrapperClassName="bg-orange-200 text-orange-600"
					label="DESCONTOS"
					value={<MetricValue atual={resumo.descontos.atual} anterior={resumo.descontos.anterior} format={money} invert />}
					href={discountedSalesHref}
					title="Ver as vendas com desconto no histórico"
				/>
				<StatCard
					icon={<Ban className="h-4 w-4 min-h-4 min-w-4" />}
					iconWrapperClassName="bg-red-200 text-red-600"
					label="CANCELADAS"
					value={
						<div className="flex items-center gap-2">
							<h1 className="text-sm font-medium">{formatToMoney(resumo.canceladas.valor)}</h1>
							<span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium uppercase text-muted-foreground">
								{resumo.canceladas.qtde} {resumo.canceladas.qtde === 1 ? "venda" : "vendas"}
							</span>
						</div>
					}
					href={cancelledSalesHref}
					title="Ver as vendas canceladas no histórico"
				/>
				{canViewSensitive && resumo.margemBruta ? (
					<StatCard
						icon={<Percent className="h-4 w-4 min-h-4 min-w-4" />}
						iconWrapperClassName="bg-emerald-200 text-emerald-600"
						label="MARGEM BRUTA"
						value={
							<div className="flex items-center gap-2">
								<h1 className={cn("text-sm font-medium", { "text-red-600 dark:text-red-400": (resumo.margemBruta.atual ?? 0) < 0 })}>
									{formatToMoney(resumo.margemBruta.atual ?? 0)}
								</h1>
								{margemPercentual !== null ? (
									<span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
										{formatDecimalPlaces(margemPercentual, 1, 1)}%
									</span>
								) : null}
								{resumo.margemBruta.atual !== null && resumo.margemBruta.anterior !== null ? (
									<DeltaBadge current={resumo.margemBruta.atual} previous={resumo.margemBruta.anterior} />
								) : null}
							</div>
						}
					/>
				) : null}
				<StatCard
					icon={<Target className="h-4 w-4 min-h-4 min-w-4" />}
					iconWrapperClassName="bg-primary/20 text-foreground"
					label="META"
					value={
						resumo.meta ? (
							<div className="flex items-center gap-2">
								<h1 className="text-sm font-medium">{formatToMoney(resumo.meta.objetivo)}</h1>
								<span
									className={cn("rounded-md px-1.5 py-0.5 text-[0.6rem] font-medium", {
										"bg-green-500/10 text-green-700 dark:text-green-400": (resumo.meta.atingidoPercentual ?? 0) >= 100,
										"bg-amber-500/10 text-amber-700 dark:text-amber-400": (resumo.meta.atingidoPercentual ?? 0) < 100,
									})}
								>
									{formatDecimalPlaces(resumo.meta.atingidoPercentual ?? 0, 1, 1)}% atingido
								</span>
							</div>
						) : (
							<span className="text-xs text-muted-foreground">Sem meta no período</span>
						)
					}
				/>
			</div>
		</div>
	);
}
