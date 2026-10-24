import { Clock3, MapPin, MessageCircle, Package, Truck } from "lucide-react";

// Loja digital (app/shop/[slug]: ShopHeader + ProductCard) dentro de um celular, desenhada a 410px.

const TOP_PRODUCTS = [
	{ letter: "P", name: "Pote 1L Chocolate Belga", price: "R$ 49,90" },
	{ letter: "G", name: "Gelato", price: "a partir de R$ 14,00" },
	{ letter: "M", name: "Milkshake 400ml", price: "R$ 22,00" },
];

export function ShopPhoneMock() {
	return (
		<div className="rounded-[48px] border-[10px] border-[#0e1214] bg-[#0e1214] shadow-[0_40px_80px_-40px_rgba(16,24,40,0.6)]">
			<div className="relative h-[760px] overflow-hidden rounded-[38px] bg-white">
				<div className="relative h-56 overflow-hidden bg-[linear-gradient(135deg,#7a2943,#4e1729)]">
					<div className="absolute inset-0 bg-[radial-gradient(circle,#fff_1px,transparent_1px)] bg-[length:18px_18px] opacity-[0.12]" />
					<div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,transparent_50%,rgba(0,0,0,0.35))]" />
				</div>
				<div className="relative z-[1] -mt-12 px-3">
					<div className="relative rounded-t-[28px] rounded-b-2xl border border-[rgba(227,232,234,0.6)] bg-white px-4 pt-12 pb-4 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]">
						<span className="absolute top-0 left-1/2 flex size-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[36px] border-[3px] border-white bg-[#ffb900] text-[24px] font-black text-black shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)]">
							G
						</span>
						<p className="pt-1 text-center text-[18px] font-black leading-[1.25]">Gelateria Aurora</p>
						<div className="my-4 h-px bg-[#e3e8ea]" />
						<div className="mb-3 flex justify-center">
							<span className="inline-flex items-center gap-1.5 rounded-full bg-[#dcfce7] px-3 py-1 text-[12px] font-semibold text-[#166534]">
								<Clock3 className="size-3.5 flex-none" />
								ABERTA AGORA
							</span>
						</div>
						<div className="flex flex-col gap-2.5">
							<div className="flex items-center gap-3">
								<span className="flex size-9 flex-none items-center justify-center rounded-[18px] bg-[#ffb900] text-black">
									<MessageCircle className="size-4 flex-none" />
								</span>
								<span className="text-[12px] font-medium tracking-[-0.015em]">(34) 99876-5432</span>
							</div>
							<div className="flex items-center gap-3">
								<span className="flex size-9 flex-none items-center justify-center rounded-[18px] bg-[#ffb900] text-black">
									<MapPin className="size-4 flex-none" />
								</span>
								<span className="text-[12px] font-medium tracking-[-0.015em]">Av. Afonso Pena, 1200 - Centro, Uberlândia/MG, 38400-128</span>
							</div>
						</div>
						<div className="mt-4 flex flex-wrap justify-center gap-2">
							<span className="inline-flex items-center gap-1 rounded-full bg-[#7a2943] px-3 py-1 text-[12px] font-semibold text-white">
								<Package className="size-3.5 flex-none" />
								RETIRADA DISPONÍVEL
							</span>
							<span className="inline-flex items-center gap-1 rounded-full bg-[#7a2943] px-3 py-1 text-[12px] font-semibold text-white">
								<Truck className="size-3.5 flex-none" />
								ENTREGA EM ATÉ 40 MIN
							</span>
						</div>
						<p className="mt-3 px-1 text-center text-[12px] leading-[1.6] text-[#687a80]">Valores e formas de pagamento ao finalizar no carrinho.</p>
					</div>
				</div>
				<div className="flex flex-col gap-3 px-3 pt-5">
					<p className="text-[16px] font-black">Mais pedidos</p>
					<div className="flex gap-3 overflow-hidden">
						{TOP_PRODUCTS.map((product) => (
							<div key={product.name} className="flex w-[180px] flex-none flex-col overflow-hidden rounded-[14px] border border-[#e3e8ea] bg-white">
								<div className="flex aspect-square items-center justify-center bg-[#f2f4f4]">
									<span className="text-[30px] font-black text-[rgba(104,122,128,0.5)]">{product.letter}</span>
								</div>
								<div className="flex flex-col gap-1 p-2.5">
									<span className="text-[12px] font-semibold leading-[1.25]">{product.name}</span>
									<span className="text-[14px] font-black text-[#7a2943]">{product.price}</span>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
