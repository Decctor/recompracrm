"use client";

import type { TProductStockAnalytics } from "@/app/api/products/stock-analytics/route";
import { monotonePath } from "@/lib/charts/geometry";
import { appRoutes } from "@/lib/navigation/routes";
import { formatFraction, formatMoney, formatQuantity } from "@/lib/stock/analytics/format";
import { cn } from "@/lib/utils";
import { ChartPie } from "lucide-react";
import Link from "next/link";

const CLASS_BADGE = {
	A: "bg-primary text-primary-foreground",
	B: "bg-[#e3b042] text-[#171717]",
	C: "bg-muted text-muted-foreground",
} as const;

/** Onde o produto cai na curva ABC por faturamento, com a curva da loja como contexto. */
export function AbcPositionCard({ analytics, periodLabel }: { analytics: TProductStockAnalytics; periodLabel: string }) {
	const { abc } = analytics;
	const aWidth = abc.totalProdutos > 0 ? (abc.classes.A.produtos / abc.totalProdutos) * 100 : 0;
	const bWidth = abc.totalProdutos > 0 ? (abc.classes.B.produtos / abc.totalProdutos) * 100 : 0;
	const curve = monotonePath(
		abc.curva.map((point) => point.x * 100),
		abc.curva.map((point) => 100 - point.y * 100),
	);
	const dot = abc.ponto ? { x: abc.ponto.x * 100, y: 100 - abc.ponto.y * 100 } : null;

	return (
		<div className="bg-card border-border flex flex-col gap-3.5 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<div className="bg-primary/20 flex size-7 items-center justify-center rounded-full">
						<ChartPie className="size-4" />
					</div>
					<h3 className="text-xs font-medium leading-none tracking-tight">CURVA ABC · FATURAMENTO</h3>
				</div>
				<Link href={`${appRoutes.inventory.reports()}#abc`} className="text-primary text-[11px] font-bold hover:underline">
					VER CURVA COMPLETA
				</Link>
			</div>
			<div className="flex items-center gap-3.5">
				<div className={cn("flex size-14 shrink-0 items-center justify-center rounded-[18px] text-3xl font-extrabold", CLASS_BADGE[abc.classe])}>
					{abc.classe}
				</div>
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-semibold">
						{abc.posicao != null && abc.faturamento > 0
							? `${abc.posicao}º de ${formatQuantity(abc.totalProdutos)} produtos em faturamento`
							: `Sem vendas nos últimos ${periodLabel}`}
					</span>
					<span className="text-muted-foreground text-xs">
						{formatMoney(abc.faturamento)} no período · {formatFraction(abc.participacao, 1)} do faturamento total
					</span>
				</div>
			</div>
			<div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-1.5">
				<div className="text-muted-foreground relative h-[150px] text-[10px]">
					<span className="absolute right-0 top-0 -translate-y-1/2">100%</span>
					<span className="absolute right-0 top-[20%] -translate-y-1/2">80%</span>
					<span className="absolute right-0 top-full -translate-y-1/2">0</span>
				</div>
				<div className="border-border relative h-[150px] border-b">
					<Band left={0} width={aWidth} className="bg-primary/[0.08]" labelClassName="text-primary" label="A" />
					<Band left={aWidth} width={bWidth} className="bg-[#e3b042]/12" labelClassName="text-[#9a691e]" label="B" />
					<Band left={aWidth + bWidth} width={100 - aWidth - bWidth} className="bg-muted/60" labelClassName="text-muted-foreground" label="C" />
					<div className="border-border absolute inset-x-0 top-[20%] border-t border-dashed" />
					<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="text-info absolute inset-0 size-full overflow-visible">
						<path d={curve} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
					</svg>
					{dot ? (
						<>
							<div
								className="bg-warning border-card absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-[0_1px_4px_rgb(0_0_0/0.25)]"
								style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
							/>
							<span
								className="bg-card absolute whitespace-nowrap rounded px-[3px] text-[10px] font-bold"
								style={{ left: `${dot.x}%`, top: `${dot.y}%`, transform: dot.x > 70 ? "translate(calc(-100% - 10px), -4px)" : "translate(10px, -4px)" }}
							>
								ESTE PRODUTO
							</span>
						</>
					) : null}
				</div>
				<div />
				<div className="text-muted-foreground flex justify-between pt-1 text-[10px]">
					<span>0%</span>
					<span>% dos produtos (ordenados por faturamento)</span>
					<span>100%</span>
				</div>
			</div>
			<p className="text-muted-foreground text-xs">
				A classe A reúne {formatQuantity(abc.classes.A.produtos)} produtos ({formatFraction(abc.classes.A.participacaoCatalogo)} do catálogo) que
				respondem por {formatFraction(abc.classes.A.participacao)} do faturamento. Por volume de unidades este produto{" "}
				{abc.classeVolume === abc.classe ? "também " : ""}é classe {abc.classeVolume}.
			</p>
		</div>
	);
}

function Band({
	left,
	width,
	className,
	labelClassName,
	label,
}: {
	left: number;
	width: number;
	className: string;
	labelClassName: string;
	label: string;
}) {
	if (width <= 0) return null;
	return (
		<div className={cn("absolute inset-y-0", className)} style={{ left: `${left}%`, width: `${width}%` }}>
			<span className={cn("absolute left-1 top-1 text-[10px] font-extrabold", labelClassName)}>{label}</span>
		</div>
	);
}
