"use client";

import { StageShell } from "@/app/dashboard/growth/campaigns/_module/builder/components/stage-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatToMoney } from "@/lib/formatting";
import { useVisualKitCatalogSearch } from "@/lib/queries/visual-kits";
import { cn } from "@/lib/utils";
import type { TVisualKitCatalogItem } from "@/lib/visual-kits/types";
import { Check, Code, Diamond, LoaderCircle, Package, Search, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useKitBuilder } from "../kit-builder-context";
import { KIT_STAGES } from "../stages";
import { useKitChannels } from "../use-kit-channels";

type TProductFilter = "ALL" | "PROMOTION" | "SELECTED";

export default function StageProducts() {
	const { state, itemKeys, toggleItem, addItems, selectedItems, pieceItems, next, back } = useKitBuilder();
	const { selectedLabel } = useKitChannels();
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<TProductFilter>("ALL");

	const { data, isFetching } = useVisualKitCatalogSearch({ search, salesChannelId: state.kit.canalVendaId, promo: filter === "PROMOTION" });
	const selectedKeys = new Set(itemKeys);
	const rows = filter === "SELECTED" ? selectedItems : (data?.items ?? []);
	const addable = rows.filter((item) => item.preco != null && !selectedKeys.has(item.chave));
	const count = itemKeys.length;

	const filters: { id: TProductFilter; label: string }[] = [
		{ id: "ALL", label: "Todos" },
		{ id: "PROMOTION", label: "Em promoção" },
		{ id: "SELECTED", label: `Selecionados · ${count}` },
	];

	return (
		<StageShell>
			<StageShell.Title icon={KIT_STAGES.products.icon} label={KIT_STAGES.products.title} description={KIT_STAGES.products.description} />
			<StageShell.Body>
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1.5">
						<Package className="h-4 w-4 opacity-70" />
						<h3 className="text-xs font-semibold tracking-tight">PRODUTOS DO CATÁLOGO</h3>
					</div>
					<span className="text-xs font-medium text-muted-foreground">{count === 1 ? "1 produto selecionado" : `${count} produtos selecionados`}</span>
				</div>
				<label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3">
					<Search className="h-4 w-4 shrink-0 opacity-50" />
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Buscar produto por nome ou código..."
						className="border-0 px-0 shadow-none focus-visible:ring-0"
					/>
					{isFetching ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin opacity-50" /> : null}
				</label>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex flex-wrap items-center gap-1.5">
						{filters.map((option) => (
							<button
								key={option.id}
								type="button"
								onClick={() => setFilter(option.id)}
								className={cn(
									"rounded-full border px-3 py-1 text-xs font-medium transition-colors",
									filter === option.id ? "border-primary/20 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted",
								)}
							>
								{option.label}
							</button>
						))}
					</div>
					{addable.length > 1 ? (
						<Button type="button" variant="ghost" size="sm" onClick={() => addItems(addable)}>
							SELECIONAR {addable.length} DA LISTA
						</Button>
					) : null}
				</div>

				<div className="flex flex-col gap-2">
					{rows.map((item) => (
						<ProductRow
							key={item.chave}
							item={item}
							selected={selectedKeys.has(item.chave)}
							channelLabel={selectedLabel}
							onToggle={() => toggleItem(item)}
						/>
					))}
					{rows.length === 0 && !isFetching ? (
						<p className="py-6 text-center text-xs text-muted-foreground">
							{filter === "SELECTED"
								? "Nenhum produto selecionado ainda."
								: filter === "PROMOTION"
									? "Nenhum produto em promoção: só entram produtos cujo preço caiu nos últimos 30 dias."
									: "Nenhum produto encontrado."}
						</p>
					) : null}
					{filter !== "SELECTED" && data?.truncated ? (
						<p className="py-2 text-center text-[11px] text-muted-foreground">
							Mostrando os primeiros resultados. Refine a busca para encontrar outros produtos.
						</p>
					) : null}
				</div>
			</StageShell.Body>
			<StageShell.Footer
				onBack={back}
				onNext={next}
				nextDisabled={pieceItems.length === 0}
				nextDisabledReason="Selecione ao menos um produto com preço."
			/>
		</StageShell>
	);
}

function ProductRow({
	item,
	selected,
	channelLabel,
	onToggle,
}: {
	item: TVisualKitCatalogItem;
	selected: boolean;
	channelLabel: string;
	onToggle: () => void;
}) {
	const hasPrice = item.preco != null;
	const disabled = !hasPrice && !selected;
	const baseLabel = item.promocao.emPromocao
		? `antes ${formatToMoney(item.promocao.precoDe ?? 0)} · preço anterior`
		: item.precoVendaAnterior != null
			? "sem promoção no momento"
			: "sem preço anterior";

	return (
		<button
			type="button"
			onClick={onToggle}
			disabled={disabled}
			aria-pressed={selected}
			className={cn(
				"flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
				selected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40",
				disabled && "cursor-not-allowed opacity-60",
			)}
		>
			<span
				className={cn(
					"flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
					selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
				)}
			>
				{selected ? <Check className="h-3 w-3" /> : null}
			</span>
			<span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10">
				{item.imagemUrl ? (
					// biome-ignore lint/performance/noImgElement: miniatura de imagem externa do cadastro
					<img src={item.imagemUrl} alt="" className="h-full w-full object-cover" />
				) : (
					<ShoppingCart className="h-4 w-4 opacity-60" />
				)}
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
					<span className="truncate text-sm font-semibold tracking-tight">{item.nome}</span>
					<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
						<Code className="h-3 w-3" />
						{item.codigoBarras ?? item.codigo}
					</span>
					<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
						<Diamond className="h-3 w-3" />
						{item.grupo}
					</span>
					{item.detalhe ? <span className="text-[11px] text-muted-foreground">{item.detalhe}</span> : null}
				</span>
				<span className="text-[11px] text-muted-foreground">{hasPrice ? baseLabel : "Sem preço de venda: não entra nas peças."}</span>
			</span>
			<span className="flex shrink-0 flex-col items-end gap-0.5">
				<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{channelLabel}</span>
				<span className="flex items-baseline gap-1.5">
					{item.promocao.emPromocao ? (
						<span className="text-xs text-muted-foreground line-through">{formatToMoney(item.promocao.precoDe ?? 0)}</span>
					) : null}
					<span className="text-sm font-bold">{hasPrice ? formatToMoney(item.preco ?? 0) : "—"}</span>
				</span>
				{item.promocao.emPromocao && item.promocao.percentualDesconto ? (
					<span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">
						-{item.promocao.percentualDesconto}% vs. anterior
					</span>
				) : null}
			</span>
		</button>
	);
}
