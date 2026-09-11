import { Badge } from "@/components/ui/badge";
import { formatToMoney } from "@/lib/formatting";
import { resolvePOSProductStock } from "@/lib/pos/product-stock-display";
import { cn } from "@/lib/utils";
import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import { Code, Diamond, Package, PackagePlus, Plus } from "lucide-react";
import Image from "next/image";
import { memo } from "react";

type Product = TGetPOSProductsOutput["data"]["products"][number];

type ProductListRowProps = {
	product: Product;
	/** `preferencias.rastreamentoEstoque` da organização — sem o módulo, nenhum saldo é exibido. */
	orgTracksStock: boolean;
	onSelect: (product: Product) => void;
};

// Preço a exibir: "A partir de" quando há variantes (menor preço), senão o preço base.
function getDisplayPrice(product: Product) {
	if (product.variantes.length > 0) {
		return { type: "starting-from" as const, value: Math.min(...product.variantes.map((v) => v.precoVenda)) };
	}
	return { type: "fixed" as const, value: product.precoVenda ?? 0 };
}

// Faixas de saldo → cor, alinhadas às usadas na página de Estoque.
function getSaldoTone(quantidade: number) {
	if (quantidade <= 0) return "bg-red-500 text-white dark:bg-red-600";
	if (quantidade <= 10) return "bg-yellow-500 text-white dark:bg-yellow-600";
	return "bg-green-500 text-white dark:bg-green-600";
}

function ProductListRow({ product, orgTracksStock, onSelect }: ProductListRowProps) {
	const hasVariants = product.variantes.length > 0;
	const hasAddOns = product.addOnsReferencias.length > 0;
	const isComplex = hasVariants || hasAddOns;
	const displayPrice = getDisplayPrice(product);
	const stockQuantity = resolvePOSProductStock({ product, orgTracksStock });

	return (
		<button
			type="button"
			onClick={() => onSelect(product)}
			className={cn(
				"group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left shadow-2xs",
				"transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-md",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
			)}
		>
			{/* Identidade do produto */}
			<div className="relative h-14 w-14 min-h-14 min-w-14 overflow-hidden rounded-lg bg-secondary/40">
				{product.imagemCapaUrl ? (
					<Image src={product.imagemCapaUrl} alt={product.nome} fill sizes="56px" className="object-cover" />
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Package className="h-5 w-5 text-muted-foreground/40" />
					</div>
				)}
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<h3 className="truncate text-sm font-bold tracking-tight">{product.nome}</h3>
					{isComplex ? (
						<Badge className="shrink-0 gap-1 bg-brand-secondary text-[0.55rem] font-bold text-brand-secondary-foreground">
							<PackagePlus className="h-2.5 w-2.5" />
							{hasVariants && hasAddOns ? "VAR + ADD" : hasVariants ? "VARIANTES" : "ADICIONAIS"}
						</Badge>
					) : null}
				</div>
				<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.65rem] font-medium text-foreground/70">
					<span className="inline-flex items-center gap-1">
						<Code className="h-3 w-3 min-h-3 min-w-3" />
						{product.codigo}
					</span>
					{product.grupo ? (
						<span className="inline-flex items-center gap-1">
							<Diamond className="h-3 w-3 min-h-3 min-w-3" />
							{product.grupo}
						</span>
					) : null}
				</div>
			</div>

			{/* Saldo */}
			{stockQuantity !== null ? (
				<span
					className={cn("hidden shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums sm:inline-flex", getSaldoTone(stockQuantity))}
				>
					{stockQuantity > 0 ? `${stockQuantity} un.` : "Sem estoque"}
				</span>
			) : null}

			{/* Preço */}
			<div className="shrink-0 text-right">
				{displayPrice.type === "starting-from" ? (
					<span className="block text-[0.55rem] font-bold uppercase leading-none tracking-wide text-muted-foreground">A partir de</span>
				) : null}
				<span className="text-base font-black tabular-nums text-foreground">{formatToMoney(displayPrice.value)}</span>
			</div>

			{/* Afordância de adicionar */}
			<div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground sm:flex">
				<Plus className="h-4 w-4" />
			</div>
		</button>
	);
}

export default memo(ProductListRow);
