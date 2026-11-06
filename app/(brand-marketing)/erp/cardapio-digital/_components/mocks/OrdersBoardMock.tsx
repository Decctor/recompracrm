import { cn } from "@/lib/utils";
import IfoodLogo from "@/utils/images/integrations/ifood-logo.png";
import {
	ChevronLeft,
	CircleCheck,
	CircleUser,
	Clock,
	Eye,
	File,
	GripVertical,
	Inbox,
	type LucideIcon,
	Maximize2,
	MoveRight,
	Package,
	PackageCheck,
	PackageOpen,
	PencilLine,
	QrCode,
	RefreshCw,
	Truck,
	Banknote,
} from "lucide-react";
import Image from "next/image";

// Quadro de pedidos (app/dashboard/sales/orders) 1:1 com o app: as quatro etapas do fluxo em colunas
// de 300px (fulfillment-column.tsx), o card do pedido (fulfillment-card.tsx + CardQuickActions) e a
// trilha "Concluídos" de 252px (delivered-buffer.tsx), que não é coluna de trabalho. Desenhado a
// 1560px, para as quatro colunas, a trilha e os vãos caberem sem recorte. Pedido da loja digital não
// leva pílula de origem; só o iFood.

type TPayment = { method: "PIX" | "DINHEIRO"; value: string };
type TCard = {
	id: string;
	client: string;
	phone: string;
	total: string;
	confirmed: string;
	age: string;
	ifood?: boolean;
	mode: "ENTREGA" | "RETIRADA";
	payment?: TPayment;
	financialBadge?: string;
	fiscal: string;
	notes?: string;
};

const PAYMENT_ICON: Record<TPayment["method"], LucideIcon> = { PIX: QrCode, DINHEIRO: Banknote };
const MODE_META: Record<TCard["mode"], { label: string; icon: LucideIcon }> = {
	ENTREGA: { label: "Entrega", icon: Truck },
	RETIRADA: { label: "Retirada", icon: Package },
};

const COLUMNS: { label: string; icon: LucideIcon; cards: TCard[] }[] = [
	{
		label: "Não iniciado",
		icon: Inbox,
		cards: [
			{
				id: "1048",
				client: "Juliana Prado",
				phone: "(34) 99812-4410",
				total: "R$ 71,80",
				confirmed: "hoje 19:42",
				age: "há 4 min",
				mode: "ENTREGA",
				payment: { method: "PIX", value: "R$ 71,80" },
				fiscal: "Sem nota",
			},
			{
				id: "7731",
				client: "Beatriz Lima",
				phone: "(34) 99104-2287",
				total: "R$ 38,00",
				confirmed: "hoje 19:39",
				age: "há 7 min",
				ifood: true,
				mode: "ENTREGA",
				financialBadge: "A receber",
				fiscal: "Sem nota",
			},
		],
	},
	{
		label: "Em preparo",
		icon: PackageOpen,
		cards: [
			{
				id: "1045",
				client: "Rafael Costa",
				phone: "(34) 99730-1152",
				total: "R$ 28,00",
				confirmed: "hoje 19:31",
				age: "há 15 min",
				mode: "RETIRADA",
				payment: { method: "DINHEIRO", value: "R$ 28,00" },
				fiscal: "Sem nota",
			},
		],
	},
	{
		label: "Pronto",
		icon: PackageCheck,
		cards: [
			{
				id: "1043",
				client: "Marina Alves",
				phone: "(34) 98845-0937",
				total: "R$ 49,90",
				confirmed: "hoje 19:20",
				age: "há 26 min",
				mode: "RETIRADA",
				payment: { method: "PIX", value: "R$ 49,90" },
				fiscal: "Sem nota",
			},
		],
	},
	{
		label: "Em entrega",
		icon: Truck,
		cards: [
			{
				id: "1041",
				client: "Carlos Mendes",
				phone: "(34) 99267-5581",
				total: "R$ 92,70",
				confirmed: "hoje 19:08",
				age: "há 38 min",
				mode: "ENTREGA",
				payment: { method: "PIX", value: "R$ 92,70" },
				fiscal: "Sem nota",
				notes: "Interfone 12, bloco B",
			},
		],
	},
];

const DELIVERED = [
	{ client: "Fernanda Rocha", total: "R$ 64,80", at: "19:02", mode: "Entrega" },
	{ client: "Lucas Martins", total: "R$ 22,00", at: "18:47", mode: "Retirada" },
	{ client: "Paula Nogueira", total: "R$ 104,40", at: "18:31", mode: "Entrega" },
	{ client: "André Siqueira", total: "R$ 36,90", at: "18:12", mode: "Retirada" },
];

const COUNT_BADGE = "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f2f4f4] px-1.5 text-[11px] font-bold text-[#0e1214]";
const CHIP = "inline-flex h-7 max-w-full items-center gap-1.5 truncate rounded-md px-2 text-[11px] font-semibold uppercase tracking-tight";

function QuickRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex min-h-7 items-center justify-between gap-3">
			<span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-[#687a80]">{label}</span>
			<div className="flex min-w-0 items-center justify-end">{children}</div>
		</div>
	);
}

function OrderCard({ card }: { card: TCard }) {
	const mode = MODE_META[card.mode];
	const PaymentIcon = card.payment ? PAYMENT_ICON[card.payment.method] : null;
	return (
		<div className="flex flex-col gap-2 rounded-xl border border-[#e3e8ea] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
			<div className="flex items-start gap-1.5">
				<GripVertical className="mt-0.5 size-4 flex-none text-[rgba(104,122,128,0.5)]" />
				<div className="flex min-w-0 grow flex-col gap-0.5">
					<div className="flex min-w-0 items-center gap-1.5">
						<CircleUser className="size-3.5 flex-none text-[rgba(14,18,20,0.6)]" />
						<span className="truncate text-[14px] font-bold tracking-tight">{card.client}</span>
						{card.ifood ? (
							<span className="inline-flex min-w-0 max-w-[8.5rem] items-center gap-1.5 rounded-full border border-[rgba(227,232,234,0.6)] bg-[rgba(242,244,244,0.7)] px-2 py-0.5 text-[10.4px] font-semibold leading-4 text-[rgba(14,18,20,0.8)]">
								<span className="inline-flex h-4 w-5 flex-none items-center justify-center">
									<Image src={IfoodLogo} alt="" width={24} height={16} className="h-3.5 w-5 object-contain" />
								</span>
								<span className="truncate">iFood</span>
							</span>
						) : null}
					</div>
					<span className="truncate text-[11px] text-[#687a80]">#{card.id}</span>
				</div>
				<div className="flex flex-none items-center gap-0.5 text-[rgba(104,122,128,0.6)]">
					{card.ifood ? null : (
						<span className="p-1">
							<PencilLine className="size-4" />
						</span>
					)}
					<span className="p-1">
						<Eye className="size-4" />
					</span>
					<span className="p-1">
						<MoveRight className="size-4" />
					</span>
				</div>
			</div>

			<div className="flex items-center justify-between gap-2 pl-5">
				<span className="truncate text-[11px] text-[#687a80]">{card.phone}</span>
				<span className="flex-none text-[14px] font-bold">{card.total}</span>
			</div>

			<div className="flex flex-col gap-1.5 border-t border-[rgba(227,232,234,0.6)] pt-2">
				{card.payment && PaymentIcon ? (
					<QuickRow label="Pagamento">
						<span className={cn(CHIP, "border border-[rgba(227,232,234,0.6)] bg-[rgba(242,244,244,0.3)]")}>
							<PaymentIcon className="size-4 flex-none" />
							<span className="truncate">{card.payment.method}</span>
							<span className="flex-none text-[#687a80]">{card.payment.value}</span>
						</span>
					</QuickRow>
				) : null}
				<QuickRow label="Modalidade">
					<span className="inline-flex h-7 items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-tight">
						<mode.icon className="size-3 flex-none" />
						{mode.label}
					</span>
				</QuickRow>
				<QuickRow label="Nota fiscal">
					<span className={cn(CHIP, "border border-[rgba(227,232,234,0.6)] bg-[rgba(242,244,244,0.3)] text-[#687a80]")}>
						<File className="size-3 flex-none" />
						<span className="truncate">{card.fiscal}</span>
					</span>
				</QuickRow>
				{card.notes ? (
					<div className="flex flex-col gap-1">
						<span className="text-[10px] font-bold uppercase tracking-wide text-[#687a80]">Observações</span>
						<p className="rounded-md border border-[rgba(227,232,234,0.6)] bg-[rgba(242,244,244,0.2)] px-2 py-1.5 text-[11px] leading-snug text-[rgba(14,18,20,0.85)]">
							{card.notes}
						</p>
					</div>
				) : null}
			</div>

			{card.financialBadge ? (
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="inline-flex items-center gap-1.5 rounded-full border border-[#e3e8ea] bg-[#f2f4f4] px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight">
						<Package className="size-3" />
						{card.financialBadge}
					</span>
				</div>
			) : null}

			<div className="flex flex-wrap items-center gap-x-1.5 text-[11px] leading-tight text-[#687a80]">
				<Clock className="size-3 flex-none" />
				<span className="font-semibold text-[rgba(14,18,20,0.75)]">Confirmada {card.confirmed}</span>
				<span className="text-[rgba(104,122,128,0.7)]">({card.age})</span>
			</div>
		</div>
	);
}

export function OrdersBoardMock() {
	const inService = COLUMNS.reduce((sum, column) => sum + column.cards.length, 0);
	return (
		<div className="flex flex-col gap-3 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-5 text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<div className="flex items-center justify-between gap-2">
				<p className="text-[12px] text-[#687a80]">{inService} pedido(s) em atendimento</p>
				<span className="flex size-9 items-center justify-center text-[#0e1214]">
					<RefreshCw className="size-4" />
				</span>
			</div>
			<div className="flex h-[540px] gap-3">
				{COLUMNS.map((column) => (
					<div key={column.label} className="flex w-[300px] flex-none flex-col gap-2">
						<div className="flex items-center gap-1.5 px-1.5">
							<column.icon className="size-4 flex-none text-[#687a80]" />
							<span className="truncate text-[12px] font-extrabold uppercase tracking-wide">{column.label}</span>
							<span className={cn(COUNT_BADGE, "ml-auto")}>{column.cards.length}</span>
							<span className="flex items-center gap-0.5 text-[#687a80] opacity-60">
								<span className="p-1">
									<Maximize2 className="size-3.5" />
								</span>
								<span className="p-1">
									<ChevronLeft className="size-4" />
								</span>
							</span>
						</div>
						<div className="flex grow flex-col gap-2 overflow-hidden rounded-xl border border-dashed border-[rgba(227,232,234,0.6)] p-1.5">
							{column.cards.map((card) => (
								<OrderCard key={card.id} card={card} />
							))}
						</div>
					</div>
				))}
				<div className="flex-1" />
				<section className="flex w-[252px] flex-none flex-col gap-2 border-l border-[#e3e8ea] pl-3">
					<div className="flex items-baseline gap-1.5 px-1.5">
						<CircleCheck className="size-3.5 flex-none self-center text-[#687a80]" />
						<span className="truncate text-[12px] font-extrabold uppercase tracking-wide text-[#687a80]">Concluídos</span>
						<span className="ml-auto flex-none text-[10px] text-[rgba(104,122,128,0.7)]">últimas 2h</span>
					</div>
					<div className="flex grow flex-col divide-y divide-[rgba(227,232,234,0.5)] rounded-xl bg-[rgba(242,244,244,0.4)] p-1">
						{DELIVERED.map((row) => (
							<div key={row.client} className="flex flex-col gap-0.5 rounded-md px-2 py-1.5">
								<span className="flex items-baseline gap-2">
									<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[rgba(14,18,20,0.9)]">{row.client}</span>
									<span className="flex-none text-[12px] font-bold tracking-tight">{row.total}</span>
								</span>
								<span className="flex items-center gap-1.5 text-[10px] text-[#687a80]">
									<span>{row.at}</span>
									<span className="text-[rgba(104,122,128,0.4)]">·</span>
									<span className="truncate">{row.mode}</span>
								</span>
							</div>
						))}
					</div>
				</section>
			</div>
		</div>
	);
}
