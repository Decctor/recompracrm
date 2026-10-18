import DateInput from "@/components/Inputs/DateInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import SelectProductWithVariants, { type TSelectProductWithVariantsValue } from "@/components/Inputs/SelectProductWithVariants";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDateAsLocale, formatDateForInputValue, formatDateOnInputChange, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useProductStockLots } from "@/lib/queries/product-stock-lots";
import { isManualStockInflow } from "@/lib/stock/manual-stock-movements";
import { cn } from "@/lib/utils";
import type { TManualStockMovementTypeEnum } from "@/schemas/enums";
import type {
	TStockTransactionItemProduct,
	TStockTransactionItemState,
	TUseInternalStockTransactionState,
} from "@/state-hooks/use-internal-stock-transaction-state";
import { AlertTriangle, ArrowRight, Boxes, Package, Plus, Trash2 } from "lucide-react";

// Formato comum ao produto da busca e ao produto da página de detalhe: o modal aceita qualquer um.
export type TStockTransactionProductSource = {
	id: string;
	nome: string;
	codigo: string | null;
	unidade: string;
	imagemCapaUrl: string | null;
	quantidade: number | null;
	precoCusto: number | null;
	rastreamentoEstoqueAtivo: boolean | null;
	variantes?:
		| {
				id: string;
				nome: string;
				codigo: string | null;
				imagemCapaUrl: string | null;
				quantidade: number | null;
				precoCusto: number | null;
				rastreamentoEstoqueAtivo: boolean | null;
		  }[]
		| null;
};

export function buildStockTransactionItemProduct({
	product,
	productVariantId,
}: {
	product: TStockTransactionProductSource;
	productVariantId?: string | null;
}): Pick<TStockTransactionItemState, "productId" | "productVariantId" | "produto"> {
	const variant = productVariantId ? product.variantes?.find((item) => item.id === productVariantId) : null;
	const produto: TStockTransactionItemProduct = variant
		? {
				nome: product.nome,
				varianteNome: variant.nome,
				codigo: variant.codigo ?? product.codigo,
				unidade: product.unidade,
				imagemCapaUrl: variant.imagemCapaUrl ?? product.imagemCapaUrl,
				quantidade: variant.quantidade ?? 0,
				precoCusto: variant.precoCusto,
				rastreamentoEstoqueAtivo: !!variant.rastreamentoEstoqueAtivo,
			}
		: {
				nome: product.nome,
				varianteNome: null,
				codigo: product.codigo,
				unidade: product.unidade,
				imagemCapaUrl: product.imagemCapaUrl,
				quantidade: product.quantidade ?? 0,
				precoCusto: product.precoCusto,
				rastreamentoEstoqueAtivo: !!product.rastreamentoEstoqueAtivo,
			};
	return { productId: product.id, productVariantId: variant?.id ?? null, produto };
}

const PRODUCT_ENTITY_OPTION = "__PRODUTO__";

// Saldos que o produto oferece para movimentar: o do próprio produto (quando rastreado) e o de
// cada variante rastreada.
export function getTrackedStockEntityOptions(product: TStockTransactionProductSource) {
	const options: { id: string; value: string; label: string }[] = [];
	if (product.rastreamentoEstoqueAtivo) options.push({ id: product.id, value: PRODUCT_ENTITY_OPTION, label: product.nome });
	for (const variant of product.variantes ?? []) {
		if (variant.rastreamentoEstoqueAtivo) options.push({ id: variant.id, value: variant.id, label: variant.nome });
	}
	return options;
}

type StockTransactionItemsBlockProps = {
	type: TManualStockMovementTypeEnum;
	items: TStockTransactionItemState[];
	lockedProduct?: TStockTransactionProductSource | null;
	addItem: TUseInternalStockTransactionState["addItem"];
	updateItem: TUseInternalStockTransactionState["updateItem"];
	removeItem: TUseInternalStockTransactionState["removeItem"];
};

export default function StockTransactionItemsBlock({ type, items, lockedProduct, addItem, updateItem, removeItem }: StockTransactionItemsBlockProps) {
	return (
		<ResponsiveMenuSection
			title="ITENS"
			icon={<Boxes className="h-4 w-4 min-h-4 min-w-4" />}
			action={
				lockedProduct ? undefined : (
					<Button type="button" variant="ghost" size="fit" className="rounded-lg px-2 py-1 text-xs" onClick={() => addItem()}>
						<Plus className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
						ADICIONAR ITEM
					</Button>
				)
			}
		>
			{items.map((item) => (
				<StockTransactionItemCard
					key={item.key}
					type={type}
					item={item}
					lockedProduct={lockedProduct}
					canRemove={!lockedProduct && items.length > 1}
					updateItem={updateItem}
					removeItem={removeItem}
				/>
			))}
		</ResponsiveMenuSection>
	);
}

type StockTransactionItemCardProps = {
	type: TManualStockMovementTypeEnum;
	item: TStockTransactionItemState;
	lockedProduct?: TStockTransactionProductSource | null;
	canRemove: boolean;
	updateItem: TUseInternalStockTransactionState["updateItem"];
	removeItem: TUseInternalStockTransactionState["removeItem"];
};

function StockTransactionItemCard({ type, item, lockedProduct, canRemove, updateItem, removeItem }: StockTransactionItemCardProps) {
	const inflow = isManualStockInflow(type);
	const produto = item.produto;
	const quantity = item.quantity ?? 0;
	const projectedBalance = produto ? produto.quantidade + (inflow ? quantity : -quantity) : null;
	const insufficient = !inflow && produto != null && quantity > produto.quantidade;
	const lockedOptions = lockedProduct ? getTrackedStockEntityOptions(lockedProduct) : [];

	function handleProductChange(value: TSelectProductWithVariantsValue) {
		if (!value?.product) {
			updateItem(item.key, { productId: null, productVariantId: null, produto: null, lotId: null });
			return;
		}
		updateItem(item.key, {
			...buildStockTransactionItemProduct({ product: value.product, productVariantId: value.productVariant?.id ?? null }),
			lotId: null,
		});
	}

	return (
		<div className="border-border flex w-full flex-col gap-3 rounded-xl border p-3">
			<div className="flex w-full items-start gap-2">
				<div className="flex min-w-0 grow flex-col gap-2">
					{lockedProduct ? (
						<>
							<ProductIdentity produto={produto} fallbackName={lockedProduct.nome} />
							{lockedOptions.length > 1 ? (
								<SelectInput
									label="SALDO A MOVIMENTAR"
									value={item.productVariantId ?? (item.productId ? PRODUCT_ENTITY_OPTION : null)}
									options={lockedOptions}
									resetOptionLabel="SELECIONE O PRODUTO OU VARIANTE"
									handleChange={(value) =>
										updateItem(item.key, {
											...buildStockTransactionItemProduct({
												product: lockedProduct,
												productVariantId: value === PRODUCT_ENTITY_OPTION ? null : value,
											}),
											lotId: null,
										})
									}
									onReset={() => updateItem(item.key, { productId: null, productVariantId: null, produto: null, lotId: null })}
								/>
							) : null}
						</>
					) : (
						<SelectProductWithVariants
							label="PRODUTO"
							value={item.productId ? { productId: item.productId, productVariantId: item.productVariantId } : null}
							selectedLabel={produto ? formatItemName(produto) : undefined}
							resetOptionLabel="SELECIONE UM PRODUTO"
							handleChange={handleProductChange}
							onReset={() => handleProductChange(null)}
						/>
					)}
				</div>
				{canRemove ? (
					<Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeItem(item.key)} aria-label="Remover item">
						<Trash2 className="h-4 w-4 min-h-4 min-w-4" />
					</Button>
				) : null}
			</div>

			{produto && !produto.rastreamentoEstoqueAtivo ? (
				<p className="text-destructive flex items-center gap-1.5 text-xs font-medium">
					<AlertTriangle className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
					Rastreamento de estoque desativado para este item. Ative-o no cadastro do produto para movimentar.
				</p>
			) : null}

			{produto?.rastreamentoEstoqueAtivo ? (
				<>
					<div className="flex w-full flex-col gap-2 sm:flex-row">
						<div className="w-full sm:w-1/2">
							<NumberInput
								label={`QUANTIDADE (${produto.unidade})`}
								placeholder="Informe a quantidade"
								value={item.quantity}
								handleChange={(value) => updateItem(item.key, { quantity: value })}
								required
							/>
						</div>
						{inflow ? (
							<div className="w-full sm:w-1/2">
								<NumberInput
									label="CUSTO UNITÁRIO"
									placeholder={produto.precoCusto != null ? `Atual: ${formatToMoney(produto.precoCusto)}` : "Opcional"}
									value={item.unitCost}
									handleChange={(value) => updateItem(item.key, { unitCost: value })}
								/>
							</div>
						) : (
							<div className="w-full sm:w-1/2">
								<StockLotSelect
									key={`${item.productId}:${item.productVariantId ?? ""}`}
									productId={item.productId ?? ""}
									productVariantId={item.productVariantId}
									value={item.lotId}
									onChange={(lotId) => updateItem(item.key, { lotId })}
								/>
							</div>
						)}
					</div>

					{inflow ? (
						<div className="flex w-full flex-col gap-2 sm:flex-row">
							<div className="w-full sm:w-1/2">
								<TextInput
									label="CÓDIGO DO LOTE"
									placeholder="Opcional"
									value={item.newLot?.code ?? ""}
									handleChange={(value) => updateItem(item.key, { newLot: { code: value, expirationDate: item.newLot?.expirationDate ?? null } })}
								/>
							</div>
							<div className="w-full sm:w-1/2">
								<DateInput
									label="VALIDADE DO LOTE"
									value={formatDateForInputValue(item.newLot?.expirationDate)}
									handleChange={(value) =>
										updateItem(item.key, { newLot: { code: item.newLot?.code ?? "", expirationDate: formatDateOnInputChange(value, "date") } })
									}
								/>
							</div>
						</div>
					) : null}

					<div className="flex flex-wrap items-center gap-2 text-xs">
						<span className="text-muted-foreground font-semibold">SALDO</span>
						<span className="font-bold tabular-nums">
							{formatDecimalPlaces(produto.quantidade)} {produto.unidade}
						</span>
						<ArrowRight className="text-muted-foreground h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
						<span className={cn("font-bold tabular-nums", insufficient ? "text-destructive" : inflow ? "text-green-600" : "text-foreground")}>
							{formatDecimalPlaces(projectedBalance ?? 0)} {produto.unidade}
						</span>
						{insufficient ? <span className="text-destructive font-medium">Saldo insuficiente para esta saída.</span> : null}
						{inflow && item.unitCost == null ? <span className="text-muted-foreground">Sem custo informado, o custo médio atual é mantido.</span> : null}
					</div>
				</>
			) : null}
		</div>
	);
}

function formatItemName(produto: TStockTransactionItemProduct) {
	return produto.varianteNome ? `${produto.nome} (${produto.varianteNome})` : produto.nome;
}

function ProductIdentity({ produto, fallbackName }: { produto: TStockTransactionItemProduct | null; fallbackName: string }) {
	return (
		<div className="flex items-center gap-2">
			<Avatar className="h-9 w-9 min-h-9 min-w-9 rounded-lg">
				<AvatarImage src={produto?.imagemCapaUrl ?? undefined} alt={produto?.nome ?? fallbackName} className="object-cover" />
				<AvatarFallback className="rounded-lg">
					<Package className="text-muted-foreground h-4 w-4 min-h-4 min-w-4" />
				</AvatarFallback>
			</Avatar>
			<div className="flex min-w-0 flex-col">
				<span className="truncate text-sm font-bold tracking-tight">{produto ? formatItemName(produto) : fallbackName}</span>
				{produto?.codigo ? <span className="text-muted-foreground text-xs">{produto.codigo}</span> : null}
			</div>
		</div>
	);
}

type StockLotSelectProps = {
	productId: string;
	productVariantId: string | null;
	value: string | null;
	onChange: (lotId: string | null) => void;
};

function StockLotSelect({ productId, productVariantId, value, onChange }: StockLotSelectProps) {
	const { data } = useProductStockLots({ initialFilters: { productId, productVariantId, status: ["ATIVO"] } });
	// Sem variante, o filtro da rota não restringe a variante: os lotes de variantes ficam de fora aqui.
	const lots = (data?.stockLots ?? []).filter((lot) => (lot.produtoVarianteId ?? null) === (productVariantId ?? null));
	const options = lots.map((lot) => ({
		id: lot.id,
		value: lot.id,
		label: `${lot.codigoLote ?? "Lote sem código"} · ${formatDecimalPlaces(lot.quantidadeAtual)} disp.${lot.dataValidade ? ` · vence ${formatDateAsLocale(lot.dataValidade)}` : ""}`,
	}));

	return (
		<SelectInput
			label="LOTE"
			value={value}
			options={options}
			resetOptionLabel="BAIXA AUTOMÁTICA (FEFO)"
			handleChange={(lotId) => onChange(lotId)}
			onReset={() => onChange(null)}
		/>
	);
}
