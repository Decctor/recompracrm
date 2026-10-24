import { cn } from "@/lib/utils";
import { Bell, Pencil, Plus, UtensilsCrossed } from "lucide-react";
import { MockHeader } from "./mock-parts";

// Quadro de mesas e comandas (sales/service-accounts BoardCards), desenhado a 980px.

type TUrgency = "ok" | "atencao" | "atrasado";

const TILE_TONE: Record<TUrgency, string> = {
	ok: "border-[#e3e8ea] bg-white",
	atencao: "border-transparent bg-[#fff7e5]",
	atrasado: "border-transparent bg-[rgba(229,37,42,0.1)]",
};
const STATUS_TONE: Record<TUrgency, string> = {
	ok: "text-[#687a80]",
	atencao: "text-[#7a5117]",
	atrasado: "text-[#e5252a]",
};

type TTile =
	| { label: string; free: true; capacity: string }
	| { label: string; free?: false; total: string; urgency: TUrgency; rows: { who: string; age: string; status: string; tint?: TUrgency }[] };

const TILES: TTile[] = [
	{ label: "Mesa 01", total: "R$ 132,50", urgency: "ok", rows: [{ who: "Comanda 12", age: "48min", status: "Pedido 2 em preparo · 14min" }] },
	{ label: "Mesa 02", free: true, capacity: "4 lugares" },
	{
		label: "Mesa 03",
		total: "R$ 64,00",
		urgency: "atencao",
		rows: [{ who: "Juliana Prado", age: "9min", status: "Pedido 1 na fila · 8min", tint: "atencao" }],
	},
	{
		label: "Mesa 04",
		total: "R$ 218,40",
		urgency: "atrasado",
		rows: [
			{ who: "Comanda 07", age: "1h12", status: "Pedido 3 pronto · 12min", tint: "atrasado" },
			{ who: "Comanda 08", age: "1h05", status: "Nada em aberto" },
		],
	},
	{ label: "Mesa 05", free: true, capacity: "2 lugares" },
	{ label: "Mesa 06", total: "R$ 86,00", urgency: "ok", rows: [{ who: "Rafael Costa", age: "35min", status: "Nada em aberto" }] },
	{ label: "Mesa 07", free: true, capacity: "6 lugares" },
	{ label: "Mesa 08", total: "R$ 39,90", urgency: "ok", rows: [{ who: "Comanda 21", age: "6min", status: "Pedido 1 em entrega · 3min" }] },
];

function EditButton() {
	return (
		<span className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center text-[rgba(104,122,128,0.5)]">
			<Pencil className="size-3.5 flex-none" />
		</span>
	);
}

export function TablesBoardMock() {
	const filter = "inline-flex h-8 items-center rounded-full px-3 text-[12px] font-bold";
	return (
		<div className="flex flex-col gap-4 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-5 shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<MockHeader
				icon={UtensilsCrossed}
				title="Mesas e comandas"
				description="Contas abertas por mesa, comanda ou cliente."
				action={
					<span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#24549c] px-3 text-[14px] font-medium text-[#f5f9fd]">
						<Bell className="size-4 flex-none" />2 PEDIDOS
					</span>
				}
			/>
			<div className="flex items-center gap-1.5">
				<span className={cn(filter, "bg-[#ffb900] text-black")}>POR MESA</span>
				<span className={cn(filter, "border border-[#e3e8ea] bg-[#f7f9f9]")}>POR CONTA</span>
				<span className={cn(filter, "border border-[#e3e8ea] bg-[#f7f9f9]")}>POR COMANDA</span>
				<span className="ml-auto text-[12px] font-semibold text-[#687a80]">5 contas abertas · R$ 540,80 em consumo</span>
			</div>
			<div className="grid grid-cols-4 items-start gap-2">
				{TILES.map((tile) =>
					tile.free ? (
						<div
							key={tile.label}
							className="relative flex min-h-24 flex-col items-start justify-between gap-3 rounded-[14px] border border-dashed border-[#d5dcdf] px-3.5 py-3"
						>
							<span className="pr-6 text-[14px] font-bold text-[rgba(14,18,20,0.8)]">{tile.label}</span>
							<span className="flex w-full items-center justify-between text-[12px] text-[#687a80]">
								<span className="flex items-center gap-1.5">
									<span className="size-1.5 rounded-[3px] bg-[#16a34a]" />
									{tile.capacity}
								</span>
								<span className="flex items-center gap-0.5 font-bold text-[#24549c]">
									<Plus className="size-3.5 flex-none" />
									Abrir
								</span>
							</span>
							<EditButton />
						</div>
					) : (
						<div key={tile.label} className={cn("relative flex min-h-24 flex-col gap-2 rounded-[14px] border p-3", TILE_TONE[tile.urgency])}>
							<div className="flex items-baseline justify-between gap-1.5 pr-7 pl-0.5">
								<span className="text-[14px] font-bold">{tile.label}</span>
								<span className="text-[14px] font-bold">{tile.total}</span>
							</div>
							<div className="flex flex-col gap-1.5">
								{tile.rows.map((row) => (
									<div key={row.who} className="flex flex-col gap-0.5 rounded-[10px] bg-white/70 px-2.5 py-1.5">
										<span className="flex justify-between gap-1.5 text-[12px] font-bold">
											<span>{row.who}</span>
											<span className="text-[#687a80]">{row.age}</span>
										</span>
										<span className={cn("truncate text-[12px] font-bold", STATUS_TONE[row.tint ?? "ok"])}>{row.status}</span>
									</div>
								))}
							</div>
							<EditButton />
						</div>
					),
				)}
			</div>
		</div>
	);
}
