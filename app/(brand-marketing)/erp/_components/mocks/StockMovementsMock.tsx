import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Boxes, Code, MoveRight, Settings2, ShoppingBag, ShoppingCart, UserRound } from "lucide-react";
import { MOCK_CARD, MOCK_WINDOW } from "./mock-parts";

// Movimentações de estoque (inventory/movements StockTransactionRow), desenhada a 760px.

const KIND = {
	venda: { className: "bg-[#f2f4f4] text-[rgba(14,18,20,0.7)]", icon: ShoppingBag, label: "VENDA / SAÍDA" },
	aquisicao: { className: "bg-[rgba(36,84,156,0.1)] text-[#24549c]", icon: ShoppingCart, label: "AQUISIÇÃO" },
	ajuste: { className: "bg-[rgba(255,185,0,0.15)] text-[#8a6400]", icon: Settings2, label: "AJUSTE MANUAL" },
} as const;

const MOVEMENTS: {
	name: string;
	code: string;
	kind: keyof typeof KIND;
	origins: string[];
	who: string;
	when: string;
	before: string;
	after: string;
	direction: "in" | "out";
	qty: string;
}[] = [
	{
		name: "Pote 1L Chocolate Belga",
		code: "PT-001",
		kind: "venda",
		origins: ["Venda · 1284"],
		who: "Ana Souza",
		when: "24/10/2026 14:32",
		before: "9",
		after: "8 un",
		direction: "out",
		qty: "1",
	},
	{
		name: "Leite integral 1L",
		code: "IN-107",
		kind: "aquisicao",
		origins: ["Compra · NF-e 45.877", "Lote · L-1003"],
		who: "Ana Souza",
		when: "24/10/2026 08:20",
		before: "12",
		after: "132 un",
		direction: "in",
		qty: "120",
	},
	{
		name: "Polpa de morango 1kg",
		code: "IN-022",
		kind: "ajuste",
		origins: ["Manual"],
		who: "Carlos Lima",
		when: "23/10/2026 19:05",
		before: "18",
		after: "16 kg",
		direction: "out",
		qty: "2",
	},
];

export function StockMovementsMock() {
	return (
		<div className={cn("flex flex-col gap-2.5", MOCK_WINDOW)}>
			<header className="flex items-center gap-2">
				<Boxes className="size-5 flex-none" />
				<p className="text-[20px] font-black leading-none tracking-[-0.025em]">Movimentações</p>
			</header>
			{MOVEMENTS.map((movement) => {
				const kind = KIND[movement.kind];
				const KindIcon = kind.icon;
				const isIn = movement.direction === "in";
				const MoveIcon = isIn ? ArrowUpRight : ArrowDownRight;
				return (
					<div key={movement.code} className={cn("flex items-center gap-3 p-3", MOCK_CARD)}>
						<div className="flex w-[210px] min-w-0 flex-none items-center gap-3">
							<span className="flex size-11 flex-none items-center justify-center rounded-[10px] bg-[rgba(36,84,156,0.1)] text-[#24549c]">
								<ShoppingCart className="size-4 flex-none" />
							</span>
							<div className="min-w-0">
								<p className="truncate text-[14px] font-bold tracking-[-0.015em]">{movement.name}</p>
								<span className="mt-0.5 inline-flex items-center gap-1 text-[10.4px] font-medium text-[rgba(14,18,20,0.6)]">
									<Code className="size-3 flex-none" />
									{movement.code}
								</span>
							</div>
						</div>
						<div className="flex min-w-0 flex-1 flex-col gap-1.5">
							<div className="flex flex-wrap items-center gap-1.5">
								<span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-bold tracking-[-0.015em]", kind.className)}>
									<KindIcon className="size-3.5 flex-none" />
									{kind.label}
								</span>
								{movement.origins.map((origin) => (
									<span
										key={origin}
										className="inline-flex items-center gap-1 rounded-md bg-[#f2f4f4] px-1.5 py-0.5 text-[10.4px] font-semibold text-[#687a80]"
									>
										{origin}
									</span>
								))}
							</div>
							<div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10.4px] font-medium text-[#687a80]">
								<span className="inline-flex items-center gap-1">
									<UserRound className="size-3 flex-none" />
									{movement.who}
								</span>
								<span>{movement.when}</span>
							</div>
						</div>
						<div className="flex flex-none items-center gap-4">
							<div className="flex flex-col items-end gap-0.5">
								<span className="text-[9.6px] font-semibold tracking-[0.025em] text-[#687a80]">SALDO</span>
								<span className="inline-flex items-center gap-1 text-[12px] font-semibold">
									<span className="text-[#687a80]">{movement.before}</span>
									<MoveRight className="size-3 flex-none text-[rgba(104,122,128,0.6)]" />
									<span>{movement.after}</span>
								</span>
							</div>
							<div className="flex min-w-[76px] flex-col items-end gap-0.5">
								<span className="text-[9.6px] font-semibold tracking-[0.025em] text-[#687a80]">MOVIMENTO</span>
								<span className={cn("inline-flex items-center gap-1 text-[16px] font-bold", isIn ? "text-[#16a34a]" : "text-[#dc2626]")}>
									<MoveIcon className="size-4 flex-none" />
									{isIn ? "+" : "-"}
									{movement.qty}
								</span>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
