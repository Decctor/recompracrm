import { Banknote, CalendarClock, Hourglass, Landmark, type LucideIcon, Repeat, TrendingUp } from "lucide-react";

// Fluxo de caixa projetado (app/dashboard/finance/reports/cash-flow/cash-flow-page.tsx), desenhado a
// 1040px: o seletor de horizonte (30/60/90 dias, aqui 30), os quatro KPIs do CashKpis e o ProjectionCard com o
// saldo projetado dia a dia e as entradas e saídas previstas, nas cores de FINANCE_COLORS.

const COLORS = { inflow: "#16a34a", outflow: "#dc2626", subtotal: "#24549c" };

const KPIS: { title: string; subtitle: string; icon: LucideIcon; value: string; footer?: string }[] = [
	{ title: "Caixa consolidado", subtitle: "Bancos, caixa e carteiras", icon: Landmark, value: "R$ 48.215,40", footer: "HÁ 30 DIAS: R$ 41.630,00" },
	{ title: "Geração média (3M)", subtitle: "Entradas − saídas por mês", icon: TrendingUp, value: "R$ 19.870,00" },
	{ title: "Runway", subtitle: "Caixa ÷ burn médio mensal", icon: Hourglass, value: "Sem queima", footer: "FLUXO POSITIVO NOS ÚLTIMOS 3 MESES" },
	{ title: "Recorrentes / mês", subtitle: "Entradas R$ 0 · Saídas R$ 14,6 mil", icon: Repeat, value: "-R$ 14.620,00" },
];

// 30 dias a partir de 07/11: vendas a receber e fiados entrando todo dia; saídas concentradas nos
// vencimentos de compras (dias 3, 10, 17, 24) e nas recorrentes (aluguel no dia 5, folha no dia 25).
const DAYS = Array.from({ length: 30 }, (_, index) => {
	const weekday = (index + 6) % 7; // 07/11/2026 é um sábado
	const inflow = weekday === 0 ? 1.2 : weekday === 5 || weekday === 6 ? 3.4 : 2.3;
	const outflow = [3, 10, 17, 24].includes(index) ? 6.8 : index === 5 ? 5.5 : index === 25 ? 9.2 : 0.6;
	const date = new Date(Date.UTC(2026, 10, 7 + index));
	const label = `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
	return { inflow, outflow, label };
});
const START = 48.2;
const BALANCES = DAYS.reduce<number[]>((acc, day) => [...acc, (acc.at(-1) ?? START) + day.inflow - day.outflow], []);
const FINAL = BALANCES.at(-1) ?? START;
const LINE_MAX = 100;
const BAR_MAX = 10;

export function CashFlowMock() {
	const points = [START, ...BALANCES].map((value, index) => `${(index / DAYS.length) * 100},${100 - (value / LINE_MAX) * 100}`).join(" ");
	return (
		<div className="flex flex-col gap-4 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-6 text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<div className="flex min-h-8 items-center justify-between gap-2">
				<p className="text-[12px] font-bold uppercase tracking-tight">Fluxo de caixa</p>
				<div className="flex gap-0.5 rounded-[10px] bg-[#f5f5f5] p-[3px] text-[12px] font-medium">
					<span className="rounded-lg bg-white px-2.5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.08)]">30 dias</span>
					<span className="px-2.5 py-1 text-[#687a80]">60 dias</span>
					<span className="px-2.5 py-1 text-[#687a80]">90 dias</span>
				</div>
			</div>

			<div className="grid grid-cols-4 gap-3">
				{KPIS.map((kpi) => (
					<div key={kpi.title} className="flex flex-col gap-1 rounded-xl border border-[#e3e8ea] bg-white px-3 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
						<div className="flex items-start justify-between gap-2">
							<div className="flex flex-col gap-0.5">
								<p className="text-[12px] font-medium uppercase tracking-tight">{kpi.title}</p>
								<p className="text-[10.4px] text-[#687a80]">{kpi.subtitle}</p>
							</div>
							<kpi.icon className="size-4 flex-none" />
						</div>
						<p className="text-[24px] font-bold text-[#24549c]">{kpi.value}</p>
						{kpi.footer ? <p className="text-[12px] tracking-tight text-[#687a80]">{kpi.footer}</p> : null}
					</div>
				))}
			</div>

			<div className="flex flex-col gap-3 rounded-xl border border-[#e3e8ea] bg-white px-4 pt-4 pb-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<CalendarClock className="size-4" />
						<p className="text-[12px] font-medium uppercase leading-none tracking-tight">SALDO PROJETADO</p>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-[11px] font-semibold text-[#687a80]">AO FINAL DO HORIZONTE</span>
						<span className="text-[16px] font-extrabold">R$ {FINAL.toFixed(1).replace(".", ",")} mil</span>
					</div>
				</div>
				<div className="relative mt-[22px] ml-16 h-[200px]">
					{[0, 25, 50, 75, 100].map((tick) => (
						<div key={tick} className="absolute inset-x-0 border-t border-dashed border-[#e3e8ea]" style={{ top: `${100 - tick}%` }}>
							<span className="absolute top-[-7px] right-full mr-2 whitespace-nowrap text-[11px] text-[#687a80]">
								{tick === 0 ? "R$ 0" : `R$ ${tick} mil`}
							</span>
						</div>
					))}
					<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
						<polygon points={`0,100 ${points} 100,100`} fill={COLORS.subtotal} fillOpacity="0.08" />
						<polyline points={points} fill="none" stroke={COLORS.subtotal} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
					</svg>
				</div>
				<div className="mt-3 ml-16 flex items-center justify-between gap-2 border-t border-[#e3e8ea] pt-3">
					<div className="flex items-center gap-2">
						<Banknote className="size-4" />
						<p className="text-[12px] font-medium uppercase leading-none tracking-tight">Entradas e saídas previstas</p>
					</div>
					<div className="flex items-center gap-3.5 text-[12px] text-[#687a80]">
						<span className="flex items-center gap-1.5">
							<span className="size-2.5 rounded-[3px]" style={{ background: COLORS.inflow }} />
							Entradas
						</span>
						<span className="flex items-center gap-1.5">
							<span className="size-2.5 rounded-[3px]" style={{ background: COLORS.outflow }} />
							Saídas
						</span>
					</div>
				</div>
				<div className="relative ml-16 grid h-[110px] gap-1" style={{ gridTemplateColumns: `repeat(${DAYS.length}, minmax(0, 1fr))` }}>
					<div className="absolute inset-x-0 top-1/2 border-t border-[#e3e8ea]" />
					{DAYS.map((day) => (
						<div key={day.label} className="relative h-full">
							<div
								className="absolute inset-x-0 bottom-1/2 rounded-t-[2px]"
								style={{ height: `${(day.inflow / BAR_MAX) * 50}%`, background: COLORS.inflow }}
							/>
							<div
								className="absolute inset-x-0 top-1/2 rounded-b-[2px]"
								style={{ height: `${(day.outflow / BAR_MAX) * 50}%`, background: COLORS.outflow }}
							/>
						</div>
					))}
				</div>
				<div
					className="ml-16 grid gap-1 text-center text-[10px] text-[#687a80]"
					style={{ gridTemplateColumns: `repeat(${DAYS.length}, minmax(0, 1fr))` }}
				>
					{DAYS.map((day, index) => (
						<span key={day.label} className="whitespace-nowrap">
							{index % 5 === 0 ? day.label : ""}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
