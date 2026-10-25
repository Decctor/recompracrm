"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { TGetFinancesDreOutput } from "@/app/api/finances/analytics/dre/route";
import { DeltaBadge } from "@/app/dashboard/finance/_components/delta-badge";
import { FINANCE_COLORS, formatPercent } from "@/app/dashboard/finance/_components/finance-chart-kit";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";

type TDemonstrativo = TGetFinancesDreOutput["data"]["demonstrativo"];
type TDreTreeNode = TDemonstrativo["receita"]["arvore"][number];

type TStatementLine = {
	id: string;
	prefix?: string;
	label: string;
	total: number;
	totalAnterior: number;
	barColor: string;
	invertDelta?: boolean;
	emphasized?: boolean;
	margem?: number | null;
	tree?: TDreTreeNode[];
};

type TStatementRow = {
	key: string;
	label: string;
	prefix?: string;
	depth: number;
	total: number;
	totalAnterior: number;
	line: TStatementLine;
	expandable: boolean;
	expanded: boolean;
};

/** Demonstrativo em linhas: totais por categoria, expansíveis até as folhas do plano de contas. */
export function DreStatement({ demonstrativo }: { demonstrativo: TDemonstrativo }) {
	// Despesas abre expandida: é onde o detalhe do plano de contas mais explica o resultado.
	const [expanded, setExpanded] = useState<Record<string, boolean>>({ despesas: true });
	const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

	const revenueTotal = demonstrativo.receita.total;
	const lines: TStatementLine[] = [
		{ id: "receita", label: "RECEITA BRUTA", ...demonstrativo.receita, tree: demonstrativo.receita.arvore, barColor: FINANCE_COLORS.inflow },
		{
			id: "custos",
			prefix: "(−) ",
			label: "CUSTOS",
			...demonstrativo.custos,
			tree: demonstrativo.custos.arvore,
			invertDelta: true,
			barColor: FINANCE_COLORS.outflow,
		},
		{ id: "lucro-bruto", prefix: "(=) ", label: "LUCRO BRUTO", ...demonstrativo.lucroBruto, emphasized: true, barColor: FINANCE_COLORS.subtotal },
		{
			id: "despesas",
			prefix: "(−) ",
			label: "DESPESAS",
			...demonstrativo.despesas,
			tree: demonstrativo.despesas.arvore,
			invertDelta: true,
			barColor: FINANCE_COLORS.outflow,
		},
		{
			id: "resultado",
			prefix: "(=) ",
			label: "RESULTADO OPERACIONAL",
			...demonstrativo.resultado,
			emphasized: true,
			barColor: FINANCE_COLORS.subtotal,
		},
	];

	const rows: TStatementRow[] = [];
	const pushNodes = (nodes: TDreTreeNode[], depth: number, line: TStatementLine) => {
		for (const node of nodes) {
			const key = node.contaId;
			const isOpen = !!expanded[key];
			rows.push({
				key,
				label: node.nome,
				depth,
				total: node.total,
				totalAnterior: node.totalAnterior,
				line,
				expandable: node.filhos.length > 0,
				expanded: isOpen,
			});
			if (isOpen) pushNodes(node.filhos, depth + 1, line);
		}
	};
	for (const line of lines) {
		const isOpen = !!expanded[line.id];
		const expandable = !!line.tree && line.tree.length > 0;
		rows.push({
			key: line.id,
			label: line.label,
			prefix: line.prefix,
			depth: 0,
			total: line.total,
			totalAnterior: line.totalAnterior,
			line,
			expandable,
			expanded: isOpen,
		});
		if (isOpen && line.tree) pushNodes(line.tree, 1, line);
	}

	return (
		<>
			<div className="text-muted-foreground border-border hidden items-center gap-3 border-b px-2 pb-1.5 text-[0.6rem] font-semibold uppercase tracking-wide sm:flex">
				<span className="flex-1">CONTA</span>
				<span className="w-28">% DA RECEITA</span>
				<span className="w-16 text-center">Δ ANT.</span>
				<span className="w-[116px] text-right">VALOR</span>
			</div>
			<div className="flex flex-col gap-0.5">
				{rows.map((row) => (
					<StatementRow key={row.key} row={row} revenueTotal={revenueTotal} onToggle={() => toggle(row.key)} />
				))}
			</div>
		</>
	);
}

function StatementRow({ row, revenueTotal, onToggle }: { row: TStatementRow; revenueTotal: number; onToggle: () => void }) {
	const { depth, line } = row;
	const isTop = depth === 0;
	const emphasized = isTop && !!line.emphasized;
	const share = revenueTotal > 0 ? (row.total / revenueTotal) * 100 : null;
	const margem = isTop ? line.margem : undefined;

	return (
		<div
			className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[10px] border-t border-transparent pr-2", {
				"bg-primary/[0.06]": emphasized,
				"border-border": isTop && !emphasized && line.id !== "receita",
			})}
			style={{ paddingLeft: 6 + depth * 20, paddingTop: isTop ? 10 : 7, paddingBottom: isTop ? 10 : 7 }}
		>
			<div className="flex min-w-0 flex-[1_1_200px] items-center gap-1.5">
				{row.expandable ? (
					<button
						type="button"
						onClick={onToggle}
						aria-expanded={row.expanded}
						aria-label={row.expanded ? `Recolher ${row.label}` : `Expandir ${row.label}`}
						className={cn("hover:bg-primary/15 flex size-5 shrink-0 items-center justify-center rounded-full transition-colors", {
							"bg-primary/15": row.expanded,
						})}
					>
						{row.expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
					</button>
				) : (
					<span className="w-5 shrink-0" />
				)}
				<span
					className={cn("truncate", isTop ? "text-[13px]" : "text-muted-foreground text-xs", {
						"font-extrabold": emphasized,
						"font-bold": isTop && !emphasized,
						"font-medium": !isTop,
					})}
				>
					{row.prefix ? <span className="text-muted-foreground">{row.prefix}</span> : null}
					{row.label}
				</span>
				{margem !== undefined && margem !== null ? (
					<span
						className={cn(
							"shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold",
							margem >= 0 ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-red-500/10 text-red-700 dark:text-red-400",
						)}
					>
						MARGEM {formatPercent(margem)}
					</span>
				) : null}
			</div>
			<div className="flex min-w-0 flex-auto items-center justify-end gap-3">
				<div className="flex min-w-[72px] flex-[0_1_112px] items-center gap-2">
					<div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
						<div
							className="h-full rounded-full"
							style={{ width: `${Math.max(0, Math.min(100, share ?? 0))}%`, background: line.barColor, opacity: isTop ? 1 : 0.45 }}
						/>
					</div>
					<span className="text-muted-foreground w-10 text-right text-[11px] font-medium tabular-nums">{share === null ? "—" : formatPercent(share)}</span>
				</div>
				<div className="flex w-16 shrink-0 justify-center">
					<DeltaBadge current={row.total} previous={row.totalAnterior} invert={line.invertDelta} />
				</div>
				<span
					className={cn("min-w-24 shrink-0 whitespace-nowrap text-right tabular-nums", isTop ? "text-sm" : "text-xs", {
						"font-extrabold": emphasized,
						"font-semibold": isTop && !emphasized,
						"font-medium": !isTop,
						"text-red-600 dark:text-red-400": emphasized && row.total < 0,
					})}
				>
					{formatToMoney(row.total)}
				</span>
			</div>
		</div>
	);
}
