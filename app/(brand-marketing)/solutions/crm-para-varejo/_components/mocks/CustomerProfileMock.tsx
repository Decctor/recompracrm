import { cn } from "@/lib/utils";
import {
	ArrowLeft,
	BadgeDollarSign,
	BadgePercent,
	Calendar,
	ChartBar,
	CirclePlus,
	Grid3X3,
	Pencil,
	ShoppingBag,
	ShoppingCart,
	Ticket,
	UserRound,
} from "lucide-react";

// Perfil do cliente (app/dashboard/customers/[customerId]) na aba ESTATÍSTICAS, desenhado a 1080px:
// ClientDetailHeader (avatar, segmento RFM, completude do cadastro e os três KPIs), as abas da página
// e o client-stats-tab (quatro StatUnitCard horizontais, "Quando ele compra" por dia da semana com a
// escala de calor do app e "O que ele compra" por produto). Cliente e números são hipotéticos.

const KPIS = [
	{ title: "Compras", value: "24", icon: CirclePlus },
	{ title: "Valor compro", value: "R$ 1.461,80", icon: BadgeDollarSign },
	{ title: "Ticket médio", value: "R$ 60,91", icon: Ticket },
];

const TABS = [
	{ label: "CADASTRO", icon: Pencil },
	{ label: "ESTATÍSTICAS", icon: ChartBar, active: true },
	{ label: "COMPRAS", icon: ShoppingCart },
	{ label: "CASHBACK", icon: BadgePercent },
];

const STATS = [
	{ title: "Número de compras", subtitle: "no período filtrado", value: "24", icon: CirclePlus },
	{ title: "Valor compro", subtitle: "no período filtrado", value: "R$ 1.461,80", icon: BadgeDollarSign },
	{ title: "Ticket médio", subtitle: "no período filtrado", value: "R$ 60,91", icon: Ticket },
	{ title: "Valor diário compro", subtitle: "média dos dias entre a primeira e a última compra", value: "R$ 4,21", icon: ShoppingCart },
];

// Faturamento por dia da semana (soma = R$ 1.461,80). A cor segue createHeatScale do app:
// rgba(254, 173, 0, 0.1 + 0.9 × posição entre o mínimo e o máximo, com o mínimo travado em 0).
const WEEKDAYS = [
	{ label: "Domingo", total: 318.4 },
	{ label: "Segunda", total: 42.9 },
	{ label: "Terça", total: 88.0 },
	{ label: "Quarta", total: 131.5 },
	{ label: "Quinta", total: 164.2 },
	{ label: "Sexta", total: 297.6 },
	{ label: "Sábado", total: 419.2 },
];
const WEEKDAY_MAX = Math.max(...WEEKDAYS.map((day) => day.total));

const PRODUCTS = [
	{ name: "Pote 1L Chocolate Belga", total: "R$ 548,90", share: 100 },
	{ name: "Milkshake 400ml", total: "R$ 308,00", share: 56 },
	{ name: "Gelato", total: "R$ 252,00", share: 46 },
	{ name: "Sundae de caramelo", total: "R$ 186,60", share: 34 },
	{ name: "Casquinha", total: "R$ 98,00", share: 18 },
];

function SectionHeader({ icon: Icon, title, toggles }: { icon: typeof Calendar; title: string; toggles: { label: string; active?: boolean }[] }) {
	return (
		<div className="flex min-h-8 items-center gap-2">
			<Icon className="size-4" />
			<p className="truncate text-[12px] font-bold uppercase tracking-tight">{title}</p>
			<div className="ml-auto flex items-center gap-2">
				{toggles.map((toggle) => (
					<span
						key={toggle.label}
						className={cn(
							"inline-flex h-6 items-center rounded-full px-2 text-[10.4px] font-bold",
							toggle.active ? "bg-[#171717] text-[#fafafa]" : "text-[#0e1214]",
						)}
					>
						{toggle.label}
					</span>
				))}
			</div>
		</div>
	);
}

export function CustomerProfileMock() {
	return (
		<div className="flex flex-col gap-4 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white px-8 py-6 text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<span className="inline-flex h-8 w-fit items-center gap-1 px-2 text-[12px] font-medium">
				<ArrowLeft className="size-4" />
				VOLTAR
			</span>

			<div className="flex items-start gap-4">
				<span className="flex size-16 flex-none items-center justify-center rounded-lg bg-[#171717] text-[#fafafa]">
					<UserRound className="size-10" />
				</span>
				<div className="flex min-w-0 grow flex-col gap-2">
					<div className="flex flex-wrap items-center gap-1.5">
						<p className="text-[24px] font-extrabold tracking-tight">Maria Silva</p>
						<span className="flex items-center gap-1.5 rounded-xl bg-[#4ade80] px-3 py-1.5 text-[#030712]">
							<Grid3X3 className="size-4" />
							<span className="text-[12px] font-medium uppercase tracking-tight">CLIENTES LEAIS</span>
						</span>
					</div>
					<div className="flex max-w-[512px] items-center gap-2.5">
						<div className="relative h-1 flex-1 overflow-hidden rounded-full bg-[#f5f5f5]">
							<div className="absolute inset-y-0 left-0 w-[80%] rounded-full bg-[#24549c]" />
						</div>
						<p className="flex-none text-[11px] text-[#687a80]">Cadastro 80% completo · falta CPF/CNPJ</p>
					</div>
				</div>
				<div className="flex flex-none items-stretch gap-2">
					{KPIS.map((kpi) => (
						<div
							key={kpi.title}
							className="flex w-44 flex-col gap-2 rounded-xl border border-[#e3e8ea] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
						>
							<div className="flex items-center gap-2">
								<kpi.icon className="size-4 flex-none text-[#687a80]" />
								<p className="truncate text-[12px] font-medium uppercase tracking-tight">{kpi.title}</p>
							</div>
							<span className="text-[20px] font-bold leading-none text-[#24549c]">{kpi.value}</span>
						</div>
					))}
				</div>
			</div>

			<div className="flex w-fit items-center gap-1.5 rounded-lg bg-[#f5f5f5] px-2 py-1">
				{TABS.map((tab) => (
					<span
						key={tab.label}
						className={cn(
							"inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium",
							tab.active ? "bg-white text-[#0e1214] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#687a80]",
						)}
					>
						<tab.icon className="size-4" />
						{tab.label}
					</span>
				))}
			</div>

			<div className="grid grid-cols-4 gap-2">
				{STATS.map((stat) => (
					<div
						key={stat.title}
						className="flex flex-col gap-2 rounded-xl border border-[#e3e8ea] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
					>
						<div className="flex items-center justify-between gap-3">
							<div className="flex min-w-0 items-center gap-2">
								<stat.icon className="size-4 flex-none text-[#687a80]" />
								<p className="truncate text-[12px] font-medium uppercase leading-tight tracking-tight">{stat.title}</p>
							</div>
							<span className="flex-none text-[20px] font-bold leading-none text-[#24549c]">{stat.value}</span>
						</div>
						<p className="text-[10.4px] text-[#687a80]">{stat.subtitle}</p>
					</div>
				))}
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div className="flex flex-col gap-6 rounded-xl border border-[#e3e8ea] bg-white px-3 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
					<SectionHeader
						icon={Calendar}
						title="Quando ele compra"
						toggles={[{ label: "DIA DO MÊS" }, { label: "MÊS" }, { label: "DIA DA SEMANA", active: true }]}
					/>
					<div className="flex flex-col gap-3">
						<div className="flex flex-wrap gap-1.5">
							<span className="rounded-lg bg-[rgba(22,163,74,0.12)] px-2.5 py-1 text-[12px] font-medium text-[#15803d]">
								O período preferido para compra foi Sábado
							</span>
							<span className="rounded-lg bg-[rgba(229,37,42,0.1)] px-2.5 py-1 text-[12px] font-medium text-[#e5252a]">
								O pior período para compra foi Segunda
							</span>
						</div>
						<div className="grid grid-cols-7 gap-2">
							{WEEKDAYS.map((day) => (
								<div
									key={day.label}
									className="flex min-h-[52px] items-center justify-center rounded-md border border-[#e3e8ea] p-2"
									style={{ backgroundColor: `rgba(254, 173, 0, ${(0.1 + (day.total / WEEKDAY_MAX) * 0.9).toFixed(2)})` }}
								>
									<p className="text-center text-[12px] font-bold uppercase tracking-tight">{day.label}</p>
								</div>
							))}
						</div>
					</div>
				</div>

				<div className="flex flex-col gap-6 rounded-xl border border-[#e3e8ea] bg-white px-3 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
					<SectionHeader
						icon={ShoppingBag}
						title="O que ele compra"
						toggles={[{ label: "PRODUTOS", active: true }, { label: "GRUPOS" }, { label: "VENDEDORES" }]}
					/>
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-1">
							<span className="inline-flex h-6 items-center rounded-md bg-[#171717] px-2 text-[10.4px] font-medium text-[#fafafa]">VALOR</span>
							<span className="inline-flex h-6 items-center rounded-md bg-[#f5f5f5] px-2 text-[10.4px] font-medium">QUANTIDADE</span>
						</div>
						<div className="flex flex-col gap-2.5">
							{PRODUCTS.map((product, index) => (
								<div key={product.name} className="flex flex-col gap-1">
									<div className="flex items-center justify-between gap-2">
										<div className="flex min-w-0 items-center gap-1.5">
											<span className="flex size-6 flex-none items-center justify-center rounded-full border border-[#e3e8ea] text-[12px]">{index + 1}º</span>
											<p className="truncate text-[12px] font-medium uppercase tracking-tight">{product.name}</p>
										</div>
										<span className="flex-none text-[12px] font-bold tracking-tight">{product.total}</span>
									</div>
									<div className="relative h-1 overflow-hidden rounded-full bg-[#f5f5f5]">
										<div className="absolute inset-y-0 left-0 rounded-full bg-[rgba(23,23,23,0.45)]" style={{ width: `${product.share}%` }} />
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
