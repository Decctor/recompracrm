import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { formatToMoney, normalizeForSearch } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { Check, Minus, Plus, Search, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useState } from "react";

const ADD_ON_SEARCH_THRESHOLD = 8;

// ============================================================================
// Montagem de produto (variante + adicionais + quantidade) compartilhada entre
// o PDV (ProductBuilderModal) e o workspace de contas (estágio "montar").
// A validação autoritativa de preço/regras acontece no service; aqui o estado
// só bloqueia o envio quando os mínimos/máximos dos grupos não são atendidos.
// ============================================================================

export type TBuilderProduct = TGetPOSProductsOutput["data"]["products"][number];
type TGrupo = TBuilderProduct["addOnsReferencias"][number]["grupo"];

export type TBuiltOrderItemModifier = {
	opcaoId: string;
	nome: string;
	quantidade: number;
	valorUnitario: number;
	valorTotal: number;
};

export type TBuiltOrderItem = {
	produtoId: string;
	produtoVarianteId: string | null;
	nome: string;
	codigo: string;
	imagemUrl: string | null;
	quantidade: number;
	valorUnitarioBase: number;
	valorModificadores: number;
	valorUnitarioFinal: number;
	valorTotalBruto: number;
	valorDesconto: number;
	valorTotalLiquido: number;
	observacoes: string | null;
	modificadores: TBuiltOrderItemModifier[];
};

type SelectedModifier = {
	opcaoId: string;
	quantidade: number;
};

export function useProductBuilder({ product }: { product: TBuilderProduct }) {
	const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
	const [selectedModifiers, setSelectedModifiers] = useState<SelectedModifier[]>([]);
	const [observacoes, setObservacoes] = useState("");
	const [quantity, setQuantity] = useState(1);

	const selectedVariant = selectedVariantId ? product.variantes.find((v) => v.id === selectedVariantId) : null;
	const availableReferences = useMemo(
		() => [...product.addOnsReferencias, ...(selectedVariant?.addOnsReferencias ?? [])],
		[product.addOnsReferencias, selectedVariant],
	);

	const hasVariants = product.variantes.length > 0;
	const hasAddOns = availableReferences.length > 0;
	const optionIndex = useMemo(() => {
		const index = new Map<string, { option: TGrupo["opcoes"][number]; grupo: TGrupo; searchKey: string }>();
		for (const reference of availableReferences) {
			for (const option of reference.grupo.opcoes) {
				index.set(option.id, { option, grupo: reference.grupo, searchKey: normalizeForSearch(option.nome) });
			}
		}
		return index;
	}, [availableReferences]);
	const selectedByOptionId = useMemo(() => new Map(selectedModifiers.map((modifier) => [modifier.opcaoId, modifier.quantidade])), [selectedModifiers]);
	const selectedCountByGroup = useMemo(() => {
		const counts = new Map<string, number>();
		for (const selected of selectedModifiers) {
			const indexedOption = optionIndex.get(selected.opcaoId);
			if (!indexedOption) continue;
			counts.set(indexedOption.grupo.id, (counts.get(indexedOption.grupo.id) ?? 0) + selected.quantidade);
		}
		return counts;
	}, [optionIndex, selectedModifiers]);

	// Seleciona automaticamente a única variante existente.
	useEffect(() => {
		if (hasVariants && product.variantes.length === 1 && !selectedVariantId) {
			setSelectedVariantId(product.variantes[0].id);
		}
	}, [hasVariants, product.variantes, selectedVariantId]);

	const basePrice = selectedVariant?.precoVenda ?? product.precoVenda ?? 0;

	const modifiersTotal = useMemo(() => {
		let total = 0;
		for (const selected of selectedModifiers) {
			const option = optionIndex.get(selected.opcaoId)?.option;
			if (option) total += option.precoDelta * selected.quantidade;
		}
		return total;
	}, [selectedModifiers, optionIndex]);

	const unitFinal = basePrice + modifiersTotal;
	const finalPrice = unitFinal * quantity;

	// Total selecionado por grupo (soma das quantidades das opções escolhidas).
	const selectedCountForGroup = useCallback((grupo: TGrupo) => selectedCountByGroup.get(grupo.id) ?? 0, [selectedCountByGroup]);

	// Primeira exigência não atendida — usado no aviso e no toast ao tentar confirmar.
	const blockReason = useMemo(() => {
		if (hasVariants && !selectedVariantId) return "Selecione uma variante para continuar.";
		for (const reference of availableReferences) {
			const grupo = reference.grupo;
			const total = selectedCountForGroup(grupo);
			if (grupo.minOpcoes > 0 && total < grupo.minOpcoes) {
				return grupo.minOpcoes > 1 ? `Escolha ao menos ${grupo.minOpcoes} opções em "${grupo.nome}".` : `Escolha uma opção em "${grupo.nome}".`;
			}
			if (grupo.maxOpcoes >= 1 && total > grupo.maxOpcoes) {
				return `Remova opções em "${grupo.nome}" (máximo ${grupo.maxOpcoes}).`;
			}
		}
		return null;
	}, [hasVariants, selectedVariantId, availableReferences, selectedCountForGroup]);

	const canConfirm = blockReason === null;

	// Alterna uma opção. Radio (maxOpcoes === 1) substitui a escolha do grupo.
	const toggleModifier = useCallback(
		(opcaoId: string, groupMaxOpcoes: number) => {
			setSelectedModifiers((prev) => {
				if (selectedByOptionId.has(opcaoId)) return prev.filter((modifier) => modifier.opcaoId !== opcaoId);

				if (groupMaxOpcoes === 1) {
					const grupo = optionIndex.get(opcaoId)?.grupo;
					if (grupo) {
						return [...prev.filter((modifier) => optionIndex.get(modifier.opcaoId)?.grupo.id !== grupo.id), { opcaoId, quantidade: 1 }];
					}
				}

				return [...prev, { opcaoId, quantidade: 1 }];
			});
		},
		[optionIndex, selectedByOptionId],
	);

	const updateModifierQuantity = useCallback((opcaoId: string, delta: number) => {
		setSelectedModifiers((prev) =>
			prev.map((m) => (m.opcaoId === opcaoId ? { ...m, quantidade: m.quantidade + delta } : m)).filter((m) => m.quantidade > 0),
		);
	}, []);

	// Monta o item no shape aceito por pedidos de conta e rascunho de venda
	// (o consumidor adiciona sua própria chave: tempId no PDV, cartKey no workspace).
	const buildItem = useCallback((): TBuiltOrderItem | null => {
		if (blockReason) return null;

		const modifiers: TBuiltOrderItemModifier[] = [];
		for (const selected of selectedModifiers) {
			const option = optionIndex.get(selected.opcaoId)?.option;
			if (option) {
				modifiers.push({
					opcaoId: option.id,
					nome: option.nome,
					quantidade: selected.quantidade,
					valorUnitario: option.precoDelta,
					valorTotal: option.precoDelta * selected.quantidade,
				});
			}
		}

		const itemName = selectedVariant ? `${product.nome} - ${selectedVariant.nome}` : product.nome;

		return {
			produtoId: product.id,
			produtoVarianteId: selectedVariantId,
			nome: itemName,
			codigo: selectedVariant?.codigo ?? product.codigo,
			imagemUrl: selectedVariant?.imagemCapaUrl ?? product.imagemCapaUrl,
			quantidade: quantity,
			valorUnitarioBase: basePrice,
			valorModificadores: modifiersTotal,
			valorUnitarioFinal: unitFinal,
			valorTotalBruto: unitFinal * quantity,
			valorDesconto: 0,
			valorTotalLiquido: unitFinal * quantity,
			observacoes: observacoes.trim() || null,
			modificadores: modifiers,
		};
	}, [
		blockReason,
		selectedModifiers,
		optionIndex,
		selectedVariant,
		selectedVariantId,
		product,
		quantity,
		basePrice,
		modifiersTotal,
		unitFinal,
		observacoes,
	]);

	return {
		selectedVariantId,
		setSelectedVariantId,
		selectedVariant,
		availableReferences,
		hasVariants,
		hasAddOns,
		basePrice,
		modifiersTotal,
		unitFinal,
		finalPrice,
		quantity,
		setQuantity,
		selectedModifiers,
		selectedByOptionId,
		optionIndex,
		selectedCountForGroup,
		observacoes,
		setObservacoes,
		blockReason,
		canConfirm,
		toggleModifier,
		updateModifierQuantity,
		buildItem,
	};
}

export type TUseProductBuilder = ReturnType<typeof useProductBuilder>;

type AddOnSearchFieldProps = {
	value: string;
	onChange: (value: string) => void;
	onClear: () => void;
};

function AddOnSearchField({ value, onChange, onClear }: AddOnSearchFieldProps) {
	return (
		<InputGroup className="h-10 rounded-xl bg-popover">
			<InputGroupInput
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder="Buscar adicional..."
				aria-label="Buscar adicionais"
				inputMode="search"
				enterKeyHint="search"
				autoComplete="off"
			/>
			<InputGroupAddon align="inline-start">
				<Search />
			</InputGroupAddon>
			{value ? (
				<InputGroupAddon align="inline-end" className="has-[>button]:mr-0">
					<InputGroupButton size="icon-xs" aria-label="Limpar busca" onClick={onClear}>
						<X />
					</InputGroupButton>
				</InputGroupAddon>
			) : null}
		</InputGroup>
	);
}

type ProductBuilderFormProps = {
	product: TBuilderProduct;
	builder: TUseProductBuilder;
	/**
	 * O modal exibe quantidade/total/pendências dentro do form; o workspace
	 * renderiza tudo isso na própria barra de ação fixa (showFooter=false).
	 */
	showFooter?: boolean;
	showImage?: boolean;
};

export function ProductBuilderForm({ product, builder, showFooter = true, showImage = true }: ProductBuilderFormProps) {
	const {
		selectedVariantId,
		setSelectedVariantId,
		selectedVariant,
		availableReferences,
		hasVariants,
		hasAddOns,
		finalPrice,
		quantity,
		setQuantity,
		selectedModifiers,
		selectedByOptionId,
		optionIndex,
		selectedCountForGroup,
		observacoes,
		setObservacoes,
		blockReason,
		toggleModifier,
		updateModifierQuantity,
	} = builder;
	const [addOnQuery, setAddOnQuery] = useState("");
	const deferredQuery = useDeferredValue(addOnQuery);
	const normalizedQuery = normalizeForSearch(deferredQuery);
	const isFiltering = normalizedQuery.length > 0;
	const isStale = addOnQuery !== deferredQuery;
	const observacoesId = useId();

	const headerImage = selectedVariant?.imagemCapaUrl ?? product.imagemCapaUrl;
	const totalOptionCount = useMemo(
		() => availableReferences.reduce((total, reference) => total + reference.grupo.opcoes.length, 0),
		[availableReferences],
	);
	const showSearch = totalOptionCount >= ADD_ON_SEARCH_THRESHOLD;
	const visibleReferences = useMemo(() => {
		if (!isFiltering) return availableReferences;
		return availableReferences.flatMap((reference) => {
			const visibleOptions = reference.grupo.opcoes.filter(
				(option) => selectedByOptionId.has(option.id) || optionIndex.get(option.id)?.searchKey.includes(normalizedQuery),
			);
			return visibleOptions.length > 0 ? [{ ...reference, grupo: { ...reference.grupo, opcoes: visibleOptions } }] : [];
		});
	}, [availableReferences, isFiltering, normalizedQuery, optionIndex, selectedByOptionId]);

	return (
		<div className="flex flex-col gap-6">
			{showImage && headerImage ? (
				<div className="relative h-40 w-full overflow-hidden rounded-2xl bg-secondary/40">
					<Image src={headerImage} alt={product.nome} fill sizes="(min-width: 768px) 28rem, 100vw" className="object-cover" />
				</div>
			) : null}

			<section className="flex flex-col gap-1.5">
				<label htmlFor={observacoesId} className="text-micro uppercase tracking-wide text-muted-foreground">
					Observação do item
				</label>
				<Textarea
					id={observacoesId}
					rows={1}
					maxLength={500}
					value={observacoes}
					onChange={(event) => setObservacoes(event.target.value)}
					placeholder="Ex.: sem cebola, ponto mal passado"
					className="min-h-10 py-2 text-sm"
				/>
				{observacoes.length > 400 ? <span className="text-micro self-end tabular-nums text-muted-foreground">{observacoes.length}/500</span> : null}
			</section>

			{/* Variantes — mesmas linhas compactas dos adicionais */}
			{hasVariants ? (
				<section className="flex flex-col gap-3">
					<GroupHeading title="Escolha a variante" hint="Escolha 1" required satisfied={!!selectedVariantId} count={selectedVariantId ? 1 : 0} max={1} />
					<div className="flex flex-col gap-2">
						{product.variantes.map((variant) => (
							<OptionRow
								key={variant.id}
								name={variant.nome}
								price={variant.precoVenda}
								priceMode="absolute"
								control="radio"
								selected={selectedVariantId === variant.id}
								onToggle={() => setSelectedVariantId(variant.id)}
							/>
						))}
					</div>
				</section>
			) : null}

			{/* Adicionais */}
			{hasAddOns && showSearch ? (
				<div className="sticky top-0 z-10 flex w-full min-w-0 flex-col gap-1.5 bg-popover py-1 before:absolute before:inset-x-0 before:-top-2 before:h-2 before:bg-popover">
					<AddOnSearchField value={addOnQuery} onChange={setAddOnQuery} onClear={() => setAddOnQuery("")} />
					{selectedModifiers.length > 0 ? (
						<p className="text-micro px-1 text-muted-foreground">
							{selectedModifiers.length} {selectedModifiers.length === 1 ? "adicional selecionado" : "adicionais selecionados"}
						</p>
					) : null}
				</div>
			) : null}
			{hasAddOns
				? visibleReferences.map((reference) => {
						const grupo = reference.grupo;
						const isRequired = grupo.minOpcoes > 0;
						const isSingle = grupo.maxOpcoes === 1;
						const hasMax = grupo.maxOpcoes >= 1;

						const selectedCount = selectedCountForGroup(grupo);
						const isSatisfied = selectedCount >= grupo.minOpcoes;
						const groupFull = hasMax && selectedCount >= grupo.maxOpcoes;

						const hint = isSingle ? "Escolha 1" : hasMax ? `Escolha até ${grupo.maxOpcoes}` : "Quantas quiser";

						return (
							<section key={reference.produtoAddOnId} className={cn("flex flex-col gap-3 transition-opacity", isStale && "opacity-70")}>
								<GroupHeading
									title={grupo.nome}
									hint={hint}
									required={isRequired}
									satisfied={isSatisfied}
									count={selectedCount}
									max={hasMax ? grupo.maxOpcoes : 0}
								/>
								<div className="flex flex-col gap-2">
									{grupo.opcoes.map((option) => {
										const selectedQuantity = selectedByOptionId.get(option.id);
										const maxQty = option.maxQtdePorItem ?? 1;
										const control: OptionControl = isSingle ? "radio" : maxQty > 1 ? "quantity" : "checkbox";

										return (
											<OptionRow
												key={option.id}
												name={option.nome}
												price={option.precoDelta}
												priceMode="delta"
												control={control}
												selected={selectedQuantity !== undefined}
												groupFull={groupFull}
												quantity={selectedQuantity ?? 1}
												maxQty={maxQty}
												onToggle={() => toggleModifier(option.id, grupo.maxOpcoes)}
												onIncrement={() => (selectedQuantity !== undefined ? updateModifierQuantity(option.id, 1) : toggleModifier(option.id, grupo.maxOpcoes))}
												onDecrement={() => updateModifierQuantity(option.id, -1)}
											/>
										);
									})}
								</div>
							</section>
						);
					})
				: null}
			{hasAddOns && isFiltering && visibleReferences.length === 0 ? (
				<div className={cn("flex flex-col items-center gap-3 py-8 text-center transition-opacity", isStale && "opacity-70")}>
					<p className="text-sm font-semibold">Nenhum adicional encontrado para &quot;{deferredQuery}&quot;.</p>
					<Button size="sm" variant="outline" onClick={() => setAddOnQuery("")}>
						LIMPAR BUSCA
					</Button>
				</div>
			) : null}

			{/* Rodapé — quantidade, total e aviso de pendências */}
			{showFooter ? (
				<div className="flex flex-col gap-3 border-t pt-4">
					<div className="flex items-center justify-between">
						<span className="text-sm font-bold">QUANTIDADE</span>
						<ProductBuilderStepper
							value={quantity}
							onDecrement={() => setQuantity(Math.max(1, quantity - 1))}
							onIncrement={() => setQuantity(quantity + 1)}
							decrementDisabled={quantity <= 1}
						/>
					</div>

					<div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
						<span className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Total</span>
						<span className="text-2xl font-black tabular-nums text-foreground">{formatToMoney(finalPrice)}</span>
					</div>

					{blockReason ? <p className="text-center text-xs font-medium text-destructive">{blockReason}</p> : null}
				</div>
			) : null}
		</div>
	);
}

type GroupHeadingProps = {
	title: string;
	hint: string;
	required: boolean;
	satisfied: boolean;
	count: number;
	max: number;
};

function GroupHeading({ title, hint, required, satisfied, count, max }: GroupHeadingProps) {
	const showCounter = max >= 1;
	const atMax = count >= max;
	const counterClass = atMax ? "bg-primary text-primary-foreground" : count > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";

	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex min-w-0 flex-col gap-0.5">
				<h3 className="truncate text-sm font-bold tracking-tight">
					{title}
					{required ? <span className="ml-1 text-destructive">*</span> : null}
				</h3>
				<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{hint}</span>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{showCounter ? (
					<span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums transition-colors", counterClass)}>{`${count} / ${max}`}</span>
				) : null}
				{required && !satisfied ? (
					<span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive">Obrigatório</span>
				) : null}
			</div>
		</div>
	);
}

type OptionControl = "radio" | "checkbox" | "quantity";

type OptionRowProps = {
	name: string;
	price: number;
	priceMode: "absolute" | "delta";
	control: OptionControl;
	selected: boolean;
	groupFull?: boolean;
	quantity?: number;
	maxQty?: number;
	onToggle: () => void;
	onIncrement?: () => void;
	onDecrement?: () => void;
};

function OptionRow({
	name,
	price,
	priceMode,
	control,
	selected,
	groupFull = false,
	quantity = 1,
	maxQty = 1,
	onToggle,
	onIncrement,
	onDecrement,
}: OptionRowProps) {
	const quantityActive = control === "quantity" && selected;
	const showPrice = priceMode === "absolute" || price !== 0;
	const priceLabel = priceMode === "absolute" ? formatToMoney(price) : `+ ${formatToMoney(price)}`;
	const addDisabled = control !== "radio" && groupFull && !selected;

	const body = (
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			<span className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{name}</span>
			{showPrice ? <span className="text-xs font-bold text-primary">{priceLabel}</span> : null}
		</div>
	);

	const indicator =
		control === "quantity" ? (
			<span className="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-muted-foreground/30 text-muted-foreground">
				<Plus className="size-3.5" />
			</span>
		) : (
			<SelectionIndicator selected={selected} shape={control === "radio" ? "circle" : "square"} />
		);

	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded-xl border p-2.5 transition-colors",
				selected ? "border-primary bg-primary/5" : "border-border",
				addDisabled && "opacity-50",
			)}
		>
			{quantityActive ? (
				body
			) : (
				<button
					type="button"
					onClick={control === "quantity" ? onIncrement : onToggle}
					aria-pressed={selected}
					disabled={addDisabled}
					className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
				>
					{body}
					{indicator}
				</button>
			)}

			{quantityActive ? (
				<ProductBuilderStepper
					value={quantity}
					onDecrement={onDecrement}
					onIncrement={onIncrement}
					incrementDisabled={quantity >= maxQty || groupFull}
					size="sm"
					className="shrink-0"
				/>
			) : null}
		</div>
	);
}

function SelectionIndicator({ selected, shape }: { selected: boolean; shape: "circle" | "square" }) {
	return (
		<span
			className={cn(
				"flex size-6 shrink-0 items-center justify-center border-2 transition-colors",
				shape === "circle" ? "rounded-full" : "rounded-md",
				selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30",
			)}
		>
			{selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
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

export function ProductBuilderStepper({
	value,
	onIncrement,
	onDecrement,
	incrementDisabled,
	decrementDisabled,
	size = "default",
	className,
}: StepperProps) {
	const btn = size === "sm" ? "size-7 rounded-lg" : "size-9 rounded-lg";
	const icon = size === "sm" ? "size-3" : "size-4";
	const valueWidth = size === "sm" ? "w-6 text-sm" : "w-10 text-lg";

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<Button size="icon" variant="outline" className={btn} onClick={onDecrement} disabled={decrementDisabled}>
				<Minus className={icon} />
			</Button>
			<span className={cn("text-center font-black tabular-nums", valueWidth)}>{value}</span>
			<Button size="icon" variant="outline" className={btn} onClick={onIncrement} disabled={incrementDisabled}>
				<Plus className={icon} />
			</Button>
		</div>
	);
}
