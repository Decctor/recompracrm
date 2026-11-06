import { cn } from "@/lib/utils";
import {
	AlertTriangle,
	BadgeDollarSign,
	Boxes,
	CalendarClock,
	ChartPie,
	Hourglass,
	Info,
	type LucideIcon,
	RefreshCw,
	Repeat,
	Trash2,
	TrendingDown,
	TrendingUp,
} from "lucide-react";

// Relatórios de estoque (app/dashboard/inventory/reports), desenhado a 1120px: a navegação de seções
// do reports-page.tsx, o Resumo (summary-section.tsx, quatro StatUnitCard) e o Ponto de pedido
// (reorder-section.tsx), com a barra segurança / ponto de pedido / folga e a sugestão de compra.

const SECTIONS: { label: string; icon: LucideIcon }[] = [
	{ label: "Resumo", icon: Boxes },
	{ label: "Curva ABC", icon: ChartPie },
	{ label: "Giro e cobertura", icon: RefreshCw },
	{ label: "Ponto de pedido", icon: Repeat },
	{ label: "Estoque parado", icon: Hourglass },
	{ label: "Custos", icon: TrendingUp },
	{ label: "Perdas", icon: Trash2 },
	{ label: "Vencimentos", icon: CalendarClock },
];

const CARDS = [
	{ title: "Em estoque", subtitle: "186 produtos com saldo", icon: Boxes, value: "4.812 un", previous: "4.530 un", change: "6,2%", good: true },
	{
		title: "Valor imobilizado",
		subtitle: "Saldo × custo unitário",
		icon: BadgeDollarSign,
		value: "R$ 38.426,90",
		previous: "R$ 41.902,10",
		change: "8,3%",
		good: true,
	},
	{ title: "Sem estoque", subtitle: "Produtos zerados", icon: AlertTriangle, value: "7", previous: "4", change: "75%", good: false },
	{ title: "Lotes vencendo", subtitle: "Ativos com validade em 7 dias", icon: CalendarClock, value: "3", previous: "—" },
];

// Escala de cada barra: 2 × ponto de pedido, como no app (pontoPedido * 2 vs. saldo * 1,2).
const REORDER = [
	{
		name: "Leite integral 1L",
		meta: "IN-107 · Insumos",
		safety: 24,
		point: 60,
		balance: 36,
		coverage: "4 dias",
		lead: "3 dias",
		critical: false,
		suggestion: "96 un",
	},
	{
		name: "Creme de leite 1L",
		meta: "IN-108 · Insumos",
		safety: 10,
		point: 26,
		balance: 8,
		coverage: "2 dias",
		lead: "3 dias",
		critical: true,
		suggestion: "42 un",
	},
	{
		name: "Casquinha",
		meta: "EMB-012 · Embalagens",
		safety: 120,
		point: 300,
		balance: 260,
		coverage: "9 dias",
		lead: "7 dias*",
		critical: false,
		suggestion: "400 un",
	},
];

function percent(value: number, max: number) {
	return Math.max(0, Math.min(100, (value / max) * 100));
}

function SectionTitle({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-1.5">
				<Icon className="size-4 text-[#687a80]" />
				<p className="text-[12px] font-bold uppercase tracking-wide">{title}</p>
			</div>
			<p className="text-[12px] text-[#687a80]">{description}</p>
		</div>
	);
}

export function StockReportsMock() {
	return (
		<div className="flex flex-col gap-6 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-6 text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<div className="flex items-center justify-between gap-4 border-b border-[#e3e8ea] pb-4">
				<div className="flex flex-wrap gap-1">
					{SECTIONS.map((section, index) => (
						<span
							key={section.label}
							className={cn(
								"inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium",
								index === 0 ? "bg-[#0e1214] text-white" : "text-[#4b585d]",
							)}
						>
							<section.icon className="size-3.5" />
							{section.label}
						</span>
					))}
				</div>
				<div className="flex flex-none gap-0.5 rounded-[10px] bg-[#f2f4f4] p-[3px] text-[12px] font-medium">
					<span className="rounded-lg bg-white px-2.5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.08)]">30 dias</span>
					<span className="px-2.5 py-1 text-[#687a80]">90 dias</span>
					<span className="px-2.5 py-1 text-[#687a80]">12 meses</span>
				</div>
			</div>

			<section className="flex flex-col gap-3">
				<SectionTitle icon={Boxes} title="Resumo" description="Retrato do estoque hoje e a evolução do capital imobilizado no período." />
				<div className="grid grid-cols-4 gap-3">
					{CARDS.map((card) => (
						<div key={card.title} className="flex flex-col gap-1 rounded-xl border border-[#e3e8ea] bg-white px-3 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
							<div className="flex items-start justify-between gap-2">
								<div className="flex flex-col gap-0.5">
									<p className="text-[12px] font-medium uppercase tracking-tight">{card.title}</p>
									<p className="text-[10.4px] text-[#687a80]">{card.subtitle}</p>
								</div>
								<div className="flex items-center gap-2">
									{card.change ? (
										<span
											className={cn(
												"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.4px] font-bold",
												card.good ? "bg-[#bbf7d0] text-[#15803d]" : "bg-[#fecaca] text-[#b91c1c]",
											)}
										>
											{card.good ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
											{card.change}
										</span>
									) : null}
									<card.icon className="size-4 flex-none" />
								</div>
							</div>
							<p className="text-[24px] font-bold">{card.value}</p>
							<p className="text-[12px] tracking-tight text-[#687a80]">HÁ 30 DIAS: {card.previous}</p>
						</div>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<div className="flex items-end justify-between gap-2">
					<SectionTitle
						icon={Repeat}
						title="Ponto de pedido"
						description="Produtos no ou abaixo do ponto de pedido. Prazo de reposição calculado das compras anteriores de cada produto."
					/>
					<span className="text-[12px] font-semibold">
						3 produtos · <span className="text-[#1d4ed8]">R$ 1.338,20</span> em compras sugeridas
					</span>
				</div>
				<div className="flex flex-col gap-2">
					{REORDER.map((item) => {
						const max = Math.max(item.point * 2, item.balance * 1.2, 1);
						return (
							<div key={item.name} className="flex items-center gap-6 rounded-xl border border-[#e3e8ea] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
								<div className="flex w-[220px] min-w-0 flex-none flex-col">
									<span className="text-[14px] font-bold tracking-tight">{item.name}</span>
									<span className="text-[10.4px] font-medium text-[rgba(14,18,20,0.7)]">{item.meta}</span>
								</div>
								<div className="flex min-w-0 flex-1 flex-col gap-1 pt-4">
									<div className="relative flex h-2 overflow-hidden rounded-full">
										<div className="bg-[#fecaca]" style={{ width: `${percent(item.safety, max)}%` }} />
										<div className="bg-[#fde68a]" style={{ width: `${percent(item.point, max) - percent(item.safety, max)}%` }} />
										<div className="flex-1 bg-[#bbf7d0]" />
									</div>
									<div className="relative h-3.5">
										<div className="absolute -top-4 h-4 w-[3px] -translate-x-1/2 rounded-sm bg-[#0e1214]" style={{ left: `${percent(item.balance, max)}%` }} />
										<span
											className="absolute top-px -translate-x-1/2 whitespace-nowrap text-[10px] font-bold"
											style={{ left: `${percent(item.balance, max)}%` }}
										>
											SALDO {item.balance}
										</span>
										<span
											className="absolute top-px -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-[#92400e]"
											style={{ left: `${Math.max(percent(item.point, max), percent(item.balance, max) + 14)}%` }}
										>
											PP {item.point}
										</span>
									</div>
								</div>
								<div className="flex flex-none items-center gap-4">
									<div className="flex flex-col items-end gap-0.5">
										<span className="text-[9.6px] font-semibold uppercase tracking-wide text-[#687a80]">Cobertura</span>
										<span className={cn("text-[12px] font-bold", item.critical ? "text-[#dc2626]" : "text-[#a16207]")}>{item.coverage}</span>
									</div>
									<div className="flex flex-col items-end gap-0.5">
										<span className="text-[9.6px] font-semibold uppercase tracking-wide text-[#687a80]">Prazo</span>
										<span className="text-[12px] font-semibold">{item.lead}</span>
									</div>
									<div className="flex w-[76px] flex-col items-end gap-0.5">
										<span className="text-[9.6px] font-semibold uppercase tracking-wide text-[#687a80]">Sugestão</span>
										<span className="text-[16px] font-bold text-[#1d4ed8]">{item.suggestion}</span>
									</div>
									<span className="inline-flex h-8 items-center gap-1.5 px-2 text-[12px] font-medium">
										<Info className="size-3.5" />
										DETALHES
									</span>
								</div>
							</div>
						);
					})}
					<p className="text-[11px] text-[#687a80]">* Sem compras com data de pedido e de recebimento: usa o prazo padrão de 7 dias.</p>
				</div>
			</section>
		</div>
	);
}
