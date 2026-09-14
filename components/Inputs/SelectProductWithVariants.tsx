import { getErrorMessage } from "@/lib/errors";
import { formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useProductsBySearchInfiniteQuery } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import type { TGetProductsBySearchOutput } from "@/app/api/products/search/route";
import { BadgeCheck, Check, ChevronDown, ChevronRight, ChevronsUpDown, Package } from "lucide-react";
import { type ComponentProps, type ReactNode, useId, useMemo, useRef, useState } from "react";
import ErrorComponent from "../Layouts/ErrorComponent";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "../ui/command";
import { Drawer, DrawerContent, DrawerTrigger } from "../ui/drawer";
import { Field, FieldLabel } from "../ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

type TProductBySearch = TGetProductsBySearchOutput["data"]["products"][number];
type TProductVariantBySearch = TProductBySearch["variantes"][number];

export type TSelectProductWithVariantsValue = {
	product: TProductBySearch;
	productVariant?: TProductVariantBySearch;
} | null;

type SelectProductWithVariantsProps = {
	label: string;
	labelClassName?: string;
	holderClassName?: string;
	contentClassName?: string;
	popoverContentClassName?: string;
	drawerContentClassName?: string;
	commandListClassName?: string;
	showLabel?: boolean;
	initialSearch?: string;
	value: {
		productId: string;
		productVariantId?: string | null;
	} | null;
	editable?: boolean;
	resetOptionLabel: string;
	handleChange: (value: TSelectProductWithVariantsValue) => void;
	onReset: () => void;
	selectedLabel?: string;
	renderTriggerContent?: (ctx: { selectedLabel: string; isOpen: boolean; value: SelectProductWithVariantsProps["value"] }) => ReactNode;
	renderProductContent?: (ctx: { product: TProductBySearch; selected: boolean; expanded: boolean; hasVariants: boolean }) => ReactNode;
	renderVariantContent?: (ctx: { product: TProductBySearch; variant: TProductVariantBySearch; selected: boolean }) => ReactNode;
	triggerProps?: ComponentProps<typeof Button>;
};

function SelectProductWithVariants({
	label,
	labelClassName,
	holderClassName,
	contentClassName,
	popoverContentClassName,
	drawerContentClassName,
	commandListClassName,
	showLabel = true,
	initialSearch = "",
	value,
	editable = true,
	resetOptionLabel,
	handleChange,
	onReset,
	selectedLabel: selectedLabelProp,
	renderTriggerContent,
	renderProductContent,
	renderVariantContent,
	triggerProps,
}: SelectProductWithVariantsProps) {
	const { products, productsMatched, hasMorePages, loadMore, isLoading, isFetchingNextPage, isError, error, search, updateSearch } =
		useProductsBySearchInfiniteQuery({ initialSearch });
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const [isOpen, setIsOpen] = useState(false);
	const [expandedProductIds, setExpandedProductIds] = useState<string[]>([]);
	const generatedId = useId();
	const inputIdentifier = `${label.toLowerCase().replaceAll(" ", "_")}_${generatedId}`;
	const triggerRef = useRef<HTMLButtonElement>(null);
	// `undefined`, nunca `null`: o FloatingPortal do Base UI trata `container === null` como "container
	// ainda não resolvido" e desiste de criar o portal, então o popup não renderiza. Só com `undefined`
	// ele cai no fallback `document.body` — que é o caso de toda tela que não é modal.
	const dialogContainer = (triggerRef.current?.closest("[data-dialog-container]") as HTMLElement | null) ?? undefined;

	const selectedLabel = useMemo(() => {
		if (!value?.productId) return resetOptionLabel;
		const selectedProduct = products.find((product) => product.id === value.productId);
		if (!selectedProduct) return selectedLabelProp ?? resetOptionLabel;
		if (!value.productVariantId) return selectedProduct.nome;
		const selectedVariant = selectedProduct.variantes?.find((variant) => variant.id === value.productVariantId);
		return `${selectedProduct.nome} - ${selectedVariant?.nome ?? selectedLabelProp ?? resetOptionLabel}`;
	}, [resetOptionLabel, selectedLabelProp, value, products]);

	function toggleProduct(productId: string) {
		setExpandedProductIds((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
	}

	function handleProductSelect(product: TProductBySearch) {
		handleChange({ product });
		setIsOpen(false);
	}

	function handleVariantSelect(product: TProductBySearch, productVariant: TProductVariantBySearch) {
		handleChange({ product, productVariant });
		setIsOpen(false);
	}

	function handleReset() {
		onReset();
		setIsOpen(false);
	}

	function isProductExpanded(productId: string) {
		return expandedProductIds.includes(productId);
	}

	const renderTrigger = () => (
		<Button
			ref={triggerRef}
			id={inputIdentifier}
			type="button"
			disabled={!editable}
			variant="outline"
			aria-expanded={isOpen}
			className={cn("w-full justify-between truncate border-border", holderClassName)}
			{...triggerProps}
		>
			{renderTriggerContent ? renderTriggerContent({ selectedLabel, isOpen, value }) : <span className="truncate">{selectedLabel}</span>}
			<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
		</Button>
	);

	const listScrollClassName = cn(
		"scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 min-h-0 overflow-y-auto overscroll-contain",
		commandListClassName ?? "max-h-[min(430px,55vh)]",
	);

	const renderContent = () => (
		<Command shouldFilter={false} className={cn("flex w-full flex-col overflow-hidden", contentClassName)}>
			<CommandInput placeholder="Filtre o produto desejado..." value={search} onValueChange={updateSearch} />
			<CommandList className="max-h-none overflow-visible p-0">
				<CommandGroup>
					<CommandItem value="reset-selection-option" onSelect={handleReset} data-checked={!value} className="cursor-pointer">
						{resetOptionLabel}
					</CommandItem>
				</CommandGroup>
				<CommandSeparator />

				<div className={listScrollClassName} onWheel={(event) => event.stopPropagation()}>
					{isLoading && <div className="p-3 text-center text-xs text-foreground/80">Carregando produtos...</div>}
					{isError && (
						<div className="p-2">
							<ErrorComponent msg={getErrorMessage(error)} />
						</div>
					)}

					{!isLoading && !isError && (
						<>
							<div className="px-3 py-2 text-xs text-foreground/80">
								{productsMatched > 1 ? `${productsMatched} produtos encontrados.` : `${productsMatched} produto encontrado.`}
							</div>
							<CommandGroup>
								{products.length === 0 && <div className="p-2 text-center text-sm italic text-foreground">Sem opções disponíveis.</div>}
								<div className="flex flex-col gap-2 p-1">
									{products.map((product) => {
										const variants = product.variantes ?? [];
										const hasVariants = variants.length > 0;
										const expanded = isProductExpanded(product.id);
										const selectedProduct = value?.productId === product.id && !value?.productVariantId;

										return (
											<div key={product.id} className="rounded-lg border border-border">
												<button
													type="button"
													className={cn("flex w-full items-center gap-2 px-2 py-2 text-left", hasVariants ? "cursor-default" : "cursor-pointer hover:bg-accent")}
													onClick={() => {
														if (hasVariants) return;
														handleProductSelect(product);
													}}
												>
													{renderProductContent ? (
														renderProductContent({ product, selected: selectedProduct, expanded, hasVariants })
													) : (
														<>
															<Avatar className="h-8 w-8 min-h-8 min-w-8 rounded-md">
																<AvatarImage src={product.imagemCapaUrl || undefined} alt={product.nome} />
																<AvatarFallback className="rounded-md">{formatNameAsInitials(product.nome)}</AvatarFallback>
															</Avatar>
															<div className="min-w-0 flex-1">
																<p className="truncate text-sm font-medium">{product.nome}</p>
																<p className="truncate text-[0.7rem] text-foreground/70">{product.codigo}</p>
															</div>
														</>
													)}

													{hasVariants && (
														<div className="flex items-center gap-1">
															<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] text-foreground">{variants.length} variantes</span>
															<Button
																type="button"
																variant="ghost"
																size="icon"
																className="h-7 w-7"
																onMouseDown={(event) => {
																	event.preventDefault();
																	event.stopPropagation();
																}}
																onClick={(event) => {
																	event.preventDefault();
																	event.stopPropagation();
																	toggleProduct(product.id);
																}}
															>
																{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
															</Button>
														</div>
													)}

													{selectedProduct && <Check className="h-4 w-4 text-foreground" />}
												</button>

												{hasVariants && expanded && (
													<div className="border-t border-border px-2 py-2">
														<div className="flex flex-col gap-1">
															{variants.map((variant) => {
																const selectedVariant = value?.productId === product.id && value?.productVariantId === variant.id;

																return (
																	<button
																		key={variant.id}
																		type="button"
																		className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
																		onClick={() => handleVariantSelect(product, variant)}
																	>
																		{renderVariantContent ? (
																			renderVariantContent({ product, variant, selected: selectedVariant })
																		) : (
																			<>
																				<Avatar className="h-7 w-7 min-h-7 min-w-7 rounded-md">
																					<AvatarImage src={variant.imagemCapaUrl || product.imagemCapaUrl || undefined} alt={variant.nome} />
																					<AvatarFallback className="rounded-md">
																						<Package className="h-3 w-3" />
																					</AvatarFallback>
																				</Avatar>
																				<div className="min-w-0 flex-1">
																					<p className="truncate text-xs font-medium">{variant.nome}</p>
																					<div className="flex items-center gap-1 text-[0.65rem] text-foreground/70">
																						{variant.codigo ? <span className="truncate">{variant.codigo}</span> : null}
																						{variant.precoVenda ? <span>{formatToMoney(variant.precoVenda)}</span> : null}
																					</div>
																				</div>
																			</>
																		)}
																		{selectedVariant ? <BadgeCheck className="h-4 w-4 text-foreground" /> : null}
																	</button>
																);
															})}
														</div>
													</div>
												)}
											</div>
										);
									})}
								</div>
							</CommandGroup>

							{hasMorePages && (
								<div className="p-2">
									<Button type="button" variant="outline" className="w-full" disabled={isFetchingNextPage} onClick={loadMore}>
										{isFetchingNextPage ? "CARREGANDO..." : "BUSCAR MAIS"}
									</Button>
								</div>
							)}
						</>
					)}
				</div>
			</CommandList>
		</Command>
	);

	if (isDesktop) {
		return (
			<Field className="gap-1" data-disabled={!editable}>
				{showLabel && (
					<FieldLabel htmlFor={inputIdentifier} className={cn("text-start text-sm font-medium tracking-tight text-foreground/80", labelClassName)}>
						{label}
					</FieldLabel>
				)}
				<Popover modal={false} open={isOpen} onOpenChange={setIsOpen}>
					<PopoverTrigger render={renderTrigger()} />
					<PopoverContent
						container={dialogContainer}
						className={cn("flex max-h-[min(480px,var(--available-height))] w-[410px] flex-col overflow-hidden p-0", popoverContentClassName)}
						align="start"
					>
						{renderContent()}
					</PopoverContent>
				</Popover>
			</Field>
		);
	}

	return (
		<Field className="gap-1" data-disabled={!editable}>
			{showLabel && (
				<FieldLabel htmlFor={inputIdentifier} className={cn("text-start text-sm font-medium tracking-tight text-foreground/80", labelClassName)}>
					{label}
				</FieldLabel>
			)}
			<Drawer open={isOpen} onOpenChange={setIsOpen}>
				<DrawerTrigger asChild>{renderTrigger()}</DrawerTrigger>
				<DrawerContent className="overflow-hidden">
					<div className={cn("mt-4 flex min-h-0 flex-col border-t p-2 pb-8", drawerContentClassName)}>{renderContent()}</div>
				</DrawerContent>
			</Drawer>
		</Field>
	);
}

export default SelectProductWithVariants;
