"use client";

import { StageShell } from "@/app/dashboard/growth/campaigns/_module/builder/components/stage-shell";
import PurchaseItemsBlock from "@/components/Modals/Purchases/Blocks/Items";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { ArrowRight, BadgeDollarSign, Check, CircleCheck, Ellipsis, EyeOff, ListTodo, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
import {
	applyLineDestination,
	getLineIssue,
	getLineStatus,
	getLineTotal,
	lineHasDestinationDivergence,
	type TReviewLine,
} from "../helpers/review-lines";
import { ACQUISITION_NATURE_LABELS, SUPPORTED_PURCHASE_DESTINATIONS } from "@/lib/purchase/entry-rules";
import type { TAcquisitionNatureEnum } from "@/schemas/enums";
import { BUILDER_STAGES } from "../helpers/stages";
import { useBuilder } from "../components/builder-provider";
import { StatusPill, TONE_CLASSES } from "../components/builder-ui";
import { useBuilderSummary } from "../components/use-builder-summary";
import { ISSUE_META } from "../helpers/issue-meta";
import ItemsQueue from "./items-queue";

const MATCH_LABELS: Record<TReviewLine["matchTipo"], string> = {
	MAPEADO: "Vínculo lembrado",
	CODIGO: "Mesmo código",
	SUGERIDO: "Vínculo confirmado",
	NAO_MAPEADO: "Escolhido por você",
};

type TFilter = "all" | "pending" | "ready" | "ignored";

export default function StageItems() {
	const { origin, back, next, queueOpen, state, addPurchaseItem, updatePurchaseItem, removePurchaseItem } = useBuilder();
	const { activeValidation } = useBuilderSummary();
	const stage = BUILDER_STAGES.items;

	return (
		<StageShell>
			<StageShell.Title icon={stage.icon} label={stage.label} description={stage.description} />
			<StageShell.Body>
				{origin === "document" ? (
					queueOpen ? (
						<ItemsQueue />
					) : (
						<ReviewTable />
					)
				) : (
					<PurchaseItemsBlock
						purchaseItems={state.purchaseItems}
						addPurchaseItem={addPurchaseItem}
						updatePurchaseItem={updatePurchaseItem}
						removePurchaseItem={removePurchaseItem}
					/>
				)}
			</StageShell.Body>
			<StageShell.Footer
				onBack={back}
				onNext={next}
				nextDisabled={!activeValidation.valid}
				nextDisabledReason={queueOpen ? undefined : activeValidation.reason}
			/>
		</StageShell>
	);
}

function ReviewTable() {
	const { lines, updateLine, setLines, openQueue, importData, state, addPurchaseItem, updatePurchaseItem, removePurchaseItem } = useBuilder();
	const { pendingLines, readyCount, ignoredCount } = useBuilderSummary();
	const [filter, setFilter] = useState<TFilter>("all");
	const [showManualItems, setShowManualItems] = useState(false);
	const includedLines = lines.filter((line) => line.incluir);
	const linesTotal = includedLines.reduce((total, line) => total + getLineTotal(line), 0);
	const supplierName = importData?.fornecedor?.existente?.nome ?? importData?.fornecedor?.extraido?.nome ?? null;
	const visibleLines = lines.filter((line) => filter === "all" || getLineStatus(line) === filter);
	const manualItemsCount = state.purchaseItems.filter((item) => !item.deletar).length;

	const filters: { id: TFilter; label: string; count: number; dot: string }[] = [
		{ id: "all", label: "Todos", count: lines.length, dot: "bg-muted-foreground" },
		{ id: "pending", label: "Pendentes", count: pendingLines.length, dot: "bg-brand" },
		{ id: "ready", label: "Prontos", count: readyCount, dot: "bg-green-600" },
		{ id: "ignored", label: "Não incluídos", count: ignoredCount, dot: "bg-muted-foreground/40" },
	];

	function unlinkLine(line: TReviewLine) {
		updateLine(line.id, {
			produto: null,
			produtoVarianteId: null,
			produtoVariante: null,
			produtoNovo: null,
			vinculoConfirmado: false,
			manualOverride: false,
			fatorConversao: null,
			divergenciaUnidade: false,
		});
		openQueue(line.id);
	}

	return (
		<div className="flex w-full flex-col gap-3">
			{pendingLines.length > 0 ? (
				<div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-3 text-amber-800 dark:text-amber-300">
					<ListTodo className="h-4.5 w-4.5 shrink-0" />
					<div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
						<p className="text-[0.82rem] font-semibold">
							{pendingLines.length} {pendingLines.length === 1 ? "item precisa" : "itens precisam"} de você antes de continuar
						</p>
						<p className="text-xs">Os outros itens já foram vinculados ao seu catálogo e estão prontos.</p>
					</div>
					<Button type="button" variant="brand" className="flex items-center gap-1.5 rounded-full" onClick={() => openQueue()}>
						RESOLVER UMA A UMA
						<ArrowRight className="h-3.5 w-3.5" />
					</Button>
				</div>
			) : (
				<div className={cn("flex items-center gap-2.5 rounded-xl px-3.5 py-3", TONE_CLASSES.ok)}>
					<CircleCheck className="h-4.5 w-4.5 shrink-0" />
					<p className="text-[0.82rem] font-semibold">
						{includedLines.length} {includedLines.length === 1 ? "item pronto" : "itens prontos"} para entrar na compra
						{ignoredCount ? `, ${ignoredCount} não ${ignoredCount === 1 ? "incluído" : "incluídos"}` : ""}.
					</p>
				</div>
			)}

			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-center gap-1.5">
					{filters.map((option) => (
						<button
							key={option.id}
							type="button"
							onClick={() => setFilter(option.id)}
							className={cn(
								"flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
								filter === option.id ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted/50",
							)}
						>
							<span className={cn("h-1.5 w-1.5 rounded-full", option.dot)} />
							{option.label}
							<span className="font-bold">{option.count}</span>
						</button>
					))}
				</div>
				<Button type="button" variant="outline" size="xs" className="flex items-center gap-1.5" onClick={() => setShowManualItems(true)}>
					<Plus className="h-3.5 w-3.5" />
					ADICIONAR ITEM
				</Button>
			</div>

			<div className="flex w-full flex-col overflow-hidden rounded-md border border-border">
				<div className="hidden min-h-9 items-center gap-2 border-b border-border bg-muted/60 px-3 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground lg:grid lg:grid-cols-[136px_minmax(0,1.2fr)_minmax(0,1fr)_96px_164px]">
					<span>Situação</span>
					<span>Na nota</span>
					<span>No seu estoque</span>
					<span className="text-right">Total</span>
					<span />
				</div>
				{visibleLines.map((line) => (
					<ReviewRow
						onChangeDestination={(destinacao) =>
							setLines((current) => applyLineDestination({ lines: current, lineId: line.id, destinacao, context: importData?.documento?.fiscalEntrada }))
						}
						key={line.id}
						line={line}
						supplierName={supplierName}
						onFix={() => openQueue(line.id)}
						onInclude={() => updateLine(line.id, { incluir: true })}
						onExclude={() => updateLine(line.id, { incluir: false })}
						onToggleRemember={() => updateLine(line.id, { lembrarVinculo: !line.lembrarVinculo })}
						onUnlink={() => unlinkLine(line)}
					/>
				))}
				{visibleLines.length === 0 ? (
					<div className="border-t border-border p-5 text-center text-xs text-muted-foreground">Nenhum item nesta situação.</div>
				) : null}
				<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5">
					<span className="text-xs text-muted-foreground">
						{includedLines.length} de {lines.length} linhas incluídas
					</span>
					<div className="flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground/80 tabular-nums">
						<BadgeDollarSign size={15} />
						Total da nota: {formatToMoney(linesTotal)}
					</div>
				</div>
			</div>

			{showManualItems || manualItemsCount > 0 ? (
				<div className="flex flex-col gap-1.5">
					<p className="text-xs text-muted-foreground">Itens que não estão na nota (adicionados à mão) entram na mesma compra.</p>
					<PurchaseItemsBlock
						purchaseItems={state.purchaseItems}
						addPurchaseItem={addPurchaseItem}
						updatePurchaseItem={updatePurchaseItem}
						removePurchaseItem={removePurchaseItem}
					/>
				</div>
			) : null}
		</div>
	);
}

function getProductMeta(line: TReviewLine) {
	const unit = line.produto?.unidade ?? line.produtoNovo?.unidade ?? line.unidade ?? "UN";
	const fator = line.fatorConversao && line.fatorConversao > 0 ? line.fatorConversao : null;
	const quantity = fator ? `${line.quantidade * fator} ${unit} × ${formatToMoney(line.valorUnitario / fator)}` : `${line.quantidade} ${unit}`;
	if (line.produtoNovo) return `Novo produto · ${quantity}`;
	const issue = getLineIssue(line);
	if (issue === "suggested") return `Sugestão · ${quantity}`;
	if (issue === "unit") return `${line.quantidade} ${line.unidade ?? ""} → ? ${unit}`;
	if (issue === "tax") return `${quantity} · tributo sem tratamento`;
	return `${quantity} · ${line.manualOverride ? "Escolhido por você" : MATCH_LABELS[line.matchTipo]}`;
}

function ReviewRow({
	line,
	supplierName,
	onFix,
	onInclude,
	onExclude,
	onToggleRemember,
	onUnlink,
	onChangeDestination,
}: {
	line: TReviewLine;
	supplierName: string | null;
	onFix: () => void;
	onInclude: () => void;
	onExclude: () => void;
	onToggleRemember: () => void;
	onUnlink: () => void;
	onChangeDestination: (destinacao: TAcquisitionNatureEnum) => void;
}) {
	const status = getLineStatus(line);
	const issue = getLineIssue(line);
	const productName = line.produtoVariante
		? `${line.produto?.nome} - ${line.produtoVariante.nome}`
		: (line.produto?.nome ?? line.produtoNovo?.nome ?? null);
	const canRemember = !!(line.codigoFornecedor?.trim() || line.ean?.trim());

	return (
		<div
			className={cn(
				"grid grid-cols-1 items-center gap-2 border-t border-border px-3 py-2 first:border-t-0 lg:min-h-14 lg:grid-cols-[136px_minmax(0,1.2fr)_minmax(0,1fr)_96px_164px]",
				status === "pending" && "bg-brand/[0.04]",
				status === "ignored" && "opacity-60",
			)}
		>
			<div>
				{status === "ignored" ? (
					<StatusPill tone="mute" icon={EyeOff}>
						{line.foraDaCompra ? "Fora da compra" : "Não incluído"}
					</StatusPill>
				) : issue ? (
					<StatusPill tone={ISSUE_META[issue].tone} icon={ISSUE_META[issue].icon}>
						{ISSUE_META[issue].pill}
					</StatusPill>
				) : (
					<StatusPill tone="ok" icon={Check}>
						Pronto
					</StatusPill>
				)}
			</div>
			<div className="flex min-w-0 flex-col gap-px">
				<span className="text-xs font-medium leading-snug [overflow-wrap:anywhere]">{line.descricao}</span>
				<span className="text-[0.7rem] text-muted-foreground">
					{line.codigoFornecedor ? `Cód. ${line.codigoFornecedor} · ` : ""}
					{line.quantidade} {line.unidade ?? ""} × {formatToMoney(line.valorUnitario)}
				</span>
			</div>
			<div className="flex min-w-0 items-center gap-2">
				<span
					className={cn(
						"flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border bg-muted text-[0.6rem] font-semibold text-muted-foreground",
						productName ? "border-solid border-border" : "border-dashed border-border",
					)}
				>
					{productName ? formatNameAsInitials(productName) : null}
				</span>
				<div className="flex min-w-0 flex-col gap-px">
					<span className={cn("text-xs font-medium leading-snug", !productName && "text-destructive")}>{productName ?? "Nenhum produto vinculado"}</span>
					<span className="text-[0.7rem] text-muted-foreground">
						{line.foraDaCompra ? line.foraDaCompra : productName ? getProductMeta(line) : "Crie ou vincule para incluir"}
					</span>
					{status !== "ignored" && productName ? (
						<label className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
							<span>Destinação</span>
							<select
								value={line.destinacao}
								onChange={(event) => onChangeDestination(event.target.value as TAcquisitionNatureEnum)}
								className="h-6 rounded-md border border-border bg-background px-1 text-[0.7rem] text-foreground"
							>
								{SUPPORTED_PURCHASE_DESTINATIONS.map((value) => (
									<option key={value} value={value}>
										{ACQUISITION_NATURE_LABELS[value]}
									</option>
								))}
							</select>
							{lineHasDestinationDivergence(line) ? (
								<span className="text-amber-700 dark:text-amber-300" title="A destinação escolhida difere da natureza cadastrada do produto.">
									≠ cadastro ({ACQUISITION_NATURE_LABELS[line.produto!.natureza]})
								</span>
							) : null}
						</label>
					) : null}
				</div>
			</div>
			<span className="text-right font-mono text-xs font-medium lg:text-right">{formatToMoney(getLineTotal(line))}</span>
			<div className="flex justify-end gap-1">
				{status === "pending" && issue ? (
					<Button type="button" variant="outline" size="xs" className="flex items-center gap-1 rounded-full" onClick={onFix}>
						{ISSUE_META[issue].fix}
						<ArrowRight className="h-3 w-3" />
					</Button>
				) : null}
				{status === "ignored" ? (
					<Button type="button" variant="ghost" size="xs" className="flex items-center gap-1" onClick={onInclude}>
						<Undo2 className="h-3 w-3" />
						Incluir
					</Button>
				) : null}
				{status !== "ignored" ? (
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label="Mais ações">
									<Ellipsis className="h-3.5 w-3.5" />
								</Button>
							}
						/>
						<DropdownMenuContent align="end">
							{canRemember && (line.produto || line.produtoNovo) ? (
								<DropdownMenuCheckboxItem checked={line.lembrarVinculo} onCheckedChange={onToggleRemember}>
									Lembrar para {supplierName ?? "este fornecedor"}
								</DropdownMenuCheckboxItem>
							) : null}
							{line.produto || line.produtoNovo ? <DropdownMenuItem onClick={onUnlink}>Trocar produto</DropdownMenuItem> : null}
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={onExclude}>Não incluir</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}
			</div>
		</div>
	);
}
