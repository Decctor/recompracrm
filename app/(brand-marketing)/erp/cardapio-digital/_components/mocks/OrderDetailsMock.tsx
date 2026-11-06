import { Banknote, Clock3, File, MessageCircle, Package, Phone, PhoneCall, ReceiptText, Truck, X } from "lucide-react";
import Image from "next/image";
import { getMockProductPhoto, mockProductPhotoSrc } from "../../../_components/mocks/product-photos";

// Detalhes do pedido aberto pelo olho do card (components/Modals/Sales/SaleFulfillmentDetailsMenu):
// no desktop, um diálogo de 760px com o resumo, os itens com a foto do produto e os adicionais
// agrupados, e os detalhes de entrega, pagamento e fiscal. Desenhado a 640px. Mesmo pedido #1048
// do quadro e da página de acompanhamento.

type TItem = {
	photo: string;
	name: string;
	quantity: number;
	variant?: string;
	total: string;
	addOns?: { group: string; lines: { name: string; value: string }[] };
};

const ITEMS: TItem[] = [
	{ photo: "pote-chocolate-belga", name: "Pote 1L Chocolate Belga", quantity: 1, total: "R$ 49,90" },
	{
		photo: "milkshake",
		name: "Milkshake",
		quantity: 1,
		variant: "400ml",
		total: "R$ 22,00",
		addOns: { group: "Cobertura", lines: [{ name: "Calda de caramelo", value: "Incluso" }] },
	},
];

function ItemPhoto({ slug }: { slug: string }) {
	const src = mockProductPhotoSrc(slug, "square");
	return (
		<div className="relative size-14 flex-none overflow-hidden rounded-xl border border-[#e3e8ea] bg-[#f2f4f4]">
			{src ? (
				<Image src={src} alt={getMockProductPhoto(slug)?.alt ?? ""} fill sizes="56px" className="object-cover" />
			) : (
				<div className="flex size-full items-center justify-center text-[rgba(36,84,156,0.45)]">
					<Package className="size-6" />
				</div>
			)}
		</div>
	);
}

function StatusSummary({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
	return (
		<div className="flex items-center gap-2.5 px-5 py-3">
			<span className="text-[#687a80]">{icon}</span>
			<div className="min-w-0">
				<p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#687a80]">{label}</p>
				<p className="truncate text-[12px] font-bold">{value}</p>
			</div>
		</div>
	);
}

function DetailGroup({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
	return (
		<div className="grid grid-cols-[116px_minmax(0,1fr)] gap-4 py-4">
			<div className="flex items-center gap-2 self-start text-[#687a80]">
				{icon}
				<p className="text-[12px] font-extrabold uppercase tracking-[0.08em]">{title}</p>
			</div>
			<div className="min-w-0">{children}</div>
		</div>
	);
}

export function OrderDetailsMock() {
	return (
		<div className="flex flex-col gap-4 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-6 text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-[20px] font-extrabold tracking-tight">Pedido #1048</p>
					<p className="mt-1 text-[14px] text-[#687a80]">Conferência de itens, entrega e recebimento.</p>
				</div>
				<X className="size-4 flex-none text-[#687a80]" />
			</div>

			<section className="overflow-hidden rounded-2xl bg-[rgba(242,244,244,0.55)]">
				<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-5 px-5 py-5">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-x-2 text-[12px] font-semibold text-[#687a80]">
							<span className="text-[#24549c]">SHOP</span>
							<span>06/11/2026, 19:42</span>
						</div>
						<p className="mt-1 truncate text-[20px] font-extrabold tracking-tight">Juliana Prado</p>
						<p className="mt-1 flex items-center gap-1.5 text-[14px] text-[#687a80]">
							<Phone className="size-3.5" />
							(34) 99812-4410
						</p>
						<div className="mt-3 flex gap-2">
							<span className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#e3e8ea] bg-white px-3 text-[12px] font-bold">
								<PhoneCall className="size-4" />
								Ligar
							</span>
							<span className="inline-flex h-9 items-center gap-2 rounded-xl border border-[rgba(22,163,74,0.25)] bg-[rgba(22,163,74,0.1)] px-3 text-[12px] font-bold text-[#16a34a]">
								<MessageCircle className="size-4" />
								WhatsApp
							</span>
						</div>
					</div>
					<div className="text-right">
						<p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#687a80]">Total</p>
						<p className="mt-0.5 text-[24px] font-extrabold tracking-tight">R$ 71,80</p>
						<p className="mt-1 text-[12px] font-semibold text-[#16a34a]">R$ 6,10 de desconto</p>
					</div>
				</div>
				<div className="grid grid-cols-3 divide-x divide-[rgba(227,232,234,0.8)] border-t border-[rgba(227,232,234,0.8)] bg-[rgba(255,255,255,0.7)]">
					<StatusSummary label="Atendimento" value="Aguardando início" icon={<Clock3 className="size-4" />} />
					<StatusSummary label="Pagamento" value="Pagamento pendente" icon={<Banknote className="size-4" />} />
					<StatusSummary label="Fiscal" value="Nota fiscal não emitida" icon={<File className="size-4" />} />
				</div>
			</section>

			<section className="overflow-hidden rounded-2xl border border-[#e3e8ea] bg-white">
				<div className="flex min-h-12 items-center gap-2 border-b border-[#e3e8ea] px-5">
					<p className="text-[14px] font-extrabold">Itens</p>
					<span className="text-[12px] font-bold text-[#687a80]">{ITEMS.length}</span>
				</div>
				<div className="divide-y divide-[rgba(227,232,234,0.7)] px-5">
					{ITEMS.map((item) => (
						<div key={item.name} className="flex gap-3 py-4">
							<ItemPhoto slug={item.photo} />
							<div className="min-w-0 flex-1">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="line-clamp-2 text-[14px] font-bold leading-snug">{item.name}</p>
										<p className="mt-1 text-[12px] text-[#687a80]">
											<span className="font-bold text-[#24549c]">{item.quantity}x</span>
											{item.variant ? ` · ${item.variant}` : ""}
										</p>
									</div>
									<p className="flex-none text-[14px] font-extrabold">{item.total}</p>
								</div>
								{item.addOns ? (
									<div className="mt-2 text-[12px] text-[#687a80]">
										<p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em]">{item.addOns.group}</p>
										{item.addOns.lines.map((line) => (
											<p key={line.name} className="flex justify-between gap-3">
												<span>+ {line.name}</span>
												<span>{line.value}</span>
											</p>
										))}
									</div>
								) : null}
							</div>
						</div>
					))}
				</div>
			</section>

			<section className="overflow-hidden rounded-2xl border border-[#e3e8ea] bg-white">
				<div className="flex min-h-12 items-center border-b border-[#e3e8ea] px-5">
					<p className="text-[14px] font-extrabold">Detalhes</p>
				</div>
				<div className="divide-y divide-[#e3e8ea] px-5">
					<DetailGroup icon={<Truck className="size-4" />} title="Entrega">
						<p className="text-[14px] font-bold">Entrega</p>
						<div className="mt-1 text-[14px] leading-relaxed text-[#687a80]">
							<p>Rua Duque de Caxias, 455</p>
							<p>Apto 302</p>
							<p>Centro · Uberlândia · MG</p>
							<p>CEP 38400-142</p>
						</div>
					</DetailGroup>
					<DetailGroup icon={<Banknote className="size-4" />} title="Pagamento">
						<div className="flex items-start justify-between gap-4">
							<div>
								<p className="text-[14px] font-bold">Pix</p>
								<p className="mt-0.5 text-[12px] text-[#687a80]">Pendente</p>
							</div>
							<p className="text-[14px] font-extrabold">R$ 71,80</p>
						</div>
					</DetailGroup>
					<DetailGroup icon={<ReceiptText className="size-4" />} title="Fiscal">
						<p className="text-[14px] text-[#687a80]">Nenhum documento emitido.</p>
					</DetailGroup>
				</div>
			</section>
		</div>
	);
}
