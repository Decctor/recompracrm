"use client";

import DeleteRowButton from "@/components/Spreadsheet/DeleteRowButton";
import EditableNumberCell from "@/components/Spreadsheet/EditableNumberCell";
import EditableTextCell from "@/components/Spreadsheet/EditableTextCell";
import MobileEditableField from "@/components/Spreadsheet/MobileEditableField";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { formatToMoney } from "@/lib/formatting";
import { SPREADSHEET_TABLE_ATTR, type SpreadsheetGridBounds } from "@/lib/spreadsheet-navigation";
import { cn } from "@/lib/utils";
import type { TProductAddOnOptionState, TProductAddOnState, TUseProductState } from "@/state-hooks/use-product-state";
import { Check, ChevronDown, ChevronUp, Layers, LinkIcon, Plus, RotateCcw, Share2, Unplug } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import ProductVinculation from "../ProductVinculation";

const ADDON_OPTION_GRID_COL = {
	NAME: 0,
	CODE: 1,
	PRICE: 2,
	MAX_QTY: 3,
	STOCK: 4,
	ACTIVE: 5,
} as const;

const ADDON_OPTION_GRID_COL_COUNT = 6;

const ADDON_OPTION_TABLE_GRID =
	"grid-cols-[minmax(0,28fr)_minmax(0,12fr)_minmax(0,12fr)_minmax(0,10fr)_minmax(0,18fr)_minmax(2.5rem,6fr)_minmax(2.5rem,5fr)]";

const ADDON_OPTION_DESKTOP_ROW = cn("hidden w-full lg:grid", ADDON_OPTION_TABLE_GRID, "items-center gap-x-1 px-2");

function AddOnGroupIndexBadge({ index, draft }: { index?: number; draft?: boolean }) {
	if (draft) {
		return (
			<span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-background px-1.5">
				<Plus className="h-3.5 w-3.5 text-muted-foreground" />
			</span>
		);
	}

	return (
		<span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background px-1.5 text-[0.65rem] font-semibold tabular-nums tracking-tight text-muted-foreground">
			{String(index).padStart(2, "0")}
		</span>
	);
}

function AddOnGroupOrderControls({
	groupName,
	canMoveUp,
	canMoveDown,
	onMove,
}: {
	groupName: string;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMove: (direction: "up" | "down") => void;
}) {
	return (
		<div className="flex shrink-0 items-center">
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				disabled={!canMoveUp}
				aria-label={`Mover o grupo ${groupName} para cima`}
				onClick={() => onMove("up")}
			>
				<ChevronUp className="h-4 w-4" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				disabled={!canMoveDown}
				aria-label={`Mover o grupo ${groupName} para baixo`}
				onClick={() => onMove("down")}
			>
				<ChevronDown className="h-4 w-4" />
			</Button>
		</div>
	);
}

function AddOnGroupMetaChip({
	label,
	title,
	overridden = false,
	onReset,
	children,
}: {
	label: string;
	title?: string;
	overridden?: boolean;
	onReset?: () => void;
	children: ReactNode;
}) {
	return (
		<div
			title={title}
			className={cn(
				"inline-flex h-8 items-center gap-1.5 rounded-md border px-2",
				overridden ? "border-blue-500/40 bg-blue-500/10" : "border-border bg-background/80",
			)}
		>
			<span className={cn("text-[0.62rem] font-medium uppercase tracking-wide", overridden ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")}>
				{label}
			</span>
			{children}
			{overridden && onReset ? (
				<button
					type="button"
					onClick={onReset}
					aria-label={`Voltar a herdar ${label.toLowerCase()} do grupo`}
					className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<RotateCcw className="h-3 w-3" />
				</button>
			) : null}
		</div>
	);
}

type ProductStateAddOnsBlockProps = {
	addOns: TUseProductState["state"]["productAddOns"];
	usageByAddOnId?: Record<string, number>;
	addProductAddOn: TUseProductState["addProductAddOn"];
	updateProductAddOn: TUseProductState["updateProductAddOn"];
	removeProductAddOn: TUseProductState["removeProductAddOn"];
	moveProductAddOn: TUseProductState["moveProductAddOn"];
	addProductAddOnOption: TUseProductState["addProductAddOnOption"];
	updateProductAddOnOption: TUseProductState["updateProductAddOnOption"];
	removeProductAddOnOption: TUseProductState["removeProductAddOnOption"];
	embedded?: boolean;
};

type ValidAddOnRow = TProductAddOnState & { originalIndex: number };

export default function ProductStateAddOnsBlock({
	addOns,
	usageByAddOnId,
	addProductAddOn,
	updateProductAddOn,
	removeProductAddOn,
	moveProductAddOn,
	addProductAddOnOption,
	updateProductAddOnOption,
	removeProductAddOnOption,
	embedded = false,
}: ProductStateAddOnsBlockProps) {
	const validAddOns = useMemo(
		() => addOns.map((addOn, index) => ({ ...addOn, originalIndex: index })).filter((addOn) => !addOn.deletar),
		[addOns],
	);

	const content = (
		<AddOnGroupsList
			validAddOns={validAddOns}
			usageByAddOnId={usageByAddOnId}
			addProductAddOn={addProductAddOn}
			updateProductAddOn={updateProductAddOn}
			removeProductAddOn={removeProductAddOn}
			moveProductAddOn={moveProductAddOn}
			addProductAddOnOption={addProductAddOnOption}
			updateProductAddOnOption={updateProductAddOnOption}
			removeProductAddOnOption={removeProductAddOnOption}
		/>
	);

	if (embedded) return content;

	return (
		<ResponsiveMenuSection title="ADICIONAIS" icon={<Layers className="h-4 min-h-4 w-4 min-w-4" />}>
			{content}
		</ResponsiveMenuSection>
	);
}

type AddOnGroupsListProps = {
	validAddOns: ValidAddOnRow[];
	usageByAddOnId?: Record<string, number>;
	addProductAddOn: TUseProductState["addProductAddOn"];
	updateProductAddOn: TUseProductState["updateProductAddOn"];
	removeProductAddOn: TUseProductState["removeProductAddOn"];
	moveProductAddOn: TUseProductState["moveProductAddOn"];
	addProductAddOnOption: TUseProductState["addProductAddOnOption"];
	updateProductAddOnOption: TUseProductState["updateProductAddOnOption"];
	removeProductAddOnOption: TUseProductState["removeProductAddOnOption"];
};

function AddOnGroupsList({
	validAddOns,
	usageByAddOnId,
	addProductAddOn,
	updateProductAddOn,
	removeProductAddOn,
	moveProductAddOn,
	addProductAddOnOption,
	updateProductAddOnOption,
	removeProductAddOnOption,
}: AddOnGroupsListProps) {
	return (
		<div className="flex w-full flex-col gap-5">
			{validAddOns.length === 0 ? (
				<div className="flex w-full items-center justify-center rounded-md border border-border px-3 py-3">
					<p className="text-center text-xs font-medium tracking-tight text-muted-foreground">Preencha o grupo abaixo.</p>
				</div>
			) : null}

			{validAddOns.map((addOn, groupIndex) => (
				<AddOnGroupPanel
					key={addOn.id || `temp-addon-${addOn.originalIndex}`}
					groupIndex={groupIndex + 1}
					addOn={addOn}
					usageCount={addOn.id ? usageByAddOnId?.[addOn.id] : undefined}
					canMoveUp={groupIndex > 0}
					canMoveDown={groupIndex < validAddOns.length - 1}
					onMove={(direction) => moveProductAddOn(addOn.originalIndex, direction)}
					onUpdate={(partial) => updateProductAddOn(addOn.originalIndex, partial)}
					onRemove={() => removeProductAddOn(addOn.originalIndex)}
					addOption={(option) => addProductAddOnOption(addOn.originalIndex, option)}
					updateOption={(optionIndex, partial) => updateProductAddOnOption(addOn.originalIndex, optionIndex, partial)}
					removeOption={(optionIndex) => removeProductAddOnOption(addOn.originalIndex, optionIndex)}
				/>
			))}

			<DraftAddOnGroupPanel addProductAddOn={addProductAddOn} />
		</div>
	);
}

type AddOnGroupPanelProps = {
	groupIndex: number;
	addOn: ValidAddOnRow;
	usageCount?: number;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMove: (direction: "up" | "down") => void;
	onUpdate: (partial: Partial<Omit<TProductAddOnState, "opcoes">>) => void;
	onRemove: () => void;
	addOption: (option: TProductAddOnOptionState) => void;
	updateOption: (optionIndex: number, partial: Partial<TProductAddOnOptionState>) => void;
	removeOption: (optionIndex: number) => void;
};

function AddOnGroupPanel({
	groupIndex,
	addOn,
	usageCount,
	canMoveUp,
	canMoveDown,
	onMove,
	onUpdate,
	onRemove,
	addOption,
	updateOption,
	removeOption,
}: AddOnGroupPanelProps) {
	const validOptions = useMemo(
		() => addOn.opcoes.map((option, index) => ({ ...option, originalIndex: index })).filter((option) => !option.deletar),
		[addOn.opcoes],
	);

	const gridBounds: SpreadsheetGridBounds = useMemo(
		() => ({
			rowCount: validOptions.length + 1,
			colCount: ADDON_OPTION_GRID_COL_COUNT,
		}),
		[validOptions.length],
	);

	function handleGroupUpdate(partial: Partial<Omit<TProductAddOnState, "opcoes">>) {
		const next = { ...addOn, ...partial };
		if (!validateAddOnGroupFields(next)) return;
		onUpdate(partial);
	}

	return (
		<div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xs">
			<AddOnGroupHeader
				groupIndex={groupIndex}
				addOn={addOn}
				usageCount={usageCount}
				canMoveUp={canMoveUp}
				canMoveDown={canMoveDown}
				onMove={onMove}
				onUpdate={handleGroupUpdate}
				onRemove={onRemove}
			/>

			<AddOnOptionTable
				validOptions={validOptions}
				gridBounds={gridBounds}
				addOption={addOption}
				updateOption={updateOption}
				removeOption={removeOption}
			/>
		</div>
	);
}

type AddOnGroupHeaderProps = {
	groupIndex: number;
	addOn: ValidAddOnRow;
	usageCount?: number;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMove: (direction: "up" | "down") => void;
	onUpdate: (partial: Partial<Omit<TProductAddOnState, "opcoes">>) => void;
	onRemove: () => void;
};

function AddOnGroupSharedBadge({ usageCount }: { usageCount?: number }) {
	if (!usageCount || usageCount <= 1) return null;

	return (
		<span
			title={`Esse grupo é usado em ${usageCount} produtos. Alterações aqui afetam todos eles; remover apenas desvincula desse produto.`}
			className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-[0.62rem] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500"
		>
			<Share2 className="h-3 w-3 shrink-0" />
			{`Usado em ${usageCount} produtos`}
		</span>
	);
}

function AddOnGroupHeader({ groupIndex, addOn, usageCount, canMoveUp, canMoveDown, onMove, onUpdate, onRemove }: AddOnGroupHeaderProps) {
	const orderControls = (
		<AddOnGroupOrderControls groupName={addOn.nome || `grupo ${groupIndex}`} canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMove={onMove} />
	);

	return (
		<div className="border-b border-border bg-muted">
			<div className="hidden flex-col gap-2 px-3 py-2.5 lg:flex">
				<div className="flex items-start justify-between gap-3">
					<div className="flex min-w-0 flex-1 items-start gap-2.5">
						<div className="flex shrink-0 items-center gap-0.5">
							<AddOnGroupIndexBadge index={groupIndex} />
							{orderControls}
						</div>
						<div className="min-w-0 flex-1 space-y-1">
							<div className="min-w-0 [&_button]:h-9 [&_button]:text-sm [&_button]:font-semibold [&_button]:text-foreground [&_input]:h-9 [&_input]:text-sm [&_input]:font-semibold">
								<EditableTextCell
									value={addOn.nome}
									ariaLabel="Nome do grupo para o cliente"
									align="left"
									emptyDisplay="Nome do grupo"
									onCommit={(nome) => onUpdate({ nome })}
								/>
							</div>
							<div className="flex min-w-0 items-center gap-1.5">
								<span className="shrink-0 text-[0.62rem] font-medium uppercase tracking-wide text-muted-foreground">Interno</span>
								<div className="min-w-0 flex-1 [&_button]:h-7 [&_button]:text-xs [&_input]:h-7 [&_input]:text-xs">
									<EditableTextCell
										value={addOn.internoNome ?? ""}
										ariaLabel="Nome interno do grupo"
										align="left"
										emptyDisplay="Nome interno"
										onCommit={(internoNome) => onUpdate({ internoNome })}
									/>
								</div>
							</div>
						</div>
					</div>

					<div className="flex shrink-0 items-center gap-1.5">
						<AddOnGroupSharedBadge usageCount={usageCount} />
						<AddOnGroupMetaChip
							label="Mín"
							overridden={addOn.vinculoMinOpcoes != null}
							onReset={() => onUpdate({ vinculoMinOpcoes: null })}
							title={
								addOn.vinculoMinOpcoes != null
									? `Personalizado neste produto — padrão do grupo: ${addOn.minOpcoes}`
									: "Herdado do grupo. Editar aqui personaliza a regra só para este produto."
							}
						>
							<div className="w-8 [&_button]:h-6 [&_button]:px-1 [&_button]:text-xs [&_input]:h-6 [&_input]:px-1 [&_input]:text-xs">
								<EditableNumberCell
									value={addOn.vinculoMinOpcoes ?? addOn.minOpcoes}
									ariaLabel="Mínimo de opções neste produto"
									min={0}
									format={(value) => String(Math.round(value))}
									onCommit={(value) => {
										const rounded = Math.round(value);
										onUpdate({ vinculoMinOpcoes: rounded === addOn.minOpcoes ? null : rounded });
									}}
								/>
							</div>
						</AddOnGroupMetaChip>
						<AddOnGroupMetaChip
							label="Máx"
							overridden={addOn.vinculoMaxOpcoes != null}
							onReset={() => onUpdate({ vinculoMaxOpcoes: null })}
							title={
								addOn.vinculoMaxOpcoes != null
									? `Personalizado neste produto — padrão do grupo: ${addOn.maxOpcoes}`
									: "Herdado do grupo. Editar aqui personaliza a regra só para este produto."
							}
						>
							<div className="w-8 [&_button]:h-6 [&_button]:px-1 [&_button]:text-xs [&_input]:h-6 [&_input]:px-1 [&_input]:text-xs">
								<EditableNumberCell
									value={addOn.vinculoMaxOpcoes ?? addOn.maxOpcoes}
									ariaLabel="Máximo de opções neste produto"
									min={1}
									format={(value) => String(Math.round(value))}
									onCommit={(value) => {
										const rounded = Math.round(value);
										onUpdate({ vinculoMaxOpcoes: rounded === addOn.maxOpcoes ? null : rounded });
									}}
								/>
							</div>
						</AddOnGroupMetaChip>
						<AddOnActiveToggle active={addOn.ativo} onToggle={() => onUpdate({ ativo: !addOn.ativo })} />
						<DeleteRowButton onRemove={onRemove} ariaLabel="Remover grupo de adicionais" />
					</div>
				</div>
			</div>

			<div className="flex flex-col gap-2 p-3 lg:hidden">
				<div className="flex items-start gap-2">
					<AddOnGroupIndexBadge index={groupIndex} />
					<div className="flex min-w-0 flex-1 items-start justify-between gap-2">
						<div className="grid min-w-0 flex-1 grid-cols-1 gap-2">
							<MobileEditableField label="Nome (cliente)">
								<EditableTextCell
									value={addOn.nome}
									ariaLabel="Nome do grupo para o cliente"
									onCommit={(nome) => onUpdate({ nome })}
								/>
							</MobileEditableField>
							<MobileEditableField label="Nome interno">
								<EditableTextCell
									value={addOn.internoNome ?? ""}
									ariaLabel="Nome interno do grupo"
									onCommit={(internoNome) => onUpdate({ internoNome })}
								/>
							</MobileEditableField>
						</div>
						<div className="flex shrink-0 items-center">
							{orderControls}
							<DeleteRowButton onRemove={onRemove} ariaLabel="Remover grupo de adicionais" />
						</div>
					</div>
				</div>
				<AddOnGroupSharedBadge usageCount={usageCount} />
				<div className="grid grid-cols-3 gap-2">
					<MobileEditableField label={addOn.vinculoMinOpcoes != null ? "Mín (deste produto)" : "Mín"}>
						<EditableNumberCell
							value={addOn.vinculoMinOpcoes ?? addOn.minOpcoes}
							ariaLabel="Mínimo de opções neste produto"
							min={0}
							format={(value) => String(Math.round(value))}
							onCommit={(value) => {
								const rounded = Math.round(value);
								onUpdate({ vinculoMinOpcoes: rounded === addOn.minOpcoes ? null : rounded });
							}}
						/>
					</MobileEditableField>
					<MobileEditableField label={addOn.vinculoMaxOpcoes != null ? "Máx (deste produto)" : "Máx"}>
						<EditableNumberCell
							value={addOn.vinculoMaxOpcoes ?? addOn.maxOpcoes}
							ariaLabel="Máximo de opções neste produto"
							min={1}
							format={(value) => String(Math.round(value))}
							onCommit={(value) => {
								const rounded = Math.round(value);
								onUpdate({ vinculoMaxOpcoes: rounded === addOn.maxOpcoes ? null : rounded });
							}}
						/>
					</MobileEditableField>
					<MobileEditableField label="Ativo">
						<div className="flex h-8 items-center">
							<AddOnActiveToggle active={addOn.ativo} onToggle={() => onUpdate({ ativo: !addOn.ativo })} />
						</div>
					</MobileEditableField>
				</div>
			</div>
		</div>
	);
}

function AddOnActiveToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			onClick={onToggle}
			aria-label={active ? "Grupo ativo" : "Grupo inativo"}
			className={cn("h-8 w-8", active ? "text-green-600 hover:text-green-700" : "text-muted-foreground")}
		>
			<Check className={cn("h-4 w-4", !active && "opacity-20")} />
		</Button>
	);
}

export type ValidOptionRow = TProductAddOnOptionState & { originalIndex: number };

type AddOnOptionTableProps = {
	validOptions: ValidOptionRow[];
	gridBounds: SpreadsheetGridBounds;
	addOption: (option: TProductAddOnOptionState) => void;
	updateOption: (optionIndex: number, partial: Partial<TProductAddOnOptionState>) => void;
	removeOption: (optionIndex: number) => void;
};

export function AddOnOptionTable({ validOptions, gridBounds, addOption, updateOption, removeOption }: AddOnOptionTableProps) {
	return (
		<div {...{ [SPREADSHEET_TABLE_ATTR]: "true" }} className="flex w-full flex-col">
			<div
				className={cn(
					ADDON_OPTION_DESKTOP_ROW,
					"min-h-8 border-b border-border bg-background py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground",
				)}
			>
				<p className="min-w-0 px-1 text-start">Opção</p>
				<p className="min-w-0 px-1 text-center">Código</p>
				<p className="min-w-0 px-1 text-center">Δ Preço</p>
				<p className="min-w-0 px-1 text-center">Máx qtd</p>
				<p className="min-w-0 px-1 text-center">Estoque</p>
				<p className="min-w-0 px-1 text-center">Ativo</p>
				<p className="min-w-0 px-1 text-center">Ações</p>
			</div>

			<div className="flex w-full flex-col bg-background">
				{validOptions.map((option, rowIndex) => (
					<AddOnOptionTableRow
						key={option.id || `temp-opt-${option.originalIndex}`}
						option={option}
						gridRow={rowIndex}
						gridBounds={gridBounds}
						onUpdate={(partial) => updateOption(option.originalIndex, partial)}
						onRemove={() => removeOption(option.originalIndex)}
					/>
				))}

				<DraftAddOnOptionRow addOption={addOption} gridRow={validOptions.length} gridBounds={gridBounds} />
			</div>
		</div>
	);
}

type AddOnOptionTableRowProps = {
	option: ValidOptionRow;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
	onUpdate: (partial: Partial<TProductAddOnOptionState>) => void;
	onRemove: () => void;
};

function AddOnOptionTableRow({ option, gridRow, gridBounds, onUpdate, onRemove }: AddOnOptionTableRowProps) {
	return (
		<div
			title={!option.ativo ? "Opção inativa — não aparece nos canais de venda. Reative pela coluna ATIVO." : undefined}
			className={cn("border-t border-border", gridRow % 2 === 1 && "bg-muted/10", !option.ativo && "bg-muted/40 opacity-60")}
		>
			<div className={cn(ADDON_OPTION_DESKTOP_ROW, "min-h-11 py-1 text-xs transition-colors hover:bg-muted/40")}>
				<div className="min-w-0 px-1">
					<EditableTextCell
						value={option.nome}
						ariaLabel="Editar nome da opção"
						align="left"
						gridRow={gridRow}
						gridCol={ADDON_OPTION_GRID_COL.NAME}
						gridBounds={gridBounds}
						onCommit={(nome) => onUpdate({ nome })}
					/>
				</div>
				<div className="min-w-0 px-1">
					<EditableTextCell
						value={option.codigo ?? ""}
						ariaLabel="Editar código da opção"
						align="center"
						gridRow={gridRow}
						gridCol={ADDON_OPTION_GRID_COL.CODE}
						gridBounds={gridBounds}
						onCommit={(codigo) => onUpdate({ codigo })}
					/>
				</div>
				<div className="min-w-0 px-1">
					<EditableNumberCell
						value={option.precoDelta}
						ariaLabel="Editar diferença de preço"
						min={0}
						gridRow={gridRow}
						gridCol={ADDON_OPTION_GRID_COL.PRICE}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? formatToMoney(value) : "-")}
						onCommit={(precoDelta) => onUpdate({ precoDelta })}
					/>
				</div>
				<div className="min-w-0 px-1">
					<EditableNumberCell
						value={option.maxQtdePorItem ?? 1}
						ariaLabel="Editar quantidade máxima"
						min={1}
						gridRow={gridRow}
						gridCol={ADDON_OPTION_GRID_COL.MAX_QTY}
						gridBounds={gridBounds}
						format={(value) => String(Math.round(value))}
						onCommit={(maxQtdePorItem) => onUpdate({ maxQtdePorItem: Math.round(maxQtdePorItem) })}
					/>
				</div>
				<div className="min-w-0 px-1">
					<AddOnStockCell option={option} onUpdate={onUpdate} />
				</div>
				<div className="flex min-w-0 justify-center px-1">
					<AddOnActiveToggle active={option.ativo} onToggle={() => onUpdate({ ativo: !option.ativo })} />
				</div>
				<div className="flex min-w-0 justify-center px-1">
					<DeleteRowButton onRemove={onRemove} ariaLabel="Remover opção" />
				</div>
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<MobileEditableField label="Opção">
							<EditableTextCell
								value={option.nome}
								ariaLabel="Editar nome da opção"
								onCommit={(nome) => onUpdate({ nome })}
							/>
						</MobileEditableField>
					</div>
					<DeleteRowButton onRemove={onRemove} ariaLabel="Remover opção" />
				</div>
				<div className="grid grid-cols-2 gap-2">
					<MobileEditableField label="Código">
						<EditableTextCell
							value={option.codigo ?? ""}
							ariaLabel="Editar código da opção"
							align="center"
							onCommit={(codigo) => onUpdate({ codigo })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Máx qtd">
						<EditableNumberCell
							value={option.maxQtdePorItem ?? 1}
							ariaLabel="Editar quantidade máxima"
							min={1}
							format={(value) => String(Math.round(value))}
							onCommit={(maxQtdePorItem) => onUpdate({ maxQtdePorItem: Math.round(maxQtdePorItem) })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Δ Preço">
						<EditableNumberCell
							value={option.precoDelta}
							ariaLabel="Editar diferença de preço"
							min={0}
							format={(value) => (value > 0 ? formatToMoney(value) : "-")}
							onCommit={(precoDelta) => onUpdate({ precoDelta })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Ativo">
						<div className="flex h-8 items-center">
							<AddOnActiveToggle active={option.ativo} onToggle={() => onUpdate({ ativo: !option.ativo })} />
						</div>
					</MobileEditableField>
				</div>
				<MobileEditableField label="Estoque">
					<AddOnStockCell option={option} onUpdate={onUpdate} />
				</MobileEditableField>
			</div>
		</div>
	);
}

type AddOnStockCellProps = {
	option: TProductAddOnOptionState;
	onUpdate: (partial: Partial<TProductAddOnOptionState>) => void;
};

function AddOnStockCell({ option, onUpdate }: AddOnStockCellProps) {
	const [vinculationModalIsOpen, setVinculationModalIsOpen] = useState(false);

	if (option.produtoConsumo) {
		return (
			<>
				<div className="flex min-w-0 items-center gap-1">
					<LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<span className="min-w-0 flex-1 truncate text-xs text-foreground/80" title={option.produtoConsumo}>
						{option.produtoConsumo}
					</span>
					<div className="w-14 shrink-0">
						<EditableNumberCell
							value={option.quantidadeConsumo}
							ariaLabel="Quantidade de consumo"
							min={0.000001}
							onCommit={(quantidadeConsumo) => onUpdate({ quantidadeConsumo })}
						/>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => onUpdate({ produtoConsumo: null, produtoId: null, produtoVarianteId: null, quantidadeConsumo: 1 })}
						aria-label="Desvincular produto de estoque"
						className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
					>
						<Unplug className="h-3.5 w-3.5" />
					</Button>
				</div>
			</>
		);
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setVinculationModalIsOpen(true)}
				className="flex h-8 w-full items-center justify-center rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40"
			>
				-
			</button>
			{vinculationModalIsOpen ? (
				<ProductVinculation
					closeModal={() => setVinculationModalIsOpen(false)}
					handleSelection={(product, variant) => {
						onUpdate(
							variant
								? { produtoConsumo: variant.nome, produtoId: null, produtoVarianteId: variant.id }
								: { produtoConsumo: product.nome, produtoId: product.id, produtoVarianteId: null },
						);
						setVinculationModalIsOpen(false);
					}}
				/>
			) : null}
		</>
	);
}

function createEmptyAddOnOption(): TProductAddOnOptionState {
	return {
		nome: "",
		codigo: "",
		precoDelta: 0,
		maxQtdePorItem: 1,
		ativo: true,
		quantidadeConsumo: 1,
	};
}

function isDraftAddOnOptionReady(option: TProductAddOnOptionState) {
	return Boolean(option.nome.trim());
}

function validateDraftAddOnOption(option: TProductAddOnOptionState) {
	if (!option.nome.trim()) {
		toast.error("Nome da opção não informado.");
		return false;
	}
	return true;
}

type DraftAddOnOptionRowProps = {
	addOption: (option: TProductAddOnOptionState) => void;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
};

function DraftAddOnOptionRow({ addOption, gridRow, gridBounds }: DraftAddOnOptionRowProps) {
	const [draftOption, setDraftOption] = useState<TProductAddOnOptionState>(() => createEmptyAddOnOption());

	function updateDraft(partial: Partial<TProductAddOnOptionState>) {
		const nextDraft = { ...draftOption, ...partial };

		if (isDraftAddOnOptionReady(nextDraft)) {
			if (!validateDraftAddOnOption(nextDraft)) {
				setDraftOption(nextDraft);
				return;
			}
			addOption(nextDraft);
			setDraftOption(createEmptyAddOnOption());
			return;
		}

		setDraftOption(nextDraft);
	}

	return (
		<div className="border-t border-dashed border-border bg-muted/20">
			<div className={cn(ADDON_OPTION_DESKTOP_ROW, "min-h-11 py-1 text-xs transition-colors hover:bg-muted/40")}>
				<div className="flex min-w-0 items-center gap-1 px-1">
					<Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<EditableTextCell
							value={draftOption.nome}
							ariaLabel="Nome da nova opção"
							align="left"
							gridRow={gridRow}
							gridCol={ADDON_OPTION_GRID_COL.NAME}
							gridBounds={gridBounds}
							onCommit={(nome) => updateDraft({ nome })}
						/>
					</div>
				</div>
				<div className="min-w-0 px-1">
					<EditableTextCell
						value={draftOption.codigo ?? ""}
						ariaLabel="Código da nova opção"
						align="center"
						gridRow={gridRow}
						gridCol={ADDON_OPTION_GRID_COL.CODE}
						gridBounds={gridBounds}
						onCommit={(codigo) => updateDraft({ codigo })}
					/>
				</div>
				<div className="min-w-0 px-1">
					<EditableNumberCell
						value={draftOption.precoDelta}
						ariaLabel="Diferença de preço da nova opção"
						min={0}
						gridRow={gridRow}
						gridCol={ADDON_OPTION_GRID_COL.PRICE}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? formatToMoney(value) : "-")}
						onCommit={(precoDelta) => updateDraft({ precoDelta })}
					/>
				</div>
				<div className="min-w-0 px-1">
					<EditableNumberCell
						value={draftOption.maxQtdePorItem ?? 1}
						ariaLabel="Quantidade máxima da nova opção"
						min={1}
						gridRow={gridRow}
						gridCol={ADDON_OPTION_GRID_COL.MAX_QTY}
						gridBounds={gridBounds}
						format={(value) => String(Math.round(value))}
						onCommit={(maxQtdePorItem) => updateDraft({ maxQtdePorItem: Math.round(maxQtdePorItem) })}
					/>
				</div>
				<div className="min-w-0 px-1">
					<span className="flex h-8 w-full items-center justify-center text-xs text-muted-foreground">-</span>
				</div>
				<div className="flex min-w-0 justify-center px-1">
					<AddOnActiveToggle active={draftOption.ativo} onToggle={() => updateDraft({ ativo: !draftOption.ativo })} />
				</div>
				<div aria-hidden className="min-w-0 px-1" />
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex items-start gap-2">
					<Plus className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<MobileEditableField label="Opção">
							<EditableTextCell
								value={draftOption.nome}
								ariaLabel="Nome da nova opção"
								onCommit={(nome) => updateDraft({ nome })}
							/>
						</MobileEditableField>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<MobileEditableField label="Código">
						<EditableTextCell
							value={draftOption.codigo ?? ""}
							ariaLabel="Código da nova opção"
							align="center"
							onCommit={(codigo) => updateDraft({ codigo })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Máx qtd">
						<EditableNumberCell
							value={draftOption.maxQtdePorItem ?? 1}
							ariaLabel="Quantidade máxima da nova opção"
							min={1}
							format={(value) => String(Math.round(value))}
							onCommit={(maxQtdePorItem) => updateDraft({ maxQtdePorItem: Math.round(maxQtdePorItem) })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Δ Preço">
						<EditableNumberCell
							value={draftOption.precoDelta}
							ariaLabel="Diferença de preço da nova opção"
							min={0}
							format={(value) => (value > 0 ? formatToMoney(value) : "-")}
							onCommit={(precoDelta) => updateDraft({ precoDelta })}
						/>
					</MobileEditableField>
				</div>
			</div>
		</div>
	);
}

function createEmptyAddOn(): TProductAddOnState {
	return {
		nome: "",
		internoNome: "",
		minOpcoes: 0,
		maxOpcoes: 1,
		ativo: true,
		opcoes: [],
	};
}

function isDraftAddOnReady(addOn: TProductAddOnState) {
	return Boolean(addOn.nome.trim() && addOn.internoNome?.trim() && addOn.maxOpcoes >= 1 && addOn.minOpcoes >= 0 && addOn.maxOpcoes >= addOn.minOpcoes);
}

export function validateAddOnGroupFields(
	addOn: Pick<TProductAddOnState, "nome" | "internoNome" | "minOpcoes" | "maxOpcoes"> & {
		vinculoMinOpcoes?: number | null;
		vinculoMaxOpcoes?: number | null;
	},
) {
	// Valida a regra EFETIVA (override do vínculo, quando presente, sobre o padrão do grupo).
	const effectiveMin = addOn.vinculoMinOpcoes ?? addOn.minOpcoes;
	const effectiveMax = addOn.vinculoMaxOpcoes ?? addOn.maxOpcoes;
	if (!addOn.nome.trim()) {
		toast.error("Nome do grupo não informado.");
		return false;
	}
	if (!addOn.internoNome?.trim()) {
		toast.error("Nome interno do grupo não informado.");
		return false;
	}
	if (effectiveMin < 0) {
		toast.error("Mínimo de opções inválido.");
		return false;
	}
	if (effectiveMax < 1) {
		toast.error("Máximo de opções deve ser pelo menos 1.");
		return false;
	}
	if (effectiveMax < effectiveMin) {
		toast.error("Máximo de opções não pode ser menor que o mínimo.");
		return false;
	}
	return true;
}

type DraftAddOnGroupPanelProps = {
	addProductAddOn: TUseProductState["addProductAddOn"];
};

function DraftAddOnGroupPanel({ addProductAddOn }: DraftAddOnGroupPanelProps) {
	const [draftAddOn, setDraftAddOn] = useState<TProductAddOnState>(() => createEmptyAddOn());

	function updateDraft(partial: Partial<Omit<TProductAddOnState, "opcoes">>) {
		const nextDraft = { ...draftAddOn, ...partial };

		if (isDraftAddOnReady(nextDraft)) {
			if (!validateAddOnGroupFields(nextDraft)) {
				setDraftAddOn(nextDraft);
				return;
			}
			addProductAddOn(nextDraft);
			setDraftAddOn(createEmptyAddOn());
			return;
		}

		setDraftAddOn(nextDraft);
	}

	return (
		<div className="overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 shadow-xs">
			<div className="hidden flex-col gap-2 px-3 py-2.5 lg:flex">
				<div className="flex items-start justify-between gap-3">
					<div className="flex min-w-0 flex-1 items-start gap-2.5">
						<AddOnGroupIndexBadge draft />
						<div className="min-w-0 flex-1 space-y-1">
							<p className="text-[0.62rem] font-medium uppercase tracking-wide text-muted-foreground">Novo grupo</p>
							<div className="min-w-0 [&_button]:h-9 [&_button]:text-sm [&_button]:font-semibold [&_button]:text-foreground [&_input]:h-9 [&_input]:text-sm [&_input]:font-semibold">
								<EditableTextCell
									value={draftAddOn.nome}
									ariaLabel="Nome do novo grupo para o cliente"
									align="left"
									emptyDisplay="Nome do grupo"
									onCommit={(nome) => updateDraft({ nome })}
								/>
							</div>
							<div className="flex min-w-0 items-center gap-1.5">
								<span className="shrink-0 text-[0.62rem] font-medium uppercase tracking-wide text-muted-foreground">Interno</span>
								<div className="min-w-0 flex-1 [&_button]:h-7 [&_button]:text-xs [&_input]:h-7 [&_input]:text-xs">
									<EditableTextCell
										value={draftAddOn.internoNome ?? ""}
										ariaLabel="Nome interno do novo grupo"
										align="left"
										emptyDisplay="Nome interno"
										onCommit={(internoNome) => updateDraft({ internoNome })}
									/>
								</div>
							</div>
						</div>
					</div>

					<div className="flex shrink-0 items-center gap-1.5">
						<AddOnGroupMetaChip label="Mín">
							<div className="w-8 [&_button]:h-6 [&_button]:px-1 [&_button]:text-xs [&_input]:h-6 [&_input]:px-1 [&_input]:text-xs">
								<EditableNumberCell
									value={draftAddOn.minOpcoes}
									ariaLabel="Mínimo do novo grupo"
									min={0}
									format={(value) => String(Math.round(value))}
									onCommit={(minOpcoes) => updateDraft({ minOpcoes: Math.round(minOpcoes) })}
								/>
							</div>
						</AddOnGroupMetaChip>
						<AddOnGroupMetaChip label="Máx">
							<div className="w-8 [&_button]:h-6 [&_button]:px-1 [&_button]:text-xs [&_input]:h-6 [&_input]:px-1 [&_input]:text-xs">
								<EditableNumberCell
									value={draftAddOn.maxOpcoes}
									ariaLabel="Máximo do novo grupo"
									min={1}
									format={(value) => String(Math.round(value))}
									onCommit={(maxOpcoes) => updateDraft({ maxOpcoes: Math.round(maxOpcoes) })}
								/>
							</div>
						</AddOnGroupMetaChip>
						<AddOnActiveToggle active={draftAddOn.ativo} onToggle={() => updateDraft({ ativo: !draftAddOn.ativo })} />
					</div>
				</div>
			</div>

			<div className="flex flex-col gap-2 p-3 lg:hidden">
				<div className="flex items-start gap-2">
					<AddOnGroupIndexBadge draft />
					<div className="grid min-w-0 flex-1 grid-cols-1 gap-2">
						<MobileEditableField label="Nome (cliente)">
							<EditableTextCell
								value={draftAddOn.nome}
								ariaLabel="Nome do novo grupo para o cliente"
								onCommit={(nome) => updateDraft({ nome })}
							/>
						</MobileEditableField>
						<MobileEditableField label="Nome interno">
							<EditableTextCell
								value={draftAddOn.internoNome ?? ""}
								ariaLabel="Nome interno do novo grupo"
								onCommit={(internoNome) => updateDraft({ internoNome })}
							/>
						</MobileEditableField>
					</div>
				</div>
				<div className="grid grid-cols-3 gap-2">
					<MobileEditableField label="Mín">
						<EditableNumberCell
							value={draftAddOn.minOpcoes}
							ariaLabel="Mínimo do novo grupo"
							min={0}
							format={(value) => String(Math.round(value))}
							onCommit={(minOpcoes) => updateDraft({ minOpcoes: Math.round(minOpcoes) })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Máx">
						<EditableNumberCell
							value={draftAddOn.maxOpcoes}
							ariaLabel="Máximo do novo grupo"
							min={1}
							format={(value) => String(Math.round(value))}
							onCommit={(maxOpcoes) => updateDraft({ maxOpcoes: Math.round(maxOpcoes) })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Ativo">
						<div className="flex h-8 items-center">
							<AddOnActiveToggle active={draftAddOn.ativo} onToggle={() => updateDraft({ ativo: !draftAddOn.ativo })} />
						</div>
					</MobileEditableField>
				</div>
			</div>
		</div>
	);
}
