import DateInput from "@/components/Inputs/DateInput";
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
import type { TProductionState, TUseInternalProductionState } from "@/state-hooks/use-internal-production-state";
import { BoxIcon, Package, PackageCheck, Plus } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";

const PRODUCTION_INPUT_GRID_COL = {
	PRODUCT: 0,
	QTY_PLANNED: 1,
	QTY_REAL: 2,
} as const;

const PRODUCTION_INPUT_GRID_COL_COUNT = 3;

const PRODUCTION_OUTPUT_GRID_COL = {
	PRODUCT: 0,
	QTY_PLANNED: 1,
	QTY_REAL: 2,
	VALIDITY_VALUE: 3,
	VALIDITY_MEASURE: 4,
	EXPIRY_DATE: 5,
} as const;

const PRODUCTION_OUTPUT_GRID_COL_COUNT = 6;

type ProductionInputState = TProductionState["productionInputs"][number];
type ProductionOutputState = TProductionState["productionOutputs"][number];

type ProductionInputsBlockProps = {
	productionInputs: TProductionState["productionInputs"];
	addProductionInput: TUseInternalProductionState["addProductionInput"];
	updateProductionInput: TUseInternalProductionState["updateProductionInput"];
	removeProductionInput: TUseInternalProductionState["removeProductionInput"];
};

export function ProductionInputsBlock({
	productionInputs,
	addProductionInput,
	updateProductionInput,
	removeProductionInput,
}: ProductionInputsBlockProps) {
	const visibleInputs = useMemo(
		() => productionInputs.map((item, index) => ({ item, index })).filter(({ item }) => !item.deletar),
		[productionInputs],
	);
	const gridBounds: SpreadsheetGridBounds = useMemo(
		() => ({
			rowCount: visibleInputs.length + 1,
			colCount: PRODUCTION_INPUT_GRID_COL_COUNT,
		}),
		[visibleInputs.length],
	);

	return (
		<ResponsiveMenuSection title="ENTRADAS CONSUMIDAS" icon={<Package className="h-4 min-h-4 w-4 min-w-4" />}>
			<div {...{ [SPREADSHEET_TABLE_ATTR]: "true" }} className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-background">
				<div className="hidden min-h-9 w-full items-center border-b border-border bg-muted/60 px-2 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground lg:flex">
					<p className="w-[45%] px-2 text-start">Produto</p>
					<p className="w-[10%] px-2 text-center">Un.</p>
					<p className="w-[18%] px-2 text-center">Qtd. prevista</p>
					<p className="w-[18%] px-2 text-center">Qtd. real</p>
					<p className="w-[5%] px-2 text-center">Ações</p>
				</div>

				<div className="flex w-full flex-col bg-background">
					{visibleInputs.map(({ item, index }, rowIndex) => (
						<ProductionInputTableRow
							key={item.id ?? `${item.produtoId}-${item.produtoVarianteId ?? "produto"}-${index}`}
							item={item}
							gridRow={rowIndex}
							gridBounds={gridBounds}
							handleUpdate={(updatedItem) => updateProductionInput(index, normalizeInputValues({ ...item, ...updatedItem }))}
							handleRemove={() => removeProductionInput(index)}
						/>
					))}
					<DraftProductionInputRow addProductionInput={addProductionInput} gridRow={visibleInputs.length} gridBounds={gridBounds} />
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

type ProductionOutputsBlockProps = {
	productionOutputs: TProductionState["productionOutputs"];
	addProductionOutput: TUseInternalProductionState["addProductionOutput"];
	updateProductionOutput: TUseInternalProductionState["updateProductionOutput"];
	removeProductionOutput: TUseInternalProductionState["removeProductionOutput"];
};

export function ProductionOutputsBlock({
	productionOutputs,
	addProductionOutput,
	updateProductionOutput,
	removeProductionOutput,
}: ProductionOutputsBlockProps) {
	const visibleOutputs = useMemo(
		() => productionOutputs.map((item, index) => ({ item, index })).filter(({ item }) => !item.deletar),
		[productionOutputs],
	);
	const gridBounds: SpreadsheetGridBounds = useMemo(
		() => ({
			rowCount: visibleOutputs.length + 1,
			colCount: PRODUCTION_OUTPUT_GRID_COL_COUNT,
		}),
		[visibleOutputs.length],
	);

	return (
		<ResponsiveMenuSection title="SAÍDAS PRODUZIDAS" icon={<PackageCheck className="h-4 min-h-4 w-4 min-w-4" />}>
			<div {...{ [SPREADSHEET_TABLE_ATTR]: "true" }} className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-background">
				<div className="hidden min-h-9 w-full items-center border-b border-border bg-muted/60 px-2 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground lg:flex">
					<p className="w-[30%] px-2 text-start">Produto</p>
					<p className="w-[8%] px-2 text-center">Un.</p>
					<p className="w-[12%] px-2 text-center">Qtd. prev.</p>
					<p className="w-[12%] px-2 text-center">Qtd. real</p>
					<p className="w-[10%] px-2 text-center">Prazo</p>
					<p className="w-[8%] px-2 text-center">Med.</p>
					<p className="w-[13%] px-2 text-center">Validade real</p>
					<p className="w-[5%] px-2 text-center">Ações</p>
				</div>

				<div className="flex w-full flex-col bg-background">
					{visibleOutputs.map(({ item, index }, rowIndex) => (
						<ProductionOutputTableRow
							key={item.id ?? `${item.produtoId}-${item.produtoVarianteId ?? "produto"}-${index}`}
							item={item}
							gridRow={rowIndex}
							gridBounds={gridBounds}
							handleUpdate={(updatedItem) => updateProductionOutput(index, normalizeOutputValues({ ...item, ...updatedItem }))}
							handleRemove={() => removeProductionOutput(index)}
						/>
					))}
					<DraftProductionOutputRow addProductionOutput={addProductionOutput} gridRow={visibleOutputs.length} gridBounds={gridBounds} />
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

type ProductionInputTableRowProps = {
	item: ProductionInputState;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
	handleUpdate: (item: Partial<ProductionInputState>) => void;
	handleRemove: () => void;
};

function ProductionInputTableRow({ item, gridRow, gridBounds, handleUpdate, handleRemove }: ProductionInputTableRowProps) {
	return (
		<div className="border-t border-border first:border-t-0">
			<div className="hidden min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40 lg:flex">
				<div className="w-[45%] px-1">
					<ProductCell item={item} gridRow={gridRow} gridCol={PRODUCTION_INPUT_GRID_COL.PRODUCT} gridBounds={gridBounds} onChange={handleUpdate} />
				</div>
				<p className="w-[10%] truncate px-2 text-center text-muted-foreground">{item.produto?.unidade || "UN"}</p>
				<div className="w-[18%] px-1">
					<EditableNumberCell
						value={item.quantidadePrevista ?? 0}
						ariaLabel="Editar quantidade prevista"
						min={0}
						gridRow={gridRow}
						gridCol={PRODUCTION_INPUT_GRID_COL.QTY_PLANNED}
						gridBounds={gridBounds}
						onCommit={(quantidadePrevista) => handleUpdate({ quantidadePrevista })}
					/>
				</div>
				<div className="w-[18%] px-1">
					<EditableNumberCell
						value={item.quantidadeReal ?? 0}
						ariaLabel="Editar quantidade real"
						min={0}
						gridRow={gridRow}
						gridCol={PRODUCTION_INPUT_GRID_COL.QTY_REAL}
						gridBounds={gridBounds}
						onCommit={(quantidadeReal) => handleUpdate({ quantidadeReal })}
					/>
				</div>
				<div className="flex w-[5%] justify-center px-1">
					<DeleteRowButton onRemove={handleRemove} ariaLabel="Remover entrada" />
				</div>
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex w-full items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<ProductCell item={item} onChange={handleUpdate} />
					</div>
					<DeleteRowButton onRemove={handleRemove} ariaLabel="Remover entrada" />
				</div>
				<div className="grid w-full grid-cols-2 gap-2">
					<MobileEditableField label="Qtd. prevista">
						<EditableNumberCell
							value={item.quantidadePrevista ?? 0}
							ariaLabel="Editar quantidade prevista"
							min={0}
							onCommit={(quantidadePrevista) => handleUpdate({ quantidadePrevista })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Qtd. real">
						<EditableNumberCell
							value={item.quantidadeReal ?? 0}
							ariaLabel="Editar quantidade real"
							min={0}
							onCommit={(quantidadeReal) => handleUpdate({ quantidadeReal })}
						/>
					</MobileEditableField>
				</div>
			</div>
		</div>
	);
}

function DraftProductionInputRow({
	addProductionInput,
	gridRow,
	gridBounds,
}: {
	addProductionInput: (item: ProductionInputState) => void;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
}) {
	const [draftItem, setDraftItem] = useState<ProductionInputState>(() => createEmptyProductionInput());

	function updateDraftItem(item: Partial<ProductionInputState>) {
		const nextDraftItem = normalizeInputValues({ ...draftItem, ...item });

		if (nextDraftItem.produtoId && (nextDraftItem.quantidadePrevista ?? 0) > 0) {
			addProductionInput(nextDraftItem);
			setDraftItem(createEmptyProductionInput());
			return;
		}

		setDraftItem(nextDraftItem);
	}

	return (
		<div className="border-t border-dashed border-border bg-muted/20">
			<div className="hidden min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40 lg:flex">
				<div className="flex w-[45%] items-center gap-1 px-1">
					<Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<ProductCell
							item={draftItem}
							gridRow={gridRow}
							gridCol={PRODUCTION_INPUT_GRID_COL.PRODUCT}
							gridBounds={gridBounds}
							onChange={updateDraftItem}
							placeholder="NOVO PRODUTO"
						/>
					</div>
				</div>
				<p className="w-[10%] truncate px-2 text-center text-muted-foreground">{draftItem.produto?.unidade || "UN"}</p>
				<div className="w-[18%] px-1">
					<EditableNumberCell
						value={draftItem.quantidadePrevista ?? 0}
						ariaLabel="Editar quantidade prevista do novo item"
						min={0}
						gridRow={gridRow}
						gridCol={PRODUCTION_INPUT_GRID_COL.QTY_PLANNED}
						gridBounds={gridBounds}
						onCommit={(quantidadePrevista) => updateDraftItem({ quantidadePrevista })}
					/>
				</div>
				<div className="w-[18%] px-1">
					<EditableNumberCell
						value={draftItem.quantidadeReal ?? 0}
						ariaLabel="Editar quantidade real do novo item"
						min={0}
						gridRow={gridRow}
						gridCol={PRODUCTION_INPUT_GRID_COL.QTY_REAL}
						gridBounds={gridBounds}
						onCommit={(quantidadeReal) => updateDraftItem({ quantidadeReal })}
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
					<MobileEditableField label="Qtd. prevista">
						<EditableNumberCell
							value={draftItem.quantidadePrevista ?? 0}
							ariaLabel="Editar quantidade prevista do novo item"
							min={0}
							onCommit={(quantidadePrevista) => updateDraftItem({ quantidadePrevista })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Qtd. real">
						<EditableNumberCell
							value={draftItem.quantidadeReal ?? 0}
							ariaLabel="Editar quantidade real do novo item"
							min={0}
							onCommit={(quantidadeReal) => updateDraftItem({ quantidadeReal })}
						/>
					</MobileEditableField>
				</div>
			</div>
		</div>
	);
}

type ProductionOutputTableRowProps = {
	item: ProductionOutputState;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
	handleUpdate: (item: Partial<ProductionOutputState>) => void;
	handleRemove: () => void;
};

function ProductionOutputTableRow({ item, gridRow, gridBounds, handleUpdate, handleRemove }: ProductionOutputTableRowProps) {
	const prazoValidadeMedida = normalizeValidityDurationMeasure(item.prazoValidadeMedida);

	return (
		<div className="border-t border-border first:border-t-0">
			<div className="hidden min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40 lg:flex">
				<div className="w-[30%] px-1">
					<ProductCell item={item} gridRow={gridRow} gridCol={PRODUCTION_OUTPUT_GRID_COL.PRODUCT} gridBounds={gridBounds} onChange={handleUpdate} />
				</div>
				<p className="w-[8%] truncate px-2 text-center text-muted-foreground">{item.produto?.unidade || "UN"}</p>
				<div className="w-[12%] px-1">
					<EditableNumberCell
						value={item.quantidadePrevista ?? 0}
						ariaLabel="Editar quantidade prevista"
						min={0}
						gridRow={gridRow}
						gridCol={PRODUCTION_OUTPUT_GRID_COL.QTY_PLANNED}
						gridBounds={gridBounds}
						onCommit={(quantidadePrevista) => handleUpdate({ quantidadePrevista })}
					/>
				</div>
				<div className="w-[12%] px-1">
					<EditableNumberCell
						value={item.quantidadeReal ?? 0}
						ariaLabel="Editar quantidade real"
						min={0}
						gridRow={gridRow}
						gridCol={PRODUCTION_OUTPUT_GRID_COL.QTY_REAL}
						gridBounds={gridBounds}
						onCommit={(quantidadeReal) => handleUpdate({ quantidadeReal })}
					/>
				</div>
				<div className="w-[10%] px-1">
					<ValidityDurationValueCell
						value={item.prazoValidadeValor}
						measure={prazoValidadeMedida}
						gridRow={gridRow}
						gridCol={PRODUCTION_OUTPUT_GRID_COL.VALIDITY_VALUE}
						gridBounds={gridBounds}
						onCommit={(prazoValidadeValor) => handleUpdate({ prazoValidadeValor })}
					/>
				</div>
				<div className="w-[8%] px-1">
					<ValidityDurationMeasureCell
						measure={prazoValidadeMedida}
						gridRow={gridRow}
						gridCol={PRODUCTION_OUTPUT_GRID_COL.VALIDITY_MEASURE}
						gridBounds={gridBounds}
						onMeasureChange={(prazoValidadeMedida) => handleUpdate({ prazoValidadeMedida })}
						onReset={() => handleUpdate({ prazoValidadeMedida: null, prazoValidadeValor: null })}
					/>
				</div>
				<div className="w-[13%] px-1">
					<ProductionDateCell
						value={item.dataValidade}
						gridRow={gridRow}
						gridCol={PRODUCTION_OUTPUT_GRID_COL.EXPIRY_DATE}
						gridBounds={gridBounds}
						onCommit={(dataValidade) => handleUpdate({ dataValidade })}
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
					<MobileEditableField label="Qtd. prevista">
						<EditableNumberCell
							value={item.quantidadePrevista ?? 0}
							ariaLabel="Editar quantidade prevista"
							min={0}
							onCommit={(quantidadePrevista) => handleUpdate({ quantidadePrevista })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Qtd. real">
						<EditableNumberCell
							value={item.quantidadeReal ?? 0}
							ariaLabel="Editar quantidade real"
							min={0}
							onCommit={(quantidadeReal) => handleUpdate({ quantidadeReal })}
						/>
					</MobileEditableField>
				</div>
				<div className="grid w-full grid-cols-1 gap-2">
					<DurationInput
						label="PRAZO DE VALIDADE"
						value={item.prazoValidadeValor}
						measure={prazoValidadeMedida}
						options={VALIDITY_DURATION_OPTIONS}
						valuePlaceholder="Prazo"
						measurePlaceholder="Medida"
						onValueChange={(prazoValidadeValor) => handleUpdate({ prazoValidadeValor })}
						onMeasureChange={(prazoValidadeMedida) => handleUpdate({ prazoValidadeMedida })}
						onMeasureReset={() => handleUpdate({ prazoValidadeMedida: null, prazoValidadeValor: null })}
					/>
					<DateInput
						label="VALIDADE REAL"
						value={dateToInputValue(item.dataValidade)}
						handleChange={(value) => handleUpdate({ dataValidade: inputValueToDate(value) })}
					/>
				</div>
			</div>
		</div>
	);
}

function DraftProductionOutputRow({
	addProductionOutput,
	gridRow,
	gridBounds,
}: {
	addProductionOutput: (item: ProductionOutputState) => void;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
}) {
	const [draftItem, setDraftItem] = useState<ProductionOutputState>(() => createEmptyProductionOutput());
	const prazoValidadeMedida = normalizeValidityDurationMeasure(draftItem.prazoValidadeMedida);

	function updateDraftItem(item: Partial<ProductionOutputState>) {
		const nextDraftItem = normalizeOutputValues({ ...draftItem, ...item });

		if (nextDraftItem.produtoId && (nextDraftItem.quantidadePrevista ?? 0) > 0) {
			addProductionOutput(nextDraftItem);
			setDraftItem(createEmptyProductionOutput());
			return;
		}

		setDraftItem(nextDraftItem);
	}

	return (
		<div className="border-t border-dashed border-border bg-muted/20">
			<div className="hidden min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40 lg:flex">
				<div className="flex w-[30%] items-center gap-1 px-1">
					<Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<ProductCell
							item={draftItem}
							gridRow={gridRow}
							gridCol={PRODUCTION_OUTPUT_GRID_COL.PRODUCT}
							gridBounds={gridBounds}
							onChange={updateDraftItem}
							placeholder="NOVO PRODUTO"
						/>
					</div>
				</div>
				<p className="w-[8%] truncate px-2 text-center text-muted-foreground">{draftItem.produto?.unidade || "UN"}</p>
				<div className="w-[12%] px-1">
					<EditableNumberCell
						value={draftItem.quantidadePrevista ?? 0}
						ariaLabel="Editar quantidade prevista do novo item"
						min={0}
						gridRow={gridRow}
						gridCol={PRODUCTION_OUTPUT_GRID_COL.QTY_PLANNED}
						gridBounds={gridBounds}
						onCommit={(quantidadePrevista) => updateDraftItem({ quantidadePrevista })}
					/>
				</div>
				<div className="w-[12%] px-1">
					<EditableNumberCell
						value={draftItem.quantidadeReal ?? 0}
						ariaLabel="Editar quantidade real do novo item"
						min={0}
						gridRow={gridRow}
						gridCol={PRODUCTION_OUTPUT_GRID_COL.QTY_REAL}
						gridBounds={gridBounds}
						onCommit={(quantidadeReal) => updateDraftItem({ quantidadeReal })}
					/>
				</div>
				<div className="w-[10%] px-1">
					<ValidityDurationValueCell
						value={draftItem.prazoValidadeValor}
						measure={prazoValidadeMedida}
						gridRow={gridRow}
						gridCol={PRODUCTION_OUTPUT_GRID_COL.VALIDITY_VALUE}
						gridBounds={gridBounds}
						onCommit={(prazoValidadeValor) => updateDraftItem({ prazoValidadeValor })}
					/>
				</div>
				<div className="w-[8%] px-1">
					<ValidityDurationMeasureCell
						measure={prazoValidadeMedida}
						gridRow={gridRow}
						gridCol={PRODUCTION_OUTPUT_GRID_COL.VALIDITY_MEASURE}
						gridBounds={gridBounds}
						onMeasureChange={(prazoValidadeMedida) => updateDraftItem({ prazoValidadeMedida })}
						onReset={() => updateDraftItem({ prazoValidadeMedida: null, prazoValidadeValor: null })}
					/>
				</div>
				<div className="w-[13%] px-1">
					<ProductionDateCell
						value={draftItem.dataValidade}
						gridRow={gridRow}
						gridCol={PRODUCTION_OUTPUT_GRID_COL.EXPIRY_DATE}
						gridBounds={gridBounds}
						onCommit={(dataValidade) => updateDraftItem({ dataValidade })}
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
					<MobileEditableField label="Qtd. prevista">
						<EditableNumberCell
							value={draftItem.quantidadePrevista ?? 0}
							ariaLabel="Editar quantidade prevista do novo item"
							min={0}
							onCommit={(quantidadePrevista) => updateDraftItem({ quantidadePrevista })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Qtd. real">
						<EditableNumberCell
							value={draftItem.quantidadeReal ?? 0}
							ariaLabel="Editar quantidade real do novo item"
							min={0}
							onCommit={(quantidadeReal) => updateDraftItem({ quantidadeReal })}
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
	produto?: { id?: string; nome: string; codigo: string | null; unidade?: string | null; imagemCapaUrl: string | null } | null;
	produtoVariante?: { id?: string; nome: string; codigo: string | null; imagemCapaUrl: string | null } | null;
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

function ProductionDateCell({
	value,
	gridRow,
	gridCol,
	onCommit,
}: {
	value: Date | null | undefined;
	gridRow: number;
	gridCol: number;
	gridBounds: SpreadsheetGridBounds;
	onCommit: (value: Date | null) => void;
}) {
	const inputValue = dateToInputValue(value);

	return (
		<SpreadsheetCellWrapper gridRow={gridRow} gridCol={gridCol}>
			<DateInput
				label="VALIDADE REAL"
				showLabel={false}
				value={inputValue}
				holderClassName="h-8 rounded-md border-transparent bg-transparent px-2 py-1 text-center text-xs shadow-none hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-calendar-picker-indicator]:opacity-60"
				handleChange={(nextValue) => onCommit(inputValueToDate(nextValue))}
			/>
		</SpreadsheetCellWrapper>
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

function createEmptyProductionInput(): ProductionInputState {
	return {
		produtoId: "",
		produtoVarianteId: null,
		quantidadePrevista: 1,
		quantidadeReal: 1,
		produto: null,
		produtoVariante: null,
	};
}

function createEmptyProductionOutput(): ProductionOutputState {
	return {
		produtoId: "",
		produtoVarianteId: null,
		quantidadePrevista: 1,
		quantidadeReal: 1,
		prazoValidadeMedida: null,
		prazoValidadeValor: null,
		dataValidade: null,
		produto: null,
		produtoVariante: null,
	};
}

function normalizeInputValues(item: ProductionInputState): ProductionInputState {
	return {
		...item,
		quantidadePrevista: Number(item.quantidadePrevista) || 0,
		quantidadeReal: Number(item.quantidadeReal) || 0,
	};
}

function normalizeOutputValues(item: ProductionOutputState): ProductionOutputState {
	return {
		...item,
		quantidadePrevista: Number(item.quantidadePrevista) || 0,
		quantidadeReal: Number(item.quantidadeReal) || 0,
		prazoValidadeValor: item.prazoValidadeValor == null ? null : Number(item.prazoValidadeValor) || 0,
	};
}

function getItemDisplayName(item: ProductItemLike) {
	if (item.produtoVariante?.nome && item.produto?.nome) return `${item.produto.nome} - ${item.produtoVariante.nome}`;
	return item.produto?.nome ?? "";
}

function dateToInputValue(date: Date | null | undefined) {
	if (!date) return undefined;
	return date.toISOString().slice(0, 10);
}

function inputValueToDate(value: string | undefined) {
	if (!value) return null;
	return new Date(`${value}T00:00:00.000Z`);
}
