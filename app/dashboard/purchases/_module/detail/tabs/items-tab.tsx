"use client";

import SelectProductWithVariants, { type TSelectProductWithVariantsValue } from "@/components/Inputs/SelectProductWithVariants";
import { createEmptyPurchaseItem, getPurchaseItemsTotal, normalizeItemValues } from "@/components/Modals/Purchases/Blocks/Items";
import ImportCompositionWithAI from "@/components/Modals/Purchases/Blocks/Utils/ImportCompositionWithAI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TPurchaseState, TUsePurchaseState } from "@/state-hooks/use-purchase-state";
import { BadgeDollarSign, Gift, Lock, Plus, ReceiptText, Ruler, ShoppingCart, Sparkles, Tag, Trash2 } from "lucide-react";
import { ACQUISITION_NATURE_LABELS } from "@/lib/purchase/entry-rules";
import { useState } from "react";
import { TONE_CLASSES } from "../../builder/components/builder-ui";
import type { TPurchaseById } from "../helpers/hydrate";

type TPurchaseItemState = TPurchaseState["purchaseItems"][number];

const TAX_LABELS: Record<string, string> = {
	IMPOSTOS_IPI: "IPI",
	IMPOSTOS_ICMS: "ICMS",
	IMPOSTOS_ICMS_SN: "ICMS-SN",
	IMPOSTOS_PIS: "PIS",
	IMPOSTOS_COFINS: "COFINS",
	IMPOSTOS_ICMS_ST: "ICMS-ST",
	IMPOSTOS_FCP_ST: "FCP-ST",
	IMPOSTOS_DIFAL: "DIFAL",
	IMPOSTOS_FCP_DIFAL: "FCP-DIFAL",
	IMPOSTOS_ANTECIPACAO: "Antecipação",
	IMPOSTOS_ICMS_ST_ENTRADA: "ST de entrada",
	IMPOSTOS_IBS: "IBS",
	IMPOSTOS_CBS: "CBS",
};
const TREATMENT_LABELS: Record<string, string> = { CUSTO_ESTOQUE: "no custo", CREDITO_TRIBUTARIO: "como crédito", DESPESA_PERIODO: "como despesa" };
const GRID = "grid grid-cols-[minmax(0,2.2fr)_60px_90px_110px_110px_110px_40px] items-center gap-2";

/** Facts kept on the item: the invoice-to-stock unit factor and how each highlighted tax was treated. */
export function getItemTags(item: TPurchaseItemState) {
	const tags: { icon: typeof Ruler; label: string }[] = [];
	if (item.externoFatorConversao && item.externoFatorConversao !== 1 && item.externoUnidade)
		tags.push({ icon: Ruler, label: `1 ${item.externoUnidade} = ${item.externoFatorConversao} ${item.produto?.unidade ?? "UN"}` });
	if (item.destinacao && item.destinacao !== "REVENDA") tags.push({ icon: Tag, label: ACQUISITION_NATURE_LABELS[item.destinacao] });
	const seen = new Set<string>();
	for (const modifier of item.modificadoresCusto?.modificadores ?? []) {
		if (modifier.chave === "BONIFICACAO" && !seen.has("BONIFICACAO")) {
			seen.add("BONIFICACAO");
			tags.push({ icon: Gift, label: "Bonificada · custo zero" });
			continue;
		}
		const tax = TAX_LABELS[modifier.chave];
		const label = tax ? `${tax} ${TREATMENT_LABELS[modifier.tratamento] ?? ""}`.trim() : null;
		if (!label || seen.has(label)) continue;
		seen.add(label);
		tags.push({ icon: ReceiptText, label });
	}
	return tags;
}

type ItemsTabProps = {
	purchase: TPurchaseById;
	editor: TUsePurchaseState;
	baseline: TPurchaseState;
	editable: boolean;
	isReceived: boolean;
};

export default function ItemsTab({ purchase, editor, baseline, editable, isReceived }: ItemsTabProps) {
	const { state, updatePurchaseItem, removePurchaseItem, addPurchaseItem, updatePurchase, updateAccountingEntry } = editor;
	const [importOpen, setImportOpen] = useState(false);
	const [adding, setAdding] = useState(false);
	const visibleItems = state.purchaseItems.map((item, index) => ({ item, index })).filter(({ item }) => !item.deletar);
	const total = getPurchaseItemsTotal(state.purchaseItems);

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<ShoppingCart />
				</Section.Icon>
				<Section.Title>Itens</Section.Title>
				<Section.Count>{visibleItems.length}</Section.Count>
				{editable ? (
					<Section.Actions>
						<Button type="button" variant="outline" size="sm" className="flex items-center gap-1.5 rounded-full" onClick={() => setImportOpen(true)}>
							<Sparkles className="h-3.5 w-3.5" />
							IMPORTAR OUTRO DOCUMENTO
						</Button>
						<Button type="button" size="sm" className="flex items-center gap-1.5 rounded-full" onClick={() => setAdding(true)}>
							<Plus className="h-3.5 w-3.5" />
							ADICIONAR ITEM
						</Button>
					</Section.Actions>
				) : null}
			</Section.Header>
			{isReceived ? (
				<div className={cn("-mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-xs", TONE_CLASSES.warn)}>
					<Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<p className="leading-relaxed">
						Compra recebida — os itens estão travados para preservar os lotes gerados. Para corrigir, cancele a compra (se os lotes ainda não foram usados)
						ou ajuste diretamente pelo estoque.
					</p>
				</div>
			) : null}
			<div className="-mt-3 flex flex-col overflow-x-auto rounded-md border border-border">
				<div className="flex min-w-[760px] flex-col">
					<div className={cn(GRID, "min-h-9 border-b border-border bg-muted/60 px-3 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground")}>
						<span>Produto</span>
						<span className="text-center">Un.</span>
						<span className="text-center">Qtde</span>
						<span className="text-center">Valor unit.</span>
						<span className="text-center">Custo unit.</span>
						<span className="text-right">Total</span>
						<span />
					</div>
					{visibleItems.map(({ item, index }) => (
						<ItemRow
							key={item.id ?? `new-${index}`}
							item={item}
							original={item.id ? (baseline.purchaseItems.find((candidate) => candidate.id === item.id) ?? null) : null}
							editable={editable}
							isReceived={isReceived}
							onQuantity={(quantidade) => updatePurchaseItem({ index, item: normalizeItemValues({ ...item, quantidade }) })}
							onRemove={() => removePurchaseItem({ index })}
						/>
					))}
					{visibleItems.length === 0 && !adding ? (
						<div className="border-t border-border p-5 text-center text-xs text-muted-foreground first:border-t-0">Nenhum item nesta compra.</div>
					) : null}
					{adding && editable ? (
						<AddItemRow
							onAdd={(item) => {
								addPurchaseItem(item);
								setAdding(false);
							}}
							onCancel={() => setAdding(false)}
						/>
					) : null}
					<div className="flex justify-end border-t border-border px-3 py-2.5">
						<div className="flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground/80 tabular-nums">
							<BadgeDollarSign size={15} />
							Total da compra: {formatToMoney(total)}
						</div>
					</div>
				</div>
			</div>
			{editable ? (
				<ImportCompositionWithAI
					open={importOpen}
					onOpenChange={setImportOpen}
					addPurchaseItem={addPurchaseItem}
					updatePurchase={updatePurchase}
					accountingEntry={state.lancamentoContabil}
					updateAccountingEntry={updateAccountingEntry}
					currentFornecedorId={state.purchase.fornecedorId ?? purchase.fornecedorId}
					currentImportedDocuments={state.purchase.documentosImportados}
				/>
			) : null}
		</Section.Root>
	);
}

function ItemRow({
	item,
	original,
	editable,
	isReceived,
	onQuantity,
	onRemove,
}: {
	item: TPurchaseItemState;
	original: TPurchaseItemState | null;
	editable: boolean;
	isReceived: boolean;
	onQuantity: (quantidade: number) => void;
	onRemove: () => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const name = item.snapshotProdutoDescricao || item.produto?.nome || "Produto";
	const unit = item.produto?.unidade ?? "UN";
	const changed = !!original && original.quantidade !== item.quantidade;
	const isNew = !item.id;
	const lots = (item.lotes ?? []).map((lot) => lot.codigoLote).filter(Boolean);
	const meta = isReceived
		? lots.length
			? `Lote ${lots.join(", ")}`
			: "Recebido"
		: changed
			? `Era ${original?.quantidade} ${unit}`
			: isNew
				? "Novo nesta edição"
				: item.snapshotProdutoCodigo
					? `Cód. ${item.snapshotProdutoCodigo}`
					: "";
	const unitCost = item.valorUnitarioCusto ?? item.valorUnitarioLiquido ?? item.valorUnitarioBruto;

	return (
		<div className={cn(GRID, "min-h-13 border-t border-border px-3 py-1.5 text-xs first:border-t-0", (changed || isNew) && "bg-brand/[0.06]")}>
			<div className="flex min-w-0 items-center gap-2">
				<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[0.6rem] font-semibold text-muted-foreground">
					{formatNameAsInitials(name)}
				</span>
				<div className="flex min-w-0 flex-col">
					<span className="truncate font-medium">{name}</span>
					{meta ? <span className="text-[0.65rem] text-muted-foreground">{meta}</span> : null}
				</div>
				{getItemTags(item).map((tag) => (
					<span
						key={tag.label}
						className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold", TONE_CLASSES.info)}
					>
						<tag.icon className="h-2.5 w-2.5" />
						{tag.label}
					</span>
				))}
			</div>
			<span className="text-center text-muted-foreground">{unit}</span>
			<Input
				value={draft ?? String(item.quantidade)}
				readOnly={!editable}
				inputMode="decimal"
				aria-label={`Quantidade de ${name}`}
				onChange={(event) => setDraft(event.target.value.replace(/[^\d.,]/g, ""))}
				onBlur={() => {
					if (draft === null) return;
					const parsed = Number(draft.replace(",", "."));
					setDraft(null);
					if (Number.isFinite(parsed) && parsed > 0 && parsed !== item.quantidade) onQuantity(parsed);
				}}
				className={cn(
					"h-7.5 text-center font-mono text-xs",
					!editable && "border-transparent bg-transparent shadow-none",
					editable && changed && "border-brand",
				)}
			/>
			<span className="text-center font-mono">{formatToMoney(item.valorUnitarioBruto)}</span>
			<span className="text-center font-mono text-muted-foreground">{formatToMoney(unitCost)}</span>
			<span className="text-right font-mono font-medium">{formatToMoney(item.valorTotalLiquido ?? item.quantidade * item.valorUnitarioBruto)}</span>
			<span className="flex justify-center text-muted-foreground">
				{editable ? (
					<button type="button" onClick={onRemove} aria-label={`Remover ${name}`} className="flex rounded-md p-1 hover:bg-muted hover:text-destructive">
						<Trash2 className="h-3.5 w-3.5" />
					</button>
				) : isReceived ? (
					<Lock className="h-3.5 w-3.5" />
				) : null}
			</span>
		</div>
	);
}

function AddItemRow({ onAdd, onCancel }: { onAdd: (item: TPurchaseItemState) => void; onCancel: () => void }) {
	const [pick, setPick] = useState<TSelectProductWithVariantsValue>(null);
	const [quantity, setQuantity] = useState("1");
	const [unitValue, setUnitValue] = useState("");
	const quantidade = Number(quantity.replace(",", "."));
	const valorUnitario = Number(unitValue.replace(",", "."));
	const ready = !!pick?.product && quantidade > 0 && valorUnitario >= 0 && unitValue !== "";

	function add() {
		if (!pick?.product || !ready) return;
		const variant = pick.productVariant;
		onAdd(
			normalizeItemValues({
				...createEmptyPurchaseItem(),
				produtoId: pick.product.id,
				produtoVarianteId: variant?.id ?? null,
				snapshotProdutoDescricao: variant ? `${pick.product.nome} - ${variant.nome}` : pick.product.nome,
				snapshotProdutoCodigo: variant?.codigo ?? pick.product.codigo,
				produto: {
					nome: pick.product.nome,
					codigo: pick.product.codigo,
					unidade: pick.product.unidade,
					imagemCapaUrl: pick.product.imagemCapaUrl ?? null,
				},
				produtoVariante: variant ? { nome: variant.nome, codigo: variant.codigo ?? "", imagemCapaUrl: variant.imagemCapaUrl ?? null } : undefined,
				quantidade,
				valorUnitarioBruto: valorUnitario,
			}),
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border bg-muted/20 px-3 py-2">
			<div className="min-w-[240px] flex-1">
				<SelectProductWithVariants
					label="PRODUTO"
					showLabel={false}
					value={pick?.product ? { productId: pick.product.id, productVariantId: pick.productVariant?.id ?? null } : null}
					selectedLabel={pick?.product ? (pick.productVariant ? `${pick.product.nome} - ${pick.productVariant.nome}` : pick.product.nome) : undefined}
					resetOptionLabel="LIMPAR"
					initialSearch=""
					handleChange={(value) => {
						setPick(value);
						if (value?.product && !unitValue) setUnitValue(String(value.productVariant?.precoCusto ?? value.product.precoCusto ?? ""));
					}}
					onReset={() => setPick(null)}
					triggerProps={{ size: "sm", className: "h-8 w-full text-xs" }}
				/>
			</div>
			<Input
				value={quantity}
				onChange={(event) => setQuantity(event.target.value)}
				inputMode="decimal"
				aria-label="Quantidade"
				className="h-8 w-20 text-center text-xs"
			/>
			<Input
				value={unitValue}
				onChange={(event) => setUnitValue(event.target.value)}
				inputMode="decimal"
				placeholder="Valor unit."
				aria-label="Valor unitário"
				className="h-8 w-28 text-center text-xs"
			/>
			<Button type="button" size="sm" disabled={!ready} onClick={add}>
				ADICIONAR
			</Button>
			<Button type="button" variant="ghost" size="sm" onClick={onCancel}>
				CANCELAR
			</Button>
		</div>
	);
}
