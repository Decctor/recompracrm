"use client";

import MobileEditableField from "@/components/Spreadsheet/MobileEditableField";
import { Button } from "@/components/ui/button";
import { formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { type TMatrixCell, matrixNodeKey } from "@/lib/products/sales-channels-matrix";
import type {
	TSalesChannelMatrixChannel,
	TSalesChannelMatrixLink,
	TSalesChannelMatrixProduct,
	TSalesChannelMatrixVariant,
} from "@/lib/queries/sales-channels";
import { SPREADSHEET_TABLE_ATTR, type SpreadsheetGridBounds } from "@/lib/spreadsheet-navigation";
import { cn } from "@/lib/utils";
import type { TSalesChannelCatalogModeEnum } from "@/schemas/enums";
import { Box, CornerDownRight, SquarePen } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useMemo } from "react";
import ChannelHeaderMenu from "./ChannelHeaderMenu";
import IfoodNodeMenu from "./IfoodNodeMenu";
import { ProductAddOnsChip } from "./ProductAddOnsDialog";
import { MatrixAvailabilityCell, MatrixPriceCell, MatrixStatusCell, type TMatrixNodeView } from "./ChannelMatrixCells";

/**
 * A grade de um grupo: linhas de produto (e de variante, sempre expandidas) × uma coluna-grupo por
 * canal visível, cada uma com disponibilidade, preço e status. É uma planilha CSS-grid, como a
 * vitrine: sem `<table>`, para que o cartão mobile e a grade desktop saiam do mesmo componente.
 *
 * Navegação por teclado: uma coluna editável por canal (o preço); as setas andam entre os nós que
 * precificam. Produto com variantes não precifica — a linha-pai fica fora da grade de navegação.
 */

export type TMatrixChannelColumn = {
	channel: TSalesChannelMatrixChannel;
	label: string;
	catalogoModo: TSalesChannelCatalogModeEnum;
	linkedCount: number;
	divergentCount: number;
};

/** O que a coluna de um merchant iFood precisa saber além das células: quem já está preso a quê. */
export type TMatrixMerchantLinks = { linkedItemIds: Set<string>; linkedProductIds: Set<string> };

export type TMatrixCellAccessors = {
	cells: Map<string, TMatrixCell>;
	links: Map<string, TSalesChannelMatrixLink>;
	merchantLinks: Map<string, TMatrixMerchantLinks>;
	cycleAvailability: (key: string) => void;
	updatePrice: (key: string, precoVenda: number | null) => void;
	setChannelCatalogMode: (canalVendaId: string, catalogoModo: TSalesChannelCatalogModeEnum) => void;
};

export function matrixLinkKey(merchantId: string, produtoId: string, produtoVarianteId: string | null) {
	return `${merchantId}:${produtoId}:${produtoVarianteId ?? ""}`;
}

const EMPTY_SET = new Set<string>();

const FIXED_COLUMNS = "minmax(0,28fr) minmax(0,10fr) minmax(0,9fr)";
const CHANNEL_COLUMNS = "minmax(0,15fr) minmax(0,14fr) minmax(0,12fr)";

function gridStyle(channelCount: number): CSSProperties {
	return {
		gridTemplateColumns: `${FIXED_COLUMNS} ${Array.from({ length: channelCount }, () => CHANNEL_COLUMNS).join(" ")}`,
		// Abaixo disso as pílulas de disponibilidade colidem com o preço; a partir daqui a grade
		// rola horizontalmente em vez de espremer as colunas.
		minWidth: `${34 + channelCount * 18}rem`,
	};
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
			<Box className="h-3.5 w-3.5" />
		</span>
	);
}

function ProductRegistryLink({ produto }: { produto: TSalesChannelMatrixProduct }) {
	return (
		<Button asChild type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
			<Link
				href={`/dashboard/catalog/products/${produto.id}?tab=cadastro`}
				aria-label={`Abrir o cadastro de ${produto.nome}`}
				title="Abrir o cadastro do produto"
			>
				<SquarePen className="h-3.5 w-3.5" />
			</Link>
		</Button>
	);
}

type MatrixRow = {
	key: string;
	product: TSalesChannelMatrixProduct;
	variant: TSalesChannelMatrixVariant | null;
	/** Posição na grade de navegação; null quando o nó não precifica. */
	gridRow: number | null;
};

function buildRows(produtos: TSalesChannelMatrixProduct[]): MatrixRow[] {
	const rows: MatrixRow[] = [];
	let gridRow = 0;
	for (const product of produtos) {
		const activeVariants = product.variantes.filter((variant) => variant.ativo);
		rows.push({ key: product.id, product, variant: null, gridRow: activeVariants.length ? null : gridRow++ });
		for (const variant of activeVariants) rows.push({ key: `${product.id}:${variant.id}`, product, variant, gridRow: gridRow++ });
	}
	return rows;
}

function nodeView(row: MatrixRow, canalVendaId: string, cells: Map<string, TMatrixCell>): TMatrixNodeView {
	return {
		product: row.product,
		variant: row.variant,
		productCell: cells.get(matrixNodeKey(row.product.id, canalVendaId, null)) ?? null,
		variantCell: row.variant ? (cells.get(matrixNodeKey(row.product.id, canalVendaId, row.variant.id)) ?? null) : null,
	};
}

function ChannelCells({
	row,
	column,
	columnIndex,
	gridBounds,
	accessors,
	layout,
}: {
	row: MatrixRow;
	column: TMatrixChannelColumn;
	columnIndex: number;
	gridBounds: SpreadsheetGridBounds;
	accessors: TMatrixCellAccessors;
	layout: "desktop" | "mobile";
}) {
	const { channel } = column;
	const node = nodeView(row, channel.id, accessors.cells);
	const key = matrixNodeKey(row.product.id, channel.id, row.variant?.id ?? null);
	const link = channel.refExterno ? (accessors.links.get(matrixLinkKey(channel.refExterno, row.product.id, row.variant?.id ?? null)) ?? null) : null;
	const merchantLinks = channel.refExterno ? accessors.merchantLinks.get(channel.refExterno) : undefined;

	// iFood sem vínculo: a célula não edita. O override gravado aqui não chegaria à loja, e editar
	// um valor que "não vale" confunde mais do que ajuda — o menu da linha vincula ou publica, e a
	// partir daí o push leva preço e disponibilidade. A linha-pai com variantes libera quando
	// qualquer variante está vinculada (a presença do produto no canal é o que ela edita).
	const hasActiveVariants = row.variant === null && row.product.variantes.some((variant) => variant.ativo);
	const ifoodUnlinked = channel.canal === "IFOOD" && (hasActiveVariants ? !(merchantLinks?.linkedProductIds.has(row.product.id) ?? false) : !link);
	const readOnlyReason = ifoodUnlinked ? "Sem vínculo com o iFood: vincule ou publique pelo menu da linha para editar." : null;

	const availability = (
		<MatrixAvailabilityCell
			node={node}
			channel={channel}
			catalogoModo={column.catalogoModo}
			onCycle={() => accessors.cycleAvailability(key)}
			readOnlyReason={readOnlyReason}
		/>
	);
	const price = (
		<MatrixPriceCell
			node={node}
			gridRow={row.gridRow}
			gridCol={columnIndex}
			gridBounds={gridBounds}
			onChange={(precoVenda) => accessors.updatePrice(key, precoVenda)}
			readOnlyReason={readOnlyReason}
		/>
	);
	const status = (
		<div className="flex min-w-0 items-center justify-center gap-0.5">
			<MatrixStatusCell node={node} channel={channel} catalogoModo={column.catalogoModo} link={link} />
			{channel.canal === "IFOOD" && channel.refExterno ? (
				<IfoodNodeMenu
					merchantId={channel.refExterno}
					merchantLabel={column.label}
					product={row.product}
					variant={row.variant}
					link={link}
					linkedItemIds={merchantLinks?.linkedItemIds ?? EMPTY_SET}
					productHasLink={merchantLinks?.linkedProductIds.has(row.product.id) ?? false}
				/>
			) : null}
		</div>
	);

	if (layout === "desktop") {
		return (
			<>
				<div className="min-w-0">{availability}</div>
				<div className="min-w-0 px-1">{price}</div>
				<div className="min-w-0">{status}</div>
			</>
		);
	}
	return (
		<div className="grid grid-cols-2 gap-2">
			<MobileEditableField label="Disponível">{availability}</MobileEditableField>
			<MobileEditableField label="Preço no canal">{price}</MobileEditableField>
			<div className="col-span-2">{status}</div>
		</div>
	);
}

function RowIdentity({ row, compact }: { row: MatrixRow; compact: boolean }) {
	if (row.variant) {
		return (
			<div className="flex min-w-0 items-center gap-2 px-1 pl-4">
				<CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
				<span className="flex min-w-0 flex-1 flex-col">
					<span className={cn("truncate", compact ? "text-xs" : "text-sm")}>{row.variant.nome}</span>
					{row.variant.codigo ? <span className="truncate text-[0.65rem] text-muted-foreground">{row.variant.codigo}</span> : null}
				</span>
			</div>
		);
	}
	return (
		<div className="flex min-w-0 items-center gap-2 px-1">
			<ProductThumb imageUrl={row.product.imagemCapaUrl} label={row.product.nome} />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className={cn("truncate font-medium", compact ? "text-xs" : "text-sm")}>{row.product.nome}</span>
				{row.product.codigo ? <span className="truncate text-[0.65rem] text-muted-foreground">{row.product.codigo}</span> : null}
			</span>
		</div>
	);
}

function basePriceOf(row: MatrixRow) {
	const price = row.variant ? row.variant.precoVenda : row.product.precoVenda;
	// Produto com variantes ativas não tem preço próprio a mostrar: é por variante.
	if (!row.variant && row.product.variantes.some((variant) => variant.ativo)) return "—";
	return price && price > 0 ? formatToMoney(price) : "-";
}

type ChannelMatrixTableProps = {
	produtos: TSalesChannelMatrixProduct[];
	columns: TMatrixChannelColumn[];
	/** Canal mostrado no cartão mobile (um por vez, escolhido pelo seletor de foco). */
	focusedColumn: TMatrixChannelColumn | null;
	accessors: TMatrixCellAccessors;
};

export default function ChannelMatrixTable({ produtos, columns, focusedColumn, accessors }: ChannelMatrixTableProps) {
	const rows = useMemo(() => buildRows(produtos), [produtos]);
	const gridBounds: SpreadsheetGridBounds = useMemo(
		() => ({ rowCount: rows.filter((row) => row.gridRow !== null).length, colCount: Math.max(columns.length, 1) }),
		[columns.length, rows],
	);
	const style = gridStyle(columns.length);

	return (
		<div {...{ [SPREADSHEET_TABLE_ATTR]: "true" }} className="flex w-full flex-col">
			{/* Desktop: a grade rola na horizontal quando há canais demais para a largura. */}
			<div className="hidden w-full overflow-x-auto lg:block">
				<div
					className="grid min-h-9 items-center gap-x-1 border-b border-border bg-background px-2 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground"
					style={style}
				>
					<p className="min-w-0 px-1 text-start">Produto</p>
					<p className="min-w-0 px-1 text-center">Preço base</p>
					<p className="min-w-0 px-1 text-center">Adicionais</p>
					{columns.map((column) => (
						<div key={column.channel.id} className="col-span-3 min-w-0 border-l border-border/60">
							<ChannelHeaderMenu
								channel={column.channel}
								label={column.label}
								catalogoModo={column.catalogoModo}
								linkedCount={column.linkedCount}
								divergentCount={column.divergentCount}
								onCatalogModeChange={(catalogoModo) => accessors.setChannelCatalogMode(column.channel.id, catalogoModo)}
							/>
						</div>
					))}
				</div>
				<div
					className="grid items-center gap-x-1 border-b border-border bg-muted/30 px-2 py-1 text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground"
					style={style}
				>
					<span />
					<span />
					<span />
					{columns.map((column) => (
						<SubHeader key={column.channel.id} />
					))}
				</div>
				<div className="flex w-full flex-col bg-background" style={{ minWidth: style.minWidth }}>
					{rows.map((row, index) => (
						<div
							key={row.key}
							className={cn(
								"grid min-h-11 items-center gap-x-1 border-t border-border px-2 py-1 text-xs transition-colors hover:bg-muted/40",
								index % 2 === 1 && "bg-muted/10",
								row.variant && "border-t-border/40",
							)}
							style={style}
						>
							<div className="flex min-w-0 items-center justify-between gap-1">
								<RowIdentity row={row} compact />
								{row.variant ? null : <ProductRegistryLink produto={row.product} />}
							</div>
							<p className="min-w-0 px-1 text-center tabular-nums text-muted-foreground">{basePriceOf(row)}</p>
							<div className="flex min-w-0 justify-center px-1">{row.variant ? null : <ProductAddOnsChip product={row.product} />}</div>
							{columns.map((column, columnIndex) => (
								<ChannelCells
									key={column.channel.id}
									row={row}
									column={column}
									columnIndex={columnIndex}
									gridBounds={gridBounds}
									accessors={accessors}
									layout="desktop"
								/>
							))}
						</div>
					))}
				</div>
			</div>

			{/* Mobile: um cartão por nó, mostrando só o canal em foco. */}
			<div className="flex w-full flex-col lg:hidden">
				{rows.map((row) => (
					<div key={row.key} className={cn("flex flex-col gap-2 border-t border-border px-3 py-2.5", row.variant && "bg-muted/10")}>
						<div className="flex items-start justify-between gap-2">
							<RowIdentity row={row} compact={false} />
							<div className="flex shrink-0 items-center gap-2">
								<span className="text-xs tabular-nums text-muted-foreground">{basePriceOf(row)}</span>
								{row.variant ? null : <ProductAddOnsChip product={row.product} />}
								{row.variant ? null : <ProductRegistryLink produto={row.product} />}
							</div>
						</div>
						{focusedColumn ? (
							<ChannelCells row={row} column={focusedColumn} columnIndex={0} gridBounds={gridBounds} accessors={accessors} layout="mobile" />
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}

function SubHeader(): ReactNode {
	return (
		<>
			<span className="min-w-0 border-l border-border/60 px-1 text-center">Disponível</span>
			<span className="min-w-0 px-1 text-center">Preço</span>
			<span className="min-w-0 px-1 text-center">Status</span>
		</>
	);
}
