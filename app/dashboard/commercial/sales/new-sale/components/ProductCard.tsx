import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TGetPOSProductsOutput } from "@/pages/api/pos/products";
import { Package, PackagePlus } from "lucide-react";
import Image from "next/image";

type ProductCardProps = {
	product: TGetPOSProductsOutput["data"]["products"][number];
	onClick: () => void;
};

export default function ProductCard({ product, onClick }: ProductCardProps) {
	const hasVariants = product.variantes && product.variantes.length > 0;
	const hasAddOns = product.addOnsReferencias && product.addOnsReferencias.length > 0;
	const isComplex = hasVariants || hasAddOns;

	// Get the price to display
	const getDisplayPrice = () => {
		if (hasVariants) {
			// Show "A partir de" with the lowest variant price
			const lowestPrice = Math.min(...product.variantes.map((v) => v.precoVenda));
			return {
				type: "starting-from" as const,
				value: lowestPrice,
			};
		}

		// Show product base price
		return {
			type: "fixed" as const,
			value: product.precoVenda ?? 0,
		};
	};

	const displayPrice = getDisplayPrice();

	return (
		<button
			type="button"
			className={cn("group relative bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border p-2 shadow-2xs min-h-[200px] h-fit")}
			onClick={onClick}
		>
			{/* Complex Product Badge */}
			{isComplex && (
				<Badge className="absolute top-3 right-3 gap-1 text-[0.65rem] font-bold bg-[#24549C] text-white z-10" variant="secondary">
					<PackagePlus className="w-3 h-3" />
					{hasVariants && hasAddOns ? "VAR + ADD" : hasVariants ? "VARIANTES" : "ADICIONAIS"}
				</Badge>
			)}

			{/* Product Image */}
			<div className="relative w-full aspect-square rounded-xl overflow-hidden bg-secondary/50 flex items-center justify-center">
				{product.imagemCapaUrl ? (
					<Image src={product.imagemCapaUrl} alt={product.descricao} fill className="object-cover" />
				) : (
					<Package className="w-12 h-12 text-muted-foreground" />
				)}
			</div>
			<div className="w-full flex flex-col gap-3 p-2">
				{/* Product Info */}
				<div className="flex-1 flex flex-col gap-1">
					<h3 className="font-bold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">{product.descricao}</h3>
					<p className="text-[0.65rem] text-muted-foreground font-medium">{product.codigo}</p>
				</div>

				{/* Price */}
				<div className="flex flex-col gap-0.5">
					{displayPrice.type === "starting-from" && <p className="text-[0.6rem] text-muted-foreground font-bold uppercase">A partir de</p>}
					<p className="text-xl font-black text-primary">{formatToMoney(displayPrice.value)}</p>
				</div>

				{/* Stock Indicator (if available) */}
				{product.quantidade !== null && product.quantidade !== undefined && (
					<div className="flex items-center gap-1.5">
						<div
							className={cn("w-2 h-2 rounded-full", {
								"bg-red-500": product.quantidade === 0,
								"bg-yellow-500": product.quantidade > 0 && product.quantidade <= 10,
								"bg-green-500": product.quantidade > 10,
							})}
						/>
						<span className="text-[0.65rem] text-muted-foreground font-medium">{product.quantidade > 0 ? `${product.quantidade} un.` : "SEM ESTOQUE"}</span>
					</div>
				)}
			</div>
		</button>
	);
}
