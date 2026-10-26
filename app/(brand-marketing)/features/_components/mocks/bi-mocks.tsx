import { cn } from "@/lib/utils";
import {
	ArrowRight,
	Grid3x3,
	HeartPulse,
	Info,
	Lightbulb,
	type LucideIcon,
	MoveUp,
	Receipt,
	RefreshCcw,
	Settings2,
	ShoppingCart,
	TriangleAlert,
} from "lucide-react";
import type { CSSProperties } from "react";
import { BlockTitle, DeltaChip, MUTED, MockCard, RfmChip, getRfmSegment } from "./mock-parts";

// Telas de inteligência (customers/segments/{rfm-health-section,segments-page}, api/stats/sales-rfm-labelled).

// Gradiente de cada área da matriz: três paradas, cor do texto e, nos fundos claros, o tom do selo.
type TMatrixTone = { stops: [string, string, string]; text: string; badge?: string; badgeBorder?: string };

const MATRIX_TONES: Record<string, TMatrixTone> = {
	CAMPEÕES: { stops: ["#fb923c", "#f97316", "#d97706"], text: "#fff" },
	"CLIENTES LEAIS": { stops: ["#34d399", "#10b981", "#16a34a"], text: "#fff" },
	"POTENCIAIS CLIENTES LEAIS": {
		stops: ["#92400e", "#78350f", "#422006"],
		text: "#fef3c7",
		badge: "rgba(254,243,199,0.2)",
		badgeBorder: "rgba(254,243,199,0.3)",
	},
	"CLIENTES RECENTES": { stops: ["#2dd4bf", "#14b8a6", "#0891b2"], text: "#fff" },
	PROMISSORES: { stops: ["#f472b6", "#ec4899", "#e11d48"], text: "#fff" },
	"PRECISAM DE ATENÇÃO": { stops: ["#818cf8", "#6366f1", "#7c3aed"], text: "#fff" },
	"PRESTES A DORMIR": { stops: ["#eab308", "#ca8a04", "#b45309"], text: "#fff" },
	"EM RISCO": { stops: ["#fde047", "#facc15", "#f59e0b"], text: "#422006", badge: "rgba(66,32,6,0.15)", badgeBorder: "rgba(66,32,6,0.2)" },
	"NÃO PODE PERDÊ-LOS": { stops: ["#60a5fa", "#3b82f6", "#0284c7"], text: "#fff" },
	HIBERNANDO: { stops: ["#c084fc", "#a855f7", "#7c3aed"], text: "#fff" },
	PERDIDOS: { stops: ["#f87171", "#ef4444", "#be123c"], text: "#fff" },
};

// Áreas da matriz 5×5 (recência nas colunas, frequência+valor nas linhas), como o app desenha.
const MATRIX_AREAS: { label: string; area: string; zIndex: number; revenue: string }[] = [
	{ label: "NÃO PODE PERDÊ-LOS", area: "1 / 1 / 2 / 3", zIndex: 12, revenue: "R$ 21.480,00" },
	{ label: "CLIENTES LEAIS", area: "1 / 3 / 3 / 6", zIndex: 8, revenue: "R$ 58.930,00" },
	{ label: "CAMPEÕES", area: "1 / 5 / 2 / 6", zIndex: 30, revenue: "R$ 64.210,00" },
	{ label: "EM RISCO", area: "2 / 1 / 4 / 3", zIndex: 12, revenue: "R$ 18.760,00" },
	{ label: "PRECISAM DE ATENÇÃO", area: "3 / 3 / 4 / 4", zIndex: 25, revenue: "R$ 12.340,00" },
	{ label: "POTENCIAIS CLIENTES LEAIS", area: "3 / 4 / 5 / 6", zIndex: 12, revenue: "R$ 27.150,00" },
	{ label: "HIBERNANDO", area: "4 / 2 / 5 / 3", zIndex: 30, revenue: "R$ 9.870,00" },
	{ label: "PRESTES A DORMIR", area: "4 / 3 / 6 / 4", zIndex: 15, revenue: "R$ 11.420,00" },
	{ label: "PERDIDOS", area: "4 / 1 / 6 / 3", zIndex: 5, revenue: "R$ 8.130,00" },
	{ label: "PROMISSORES", area: "5 / 4 / 6 / 5", zIndex: 25, revenue: "R$ 10.660,00" },
	{ label: "CLIENTES RECENTES", area: "5 / 5 / 6 / 6", zIndex: 25, revenue: "R$ 7.940,00" },
];

// Áreas de uma célula só: selo menor e sem faturamento.
const COMPACT_AREAS = new Set(["CAMPEÕES", "PRECISAM DE ATENÇÃO", "HIBERNANDO", "PROMISSORES", "CLIENTES RECENTES"]);

const CELL_CONTENT = "flex flex-col items-center justify-center gap-1.5 p-1.5";

/** Herói do BI: a matriz RFM com as 11 segmentações, contagem e faturamento de cada uma. */
export function RfmMatrixMock() {
	return (
		<MockCard className="gap-2 px-3 py-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<BlockTitle icon={Grid3x3}>MATRIZ RFM</BlockTitle>
				<div className="flex gap-1">
					<span className="inline-flex h-8 items-center gap-2 rounded-full px-2.5 text-[13px] font-medium">
						<Settings2 className="size-4 flex-none" aria-hidden />
						CONFIGURAR
					</span>
					<span className="inline-flex h-8 items-center gap-2 rounded-full px-2.5 text-[13px] font-medium">
						<RefreshCcw className="size-4 flex-none" aria-hidden />
						SINCRONIZAR
					</span>
				</div>
			</div>
			<div className="flex items-center justify-center gap-1 rounded-lg bg-[rgba(36,84,156,0.1)] px-2 py-1 text-center text-[10.4px] font-medium tracking-[-0.01em] text-[rgba(14,18,20,0.8)]">
				<Info className="size-3 flex-none" aria-hidden />
				<span>Análise RFM dos últimos 12 meses. Passe o mouse no bloco para detalhes.</span>
			</div>
			<div className="isolate grid aspect-square w-full grid-cols-5 grid-rows-5 gap-0.5">
				{MATRIX_AREAS.map(({ label, area, zIndex, revenue }) => {
					const tone = MATRIX_TONES[label];
					const lost = label === "PERDIDOS";
					const small = lost || COMPACT_AREAS.has(label);
					const cellStyle: CSSProperties = {
						gridArea: area,
						zIndex,
						background: `linear-gradient(to bottom right, ${tone.stops.join(", ")})`,
						// "Perdidos" ocupa um L: o recorte deixa à mostra só a célula de baixo e a da esquerda.
						clipPath: lost ? "polygon(0 0, 50% 0, 50% 50%, 100% 50%, 100% 100%, 0 100%)" : undefined,
					};
					return (
						<div key={label} className="relative min-h-0 min-w-0 overflow-hidden rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.08)]" style={cellStyle}>
							<span className="pointer-events-none absolute inset-0 rounded-lg bg-linear-to-b from-white/10 to-transparent" />
							<div className={cn(CELL_CONTENT, lost ? "absolute bottom-0 left-0 h-1/2 w-1/2" : "relative size-full")}>
								<span
									className={cn(
										"relative z-[1] px-0.5 text-center font-semibold tracking-[0.03em] uppercase",
										small ? "text-[8.8px]" : "line-clamp-2 text-[9.6px]",
										"leading-[1.05]",
									)}
									style={{ color: tone.text }}
								>
									{label}
								</span>
								<span
									className={cn(
										"relative z-[1] flex flex-none items-center justify-center rounded-full border backdrop-blur-[4px]",
										small ? "size-[30px]" : "size-[38px]",
									)}
									style={{ background: tone.badge ?? "rgba(255,255,255,0.2)", borderColor: tone.badgeBorder ?? "rgba(255,255,255,0.3)" }}
								>
									<span className={cn("font-bold", small ? "text-[10px]" : "text-[12px]")} style={{ color: tone.text }}>
										{getRfmSegment(label).count}
									</span>
								</span>
								{small ? null : (
									<span className="relative z-[1] text-[9.6px] font-medium tracking-[-0.01em] opacity-85" style={{ color: tone.text }}>
										{revenue}
									</span>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</MockCard>
	);
}

const HEALTH_CHIPS = [
	{ label: "CLIENTES ANALISADOS", value: "2.418", warning: false },
	{ label: "ALERTAS CRÍTICOS", value: "0", warning: false },
	{ label: "ATENÇÃO", value: "1", warning: true },
	{ label: "OBSERVAÇÕES", value: "1", warning: false },
];

const HEALTH_ALERTS = [
	{
		severity: "warning",
		title: "Muitos clientes em PERDIDOS",
		text: "14,4% da base caiu na faixa mais baixa. Revise os cortes de recência na configuração.",
	},
	{ severity: "info", title: "Frequência concentrada em 1 compra", text: "62% dos clientes compraram uma vez nos últimos 12 meses." },
] as const;

/** Diagnóstico da matriz: status, contadores e alertas sobre os cortes. */
export function MatrixHealthMock() {
	return (
		<MockCard className="gap-[18px] px-4 py-5">
			<div className="flex flex-wrap items-center justify-between gap-2.5">
				<div>
					<BlockTitle icon={HeartPulse}>SAÚDE DA MATRIZ</BlockTitle>
					<p className={cn("m-0 mt-1 text-[11.2px]", MUTED)}>Diagnóstico estatístico da matriz RFM nos últimos 12 meses.</p>
				</div>
				<span className="inline-flex h-8 items-center gap-2 rounded-full px-2.5 text-[12px] font-medium">
					<Settings2 className="size-4 flex-none" aria-hidden />
					AJUSTAR CONFIGURAÇÃO
				</span>
			</div>
			<div className="flex flex-col gap-3 rounded-xl border border-[rgba(16,185,129,0.3)] bg-[linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05))] p-4">
				<div className="flex items-start gap-3">
					<span className="flex flex-none rounded-lg bg-[rgba(16,185,129,0.15)] p-2 text-[#10b981]">
						<HeartPulse className="size-5 flex-none" aria-hidden />
					</span>
					<div>
						<p className="m-0 text-[10.4px] font-bold tracking-[0.1em] text-[#059669]">STATUS DA MATRIZ</p>
						<p className="m-0 mt-0.5 text-[16px] font-semibold tracking-[-0.01em] text-[#059669]">SAUDÁVEL</p>
						<p className="m-0 mt-1 text-[12px] leading-[1.5] text-[rgba(14,18,20,0.8)]">
							Os cortes de recência, frequência e valor separam bem a base. A maioria dos clientes cai em faixas com ação clara.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					{HEALTH_CHIPS.map((chip) => (
						<div
							key={chip.label}
							className={cn(
								"flex flex-col items-start rounded-lg border px-2.5 py-1.5",
								chip.warning ? "border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.1)] text-[#b45309]" : "border-[#e3e8ea] bg-white/60 text-[#0e1214]",
							)}
						>
							<span className="text-[9.6px] font-bold tracking-[0.03em] opacity-80">{chip.label}</span>
							<span className="text-[14px] font-semibold">{chip.value}</span>
						</div>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-2.5">
				<div>
					<p className={cn("m-0 text-[11.2px] font-bold tracking-[0.08em]", MUTED)}>ALERTAS</p>
					<p className="m-0 mt-0.5 text-[11.2px] text-[rgba(104,122,128,0.8)]">2 pontos para revisar</p>
				</div>
				{HEALTH_ALERTS.map((alert) => {
					const warning = alert.severity === "warning";
					const Icon = warning ? TriangleAlert : Info;
					return (
						<div
							key={alert.title}
							className={cn(
								"flex items-start gap-2 rounded-lg border p-3",
								warning ? "border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.1)]" : "border-[rgba(14,165,233,0.3)] bg-[rgba(14,165,233,0.1)]",
							)}
						>
							<Icon className={cn("mt-0.5 size-4 flex-none", warning ? "text-[#d97706]" : "text-[#0284c7]")} aria-hidden />
							<div>
								<p className="m-0 text-[12px] font-semibold">{alert.title}</p>
								<p className="m-0 mt-0.5 text-[11.2px] leading-[1.45] text-[rgba(14,18,20,0.8)]">{alert.text}</p>
							</div>
						</div>
					);
				})}
			</div>
		</MockCard>
	);
}

const SUGGESTIONS = [
	{ segment: "CAMPEÕES", tip: "Crie um programa VIP ou ofereça acesso antecipado a promoções.", cta: "CRIAR CAMPANHA" },
	{ segment: "EM RISCO", tip: "Envie uma campanha de reativação com cashback bônus de 15%.", cta: "CRIAR CAMPANHA" },
	{ segment: "PERDIDOS", tip: "Ofereça um desconto agressivo ou aceite a perda e foque nos segmentos promissores.", cta: "VER CLIENTES" },
];

/** Sugestões de ação por segmento, com o atalho para agir. */
export function SegmentSuggestionsMock() {
	return (
		<div className="flex flex-col gap-2.5">
			{SUGGESTIONS.map((suggestion) => (
				<div
					key={suggestion.segment}
					className="flex flex-col gap-3 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-4 shadow-[0_20px_50px_-30px_rgba(16,24,40,0.35)]"
				>
					<div className="flex items-center justify-between gap-2">
						<RfmChip label={suggestion.segment} />
						<span className={cn("text-[12px] font-semibold", MUTED)}>{getRfmSegment(suggestion.segment).count} clientes</span>
					</div>
					<p className="m-0 flex gap-2.5 text-[14px] leading-[1.5] text-[#2b3538]">
						<Lightbulb className="mt-0.5 size-4 flex-none text-[#ffb900]" aria-hidden />
						{suggestion.tip}
					</p>
					<span className="inline-flex h-[30px] items-center gap-1.5 self-end rounded-full border border-[#e3e8ea] bg-[#f7f9f9] px-3 text-[12px] font-medium">
						{suggestion.cta}
						<ArrowRight className="size-[13px]" aria-hidden />
					</span>
				</div>
			))}
		</div>
	);
}

const DASHBOARD_STATS: { label: string; value: string; delta: string; icon: LucideIcon; surface: string; color: string }[] = [
	{ label: "FATURAMENTO", value: "R$ 182.430", delta: "+11,8%", icon: MoveUp, surface: "#bbf7d0", color: "#16a34a" },
	{ label: "TICKET MÉDIO", value: "R$ 84,20", delta: "+4,3%", icon: Receipt, surface: "#bfdbfe", color: "#2563eb" },
	{ label: "VENDAS", value: "2.167", delta: "+7,2%", icon: ShoppingCart, surface: "rgba(36,84,156,0.15)", color: "#24549c" },
	{ label: "CLIENTES QUE VOLTARAM", value: "41,6%", delta: "+2,9 p.p.", icon: RefreshCcw, surface: "rgba(255,185,0,0.25)", color: "#8a6400" },
];

const WEEKLY_REVENUE = [52, 61, 58, 66, 72, 69, 80, 88];

/** Painel de resultados: indicadores do período e faturamento por semana. */
export function BiDashboardMock() {
	return (
		<MockCard className="gap-3 p-4">
			<div className="grid grid-cols-2 gap-2">
				{DASHBOARD_STATS.map(({ label, value, delta, icon: Icon, surface, color }) => (
					<div key={label} className="flex flex-col gap-2.5 rounded-[14px] border border-[#e3e8ea] px-3 py-3.5">
						<div className="flex items-center gap-2">
							<span className="flex size-[26px] flex-none items-center justify-center rounded-[13px]" style={{ background: surface, color }}>
								<Icon className="size-3.5 flex-none" aria-hidden />
							</span>
							<span className="text-[11px] font-semibold">{label}</span>
						</div>
						<div className="flex items-center justify-between gap-1.5">
							<span className="text-[17px] font-bold tracking-[-0.02em]">{value}</span>
							<DeltaChip>{delta}</DeltaChip>
						</div>
					</div>
				))}
			</div>
			<div className="rounded-[14px] border border-[#e3e8ea] px-3 py-3.5">
				<p className="m-0 mb-3 text-[11px] font-semibold">FATURAMENTO POR SEMANA</p>
				<div className="grid h-[120px] grid-cols-8 items-end gap-2 border-b border-[#e3e8ea]">
					{WEEKLY_REVENUE.map((height, i) => (
						<span
							key={i}
							className={cn("block rounded-t", i === WEEKLY_REVENUE.length - 1 ? "bg-[#24549c]" : "bg-[#c7d3e6]")}
							style={{ height: `${height}%` }}
						/>
					))}
				</div>
			</div>
		</MockCard>
	);
}
