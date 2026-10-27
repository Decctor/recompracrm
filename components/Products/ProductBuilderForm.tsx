import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { formatToMoney, normalizeForSearch } from "@/lib/formatting";
import { formatItemQuantity } from "@/lib/pos/scale-barcode";
import { resolvePOSProductStock } from "@/lib/pos/product-stock-display";
import { describeStockShortage, resolveAvailableStock } from "@/lib/pos/stock-availability";
import { describeAddOnPricingRule, resolveSelectedAddOnPrices } from "@/lib/products/add-on-pricing";
import {
	buildVariantAxes,
	fillSingleChoices,
	findMatchingVariantIds,
	findVariantIdsForValue,
	resolveAxisValuePrice,
	resolveSelectedVariantId,
	selectAxisValue,
	selectionFromVariant,
	type TVariantAxes,
	type TVariantAxisOptionInput,
	type TVariantAxisSelection,
	type TVariantAxisValue,
} from "@/lib/products/variant-axes";
import { cn } from "@/lib/utils";
import type { TProductAddOnPricingRuleEnum } from "@/schemas/enums";
import { Check, Minus, Plus, Search, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useDeferredValue, useId, useMemo, useState } from "react";

const ADD_ON_SEARCH_THRESHOLD = 8;

// ============================================================================
// Montagem de produto (variante + adicionais + quantidade) compartilhada entre
// o PDV (ProductBuilderModal) e o workspace de contas (estágio "montar").
// A validação autoritativa de preço/regras acontece no service; aqui o estado
// só bloqueia o envio quando os mínimos/máximos dos grupos não são atendidos.
// ============================================================================

// Shape ESTRUTURAL do que a montagem lê — não o row do PDV. Assim a mesma montagem serve a
// grade do PDV (row completo), o workspace de contas e o cardápio público do QR, que envia um
// recorte sem custo. Quem tem mais campos continua compatível; quem tem menos não compila.
export type TBuilderAddOnOption = { id: string; nome: string; precoDelta: number; maxQtdePorItem?: number | null };
export type TBuilderAddOnReference = {
	produtoAddOnId: string;
	grupo: {
		id: string;
		nome: string;
		minOpcoes: number;
		maxOpcoes: number;
		// Ausente = SOMA. MAIOR/MEDIA: o grupo cobra a opção mais cara / a média (sabores de pizza).
		regraPreco?: TProductAddOnPricingRuleEnum | null;
		opcoes: TBuilderAddOnOption[];
	};
};
// Estoque, em dois formatos: o PDV e as contas recebem saldo e rastreamento (o número aparece e
// limita); o cardápio público recebe só `disponivel`, porque o saldo não vai para a página pública.
type TBuilderStockFields = {
	quantidade?: number | null;
	rastreamentoEstoqueAtivo?: boolean | null;
	disponivel?: boolean;
};
export type TBuilderVariant = TBuilderStockFields & {
	id: string;
	nome: string;
	codigo?: string | null;
	imagemCapaUrl?: string | null;
	precoVenda: number;
	addOnsReferencias: TBuilderAddOnReference[];
	/** Combinação de eixos (Cor, Tamanho). Sem ela, a escolha cai na lista plana. */
	valoresOpcoes?: { opcaoId: string; opcaoValorId: string }[];
};
export type TBuilderProduct = TBuilderStockFields & {
	id: string;
	nome: string;
	codigo: string;
	imagemCapaUrl: string | null;
	precoVenda: number | null;
	variantes: TBuilderVariant[];
	addOnsReferencias: TBuilderAddOnReference[];
	/** Eixos da variação, para agrupar a escolha (ver lib/products/variant-axes.ts). */
	opcoes?: TVariantAxisOptionInput[];
};

/**
 * Estoque nas telas internas: o par de flags que a baixa da venda consulta (módulo da organização
 * + rastreamento do item) e o que o carrinho da tela já reserva. Ausente (cardápio público), o
 * builder usa só `disponivel`.
 */
export type TBuilderStockContext = {
	orgTracksStock: boolean;
	reservedFor: (key: { produtoId: string; produtoVarianteId: string | null }) => number;
};

/** Saldo rastreado (`null` = sem rastreamento ou não exibível) e o que sobra para vender agora. */
export type TBuilderStock = { stock: number | null; available: number | null };
type TGrupo = TBuilderAddOnReference["grupo"];

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
	/** Saldo rastreado no momento da escolha: o carrinho limita o "+" da linha por ele. */
	saldoEstoque?: number | null;
};

type SelectedModifier = {
	opcaoId: string;
	quantidade: number;
};

export function useProductBuilder({
	product,
	initialVariantId = null,
	stock = null,
}: {
	product: TBuilderProduct;
	initialVariantId?: string | null;
	stock?: TBuilderStockContext | null;
}) {
	// Variante já identificada antes de abrir (código de barras da própria variante): o operador só
	// escolhe os adicionais. Ignorada se não pertencer ao produto, para não travar o estado.
	const validInitialVariantId = initialVariantId && product.variantes.some((variant) => variant.id === initialVariantId) ? initialVariantId : null;
	// Com eixos, a escolha é por eixo e a variante é derivada da combinação; sem eles, lista plana.
	const axes = useMemo(() => buildVariantAxes({ options: product.opcoes ?? [], variants: product.variantes }), [product.opcoes, product.variantes]);
	const [axisSelection, setAxisSelection] = useState<TVariantAxisSelection>(() =>
		axes ? fillSingleChoices(axes, selectionFromVariant(axes, validInitialVariantId)) : {},
	);
	const [flatVariantId, setFlatVariantId] = useState<string | null>(validInitialVariantId);
	const [selectedModifiers, setSelectedModifiers] = useState<SelectedModifier[]>([]);
	const [observacoes, setObservacoes] = useState("");
	const [quantity, setQuantity] = useState(1);

	// A única variante existente já vem escolhida (na lista plana; nos eixos, `fillSingleChoices`).
	const selectedVariantId = axes
		? resolveSelectedVariantId(axes, axisSelection)
		: (flatVariantId ?? (product.variantes.length === 1 ? product.variantes[0].id : null));
	const setSelectedVariantId = useCallback(
		(variantId: string) => {
			if (axes) setAxisSelection(selectionFromVariant(axes, variantId));
			else setFlatVariantId(variantId);
		},
		[axes],
	);
	const chooseAxisValue = useCallback(
		(axisId: string, valueId: string) => {
			if (axes) setAxisSelection((prev) => selectAxisValue(axes, prev, axisId, valueId));
		},
		[axes],
	);

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

	// Estoque: mesma regra da baixa da venda, menos o que o carrinho da tela já reserva.
	const stockFor = useCallback(
		(entity: TBuilderStockFields, produtoVarianteId: string | null): TBuilderStock => {
			if (!stock) return { stock: null, available: entity.disponivel === false ? 0 : null };
			const tracked = resolvePOSProductStock({
				product: { quantidade: entity.quantidade ?? null, rastreamentoEstoqueAtivo: entity.rastreamentoEstoqueAtivo ?? null },
				orgTracksStock: stock.orgTracksStock,
			});
			return {
				stock: tracked,
				available: resolveAvailableStock({ stock: tracked, reserved: stock.reservedFor({ produtoId: product.id, produtoVarianteId }) }),
			};
		},
		[stock, product.id],
	);
	const variantStock = useMemo(
		() => new Map(product.variantes.map((variant) => [variant.id, stockFor(variant, variant.id)])),
		[product.variantes, stockFor],
	);
	const selectedStock: TBuilderStock | null = hasVariants
		? selectedVariantId
			? (variantStock.get(selectedVariantId) ?? null)
			: null
		: stockFor(product, null);
	// Unidades inteiras no builder: o teto do stepper é o disponível arredondado para baixo.
	const maxQuantity =
		selectedStock?.available === null || selectedStock?.available === undefined ? null : Math.max(0, Math.floor(selectedStock.available + 1e-9));
	const itemName = selectedVariant ? `${product.nome} - ${selectedVariant.nome}` : product.nome;

	const basePrice = selectedVariant?.precoVenda ?? product.precoVenda ?? 0;

	// Preço efetivo por opção com a regra do grupo (no meio a meio pelo maior valor, o sabor mais
	// barato sai a 0). É a mesma conta que o servidor refaz na validação da venda.
	const modifierUnitPrices = useMemo(
		() => resolveSelectedAddOnPrices(availableReferences, selectedModifiers),
		[availableReferences, selectedModifiers],
	);

	const modifiersTotal = useMemo(() => {
		let total = 0;
		for (const selected of selectedModifiers) {
			const option = optionIndex.get(selected.opcaoId)?.option;
			if (option) total += (modifierUnitPrices.get(selected.opcaoId) ?? option.precoDelta) * selected.quantidade;
		}
		return total;
	}, [selectedModifiers, optionIndex, modifierUnitPrices]);

	const unitFinal = basePrice + modifiersTotal;
	const finalPrice = unitFinal * quantity;

	// Total selecionado por grupo (soma das quantidades das opções escolhidas).
	const selectedCountForGroup = useCallback((grupo: TGrupo) => selectedCountByGroup.get(grupo.id) ?? 0, [selectedCountByGroup]);

	// Primeira exigência não atendida — usado no aviso e no toast ao tentar confirmar.
	const blockReason = useMemo(() => {
		if (hasVariants && !selectedVariantId) return "Selecione uma variante para continuar.";
		const stockShortage = describeStockShortage({ nome: itemName, available: selectedStock?.available ?? null, quantity });
		if (stockShortage) return stockShortage;
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
	}, [hasVariants, selectedVariantId, itemName, selectedStock, quantity, availableReferences, selectedCountForGroup]);

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
				const valorUnitario = modifierUnitPrices.get(option.id) ?? option.precoDelta;
				modifiers.push({
					opcaoId: option.id,
					nome: option.nome,
					quantidade: selected.quantidade,
					valorUnitario,
					valorTotal: valorUnitario * selected.quantidade,
				});
			}
		}

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
			saldoEstoque: selectedStock?.stock ?? null,
		};
	}, [
		blockReason,
		selectedModifiers,
		optionIndex,
		modifierUnitPrices,
		selectedVariant,
		selectedVariantId,
		product,
		quantity,
		basePrice,
		modifiersTotal,
		unitFinal,
		observacoes,
		itemName,
		selectedStock,
	]);

	return {
		selectedVariantId,
		setSelectedVariantId,
		selectedVariant,
		axes,
		axisSelection,
		chooseAxisValue,
		variantStock,
		selectedStock,
		maxQuantity,
		showStockNumbers: !!stock,
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
		axes,
		axisSelection,
		chooseAxisValue,
		variantStock,
		maxQuantity,
		showStockNumbers,
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

	// A foto acompanha a escolha parcial: escolhida a cor, já aparece a foto dela.
	const firstAxis = axes?.axes[0];
	const firstAxisImage = firstAxis ? (firstAxis.values.find((value) => value.id === axisSelection[firstAxis.id])?.imageUrl ?? null) : null;
	const headerImage = selectedVariant?.imagemCapaUrl ?? firstAxisImage ?? product.imagemCapaUrl;
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

			{/* Variantes — agrupadas por eixo (Cor, Tamanho) quando o cadastro tem eixos; senão, as mesmas
			    linhas compactas dos adicionais */}
			{hasVariants && axes ? (
				<VariantAxesPicker
					axes={axes}
					selection={axisSelection}
					onChoose={chooseAxisValue}
					variants={product.variantes}
					variantStock={variantStock}
					showStockNumbers={showStockNumbers}
				/>
			) : hasVariants ? (
				<section className="flex flex-col gap-3">
					<GroupHeading title="Escolha a variante" hint="Escolha 1" required satisfied={!!selectedVariantId} count={selectedVariantId ? 1 : 0} max={1} />
					<div className="flex flex-col gap-2">
						{product.variantes.map((variant) => {
							const variantAvailability = variantStock.get(variant.id);
							const soldOut = isSoldOut(variantAvailability);
							return (
								<OptionRow
									key={variant.id}
									name={variant.nome}
									price={variant.precoVenda}
									priceMode="absolute"
									control="radio"
									selected={selectedVariantId === variant.id}
									disabled={soldOut && selectedVariantId !== variant.id}
									detail={describeStockLabel(variantAvailability, showStockNumbers)}
									leading={
										product.variantes.some((candidate) => candidate.imagemCapaUrl) ? (
											<VariantAvatar imageUrl={variant.imagemCapaUrl ?? null} nome={variant.nome} />
										) : null
									}
									onToggle={() => setSelectedVariantId(variant.id)}
								/>
							);
						})}
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

						const pickHint = isSingle ? "Escolha 1" : hasMax ? `Escolha até ${grupo.maxOpcoes}` : "Quantas quiser";
						const pricingHint = describeAddOnPricingRule(grupo.regraPreco);
						const hint = pricingHint && !isSingle ? `${pickHint} · ${pricingHint}` : pickHint;

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
							incrementDisabled={maxQuantity !== null && quantity >= maxQuantity}
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

const isSoldOut = (availability: TBuilderStock | undefined) =>
	availability?.available !== null && availability?.available !== undefined && availability.available <= 0;

/** Rótulo de estoque: o número nas telas internas; no cardápio público, só "Indisponível". */
function describeStockLabel(availability: TBuilderStock | undefined, showStockNumbers: boolean) {
	if (!availability || availability.available === null) return null;
	if (availability.available <= 0) return showStockNumbers ? "Esgotado" : "Indisponível";
	return showStockNumbers ? `${formatItemQuantity(availability.available)} em estoque` : null;
}

type VariantAxesPickerProps = {
	axes: TVariantAxes;
	selection: TVariantAxisSelection;
	onChoose: (axisId: string, valueId: string) => void;
	variants: TBuilderVariant[];
	variantStock: Map<string, TBuilderStock>;
	showStockNumbers: boolean;
};

/**
 * Um bloco por eixo com mais de um valor, na ordem do cadastro. Eixo de valor único não vira
 * pergunta: vai para uma linha de resumo ("Preto · U"). O valor que não combina com o que já foi
 * escolhido fica tracejado, mas responde ao toque (troca o eixo que conflita); o valor cuja
 * combinação existe e está sem estoque fica desabilitado. Cada valor mostra o preço das variantes
 * que ainda pode formar; o estoque aparece no valor que fecha a combinação.
 */
function VariantAxesPicker({ axes, selection, onChoose, variants, variantStock, showStockNumbers }: VariantAxesPickerProps) {
	const variantById = useMemo(() => new Map(variants.map((variant) => [variant.id, variant])), [variants]);
	const allPrices = useMemo(() => variants.map((variant) => variant.precoVenda), [variants]);
	const pricesOf = (variantIds: string[]) => variantIds.flatMap((variantId) => variantById.get(variantId)?.precoVenda ?? []);
	const fixedAxes = axes.axes.filter((axis) => axis.values.length === 1);
	const choiceAxes = axes.axes.filter((axis) => axis.values.length > 1);
	// Todos os eixos fixos: a variante já está decidida, e a linha de resumo carrega o estoque dela.
	const onlyVariantId = choiceAxes.length === 0 ? resolveSelectedVariantId(axes, selection) : null;

	return (
		<>
			{fixedAxes.length > 0 ? (
				<FixedAxesSummary
					axes={fixedAxes}
					showAvatar={fixedAxes[0] === axes.axes[0]}
					detail={onlyVariantId ? describeStockLabel(variantStock.get(onlyVariantId), showStockNumbers) : null}
				/>
			) : null}
			{choiceAxes.map((axis) => {
				// Avatar só no primeiro eixo e só quando algum valor tem foto ou cor: inicial sozinha é ruído.
				const showAvatar = axis === axes.axes[0] && axis.values.some((value) => value.imageUrl || value.swatch);
				const otherAxesChosen = axes.axes.every((other) => other.id === axis.id || !!selection[other.id]);
				const selectedValueId = selection[axis.id];
				return (
					<section key={axis.id} className="flex flex-col gap-3">
						<GroupHeading title={axis.nome} hint="Escolha 1" required satisfied={!!selectedValueId} count={selectedValueId ? 1 : 0} max={1} />
						<div className="flex flex-wrap gap-2">
							{axis.values.map((value) => {
								const variantIds = findVariantIdsForValue(axes, selection, axis.id, value.id);
								const combinable = variantIds.length > 0;
								const soldOut = combinable && variantIds.every((variantId) => isSoldOut(variantStock.get(variantId)));
								const selected = selectedValueId === value.id;
								// Sem combinação com a seleção atual, o preço é o do valor por si (o que a troca traria).
								const price = resolveAxisValuePrice({
									candidatePrices: pricesOf(combinable ? variantIds : findMatchingVariantIds(axes, { [axis.id]: value.id })),
									allPrices,
								});
								const priceLabel = price ? `${price.isMinimum ? "a partir de " : ""}${formatToMoney(price.amount)}` : null;
								// Fecha a combinação: os outros eixos estão escolhidos e este valor forma uma variante.
								const completedId = otherAxesChosen && variantIds.length === 1 ? variantIds[0] : null;
								const stockLabel = completedId ? describeStockLabel(variantStock.get(completedId), showStockNumbers) : null;
								const detail = [priceLabel, stockLabel].filter(Boolean).join(" · ");
								return (
									<button
										key={value.id}
										type="button"
										aria-pressed={selected}
										disabled={soldOut && !selected}
										title={!combinable ? `Sem ${value.nome} na combinação escolhida: toque para trocar.` : undefined}
										onClick={() => onChoose(axis.id, value.id)}
										className={cn(
											"flex min-h-10 items-center gap-2 border text-left text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-primary/25",
											showAvatar ? "rounded-full py-1 pr-3.5 pl-1" : "min-w-12 justify-center rounded-xl px-3.5 py-1.5",
											selected ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50",
											!combinable && !selected && "border-dashed text-muted-foreground",
											soldOut && "cursor-not-allowed opacity-45",
										)}
									>
										{showAvatar ? <AxisValueAvatar value={value} /> : null}
										<span className="flex flex-col leading-tight">
											<span className={cn(soldOut && "line-through decoration-1")}>{value.nome}</span>
											{detail ? <span className="text-micro text-muted-foreground">{detail}</span> : null}
										</span>
									</button>
								);
							})}
						</div>
					</section>
				);
			})}
		</>
	);
}

/** Eixos de valor único: sem escolha a fazer, só a confirmação do que vem no item. */
function FixedAxesSummary({ axes, showAvatar, detail }: { axes: TVariantAxes["axes"]; showAvatar: boolean; detail: string | null }) {
	const firstValue = axes[0].values[0];
	const hasVisual = showAvatar && (!!firstValue.imageUrl || !!firstValue.swatch);
	return (
		<div className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2">
			{hasVisual ? <AxisValueAvatar value={firstValue} /> : null}
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="text-micro uppercase tracking-wide text-muted-foreground">{axes.map((axis) => axis.nome).join(" · ")}</span>
				<span className="truncate text-sm font-semibold">{axes.map((axis) => axis.values[0].nome).join(" · ")}</span>
			</div>
			{detail ? <span className="text-micro shrink-0 text-muted-foreground">{detail}</span> : null}
		</div>
	);
}

/** Foto da cor, ou a amostra do hex, ou a inicial. */
function AxisValueAvatar({ value }: { value: TVariantAxisValue }) {
	if (value.imageUrl) return <VariantAvatar imageUrl={value.imageUrl} nome={value.nome} size="sm" />;
	return (
		<span
			aria-hidden
			className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-bold text-muted-foreground"
			style={value.swatch ? { backgroundColor: value.swatch } : undefined}
		>
			{value.swatch ? null : value.nome.slice(0, 1).toUpperCase()}
		</span>
	);
}

function VariantAvatar({ imageUrl, nome, size = "md" }: { imageUrl: string | null; nome: string; size?: "sm" | "md" }) {
	const dimension = size === "sm" ? "size-8 rounded-full" : "size-10 rounded-lg";
	return (
		<span className={cn("relative shrink-0 overflow-hidden border border-border bg-muted", dimension)}>
			{imageUrl ? <Image src={imageUrl} alt={nome} fill sizes={size === "sm" ? "32px" : "40px"} className="object-cover" /> : null}
		</span>
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
	/** Fora de alcance (sem estoque): aparece, mas não seleciona. */
	disabled?: boolean;
	/** Linha extra sob o preço (estoque). */
	detail?: string | null;
	/** Miniatura à esquerda (foto da variante). */
	leading?: React.ReactNode;
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
	disabled = false,
	detail = null,
	leading = null,
	onToggle,
	onIncrement,
	onDecrement,
}: OptionRowProps) {
	const quantityActive = control === "quantity" && selected;
	const showPrice = priceMode === "absolute" || price !== 0;
	const priceLabel = priceMode === "absolute" ? formatToMoney(price) : `+ ${formatToMoney(price)}`;
	const addDisabled = disabled || (control !== "radio" && groupFull && !selected);

	const body = (
		<div className="flex min-w-0 flex-1 items-center gap-3">
			{leading}
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{name}</span>
				{showPrice ? <span className="text-xs font-bold text-primary">{priceLabel}</span> : null}
				{detail ? <span className="text-micro text-muted-foreground">{detail}</span> : null}
			</div>
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
