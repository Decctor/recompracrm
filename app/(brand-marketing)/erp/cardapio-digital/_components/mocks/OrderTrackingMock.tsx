import { cn } from "@/lib/utils";
import { Bike, ChefHat, House, MessageCircle, Package, PackageCheck, Receipt, ShoppingBag } from "lucide-react";
import Image from "next/image";
import { getMockProductPhoto, mockProductPhotoSrc } from "../../../_components/mocks/product-photos";

// Página de acompanhamento do pedido (app/shop/[slug]/pedidos/[token]) num celular, desenhada a
// 410px. Etapas e textos copiados de public-order-page.tsx; cores da Gelateria Aurora, a mesma
// loja do ShopPhoneMock.

const BRAND = "#7a2943";

const STAGES = [
	{ label: "Recebido", icon: Receipt },
	{ label: "Em preparo", icon: ChefHat },
	{ label: "Pronto", icon: PackageCheck },
	{ label: "A caminho", icon: Bike },
	{ label: "Entregue", icon: House },
];
const CURRENT = 1;

const ITEMS = [
	{ photo: "pote-chocolate-belga", name: "Pote 1L Chocolate Belga", unit: "R$ 49,90", total: "R$ 49,90" },
	{ photo: "milkshake", name: "Milkshake 400ml", unit: "R$ 22,00", total: "R$ 22,00" },
];

// Foto do item como na página real (size-16, object-cover); sem a foto baixada, o ícone de produto.
function ItemPhoto({ slug }: { slug: string }) {
	const src = mockProductPhotoSrc(slug, "square");
	if (!src) {
		return (
			<div className="flex size-16 flex-none items-center justify-center rounded-xl border border-[#e3e8ea] bg-[#f2f4f4] text-[#687a80]">
				<Package className="size-7" />
			</div>
		);
	}
	return (
		<div className="relative size-16 flex-none overflow-hidden rounded-xl border border-[#e3e8ea] bg-[#f2f4f4]">
			<Image src={src} alt={getMockProductPhoto(slug)?.alt ?? ""} fill sizes="64px" className="object-cover" />
		</div>
	);
}

export function OrderTrackingMock() {
	return (
		<div className="rounded-[48px] border-[10px] border-[#0e1214] bg-[#0e1214] text-[#0e1214] shadow-[0_40px_80px_-40px_rgba(16,24,40,0.6)]">
			<div className="relative h-[760px] overflow-hidden rounded-[38px] bg-[#f7f9f9]">
				<div className="flex items-center gap-3 px-5 pt-10 pb-5 text-white" style={{ backgroundColor: BRAND }}>
					<span className="flex size-10 flex-none items-center justify-center rounded-[20px] border-2 border-white bg-[#ffb900] text-[16px] font-black text-black">
						G
					</span>
					<div className="min-w-0">
						<p className="truncate text-[15px] font-black">Gelateria Aurora</p>
						<p className="text-[12px] text-white/70">Acompanhamento do pedido</p>
					</div>
				</div>

				<div className="flex flex-col gap-3 p-3">
					<div className="rounded-2xl bg-white p-4 shadow-[0_1px_rgba(0,0,0,0.05)]">
						<p className="text-[11px] font-extrabold tracking-[0.08em] text-[#687a80] uppercase">Pedido #1048</p>
						<p className="mt-1 text-[20px] font-black">Em preparo</p>
						<p className="mt-1 text-[13px] leading-[1.5] text-[#687a80]">Seu pedido está sendo preparado.</p>
						<ol className="mt-4 grid list-none grid-cols-5 gap-1 p-0">
							{STAGES.map((stage, index) => {
								const Icon = stage.icon;
								const reached = index <= CURRENT;
								return (
									<li key={stage.label} className="flex flex-col items-center gap-1.5 text-center">
										<span
											className={cn("flex size-9 items-center justify-center rounded-full", reached ? "text-white" : "bg-[#f2f4f4] text-[#8a979c]")}
											style={reached ? { backgroundColor: BRAND } : undefined}
										>
											<Icon className="size-4 flex-none" />
										</span>
										<span className={cn("text-[10px] font-bold leading-[1.2]", reached ? "text-[#0e1214]" : "text-[#8a979c]")}>{stage.label}</span>
									</li>
								);
							})}
						</ol>
					</div>

					<div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4">
						<div className="flex items-start gap-3">
							<span className="flex size-9 flex-none items-center justify-center rounded-xl bg-[#16a34a] text-white">
								<MessageCircle className="size-4 flex-none" />
							</span>
							<div>
								<p className="text-[14px] font-black">Envie o pedido para a loja</p>
								<p className="mt-0.5 text-[12px] leading-[1.5] text-[#4b585d]">O resumo completo já vai pronto. É só tocar em enviar no WhatsApp.</p>
							</div>
						</div>
						<span className="mt-3 flex h-10 items-center justify-center rounded-full bg-[#16a34a] text-[13px] font-bold text-white">
							ENVIAR NO WHATSAPP
						</span>
					</div>

					<div className="rounded-2xl border border-[#e3e8ea] bg-white shadow-[0_1px_rgba(0,0,0,0.05)]">
						<div className="flex items-center justify-between border-b border-[#e3e8ea] px-4 py-3">
							<div className="flex items-center gap-2">
								<ShoppingBag className="size-4" style={{ color: BRAND }} />
								<p className="text-[14px] font-black">Itens do pedido</p>
							</div>
							<span className="text-[11px] font-bold text-[#687a80]">{ITEMS.length} itens</span>
						</div>
						<div className="divide-y divide-[#e3e8ea]">
							{ITEMS.map((item) => (
								<div key={item.name} className="flex gap-3 px-4 py-3">
									<ItemPhoto slug={item.photo} />
									<div className="flex min-w-0 flex-1 items-start justify-between gap-3">
										<div>
											<p className="text-[13px] font-bold leading-snug">{item.name}</p>
											<p className="mt-1 text-[11px] text-[#687a80]">1 × {item.unit}</p>
										</div>
										<p className="flex-none text-[13px] font-black">{item.total}</p>
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="rounded-2xl bg-white p-4 shadow-[0_1px_rgba(0,0,0,0.05)]">
						<p className="text-[14px] font-black">Resumo do pedido</p>
						<div className="mt-3 flex flex-col gap-1.5 text-[13px]">
							<div className="flex justify-between">
								<span className="text-[#687a80]">Subtotal</span>
								<span>R$ 71,90</span>
							</div>
							<div className="flex justify-between">
								<span className="text-[#687a80]">Taxa de entrega</span>
								<span>R$ 6,00</span>
							</div>
							<div className="flex justify-between">
								<span className="text-[#687a80]">Cashback usado</span>
								<span className="text-[#16a34a]">− R$ 6,10</span>
							</div>
							<div className="mt-1 flex justify-between border-t border-[#e3e8ea] pt-2 text-[15px] font-black">
								<span>Total</span>
								<span>R$ 71,80</span>
							</div>
						</div>
						<p className="mt-3 text-[11px] text-[#687a80]">Pagamento na entrega · Pix</p>
					</div>
					<p className="px-2 text-center text-[11px] text-[#687a80]">Esta página atualiza automaticamente enquanto o pedido está em andamento.</p>
				</div>
			</div>
		</div>
	);
}
