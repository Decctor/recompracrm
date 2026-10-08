import { formatToMoney } from "@/lib/formatting";
import { getPOSDisplayPrice, getPOSProductActionLabel, getPOSProductKind } from "@/lib/pos/product-display";
import { resolvePOSProductStock } from "@/lib/pos/product-stock-display";
import { cn } from "@/lib/utils";
import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import { ChevronRight, Package, Plus } from "lucide-react";
import Image from "next/image";
import { memo } from "react";
import ProductKindHint from "./ProductKindHint";
import ProductStockChip from "./ProductStockChip";

type Product = TGetPOSProductsOutput["data"]["products"][number];

type ProductListRowProps = {
	product: Product;
	/** `preferencias.rastreamentoEstoque` da organização — sem o módulo, nenhum saldo é exibido. */
	orgTracksStock: boolean;
	onSelect: (product: Product) => void;
};

/**
 * Linha de produto do PDV (modo lista, o padrão).
 *
 * A ordem de leitura no balcão é nome, preço, e só então "como adiciona". O nome é a única coisa
 * que o cliente falou em voz alta, então ele tem a linha de título inteira: nada com `shrink-0` ao
 * lado dele. Num celular de 412px sobram ~140px para o título, o que dá duas linhas de ~18
 * caracteres; a versão anterior deixava ~30px e mostrava "G…".
 *
 * O que o toque faz é dito pela afordância à direita, não por um selo: `+` em produto simples (cai
 * direto no carrinho) e `›` em produto com variantes ou adicionais (abre o builder).
 */
function ProductListRow({ product, orgTracksStock, onSelect }: ProductListRowProps) {
	const kind = getPOSProductKind(product);
	const isSimple = kind === "SIMPLES";
	const displayPrice = getPOSDisplayPrice(product);
	const priceLabel = formatToMoney(displayPrice.value);
	const stockQuantity = resolvePOSProductStock({ product, orgTracksStock });

	return (
		<button
			type="button"
			onClick={() => onSelect(product)}
			aria-label={getPOSProductActionLabel({ nome: product.nome, kind, priceLabel })}
			className={cn(
				"group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left shadow-2xs",
				"transition-[border-color,box-shadow,background-color,transform] duration-150 hover:border-primary/40 hover:shadow-md",
				"active:border-primary/40 active:bg-muted/60 motion-safe:active:scale-[0.99]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
			)}
		>
			{/* Identidade do produto */}
			<div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-secondary/40">
				{product.imagemCapaUrl ? (
					<Image src={product.imagemCapaUrl} alt="" fill sizes="56px" className="object-cover" />
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Package className="size-5 text-muted-foreground/40" />
					</div>
				)}
			</div>

			<div className="min-w-0 flex-1">
				<span className="line-clamp-2 text-base font-bold leading-tight tracking-tight sm:line-clamp-1">{product.nome}</span>
				{/* Metadados numa linha só, nunca duas: código, grupo (só no desktop, no celular é
				    redundante com o chip de filtro e quebrava em duas linhas com os nomes longos que a
				    loja cadastra), natureza do produto e saldo. */}
				<div className="mt-1 flex min-w-0 items-center gap-x-2 overflow-hidden text-micro text-muted-foreground">
					<span className="truncate">{product.codigo}</span>
					{product.grupo ? (
						<>
							<span aria-hidden className="hidden sm:inline">
								·
							</span>
							<span className="hidden truncate sm:inline">{product.grupo}</span>
						</>
					) : null}
					<ProductKindHint kind={kind} />
					{stockQuantity !== null ? <ProductStockChip quantity={stockQuantity} /> : null}
				</div>
			</div>

			{/* Preço: mesmo tamanho e um peso acima do nome; o nome vence pela posição e pela largura. */}
			<div className="shrink-0 text-right">
				{displayPrice.type === "starting-from" ? <span className="block text-micro text-muted-foreground">A partir de</span> : null}
				<span className="block text-base font-extrabold leading-tight text-foreground">{priceLabel}</span>
			</div>

			{/* Afordância do toque: visível também no celular, onde não há hover para revelá-la. */}
			<span
				aria-hidden
				className={cn(
					"flex size-7 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
					isSimple
						? "bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground group-active:bg-primary group-active:text-primary-foreground"
						: "text-muted-foreground group-hover:text-foreground",
				)}
			>
				{isSimple ? <Plus className="size-4" /> : <ChevronRight className="size-4" />}
			</span>
		</button>
	);
}

export default memo(ProductListRow);
