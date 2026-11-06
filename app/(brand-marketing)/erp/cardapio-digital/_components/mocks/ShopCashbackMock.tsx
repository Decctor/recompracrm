import { BadgePercent, Check, Ticket } from "lucide-react";

// Etapa "Descontos/Benefícios" do checkout da loja digital (CashbackStep), desenhada a 420px.
// Aparece só quando o programa permite resgate pela loja digital.

const BRAND = "#7a2943";

export function ShopCashbackMock() {
	return (
		<div className="flex flex-col gap-4 rounded-[24px] bg-white p-5 text-[#0e1214] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.5)]">
			<div className="flex items-center justify-between">
				<p className="text-[16px] font-black">Descontos e benefícios</p>
				<span className="text-[12px] font-bold text-[#687a80]">Etapa 3 de 5</span>
			</div>

			<div className="rounded-2xl border p-4" style={{ borderColor: `${BRAND}40`, backgroundColor: `${BRAND}0d` }}>
				<div className="flex items-start gap-3">
					<span className="flex size-10 flex-none items-center justify-center rounded-xl text-white" style={{ backgroundColor: BRAND }}>
						<BadgePercent className="size-5 flex-none" />
					</span>
					<div>
						<p className="text-[13px] font-black tracking-wide uppercase" style={{ color: BRAND }}>
							Cashback do pedido
						</p>
						<p className="mt-1 text-[13px] leading-[1.5] text-[#687a80]">Use seu saldo disponível antes de escolher o pagamento.</p>
					</div>
				</div>
			</div>

			<div className="flex items-center justify-between rounded-2xl border border-[#e3e8ea] p-4">
				<div>
					<p className="text-[12px] font-bold text-[#687a80]">Saldo disponível</p>
					<p className="mt-0.5 text-[24px] font-black">R$ 6,10</p>
				</div>
				<span className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold text-white" style={{ backgroundColor: BRAND }}>
					<Check className="size-4 flex-none" />
					USANDO
				</span>
			</div>

			<div className="flex items-center gap-3 rounded-2xl border border-dashed border-[#c9d1d4] p-4">
				<Ticket className="size-5 flex-none text-[#687a80]" />
				<div className="min-w-0 flex-1">
					<p className="text-[13px] font-bold">Cupom BEMVINDO</p>
					<p className="text-[12px] text-[#687a80]">R$ 10,00 de desconto · resgatável na loja digital</p>
				</div>
			</div>

			<div className="flex flex-col gap-1.5 border-t border-[#e3e8ea] pt-4 text-[13px]">
				<div className="flex justify-between">
					<span className="text-[#687a80]">Subtotal + entrega</span>
					<span>R$ 77,90</span>
				</div>
				<div className="flex justify-between">
					<span className="text-[#687a80]">Cashback usado</span>
					<span className="font-semibold text-[#16a34a]">− R$ 6,10</span>
				</div>
				<div className="flex justify-between text-[15px] font-black">
					<span>Total</span>
					<span>R$ 71,80</span>
				</div>
			</div>
		</div>
	);
}
