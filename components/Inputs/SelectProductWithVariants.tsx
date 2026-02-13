import { getErrorMessage } from "@/lib/errors";
import { formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useProductsBySearchInfiniteQuery } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import type { TGetProductsBySearchOutput } from "@/pages/api/products/search";
import { BadgeCheck, Check, ChevronDown, ChevronRight, ChevronsUpDown, Package } from "lucide-react";
import { useMemo, useState } from "react";
import ErrorComponent from "../Layouts/ErrorComponent";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "../ui/command";
import { Drawer, DrawerContent, DrawerTrigger } from "../ui/drawer";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

type TProductBySearch = TGetProductsBySearchOutput["data"]["products"][number];
type TProductVariantBySearch = TProductBySearch["variantes"][number];

export type TSelectProductWithVariantsValue = {
	product: TProductBySearch;
	productVariant?: TProductVariantBySearch;
} | null;

type SelectProductWithVariantsProps = {
	width?: string;
	label: string;
	labelClassName?: string;
	holderClassName?: string;
	showLabel?: boolean;
	value: {
		productId: string;
		productVariantId?: string | null;
	} | null;
	editable?: boolean;
	resetOptionLabel: string;
	handleChange: (value: TSelectProductWithVariantsValue) => void;
	onReset: () => void;
};

function SelectProductWithVariants({
	width,
	label,
	labelClassName,
	holderClassName,
	showLabel = true,
	value,
	editable = true,
	resetOptionLabel,
	handleChange,
	onReset,
}: SelectProductWithVariantsProps) {
	const { products, productsMatched, hasMorePages, loadMore, isLoading, isFetchingNextPage, isError, error, search, updateSearch } =
		useProductsBySearchInfiniteQuery();
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const [isOpen, setIsOpen] = useState(false);
	const [expandedProductIds, setExpandedProductIds] = useState<string[]>([]);
	const inputIdentifier = label.toLowerCase().replace(" ", "_");

	const selectedLabel = useMemo(() => {
		if (!value?.productId) return resetOptionLabel;
		if (!value.productVariantId) return products.find((product) => product.id === value.productId)?.descricao ?? resetOptionLabel;
		return `${products.find((product) => product.id === value.productId)?.descricao ?? resetOptionLabel} - ${products.find((product) => product.id === value.productId)?.variantes?.find((variant) => variant.id === value.productVariantId)?.nome ?? resetOptionLabel}`;
	}, [resetOptionLabel, value, products]);

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
			type="button"
			disabled={!editable}
			variant="outline"
			aria-expanded={isOpen}
			className={cn("w-full justify-between truncate border-primary/20", holderClassName)}
		>
			<span className="truncate">{selectedLabel}</span>
			<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
		</Button>
	);

	const renderContent = () => (
		<Command shouldFilter={false} className="w-full">
			<CommandInput placeholder="Filtre o produto desejado..." value={search} onValueChange={updateSearch} />
			<CommandList className="max-h-[430px]">
				<CommandGroup>
					<CommandItem value="reset-selection-option" onSelect={handleReset} className="cursor-pointer">
						{resetOptionLabel}
						<Check className={cn("ml-auto h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
					</CommandItem>
				</CommandGroup>
				<CommandSeparator />

				{isLoading && <div className="p-3 text-center text-xs text-primary/80">Carregando produtos...</div>}
				{isError && (
					<div className="p-2">
						<ErrorComponent msg={getErrorMessage(error)} />
					</div>
				)}

				{!isLoading && !isError && (
					<>
						<div className="px-3 py-2 text-xs text-primary/80">
							{productsMatched > 1 ? `${productsMatched} produtos encontrados.` : `${productsMatched} produto encontrado.`}
						</div>
						<CommandGroup>
							{products.length === 0 && <div className="p-2 text-center text-sm italic text-primary">Sem opções disponíveis.</div>}
							<div className="flex flex-col gap-2 p-1">
								{products.map((product) => {
									const variants = product.variantes ?? [];
									const hasVariants = variants.length > 0;
									const expanded = isProductExpanded(product.id);
									const selectedProduct = value?.productId === product.id && !value?.productVariantId;

									return (
										<div key={product.id} className="rounded-lg border border-primary/20">
											<button
												type="button"
												className={cn("flex w-full items-center gap-2 px-2 py-2 text-left", hasVariants ? "cursor-default" : "cursor-pointer hover:bg-accent")}
												onClick={() => {
													if (hasVariants) return;
													handleProductSelect(product);
												}}
											>
												<Avatar className="h-8 w-8 min-h-8 min-w-8 rounded-md">
													<AvatarImage src={product.imagemCapaUrl || undefined} alt={product.descricao} />
													<AvatarFallback className="rounded-md">{formatNameAsInitials(product.descricao)}</AvatarFallback>
												</Avatar>
												<div className="min-w-0 flex-1">
													<p className="truncate text-sm font-medium">{product.descricao}</p>
													<p className="truncate text-[0.7rem] text-primary/70">{product.codigo}</p>
												</div>

												{hasVariants && (
													<div className="flex items-center gap-1">
														<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] text-primary">{variants.length} variantes</span>
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

												{selectedProduct && <Check className="h-4 w-4 text-primary" />}
											</button>

											{hasVariants && expanded && (
												<div className="border-t border-primary/10 px-2 py-2">
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
																	<Avatar className="h-7 w-7 min-h-7 min-w-7 rounded-md">
																		<AvatarImage src={variant.imagemCapaUrl || product.imagemCapaUrl || undefined} alt={variant.nome} />
																		<AvatarFallback className="rounded-md">
																			<Package className="h-3 w-3" />
																		</AvatarFallback>
																	</Avatar>
																	<div className="min-w-0 flex-1">
																		<p className="truncate text-xs font-medium">{variant.nome}</p>
																		<div className="flex items-center gap-1 text-[0.65rem] text-primary/70">
																			{variant.codigo ? <span className="truncate">{variant.codigo}</span> : null}
																			{variant.precoVenda ? <span>{formatToMoney(variant.precoVenda)}</span> : null}
																		</div>
																	</div>
																	{selectedVariant ? <BadgeCheck className="h-4 w-4 text-primary" /> : null}
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
			</CommandList>
		</Command>
	);

	if (isDesktop) {
		return (
			<div className={cn("flex w-full flex-col gap-1", width && `w-[${width}]`)}>
				{showLabel && (
					<Label htmlFor={inputIdentifier} className={cn("text-start text-sm font-medium tracking-tight text-primary/80", labelClassName)}>
						{label}
					</Label>
				)}
				<Popover open={isOpen} onOpenChange={setIsOpen}>
					<PopoverTrigger asChild>{renderTrigger()}</PopoverTrigger>
					<PopoverContent className="w-[410px] p-0" align="start">
						{renderContent()}
					</PopoverContent>
				</Popover>
			</div>
		);
	}

	return (
		<div className={cn("flex w-full flex-col gap-1", width && `w-[${width}]`)}>
			{showLabel && (
				<Label htmlFor={inputIdentifier} className={cn("text-start text-sm font-medium tracking-tight text-primary/80", labelClassName)}>
					{label}
				</Label>
			)}
			<Drawer open={isOpen} onOpenChange={setIsOpen}>
				<DrawerTrigger asChild>{renderTrigger()}</DrawerTrigger>
				<DrawerContent>
					<div className="mt-4 border-t p-2 pb-8">{renderContent()}</div>
				</DrawerContent>
			</Drawer>
		</div>
	);
}

export default SelectProductWithVariants;
