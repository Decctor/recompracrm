"use client";

import { useEffect, useRef, useState } from "react";
import type { TGetFinancesDreOutput } from "@/app/api/finances/analytics/dre/route";
import { FINANCE_COLORS, formatCompactMoney, formatPercent } from "@/app/dashboard/finance/_components/finance-chart-kit";
import { formatToMoney } from "@/lib/formatting";

type TDemonstrativo = TGetFinancesDreOutput["data"]["demonstrativo"];
type TDreTreeNode = TDemonstrativo["receita"]["arvore"][number];

export type TCompositionMode = "all" | "expenses";

type TTreemapItem = { id: string; nome: string; value: number };
type TRect = { x: number; y: number; w: number; h: number };

/** Treemap "squarified" (Bruls et al.): fileiras ao longo do lado menor, mantendo as células próximas de quadrados. */
export function squarify<T extends TTreemapItem>(items: T[], rect: TRect): Array<T & TRect> {
	const total = items.reduce((sum, item) => sum + item.value, 0);
	if (total <= 0 || rect.w <= 0 || rect.h <= 0) return [];
	const scale = (rect.w * rect.h) / total;
	const rest = items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
	const out: Array<T & TRect> = [];
	let { x, y, w, h } = rect;
	const worst = (row: T[], side: number) => {
		const areas = row.map((item) => item.value * scale);
		const sum = areas.reduce((acc, area) => acc + area, 0);
		return Math.max((side * side * Math.max(...areas)) / (sum * sum), (sum * sum) / (side * side * Math.min(...areas)));
	};
	while (rest.length) {
		const side = Math.min(w, h);
		let row: T[] = [];
		let best = Infinity;
		while (rest.length) {
			const next = rest[0] as T;
			const ratio = worst([...row, next], side);
			if (ratio > best) break;
			row = [...row, next];
			best = ratio;
			rest.shift();
		}
		const area = row.reduce((acc, item) => acc + item.value * scale, 0);
		if (w >= h) {
			const columnWidth = area / h;
			let cursorY = y;
			for (const item of row) {
				const cellHeight = (item.value * scale) / columnWidth;
				out.push({ ...item, x, y: cursorY, w: columnWidth, h: cellHeight });
				cursorY += cellHeight;
			}
			x += columnWidth;
			w -= columnWidth;
		} else {
			const rowHeight = area / w;
			let cursorX = x;
			for (const item of row) {
				const cellWidth = (item.value * scale) / rowHeight;
				out.push({ ...item, x: cursorX, y, w: cellWidth, h: rowHeight });
				cursorX += cellWidth;
			}
			y += rowHeight;
			h -= rowHeight;
		}
	}
	return out;
}

type TGroup = { id: string; nome: string; total: number; color: string; foreground: string; children: TTreemapItem[] };

/** Filhos de um nó para o treemap; lançamentos diretos no próprio nó viram uma célula com o nome dele. */
function leavesOf(node: TDreTreeNode): TTreemapItem[] {
	const children = node.filhos.filter((child) => child.total > 0).map((child) => ({ id: child.contaId, nome: child.nome, value: child.total }));
	const childrenTotal = children.reduce((sum, child) => sum + child.value, 0);
	const direct = node.total - childrenTotal;
	if (direct > 0.005) children.push({ id: `${node.contaId}-direto`, nome: node.nome, value: direct });
	return children;
}

/**
 * Nível exibido como grupos: as raízes da categoria, descendo enquanto houver uma raiz única com
 * sub-contas (planos com uma conta-mãe "Despesas" ainda se dividem por grupo).
 */
function topNodes(tree: TDreTreeNode[]) {
	let nodes = tree.filter((node) => node.total > 0);
	while (nodes.length === 1) {
		const only = nodes[0] as TDreTreeNode;
		const children = only.filhos.filter((child) => child.total > 0);
		const childrenTotal = children.reduce((sum, child) => sum + child.total, 0);
		// Só desce se a conta-mãe não tem lançamentos diretos — senão o total do grupo não fecharia.
		if (children.length === 0 || only.total - childrenTotal > 0.005) break;
		nodes = children;
	}
	return nodes;
}

export function buildCompositionGroups(demonstrativo: TDemonstrativo, mode: TCompositionMode): TGroup[] {
	const groups: TGroup[] = [];
	if (mode === "all" && demonstrativo.custos.total > 0) {
		groups.push({
			id: "custos",
			nome: "Custos",
			total: demonstrativo.custos.total,
			color: FINANCE_COLORS.subtotal,
			foreground: "#fff",
			children: topNodes(demonstrativo.custos.arvore).map((node) => ({ id: node.contaId, nome: node.nome, value: node.total })),
		});
	}
	topNodes(demonstrativo.despesas.arvore).forEach((node, index) => {
		const tone = index % FINANCE_COLORS.gold.length;
		groups.push({
			id: node.contaId,
			nome: node.nome,
			total: node.total,
			color: FINANCE_COLORS.gold[tone] as string,
			foreground: FINANCE_COLORS.goldForeground[tone] as string,
			children: leavesOf(node),
		});
	});
	return groups;
}

/** Mede a largura real do contêiner, para que os rótulos das células reflitam o espaço disponível. */
function useElementWidth<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
		observer.observe(element);
		setWidth(element.getBoundingClientRect().width);
		return () => observer.disconnect();
	}, []);
	return { ref, width };
}

/** Composição de custos e despesas por plano de contas: área proporcional ao valor no período. */
export function DreCompositionTreemap({ groups }: { groups: TGroup[] }) {
	const { ref, width } = useElementWidth<HTMLDivElement>();
	const isMobile = width > 0 && width < 600;
	const height = isMobile ? 540 : 360;
	const total = groups.reduce((sum, group) => sum + group.total, 0);

	const cells =
		width > 0
			? squarify(
					groups.map((group) => ({ ...group, value: group.total })),
					{ x: 0, y: 0, w: width, h: height },
				).flatMap((group) => squarify(group.children, group).map((cell) => ({ ...cell, color: group.color, foreground: group.foreground })))
			: [];

	return (
		<>
			<div ref={ref} className="relative overflow-hidden rounded-[10px]" style={{ height }}>
				{cells.map((cell) => {
					const showName = cell.w >= 84 && cell.h >= 40;
					const showValue = cell.w >= 84 && cell.h >= 62;
					const showPct = !showName && cell.w >= 40 && cell.h >= 22;
					const share = formatPercent((cell.value / total) * 100);
					return (
						<div
							key={cell.id}
							title={`${cell.nome} · ${formatToMoney(cell.value)} · ${share}`}
							className="absolute p-[1.5px]"
							style={{ left: cell.x, top: cell.y, width: cell.w, height: cell.h }}
						>
							<div
								className="flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-md px-2.5 py-2"
								style={{ background: cell.color, color: cell.foreground }}
							>
								{showName ? <span className="text-xs font-bold leading-[1.2]">{cell.nome}</span> : null}
								{showValue ? (
									<span className="text-xs opacity-85">
										{formatCompactMoney(cell.value)} · {share}
									</span>
								) : null}
								{showPct ? <span className="text-[11px] font-semibold">{share}</span> : null}
							</div>
						</div>
					);
				})}
			</div>
			<div className="flex flex-wrap gap-x-5 gap-y-2">
				{groups.map((group) => (
					<div key={group.id} className="flex items-center gap-2 text-xs">
						<span className="size-2.5 rounded-[3px]" style={{ background: group.color }} />
						<span className="font-semibold">{group.nome}</span>
						<span className="text-muted-foreground tabular-nums">
							{formatToMoney(group.total)} · {formatPercent((group.total / total) * 100)}
						</span>
					</div>
				))}
			</div>
		</>
	);
}
