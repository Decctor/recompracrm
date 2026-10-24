import { cn } from "@/lib/utils";
import { FileText, RefreshCcw, ShoppingCart } from "lucide-react";
import { MOCK_CARD, MOCK_WINDOW, MockHeader, MockSegmented } from "./mock-parts";

// Notas recebidas (purchases/components/InboundDocumentsTab), desenhada a 760px.

const TAG = "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-[-0.015em]";

const INVOICES = [
	{
		supplier: "Distribuidora Frio Sul",
		tags: [
			{ label: "COMPLETA", className: "bg-[#d1fae5] text-[#047857]" },
			{ label: "CONFIRMADA", className: "bg-[#f4f4f5] text-[#18181b]" },
		],
		key: "31261045879001000123550010000458771000458772",
		cnpj: "45.879.001/0001-23",
		value: "R$ 3240.00",
		date: "24/10/2026 08:12",
		actions: ["Ciência", "Confirmar", "Desconhecer", "Não realizada", "XML", "DANFE"],
	},
	{
		supplier: "Laticínios Serra Azul",
		tags: [
			{ label: "RESUMO", className: "bg-[#f4f4f5] text-[#18181b]" },
			{ label: "SEM MANIFESTAÇÃO", className: "bg-[#fef3c7] text-[#b45309]" },
		],
		key: "31261022514880000177550010000091221000091229",
		cnpj: "22.514.880/0001-77",
		value: "R$ 1180.50",
		date: "23/10/2026 17:40",
		actions: ["Ciência", "Confirmar", "Desconhecer", "Não realizada", "XML"],
	},
];

export function InboundInvoicesMock() {
	return (
		<div className={cn("flex flex-col gap-3", MOCK_WINDOW)}>
			<MockHeader icon={ShoppingCart} title="Compras" description="Pedidos de compra e notas emitidas contra o seu CNPJ." />
			<div className="flex items-center justify-between">
				<MockSegmented active="Notas recebidas" items={[{ label: "Compras" }, { label: "Notas recebidas" }]} />
				<span className="inline-flex h-8 items-center gap-2 rounded-full border border-[#e3e8ea] bg-[#f7f9f9] px-3 text-[14px] font-medium">
					<RefreshCcw className="size-3.5 flex-none" />
					SINCRONIZAR AGORA
				</span>
			</div>
			<p className="text-[12px] text-[#687a80]">3 nota(s) recebida(s). Mostrando 2 nota(s).</p>
			{INVOICES.map((invoice) => (
				<div key={invoice.key} className={cn("flex flex-col gap-2 p-3", MOCK_CARD)}>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<FileText className="size-4 flex-none text-[#687a80]" />
							<p className="text-[14px] font-bold tracking-[-0.015em]">{invoice.supplier}</p>
						</div>
						<div className="flex items-center gap-2">
							{invoice.tags.map((tag) => (
								<span key={tag.label} className={cn(TAG, tag.className)}>
									{tag.label}
								</span>
							))}
							<span className="text-[10px] font-medium text-[#687a80]">AUTORIZADA</span>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.2px] font-medium text-[#687a80]">
						<span className="font-mono">{invoice.key}</span>
						<span>CNPJ {invoice.cnpj}</span>
						<span>{invoice.value}</span>
						<span>{invoice.date}</span>
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
						{invoice.actions.map((action) => (
							<span key={action} className="inline-flex h-6 items-center gap-1 rounded-full bg-[#f7f9f9] px-2.5 text-[12px] font-medium">
								{action}
							</span>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
