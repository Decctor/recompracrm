import { cn } from "@/lib/utils";
import { AdjustmentRow, CashbackDiscountBox, MOCK_CARD, SummaryTitle, TotalDock } from "./mock-parts";

// Resumo do checkout do PDV (SummarySection + TotalDock), desenhado a 440px.
export function CheckoutSummaryMock() {
	return (
		<div className="flex flex-col gap-3 rounded-[20px] border border-[rgba(14,18,20,0.08)] bg-white p-4 shadow-[0_30px_70px_-30px_rgba(16,24,40,0.35)]">
			<div className={cn("flex flex-col gap-2 p-3", MOCK_CARD)}>
				<SummaryTitle />
				<div className="flex justify-between text-[14px]">
					<span className="text-[#687a80]">Subtotal itens</span>
					<span>R$ 111,90</span>
				</div>
				<CashbackDiscountBox />
				<AdjustmentRow tone="red" label="OUTROS DESCONTOS">
					<span className="text-[11px] font-semibold text-[rgba(220,38,38,0.9)]">LIMITE DO OPERADOR: R$ 11,19</span>
				</AdjustmentRow>
				<AdjustmentRow tone="green" label="ACRÉSCIMOS" />
				<div className="my-0.5 h-px bg-[#e3e8ea]" />
				<div className="flex justify-between text-[14px] text-[#16a34a]">
					<span>Desconto em cashback</span>
					<span>-R$ 20,00</span>
				</div>
				<div className="flex justify-between text-[14px]">
					<span className="text-[#687a80]">Total final</span>
					<span>R$ 91,90</span>
				</div>
				<div className="flex justify-between text-[12px] text-[#687a80]">
					<span>PAGAMENTOS</span>
					<span>R$ 91,90</span>
				</div>
				<div className="flex justify-between text-[12px] text-[#687a80]">
					<span>RESTANTE</span>
					<span>R$ 0,00</span>
				</div>
			</div>
			<TotalDock />
		</div>
	);
}
