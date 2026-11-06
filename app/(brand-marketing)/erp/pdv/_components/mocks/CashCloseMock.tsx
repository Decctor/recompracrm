import { cn } from "@/lib/utils";
import { X } from "lucide-react";

// Fechamento de caixa (components/Modals/Internal/SalesSessions/CloseSalesSession.tsx), desenhado a
// 440px com a conferência cega desligada, para mostrar o esperado, o contado e a diferença.
// Dados de exemplo da mesma loja das outras telas do ERP.

const META = [
	{ label: "POLÍTICA", value: "Vendedores múltiplos" },
	{ label: "VENDEDOR PADRÃO", value: "Marina Souza" },
	{ label: "ABERTURA", value: "06/11/2026 08:02" },
	{ label: "VENDAS DO TURNO", value: "47 · R$ 2.318,60" },
];

const SELLERS = [
	{ name: "Marina Souza", count: 29, total: "R$ 1.432,10" },
	{ name: "Lucas Prado", count: 18, total: "R$ 886,50" },
];

const COMPOSITION = [
	{ label: "Fundo de troco", value: "R$ 150,00" },
	{ label: "Entradas em dinheiro", value: "+ R$ 742,40" },
	{ label: "Troco devolvido", value: "− R$ 40,00" },
	{ label: "Sangria 14:10", value: "− R$ 40,00" },
];

function SectionLabel({ children }: { children: string }) {
	return <span className="text-[11px] font-bold tracking-[0.04em] text-[#687a80]">{children}</span>;
}

export function CashCloseMock() {
	return (
		<div className="flex flex-col gap-4 rounded-[20px] border border-[rgba(14,18,20,0.08)] bg-white p-5 shadow-[0_30px_70px_-30px_rgba(16,24,40,0.35)]">
			<div className="flex items-center justify-between">
				<span className="text-[15px] font-black tracking-[-0.01em]">FECHAR CAIXA</span>
				<X className="size-4 text-[#687a80]" aria-hidden />
			</div>

			<div className="flex flex-col gap-1 rounded-xl bg-[#f2f4f4]/70 p-3">
				{META.map((row) => (
					<div key={row.label} className="flex items-center justify-between text-[12px]">
						<span className="text-[#687a80]">{row.label}</span>
						<span className="font-semibold">{row.value}</span>
					</div>
				))}
			</div>

			<div className="flex flex-col gap-2">
				<SectionLabel>VENDAS POR VENDEDOR</SectionLabel>
				{SELLERS.map((seller) => (
					<div key={seller.name} className="flex items-center justify-between rounded-lg border border-[#e3e8ea] px-3 py-2 text-[14px]">
						<span>
							{seller.name} <span className="text-[12px] text-[#687a80]">({seller.count})</span>
						</span>
						<span className="font-semibold">{seller.total}</span>
					</div>
				))}
			</div>

			<div className="flex flex-col gap-2">
				<SectionLabel>CONTAGEM FÍSICA DA GAVETA</SectionLabel>
				<div className="flex flex-col overflow-hidden rounded-xl bg-[#f2f4f4]/70">
					<div className="flex flex-col gap-2 px-3 py-3">
						<div className="flex items-center justify-between gap-2">
							<span className="text-[14px] font-bold">Dinheiro</span>
							<span className="text-[11px] text-[#687a80]">
								ESPERADO <span className="font-semibold text-[#0e1214]">R$ 812,40</span>
							</span>
						</div>
						<div className="flex flex-col gap-0.5 text-[11px] text-[#687a80]">
							{COMPOSITION.map((row) => (
								<div key={row.label} className="flex justify-between">
									<span>{row.label}</span>
									<span>{row.value}</span>
								</div>
							))}
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="text-[12px] font-medium">Dinheiro contado (R$)</span>
							<span className="flex h-9 items-center rounded-lg border border-[#e3e8ea] bg-white px-3 text-[14px]">812,40</span>
						</div>
						<span className="text-[12px] font-semibold text-[#16a34a]">Sem diferença</span>
					</div>
					<div className="flex flex-col gap-1 border-t border-[#e3e8ea] bg-[#eef1f1] px-3 py-3">
						<div className="flex items-center justify-between text-[12px]">
							<span className="text-[#687a80]">ESPERADO EM GAVETA</span>
							<span className="font-semibold">R$ 812,40</span>
						</div>
						<div className="flex items-center justify-between text-[12px]">
							<span className="text-[#687a80]">CONTADO</span>
							<span className="font-semibold">R$ 812,40</span>
						</div>
						<div className="flex items-center justify-between pt-1 text-[14px]">
							<span className="font-bold">DIFERENÇA</span>
							<span className="font-black text-[#16a34a]">R$ 0,00</span>
						</div>
					</div>
				</div>
			</div>

			<div className="flex justify-end gap-2">
				<span className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-bold text-[#687a80]">CANCELAR</span>
				<span className={cn("inline-flex h-9 items-center rounded-lg bg-[#24549c] px-4 text-[13px] font-bold text-white")}>FECHAR CAIXA</span>
			</div>
		</div>
	);
}
