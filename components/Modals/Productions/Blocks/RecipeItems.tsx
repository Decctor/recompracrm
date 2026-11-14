import DurationInput from "@/components/Inputs/DurationInput";
import SelectProductWithVariants, { type TSelectProductWithVariantsValue } from "@/components/Inputs/SelectProductWithVariants";
import DeleteRowButton from "@/components/Spreadsheet/DeleteRowButton";
import EditableNumberCell from "@/components/Spreadsheet/EditableNumberCell";
import MobileEditableField from "@/components/Spreadsheet/MobileEditableField";
import SpreadsheetCellWrapper from "@/components/Spreadsheet/SpreadsheetCellWrapper";
import {
	normalizeValidityDurationMeasure,
	VALIDITY_DURATION_OPTIONS,
	ValidityDurationMeasureCell,
	ValidityDurationValueCell,
} from "@/components/Spreadsheet/ValidityDurationCells";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatNameAsInitials } from "@/lib/formatting";
import {
	consumeProgrammaticSpreadsheetFocus,
	handleSpreadsheetNavigationKeyDown,
	SPREADSHEET_TABLE_ATTR,
	type SpreadsheetGridBounds,
} from "@/lib/spreadsheet-navigation";
import { cn } from "@/lib/utils";
import type { TProductionRecipeState, TUseInternalProductionRecipeState } from "@/state-hooks/use-internal-production-recipe-state";
import { BoxIcon, Package, PackageCheck, Plus } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";

const RECIPE_INPUT_GRID_COL = {
	PRODUCT: 0,
	QTY: 1,
} as const;

const RECIPE_INPUT_GRID_COL_COUNT = 2;

const RECIPE_OUTPUT_GRID_COL = {
	PRODUCT: 0,
	QTY: 1,
	VALIDITY_VALUE: 2,
	VALIDITY_MEASURE: 3,
} as const;

const RECIPE_OUTPUT_GRID_COL_COUNT = 4;

type RecipeInputState = TProductionRecipeState["productionRecipeInputs"][number];
type RecipeOutputState = TProductionRecipeState["productionRecipeOutputs"][number];

type ProductionRecipeInputsBlockProps = {
	productionRecipeInputs: TProductionRecipeState["productionRecipeInputs"];
	addProductionRecipeInput: TUseInternalProductionRecipeState["addProductionRecipeInput"];
	updateProductionRecipeInput: TUseInternalProductionRecipeState["updateProductionRecipeInput"];
	removeProductionRecipeInput: TUseInternalProductionRecipeState["removeProductionRecipeInput"];
};

export function ProductionRecipeInputsBlock({
	productionRecipeInputs,
	addProductionRecipeInput,
	updateProductionRecipeInput,
	removeProductionRecipeInput,
}: ProductionRecipeInputsBlockProps) {
	const visibleInputs = useMemo(
		() => productionRecipeInputs.map((item, index) => ({ item, index })).filter(({ item }) => !item.deletar),
		[productionRecipeInputs],
	);
	const gridBounds: SpreadsheetGridBounds = useMemo(
		() => ({
			rowCount: visibleInputs.length + 1,
			colCount: RECIPE_INPUT_GRID_COL_COUNT,
		}),
		[visibleInputs.length],
	);

	return (
		<ResponsiveMenuSection title="INSUMOS" icon={<Package className="h-4 min-h-4 w-4 min-w-4" />}>
			<div {...{ [SPREADSHEET_TABLE_ATTR]: "true" }} className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-background">
				<div className="hidden min-h-9 w-full items-center border-b border-border bg-muted/60 px-2 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground lg:flex">
					<p className="w-[55%] px-2 text-start">Produto</p>
					<p className="w-[10%] px-2 text-center">Un.</p>
					<p className="w-[25%] px-2 text-center">Quantidade</p>
					<p className="w-[5%] px-2 text-center">Ações</p>
				</div>

				<div className="flex w-full flex-col bg-background">
					{visibleInputs.map(({ item, index }, rowIndex) => (
						<RecipeInputTableRow
							key={item.id ?? `${item.produtoId}-${item.produtoVarianteId ?? "produto"}-${index}`}
							item={item}
							gridRow={rowIndex}
							gridBounds={gridBounds}
							handleUpdate={(updatedItem) => updateProductionRecipeInput(index, normalizeInputValues({ ...item, ...updatedItem }))}
							handleRemove={() => removeProductionRecipeInput(index)}
						/>
					))}
					<DraftRecipeInputRow addProductionRecipeInput={addProductionRecipeInput} gridRow={visibleInputs.length} gridBounds={gridBounds} />
					{visibleInputs.length === 0 ? (
						<div className="flex w-full items-center justify-center border-t border-border px-3 py-3">
							<p className="text-center text-xs font-medium tracking-tight text-muted-foreground">
								Selecione um produto na linha em branco para adicionar insumos consumidos.
							</p>
						</div>
					) : null}
				</div>
			</div>
		</ResponsiveMenuSection>
	);
}

type ProductionRecipeOutputsBlockProps = {
	productionRecipeOutputs: TProductionRecipeState["productionRecipeOutputs"];
	addProductionRecipeOutput: TUseInternalProductionRecipeState["addProductionRecipeOutput"];
	updateProductionRecipeOutput: TUseInternalProductionRecipeState["updateProductionRecipeOutput"];
	removeProductionRecipeOutput: TUseInternalProductionRecipeState["removeProductionRecipeOutput"];
};

export function ProductionRecipeOutputsBlock({
	productionRecipeOutputs,
	addProductionRecipeOutput,
	updateProductionRecipeOutput,
	removeProductionRecipeOutput,
}: ProductionRecipeOutputsBlockProps) {
	const visibleOutputs = useMemo(
		() => productionRecipeOutputs.map((item, index) => ({ item, index })).filter(({ item }) => !item.deletar),
		[productionRecipeOutputs],
	);
	const gridBounds: SpreadsheetGridBounds = useMemo(
		() => ({
			rowCount: visibleOutputs.length + 1,
			colCount: RECIPE_OUTPUT_GRID_COL_COUNT,
		}),
		[visibleOutputs.length],
	);

	return (
		<ResponsiveMenuSection title="SAÍDAS" icon={<PackageCheck className="h-4 min-h-4 w-4 min-w-4" />}>
			<div {...{ [SPREADSHEET_TABLE_ATTR]: "true" }} className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-background">
				<div className="hidden min-h-9 w-full items-center border-b border-border bg-muted/60 px-2 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground lg:flex">
					<p className="w-[35%] px-2 text-start">Produto</p>
					<p className="w-[8%] px-2 text-center">Un.</p>
					<p className="w-[15%] px-2 text-center">Quantidade</p>
					<p className="w-[18%] px-2 text-center">Prazo</p>
					<p className="w-[14%] px-2 text-center">Med.</p>
					<p className="w-[5%] px-2 text-center">Ações</p>
				</div>

				<div className="flex w-full flex-col bg-background">
					{visibleOutputs.map(({ item, index }, rowIndex) => (
						<RecipeOutputTableRow
							key={item.id ?? `${item.produtoId}-${item.produtoVarianteId ?? "produto"}-${index}`}
							item={item}
							gridRow={rowIndex}
							gridBounds={gridBounds}
							handleUpdate={(updatedItem) => updateProductionRecipeOutput(index, normalizeOutputValues({ ...item, ...updatedItem }))}
							handleRemove={() => removeProductionRecipeOutput(index)}
						/>
					))}
					<DraftRecipeOutputRow addProductionRecipeOutput={addProductionRecipeOutput} gridRow={visibleOutputs.length} gridBounds={gridBounds} />
					{visibleOutputs.length === 0 ? (
						<div className="flex w-full items-center justify-center border-t border-border px-3 py-3">
							<p className="text-center text-xs font-medium tracking-tight text-muted-foreground">
								Selecione um produto na linha em branco para adicionar saídas produzidas.
							</p>
						</div>
					) : null}
				</div>
			</div>
		</ResponsiveMenuSection>
	);
}

type RecipeInputTableRowProps = {
	item: RecipeInputState;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
	handleUpdate: (item: Partial<RecipeInputState>) => void;
	handleRemove: () => void;
};

function RecipeInputTableRow({ item, gridRow, gridBounds, handleUpdate, handleRemove }: RecipeInputTableRowProps) {
	return (
		<div className="border-t border-border first:border-t-0">
			<div className="hidden min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40 lg:flex">
				<div className="w-[55%] px-1">
					<ProductCell item={item} gridRow={gridRow} gridCol={RECIPE_INPUT_GRID_COL.PRODUCT} gridBounds={gridBounds} onChange={handleUpdate} />
				</div>
				<p className="w-[10%] truncate px-2 text-center text-muted-foreground">{getProductUnit(item) || "UN"}</p>
				<div className="w-[25%] px-1">
					<EditableNumberCell
						value={item.quantidade ?? 0}
						ariaLabel="Editar quantidade"
						min={0}
						gridRow={gridRow}
						gridCol={RECIPE_INPUT_GRID_COL.QTY}
						gridBounds={gridBounds}
						onCommit={(quantidade) => handleUpdate({ quantidade })}
					/>
				</div>
				<div className="flex w-[5%] justify-center px-1">
					<DeleteRowButton onRemove={handleRemove} ariaLabel="Remover insumo" />
				</div>
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex w-full items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<ProductCell item={item} onChange={handleUpdate} />
					</div>
					<DeleteRowButton onRemove={handleRemove} ariaLabel="Remover insumo" />
				</div>
				<MobileEditableField label="Quantidade">
					<EditableNumberCell value={item.quantidade ?? 0} ariaLabel="Editar quantidade" min={0} onCommit={(quantidade) => handleUpdate({ quantidade })} />
				</MobileEditableField>
			</div>
		</div>
	);
}

function DraftRecipeInputRow({
	addProductionRecipeInput,
	gridRow,
	gridBounds,
}: {
	addProductionRecipeInput: (item: RecipeInputState) => void;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
}) {
	const [draftItem, setDraftItem] = useState<RecipeInputState>(() => createEmptyRecipeInput());

	function updateDraftItem(item: Partial<RecipeInputState>) {
		const nextDraftItem = normalizeInputValues({ ...draftItem, ...item });

		if (nextDraftItem.produtoId && (nextDraftItem.quantidade ?? 0) > 0) {
			addProductionRecipeInput(nextDraftItem);
			setDraftItem(createEmptyRecipeInput());
			return;
		}

		setDraftItem(nextDraftItem);
	}

	return (
		<div className="border-t border-dashed border-border bg-muted/20">
			<div className="hidden min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40 lg:flex">
				<div className="flex w-[55%] items-center gap-1 px-1">
					<Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<ProductCell
							item={draftItem}
							gridRow={gridRow}
							gridCol={RECIPE_INPUT_GRID_COL.PRODUCT}
							gridBounds={gridBounds}
							onChange={updateDraftItem}
							placeholder="NOVO PRODUTO"
						/>
					</div>
				</div>
				<p className="w-[10%] truncate px-2 text-center text-muted-foreground">{getProductUnit(draftItem) || "UN"}</p>
				<div className="w-[25%] px-1">
					<EditableNumberCell
						value={draftItem.quantidade ?? 0}
						ariaLabel="Editar quantidade do novo insumo"
						min={0}
						gridRow={gridRow}
						gridCol={RECIPE_INPUT_GRID_COL.QTY}
						gridBounds={gridBounds}
						onCommit={(quantidade) => updateDraftItem({ quantidade })}
					/>
				</div>
				<div className="w-[5%]" />
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex w-full items-start gap-2">
					<Plus className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<ProductCell item={draftItem} onChange={updateDraftItem} placeholder="Novo produto" />
					</div>
				</div>
				<MobileEditableField label="Quantidade">
					<EditableNumberCell
						value={draftItem.quantidade ?? 0}
						ariaLabel="Editar quantidade do novo insumo"
						min={0}
						onCommit={(quantidade) => updateDraftItem({ quantidade })}
					/>
				</MobileEditableField>
			</div>
		</div>
	);
}

type RecipeOutputTableRowProps = {
	item: RecipeOutputState;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
	handleUpdate: (item: Partial<RecipeOutputState>) => void;
	handleRemove: () => void;
};

function RecipeOutputTableRow({ item, gridRow, gridBounds, handleUpdate, handleRemove }: RecipeOutputTableRowProps) {
	const prazoValidadeMedida = normalizeValidityDurationMeasure(item.prazoValidadeMedida);

	return (
		<div className="border-t border-border first:border-t-0">
			<div className="hidden min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40 lg:flex">
				<div className="w-[35%] px-1">
					<ProductCell item={item} gridRow={gridRow} gridCol={RECIPE_OUTPUT_GRID_COL.PRODUCT} gridBounds={gridBounds} onChange={handleUpdate} />
				</div>
				<p className="w-[8%] truncate px-2 text-center text-muted-foreground">{getProductUnit(item) || "UN"}</p>
				<div className="w-[15%] px-1">
					<EditableNumberCell
						value={item.quantidade ?? 0}
						ariaLabel="Editar quantidade"
						min={0}
						gridRow={gridRow}
						gridCol={RECIPE_OUTPUT_GRID_COL.QTY}
						gridBounds={gridBounds}
						onCommit={(quantidade) => handleUpdate({ quantidade })}
					/>
				</div>
				<div className="w-[18%] px-1">
					<ValidityDurationValueCell
						value={item.prazoValidadeValor}
						measure={prazoValidadeMedida}
						gridRow={gridRow}
						gridCol={RECIPE_OUTPUT_GRID_COL.VALIDITY_VALUE}
						gridBounds={gridBounds}
						onCommit={(prazoValidadeValor) => handleUpdate({ prazoValidadeValor })}
					/>
				</div>
				<div className="w-[14%] px-1">
					<ValidityDurationMeasureCell
						measure={prazoValidadeMedida}
						gridRow={gridRow}
						gridCol={RECIPE_OUTPUT_GRID_COL.VALIDITY_MEASURE}
						gridBounds={gridBounds}
						onMeasureChange={(prazoValidadeMedida) => handleUpdate({ prazoValidadeMedida })}
						onReset={() => handleUpdate({ prazoValidadeMedida: null, prazoValidadeValor: null })}
					/>
				</div>
				<div className="flex w-[5%] justify-center px-1">
					<DeleteRowButton onRemove={handleRemove} ariaLabel="Remover saída" />
				</div>
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex w-full items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<ProductCell item={item} onChange={handleUpdate} />
					</div>
					<DeleteRowButton onRemove={handleRemove} ariaLabel="Remover saída" />
				</div>
				<div className="grid w-full grid-cols-2 gap-2">
					<MobileEditableField label="Quantidade">
						<EditableNumberCell
							value={item.quantidade ?? 0}
							ariaLabel="Editar quantidade"
							min={0}
							onCommit={(quantidade) => handleUpdate({ quantidade })}
						/>
					</MobileEditableField>
				</div>
				<DurationInput
					label="PRAZO DE VALIDADE"
					value={item.prazoValidadeValor}
					measure={prazoValidadeMedida}
					options={VALIDITY_DURATION_OPTIONS}
					valuePlaceholder="Prazo"
					measurePlaceholder="Medida"
					helperText="Opcional. Usado depois para calcular o vencimento do lote produzido."
					onValueChange={(prazoValidadeValor) => handleUpdate({ prazoValidadeValor })}
					onMeasureChange={(prazoValidadeMedida) => handleUpdate({ prazoValidadeMedida })}
					onMeasureReset={() => handleUpdate({ prazoValidadeMedida: null, prazoValidadeValor: null })}
				/>
			</div>
		</div>
	);
}

function DraftRecipeOutputRow({
	addProductionRecipeOutput,
	gridRow,
	gridBounds,
}: {
	addProductionRecipeOutput: (item: RecipeOutputState) => void;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
}) {
	const [draftItem, setDraftItem] = useState<RecipeOutputState>(() => createEmptyRecipeOutput());
	const prazoValidadeMedida = normalizeValidityDurationMeasure(draftItem.prazoValidadeMedida);

	function updateDraftItem(item: Partial<RecipeOutputState>) {
		const nextDraftItem = normalizeOutputValues({ ...draftItem, ...item });

		if (nextDraftItem.produtoId && (nextDraftItem.quantidade ?? 0) > 0) {
			addProductionRecipeOutput(nextDraftItem);
			setDraftItem(createEmptyRecipeOutput());
			return;
		}

		setDraftItem(nextDraftItem);
	}

	return (
		<div className="border-t border-dashed border-border bg-muted/20">
			<div className="hidden min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40 lg:flex">
				<div className="flex w-[35%] items-center gap-1 px-1">
					<Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<ProductCell
							item={draftItem}
							gridRow={gridRow}
							gridCol={RECIPE_OUTPUT_GRID_COL.PRODUCT}
							gridBounds={gridBounds}
							onChange={updateDraftItem}
							placeholder="NOVO PRODUTO"
						/>
					</div>
				</div>
				<p className="w-[8%] truncate px-2 text-center text-muted-foreground">{getProductUnit(draftItem) || "UN"}</p>
				<div className="w-[15%] px-1">
					<EditableNumberCell
						value={draftItem.quantidade ?? 0}
						ariaLabel="Editar quantidade da nova saída"
						min={0}
						gridRow={gridRow}
						gridCol={RECIPE_OUTPUT_GRID_COL.QTY}
						gridBounds={gridBounds}
						onCommit={(quantidade) => updateDraftItem({ quantidade })}
					/>
				</div>
				<div className="w-[18%] px-1">
					<ValidityDurationValueCell
						value={draftItem.prazoValidadeValor}
						measure={prazoValidadeMedida}
						gridRow={gridRow}
						gridCol={RECIPE_OUTPUT_GRID_COL.VALIDITY_VALUE}
						gridBounds={gridBounds}
						onCommit={(prazoValidadeValor) => updateDraftItem({ prazoValidadeValor })}
					/>
				</div>
				<div className="w-[14%] px-1">
					<ValidityDurationMeasureCell
						measure={prazoValidadeMedida}
						gridRow={gridRow}
						gridCol={RECIPE_OUTPUT_GRID_COL.VALIDITY_MEASURE}
						gridBounds={gridBounds}
						onMeasureChange={(prazoValidadeMedida) => updateDraftItem({ prazoValidadeMedida })}
						onReset={() => updateDraftItem({ prazoValidadeMedida: null, prazoValidadeValor: null })}
					/>
				</div>
				<div className="w-[5%]" />
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex w-full items-start gap-2">
					<Plus className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<ProductCell item={draftItem} onChange={updateDraftItem} placeholder="Novo produto" />
					</div>
				</div>
				<div className="grid w-full grid-cols-2 gap-2">
					<MobileEditableField label="Quantidade">
						<EditableNumberCell
							value={draftItem.quantidade ?? 0}
							ariaLabel="Editar quantidade da nova saída"
							min={0}
							onCommit={(quantidade) => updateDraftItem({ quantidade })}
						/>
					</MobileEditableField>
				</div>
			</div>
		</div>
	);
}

type ProductItemLike = {
	produtoId: string;
	produtoVarianteId?: string | null;
	produto?: { id?: string; nome: string; codigo?: string | null; unidade?: string | null; imagemCapaUrl?: string | null } | null;
	produtoVariante?: { id?: string; nome: string; codigo?: string | null; imagemCapaUrl?: string | null } | null;
};

function ProductCell<TItem extends ProductItemLike>({
	item,
	onChange,
	gridRow,
	gridCol,
	gridBounds,
	placeholder = "Selecionar produto",
}: {
	item: TItem;
	onChange: (item: Partial<TItem>) => void;
	gridRow?: number;
	gridCol?: number;
	gridBounds?: SpreadsheetGridBounds;
	placeholder?: string;
}) {
	const hasGridNavigation = gridRow !== undefined && gridCol !== undefined && gridBounds !== undefined;
	const selectedName = getItemDisplayName(item);
	const selectedCode = item.produtoVariante?.codigo || item.produto?.codigo;
	const imageUrl = item.produtoVariante?.imagemCapaUrl || item.produto?.imagemCapaUrl;

	function handleChange(value: TSelectProductWithVariantsValue) {
		if (!value?.product) {
			onChange(createEmptyProductSelection() as Partial<TItem>);
			return;
		}

		onChange(mapProductSelection(value) as Partial<TItem>);
	}

	const productSelect = (
		<SelectProductWithVariants
			label="PRODUTO"
			showLabel={false}
			value={item.produtoId ? { productId: item.produtoId, productVariantId: item.produtoVarianteId } : null}
			selectedLabel={item.produtoId ? selectedName : placeholder}
			resetOptionLabel="SELECIONE UM PRODUTO"
			holderClassName="h-auto min-h-8 rounded-md border-transparent bg-transparent px-2 py-1 text-left shadow-none hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
			popoverContentClassName="w-[var(--anchor-width)] min-w-[410px] max-w-[520px]"
			commandListClassName="max-h-[360px]"
			handleChange={handleChange}
			onReset={() => onChange(createEmptyProductSelection() as Partial<TItem>)}
			renderTriggerContent={() => (
				<span className="flex min-w-0 flex-1 items-center gap-2">
					<ProductThumb imageUrl={imageUrl} label={selectedName} />
					<span className="flex min-w-0 flex-1 flex-col">
						<span className={cn("truncate text-xs font-medium", !item.produtoId && "text-muted-foreground")}>
							{item.produtoId ? selectedName : placeholder}
						</span>
						{selectedCode ? <span className="truncate text-[0.65rem] text-muted-foreground">{selectedCode}</span> : null}
					</span>
				</span>
			)}
			triggerProps={
				hasGridNavigation
					? {
							onFocus: () => {
								consumeProgrammaticSpreadsheetFocus();
							},
							onKeyDown: (event) => {
								if (event.key === "Enter") return;
								handleSpreadsheetNavigationKeyDown(event, {
									coords: { row: gridRow, col: gridCol },
									bounds: gridBounds,
								});
							},
						}
					: undefined
			}
		/>
	);

	if (!hasGridNavigation) return productSelect;

	return (
		<SpreadsheetCellWrapper gridRow={gridRow} gridCol={gridCol}>
			{productSelect}
		</SpreadsheetCellWrapper>
	);
}

function ProductThumb({ imageUrl, label }: { imageUrl?: string | null; label: string }) {
	if (imageUrl) {
		return (
			<span className="relative block h-6 w-6 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
				<Image src={imageUrl} alt={label} fill className="object-cover" />
			</span>
		);
	}

	if (label) {
		return (
			<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-[0.62rem] font-semibold text-muted-foreground">
				{formatNameAsInitials(label)}
			</span>
		);
	}

	return (
		<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/50 text-muted-foreground">
			<BoxIcon className="h-3.5 w-3.5" />
		</span>
	);
}

function mapProductSelection(value: TSelectProductWithVariantsValue) {
	return {
		produtoId: value?.product.id ?? "",
		produtoVarianteId: value?.productVariant?.id ?? null,
		produto: value?.product
			? {
					id: value.product.id,
					nome: value.product.nome,
					codigo: value.product.codigo,
					unidade: value.product.unidade,
					imagemCapaUrl: value.product.imagemCapaUrl,
				}
			: null,
		produtoVariante: value?.productVariant
			? {
					id: value.productVariant.id,
					nome: value.productVariant.nome,
					codigo: value.productVariant.codigo,
					imagemCapaUrl: value.productVariant.imagemCapaUrl,
				}
			: null,
	};
}

function createEmptyProductSelection() {
	return {
		produtoId: "",
		produtoVarianteId: null,
		produto: null,
		produtoVariante: null,
	};
}

function createEmptyRecipeInput(): RecipeInputState {
	return {
		produtoId: "",
		produtoVarianteId: null,
		quantidade: 1,
		produto: null,
		produtoVariante: null,
	};
}

function createEmptyRecipeOutput(): RecipeOutputState {
	return {
		produtoId: "",
		produtoVarianteId: null,
		quantidade: 1,
		prazoValidadeMedida: null,
		prazoValidadeValor: null,
		produto: null,
		produtoVariante: null,
	};
}

function normalizeInputValues(item: RecipeInputState): RecipeInputState {
	return {
		...item,
		quantidade: Number(item.quantidade) || 0,
	};
}

function normalizeOutputValues(item: RecipeOutputState): RecipeOutputState {
	return {
		...item,
		quantidade: Number(item.quantidade) || 0,
		prazoValidadeValor: item.prazoValidadeValor == null ? null : Number(item.prazoValidadeValor) || 0,
	};
}

function getItemDisplayName(item: ProductItemLike) {
	if (item.produtoVariante?.nome && item.produto?.nome) return `${item.produto.nome} - ${item.produtoVariante.nome}`;
	return item.produto?.nome ?? "";
}

function getProductUnit(item: ProductItemLike) {
	return item.produto?.unidade ?? null;
}
