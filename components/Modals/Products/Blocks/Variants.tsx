"use client";

import DeleteRowButton from "@/components/Spreadsheet/DeleteRowButton";
import EditableNumberCell from "@/components/Spreadsheet/EditableNumberCell";
import EditableTextCell from "@/components/Spreadsheet/EditableTextCell";
import MobileEditableField from "@/components/Spreadsheet/MobileEditableField";
import ProductBarcodeConflictHint from "@/components/Products/Shared/ProductBarcodeConflictHint";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatToMoney } from "@/lib/formatting";
import { SPREADSHEET_TABLE_ATTR, type SpreadsheetGridBounds } from "@/lib/spreadsheet-navigation";
import { cn } from "@/lib/utils";
import type { TUseProductState } from "@/state-hooks/use-product-state";
import { GitBranch, ImageIcon, Plus } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * Colunas da planilha de variantes. A coluna de custo só existe para quem vê custos
 * (dadosSensiveis.visualizarCustos); sem ela os índices de navegação por teclado se deslocam, então
 * o layout inteiro (índices, contagem e template do grid) sai daqui.
 *
 * Proporções (24+11+13+9+11+11+9+5); grid garante alinhamento header ↔ linhas.
 */
function resolveVariantGrid(canViewCosts: boolean) {
	const template = canViewCosts
		? "grid-cols-[minmax(0,24fr)_minmax(0,11fr)_minmax(0,13fr)_minmax(0,9fr)_minmax(0,11fr)_minmax(0,11fr)_minmax(0,9fr)_minmax(2.5rem,5fr)]"
		: "grid-cols-[minmax(0,24fr)_minmax(0,11fr)_minmax(0,13fr)_minmax(0,9fr)_minmax(0,11fr)_minmax(0,9fr)_minmax(2.5rem,5fr)]";
	return {
		canViewCosts,
		col: canViewCosts
			? { VARIANT: 0, CODE: 1, BARCODE: 2, CONTENT: 3, COST: 4, SALE: 5, STOCK: 6 }
			: { VARIANT: 0, CODE: 1, BARCODE: 2, CONTENT: 3, COST: -1, SALE: 4, STOCK: 5 },
		colCount: canViewCosts ? 7 : 6,
		desktopRow: cn("hidden w-full lg:grid", template, "items-center gap-x-1 px-2"),
	};
}
type TVariantGrid = ReturnType<typeof resolveVariantGrid>;

type VariantOptionTag = { opcaoNome: string; valorNome: string; isColor: boolean; hex: string };

type TProductVariantState = TUseProductState["state"]["productVariants"][number];

type ProductStateVariantsBlockProps = {
	variants: TUseProductState["state"]["productVariants"];
	options?: TUseProductState["state"]["productOptions"];
	addVariant: TUseProductState["addProductVariant"];
	updateVariant: TUseProductState["updateProductVariant"];
	updateVariantImageHolder: TUseProductState["updateProductVariantImageHolder"];
	removeVariant: TUseProductState["removeProductVariant"];
	/** Id do produto em edição, para o aviso de código de barras duplicado ignorar o próprio cadastro. */
	productId?: string | null;
	embedded?: boolean;
	// dadosSensiveis.visualizarCustos: sem ela não há coluna de custo e a variante nova não o exige.
	canViewCosts: boolean;
};

export default function ProductStateVariantsBlock({
	variants,
	options = [],
	addVariant,
	updateVariant,
	updateVariantImageHolder,
	removeVariant,
	productId = null,
	embedded = false,
	canViewCosts,
}: ProductStateVariantsBlockProps) {
	const resolveTags = useVariantOptionTags(options);
	const grid = useMemo(() => resolveVariantGrid(canViewCosts), [canViewCosts]);
	const validVariants = useMemo(
		() => variants.map((variant, index) => ({ ...variant, originalIndex: index })).filter((variant) => !variant.deletar),
		[variants],
	);
	const gridBounds: SpreadsheetGridBounds = useMemo(
		() => ({
			rowCount: validVariants.length + 1,
			colCount: grid.colCount,
		}),
		[validVariants.length, grid.colCount],
	);

	const content = (
		<VariantTable
			grid={grid}
			validVariants={validVariants}
			gridBounds={gridBounds}
			resolveTags={resolveTags}
			addVariant={addVariant}
			updateVariant={updateVariant}
			updateVariantImageHolder={updateVariantImageHolder}
			removeVariant={removeVariant}
			productId={productId}
		/>
	);

	if (embedded) return content;

	return (
		<ResponsiveMenuSection title="VARIANTES" icon={<GitBranch className="h-4 min-h-4 w-4 min-w-4" />}>
			{content}
		</ResponsiveMenuSection>
	);
}

function useVariantOptionTags(options: TUseProductState["state"]["productOptions"]) {
	return useMemo(() => {
		const valueLookup = new Map<string, VariantOptionTag>();
		for (const option of options) {
			if (option.deletar) continue;
			for (const value of option.valores) {
				if (value.deletar) continue;
				valueLookup.set(value.referenciaId, {
					opcaoNome: option.nome,
					valorNome: value.nome,
					isColor: option.tipo === "COR",
					hex: value.valorAuxiliar ?? "#24549c",
				});
			}
		}

		return (variant: TProductVariantState): VariantOptionTag[] =>
			(variant.opcoesValores ?? [])
				.filter((ref) => !ref.deletar)
				.map((ref) => valueLookup.get(ref.valorReferenciaId))
				.filter((tag): tag is VariantOptionTag => !!tag);
	}, [options]);
}

type ValidVariantRow = TProductVariantState & { originalIndex: number };

type VariantTableProps = {
	grid: TVariantGrid;
	validVariants: ValidVariantRow[];
	gridBounds: SpreadsheetGridBounds;
	resolveTags: (variant: TProductVariantState) => VariantOptionTag[];
	addVariant: TUseProductState["addProductVariant"];
	updateVariant: TUseProductState["updateProductVariant"];
	updateVariantImageHolder: TUseProductState["updateProductVariantImageHolder"];
	removeVariant: TUseProductState["removeProductVariant"];
	productId: string | null;
};

function VariantTable({
	grid,
	validVariants,
	gridBounds,
	resolveTags,
	addVariant,
	updateVariant,
	updateVariantImageHolder,
	removeVariant,
	productId,
}: VariantTableProps) {
	return (
		<div {...{ [SPREADSHEET_TABLE_ATTR]: "true" }} className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-background">
			<div className={cn(grid.desktopRow, "min-h-9 border-b border-border bg-muted/60 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground")}>
				<p className="min-w-0 px-1 text-start">Variante</p>
				<p className="min-w-0 px-1 text-center">Código</p>
				<p className="min-w-0 px-1 text-center">Cód. barras</p>
				<p className="min-w-0 px-1 text-center">Conteúdo</p>
				{grid.canViewCosts ? <p className="min-w-0 px-1 text-center">Custo</p> : null}
				<p className="min-w-0 px-1 text-center">Venda</p>
				<p className="min-w-0 px-1 text-center">Estoque</p>
				<p className="min-w-0 px-1 text-center">Ações</p>
			</div>

			<div className="flex w-full flex-col bg-background">
				{validVariants.map((variant, rowIndex) => (
					<VariantTableRow
						key={variant.referenciaId}
						grid={grid}
						variant={variant}
						tags={resolveTags(variant)}
						gridRow={rowIndex}
						gridBounds={gridBounds}
						productId={productId}
						onUpdate={(partial) => updateVariant(variant.originalIndex, partial)}
						onImageChange={(holder) => updateVariantImageHolder(variant.originalIndex, holder)}
						onRemove={() => removeVariant(variant.originalIndex)}
					/>
				))}

				<DraftVariantTableRow grid={grid} addVariant={addVariant} gridRow={validVariants.length} gridBounds={gridBounds} />

				{validVariants.length === 0 ? (
					<div className="flex w-full items-center justify-center border-t border-border px-3 py-3">
						<p className="text-center text-xs font-medium tracking-tight text-muted-foreground">
							Preencha a linha abaixo ou gere variantes pelos eixos.
						</p>
					</div>
				) : null}
			</div>
		</div>
	);
}

type VariantTableRowProps = {
	grid: TVariantGrid;
	variant: ValidVariantRow;
	tags: VariantOptionTag[];
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
	productId: string | null;
	onUpdate: (partial: Partial<Omit<TProductVariantState, "imagemCapaHolder" | "addOns">>) => void;
	onImageChange: (holder: Partial<TProductVariantState["imagemCapaHolder"]>) => void;
	onRemove: () => void;
};

function VariantTableRow({ grid, variant, tags, gridRow, gridBounds, productId, onUpdate, onImageChange, onRemove }: VariantTableRowProps) {
	return (
		<div className="border-t border-border first:border-t-0">
			<div className={cn(grid.desktopRow, "min-h-11 py-1 text-xs transition-colors hover:bg-muted/40")}>
				<div className="min-w-0 px-1">
					<VariantIdentityCell
						variant={variant}
						tags={tags}
						inputId={`variant-thumb-${variant.originalIndex}`}
						gridRow={gridRow}
						gridCol={grid.col.VARIANT}
						gridBounds={gridBounds}
						onNameCommit={(nome) => onUpdate({ nome })}
						onImageChange={onImageChange}
					/>
				</div>
				<div className="min-w-0 px-1">
					<EditableTextCell
						value={variant.codigo}
						ariaLabel="Editar código da variante"
						align="center"
						gridRow={gridRow}
						gridCol={grid.col.CODE}
						gridBounds={gridBounds}
						onCommit={(codigo) => onUpdate({ codigo })}
					/>
				</div>
				<div className="relative min-w-0 px-1">
					<EditableTextCell
						value={variant.codigoBarras ?? ""}
						ariaLabel="Editar código de barras da variante"
						align="center"
						gridRow={gridRow}
						gridCol={grid.col.BARCODE}
						gridBounds={gridBounds}
						onCommit={(codigoBarras) => onUpdate({ codigoBarras: codigoBarras.trim() ? codigoBarras : null })}
					/>
					<ProductBarcodeConflictHint
						compact
						code={variant.codigoBarras}
						excludeProductId={productId}
						excludeVariantId={variant.id ?? null}
						className="pointer-events-auto absolute right-1.5 top-1/2 -translate-y-1/2"
					/>
				</div>
				<div className="min-w-0 px-1">
					<EditableNumberCell
						value={variant.conteudoQuantidade ?? 0}
						ariaLabel="Editar conteúdo da variante"
						min={0}
						gridRow={gridRow}
						gridCol={grid.col.CONTENT}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? value.toLocaleString("pt-BR") : "-")}
						onCommit={(conteudoQuantidade) => onUpdate({ conteudoQuantidade: conteudoQuantidade > 0 ? conteudoQuantidade : null })}
					/>
				</div>
				{grid.canViewCosts ? (
					<div className="min-w-0 px-1">
						<EditableNumberCell
							value={variant.precoCusto}
							ariaLabel="Editar preço de custo"
							min={0}
							gridRow={gridRow}
							gridCol={grid.col.COST}
							gridBounds={gridBounds}
							format={(value) => (value > 0 ? formatToMoney(value) : "-")}
							onCommit={(precoCusto) => onUpdate({ precoCusto })}
						/>
					</div>
				) : null}
				<div className="min-w-0 px-1">
					<EditableNumberCell
						value={variant.precoVenda}
						ariaLabel="Editar preço de venda"
						min={0}
						gridRow={gridRow}
						gridCol={grid.col.SALE}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? formatToMoney(value) : "-")}
						onCommit={(precoVenda) => onUpdate({ precoVenda })}
					/>
				</div>
				<div className="min-w-0 px-1">
					<EditableNumberCell
						value={variant.quantidade}
						ariaLabel="Editar estoque"
						min={0}
						gridRow={gridRow}
						gridCol={grid.col.STOCK}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? String(Math.round(value)) : "-")}
						onCommit={(quantidade) => onUpdate({ quantidade: Math.round(quantidade) })}
					/>
				</div>
				<div className="flex min-w-0 justify-center px-1">
					<DeleteRowButton onRemove={onRemove} ariaLabel="Remover variante" />
				</div>
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex w-full items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<VariantIdentityCell
							variant={variant}
							tags={tags}
							inputId={`variant-thumb-mobile-${variant.originalIndex}`}
							onNameCommit={(nome) => onUpdate({ nome })}
							onImageChange={onImageChange}
						/>
					</div>
					<DeleteRowButton onRemove={onRemove} ariaLabel="Remover variante" />
				</div>
				<div className="grid w-full grid-cols-2 gap-2">
					<MobileEditableField label="Código">
						<EditableTextCell
							value={variant.codigo}
							ariaLabel="Editar código da variante"
							align="center"
							onCommit={(codigo) => onUpdate({ codigo })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Cód. barras">
						<div className="relative">
							<EditableTextCell
								value={variant.codigoBarras ?? ""}
								ariaLabel="Editar código de barras da variante"
								align="center"
								onCommit={(codigoBarras) => onUpdate({ codigoBarras: codigoBarras.trim() ? codigoBarras : null })}
							/>
							<ProductBarcodeConflictHint
								compact
								code={variant.codigoBarras}
								excludeProductId={productId}
								excludeVariantId={variant.id ?? null}
								className="absolute right-1.5 top-1/2 -translate-y-1/2"
							/>
						</div>
					</MobileEditableField>
					<MobileEditableField label="Conteúdo">
						<EditableNumberCell
							value={variant.conteudoQuantidade ?? 0}
							ariaLabel="Editar conteúdo da variante"
							min={0}
							format={(value) => (value > 0 ? value.toLocaleString("pt-BR") : "-")}
							onCommit={(conteudoQuantidade) => onUpdate({ conteudoQuantidade: conteudoQuantidade > 0 ? conteudoQuantidade : null })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Estoque">
						<EditableNumberCell
							value={variant.quantidade}
							ariaLabel="Editar estoque"
							min={0}
							format={(value) => (value > 0 ? String(Math.round(value)) : "-")}
							onCommit={(quantidade) => onUpdate({ quantidade: Math.round(quantidade) })}
						/>
					</MobileEditableField>
					{grid.canViewCosts ? (
						<MobileEditableField label="Custo">
							<EditableNumberCell
								value={variant.precoCusto}
								ariaLabel="Editar preço de custo"
								min={0}
								format={(value) => (value > 0 ? formatToMoney(value) : "-")}
								onCommit={(precoCusto) => onUpdate({ precoCusto })}
							/>
						</MobileEditableField>
					) : null}
					<MobileEditableField label="Venda">
						<EditableNumberCell
							value={variant.precoVenda}
							ariaLabel="Editar preço de venda"
							min={0}
							format={(value) => (value > 0 ? formatToMoney(value) : "-")}
							onCommit={(precoVenda) => onUpdate({ precoVenda })}
						/>
					</MobileEditableField>
				</div>
			</div>
		</div>
	);
}

type VariantIdentityCellProps = {
	variant: TProductVariantState;
	tags: VariantOptionTag[];
	inputId: string;
	onNameCommit: (nome: string) => void;
	onImageChange: (holder: Partial<TProductVariantState["imagemCapaHolder"]>) => void;
	gridRow?: number;
	gridCol?: number;
	gridBounds?: SpreadsheetGridBounds;
};

function VariantIdentityCell({ variant, tags, inputId, onNameCommit, onImageChange, gridRow, gridCol, gridBounds }: VariantIdentityCellProps) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<label
				htmlFor={inputId}
				className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border bg-muted/40"
			>
				<VariantThumbnail
					imageUrl={variant.imagemCapaUrl}
					imageHolder={variant.imagemCapaHolder}
				/>
				<input
					id={inputId}
					accept=".png,.jpeg,.jpg"
					className="sr-only"
					type="file"
					onChange={(event) => {
						const file = event.target.files?.[0] ?? null;
						onImageChange({
							file,
							previewUrl: file ? URL.createObjectURL(file) : null,
						});
					}}
				/>
			</label>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<EditableTextCell
					value={variant.nome}
					ariaLabel="Editar nome da variante"
					align="left"
					gridRow={gridRow}
					gridCol={gridCol}
					gridBounds={gridBounds}
					onCommit={onNameCommit}
				/>
				{tags.length > 0 ? (
					<div className="flex w-full flex-wrap items-center gap-1">
						{tags.map((tag, index) => (
							<div
								key={`${tag.opcaoNome}-${tag.valorNome}-${index}`}
								className="flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-1.5 pr-2"
							>
								{tag.isColor ? (
									<span className="h-2 w-2 shrink-0 rounded-full border border-border" style={{ backgroundColor: tag.hex }} />
								) : null}
								<span className="text-[0.6rem] font-medium text-muted-foreground">
									<span className="uppercase tracking-tight text-foreground/50">{tag.opcaoNome}:</span> {tag.valorNome}
								</span>
							</div>
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}

function VariantThumbnail({
	imageUrl,
	imageHolder,
}: {
	imageUrl: TProductVariantState["imagemCapaUrl"];
	imageHolder: TProductVariantState["imagemCapaHolder"];
}) {
	if (imageHolder.previewUrl) {
		return <Image alt="Capa da variante" fill className="object-cover" src={imageHolder.previewUrl} />;
	}
	if (imageUrl) {
		return <Image alt="Capa da variante" fill className="object-cover" src={imageUrl} />;
	}

	return (
		<div className="flex h-full w-full items-center justify-center bg-primary/20 text-muted-foreground">
			<ImageIcon className="h-3.5 w-3.5" />
		</div>
	);
}

function createEmptyVariant(): TProductVariantState {
	return {
		referenciaId: crypto.randomUUID(),
		nome: "",
		codigo: "",
		precoCusto: 0,
		precoVenda: 0,
		quantidade: 0,
		ativo: true,
		rastreamentoEstoqueAtivo: false,
		imagemCapaHolder: {
			file: null,
			previewUrl: null,
		},
		addOns: [],
		perfisFiscais: [],
	};
}

// Sem ver custo, a variante nasce sem custo: ele não pode ser exigido de quem nem vê o campo.
function isDraftVariantReady(variant: TProductVariantState, canViewCosts: boolean) {
	return Boolean(variant.nome.trim() && variant.codigo.trim() && (!canViewCosts || variant.precoCusto > 0) && variant.precoVenda > 0);
}

function validateDraftVariant(variant: TProductVariantState, canViewCosts: boolean) {
	if (!variant.nome.trim()) {
		toast.error("Nome da variante não informado.");
		return false;
	}
	if (!variant.codigo.trim()) {
		toast.error("Código da variante não informado.");
		return false;
	}
	if (canViewCosts && !variant.precoCusto) {
		toast.error("Preço de custo da variante não informado.");
		return false;
	}
	if (!variant.precoVenda) {
		toast.error("Preço de venda da variante não informado.");
		return false;
	}
	return true;
}

type DraftVariantTableRowProps = {
	grid: TVariantGrid;
	addVariant: TUseProductState["addProductVariant"];
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
};

function DraftVariantTableRow({ grid, addVariant, gridRow, gridBounds }: DraftVariantTableRowProps) {
	const [draftVariant, setDraftVariant] = useState<TProductVariantState>(() => createEmptyVariant());

	function updateDraft(partial: Partial<Omit<TProductVariantState, "imagemCapaHolder" | "addOns">>) {
		const nextDraft = { ...draftVariant, ...partial };

		if (isDraftVariantReady(nextDraft, grid.canViewCosts)) {
			if (!validateDraftVariant(nextDraft, grid.canViewCosts)) {
				setDraftVariant(nextDraft);
				return;
			}
			addVariant(nextDraft);
			setDraftVariant(createEmptyVariant());
			return;
		}

		setDraftVariant(nextDraft);
	}

	function updateDraftImage(holder: Partial<TProductVariantState["imagemCapaHolder"]>) {
		setDraftVariant((prev) => ({
			...prev,
			imagemCapaHolder: {
				...prev.imagemCapaHolder,
				...holder,
			},
		}));
	}

	return (
		<div className={cn("border-t border-dashed border-border bg-muted/20")}>
			<div className={cn(grid.desktopRow, "min-h-11 py-1 text-xs transition-colors hover:bg-muted/40")}>
				<div className="flex min-w-0 items-center gap-1 px-1">
					<Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<VariantIdentityCell
							variant={draftVariant}
							tags={[]}
							inputId="variant-thumb-draft"
							gridRow={gridRow}
							gridCol={grid.col.VARIANT}
							gridBounds={gridBounds}
							onNameCommit={(nome) => updateDraft({ nome })}
							onImageChange={updateDraftImage}
						/>
					</div>
				</div>
				<div className="min-w-0 px-1">
					<EditableTextCell
						value={draftVariant.codigo}
						ariaLabel="Código da nova variante"
						align="center"
						gridRow={gridRow}
						gridCol={grid.col.CODE}
						gridBounds={gridBounds}
						onCommit={(codigo) => updateDraft({ codigo })}
					/>
				</div>
				<div className="min-w-0 px-1">
					<EditableTextCell
						value={draftVariant.codigoBarras ?? ""}
						ariaLabel="Código de barras da nova variante"
						align="center"
						gridRow={gridRow}
						gridCol={grid.col.BARCODE}
						gridBounds={gridBounds}
						onCommit={(codigoBarras) => updateDraft({ codigoBarras: codigoBarras.trim() ? codigoBarras : null })}
					/>
				</div>
				<div className="min-w-0 px-1">
					<EditableNumberCell
						value={draftVariant.conteudoQuantidade ?? 0}
						ariaLabel="Conteúdo da nova variante"
						min={0}
						gridRow={gridRow}
						gridCol={grid.col.CONTENT}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? value.toLocaleString("pt-BR") : "-")}
						onCommit={(conteudoQuantidade) => updateDraft({ conteudoQuantidade: conteudoQuantidade > 0 ? conteudoQuantidade : null })}
					/>
				</div>
				{grid.canViewCosts ? (
					<div className="min-w-0 px-1">
						<EditableNumberCell
							value={draftVariant.precoCusto}
							ariaLabel="Preço de custo da nova variante"
							min={0}
							gridRow={gridRow}
							gridCol={grid.col.COST}
							gridBounds={gridBounds}
							format={(value) => (value > 0 ? formatToMoney(value) : "-")}
							onCommit={(precoCusto) => updateDraft({ precoCusto })}
						/>
					</div>
				) : null}
				<div className="min-w-0 px-1">
					<EditableNumberCell
						value={draftVariant.precoVenda}
						ariaLabel="Preço de venda da nova variante"
						min={0}
						gridRow={gridRow}
						gridCol={grid.col.SALE}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? formatToMoney(value) : "-")}
						onCommit={(precoVenda) => updateDraft({ precoVenda })}
					/>
				</div>
				<div className="min-w-0 px-1">
					<EditableNumberCell
						value={draftVariant.quantidade}
						ariaLabel="Estoque da nova variante"
						min={0}
						gridRow={gridRow}
						gridCol={grid.col.STOCK}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? String(Math.round(value)) : "-")}
						onCommit={(quantidade) => updateDraft({ quantidade: Math.round(quantidade) })}
					/>
				</div>
				<div aria-hidden className="min-w-0 px-1" />
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex w-full items-start gap-2">
					<Plus className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<VariantIdentityCell
							variant={draftVariant}
							tags={[]}
							inputId="variant-thumb-draft-mobile"
							onNameCommit={(nome) => updateDraft({ nome })}
							onImageChange={updateDraftImage}
						/>
					</div>
				</div>
				<div className="grid w-full grid-cols-2 gap-2">
					<MobileEditableField label="Código">
						<EditableTextCell
							value={draftVariant.codigo}
							ariaLabel="Código da nova variante"
							align="center"
							onCommit={(codigo) => updateDraft({ codigo })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Cód. barras">
						<EditableTextCell
							value={draftVariant.codigoBarras ?? ""}
							ariaLabel="Código de barras da nova variante"
							align="center"
							onCommit={(codigoBarras) => updateDraft({ codigoBarras: codigoBarras.trim() ? codigoBarras : null })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Conteúdo">
						<EditableNumberCell
							value={draftVariant.conteudoQuantidade ?? 0}
							ariaLabel="Conteúdo da nova variante"
							min={0}
							format={(value) => (value > 0 ? value.toLocaleString("pt-BR") : "-")}
							onCommit={(conteudoQuantidade) => updateDraft({ conteudoQuantidade: conteudoQuantidade > 0 ? conteudoQuantidade : null })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Estoque">
						<EditableNumberCell
							value={draftVariant.quantidade}
							ariaLabel="Estoque da nova variante"
							min={0}
							format={(value) => (value > 0 ? String(Math.round(value)) : "-")}
							onCommit={(quantidade) => updateDraft({ quantidade: Math.round(quantidade) })}
						/>
					</MobileEditableField>
					{grid.canViewCosts ? (
						<MobileEditableField label="Custo">
							<EditableNumberCell
								value={draftVariant.precoCusto}
								ariaLabel="Preço de custo da nova variante"
								min={0}
								format={(value) => (value > 0 ? formatToMoney(value) : "-")}
								onCommit={(precoCusto) => updateDraft({ precoCusto })}
							/>
						</MobileEditableField>
					) : null}
					<MobileEditableField label="Venda">
						<EditableNumberCell
							value={draftVariant.precoVenda}
							ariaLabel="Preço de venda da nova variante"
							min={0}
							format={(value) => (value > 0 ? formatToMoney(value) : "-")}
							onCommit={(precoVenda) => updateDraft({ precoVenda })}
						/>
					</MobileEditableField>
				</div>
			</div>
		</div>
	);
}
