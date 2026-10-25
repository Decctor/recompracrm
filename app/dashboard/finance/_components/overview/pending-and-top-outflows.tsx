"use client";

import Link from "next/link";
import dayjs from "dayjs";
import { ArrowRight, CircleDot, GitBranch } from "lucide-react";
import type { TGetFinancesDreOutput } from "@/app/api/finances/analytics/dre/route";
import type { TGetFinancesOverallStatsOutput } from "@/app/api/finances/stats/route";
import type { TDreTreeNode } from "@/lib/finances/analytics/classification";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { FINANCE_COLORS, formatPercent } from "../finance-chart-kit";

type TStats = TGetFinancesOverallStatsOutput["data"];
type TDemonstrativo = TGetFinancesDreOutput["data"]["demonstrativo"];

const headerLabelClassName = "text-muted-foreground pb-1.5 text-right text-[0.6rem] font-semibold uppercase tracking-wide";
const cellClassName = "border-border flex items-center justify-end self-stretch border-t py-2.5 text-right text-[13px] tabular-nums";

/** O que está em aberto: vencido, próximos 7 dias e total, a receber × a pagar. */
export function PendingSummary({ stats }: { stats: TStats }) {
	const tomorrow = dayjs().add(1, "day");
	const totalReceivable = stats.totalPendingTransactions.inflow;
	const totalPayable = stats.totalPendingTransactions.outflow;
	const rows = [
		{
			label: "Em atraso",
			sub: `${stats.pendingOverdueCount} ${stats.pendingOverdueCount === 1 ? "lançamento vencido" : "lançamentos vencidos"}`,
			receivable: stats.totalPendingTransactionsOverdue.inflow,
			payable: stats.totalPendingTransactionsOverdue.outflow,
			weight: "font-semibold",
			valueColor: "text-red-700",
		},
		{
			label: "Próximos 7 dias",
			sub: `${tomorrow.format("DD/MM")} – ${tomorrow.add(6, "day").format("DD/MM")}`,
			receivable: stats.totalPendingTransactionsNext7Days.inflow,
			payable: stats.totalPendingTransactionsNext7Days.outflow,
			weight: "font-medium",
			valueColor: "",
		},
		{
			label: "Total em aberto",
			sub: "Todas as transações pendentes",
			receivable: totalReceivable,
			payable: totalPayable,
			weight: "font-extrabold",
			valueColor: "",
		},
	];
	const openTotal = totalReceivable + totalPayable;
	const receivableShare = openTotal > 0 ? (totalReceivable / openTotal) * 100 : 50;
	const net = totalReceivable - totalPayable;

	return (
		<div className="bg-card border-border flex flex-col gap-3 rounded-xl border p-4 shadow-2xs">
			<div className="flex items-center gap-2">
				<CircleDot className="size-4" />
				<span className="text-xs font-medium uppercase leading-none tracking-tight">Pendências</span>
			</div>
			<div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4">
				<span />
				<span className={headerLabelClassName}>A RECEBER</span>
				<span className={headerLabelClassName}>A PAGAR</span>
				{rows.map((row) => (
					<div key={row.label} className="contents">
						<div className="border-border flex flex-col gap-0.5 border-t py-2.5">
							<span className={cn("text-[13px]", row.weight)}>{row.label}</span>
							<span className="text-muted-foreground text-[11px]">{row.sub}</span>
						</div>
						<span className={cn(cellClassName, row.weight, row.valueColor)}>{formatToMoney(row.receivable)}</span>
						<span className={cn(cellClassName, row.weight, row.valueColor)}>{formatToMoney(row.payable)}</span>
					</div>
				))}
			</div>
			<div className="flex flex-col gap-1.5">
				<div className={cn("flex h-2 gap-0.5 overflow-hidden rounded-full", openTotal === 0 && "bg-muted")}>
					{openTotal > 0 ? (
						<>
							<div style={{ width: `${receivableShare}%`, background: FINANCE_COLORS.inflow }} />
							<div className="flex-1" style={{ background: FINANCE_COLORS.outflow }} />
						</>
					) : null}
				</div>
				<div className="flex justify-between text-xs">
					<span className="text-muted-foreground">Saldo pendente</span>
					<span className={cn("font-bold tabular-nums", net < 0 ? "text-red-700" : "text-green-700")}>{formatToMoney(net)}</span>
				</div>
			</div>
		</div>
	);
}

/** Folhas da árvore; o lançado direto numa conta-mãe vira uma "folha" própria com o nome dela. */
function collectLeaves(nodes: TDreTreeNode[]): Array<Pick<TDreTreeNode, "contaId" | "nome" | "total">> {
	return nodes.flatMap((node) => {
		if (node.filhos.length === 0) return [node];
		const direct = node.total - node.filhos.reduce((sum, child) => sum + child.total, 0);
		const directLeaf = direct > 0.005 ? [{ contaId: `${node.contaId}-direto`, nome: node.nome, total: direct }] : [];
		return [...collectLeaves(node.filhos), ...directLeaf];
	});
}

/** Contas analíticas (folhas) de custos e despesas com maior valor no período, em % da receita. */
export function TopOutflowAccounts({ demonstrativo }: { demonstrativo: TDemonstrativo }) {
	const revenue = demonstrativo.receita.total;
	const leaves = [...collectLeaves(demonstrativo.custos.arvore), ...collectLeaves(demonstrativo.despesas.arvore)]
		.filter((leaf) => leaf.total > 0)
		.sort((a, b) => b.total - a.total)
		.slice(0, 6);
	const top = leaves[0]?.total || 1;

	return (
		<div className="bg-card border-border flex flex-col gap-3 rounded-xl border p-4 shadow-2xs">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<GitBranch className="size-4" />
					<span className="text-xs font-medium uppercase leading-none tracking-tight">Maiores saídas por conta</span>
				</div>
				<span className="text-muted-foreground text-[11px]">% da receita</span>
			</div>
			{leaves.length === 0 ? (
				<p className="border-border text-muted-foreground rounded-xl border border-dashed px-3 py-6 text-center text-xs">
					Nenhum custo ou despesa no período.
				</p>
			) : (
				leaves.map((leaf) => (
					<div key={leaf.contaId} className="flex flex-col gap-[5px]">
						<div className="flex items-baseline justify-between gap-2 text-xs">
							<span className="truncate font-medium">{leaf.nome}</span>
							<span className="flex shrink-0 gap-2 tabular-nums">
								<span className="text-muted-foreground">{revenue > 0 ? formatPercent((leaf.total / revenue) * 100) : "—"}</span>
								<span className="font-semibold">{formatToMoney(leaf.total)}</span>
							</span>
						</div>
						<div className="bg-muted h-1.5 rounded-full">
							<div className="h-full rounded-full bg-[#e3b042]" style={{ width: `${(leaf.total / top) * 100}%` }} />
						</div>
					</div>
				))
			)}
			<Link
				href="/dashboard/finance/reports/income-statement"
				className="text-primary hover:bg-muted mt-0.5 flex h-8 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold hover:no-underline"
			>
				Abrir DRE completo
				<ArrowRight className="size-3.5" />
			</Link>
		</div>
	);
}
