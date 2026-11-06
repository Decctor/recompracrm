import { cn } from "@/lib/utils";
import { AlertTriangle, CalendarClock, CheckCheck, Factory, PackageX, Printer, ShoppingCart, Trash2 } from "lucide-react";

// Lotes (app/dashboard/inventory/lots/lots-page.tsx), desenhado a 820px: busca, filtros de status e
// o StockLotCard com saldo, validade, produção e compra de origem. A validade fica amarela com até 7
// dias e vermelha no lote vencido, que ganha o aviso de retirada.

const FILTERS = ["TODOS", "ATIVOS", "VENCENDO EM 7 DIAS", "VENCIDOS", "ESGOTADOS", "DESCARTADOS"];

type TLot = {
	product: string;
	lot: string;
	code: string;
	status: "ATIVO" | "VENCIDO";
	balance: string;
	validity: string;
	validityTone: "muted" | "soon" | "expired";
	production: string;
	purchase: string;
};

const LOTS: TLot[] = [
	{
		product: "Pote 1L Pistache",
		lot: "PRD-2611-03",
		code: "PT-004",
		status: "ATIVO",
		balance: "18 / 24",
		validity: "05/02/2027",
		validityTone: "muted",
		production: "Produção 05/11 · Pistache",
		purchase: "SEM COMPRA",
	},
	{
		product: "Creme de leite 1L",
		lot: "L2610-118",
		code: "IN-108",
		status: "ATIVO",
		balance: "8 / 24",
		validity: "11/11/2026",
		validityTone: "soon",
		production: "SEM PRODUÇÃO",
		purchase: "Laticínios Serra Azul · NF 45877",
	},
	{
		product: "Leite integral 1L",
		lot: "L2609-042",
		code: "IN-107",
		status: "VENCIDO",
		balance: "4 / 120",
		validity: "02/11/2026",
		validityTone: "expired",
		production: "SEM PRODUÇÃO",
		purchase: "Laticínios Serra Azul · NF 44102",
	},
];

const STATUS = {
	ATIVO: { className: "bg-[#bbf7d0] text-[#16a34a]", icon: CheckCheck },
	VENCIDO: { className: "bg-[#fecaca] text-[#dc2626]", icon: AlertTriangle },
} as const;

const VALIDITY_TONE = { muted: "text-[#687a80]", soon: "text-[#a16207]", expired: "text-[#e5252a]" } as const;
const META = "text-[10.4px] font-medium uppercase tracking-tight text-[#687a80]";

export function StockLotsMock() {
	return (
		<div className="flex flex-col gap-3 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-5 text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<div className="flex h-9 items-center rounded-xl border border-[#e3e8ea] px-3 text-[14px] text-[#8a979c]">Pesquisar lote...</div>
			<div className="flex flex-wrap gap-1.5">
				{FILTERS.map((filter) => (
					<span
						key={filter}
						className={cn("rounded-lg px-2 py-1 text-[12px] font-medium", filter === "TODOS" ? "bg-[#0e1214] text-white" : "text-[#0e1214]")}
					>
						{filter}
					</span>
				))}
			</div>
			<p className="text-[12px] text-[#687a80]">3 lotes encontrados.</p>
			{LOTS.map((lot) => {
				const status = STATUS[lot.status];
				return (
					<div key={lot.lot} className="flex flex-col gap-1.5 rounded-xl border border-[#e3e8ea] bg-white px-3 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
						<div className="flex items-center justify-between gap-2">
							<div className="min-w-0">
								<p className="text-[14px] font-bold tracking-tight">{lot.product}</p>
								<p className="text-[10.4px] text-[#687a80]">
									Lote {lot.lot} · Código {lot.code}
								</p>
							</div>
							<span className={cn("flex flex-none items-center gap-1.5 rounded-lg px-2 py-1", status.className)}>
								<status.icon className="size-4" />
								<span className="text-[12px] font-medium uppercase tracking-tight">{lot.status}</span>
							</span>
						</div>
						<div className="flex items-center justify-between gap-2">
							<div className="flex flex-wrap items-center gap-2">
								<span className="flex items-center gap-1">
									<PackageX className="size-4" />
									<span className={META}>SALDO: {lot.balance}</span>
								</span>
								<span className="flex items-center gap-1">
									<CalendarClock className={cn("size-4", VALIDITY_TONE[lot.validityTone])} />
									<span className={cn("text-[10.4px] font-medium uppercase tracking-tight", VALIDITY_TONE[lot.validityTone])}>VALIDADE: {lot.validity}</span>
								</span>
								<span className="flex items-center gap-1">
									<Factory className="size-4" />
									<span className={META}>PRODUÇÃO: {lot.production}</span>
								</span>
								<span className="flex items-center gap-1">
									<ShoppingCart className="size-4" />
									<span className={META}>COMPRA: {lot.purchase}</span>
								</span>
							</div>
							<div className="flex flex-none items-center gap-2">
								<span className="inline-flex h-7 items-center gap-1.5 px-2 text-[12px] font-medium">
									<Printer className="size-4" />
									IMPRIMIR
								</span>
								<span className="inline-flex h-7 items-center gap-1.5 px-2 text-[12px] font-medium text-[#e5252a]">
									<Trash2 className="size-4" />
									DESCARTAR
								</span>
							</div>
						</div>
						{lot.status === "VENCIDO" ? (
							<div className="flex items-start gap-2 rounded-xl border border-[rgba(229,37,42,0.2)] bg-[rgba(229,37,42,0.05)] px-3 py-2 text-[12px] text-[#e5252a]">
								<AlertTriangle className="mt-0.5 size-4 flex-none" />
								<span>Este lote está vencido e deve ser retirado do fluxo de consumo.</span>
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
