"use client";

import DateInput from "@/components/Inputs/DateInput";
import SelectProductWithVariants, { type TSelectProductWithVariantsValue } from "@/components/Inputs/SelectProductWithVariants";
import DeleteRowButton from "@/components/Spreadsheet/DeleteRowButton";
import EditableNumberCell from "@/components/Spreadsheet/EditableNumberCell";
import MobileEditableField from "@/components/Spreadsheet/MobileEditableField";
import SpreadsheetCellWrapper from "@/components/Spreadsheet/SpreadsheetCellWrapper";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import { useProductsByIds } from "@/lib/queries/products";
import {
	consumeProgrammaticSpreadsheetFocus,
	handleSpreadsheetNavigationKeyDown,
	SPREADSHEET_TABLE_ATTR,
	type SpreadsheetGridBounds,
} from "@/lib/spreadsheet-navigation";
import { cn } from "@/lib/utils";
import { CAMPAIGN_PROMOTION_PRODUCTS_LIMIT, type TCampaignPromotionProduct } from "@/schemas/campaigns";
import { Package, Plus } from "lucide-react";
import { useMemo } from "react";
import { useBuilderCampaign } from "../builder-provider";

const PROMOTION_PRODUCT_GRID_COL = {
	PRODUCT: 0,
	PROMO_PRICE: 1,
	DISCOUNT_PERCENTAGE: 2,
} as const;

const PROMOTION_PRODUCT_GRID_COL_COUNT = 3;

// Dados de catálogo usados só para exibição — o que persiste é apenas `produtoId` + `precoPromocional`.
type TPromotionProductDisplay = {
	nome: string;
	codigo: string | null;
	precoVenda: number | null;
	imagemCapaUrl: string | null;
};

export default function PromocaoProdutosConfig() {
	const { state, updateCampaign, addPromotionProduct, updatePromotionProduct, removePromotionProduct } = useBuilderCampaign();
	const promotionProducts = useMemo(() => state.campaign.gatilhoPromocaoProdutos ?? [], [state.campaign.gatilhoPromocaoProdutos]);

	// A lista guarda só IDs; nome/preço/imagem vêm do catálogo. Em modo de edição é a única forma
	// de exibir os produtos já salvos.
	const productIds = useMemo(() => promotionProducts.map((promotionProduct) => promotionProduct.produtoId).filter(Boolean), [promotionProducts]);
	const { data: catalogProducts } = useProductsByIds({ ids: productIds });
	const displayByProductId = useMemo(() => {
		const map = new Map<string, TPromotionProductDisplay>();
		for (const product of catalogProducts ?? []) {
			map.set(product.id, {
				nome: product.nome,
				codigo: product.codigo,
				precoVenda: product.precoVenda,
				imagemCapaUrl: product.imagemCapaUrl,
			});
		}
		return map;
	}, [catalogProducts]);

	const reachedLimit = promotionProducts.length >= CAMPAIGN_PROMOTION_PRODUCTS_LIMIT;
	const gridBounds: SpreadsheetGridBounds = useMemo(
		() => ({
			rowCount: promotionProducts.length + 1,
			colCount: PROMOTION_PRODUCT_GRID_COL_COUNT,
		}),
		[promotionProducts.length],
	);

	return (
		<div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4">
			<p className="text-xs text-muted-foreground">
				A campanha será disparada uma única vez na data selecionada e no bloco de horário configurado na etapa de Envio. Cada cliente recebe o produto
				da lista com maior chance de recompra — use a variável <span className="font-medium text-foreground">Nome do Produto da Promoção</span> no
				template.
			</p>
			<DateInput
				label="DATA DO DISPARO"
				value={state.campaign.gatilhoPromocaoDataReferencia ?? undefined}
				handleChange={(value) => updateCampaign({ gatilhoPromocaoDataReferencia: value ?? null })}
			/>

			<div className="flex w-full flex-col gap-1.5">
				<div className="flex w-full items-center justify-between gap-2">
					<span className="text-[0.7rem] font-medium tracking-tight text-muted-foreground">PRODUTOS DA PROMOÇÃO</span>
					<span
						className={cn(
							"rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[0.65rem] font-medium tabular-nums text-muted-foreground",
							reachedLimit && "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
						)}
					>
						{promotionProducts.length}/{CAMPAIGN_PROMOTION_PRODUCTS_LIMIT}
					</span>
				</div>

				<div {...{ [SPREADSHEET_TABLE_ATTR]: "true" }} className="flex w-full flex-col overflow-hidden rounded-md border border-border bg-background">
					<div className="hidden min-h-9 w-full items-center border-b border-border bg-muted/60 px-2 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground lg:flex">
						<p className="w-[44%] px-2 text-start">Produto</p>
						<p className="w-[16%] px-2 text-center">Preço atual</p>
						<p className="w-[17%] px-2 text-center">Preço promo</p>
						<p className="w-[15%] px-2 text-center">% desc.</p>
						<p className="w-[8%] px-2 text-center">Ações</p>
					</div>

					<div className="flex w-full flex-col bg-background">
						{promotionProducts.map((promotionProduct, index) => (
							<PromotionProductRow
								key={`${promotionProduct.produtoId}-${index}`}
								promotionProduct={promotionProduct}
								display={displayByProductId.get(promotionProduct.produtoId) ?? null}
								gridRow={index}
								gridBounds={gridBounds}
								handleUpdate={(updated) => updatePromotionProduct(index, updated)}
								handleRemove={() => removePromotionProduct(index)}
							/>
						))}

						{reachedLimit ? null : (
							<DraftPromotionProductRow
								gridRow={promotionProducts.length}
								gridBounds={gridBounds}
								selectedProductIds={productIds}
								addPromotionProduct={addPromotionProduct}
							/>
						)}

						{promotionProducts.length === 0 ? (
							<div className="flex w-full items-center justify-center border-t border-border px-3 py-3">
								<p className="text-center text-xs font-medium tracking-tight text-muted-foreground">
									Selecione um produto na linha em branco para montar a promoção.
								</p>
							</div>
						) : null}
					</div>
				</div>

				<p className="text-[0.68rem] leading-relaxed text-muted-foreground">
					O preço promocional é opcional — sem ele, vale o preço de venda do produto. A ordem da lista decide o desempate para clientes sem histórico.
				</p>
			</div>
		</div>
	);
}

type PromotionProductRowProps = {
	promotionProduct: TCampaignPromotionProduct;
	display: TPromotionProductDisplay | null;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
	handleUpdate: (promotionProduct: Partial<TCampaignPromotionProduct>) => void;
	handleRemove: () => void;
};

function PromotionProductRow({ promotionProduct, display, gridRow, gridBounds, handleUpdate, handleRemove }: PromotionProductRowProps) {
	const listPrice = display?.precoVenda ?? 0;
	const promotionPrice = promotionProduct.precoPromocional ?? 0;
	// Espelha a regra do servidor: sem preço de venda no cadastro, o preço promocional é a única
	// fonte de preço da mensagem, então deixa de ser opcional.
	const requiresPromotionPrice = listPrice <= 0 && promotionPrice <= 0;
	const discountPercentage = computeDiscountPercentage({ listPrice, promotionPrice });

	// O percentual é auxiliar de UI: editá-lo apenas deriva o preço promocional, que é o que persiste.
	function handleDiscountPercentageCommit(nextPercentage: number) {
		if (listPrice <= 0) return;
		if (nextPercentage <= 0) {
			handleUpdate({ precoPromocional: null });
			return;
		}
		const nextPrice = Number((listPrice * (1 - Math.min(nextPercentage, 100) / 100)).toFixed(2));
		handleUpdate({ precoPromocional: nextPrice > 0 ? nextPrice : null });
	}

	function handlePromotionPriceCommit(nextPrice: number) {
		handleUpdate({ precoPromocional: nextPrice > 0 ? nextPrice : null });
	}

	return (
		<div className="border-t border-border first:border-t-0">
			<div className="hidden min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40 lg:flex">
				<div className="w-[44%] min-w-0 px-1">
					<StaticProductLabel display={display} warning={requiresPromotionPrice ? "Defina um preço promocional" : null} />
				</div>
				<p className="w-[16%] px-2 text-center font-mono text-xs tabular-nums text-muted-foreground">
					{listPrice > 0 ? formatToMoney(listPrice) : "-"}
				</p>
				<div className="w-[17%] px-1">
					<EditableNumberCell
						value={promotionPrice}
						ariaLabel="Editar preço promocional"
						min={0}
						gridRow={gridRow}
						gridCol={PROMOTION_PRODUCT_GRID_COL.PROMO_PRICE}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? formatToMoney(value) : "-")}
						onCommit={handlePromotionPriceCommit}
					/>
				</div>
				<div className="w-[15%] px-1">
					<EditableNumberCell
						value={discountPercentage}
						ariaLabel="Editar percentual de desconto"
						min={0}
						gridRow={gridRow}
						gridCol={PROMOTION_PRODUCT_GRID_COL.DISCOUNT_PERCENTAGE}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "-")}
						onCommit={handleDiscountPercentageCommit}
					/>
				</div>
				<div className="flex w-[8%] justify-center px-1">
					<DeleteRowButton onRemove={handleRemove} ariaLabel="Remover produto da promoção" />
				</div>
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex w-full items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<StaticProductLabel display={display} warning={requiresPromotionPrice ? "Defina um preço promocional" : null} />
					</div>
					<DeleteRowButton onRemove={handleRemove} ariaLabel="Remover produto da promoção" />
				</div>
				<div className="grid w-full grid-cols-3 gap-2">
					<MobileEditableField label="Preço atual">
						<p className="px-2 text-center font-mono text-xs tabular-nums text-muted-foreground">{listPrice > 0 ? formatToMoney(listPrice) : "-"}</p>
					</MobileEditableField>
					<MobileEditableField label="Preço promo">
						<EditableNumberCell
							value={promotionPrice}
							ariaLabel="Editar preço promocional"
							min={0}
							format={(value) => (value > 0 ? formatToMoney(value) : "-")}
							onCommit={handlePromotionPriceCommit}
						/>
					</MobileEditableField>
					<MobileEditableField label="% desc.">
						<EditableNumberCell
							value={discountPercentage}
							ariaLabel="Editar percentual de desconto"
							min={0}
							format={(value) => (value > 0 ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "-")}
							onCommit={handleDiscountPercentageCommit}
						/>
					</MobileEditableField>
				</div>
			</div>
		</div>
	);
}

function DraftPromotionProductRow({
	gridRow,
	gridBounds,
	selectedProductIds,
	addPromotionProduct,
}: {
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
	selectedProductIds: string[];
	addPromotionProduct: (promotionProduct: TCampaignPromotionProduct) => void;
}) {
	function handleChange(value: TSelectProductWithVariantsValue) {
		if (!value?.product) return;
		// A promoção é por produto (sem variantes) e não aceita repetidos.
		if (selectedProductIds.includes(value.product.id)) return;
		addPromotionProduct({ produtoId: value.product.id, precoPromocional: null });
	}

	return (
		<div className="border-t border-dashed border-border bg-muted/20">
			<div className="flex min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40">
				<div className="flex w-full items-center gap-1 px-1 lg:w-[44%]">
					<Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<SpreadsheetCellWrapper gridRow={gridRow} gridCol={PROMOTION_PRODUCT_GRID_COL.PRODUCT}>
							<SelectProductWithVariants
								label="PRODUTO"
								showLabel={false}
								value={null}
								selectedLabel="NOVO PRODUTO"
								resetOptionLabel="SELECIONE UM PRODUTO"
								holderClassName="h-auto min-h-8 rounded-md border-transparent bg-transparent px-2 py-1 text-left shadow-none hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
								popoverContentClassName="w-[var(--anchor-width)] min-w-[410px] max-w-[520px]"
								commandListClassName="max-h-[360px]"
								handleChange={handleChange}
								onReset={() => undefined}
								renderTriggerContent={() => (
									<span className="flex min-w-0 flex-1 items-center gap-2">
										<ProductThumb imageUrl={null} label="Novo produto" />
										<span className="truncate text-xs font-medium text-muted-foreground">NOVO PRODUTO</span>
									</span>
								)}
								triggerProps={{
									onFocus: () => {
										consumeProgrammaticSpreadsheetFocus();
									},
									onKeyDown: (event) => {
										if (event.key === "Enter") return;
										handleSpreadsheetNavigationKeyDown(event, {
											coords: { row: gridRow, col: PROMOTION_PRODUCT_GRID_COL.PRODUCT },
											bounds: gridBounds,
										});
									},
								}}
							/>
						</SpreadsheetCellWrapper>
					</div>
				</div>
				<p className="hidden w-[16%] px-2 text-center font-mono text-xs tabular-nums text-muted-foreground lg:block">-</p>
				<p className="hidden w-[17%] px-2 text-center font-mono text-xs tabular-nums text-muted-foreground lg:block">-</p>
				<p className="hidden w-[15%] px-2 text-center font-mono text-xs tabular-nums text-muted-foreground lg:block">-</p>
				<div className="hidden w-[8%] lg:block" />
			</div>
		</div>
	);
}

function StaticProductLabel({ display, warning }: { display: TPromotionProductDisplay | null; warning?: string | null }) {
	const name = display?.nome ?? "Produto";
	return (
		<span className="flex min-w-0 items-center gap-2 px-2 py-1">
			<ProductThumb imageUrl={display?.imagemCapaUrl} label={name} />
			<span className="flex min-w-0 flex-col">
				<span className={cn("truncate text-xs font-medium", !display && "text-muted-foreground")}>{name}</span>
				{display?.codigo ? <span className="truncate text-[0.65rem] text-muted-foreground">{display.codigo}</span> : null}
				{warning ? <span className="truncate text-[0.65rem] font-medium text-destructive">{warning}</span> : null}
			</span>
		</span>
	);
}

function ProductThumb({ imageUrl, label }: { imageUrl?: string | null; label: string }) {
	return (
		<Avatar className="h-7 w-7 shrink-0 rounded-md border border-border">
			{imageUrl ? <AvatarImage src={imageUrl} alt={label} className="object-cover" /> : null}
			<AvatarFallback className="rounded-md bg-muted text-[0.6rem] font-medium text-muted-foreground">
				{label ? formatNameAsInitials(label) : <Package className="h-3.5 w-3.5" />}
			</AvatarFallback>
		</Avatar>
	);
}

/** Percentual derivado do preço promocional — auxiliar de UI, nunca persistido. */
function computeDiscountPercentage({ listPrice, promotionPrice }: { listPrice: number; promotionPrice: number }) {
	if (listPrice <= 0 || promotionPrice <= 0 || promotionPrice >= listPrice) return 0;
	return Number((((listPrice - promotionPrice) / listPrice) * 100).toFixed(1));
}
