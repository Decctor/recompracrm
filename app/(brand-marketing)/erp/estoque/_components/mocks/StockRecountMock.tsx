import { cn } from "@/lib/utils";
import { ArrowLeftRight, Boxes, CornerDownRight, ShoppingCart, X } from "lucide-react";
import Image from "next/image";
import { getMockProductPhoto, mockProductPhotoSrc } from "../../../_components/mocks/product-photos";

// Recontagem de estoque (app/dashboard/inventory/recount), desenhada a 1000px: cabeçalho com o
// contador do rascunho, busca e atalhos, a RecountTable (foto, código, unidade, saldo atual,
// quantidade contada, diferença) e a barra de aplicar. Variante aparece recuada sob o produto.

type TRow = {
	photo?: string;
	name: string;
	variant?: string;
	code: string;
	unit: string;
	balance: number;
	counted: number | null;
};

const ROWS: TRow[] = [
	{ photo: "pote-chocolate-belga", name: "Pote 1L Chocolate Belga", code: "PT-001", unit: "UN", balance: 22, counted: 22 },
	{ photo: "pote-pistache", name: "Pote 1L Pistache", code: "PT-004", unit: "UN", balance: 18, counted: 17 },
	{ photo: "picole-limao", name: "Picolé de limão", code: "PC-002", unit: "UN", balance: 64, counted: 58 },
	{ photo: "paleta-morango", name: "Paleta", variant: "Morango", code: "PL-001-M", unit: "UN", balance: 31, counted: 33 },
	{ photo: "casquinha", name: "Casquinha", code: "EMB-012", unit: "UN", balance: 260, counted: null },
	{ name: "Leite integral 1L", code: "IN-107", unit: "UN", balance: 36, counted: null },
];

const GRID = "grid grid-cols-[minmax(0,32fr)_minmax(0,12fr)_minmax(0,8fr)_minmax(0,14fr)_minmax(0,18fr)_minmax(0,16fr)] items-center gap-x-1 px-2";

function RowImage({ row }: { row: TRow }) {
	const src = row.photo ? mockProductPhotoSrc(row.photo, "square") : null;
	return (
		<div className="relative size-8 flex-none overflow-hidden rounded-md ring-1 ring-[#e3e8ea]">
			{src && row.photo ? (
				<Image src={src} alt={getMockProductPhoto(row.photo)?.alt ?? row.name} fill sizes="32px" className="object-cover" />
			) : (
				<div className="flex size-full items-center justify-center bg-[rgba(36,84,156,0.1)] text-[#24549c]">
					<ShoppingCart className="size-3.5" />
				</div>
			)}
		</div>
	);
}

function DeltaChip({ delta }: { delta: number }) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full px-2 py-0.5 text-[11.2px] font-bold",
				delta > 0 && "bg-[rgba(22,163,74,0.15)] text-[#16a34a]",
				delta < 0 && "bg-[rgba(229,37,42,0.15)] text-[#e5252a]",
				delta === 0 && "bg-[#f2f4f4] text-[#687a80]",
			)}
		>
			{delta > 0 ? `+${delta}` : delta}
		</span>
	);
}

export function StockRecountMock() {
	const counted = ROWS.filter((row) => row.counted !== null).length;
	return (
		<div className="flex flex-col gap-4 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-6 text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
					<p className="text-[20px] font-bold tracking-tight">Recontagem de estoque</p>
					<span className="rounded-full bg-[rgba(36,84,156,0.1)] px-2.5 py-0.5 text-[11.2px] font-bold text-[#24549c]">{counted} itens contados</span>
				</div>
				<p className="text-[14px] text-[#687a80]">
					Informe a quantidade física contada de cada item; ao aplicar, o sistema calcula a diferença e registra o ajuste de estoque. O rascunho fica salvo
					neste navegador e cobre todas as páginas.
				</p>
			</div>
			<div className="flex items-center gap-2">
				<div className="flex h-9 flex-1 items-center rounded-xl border border-[#e3e8ea] px-3 text-[14px] text-[#8a979c]">
					Pesquisar produto por nome ou código...
				</div>
				<span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#e3e8ea] px-3 text-[12px] font-medium">
					<Boxes className="size-4" />
					VISÃO GERAL
				</span>
				<span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#e3e8ea] px-3 text-[12px] font-medium">
					<ArrowLeftRight className="size-4" />
					TRANSAÇÕES
				</span>
			</div>

			<div className="flex flex-col overflow-hidden rounded-xl border border-[#e3e8ea]">
				<div className={cn(GRID, "min-h-8 border-b border-[#e3e8ea] py-1.5 text-[10.9px] font-medium uppercase text-[#687a80]")}>
					<p className="px-1">Produto</p>
					<p className="px-1 text-center">Código</p>
					<p className="px-1 text-center">Un.</p>
					<p className="px-1 text-center">Saldo atual</p>
					<p className="px-1 text-center">Qtde. contada</p>
					<p className="px-1 text-center">Diferença</p>
				</div>
				{ROWS.map((row, index) => {
					const delta = row.counted === null ? null : row.counted - row.balance;
					return (
						<div
							key={row.code}
							className={cn(
								"border-t border-[#e3e8ea] first-of-type:border-t-0",
								delta !== null ? "bg-[rgba(36,84,156,0.05)]" : index % 2 === 1 && "bg-[rgba(242,244,244,0.1)]",
							)}
						>
							<div className={cn(GRID, "min-h-12 py-1 text-[12px]")}>
								<div className={cn("flex min-w-0 items-center gap-2 px-1", row.variant && "pl-5")}>
									{row.variant ? <CornerDownRight className="size-3.5 flex-none text-[#687a80]" /> : null}
									<RowImage row={row} />
									<div className="flex min-w-0 flex-col">
										<span className="truncate font-medium">{row.name}</span>
										{row.variant ? <span className="truncate text-[11.2px] text-[#687a80]">{row.variant}</span> : null}
									</div>
								</div>
								<p className="truncate px-1 text-center text-[#687a80]">{row.code}</p>
								<p className="px-1 text-center text-[#687a80]">{row.unit}</p>
								<p className="px-1 text-center">{row.balance}</p>
								<div className="px-1">
									<span
										className={cn(
											"mx-auto flex h-8 w-[88px] items-center justify-center rounded-md border text-[12px]",
											row.counted === null ? "border-transparent text-[#687a80]" : "border-[#e3e8ea] bg-white font-medium",
										)}
									>
										{row.counted ?? "—"}
									</span>
								</div>
								<div className="flex items-center justify-center gap-1 px-1">
									{delta !== null ? (
										<>
											<DeltaChip delta={delta} />
											<span className="flex size-7 items-center justify-center text-[#687a80]">
												<X className="size-3.5" />
											</span>
										</>
									) : (
										<span className="text-[#687a80]">—</span>
									)}
								</div>
							</div>
						</div>
					);
				})}
			</div>

			<div className="flex justify-center">
				<div className="flex w-full max-w-[672px] items-center justify-between gap-3 rounded-2xl bg-[rgba(255,255,255,0.9)] px-3 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-[rgba(227,232,234,0.7)]">
					<p className="flex-1 text-[12px] text-[#687a80]">{counted} itens contados no rascunho — cobre todas as páginas</p>
					<div className="flex items-center gap-2">
						<span className="inline-flex h-8 items-center px-3 text-[12px] font-medium">DESCARTAR</span>
						<span className="inline-flex h-8 items-center rounded-md bg-[#171717] px-3 text-[12px] font-medium text-[#fafafa]">APLICAR RECONTAGEM</span>
					</div>
				</div>
			</div>
		</div>
	);
}
