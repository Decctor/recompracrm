import { Badge } from "@/components/ui/badge";
import { formatToMoney } from "@/lib/formatting";
import { resolvePOSProductStock } from "@/lib/pos/product-stock-display";
import { cn } from "@/lib/utils";
import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import { Package, PackagePlus } from "lucide-react";
import Image from "next/image";
import { memo } from "react";

type Product = TGetPOSProductsOutput["data"]["products"][number];

type ProductCardProps = {
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

function ProductCard({ product, orgTracksStock, onSelect }: ProductCardProps) {
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
				"group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-2xs",
				"transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-md",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
			)}
		>
			{/* Imagem — 4:3 reduz altura sem sacrificar a leitura rápida do produto. */}
			<div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary/40">
				{product.imagemCapaUrl ? (
					<Image
						src={product.imagemCapaUrl}
						alt={product.nome}
						fill
						sizes="(min-width: 1280px) 16vw, (min-width: 768px) 25vw, 50vw"
						className="object-cover transition-transform duration-300 group-hover:scale-105"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Package className="h-10 w-10 text-muted-foreground/40" />
					</div>
				)}

				{isComplex ? (
					<Badge
						className="absolute right-1.5 top-1.5 z-10 gap-1 bg-brand-secondary px-1.5 py-0.5 text-[0.55rem] font-bold text-brand-secondary-foreground shadow-sm"
						title={hasVariants && hasAddOns ? "Variantes e adicionais" : hasVariants ? "Variantes" : "Adicionais"}
					>
						<PackagePlus className="h-3 w-3" />
						<span className="sr-only sm:not-sr-only">{hasVariants && hasAddOns ? "VAR + ADD" : hasVariants ? "VARIANTES" : "ADICIONAIS"}</span>
					</Badge>
				) : null}
			</div>

			{/* Corpo — conteúdo essencial em uma altura previsível para catálogos densos. */}
			<div className="flex min-h-[6.25rem] flex-1 flex-col gap-1.5 p-2.5">
				<div className="flex flex-col gap-0.5">
					<h3 className="line-clamp-2 min-h-8 text-xs font-bold leading-tight tracking-tight sm:text-sm">{product.nome}</h3>
					<p className="truncate text-[0.65rem] font-medium text-muted-foreground">{product.codigo}</p>
				</div>

				<div className="mt-auto flex items-end justify-between gap-2">
					<div className="min-w-0">
						{displayPrice.type === "starting-from" ? (
							<span className="block text-[0.55rem] font-bold uppercase leading-none tracking-wide text-muted-foreground">A partir de</span>
						) : null}
						<p className="truncate text-base font-black tabular-nums text-foreground">{formatToMoney(displayPrice.value)}</p>
					</div>

					{stockQuantity !== null ? (
						<div className="flex shrink-0 items-center gap-1">
							<span
								className={cn("h-1.5 w-1.5 rounded-full", {
									"bg-red-500": stockQuantity <= 0,
									"bg-yellow-500": stockQuantity > 0 && stockQuantity <= 10,
									"bg-green-500": stockQuantity > 10,
								})}
							/>
							<span className="text-[0.6rem] font-medium text-muted-foreground">{stockQuantity > 0 ? `${stockQuantity} un.` : "ESGOTADO"}</span>
						</div>
					) : null}
				</div>
			</div>
		</button>
	);
}

export default memo(ProductCard);
