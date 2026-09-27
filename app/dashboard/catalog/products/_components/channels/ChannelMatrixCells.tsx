"use client";

import { AvailabilityCycleButton } from "@/components/SalesChannels/ProductChannelControls";
import EditableNumberCell from "@/components/Spreadsheet/EditableNumberCell";
import { formatToMoney } from "@/lib/formatting";
import { type TChannelOverrides, resolveChannelAvailability, resolveChannelPrice } from "@/lib/products/sales-channels";
import type { TMatrixCell } from "@/lib/products/sales-channels-matrix";
import type {
	TSalesChannelMatrixChannel,
	TSalesChannelMatrixLink,
	TSalesChannelMatrixProduct,
	TSalesChannelMatrixVariant,
} from "@/lib/queries/sales-channels";
import type { SpreadsheetGridBounds } from "@/lib/spreadsheet-navigation";
import { cn } from "@/lib/utils";
import type { TCatalogLinkStatusEnum } from "@/schemas/enums";
import { RotateCcw } from "lucide-react";

/**
 * Células de um nó (produto | variante) × canal na matriz. Os controles são os mesmos da página
 * do produto (`AvailabilityCycleButton`, semântica "vazio = herda" do preço), para que o override
 * se comporte igual nas duas telas.
 */

export type TMatrixNodeView = {
	product: TSalesChannelMatrixProduct;
	variant: TSalesChannelMatrixVariant | null;
	/** Override do produto neste canal (nível produto), do rascunho. */
	productCell: TMatrixCell | null;
	/** Override da variante neste canal, do rascunho; null quando o nó é o produto. */
	variantCell: TMatrixCell | null;
};

function toOverrides(node: TMatrixNodeView): TChannelOverrides {
	return { product: node.productCell, variant: node.variantCell };
}

// Produtos da matriz já vêm filtrados por ativo && vendavel; o resolver ainda exige os campos.
function toChannelProduct(product: TSalesChannelMatrixProduct) {
	return { ...product, ativo: true, vendavel: true };
}

/** Disponibilidade efetiva do nó no canal, com o rascunho aplicado. */
export function resolveMatrixNodeAvailability(
	node: TMatrixNodeView,
	channel: TSalesChannelMatrixChannel,
	catalogoModo: TSalesChannelMatrixChannel["catalogoModo"],
) {
	return resolveChannelAvailability({
		product: toChannelProduct(node.product),
		variant: node.variant,
		channel: { canal: channel.canal, catalogoModo },
		overrides: toOverrides(node),
	});
}

export function resolveMatrixNodePrice(node: TMatrixNodeView) {
	return resolveChannelPrice(toChannelProduct(node.product), node.variant, toOverrides(node));
}

export function MatrixAvailabilityCell({
	node,
	channel,
	catalogoModo,
	onCycle,
	readOnlyReason,
}: {
	node: TMatrixNodeView;
	channel: TSalesChannelMatrixChannel;
	catalogoModo: TSalesChannelMatrixChannel["catalogoModo"];
	onCycle: () => void;
	/** Motivo de bloqueio; presente, a pílula é mostrada mas não cicla. */
	readOnlyReason?: string | null;
}) {
	const isVariant = node.variant !== null;
	const choice = isVariant ? (node.variantCell?.disponivel ?? null) : (node.productCell?.disponivel ?? null);
	// O que "herdar" significa aqui: o modo do canal no nível do produto; a presença do PRODUTO no
	// canal no nível da variante (uma variante só restringe).
	const inheritedVisible = isVariant
		? resolveMatrixNodeAvailability({ ...node, variant: null, variantCell: null }, channel, catalogoModo)
		: catalogoModo === "TODOS";
	if (readOnlyReason) {
		return (
			<div className="flex justify-center px-1 opacity-50" title={readOnlyReason}>
				<AvailabilityCycleButton choice={choice} inheritedVisible={inheritedVisible} variantLevel={isVariant} onCycle={() => {}} />
			</div>
		);
	}
	return (
		<div className="flex justify-center px-1">
			<AvailabilityCycleButton choice={choice} inheritedVisible={inheritedVisible} variantLevel={isVariant} onCycle={onCycle} />
		</div>
	);
}

export function MatrixPriceCell({
	node,
	gridRow,
	gridCol,
	gridBounds,
	onChange,
	readOnlyReason,
}: {
	node: TMatrixNodeView;
	/** Ausente quando o nó não precifica (produto com variantes: preço é por variante). */
	gridRow: number | null;
	gridCol: number;
	gridBounds: SpreadsheetGridBounds;
	onChange: (precoVenda: number | null) => void;
	/** Motivo de bloqueio; presente, a célula vira leitura. */
	readOnlyReason?: string | null;
}) {
	if (readOnlyReason && gridRow !== null) {
		const current = (node.variant ? node.variantCell : node.productCell)?.precoVenda ?? null;
		const base = node.variant ? node.variant.precoVenda : node.product.precoVenda;
		return (
			<span className="block px-1 text-center text-[0.65rem] text-muted-foreground" title={readOnlyReason}>
				{current != null ? formatToMoney(current) : base && base > 0 ? `Herda ${formatToMoney(base)}` : "—"}
			</span>
		);
	}
	if (gridRow === null) {
		return (
			<span
				className="block px-1 text-center text-[0.65rem] text-muted-foreground"
				title="Produto com variantes: o preço do canal é definido em cada variante, abaixo."
			>
				Por variante
			</span>
		);
	}

	const cell = node.variant ? node.variantCell : node.productCell;
	const overridden = cell?.precoVenda != null;
	const basePrice = node.variant ? node.variant.precoVenda : node.product.precoVenda;
	const label = node.variant ? `${node.product.nome} · ${node.variant.nome}` : node.product.nome;
	return (
		<div
			className={cn("flex min-w-0 items-center gap-1 rounded-md border px-1", overridden ? "border-blue-500/40 bg-blue-500/10" : "border-transparent")}
		>
			<div className="min-w-0 flex-1">
				<EditableNumberCell
					value={cell?.precoVenda ?? 0}
					ariaLabel={`Editar preço no canal de ${label}`}
					min={0}
					gridRow={gridRow}
					gridCol={gridCol}
					gridBounds={gridBounds}
					// Zero é a forma de limpar: sem preço o canal não vende, então vale mais como "volta a
					// herdar" do que como valor. Herdando, a célula mostra o preço base que vai valer.
					format={(value) => (value > 0 ? formatToMoney(value) : basePrice && basePrice > 0 ? `Herda ${formatToMoney(basePrice)}` : "Herda")}
					onCommit={(value) => onChange(value > 0 ? value : null)}
				/>
			</div>
			{overridden ? (
				<button
					type="button"
					onClick={() => onChange(null)}
					aria-label={`Voltar a herdar o preço de ${label}`}
					className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<RotateCcw className="h-3 w-3" />
				</button>
			) : null}
		</div>
	);
}

const WARNING_BADGE =
	"inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500";

const LINK_STATUS_BADGE: Record<TCatalogLinkStatusEnum, { label: string; className: string }> = {
	PENDENTE: { label: "Pendente", className: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400" },
	SINCRONIZADO: { label: "Sincronizado", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
	DIVERGENTE: { label: "Divergente", className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500" },
	ERRO: { label: "Erro", className: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" },
	DESVINCULADO: { label: "Desvinculado", className: "border-border bg-muted text-muted-foreground" },
};

function describeLink(link: TSalesChannelMatrixLink) {
	if (link.status === "ERRO" && link.ultimoErro) return link.ultimoErro;
	if (link.status === "DIVERGENTE" && link.divergencias?.length) {
		return link.divergencias
			.map((divergencia) => `${divergencia.campo}: aqui ${String(divergencia.valorInterno ?? "—")}, no iFood ${String(divergencia.valorExterno ?? "—")}`)
			.join("\n");
	}
	return link.dataUltimaSincronizacao
		? `Última sincronização: ${new Date(link.dataUltimaSincronizacao).toLocaleString("pt-BR")}`
		: "Ainda não sincronizado.";
}

/**
 * O que o canal vai fazer com este nó, dado o rascunho. Para a loja são os mesmos portões de
 * `getShopCatalogProducts` (sem preço, sem estoque); para o iFood é o estado do vínculo — sem
 * vínculo, o override é só estado desejado, e a célula diz isso em vez de fingir que já valeu.
 */
export function MatrixStatusCell({
	node,
	channel,
	catalogoModo,
	link,
}: {
	node: TMatrixNodeView;
	channel: TSalesChannelMatrixChannel;
	catalogoModo: TSalesChannelMatrixChannel["catalogoModo"];
	link: TSalesChannelMatrixLink | null;
}) {
	// Produto com variantes não é um nó vendável por si: a presença dele no canal já está na
	// pílula, e o estado de venda é o de cada variante.
	const hasActiveVariants = node.variant === null && node.product.variantes.some((variant) => variant.ativo);

	if (channel.canal === "IFOOD") {
		if (hasActiveVariants) return <span className="block px-1 text-center text-[0.65rem] text-muted-foreground">—</span>;
		if (!link) {
			return (
				<span className="flex justify-center px-1">
					<span
						className="inline-flex items-center rounded-md border border-dashed border-border px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground"
						title="Sem vínculo com um item do iFood: o que você define aqui é o estado desejado e ainda não chega à loja."
					>
						Sem vínculo
					</span>
				</span>
			);
		}
		const badge = LINK_STATUS_BADGE[link.status];
		return (
			<span className="flex justify-center px-1">
				<span
					title={describeLink(link)}
					className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide", badge.className)}
				>
					{badge.label}
				</span>
			</span>
		);
	}

	if (hasActiveVariants) return <span className="block px-1 text-center text-[0.65rem] text-muted-foreground">—</span>;

	const available = resolveMatrixNodeAvailability(node, channel, catalogoModo);
	if (available)
		return <span className="block px-1 text-center text-[0.65rem] text-muted-foreground">{channel.canal === "SHOP" ? "Na loja" : "Visível"}</span>;

	// Só a loja tem portões além da presença; nos demais, oculto é oculto.
	if (channel.canal !== "SHOP") return <span className="block px-1 text-center text-[0.65rem] text-muted-foreground">Oculto</span>;

	const presenceOnly = resolveChannelAvailability({
		product: toChannelProduct(node.product),
		variant: node.variant,
		channel: { canal: "POS", catalogoModo },
		overrides: toOverrides(node),
	});
	if (!presenceOnly) return <span className="block px-1 text-center text-[0.65rem] text-muted-foreground">Oculto</span>;

	const stockNode = node.variant ?? node.product;
	const semPreco = (resolveMatrixNodePrice(node) ?? 0) <= 0;
	const semEstoque = !!stockNode.rastreamentoEstoqueAtivo && (stockNode.quantidade ?? 0) <= 0;
	return (
		<span className="flex flex-wrap justify-center gap-1 px-1">
			{semPreco ? (
				<span title="Sem preço de venda, a loja não exibe o produto." className={WARNING_BADGE}>
					Sem preço
				</span>
			) : null}
			{semEstoque ? (
				<span title="Estoque rastreado e zerado: a loja esconde o produto até haver saldo." className={WARNING_BADGE}>
					Sem estoque
				</span>
			) : null}
		</span>
	);
}
