"use client";

import { formatDecimalPlaces } from "@/lib/formatting";
import { cn } from "@/lib/utils";

// Peças compartilhadas dos relatórios financeiros (visão geral, DRE, fluxo de caixa, recebíveis,
// contas). Gráficos seguem o padrão de `components/Charts/ChartPrimitives.tsx`: traço em SVG
// `viewBox 0 0 100 100`, texto e interação em HTML posicionado por porcentagem.

/** Paleta semântica: entrada/receita, saída/dedução, subtotal e a linha secundária (margem operacional). */
export const FINANCE_COLORS = {
	inflow: "#16a34a",
	outflow: "#dc2626",
	subtotal: "#24549c",
	accent: "#c98a2c",
	inflowRgb: "22,163,74",
	outflowRgb: "220,38,38",
	/** Escala dourada da composição de despesas (do grupo maior ao menor). */
	gold: ["#7a5117", "#9a691e", "#c98a2c", "#e3b042", "#f5cf52"],
	goldForeground: ["#fff", "#fff", "#171717", "#171717", "#171717"],
} as const;

/** Hachurado dos valores previstos (ainda não efetivados). */
export function hatchedBackground(rgb: string) {
	return `repeating-linear-gradient(135deg, rgba(${rgb},0.6) 0 2px, rgba(${rgb},0.16) 2px 5px)`;
}

/** "R$ 186 mil", "R$ 9,8 mil", "−R$ 640" — rótulos de eixo e barras. */
export function formatCompactMoney(value: number) {
	const abs = Math.abs(value);
	const body =
		abs >= 1000
			? `${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: abs >= 100000 ? 0 : 1 })} mil`
			: Math.round(abs).toLocaleString("pt-BR");
	return `${value < 0 ? "−" : ""}R$ ${body}`;
}

/** "+9,8k", "−640" — células pequenas (calendário). */
export function formatSignedCompact(value: number) {
	const abs = Math.abs(value);
	const body = abs >= 1000 ? `${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : String(Math.round(abs));
	return `${value >= 0 ? "+" : "−"}${body}`;
}

export function formatPercent(value: number, places = 1) {
	return `${formatDecimalPlaces(value, places, places)}%`;
}

/** Diferença em pontos percentuais: "+1,2 p.p." / "−0,4 p.p.". */
export function formatPointsDelta(current: number, previous: number) {
	const diff = current - previous;
	return `${diff >= 0 ? "+" : "−"}${formatDecimalPlaces(Math.abs(diff), 1, 1)} p.p.`;
}

/** Variação percentual com o sinal de "bom" já resolvido (custos e despesas invertem). */
export function getPercentChange(current: number, previous: number, invert = false) {
	if (!previous) return null;
	const change = ((current - previous) / Math.abs(previous)) * 100;
	return { change, isGood: invert ? change <= 0 : change >= 0 };
}

/** Rótulo de mês curto ("out/26") a partir de "YYYY-MM". */
export function formatMonthKey(monthKey: string) {
	const [year, month] = monthKey.split("-");
	const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
	return `${names[Number(month) - 1] ?? month}/${year?.slice(2)}`;
}

/** Posição horizontal do tooltip de uma coluna: ancora à esquerda/direita perto das bordas. */
export function getColumnTooltipPosition(index: number, count: number) {
	return {
		left: ((index + 0.5) / count) * 100,
		translateX: index > count * 0.72 ? "-100%" : index < count * 0.2 ? "0%" : "-50%",
	};
}

/** Sparkline do rodapé dos cards de KPI (linha + área + ponto final), com o rótulo da janela. */
export function KpiSparkline({ values, label, color = FINANCE_COLORS.subtotal }: { values: number[]; label: string; color?: string }) {
	if (values.length < 2) return null;
	const lo = Math.min(...values);
	const hi = Math.max(...values);
	const span = hi - lo || 1;
	const points = values.map((value, index) => [(index / (values.length - 1)) * 100, 10 + (1 - (value - lo) / span) * 80] as const);
	const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
	const lastY = points[points.length - 1]?.[1] ?? 50;
	return (
		<div className="border-border mt-2 flex items-end gap-2 border-t border-dashed pt-2.5">
			<div className="relative h-7 flex-1">
				<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
					<path d={`${line} L100 100 L0 100 Z`} fill={color} fillOpacity={0.08} stroke="none" />
					<path d={line} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
				</svg>
				<div
					className="absolute size-[7px] rounded-full shadow-[0_0_0_2px_var(--color-card)]"
					style={{ left: "100%", top: `${lastY}%`, margin: "-3.5px 0 0 -3.5px", background: color }}
				/>
			</div>
			<span className="text-muted-foreground text-[0.6rem] font-semibold uppercase leading-none tracking-wide">{label}</span>
		</div>
	);
}

/** Amostra quadrada de legenda. */
export function LegendSwatch({ color, background, className }: { color?: string; background?: string; className?: string }) {
	return <span className={cn("inline-block size-2.5 rounded-[3px]", className)} style={{ background: background ?? color }} />;
}

/** Par rótulo/valor com filete colorido à esquerda (faixa de estatísticas acima dos gráficos). */
export function AccentStat({ label, value, color, className }: { label: string; value: string; color: string; className?: string }) {
	return (
		<div className={cn("flex flex-col gap-1 border-l-2 pl-2.5", className)} style={{ borderColor: color }}>
			<span className="text-muted-foreground text-[0.6rem] font-semibold uppercase tracking-wide">{label}</span>
			<span className="text-base font-bold tabular-nums">{value}</span>
		</div>
	);
}

/** Linhas de um tooltip de gráfico: amostra + rótulo + valor. */
export function TooltipRows({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
	return (
		<>
			<span className="text-xs font-bold">{title}</span>
			{rows.map((row) => (
				<div key={row.label} className="flex items-center gap-2 text-xs">
					<span className="size-2 rounded-[2px]" style={{ background: row.color ?? "transparent" }} />
					<span className="text-muted-foreground flex-1">{row.label}</span>
					<span className="font-semibold tabular-nums">{row.value}</span>
				</div>
			))}
		</>
	);
}
