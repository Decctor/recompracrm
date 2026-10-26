"use client";

import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { Button } from "@/components/ui/button";
import { formatToMoney } from "@/lib/formatting";
import { notifyItemAddedToCart } from "@/lib/shop/cart-toast";
import type { TShopCatalogProduct } from "@/lib/shop/catalog";
import { cn } from "@/lib/utils";
import { Eye, Plus } from "lucide-react";
import Image from "next/image";
import { useShopActions, useShopData } from "./ShopProvider";

type ProductCardProps = {
	product: TShopCatalogProduct;
	variant?: "compact" | "full";
};

export default function ProductCard({ product, variant = "compact" }: ProductCardProps) {
	const { availability } = useShopData();
	const { addItem, setBuilderProduct } = useShopActions();
	const { colors } = useOrgColors();
	const isOpen = availability.status === "ABERTA";

	const hasVariants = product.variantes.length > 0;
	const hasAddOns = product.addOnsReferencias.length > 0;
	const isComplex = hasVariants || hasAddOns;

	const lowestPrice = hasVariants ? Math.min(...product.variantes.map((v) => v.precoVenda ?? 0)) : (product.precoVenda ?? 0);
	// Escolha obrigatória que muda o preço (sabores de pizza por tamanho) também faz o preço "a partir de".
	const priceVaries =
		hasVariants ||
		product.addOnsReferencias.some((reference) => reference.grupo.minOpcoes > 0 && reference.grupo.opcoes.some((option) => option.precoDelta !== 0));

	const handleClick = () => {
		if (!isOpen) {
			if (isComplex) setBuilderProduct(product);
			return;
		}

		if (isComplex) {
			setBuilderProduct(product);
			return;
		}

		addItem({
			tempId: crypto.randomUUID(),
			produtoId: product.id,
			produtoVarianteId: null,
			quantidade: 1,
			modificadores: [],
		});
		notifyItemAddedToCart({
			name: product.nome,
			imageUrl: product.imagemCapaUrl,
			primaryColor: colors.primary,
			primaryForeground: colors.primaryForeground,
		});
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			handleClick();
		}
	};

	if (variant === "full") {
		return (
			<div
				role="button"
				tabIndex={0}
				aria-label={product.nome}
				className="group flex gap-3 p-3 rounded-xl border bg-card hover:bg-accent/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={handleClick}
				onKeyDown={handleKeyDown}
			>
				{product.imagemCapaUrl ? (
					<div className="relative w-32 h-32 rounded-lg overflow-hidden bg-muted flex-shrink-0">
						<Image src={product.imagemCapaUrl} alt={product.nome} fill className="object-cover" sizes="128px" />
					</div>
				) : (
					<div className="w-32 h-32 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
						<span className="text-2xl font-black text-muted-foreground/50">{product.nome.charAt(0).toUpperCase()}</span>
					</div>
				)}

				<div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
					<div>
						<h3 className="font-semibold text-sm line-clamp-2">{product.nome}</h3>
						{product.descricao && <p className="text-xs text-muted-foreground mt-0.5">{product.descricao}</p>}
					</div>

					<div className="flex items-center justify-between gap-2 mt-2">
						<span className="font-black text-primary">
							{priceVaries && "a partir de "}
							{formatToMoney(lowestPrice)}
						</span>
						<Button
							size="icon"
							variant="brand"
							className="h-9 w-9 rounded-full"
							aria-label={isOpen ? `Adicionar ${product.nome}` : `Ver ${product.nome}`}
							tabIndex={-1}
							onClick={(e) => {
								e.stopPropagation();
								handleClick();
							}}
						>
							{isOpen ? <Plus className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			role="button"
			tabIndex={0}
			aria-label={product.nome}
			className={cn(
				"group flex flex-col rounded-xl border bg-card overflow-hidden cursor-pointer hover:shadow-md transition-shadow",
				"w-[180px] sm:w-[240px] flex-shrink-0",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
			)}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
		>
			{product.imagemCapaUrl ? (
				<div className="relative w-full aspect-square bg-muted">
					<Image src={product.imagemCapaUrl} alt={product.nome} fill className="object-cover" sizes="(min-width: 640px) 240px, 180px" />
				</div>
			) : (
				<div className="w-full aspect-square bg-muted flex items-center justify-center">
					<span className="text-3xl font-black text-muted-foreground/50">{product.nome.charAt(0).toUpperCase()}</span>
				</div>
			)}

			<div className="p-2.5 flex flex-col gap-1">
				<h3 className="font-semibold text-xs line-clamp-2 leading-tight">{product.nome}</h3>
				<span className="font-black text-sm text-primary">
					{priceVaries && "a partir de "}
					{formatToMoney(lowestPrice)}
				</span>
			</div>
		</div>
	);
}
