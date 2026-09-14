import DateInput from "@/components/Inputs/DateInput";
import SelectProductWithVariants, { type TSelectProductWithVariantsValue } from "@/components/Inputs/SelectProductWithVariants";
import DeleteRowButton from "@/components/Spreadsheet/DeleteRowButton";
import EditableNumberCell from "@/components/Spreadsheet/EditableNumberCell";
import MobileEditableField from "@/components/Spreadsheet/MobileEditableField";
import SpreadsheetCellWrapper from "@/components/Spreadsheet/SpreadsheetCellWrapper";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { formatDateForInputValue, formatDateOnInputChange, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { calculatePurchaseItemCost, resolvePurchaseCostModifierSnapshot } from "@/lib/purchase/costing";
import {
	consumeProgrammaticSpreadsheetFocus,
	handleSpreadsheetNavigationKeyDown,
	SPREADSHEET_TABLE_ATTR,
	type SpreadsheetGridBounds,
} from "@/lib/spreadsheet-navigation";
import { cn } from "@/lib/utils";
import { TUsePurchaseState } from "@/state-hooks/use-purchase-state";
import { BadgeDollarSign, BoxIcon, CalendarClock, CalendarOff, Lock, Plus, ReceiptText, ShoppingCart, Sparkles, Trash2 } from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import ImportCompositionWithAI from "./Utils/ImportCompositionWithAI";

const PURCHASE_ITEM_GRID_COL = {
	PRODUCT: 0,
	QUANTITY: 1,
	UNIT_PRICE: 2,
	DISCOUNT: 3,
	SURCHARGE: 4,
} as const;

const PURCHASE_ITEM_GRID_COL_COUNT = 5;

type PurchaseItemsBlockProps = {
	purchaseItems: TUsePurchaseState["state"]["purchaseItems"];
	addPurchaseItem: TUsePurchaseState["addPurchaseItem"];
	updatePurchaseItem: TUsePurchaseState["updatePurchaseItem"];
	removePurchaseItem: TUsePurchaseState["removePurchaseItem"];
	/** Enables the AI import flow (needed to link the extracted supplier to the purchase). */
	updatePurchase?: TUsePurchaseState["updatePurchase"];
	/** O documento carrega o valor efetivo e a competência, que vivem no lançamento contábil. */
	accountingEntry?: TUsePurchaseState["state"]["lancamentoContabil"];
	updateAccountingEntry?: TUsePurchaseState["updateAccountingEntry"];
	fornecedorId?: string | null;
	importedDocuments?: TUsePurchaseState["state"]["purchase"]["documentosImportados"];
	/** When the purchase is already received, items are frozen to preserve the lots they spawned. */
	locked?: boolean;
};

type TPurchaseItemState = TUsePurchaseState["state"]["purchaseItems"][number];
type TPurchaseItemLot = NonNullable<TPurchaseItemState["lotes"]>[number];

export default function PurchaseItemsBlock({
	purchaseItems,
	addPurchaseItem,
	updatePurchaseItem,
	removePurchaseItem,
	updatePurchase,
	accountingEntry,
	updateAccountingEntry,
	fornecedorId = null,
	importedDocuments,
	locked = false,
}: PurchaseItemsBlockProps) {
	const [importModalIsOpen, setImportModalIsOpen] = useState(false);
	const visibleItems = useMemo(() => purchaseItems.map((item, index) => ({ item, index })).filter(({ item }) => !item.deletar), [purchaseItems]);
	const purchaseTotal = visibleItems.reduce((acc, { item }) => acc + getItemTotal(item), 0);
	const gridBounds: SpreadsheetGridBounds = useMemo(
		() => ({
			rowCount: visibleItems.length + 1,
			colCount: PURCHASE_ITEM_GRID_COL_COUNT,
		}),
		[visibleItems.length],
	);

	return (
		<ResponsiveMenuSection title="ITENS" icon={<ShoppingCart className="h-4 min-h-4 w-4 min-w-4" />}>
			{!locked && updatePurchase && accountingEntry && updateAccountingEntry ? (
				<>
					<div className="flex w-full items-center justify-end">
						<Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setImportModalIsOpen(true)}>
							<Sparkles className="h-3.5 w-3.5" />
							IMPORTAR DOCUMENTO
						</Button>
					</div>
					<ImportCompositionWithAI
						open={importModalIsOpen}
						onOpenChange={setImportModalIsOpen}
						addPurchaseItem={addPurchaseItem}
						updatePurchase={updatePurchase}
						accountingEntry={accountingEntry}
						updateAccountingEntry={updateAccountingEntry}
						currentFornecedorId={fornecedorId}
						currentImportedDocuments={importedDocuments}
					/>
				</>
			) : null}
			{locked ? (
				<div className="flex w-full items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
					<Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<p className="leading-relaxed">
						Compra recebida — os itens estão travados para preservar os lotes gerados. Para corrigir, cancele a compra (se os lotes ainda não foram usados)
						ou ajuste diretamente pelo estoque.
					</p>
				</div>
			) : null}
			<div {...{ [SPREADSHEET_TABLE_ATTR]: "true" }} className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-background">
				<div className="hidden min-h-9 w-full items-center border-b border-border bg-muted/60 px-2 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground lg:flex">
					<p className="w-[30%] px-2 text-start">Produto</p>
					<p className="w-[9%] px-2 text-center">Un.</p>
					<p className="w-[9%] px-2 text-center">Qtde</p>
					<p className="w-[13%] px-2 text-center">Valor unit.</p>
					<p className="w-[11%] px-2 text-center">Desc.</p>
					<p className="w-[11%] px-2 text-center">Acrésc.</p>
					<p className="w-[12%] px-2 text-center">Total</p>
					<p className="w-[5%] px-2 text-center">Ações</p>
				</div>

				<div className="flex w-full flex-col bg-background">
					{visibleItems.map(({ item, index }, rowIndex) => (
						<PurchaseCompositionTableItem
							key={item.id ?? `${item.produtoId}-${item.produtoVarianteId ?? "produto"}-${index}`}
							item={item}
							locked={locked}
							gridRow={rowIndex}
							gridBounds={gridBounds}
							handleUpdate={(updatedItem) => updatePurchaseItem({ index, item: normalizeItemValues({ ...item, ...updatedItem }) })}
							handleRemove={() => removePurchaseItem({ index })}
						/>
					))}
					{locked ? null : <DraftPurchaseCompositionItem addPurchaseItem={addPurchaseItem} gridRow={visibleItems.length} gridBounds={gridBounds} />}
					{visibleItems.length > 0 ? (
						<div className="flex w-full items-center justify-center border-t border-border px-2 py-2">
							<div className="flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground/80 tabular-nums">
								<BadgeDollarSign size={15} />
								<p>Total da compra: {formatToMoney(purchaseTotal)}</p>
							</div>
						</div>
					) : (
						<div className="flex w-full items-center justify-center border-t border-border px-3 py-3">
							<p className="text-center text-xs font-medium tracking-tight text-muted-foreground">
								Selecione um produto na linha em branco para começar a compra.
							</p>
						</div>
					)}
				</div>
			</div>
		</ResponsiveMenuSection>
	);
}

type PurchaseCompositionTableItemProps = {
	item: TPurchaseItemState;
	locked: boolean;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
	handleUpdate: (item: Partial<TPurchaseItemState>) => void;
	handleRemove: () => void;
};

function PurchaseCompositionTableItem({ item, locked, gridRow, gridBounds, handleUpdate, handleRemove }: PurchaseCompositionTableItemProps) {
	const rowTotal = getItemTotal(item);
	const lots = item.lotes ?? [];

	return (
		<div className="border-t border-border first:border-t-0">
			<div className="hidden min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40 lg:flex">
				<div className="flex w-[30%] items-center gap-1.5 px-1">
					<div className="min-w-0 flex-1">
						{locked ? (
							<StaticProductLabel item={item} />
						) : (
							<ProductCell item={item} gridRow={gridRow} gridCol={PURCHASE_ITEM_GRID_COL.PRODUCT} gridBounds={gridBounds} onChange={handleUpdate} />
						)}
					</div>
					<PurchaseItemExpiryControl item={item} locked={locked} lots={lots} handleUpdate={handleUpdate} />
					<PurchaseItemCostModifiersControl item={item} locked={locked} handleUpdate={handleUpdate} />
				</div>
				<p className="w-[9%] truncate px-2 text-center text-muted-foreground">{item.produto.unidade || "UN"}</p>
				<div className="w-[9%] px-1">
					{locked ? (
						<StaticNumberCell value={item.quantidade} />
					) : (
						<EditableNumberCell
							value={item.quantidade}
							ariaLabel="Editar quantidade"
							min={0.000001}
							gridRow={gridRow}
							gridCol={PURCHASE_ITEM_GRID_COL.QUANTITY}
							gridBounds={gridBounds}
							onCommit={(quantidade) => handleUpdate({ quantidade })}
						/>
					)}
				</div>
				<div className="w-[13%] px-1">
					{locked ? (
						<StaticNumberCell value={item.valorUnitarioBruto} format={(value) => (value > 0 ? formatToMoney(value) : "-")} />
					) : (
						<EditableNumberCell
							value={item.valorUnitarioBruto}
							ariaLabel="Editar valor unitário"
							min={0}
							gridRow={gridRow}
							gridCol={PURCHASE_ITEM_GRID_COL.UNIT_PRICE}
							gridBounds={gridBounds}
							format={(value) => (value > 0 ? formatToMoney(value) : "-")}
							onCommit={(valorUnitarioBruto) => handleUpdate({ valorUnitarioBruto })}
						/>
					)}
				</div>
				<div className="w-[11%] px-1">
					{locked || item.modificadoresCusto ? (
						<StaticNumberCell value={item.descontosTotal ?? 0} format={(value) => (value > 0 ? formatToMoney(value) : "-")} />
					) : (
						<EditableNumberCell
							value={item.descontosTotal ?? 0}
							ariaLabel="Editar descontos"
							min={0}
							gridRow={gridRow}
							gridCol={PURCHASE_ITEM_GRID_COL.DISCOUNT}
							gridBounds={gridBounds}
							format={(value) => (value > 0 ? formatToMoney(value) : "-")}
							onCommit={(descontosTotal) => handleUpdate({ descontosTotal })}
						/>
					)}
				</div>
				<div className="w-[11%] px-1">
					{locked || item.modificadoresCusto ? (
						<StaticNumberCell value={item.acrescimosTotal ?? 0} format={(value) => (value > 0 ? formatToMoney(value) : "-")} />
					) : (
						<EditableNumberCell
							value={item.acrescimosTotal ?? 0}
							ariaLabel="Editar acréscimos"
							min={0}
							gridRow={gridRow}
							gridCol={PURCHASE_ITEM_GRID_COL.SURCHARGE}
							gridBounds={gridBounds}
							format={(value) => (value > 0 ? formatToMoney(value) : "-")}
							onCommit={(acrescimosTotal) => handleUpdate({ acrescimosTotal })}
						/>
					)}
				</div>
				<p className="w-[12%] px-2 text-center font-mono text-xs tabular-nums text-foreground/80">{rowTotal > 0 ? formatToMoney(rowTotal) : "-"}</p>
				<div className="flex w-[5%] justify-center px-1">
					{locked ? (
						<Lock className="h-3.5 w-3.5 text-muted-foreground" />
					) : (
						<DeleteRowButton onRemove={handleRemove} ariaLabel="Remover item da compra" />
					)}
				</div>
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex w-full items-start justify-between gap-2">
					<div className="min-w-0 flex-1">{locked ? <StaticProductLabel item={item} /> : <ProductCell item={item} onChange={handleUpdate} />}</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<PurchaseItemExpiryControl item={item} locked={locked} lots={lots} handleUpdate={handleUpdate} />
						<PurchaseItemCostModifiersControl item={item} locked={locked} handleUpdate={handleUpdate} />
						{locked ? (
							<Lock className="mt-1 h-3.5 w-3.5 text-muted-foreground" />
						) : (
							<DeleteRowButton onRemove={handleRemove} ariaLabel="Remover item da compra" />
						)}
					</div>
				</div>
				<div className="grid w-full grid-cols-2 gap-2">
					<MobileEditableField label="Qtde">
						{locked ? (
							<StaticNumberCell value={item.quantidade} />
						) : (
							<EditableNumberCell
								value={item.quantidade}
								ariaLabel="Editar quantidade"
								min={0.000001}
								onCommit={(quantidade) => handleUpdate({ quantidade })}
							/>
						)}
					</MobileEditableField>
					<MobileEditableField label="Valor unit.">
						{locked ? (
							<StaticNumberCell value={item.valorUnitarioBruto} format={(value) => (value > 0 ? formatToMoney(value) : "-")} />
						) : (
							<EditableNumberCell
								value={item.valorUnitarioBruto}
								ariaLabel="Editar valor unitário"
								min={0}
								format={(value) => (value > 0 ? formatToMoney(value) : "-")}
								onCommit={(valorUnitarioBruto) => handleUpdate({ valorUnitarioBruto })}
							/>
						)}
					</MobileEditableField>
					{locked || item.modificadoresCusto ? null : (
						<MobileEditableField label="Desc.">
							<EditableNumberCell
								value={item.descontosTotal ?? 0}
								ariaLabel="Editar descontos"
								min={0}
								format={(value) => (value > 0 ? formatToMoney(value) : "-")}
								onCommit={(descontosTotal) => handleUpdate({ descontosTotal })}
							/>
						</MobileEditableField>
					)}
					{locked || item.modificadoresCusto ? null : (
						<MobileEditableField label="Acrésc.">
							<EditableNumberCell
								value={item.acrescimosTotal ?? 0}
								ariaLabel="Editar acréscimos"
								min={0}
								format={(value) => (value > 0 ? formatToMoney(value) : "-")}
								onCommit={(acrescimosTotal) => handleUpdate({ acrescimosTotal })}
							/>
						</MobileEditableField>
					)}
				</div>
				<div className="flex w-full items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5">
					<span className="text-[0.65rem] font-medium uppercase text-muted-foreground">Total</span>
					<span className="font-mono text-xs font-medium tabular-nums">{rowTotal > 0 ? formatToMoney(rowTotal) : "-"}</span>
				</div>
			</div>
		</div>
	);
}

const PURCHASE_MODIFIER_OPTIONS = [
	["DESCONTO", "Desconto"],
	["FRETE", "Frete"],
	["SEGURO", "Seguro"],
	["DESPESA_ACESSORIA", "Despesa acessória"],
	["IMPOSTOS_IPI", "IPI"],
	["IMPOSTOS_ICMS_ST", "ICMS-ST"],
	["IMPOSTOS_FCP_ST", "FCP-ST"],
	["OUTRO", "Outro acréscimo"],
] as const;

function PurchaseItemCostModifiersControl({
	item,
	locked,
	handleUpdate,
}: {
	item: TPurchaseItemState;
	locked: boolean;
	handleUpdate: (item: Partial<TPurchaseItemState>) => void;
}) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	// `undefined`, nunca `null`: o FloatingPortal do Base UI trata `container === null` como "container
	// ainda não resolvido" e desiste de criar o portal, então o popup não renderiza. Só com `undefined`
	// ele cai no fallback `document.body` — que é o caso de toda tela que não é modal.
	const dialogContainer = (triggerRef.current?.closest("[data-dialog-container]") as HTMLElement | null) ?? undefined;
	const snapshot = resolvePurchaseCostModifierSnapshot({
		quantidade: Number(item.quantidade) || 1,
		valorTotalBruto: Number(item.valorTotalBruto) || 0,
		descontosTotal: item.descontosTotal,
		acrescimosTotal: item.acrescimosTotal,
		modificadoresCusto: item.modificadoresCusto,
	});
	const count = snapshot.modificadores.length;
	const costing =
		item.modificadoresCusto && Number(item.quantidade) > 0
			? calculatePurchaseItemCost({
					quantidade: Number(item.quantidade),
					valorTotalBruto: Number(item.valorTotalBruto) || Number(item.quantidade) * Number(item.valorUnitarioBruto),
					modificadoresCusto: item.modificadoresCusto,
				})
			: null;

	function replaceModifiers(modificadores: typeof snapshot.modificadores) {
		handleUpdate({ modificadoresCusto: { versao: 1, modificadores } });
	}

	return (
		<Popover modal={false} open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<button
						ref={triggerRef}
						type="button"
						title="Custos e tributos do item"
						aria-label="Editar custos e tributos do item"
						className={cn(
							"flex h-7 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[0.7rem] font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40",
							count > 0
								? "border-primary/30 bg-primary/5 text-primary"
								: "border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
						)}
					>
						<ReceiptText className="h-3.5 w-3.5" />
						{count > 0 ? <span>{count}</span> : null}
					</button>
				}
			/>
			<PopoverContent container={dialogContainer} align="start" className="w-[min(32rem,calc(100vw-2rem))] space-y-3">
				<div>
					<p className="text-xs font-semibold uppercase tracking-wide">Custos e tributos</p>
					<p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted-foreground">
						O tratamento define se o valor altera o custo médio do produto, vira crédito tributário ou despesa do período.
					</p>
				</div>
				{count === 0 ? (
					<p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Nenhum modificador informado.</p>
				) : null}
				<div className="space-y-2">
					{snapshot.modificadores.map((modifier, index) => (
						<div
							key={`${modifier.chave}-${index}`}
							className="grid grid-cols-[1fr_6.5rem] gap-2 rounded-md border p-2 sm:grid-cols-[1fr_6.5rem_9.5rem_auto]"
						>
							<select
								disabled={locked}
								value={modifier.chave}
								onChange={(event) =>
									replaceModifiers(
										snapshot.modificadores.map((current, currentIndex) =>
											currentIndex === index
												? {
														...current,
														chave: event.target.value as (typeof PURCHASE_MODIFIER_OPTIONS)[number][0],
														efeito: event.target.value === "DESCONTO" ? "REDUCAO" : "ACRESCIMO",
														tratamento: event.target.value === "DESCONTO" ? "CUSTO_ESTOQUE" : current.tratamento,
														descricao: event.target.value === "OUTRO" ? current.descricao || "Outro acréscimo" : current.descricao,
													}
												: current,
										),
									)
								}
								className="h-8 rounded-md border bg-background px-2 text-xs"
							>
								{PURCHASE_MODIFIER_OPTIONS.map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
							<Input
								type="number"
								min={0.01}
								step={0.01}
								disabled={locked}
								value={modifier.valorCentavos / 100}
								onChange={(event) =>
									replaceModifiers(
										snapshot.modificadores.map((current, currentIndex) =>
											currentIndex === index ? { ...current, valorCentavos: Math.max(1, Math.round(Number(event.target.value) * 100)) } : current,
										),
									)
								}
								className="h-8 text-xs"
							/>
							<select
								disabled={locked}
								value={modifier.tratamento}
								onChange={(event) =>
									replaceModifiers(
										snapshot.modificadores.map((current, currentIndex) =>
											currentIndex === index ? { ...current, tratamento: event.target.value as typeof current.tratamento } : current,
										),
									)
								}
								className="col-span-2 h-8 rounded-md border bg-background px-2 text-xs sm:col-span-1"
							>
								<option value="CUSTO_ESTOQUE">Custo do estoque</option>
								{modifier.chave === "DESCONTO" ? null : <option value="CREDITO_TRIBUTARIO">Crédito tributário</option>}
								{modifier.chave === "DESCONTO" ? null : <option value="DESPESA_PERIODO">Despesa do período</option>}
							</select>
							{locked ? null : (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-muted-foreground hover:text-destructive"
									onClick={() => replaceModifiers(snapshot.modificadores.filter((_, currentIndex) => currentIndex !== index))}
								>
									<Trash2 className="h-3.5 w-3.5" />
								</Button>
							)}
						</div>
					))}
				</div>
				{locked ? null : (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-full gap-1.5 text-xs"
						onClick={() =>
							replaceModifiers([
								...snapshot.modificadores,
								{
									chave: "FRETE",
									valorCentavos: 1,
									efeito: "ACRESCIMO",
									tratamento: "CUSTO_ESTOQUE",
									origem: "MANUAL",
									rateio: { metodo: "INFORMADO_ITEM" },
								},
							])
						}
					>
						<Plus className="h-3.5 w-3.5" /> ADICIONAR MODIFICADOR
					</Button>
				)}
				{costing ? (
					<div className="grid grid-cols-2 gap-2 border-t pt-2 text-xs sm:grid-cols-3">
						<div>
							<span className="text-muted-foreground">Valor financeiro</span>
							<p className="font-mono font-medium">{formatToMoney(costing.valorTotalLiquido)}</p>
						</div>
						<div>
							<span className="text-muted-foreground">Custo do estoque</span>
							<p className="font-mono font-medium">{formatToMoney(costing.valorTotalCusto)}</p>
						</div>
						<div>
							<span className="text-muted-foreground">Custo unitário</span>
							<p className="font-mono font-medium">{formatToMoney(costing.valorUnitarioCusto)}</p>
						</div>
						<div>
							<span className="text-muted-foreground">Crédito tributário</span>
							<p className="font-mono font-medium">{formatToMoney(costing.valorTotalCreditoTributario)}</p>
						</div>
						<div>
							<span className="text-muted-foreground">Despesa do período</span>
							<p className="font-mono font-medium">{formatToMoney(costing.valorTotalDespesaPeriodo)}</p>
						</div>
					</div>
				) : null}
			</PopoverContent>
		</Popover>
	);
}

function PurchaseItemExpiryControl({
	item,
	locked,
	lots,
	handleUpdate,
}: {
	item: TPurchaseItemState;
	locked: boolean;
	lots: TPurchaseItemLot[];
	handleUpdate: (item: Partial<TPurchaseItemState>) => void;
}) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	// `undefined`, nunca `null`: o FloatingPortal do Base UI trata `container === null` como "container
	// ainda não resolvido" e desiste de criar o portal, então o popup não renderiza. Só com `undefined`
	// ele cai no fallback `document.body` — que é o caso de toda tela que não é modal.
	const dialogContainer = (triggerRef.current?.closest("[data-dialog-container]") as HTMLElement | null) ?? undefined;

	const validade = item.dataValidade ?? null;
	const summary = validade ? computeExpirySummary(validade) : null;

	// Non-perishable frozen item (no expiry, no lots): nothing to surface.
	if (locked && !validade && lots.length === 0) return null;

	return (
		<Popover modal={false} open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<button
						ref={triggerRef}
						type="button"
						title={validade ? "Validade e lote do item" : "Definir validade (item perecível)"}
						aria-label={validade ? "Editar validade e lote do item" : "Definir validade do item perecível"}
						className={cn(
							"flex h-7 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[0.7rem] font-medium tabular-nums transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40",
							summary ? EXPIRY_TONE_CLASS[summary.tone] : "border-dashed border-border text-muted-foreground hover:border-amber-400/60 hover:text-amber-500",
						)}
					>
						<CalendarClock className="h-3.5 w-3.5 shrink-0" />
						{summary ? <span className="whitespace-nowrap">{summary.label}</span> : null}
					</button>
				}
			/>
			<PopoverContent container={dialogContainer} align="end" className="w-72 space-y-2.5">
				<div className="flex items-center gap-1.5 text-[0.68rem] font-medium tracking-tight text-muted-foreground">
					<CalendarClock className="h-3.5 w-3.5" />
					VALIDADE E LOTE
				</div>
				{locked ? null : (
					<div className="flex flex-col gap-0.5">
						<p className="text-[0.68rem] leading-relaxed text-muted-foreground">Com validade preenchida, o recebimento gera um lote rastreável.</p>
						{validade ? (
							<button
								type="button"
								onClick={() => handleUpdate({ dataValidade: null })}
								className="w-fit inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[0.68rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							>
								<CalendarOff className="h-3 w-3" />
								REMOVER VALIDADE
							</button>
						) : null}
					</div>
				)}
				<DateInput
					label="DATA DE VALIDADE"
					labelClassName="text-[0.7rem]"
					editable={!locked}
					value={formatDateForInputValue(validade)}
					handleChange={(value) => handleUpdate({ dataValidade: formatDateOnInputChange(value, "date") })}
				/>

				{lots.length > 0 ? (
					<div className="flex flex-col gap-1.5 border-t border-border pt-2">
						<span className="text-[0.62rem] font-medium uppercase tracking-tight text-muted-foreground">Lotes gerados</span>
						<div className="flex flex-wrap gap-1.5">
							{lots.map((lot) => (
								<LotBadge key={lot.id} lot={lot} />
							))}
						</div>
					</div>
				) : locked && validade ? (
					<p className="border-t border-border pt-2 text-[0.68rem] text-muted-foreground">
						Nenhum lote gerado (o rastreamento de estoque do produto pode estar desativado).
					</p>
				) : null}
			</PopoverContent>
		</Popover>
	);
}

function computeExpirySummary(validade: Date): { label: string; tone: "expired" | "soon" | "ok" } {
	const now = new Date();
	const expiresAt = new Date(validade);
	const days = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
	const label = expiresAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
	if (days < 0) return { label: "Vencido", tone: "expired" };
	if (days <= 7) return { label, tone: "soon" };
	return { label, tone: "ok" };
}

const EXPIRY_TONE_CLASS = {
	expired: "border-destructive/30 bg-destructive/10 text-destructive",
	soon: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
} as const;

function StaticProductLabel({ item }: { item: TPurchaseItemState }) {
	const name = getItemDisplayName(item);
	const code = item.snapshotProdutoCodigo || item.produto.codigo;
	const imageUrl = item.produtoVariante?.imagemCapaUrl || item.produto.imagemCapaUrl;
	return (
		<span className="flex min-w-0 items-center gap-2 px-2 py-1">
			<ProductThumb imageUrl={imageUrl} label={name} />
			<span className="flex min-w-0 flex-col">
				<span className="truncate text-xs font-medium">{name}</span>
				{code ? <span className="truncate text-[0.65rem] text-muted-foreground">{code}</span> : null}
			</span>
		</span>
	);
}

function StaticNumberCell({ value, format }: { value: number | null | undefined; format?: (value: number) => string }) {
	const numeric = Number(value) || 0;
	const display = format ? format(numeric) : numeric.toLocaleString("pt-BR");
	return <p className="px-2 text-center font-mono text-xs tabular-nums text-foreground/80">{display}</p>;
}

function computeLotEffectiveStatus(lot: TPurchaseItemLot): { label: string; tone: "active" | "expired" | "depleted" | "discarded" } {
	const now = new Date();
	const validity = lot.dataValidade ? new Date(lot.dataValidade) : null;
	if (lot.status === "DESCARTADO") return { label: "Descartado", tone: "discarded" };
	if (lot.status === "VENCIDO" || (lot.status === "ATIVO" && validity && validity < now)) return { label: "Vencido", tone: "expired" };
	if (lot.status === "ESGOTADO" || (lot.status === "ATIVO" && lot.quantidadeAtual <= 0)) return { label: "Esgotado", tone: "depleted" };
	return { label: "Ativo", tone: "active" };
}

const LOT_TONE_CLASS = {
	active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	expired: "border-destructive/30 bg-destructive/10 text-destructive",
	depleted: "border-border bg-muted text-muted-foreground",
	discarded: "border-border bg-muted text-muted-foreground",
} as const;

function LotBadge({ lot }: { lot: TPurchaseItemLot }) {
	const { label, tone } = computeLotEffectiveStatus(lot);
	return (
		<div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border px-2 py-1 text-[0.7rem] tabular-nums", LOT_TONE_CLASS[tone])}>
			<span className="opacity-80">
				{lot.quantidadeAtual.toLocaleString("pt-BR")}/{lot.quantidadeInicial.toLocaleString("pt-BR")} un
			</span>
			{lot.dataValidade ? <span className="opacity-80">vence {formatShortDate(lot.dataValidade)}</span> : null}
			<span className="rounded-full bg-current/15 px-1.5 py-px text-[0.62rem] font-semibold uppercase">{label}</span>
		</div>
	);
}

function formatShortDate(date: Date | string | null | undefined) {
	if (!date) return "—";
	const parsed = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(parsed.getTime())) return "—";
	return parsed.toLocaleDateString("pt-BR");
}

function DraftPurchaseCompositionItem({
	addPurchaseItem,
	gridRow,
	gridBounds,
}: {
	addPurchaseItem: (item: TPurchaseItemState) => void;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
}) {
	const [draftItem, setDraftItem] = useState<TPurchaseItemState>(() => createEmptyPurchaseItem());

	function updateDraftItem(item: Partial<TPurchaseItemState>) {
		const nextDraftItem = normalizeItemValues({ ...draftItem, ...item });

		if (nextDraftItem.produtoId && nextDraftItem.quantidade > 0) {
			addPurchaseItem(nextDraftItem);
			setDraftItem(createEmptyPurchaseItem());
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
							gridCol={PURCHASE_ITEM_GRID_COL.PRODUCT}
							gridBounds={gridBounds}
							onChange={updateDraftItem}
							placeholder="NOVO PRODUTO"
						/>
					</div>
				</div>
				<p className="w-[9%] truncate px-2 text-center text-muted-foreground">{draftItem.produto.unidade || "UN"}</p>
				<div className="w-[9%] px-1">
					<EditableNumberCell
						value={draftItem.quantidade}
						ariaLabel="Editar quantidade do novo item"
						min={0.000001}
						gridRow={gridRow}
						gridCol={PURCHASE_ITEM_GRID_COL.QUANTITY}
						gridBounds={gridBounds}
						onCommit={(quantidade) => updateDraftItem({ quantidade })}
					/>
				</div>
				<div className="w-[13%] px-1">
					<EditableNumberCell
						value={draftItem.valorUnitarioBruto}
						ariaLabel="Editar valor unitário do novo item"
						min={0}
						gridRow={gridRow}
						gridCol={PURCHASE_ITEM_GRID_COL.UNIT_PRICE}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? formatToMoney(value) : "-")}
						onCommit={(valorUnitarioBruto) => updateDraftItem({ valorUnitarioBruto })}
					/>
				</div>
				<div className="w-[11%] px-1">
					<EditableNumberCell
						value={draftItem.descontosTotal ?? 0}
						ariaLabel="Editar descontos do novo item"
						min={0}
						gridRow={gridRow}
						gridCol={PURCHASE_ITEM_GRID_COL.DISCOUNT}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? formatToMoney(value) : "-")}
						onCommit={(descontosTotal) => updateDraftItem({ descontosTotal })}
					/>
				</div>
				<div className="w-[11%] px-1">
					<EditableNumberCell
						value={draftItem.acrescimosTotal ?? 0}
						ariaLabel="Editar acréscimos do novo item"
						min={0}
						gridRow={gridRow}
						gridCol={PURCHASE_ITEM_GRID_COL.SURCHARGE}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? formatToMoney(value) : "-")}
						onCommit={(acrescimosTotal) => updateDraftItem({ acrescimosTotal })}
					/>
				</div>
				<p className="w-[12%] px-2 text-center font-mono text-xs tabular-nums text-muted-foreground">-</p>
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
					<MobileEditableField label="Qtde">
						<EditableNumberCell
							value={draftItem.quantidade}
							ariaLabel="Editar quantidade do novo item"
							min={0.000001}
							onCommit={(quantidade) => updateDraftItem({ quantidade })}
						/>
					</MobileEditableField>
					<MobileEditableField label="Valor unit.">
						<EditableNumberCell
							value={draftItem.valorUnitarioBruto}
							ariaLabel="Editar valor unitário do novo item"
							min={0}
							format={(value) => (value > 0 ? formatToMoney(value) : "-")}
							onCommit={(valorUnitarioBruto) => updateDraftItem({ valorUnitarioBruto })}
						/>
					</MobileEditableField>
				</div>
			</div>
		</div>
	);
}

function ProductCell({
	item,
	onChange,
	gridRow,
	gridCol,
	gridBounds,
	placeholder = "Selecionar produto",
}: {
	item: TPurchaseItemState;
	onChange: (item: Partial<TPurchaseItemState>) => void;
	gridRow?: number;
	gridCol?: number;
	gridBounds?: SpreadsheetGridBounds;
	placeholder?: string;
}) {
	const hasGridNavigation = gridRow !== undefined && gridCol !== undefined && gridBounds !== undefined;
	const selectedName = getItemDisplayName(item);
	const selectedCode = item.snapshotProdutoCodigo || item.produto.codigo;
	const imageUrl = item.produtoVariante?.imagemCapaUrl || item.produto.imagemCapaUrl;

	function handleChange(value: TSelectProductWithVariantsValue) {
		if (!value?.product) {
			onChange(createEmptyPurchaseItem());
			return;
		}

		const unitCost = value.productVariant?.precoCusto ?? value.product.precoCusto ?? 0;
		onChange({
			produtoId: value.product.id,
			produtoVarianteId: value.productVariant?.id ?? null,
			snapshotProdutoDescricao: value.productVariant?.nome ?? value.product.nome,
			snapshotProdutoCodigo: value.productVariant?.codigo ?? value.product.codigo,
			produto: {
				nome: value.product.nome,
				codigo: value.product.codigo,
				unidade: value.product.unidade,
				imagemCapaUrl: value.product.imagemCapaUrl ?? null,
			},
			produtoVariante: value.productVariant
				? {
						nome: value.productVariant.nome,
						codigo: value.productVariant.codigo ?? "",
						imagemCapaUrl: value.productVariant.imagemCapaUrl ?? null,
					}
				: undefined,
			valorUnitarioBruto: unitCost,
		});
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
			onReset={() => onChange(createEmptyPurchaseItem())}
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

function roundTo2(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeItemValues(item: TPurchaseItemState): TPurchaseItemState {
	const quantidade = Number(item.quantidade) || 0;
	const valorUnitarioBruto = Number(item.valorUnitarioBruto) || 0;
	const descontosTotal = Number(item.descontosTotal) || 0;
	const acrescimosTotal = Number(item.acrescimosTotal) || 0;
	const valorTotalBruto = roundTo2(quantidade * valorUnitarioBruto);
	if (item.modificadoresCusto && quantidade > 0) {
		const calculated = calculatePurchaseItemCost({ quantidade, valorTotalBruto, modificadoresCusto: item.modificadoresCusto });
		return {
			...item,
			quantidade,
			valorUnitarioBruto,
			valorTotalBruto,
			descontosTotal: calculated.descontosTotal,
			acrescimosTotal: calculated.acrescimosTotal,
			valorTotalLiquido: calculated.valorTotalLiquido,
			valorUnitarioLiquido: calculated.valorUnitarioLiquido,
			valorTotalCusto: calculated.valorTotalCusto,
			valorUnitarioCusto: calculated.valorUnitarioCusto,
		};
	}
	const valorTotalLiquido = roundTo2(valorTotalBruto - descontosTotal + acrescimosTotal);
	const valorUnitarioLiquido = quantidade > 0 ? roundTo2(valorTotalLiquido / quantidade) : 0;

	return {
		...item,
		quantidade,
		valorUnitarioBruto,
		descontosTotal,
		acrescimosTotal,
		valorTotalBruto,
		valorTotalLiquido,
		valorUnitarioLiquido,
	};
}

type TPurchaseItemTotalLike = {
	quantidade: number;
	valorUnitarioBruto: number;
	valorTotalBruto?: number | null;
	valorTotalLiquido?: number | null;
	descontosTotal?: number | null;
	acrescimosTotal?: number | null;
	deletar?: boolean | null;
};

function getItemTotal(item: TPurchaseItemTotalLike) {
	const valorTotalBruto = Number(item.valorTotalBruto) || (Number(item.quantidade) || 0) * (Number(item.valorUnitarioBruto) || 0);
	return Number(item.valorTotalLiquido) || valorTotalBruto - (Number(item.descontosTotal) || 0) + (Number(item.acrescimosTotal) || 0);
}

/** Total financeiro da composição — a mesma soma que o servidor exige do lançamento no recebimento. */
export function getPurchaseItemsTotal(items: TPurchaseItemTotalLike[]) {
	return roundTo2(items.filter((item) => !item.deletar).reduce((total, item) => total + getItemTotal(item), 0));
}

function getItemDisplayName(item: TPurchaseItemState) {
	if (item.produtoVariante?.nome) return `${item.produto.nome} - ${item.produtoVariante.nome}`;
	return item.produto.nome || item.snapshotProdutoDescricao;
}

export function createEmptyPurchaseItem(): TPurchaseItemState {
	return {
		produtoId: "",
		produtoVarianteId: null,
		snapshotProdutoDescricao: "",
		snapshotProdutoCodigo: "",
		produto: {
			nome: "",
			codigo: "",
			unidade: "UN",
			imagemCapaUrl: null,
		},
		produtoVariante: undefined,
		quantidade: 1,
		valorUnitarioBruto: 0,
		valorTotalBruto: 0,
		valorUnitarioLiquido: 0,
		valorTotalLiquido: 0,
		descontosTotal: 0,
		acrescimosTotal: 0,
		dataValidade: null,
	};
}
