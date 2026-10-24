import { cn } from "@/lib/utils";
import {
	BadgePercent,
	Banknote,
	Bell,
	BookText,
	Boxes,
	ChartNoAxesColumnIncreasing,
	ChevronDown,
	ChevronRight,
	Coins,
	HatGlasses,
	House,
	Kanban,
	LayoutGrid,
	List,
	type LucideIcon,
	Minus,
	Package,
	PanelLeft,
	PanelRightOpen,
	Plus,
	ReceiptText,
	ScanBarcode,
	Search,
	ShoppingCart,
	Trash2,
	User,
	UserRound,
	UsersRound,
	UtensilsCrossed,
	Wallet,
	X,
} from "lucide-react";
import { AdjustmentRow, CashbackDiscountBox, MOCK_CARD, SummaryTitle, TotalDock } from "./mock-parts";

// Tela "Nova venda" do PDV (app/dashboard/sales/new), desenhada a 1280px de largura.

type TSideItem = { label: string; icon: LucideIcon; closed?: boolean; sub?: { label: string; icon: LucideIcon; active?: boolean; badge?: string }[] };

const SIDEBAR: { label: string; items: TSideItem[] }[] = [
	{ label: "Geral", items: [{ label: "Dashboard", icon: House }] },
	{
		label: "Vendas",
		items: [
			{
				label: "Vendas",
				icon: ShoppingCart,
				sub: [
					{ label: "Nova venda", icon: ScanBarcode, active: true },
					{ label: "Histórico", icon: ReceiptText },
					{ label: "Resultados", icon: ChartNoAxesColumnIncreasing },
					{ label: "Pedidos", icon: Kanban, badge: "2" },
					{ label: "Caixa", icon: Banknote },
					{ label: "Mesas e comandas", icon: UtensilsCrossed },
				],
			},
		],
	},
	{
		label: "Operação",
		items: [
			{ label: "Compras", icon: ShoppingCart },
			{ label: "Produtos", icon: Package },
			{ label: "Estoque", icon: Boxes, closed: true },
		],
	},
	{
		label: "Relacionamento",
		items: [
			{ label: "Clientes", icon: UsersRound },
			{ label: "Cashback", icon: BadgePercent },
		],
	},
	{
		label: "Gestão",
		items: [
			{ label: "Financeiro", icon: Wallet, closed: true },
			{ label: "Fiscal", icon: BookText },
		],
	},
];

const CATEGORIES = ["Todos os grupos", "Potes", "Gelatos - O Mais Pedido", "Milkshakes", "Açaí", "Picolés", "+3"];

type TProduct = { name: string; code: string; price: string; stock: number | null; from?: boolean; kind?: string };

const PRODUCTS: TProduct[] = [
	{ name: "Pote 1L Chocolate Belga", code: "PT-001", price: "R$ 49,90", stock: 8 },
	{ name: "Pote 1L Pistache", code: "PT-002", price: "R$ 54,90", stock: 23 },
	{ name: "Pote 500ml Morango", code: "PT-014", price: "R$ 29,90", stock: 0 },
	{ name: "Gelato", code: "GL-001", price: "R$ 14,00", stock: null, from: true, kind: "Variações" },
	{ name: "Milkshake 400ml", code: "MK-400", price: "R$ 22,00", stock: 36 },
	{ name: "Açaí 500ml", code: "AC-500", price: "R$ 24,00", stock: null, kind: "Adicionais" },
	{ name: "Picolé de Limão", code: "PC-003", price: "R$ 9,00", stock: 64 },
	{ name: "Casquinha", code: "CS-001", price: "R$ 7,00", stock: 120 },
	{ name: "Affogato", code: "BB-010", price: "R$ 16,00", stock: null },
	{ name: "Sundae Caramelo", code: "SD-002", price: "R$ 19,90", stock: 15 },
	{ name: "Pote 1L Doce de Leite", code: "PT-006", price: "R$ 49,90", stock: 4 },
	{ name: "Paleta de Morango", code: "PC-011", price: "R$ 12,00", stock: 41 },
];

const CART = [
	{ name: "Pote 1L Chocolate Belga", code: "PT-001", qty: 1, total: "R$ 49,90" },
	{ name: "Milkshake 400ml", code: "MK-400", qty: 2, total: "R$ 44,00" },
];

function StockChip({ stock }: { stock: number | null }) {
	if (stock === null) return null;
	const base = "flex-none text-[11px] font-semibold leading-[1.2]";
	if (stock <= 0) return <span className={cn(base, "inline-flex items-center rounded-full bg-[#fdecec] px-1.5 py-0.5 text-[#b42318]")}>Esgotado</span>;
	if (stock <= 10)
		return <span className={cn(base, "inline-flex items-center rounded-full bg-[#fff7e5] px-1.5 py-0.5 text-[#7a5117]")}>{stock} un.</span>;
	return <span className={cn(base, "inline text-[#687a80]")}>{stock} un.</span>;
}

function Sidebar() {
	return (
		<aside className="flex w-[236px] flex-none flex-col gap-1 overflow-hidden border-r border-[#e3e8ea] bg-[#f9fbfb] p-2">
			<div className="flex items-center gap-2 p-2">
				<span className="flex size-8 items-center justify-center rounded-lg bg-[#7a2943] text-[14px] font-extrabold text-white">G</span>
				<span className="min-w-0 flex-1">
					<span className="block text-[14px] font-semibold leading-[1.2]">Gelateria Aurora</span>
					<span className="block text-[12px] text-[#687a80]">Plano Pro</span>
				</span>
				<ChevronDown className="size-3.5 flex-none text-[#687a80]" />
			</div>
			{SIDEBAR.map((group) => (
				<div key={group.label} className="flex flex-col py-1">
					<span className="flex h-8 items-center px-2 text-[12px] font-medium text-[#5b6366]">{group.label}</span>
					{group.items.map((item) => {
						const Icon = item.icon;
						const Chevron = item.sub ? ChevronDown : item.closed ? ChevronRight : null;
						return (
							<div key={item.label} className="flex flex-col">
								<span className="flex h-8 items-center gap-2 rounded-lg px-2 text-[14px] text-[#232a2d]">
									<Icon className="size-4 flex-none" />
									<span className="min-w-0 flex-1 truncate">{item.label}</span>
									{Chevron ? <Chevron className="size-3.5 flex-none text-[#687a80]" /> : null}
								</span>
								{item.sub ? (
									<div className="my-0.5 ml-3.5 flex flex-col gap-px border-l border-[#e3e8ea] pl-2.5">
										{item.sub.map((sub) => {
											const SubIcon = sub.icon;
											return (
												<span
													key={sub.label}
													className={cn(
														"flex h-7 items-center gap-2 rounded-lg px-2 text-[14px] text-[#232a2d]",
														sub.active && "bg-[#eef1f2] font-medium text-[#0e1214]",
													)}
												>
													<SubIcon className="size-4 flex-none" />
													<span className="flex-1">{sub.label}</span>
													{sub.badge ? (
														<span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-[#24549c] px-[5px] text-[10px] font-bold text-white">
															{sub.badge}
														</span>
													) : null}
												</span>
											);
										})}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			))}
		</aside>
	);
}

function ProductGrid() {
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-hidden">
			<div className="flex gap-2">
				<div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-[#e3e8ea] px-3 text-[14px] text-[#687a80] shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
					<Search className="size-4 flex-none" />
					Buscar por nome, código ou código de barras...
				</div>
				<div className="flex gap-0.5 rounded-full border border-[#e3e8ea] p-[3px]">
					<span className="flex h-7 w-[30px] items-center justify-center rounded-full bg-[#24549c] text-white">
						<LayoutGrid className="size-3.5" />
					</span>
					<span className="flex h-7 w-[30px] items-center justify-center rounded-full text-[#687a80]">
						<List className="size-3.5" />
					</span>
				</div>
			</div>
			<div className="flex h-9 items-center gap-1.5 overflow-hidden">
				{CATEGORIES.map((category, index) => (
					<span
						key={category}
						className={cn(
							"inline-flex h-9 flex-none items-center whitespace-nowrap rounded-full px-3 text-[12px] font-bold",
							index === 0 ? "bg-[#ffb900] text-black shadow-[0_1px_3px_rgba(0,0,0,0.1)]" : "border border-[#e3e8ea] bg-[#f7f9f9] text-[#0e1214]",
							index === CATEGORIES.length - 1 && "ml-auto",
						)}
					>
						{category}
					</span>
				))}
			</div>
			<div className="grid grid-cols-4 gap-2">
				{PRODUCTS.map((product) => (
					<div key={product.code} className={cn("relative flex flex-col overflow-hidden", MOCK_CARD)}>
						<div className="relative flex aspect-[4/3] items-center justify-center bg-[#fafafa] text-[#c3cacd]">
							<Package className="size-10 flex-none" />
							{product.kind ? (
								<span className="absolute top-1.5 left-1.5 inline-flex items-center rounded-full border border-[#e3e8ea] bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-[#0e1214]">
									{product.kind}
								</span>
							) : null}
						</div>
						<div className="flex flex-1 flex-col gap-1.5 p-2.5">
							<div className="flex flex-col gap-0.5">
								<span className="min-h-9 text-[14px] font-bold leading-[1.25] tracking-[-0.015em] text-[#0e1214]">{product.name}</span>
								<span className="text-[11px] font-semibold leading-[1.2] text-[#687a80]">{product.code}</span>
							</div>
							<div className="mt-auto flex items-end justify-between gap-2">
								<div className="min-w-0">
									{product.from ? <span className="block text-[11px] font-semibold text-[#687a80]">A partir de</span> : null}
									<span className="block text-[14px] font-extrabold leading-[1.25]">{product.price}</span>
								</div>
								<StockChip stock={product.stock} />
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function Checkout() {
	const stepButton = "flex size-7 items-center justify-center rounded-[10px] border border-[#e3e8ea] bg-[#f7f9f9]";
	return (
		<div className="relative flex w-[400px] flex-none flex-col gap-3 overflow-hidden">
			<div className="flex items-center gap-2">
				<span className="flex rounded-[10px] bg-[rgba(36,84,156,0.1)] p-2">
					<ShoppingCart className="size-5 flex-none" />
				</span>
				<div>
					<p className="m-0 text-[18px] font-black leading-[1.2]">CHECKOUT</p>
					<p className="m-0 text-[12px] text-[#687a80]">4 ITENS</p>
				</div>
			</div>

			<div className={cn("flex flex-col gap-3 p-3", MOCK_CARD)}>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1.5">
						<UserRound className="size-4 flex-none" />
						<span className="text-[12px] font-bold tracking-[0.025em]">CLIENTE</span>
					</div>
					<div className="flex gap-1">
						<span className="inline-flex items-center gap-1.5 rounded-[10px] px-2 py-1 text-[12px] font-medium">
							<HatGlasses className="size-3 flex-none" />
							AO CONSUMIDOR
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#ffb900] px-2 py-1 text-[12px] font-medium text-black shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
							<User className="size-3 flex-none" />
							VINCULAR
						</span>
					</div>
				</div>
				<div className="flex flex-col gap-2 rounded-[10px] bg-[rgba(36,84,156,0.1)] px-2.5 py-2">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							<div className="flex items-center gap-1.5">
								<span className="text-[14px] font-semibold leading-none">Maria Silva</span>
								<span className="rounded-full border border-[#bbf7d0] bg-[#dcfce7] px-2 py-0.5 text-[10px] font-extrabold uppercase leading-none tracking-[0.025em] text-[#15803d]">
									Campeões
								</span>
							</div>
							<p className="m-0 mt-0.5 text-[12px] text-[#687a80]">(34) 98888-7777</p>
						</div>
						<div className="flex gap-1 text-[#0e1214]">
							<span className="flex size-6 items-center justify-center">
								<PanelRightOpen className="size-3.5 flex-none" />
							</span>
							<span className="flex size-6 items-center justify-center">
								<X className="size-3 flex-none" />
							</span>
						</div>
					</div>
					<div className="grid grid-cols-3 gap-2 border-t border-[rgba(36,84,156,0.2)] pt-2">
						<div className="flex flex-col gap-0.5">
							<span className="whitespace-nowrap text-[10px] font-extrabold leading-none tracking-[0.025em] text-[#687a80]">TOTAL COMPRADO</span>
							<span className="text-[14px] font-extrabold">R$ 1.284,50</span>
						</div>
						<div className="flex flex-col gap-0.5">
							<span className="text-[10px] font-extrabold leading-none tracking-[0.025em] text-[#687a80]">COMPRAS</span>
							<span className="text-[14px] font-extrabold">27</span>
						</div>
						<div className="flex flex-col gap-0.5">
							<span className="text-[10px] font-extrabold leading-none tracking-[0.025em] text-[#687a80]">CASHBACK</span>
							<span className="flex items-center gap-1 text-[14px] font-extrabold">
								<Coins className="size-3 flex-none text-[#ffb900]" />
								R$ 26,00
							</span>
						</div>
					</div>
				</div>
			</div>

			{CART.map((item) => (
				<div key={item.code} className="flex flex-col gap-2 rounded-[14px] border border-[#e3e8ea] bg-white p-3">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0 flex-1">
							<p className="m-0 text-[14px] font-bold leading-[1.25]">{item.name}</p>
							<p className="m-0 text-[12px] text-[#687a80]">{item.code}</p>
						</div>
						<span className="flex size-8 items-center justify-center text-[#e5252a]">
							<Trash2 className="size-4 flex-none" />
						</span>
					</div>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span className={cn(stepButton, item.qty <= 1 && "opacity-50")}>
								<Minus className="size-3 flex-none" />
							</span>
							<span className="w-8 text-center text-[14px] font-bold">{item.qty}</span>
							<span className={stepButton}>
								<Plus className="size-3 flex-none" />
							</span>
						</div>
						<span className="text-[16px] font-black">{item.total}</span>
					</div>
				</div>
			))}

			<div className={cn("flex flex-col gap-2 p-3", MOCK_CARD)}>
				<SummaryTitle />
				<div className="flex justify-between text-[14px]">
					<span className="text-[#687a80]">Subtotal itens</span>
					<span>R$ 111,90</span>
				</div>
				<CashbackDiscountBox />
				<AdjustmentRow tone="red" label="OUTROS DESCONTOS" />
			</div>

			<TotalDock className="absolute inset-x-0 bottom-3" />
		</div>
	);
}

export function PosScreenMock() {
	return (
		<div className="overflow-hidden rounded-t-[14px] border border-b-0 border-[rgba(14,18,20,0.08)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<div className="flex h-10 items-center gap-4 border-b border-[#e3e8ea] bg-[#f7f8f9] px-3.5">
				<div className="flex gap-1.5">
					<span className="size-2.5 rounded-[5px] bg-[#dfe3e5]" />
					<span className="size-2.5 rounded-[5px] bg-[#dfe3e5]" />
					<span className="size-2.5 rounded-[5px] bg-[#dfe3e5]" />
				</div>
				<div className="flex flex-1 justify-center">
					<span className="inline-flex h-6 min-w-[380px] items-center justify-center rounded-[7px] border border-[#e3e8ea] bg-white px-3.5 text-[12px] text-[#687a80]">
						app.recompracrm.com.br/dashboard/sales/new
					</span>
				</div>
				<div className="w-[46px]" />
			</div>
			<div className="flex h-[740px]">
				<Sidebar />
				<div className="flex min-w-0 flex-1 flex-col gap-3.5 px-5 pt-4">
					<header className="flex flex-col gap-0.5">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<span className="flex size-7 items-center justify-center rounded-lg">
									<PanelLeft className="size-4 flex-none" />
								</span>
								<ScanBarcode className="size-5 flex-none" />
								<p className="m-0 text-[20px] font-black leading-none tracking-[-0.025em]">Nova venda</p>
							</div>
							<div className="flex items-center gap-1.5">
								<span className="inline-flex h-8 items-center gap-2 rounded-full border border-[#e3e8ea] px-2.5 text-[12px] text-[#687a80]">
									<Search className="size-3.5 flex-none" />
									Buscar
									<span className="rounded bg-[#f2f4f4] px-[5px] py-px text-[11px]">⌘K</span>
								</span>
								<span className="flex size-8 items-center justify-center rounded-full text-[#0e1214]">
									<Bell className="size-4 flex-none" />
								</span>
								<span className="flex size-[30px] items-center justify-center rounded-full bg-[#e9eef5] text-[12px] font-bold text-[#24549c]">AS</span>
							</div>
						</div>
						<p className="m-0 pl-2 text-[12px] leading-[1.25] text-[#687a80]">Registre vendas no balcão com cliente, cashback e nota fiscal.</p>
					</header>
					<div className="flex min-h-0 flex-1 gap-4">
						<ProductGrid />
						<Checkout />
					</div>
				</div>
			</div>
		</div>
	);
}
