import { cn } from "@/lib/utils";
import { Bike, CircleCheck, Inbox, type LucideIcon, Package, PackageCheck, PackageOpen, Truck } from "lucide-react";
import { MockHeader } from "../../../_components/mocks/mock-parts";

// Quadro de pedidos (app/dashboard/sales/orders, colunas de fulfillment/config.tsx), desenhado a
// 1080px. Os canais são os da marca de canal do app: loja digital e iFood no mesmo quadro.

type TChannel = "LOJA" | "IFOOD";
type TCard = { number: string; client: string; channel: TChannel; mode: "ENTREGA" | "RETIRADA"; total: string; age: string; items: string };

const CHANNEL_TONE: Record<TChannel, { label: string; className: string }> = {
	LOJA: { label: "Loja digital", className: "bg-[#eef2f6] text-[#24549c]" },
	IFOOD: { label: "iFood", className: "bg-[rgba(234,29,44,0.1)] text-[#c8102e]" },
};

const COLUMNS: { label: string; icon: LucideIcon; cards: TCard[] }[] = [
	{
		label: "Não iniciado",
		icon: Inbox,
		cards: [
			{
				number: "#1048",
				client: "Juliana Prado",
				channel: "LOJA",
				mode: "ENTREGA",
				total: "R$ 71,80",
				age: "2min",
				items: "Pote 1L Chocolate Belga, Milkshake 400ml",
			},
			{ number: "#1047", client: "Pedido iFood 7731", channel: "IFOOD", mode: "ENTREGA", total: "R$ 38,00", age: "4min", items: "Gelato 2 bolas, Água" },
		],
	},
	{
		label: "Em preparo",
		icon: PackageOpen,
		cards: [
			{ number: "#1045", client: "Rafael Costa", channel: "LOJA", mode: "RETIRADA", total: "R$ 28,00", age: "11min", items: "Gelato 3 bolas + calda" },
		],
	},
	{
		label: "Pronto",
		icon: PackageCheck,
		cards: [{ number: "#1043", client: "Marina Alves", channel: "LOJA", mode: "RETIRADA", total: "R$ 49,90", age: "18min", items: "Pote 1L Pistache" }],
	},
	{
		label: "Em entrega",
		icon: Truck,
		cards: [
			{ number: "#1041", client: "Carlos Mendes", channel: "LOJA", mode: "ENTREGA", total: "R$ 92,70", age: "26min", items: "2× Pote 1L, Cobertura" },
		],
	},
	{
		label: "Entregue",
		icon: CircleCheck,
		cards: [
			{ number: "#1038", client: "Beatriz Lima", channel: "IFOOD", mode: "ENTREGA", total: "R$ 44,00", age: "41min", items: "Milkshake 400ml, Gelato" },
		],
	},
];

function OrderCard({ card }: { card: TCard }) {
	const channel = CHANNEL_TONE[card.channel];
	const ModeIcon = card.mode === "ENTREGA" ? Bike : Package;
	return (
		<div className="flex flex-col gap-2 rounded-[12px] border border-[#e3e8ea] bg-white p-3 shadow-[0_1px_rgba(0,0,0,0.05)]">
			<div className="flex items-center justify-between gap-2">
				<span className="text-[13px] font-black">{card.number}</span>
				<span className="text-[11px] font-medium text-[#687a80]">{card.age}</span>
			</div>
			<span className="truncate text-[13px] font-semibold">{card.client}</span>
			<span className="line-clamp-2 text-[11px] leading-[1.4] text-[#687a80]">{card.items}</span>
			<div className="flex items-center justify-between gap-2 pt-1">
				<div className="flex items-center gap-1">
					<span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold", channel.className)}>{channel.label}</span>
					<span className="inline-flex size-5 items-center justify-center rounded-full bg-[#f2f4f4] text-[#4b585d]">
						<ModeIcon className="size-3 flex-none" />
					</span>
				</div>
				<span className="text-[12px] font-black">{card.total}</span>
			</div>
		</div>
	);
}

export function OrdersBoardMock() {
	return (
		<div className="flex flex-col gap-4 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-5 text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<MockHeader icon={Inbox} title="Pedidos" description="Pedidos da loja digital e do iFood, do recebimento à entrega." />
			<div className="grid grid-cols-5 gap-3">
				{COLUMNS.map((column) => {
					const Icon = column.icon;
					return (
						<div key={column.label} className="flex min-h-[300px] flex-col gap-2.5 rounded-[14px] bg-[#f7f9f9] p-2.5">
							<div className="flex items-center justify-between px-1">
								<span className="flex items-center gap-1.5 text-[12px] font-bold">
									<Icon className="size-3.5 flex-none text-[#4b585d]" />
									{column.label}
								</span>
								<span className="text-[11px] font-bold text-[#687a80]">{column.cards.length}</span>
							</div>
							{column.cards.map((card) => (
								<OrderCard key={card.number} card={card} />
							))}
						</div>
					);
				})}
			</div>
		</div>
	);
}
