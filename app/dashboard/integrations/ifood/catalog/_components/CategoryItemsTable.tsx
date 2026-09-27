"use client";

import DeleteRowButton from "@/components/Spreadsheet/DeleteRowButton";
import EditableNumberCell from "@/components/Spreadsheet/EditableNumberCell";
import EditableTextCell from "@/components/Spreadsheet/EditableTextCell";
import MobileEditableField from "@/components/Spreadsheet/MobileEditableField";
import { Button } from "@/components/ui/button";
import { formatToMoney } from "@/lib/formatting";
import type { TIfoodCategoryDTO, TIfoodItemDTO } from "@/lib/integrations/ifood/catalog-types";
import type { TCatalogLink } from "@/lib/queries/catalog-links";
import { SPREADSHEET_TABLE_ATTR, type SpreadsheetGridBounds } from "@/lib/spreadsheet-navigation";
import { cn } from "@/lib/utils";
import type { TIfoodCatalogStatusEnum } from "@/schemas/enums";
import type { useIfoodCatalogEditor } from "@/state-hooks/use-ifood-catalog-editor";
import { ImageIcon, Link2, Pencil, Plus } from "lucide-react";
import Link from "next/link";

const ITEM_GRID_COL = { PRICE: 0 } as const;
const ITEM_TABLE_GRID = "grid-cols-[minmax(0,30fr)_minmax(0,14fr)_minmax(0,16fr)_minmax(0,14fr)_minmax(0,14fr)_minmax(2.5rem,8fr)]";
const ITEM_DESKTOP_ROW = cn("hidden w-full lg:grid", ITEM_TABLE_GRID, "items-center gap-x-1 px-2");

function StatusToggle({
	status,
	editable,
	onToggle,
}: {
	status: TIfoodCatalogStatusEnum;
	editable: boolean;
	onToggle: (status: TIfoodCatalogStatusEnum) => void;
}) {
	const isAvailable = status === "AVAILABLE";
	const className = cn(
		"rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
		isAvailable ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
	);

	if (!editable) return <span className={className}>{isAvailable ? "DISPONÍVEL" : "INDISPONÍVEL"}</span>;

	return (
		<button
			type="button"
			onClick={() => onToggle(isAvailable ? "UNAVAILABLE" : "AVAILABLE")}
			className={cn(className, "transition-opacity hover:opacity-70")}
			title={isAvailable ? "Pausar no iFood" : "Reativar no iFood"}
		>
			{isAvailable ? "DISPONÍVEL" : "INDISPONÍVEL"}
		</button>
	);
}

type CategoryItemsTableProps = {
	merchantId: string;
	category: TIfoodCategoryDTO;
	canManage: boolean;
	editor: ReturnType<typeof useIfoodCatalogEditor>;
	/** Vínculo ativo por id de item do iFood — vazio quando a org não usa a matriz de canais. */
	linksByItemId: Map<string, TCatalogLink>;
	onAddProduct: () => void;
};

/**
 * A que produto interno o item está preso. O vínculo nasce e se desfaz na aba Canais de
 * Produtos; aqui ele só é mostrado, com atalho para o cadastro.
 */
function LinkBadge({ link }: { link: TCatalogLink | undefined }) {
	if (!link || !link.produtoId) return <span className="text-[0.65rem] text-muted-foreground">—</span>;
	const pending = link.status === "DIVERGENTE" || link.status === "ERRO";
	return (
		<Link
			href={`/dashboard/catalog/products/${link.produtoId}?tab=cadastro`}
			title={
				pending
					? `Vinculado, com pendência (${link.status.toLowerCase()}). Resolva na aba Canais de Produtos.`
					: "Vinculado ao cadastro interno. Abrir o produto."
			}
			className={cn(
				"inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide transition-opacity hover:opacity-80",
				pending
					? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500"
					: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
			)}
		>
			<Link2 className="size-3" />
			Vinculado
		</Link>
	);
}

/** Itens de uma categoria em tabela editável. Preço e status entram no rascunho; o resto vai no detalhe. */
export function CategoryItemsTable({ merchantId, category, canManage, editor, linksByItemId, onAddProduct }: CategoryItemsTableProps) {
	const gridBounds: SpreadsheetGridBounds = { rowCount: category.itens.length, colCount: 1 };

	if (category.itens.length === 0) {
		return (
			<div className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center">
				<p className="text-xs text-muted-foreground">Nenhum item em {category.nome ?? "esta categoria"}.</p>
				{canManage ? (
					<Button type="button" variant="outline" size="sm" onClick={onAddProduct}>
						<Plus className="h-4 w-4" />
						ADICIONAR ITEM
					</Button>
				) : null}
			</div>
		);
	}

	function itemStatus(item: TIfoodItemDTO): TIfoodCatalogStatusEnum {
		const servidor = item.status?.toUpperCase() === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE";
		return editor.resolveItemValue(item.id, "status", servidor) ?? servidor;
	}

	return (
		<div {...{ [SPREADSHEET_TABLE_ATTR]: "true" }} className="flex w-full flex-col">
			<div
				className={cn(ITEM_DESKTOP_ROW, "min-h-8 border-b border-border bg-background py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground")}
			>
				<p className="min-w-0 px-1 text-start">Item</p>
				<p className="min-w-0 px-1 text-center">Código (PDV)</p>
				<p className="min-w-0 px-1 text-center">Vínculo</p>
				<p className="min-w-0 px-1 text-center">Preço</p>
				<p className="min-w-0 px-1 text-center">Status</p>
				<p className="min-w-0 px-1 text-center">Ações</p>
			</div>

			<div className="flex w-full flex-col bg-background">
				{category.itens.map((item, indice) => {
					const preco = editor.resolveItemValue(item.id, "preco", item.preco ?? undefined);
					const status = itemStatus(item);
					const detalheHref = `/dashboard/integrations/ifood/catalog/${item.id}?merchantId=${merchantId}`;

					return (
						<div key={item.id ?? indice} className={cn("border-t border-border", indice % 2 === 1 && "bg-muted/10")}>
							<div className={cn(ITEM_DESKTOP_ROW, "min-h-12 py-1 text-xs transition-colors hover:bg-muted/40")}>
								<div className="flex min-w-0 items-center gap-2 px-1">
									{item.imagemUrl ? (
										// eslint-disable-next-line @next/next/no-img-element
										<img src={item.imagemUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-border" />
									) : (
										<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-border">
											<ImageIcon className="h-3.5 w-3.5" />
										</div>
									)}
									<div className="flex min-w-0 flex-col">
										<span className="truncate font-medium text-foreground">{item.nome ?? "Item sem nome"}</span>
										{item.descricao ? <span className="truncate text-[0.7rem] text-muted-foreground">{item.descricao}</span> : null}
									</div>
								</div>
								<p className="min-w-0 truncate px-1 text-center text-muted-foreground">{item.codigoExterno ?? "—"}</p>
								<div className="flex min-w-0 items-center justify-center px-1">
									<LinkBadge link={item.id ? linksByItemId.get(item.id) : undefined} />
								</div>
								<div className="min-w-0 px-1">
									{canManage && item.id ? (
										<EditableNumberCell
											value={preco ?? null}
											ariaLabel={`Editar preço de ${item.nome ?? "item"}`}
											min={0}
											format={formatToMoney}
											emptyDisplay="—"
											gridRow={indice}
											gridCol={ITEM_GRID_COL.PRICE}
											gridBounds={gridBounds}
											onCommit={(novoPreco) => editor.updateItemDraft(item.id as string, { preco: novoPreco })}
										/>
									) : (
										<p className="text-center tabular-nums">{preco != null ? formatToMoney(preco) : "—"}</p>
									)}
								</div>
								<div className="flex min-w-0 items-center justify-center px-1">
									<StatusToggle
										status={status}
										editable={canManage && !!item.id}
										onToggle={(novoStatus) => item.id && editor.updateItemDraft(item.id, { status: novoStatus })}
									/>
								</div>
								<div className="flex min-w-0 items-center justify-center px-1">
									{item.id ? (
										<Button variant="ghost" size="icon-sm" asChild>
											<Link href={detalheHref} aria-label={`Editar ${item.nome ?? "item"}`}>
												<Pencil className="h-3.5 w-3.5" />
											</Link>
										</Button>
									) : null}
								</div>
							</div>

							<div className="flex w-full flex-col gap-2 px-2 py-2.5 lg:hidden">
								<div className="flex items-start justify-between gap-2">
									<div className="flex min-w-0 items-center gap-2">
										{item.imagemUrl ? (
											// eslint-disable-next-line @next/next/no-img-element
											<img src={item.imagemUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-border" />
										) : null}
										<span className="truncate text-sm font-medium">{item.nome ?? "Item sem nome"}</span>
										<LinkBadge link={item.id ? linksByItemId.get(item.id) : undefined} />
									</div>
									{item.id ? (
										<Button variant="ghost" size="icon-sm" asChild>
											<Link href={detalheHref} aria-label={`Editar ${item.nome ?? "item"}`}>
												<Pencil className="h-3.5 w-3.5" />
											</Link>
										</Button>
									) : null}
								</div>
								<div className="grid grid-cols-2 items-end gap-2">
									<MobileEditableField label="Preço">
										{canManage && item.id ? (
											<EditableNumberCell
												value={preco ?? null}
												ariaLabel={`Editar preço de ${item.nome ?? "item"}`}
												min={0}
												format={formatToMoney}
												emptyDisplay="—"
												align="left"
												onCommit={(novoPreco) => editor.updateItemDraft(item.id as string, { preco: novoPreco })}
											/>
										) : (
											<span className="text-sm tabular-nums">{preco != null ? formatToMoney(preco) : "—"}</span>
										)}
									</MobileEditableField>
									<MobileEditableField label="Status">
										<div>
											<StatusToggle
												status={status}
												editable={canManage && !!item.id}
												onToggle={(novoStatus) => item.id && editor.updateItemDraft(item.id, { status: novoStatus })}
											/>
										</div>
									</MobileEditableField>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

type CategoryHeaderProps = {
	category: TIfoodCategoryDTO;
	canManage: boolean;
	editor: ReturnType<typeof useIfoodCatalogEditor>;
	onAddProduct: () => void;
	onDelete: () => void;
	isDeleting: boolean;
};

/** Cabeçalho editável da categoria: nome, código externo e status entram no mesmo rascunho dos itens. */
export function CategoryHeader({ category, canManage, editor, onAddProduct, onDelete, isDeleting }: CategoryHeaderProps) {
	const nome = editor.resolveCategoryValue(category.id, "nome", category.nome ?? "") ?? "";
	const codigoExterno = editor.resolveCategoryValue(category.id, "codigoExterno", category.codigoExterno ?? "") ?? "";
	const statusServidor: TIfoodCatalogStatusEnum = category.status?.toUpperCase() === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE";
	const status = editor.resolveCategoryValue(category.id, "status", statusServidor) ?? statusServidor;

	return (
		<div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
				<div className="min-w-0 max-w-[260px] flex-1">
					{canManage ? (
						<EditableTextCell
							value={nome}
							ariaLabel="Editar nome da categoria"
							align="left"
							emptyDisplay="Categoria sem nome"
							onCommit={(novoNome) => editor.updateCategoryDraft(category.id, { nome: novoNome })}
						/>
					) : (
						<span className="text-sm font-bold tracking-tight">{nome || "Categoria sem nome"}</span>
					)}
				</div>
				{canManage ? (
					<div className="w-[150px] shrink-0">
						<EditableTextCell
							value={codigoExterno}
							ariaLabel="Editar código externo da categoria"
							align="left"
							emptyDisplay="Sem código"
							onCommit={(novoCodigo) => editor.updateCategoryDraft(category.id, { codigoExterno: novoCodigo })}
						/>
					</div>
				) : null}
				<span className="shrink-0 text-xs text-muted-foreground">
					{category.itens.length} {category.itens.length === 1 ? "item" : "itens"}
				</span>
				<StatusToggle status={status} editable={canManage} onToggle={(novoStatus) => editor.updateCategoryDraft(category.id, { status: novoStatus })} />
			</div>
			{canManage ? (
				<div className="flex shrink-0 items-center gap-1 self-start lg:self-auto">
					<Button type="button" variant="ghost" size="sm" onClick={onAddProduct}>
						<Plus className="h-4 w-4" />
						NOVO ITEM
					</Button>
					<DeleteRowButton onRemove={onDelete} ariaLabel={`Remover categoria ${nome || category.id}`} disabled={isDeleting} />
				</div>
			) : null}
		</div>
	);
}
