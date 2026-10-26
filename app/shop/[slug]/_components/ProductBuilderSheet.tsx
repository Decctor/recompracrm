"use client";

import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { formatToMoney } from "@/lib/formatting";
import { describeAddOnPricingRule, resolveSelectedAddOnPrices } from "@/lib/products/add-on-pricing";
import { notifyItemAddedToCart } from "@/lib/shop/cart-toast";
import type { TShopCatalogProduct } from "@/lib/shop/catalog";
import { cn } from "@/lib/utils";
import type { TShopCartItem } from "@/schemas/shop";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Check, Minus, Plus } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useShop } from "./ShopProvider";

type ProductBuilderSheetProps = {
	product: TShopCatalogProduct;
	editItem?: TShopCartItem | null;
	onClose: () => void;
};

type SelectedModifier = {
	opcaoId: string;
	quantidade: number;
};

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export default function ProductBuilderSheet({ product, editItem = null, onClose }: ProductBuilderSheetProps) {
	const { availability, orderState } = useShop();
	const { colors } = useOrgColors();
	const isOpen = availability.status === "ABERTA";
	const isEditing = !!editItem?.tempId;

	const [selectedVariantId, setSelectedVariantId] = useState<string | null>(editItem?.produtoVarianteId ?? null);
	const [selectedModifiers, setSelectedModifiers] = useState<SelectedModifier[]>(
		editItem?.modificadores.map((modifier) => ({ opcaoId: modifier.opcaoId, quantidade: modifier.quantidade })) ?? [],
	);
	const [quantity, setQuantity] = useState(editItem?.quantidade ?? 1);

	const selectedVariant = selectedVariantId ? product.variantes.find((v) => v.id === selectedVariantId) : null;
	const availableReferences = [...product.addOnsReferencias, ...(selectedVariant?.addOnsReferencias ?? [])];

	const hasVariants = product.variantes.length > 0;
	const hasAddOns = availableReferences.length > 0;

	useEffect(() => {
		if (hasVariants && product.variantes.length === 1 && !selectedVariantId) {
			setSelectedVariantId(product.variantes[0].id);
		}
	}, [hasVariants, product.variantes, selectedVariantId]);

	const getBasePrice = () => {
		if (selectedVariantId) {
			const variant = product.variantes.find((v) => v.id === selectedVariantId);
			return variant?.precoVenda ?? 0;
		}
		return product.precoVenda ?? 0;
	};

	// Regra de preço do grupo (pizza meio a meio pelo maior valor): mesma conta do carrinho e do servidor.
	const getModifiersTotal = () => {
		const unitPrices = resolveSelectedAddOnPrices(availableReferences, selectedModifiers);
		return selectedModifiers.reduce((total, selected) => total + (unitPrices.get(selected.opcaoId) ?? 0) * selected.quantidade, 0);
	};

	const getFinalPrice = () => {
		const base = getBasePrice();
		const modifiers = getModifiersTotal();
		return (base + modifiers) * quantity;
	};

	const canAddToCart = () => {
		if (hasVariants && !selectedVariantId) return false;

		for (const reference of availableReferences) {
			const grupo = reference.grupo;
			const selectedFromGroup = selectedModifiers.filter((sm) => grupo.opcoes.some((o) => o.id === sm.opcaoId));
			const totalQuantity = selectedFromGroup.reduce((sum, sm) => sum + sm.quantidade, 0);
			if (grupo.minOpcoes > 0 && totalQuantity < grupo.minOpcoes) {
				return false;
			}
			if (grupo.maxOpcoes >= 1 && totalQuantity > grupo.maxOpcoes) {
				return false;
			}
		}

		return true;
	};

	const toggleModifier = (opcaoId: string, groupMaxOpcoes: number) => {
		setSelectedModifiers((prev) => {
			const exists = prev.find((m) => m.opcaoId === opcaoId);
			if (exists) {
				return prev.filter((m) => m.opcaoId !== opcaoId);
			}

			if (groupMaxOpcoes === 1) {
				const belongsToGroup = availableReferences.find((ref) => ref.grupo.opcoes.some((o) => o.id === opcaoId));
				if (belongsToGroup) {
					const otherOptionsInGroup = belongsToGroup.grupo.opcoes.map((o) => o.id);
					return [...prev.filter((m) => !otherOptionsInGroup.includes(m.opcaoId)), { opcaoId, quantidade: 1 }];
				}
			}

			return [...prev, { opcaoId, quantidade: 1 }];
		});
	};

	const updateModifierQuantity = (opcaoId: string, delta: number) => {
		setSelectedModifiers((prev) =>
			prev
				.map((m) => {
					if (m.opcaoId === opcaoId) {
						const newQty = m.quantidade + delta;
						return { ...m, quantidade: newQty };
					}
					return m;
				})
				.filter((m) => m.quantidade > 0),
		);
	};

	const isAddable = isOpen && canAddToCart();

	const handleAddToCart = () => {
		if (!isAddable) return;

		const itemName = selectedVariant ? `${product.nome} - ${selectedVariant.nome}` : product.nome;
		const itemImage = selectedVariant?.imagemCapaUrl ?? product.imagemCapaUrl;

		if (isEditing && editItem?.tempId) {
			orderState.replaceItem(editItem.tempId, {
				tempId: editItem.tempId,
				produtoId: product.id,
				produtoVarianteId: selectedVariantId,
				quantidade: quantity,
				modificadores: selectedModifiers,
			});
			notifyItemAddedToCart({
				name: itemName,
				imageUrl: itemImage,
				primaryColor: colors.primary,
				primaryForeground: colors.primaryForeground,
				mode: "updated",
			});
		} else {
			orderState.addItem({
				tempId: crypto.randomUUID(),
				produtoId: product.id,
				produtoVarianteId: selectedVariantId,
				quantidade: quantity,
				modificadores: selectedModifiers,
			});
			notifyItemAddedToCart({
				name: itemName,
				imageUrl: itemImage,
				primaryColor: colors.primary,
				primaryForeground: colors.primaryForeground,
			});
		}
		onClose();
	};

	const headerImage = selectedVariant?.imagemCapaUrl ?? product.imagemCapaUrl;
	const blockedHint = !isOpen
		? "A loja está fechada. Consulte as opções e volte durante o horário de atendimento."
		: hasVariants && !selectedVariantId
			? "Escolha uma variante para continuar"
			: "Complete as seleções obrigatórias para continuar";

	return (
		<Drawer open onOpenChange={(open) => !open && onClose()}>
			<DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[88dvh]">
				<MotionConfig reducedMotion="user">
					<DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
						<DrawerTitle className="text-lg font-black tracking-tight">{product.nome}</DrawerTitle>
						<DrawerDescription className="whitespace-pre-line text-pretty">{product.descricao || "Monte do seu jeito"}</DrawerDescription>
					</DrawerHeader>

					<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 flex flex-1 flex-col gap-7 overflow-auto px-1 pb-2">
						{headerImage && (
							<div className="relative h-44 w-full overflow-hidden rounded-2xl bg-muted shadow-sm">
								<Image src={headerImage} alt={product.nome} fill className="object-cover" sizes="100vw" />
							</div>
						)}

						{hasVariants && (
							<section className="flex flex-col gap-3">
								<GroupHeading
									title="Escolha a variante"
									hint="Escolha 1"
									required={!selectedVariantId}
									satisfied={!!selectedVariantId}
									count={selectedVariantId ? 1 : 0}
									total={1}
								/>
								<div className="flex flex-col gap-2">
									{product.variantes.map((variant) => (
										<OptionTile
											key={variant.id}
											image={variant.imagemCapaUrl}
											name={variant.nome}
											price={variant.precoVenda}
											priceMode="absolute"
											selected={selectedVariantId === variant.id}
											control="radio"
											onToggle={() => setSelectedVariantId(variant.id)}
										/>
									))}
								</div>
							</section>
						)}

						{hasAddOns &&
							availableReferences.map((reference) => {
								const grupo = reference.grupo;
								const isRequired = grupo.minOpcoes > 0;
								const isSingle = grupo.maxOpcoes === 1;

								const selectedFromGroup = selectedModifiers.filter((sm) => grupo.opcoes.some((o) => o.id === sm.opcaoId));
								const selectedCount = selectedFromGroup.reduce((sum, sm) => sum + sm.quantidade, 0);
								const isSatisfied = selectedCount >= grupo.minOpcoes;
								const groupFull = grupo.maxOpcoes >= 1 && selectedCount >= grupo.maxOpcoes;

								const pickHint = isSingle ? "Escolha 1" : grupo.maxOpcoes > 1 ? `Escolha até ${grupo.maxOpcoes}` : "Quantas quiser";
								const pricingHint = describeAddOnPricingRule(grupo.regraPreco);
								const hint = pricingHint && !isSingle ? `${pickHint} · ${pricingHint}` : pickHint;

								return (
									<section key={reference.produtoAddOnId} className="flex flex-col gap-3">
										<GroupHeading title={grupo.nome} hint={hint} required={isRequired} satisfied={isSatisfied} count={selectedCount} total={grupo.maxOpcoes} />
										<div className="flex flex-col gap-2">
											{grupo.opcoes.map((option) => {
												const selected = selectedModifiers.find((m) => m.opcaoId === option.id);
												const maxQty = option.maxQtdePorItem ?? 1;
												const optionImage = option.produto?.imagemCapaUrl ?? option.produtoVariante?.imagemCapaUrl ?? null;
												const control = isSingle ? "radio" : maxQty > 1 ? "quantity" : "checkbox";

												return (
													<OptionTile
														key={option.id}
														image={optionImage}
														name={option.nome}
														price={option.precoDelta}
														priceMode="delta"
														selected={!!selected}
														control={control}
														groupFull={groupFull}
														onToggle={() => toggleModifier(option.id, grupo.maxOpcoes)}
														quantity={selected?.quantidade ?? 1}
														maxQty={maxQty}
														onIncrement={() => (selected ? updateModifierQuantity(option.id, 1) : toggleModifier(option.id, grupo.maxOpcoes))}
														onDecrement={() => updateModifierQuantity(option.id, -1)}
													/>
												);
											})}
										</div>
									</section>
								);
							})}
					</div>

					<div className="mt-2 flex shrink-0 flex-col gap-3 border-t pt-4">
						<div className="flex items-center justify-between">
							<span className="text-sm font-bold">Quantidade</span>
							<Stepper
								value={quantity}
								onDecrement={() => setQuantity((q) => Math.max(1, q - 1))}
								onIncrement={() => setQuantity((q) => q + 1)}
								decrementDisabled={quantity <= 1}
							/>
						</div>

						{!isAddable && <p className="text-center text-xs font-medium text-muted-foreground">{blockedHint}</p>}

						<Button
							className="h-14 w-full rounded-xl text-base font-bold transition-transform active:scale-[0.99]"
							onClick={handleAddToCart}
							disabled={!isAddable}
						>
							<span>{isEditing ? "SALVAR ALTERAÇÕES" : "ADICIONAR AO CARRINHO"}</span>
							<span className="ml-auto overflow-hidden">
								<motion.span
									key={getFinalPrice()}
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.25, ease: EASE_OUT }}
									className="inline-block font-black"
								>
									{formatToMoney(getFinalPrice())}
								</motion.span>
							</span>
						</Button>
					</div>
				</MotionConfig>
			</DrawerContent>
		</Drawer>
	);
}

type GroupHeadingProps = {
	title: string;
	hint: string;
	required: boolean;
	satisfied: boolean;
	count: number;
	total: number;
};

function GroupHeading({ title, hint, required, satisfied, count, total }: GroupHeadingProps) {
	const atMax = count >= total;
	const counterClass = atMax ? "bg-brand text-brand-foreground" : count > 0 ? "bg-brand/10 text-foreground" : "bg-muted text-muted-foreground";

	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex flex-col gap-0.5">
				<h3 className="text-sm font-black tracking-tight">{title}</h3>
				<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{hint}</span>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{total >= 1 && (
					<span
						className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums transition-colors", counterClass)}
					>{`${count} / ${total}`}</span>
				)}
				{required && !satisfied && <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">Obrigatório</span>}
			</div>
		</div>
	);
}

type OptionControl = "radio" | "checkbox" | "quantity";

type OptionTileProps = {
	image: string | null;
	name: string;
	price: number;
	priceMode: "absolute" | "delta";
	selected: boolean;
	control: OptionControl;
	groupFull?: boolean;
	onToggle: () => void;
	quantity?: number;
	maxQty?: number;
	onIncrement?: () => void;
	onDecrement?: () => void;
};

function OptionTile({
	image,
	name,
	price,
	priceMode,
	selected,
	control,
	groupFull = false,
	onToggle,
	quantity = 1,
	maxQty = 1,
	onIncrement,
	onDecrement,
}: OptionTileProps) {
	const quantityActive = control === "quantity" && selected;
	const showPrice = priceMode === "absolute" || price !== 0;
	const priceLabel = priceMode === "absolute" ? formatToMoney(price) : `+ ${formatToMoney(price)}`;
	const addDisabled = control !== "radio" && groupFull && !selected;

	const media = image ? (
		<div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
			<Image src={image} alt={name} fill className="object-cover" sizes="48px" />
		</div>
	) : (
		<div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted">
			<span className="text-lg font-black text-muted-foreground/40">{name.charAt(0).toUpperCase()}</span>
		</div>
	);

	const text = (
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			<span className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{name}</span>
			{showPrice && <span className="text-xs font-bold text-primary">{priceLabel}</span>}
		</div>
	);

	const indicator =
		control === "quantity" ? (
			<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border-2 border-muted-foreground/30 text-muted-foreground">
				<Plus className="size-4" />
			</span>
		) : (
			<SelectionIndicator selected={selected} shape={control === "radio" ? "circle" : "square"} className="mt-0.5" />
		);

	return (
		<div
			className={cn(
				"flex items-start gap-3 rounded-xl border p-2.5 transition-all duration-200",
				selected ? "border-brand bg-brand/5 shadow-sm ring-1 ring-brand/30" : "border-border",
				addDisabled && "opacity-50",
			)}
		>
			{quantityActive ? (
				<div className="flex min-w-0 flex-1 items-start gap-3">
					{media}
					{text}
				</div>
			) : (
				<button
					type="button"
					onClick={control === "quantity" ? onIncrement : onToggle}
					aria-pressed={selected}
					disabled={addDisabled}
					className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:cursor-not-allowed"
				>
					{media}
					{text}
					{indicator}
				</button>
			)}

			{quantityActive && (
				<Stepper
					value={quantity}
					onDecrement={onDecrement}
					onIncrement={onIncrement}
					decrementDisabled={false}
					incrementDisabled={quantity >= maxQty || groupFull}
					size="sm"
					className="mt-0.5 shrink-0"
				/>
			)}
		</div>
	);
}

function SelectionIndicator({ selected, shape, className }: { selected: boolean; shape: "circle" | "square"; className?: string }) {
	return (
		<span
			className={cn(
				"flex size-6 shrink-0 items-center justify-center border-2 transition-colors",
				shape === "circle" ? "rounded-full" : "rounded-md",
				selected ? "border-brand bg-brand text-brand-foreground" : "border-muted-foreground/30",
				className,
			)}
		>
			<AnimatePresence>
				{selected && (
					<motion.span
						initial={{ scale: 0 }}
						animate={{ scale: 1 }}
						exit={{ scale: 0 }}
						transition={{ type: "spring", stiffness: 500, damping: 28 }}
						className="flex"
					>
						<Check className="size-3.5" strokeWidth={3} />
					</motion.span>
				)}
			</AnimatePresence>
		</span>
	);
}

type StepperProps = {
	value: number;
	onIncrement?: () => void;
	onDecrement?: () => void;
	incrementDisabled?: boolean;
	decrementDisabled?: boolean;
	size?: "sm" | "default";
	className?: string;
};

function Stepper({ value, onIncrement, onDecrement, incrementDisabled, decrementDisabled, size = "default", className }: StepperProps) {
	const btn = size === "sm" ? "size-7 rounded-lg" : "size-9 rounded-lg";
	const icon = size === "sm" ? "size-3" : "size-4";
	const valueWidth = size === "sm" ? "w-6 text-sm" : "w-10 text-lg";

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<Button size="icon" variant="outline" className={btn} aria-label="Diminuir quantidade" onClick={onDecrement} disabled={decrementDisabled}>
				<Minus className={icon} />
			</Button>
			<span className={cn("text-center font-black tabular-nums", valueWidth)} aria-live="polite">
				{value}
			</span>
			<Button size="icon" variant="outline" className={btn} aria-label="Aumentar quantidade" onClick={onIncrement} disabled={incrementDisabled}>
				<Plus className={icon} />
			</Button>
		</div>
	);
}
