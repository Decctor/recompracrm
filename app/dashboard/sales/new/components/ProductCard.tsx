import { formatToMoney } from "@/lib/formatting";
import { getPOSDisplayPrice, getPOSProductActionLabel, getPOSProductKind } from "@/lib/pos/product-display";
import { resolvePOSProductStock } from "@/lib/pos/product-stock-display";
import { cn } from "@/lib/utils";
import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import { Package } from "lucide-react";
import Image from "next/image";
import { memo } from "react";
import ProductKindHint from "./ProductKindHint";
import ProductStockChip from "./ProductStockChip";

type Product = TGetPOSProductsOutput["data"]["products"][number];

type ProductCardProps = {
	product: Product;
	/** `preferencias.rastreamentoEstoque` da organização — sem o módulo, nenhum saldo é exibido. */
	orgTracksStock: boolean;
	onSelect: (product: Product) => void;
};

/**
 * Card de produto do PDV (modo grade). Mesma gramática da lista (`ProductListRow`): mesmo preço,
 * mesmo sinal de variantes/adicionais, mesmo chip de saldo, mesmo rótulo acessível. Quem alterna
 * entre os dois modos com um toque não deve aprender duas linguagens para o mesmo dado.
 */
function ProductCard({ product, orgTracksStock, onSelect }: ProductCardProps) {
	const kind = getPOSProductKind(product);
	const displayPrice = getPOSDisplayPrice(product);
	const priceLabel = formatToMoney(displayPrice.value);
	const stockQuantity = resolvePOSProductStock({ product, orgTracksStock });

	return (
		<button
			type="button"
			onClick={() => onSelect(product)}
			aria-label={getPOSProductActionLabel({ nome: product.nome, kind, priceLabel })}
			className={cn(
				"group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-2xs",
				"transition-[border-color,box-shadow,background-color,transform] duration-150 hover:border-primary/40 hover:shadow-md",
				"active:border-primary/40 active:bg-muted/60 motion-safe:active:scale-[0.99]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
			)}
		>
			{/* Imagem — 4:3 reduz altura sem sacrificar a leitura rápida do produto. */}
			<div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary/40">
				{product.imagemCapaUrl ? (
					<Image
						src={product.imagemCapaUrl}
						alt=""
						fill
						sizes="(min-width: 1280px) 16vw, (min-width: 768px) 25vw, 50vw"
						className="object-cover transition-transform duration-300 group-hover:scale-105"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Package className="size-10 text-muted-foreground/40" />
					</div>
				)}
				{/* Sobre a foto o sinal precisa de fundo próprio para ser lido; cor de superfície, não de marca. */}
				<ProductKindHint
					kind={kind}
					className="absolute left-1.5 top-1.5 z-10 rounded-full border border-border bg-card/90 px-1.5 py-0.5 text-foreground"
				/>
			</div>

			{/* Corpo — conteúdo essencial em uma altura previsível para catálogos densos. */}
			<div className="flex flex-1 flex-col gap-1.5 p-2.5">
				<div className="flex flex-col gap-0.5">
					<span className="line-clamp-2 min-h-[2.25rem] text-sm font-bold leading-tight tracking-tight">{product.nome}</span>
					<p className="truncate text-micro text-muted-foreground">{product.codigo}</p>
				</div>

				<div className="mt-auto flex items-end justify-between gap-2">
					<div className="min-w-0">
						{displayPrice.type === "starting-from" ? <span className="block text-micro text-muted-foreground">A partir de</span> : null}
						<p className="truncate text-sm font-extrabold leading-tight text-foreground">{priceLabel}</p>
					</div>
					{stockQuantity !== null ? <ProductStockChip quantity={stockQuantity} /> : null}
				</div>
			</div>
		</button>
	);
}

export default memo(ProductCard);
