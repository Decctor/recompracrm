"use client";
import type { TCreateTabOrderInput } from "@/app/api/tabs/orders/route";
import ProductSearchInput from "@/components/Inputs/ProductSearchInput";
import BarcodeMatchPicker from "@/components/Modals/Sales/BarcodeMatchPicker";
import {
	ProductBuilderForm,
	ProductBuilderStepper,
	type TBuilderProduct,
	type TBuiltOrderItem,
	useProductBuilder,
} from "@/components/Products/ProductBuilderForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { usePOSBarcodeScan } from "@/lib/hooks/use-pos-barcode-scan";
import { createTabOrder } from "@/lib/mutations/tabs";
import { normalizeProductSearchTerms } from "@/lib/products/search-terms";
import { usePOSGroups, usePOSProducts, usePOSTopProducts } from "@/lib/queries/pos";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Flame, Minus, MousePointerClick, Plus, Search, SendHorizonal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// ============================================================================
// Aba "Lançar pedido" do painel: catálogo em grade de toque, carrinho fixo no
// rodapé com observação e envio. Produto com variantes/adicionais troca a grade
// pela montagem no mesmo lugar e volta ao confirmar. O id do tabOrder é gerado
// no client e mantido em retries: duplo toque reenvia o mesmo id e não duplica.
// ============================================================================

type TCartItem = TCreateTabOrderInput["itens"][number] & { cartKey: string };

type TComposerStage = { kind: "catalog" } | { kind: "builder"; product: TBuilderProduct; initialVariantId?: string | null };

function modifierSignature(modifiers: TBuiltOrderItem["modificadores"]) {
	return modifiers
		.map((modifier) => `${modifier.opcaoId}x${modifier.quantidade}`)
		.sort()
		.join("|");
}

function cartKeyFor(item: Pick<TBuiltOrderItem, "produtoId" | "produtoVarianteId" | "modificadores" | "observacoes">) {
	return `${item.produtoId}:${item.produtoVarianteId ?? ""}:${modifierSignature(item.modificadores)}:${item.observacoes ?? ""}`;
}

function withQuantity(item: TCartItem, quantidade: number): TCartItem {
	const valorTotalBruto = item.valorUnitarioFinal * quantidade;
	return { ...item, quantidade, valorTotalBruto, valorTotalLiquido: valorTotalBruto - item.valorDesconto };
}

function isComplexProduct(product: TBuilderProduct) {
	return product.variantes.length > 0 || product.addOnsReferencias.length > 0;
}

type TabOrderComposerProps = {
	tabId: string;
	/** Chamado após lançar com sucesso (refresh do painel e do board). */
	onLaunched: () => void;
	/** Quantidade de itens no carrinho, para o badge da aba. */
	onCartCountChange?: (count: number) => void;
};

export function TabOrderComposer({ tabId, onLaunched, onCartCountChange }: TabOrderComposerProps) {
	const [stage, setStage] = useState<TComposerStage>({ kind: "catalog" });
	const directionRef = useRef<"forward" | "back">("forward");
	const [cart, setCart] = useState<TCartItem[]>([]);
	const [observacoes, setObservacoes] = useState("");
	// Um id por "intenção de pedido": permanece o mesmo em retries, muda apenas após sucesso.
	const [tabOrderId, setTabOrderId] = useState<string>(() => crypto.randomUUID());

	function goTo(next: TComposerStage, direction: "forward" | "back") {
		directionRef.current = direction;
		setStage(next);
	}

	const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.valorTotalLiquido, 0), [cart]);
	const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantidade, 0), [cart]);
	useEffect(() => {
		onCartCountChange?.(cartCount);
	}, [cartCount, onCartCountChange]);
	const cartQtyByProduct = useMemo(() => {
		const map = new Map<string, number>();
		for (const item of cart) map.set(item.produtoId, (map.get(item.produtoId) ?? 0) + item.quantidade);
		return map;
	}, [cart]);

	const { mutate: launchOrder, isPending: launchPending } = useMutation({
		mutationKey: ["create-tab-order", tabOrderId],
		mutationFn: createTabOrder,
		onSuccess: (data) => {
			toast.success(data.message);
			setCart([]);
			setObservacoes("");
			setTabOrderId(crypto.randomUUID());
			goTo({ kind: "catalog" }, "back");
			onLaunched();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function addItem(item: TBuiltOrderItem) {
		const cartKey = cartKeyFor(item);
		setCart((prev) => {
			const existing = prev.find((entry) => entry.cartKey === cartKey);
			if (existing) return prev.map((entry) => (entry.cartKey === cartKey ? withQuantity(entry, entry.quantidade + item.quantidade) : entry));
			return [...prev, withQuantity({ ...item, cartKey }, item.quantidade)];
		});
	}

	function addSimpleProduct(product: TBuilderProduct) {
		addItem({
			produtoId: product.id,
			produtoVarianteId: null,
			nome: product.nome,
			codigo: product.codigo,
			imagemUrl: product.imagemCapaUrl,
			quantidade: 1,
			valorUnitarioBase: product.precoVenda ?? 0,
			valorModificadores: 0,
			valorUnitarioFinal: product.precoVenda ?? 0,
			valorTotalBruto: product.precoVenda ?? 0,
			valorDesconto: 0,
			valorTotalLiquido: product.precoVenda ?? 0,
			observacoes: null,
			modificadores: [],
		});
	}

	function changeQuantity(cartKey: string, delta: number) {
		setCart((prev) =>
			prev.map((item) => (item.cartKey === cartKey ? withQuantity(item, item.quantidade + delta) : item)).filter((item) => item.quantidade > 0),
		);
	}

	function handleProductTap(product: TBuilderProduct) {
		if (isComplexProduct(product)) return goTo({ kind: "builder", product }, "forward");
		addSimpleProduct(product);
	}

	// Leitor de código de barras no canal COMANDA: o item lido soma no carrinho pela mesma chave do
	// toque; produto com escolhas pendentes abre a montagem. Durante a montagem a leitura é
	// recusada em vez de trocar o produto no meio e perder as escolhas feitas.
	const composerRef = useRef<HTMLDivElement>(null);
	const barcodeScan = usePOSBarcodeScan({
		channel: "COMANDA",
		ownerRef: composerRef,
		blockedReason: stage.kind === "builder" ? "Conclua a montagem do item antes de ler outro código." : null,
		onAddDirect: (item) => addItem(item),
		onOpenBuilder: ({ product, variantId }) => goTo({ kind: "builder", product, initialVariantId: variantId }, "forward"),
	});

	function handleLaunch() {
		if (cart.length === 0) return;
		launchOrder({
			tabId,
			tabOrderId,
			observacoes: observacoes || null,
			itens: cart.map(({ cartKey: _cartKey, ...item }) => item),
		});
	}

	const stageKey = stage.kind === "builder" ? `builder-${stage.product.id}-${stage.initialVariantId ?? ""}` : stage.kind;

	return (
		<div ref={composerRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div
				key={stageKey}
				className={cn(
					"flex min-h-0 min-w-0 flex-1 flex-col animate-in fade-in-0 duration-200",
					directionRef.current === "forward" ? "slide-in-from-right-2" : "slide-in-from-left-2",
				)}
			>
				{stage.kind === "catalog" ? <CatalogStage cartQtyByProduct={cartQtyByProduct} onProductTap={handleProductTap} /> : null}

				{stage.kind === "builder" ? (
					<BuilderStage
						product={stage.product}
						initialVariantId={stage.initialVariantId ?? null}
						onBack={() => goTo({ kind: "catalog" }, "back")}
						onConfirm={(item) => {
							addItem(item);
							goTo({ kind: "catalog" }, "back");
						}}
					/>
				) : null}
			</div>

			{/* Carrinho fixo: o pedido em montagem fica sempre a vista enquanto o catálogo rola */}
			{stage.kind === "catalog" ? (
				<div className="flex flex-col gap-2.5 border-t border-border bg-card px-4 pt-3 pb-4">
					{cartCount > 0 ? (
						<>
							<div className="flex items-center justify-between">
								<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
									Novo pedido · {cartCount} {cartCount === 1 ? "item" : "itens"}
								</span>
								<button type="button" className="text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => setCart([])}>
									Limpar
								</button>
							</div>
							<div className="flex max-h-[150px] flex-col gap-1.5 overflow-y-auto">
								{cart.map((item) => (
									<div key={item.cartKey} className="flex items-center gap-2">
										<div className="flex shrink-0 items-center rounded-lg border border-border">
											<button
												type="button"
												aria-label={`Remover 1 ${item.nome}`}
												className="flex size-7 items-center justify-center"
												onClick={() => changeQuantity(item.cartKey, -1)}
											>
												<Minus className="size-3" />
											</button>
											<span className="w-5 text-center text-sm font-bold tabular-nums">{item.quantidade}</span>
											<button
												type="button"
												aria-label={`Adicionar 1 ${item.nome}`}
												className="flex size-7 items-center justify-center"
												onClick={() => changeQuantity(item.cartKey, 1)}
											>
												<Plus className="size-3" />
											</button>
										</div>
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="truncate text-sm font-semibold">{item.nome}</span>
											{item.modificadores.length > 0 ? (
												<span className="truncate text-xs text-muted-foreground">
													{item.modificadores.map((modifier) => `${modifier.quantidade}x ${modifier.nome}`).join(" · ")}
												</span>
											) : null}
										</span>
										<span className="shrink-0 text-sm font-bold tabular-nums">{formatToMoney(item.valorTotalLiquido)}</span>
									</div>
								))}
							</div>
							<Input
								value={observacoes}
								onChange={(event) => setObservacoes(event.target.value)}
								placeholder="Observação: sem cebola, nome da rodada…"
								className="h-9 rounded-xl text-sm"
							/>
							<Button size="lg" disabled={launchPending} onClick={handleLaunch}>
								<SendHorizonal className="size-4" />
								{launchPending ? "Enviando..." : `Enviar pedido · ${formatToMoney(cartTotal)}`}
							</Button>
						</>
					) : (
						<div className="flex items-center gap-2.5 rounded-xl bg-secondary/50 px-3 py-2.5 text-xs text-muted-foreground">
							<MousePointerClick className="size-4 shrink-0" />
							Toque nos produtos para montar o pedido. Ele vai para o preparo ao enviar.
						</div>
					)}
				</div>
			) : null}

			{barcodeScan.candidates ? (
				<BarcodeMatchPicker candidates={barcodeScan.candidates} onChoose={barcodeScan.chooseCandidate} onClose={barcodeScan.dismissCandidates} />
			) : null}
		</div>
	);
}

// ============================================================================
// Estágio: catálogo
// ============================================================================

function CatalogStage({
	cartQtyByProduct,
	onProductTap,
}: {
	cartQtyByProduct: Map<string, number>;
	onProductTap: (product: TBuilderProduct) => void;
}) {
	// Canal COMANDA: o pedido da mesa exibe e cobra o preço do canal, venha do QR ou do operador.
	const { data: productsResult, filters, updateFilters, isLoading } = usePOSProducts({ initialFilters: { channel: "COMANDA" } });
	const { data: groupsResult } = usePOSGroups({ channel: "COMANDA" });
	const { data: topProductsResult } = usePOSTopProducts({ channel: "COMANDA" });

	const groups = groupsResult?.groups ?? [];
	const products = productsResult?.products ?? [];
	const totalPages = productsResult?.totalPages ?? 1;
	const currentPage = productsResult?.currentPage ?? 1;
	const hasSearch = normalizeProductSearchTerms(filters.search).length > 0;
	const topProducts = topProductsResult?.products ?? [];
	const showTopStrip = !hasSearch && !filters.group && currentPage === 1 && topProducts.length > 0;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-col gap-2.5 px-4 pt-4 pb-2.5">
				<ProductSearchInput value={filters.search} onChange={(search, immediate) => updateFilters({ search }, immediate)} isLoading={isLoading} />
				{groups.length > 0 ? (
					<div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
						<GroupChip label="Todos" active={!filters.group} onClick={() => updateFilters({ group: null })} />
						{groups.map((group) => (
							<GroupChip
								key={group}
								label={group}
								active={filters.group === group}
								onClick={() => updateFilters({ group: filters.group === group ? null : group })}
							/>
						))}
					</div>
				) : null}
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-1 pb-4">
				{/* Mais pedidos — acesso rápido aos itens corriqueiros */}
				{showTopStrip ? (
					<div className="flex flex-col gap-1.5">
						<span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
							<Flame className="size-3" />
							Mais pedidos
						</span>
						<div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
							{topProducts.map((product) => (
								<button
									key={product.id}
									type="button"
									className="relative h-8 shrink-0 whitespace-nowrap rounded-full border border-border bg-card pr-3 pl-3 text-xs font-bold transition-colors hover:border-primary/50"
									onClick={() => onProductTap(product)}
								>
									{product.nome}
									{cartQtyByProduct.get(product.id) ? (
										<span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">{cartQtyByProduct.get(product.id)}</span>
									) : null}
								</button>
							))}
						</div>
					</div>
				) : null}

				{isLoading && products.length === 0 ? (
					<div className="grid grid-cols-2 gap-2">
						{Array.from({ length: 8 }).map((_, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: lista estática de skeletons
							<Skeleton key={index} className="h-19 rounded-xl" />
						))}
					</div>
				) : null}

				{!isLoading && products.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-10 text-center">
						<Search className="size-6 text-muted-foreground" />
						<p className="text-sm font-semibold">
							Nenhum produto encontrado{hasSearch ? ` para "${normalizeProductSearchTerms(filters.search).join(", ")}"` : ""}.
						</p>
						{hasSearch || filters.group ? (
							<Button size="sm" variant="outline" onClick={() => updateFilters({ search: [], group: null })}>
								LIMPAR FILTROS
							</Button>
						) : (
							<p className="max-w-xs text-xs text-muted-foreground">Cadastre produtos ativos para lançá-los nos pedidos da conta.</p>
						)}
					</div>
				) : null}

				{products.length > 0 ? (
					<div className="grid grid-cols-2 gap-2">
						{products.map((product) => {
							const complex = isComplexProduct(product);
							const qty = cartQtyByProduct.get(product.id) ?? 0;
							const priceLabel =
								complex && product.variantes.length > 0 && product.precoVenda == null
									? `a partir de ${formatToMoney(product.variantes[0].precoVenda)}`
									: formatToMoney(product.precoVenda ?? product.variantes[0]?.precoVenda ?? 0);
							return (
								<button
									key={product.id}
									type="button"
									onClick={() => onProductTap(product)}
									className={cn(
										"relative flex min-h-19 flex-col justify-between gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-primary/50",
										qty > 0 ? "border-primary/35 bg-primary/5" : "border-border bg-card",
									)}
								>
									<span className="line-clamp-2 pr-6 text-sm font-bold leading-tight">{product.nome}</span>
									<span className="flex w-full items-center justify-between gap-1.5">
										<span className="text-xs font-bold tabular-nums text-foreground/75">{priceLabel}</span>
										{complex ? <span className="text-xs font-bold text-primary">Personalizável</span> : null}
									</span>
									{qty > 0 ? (
										<span className="absolute top-2 right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold tabular-nums text-primary-foreground">
											{qty}
										</span>
									) : null}
								</button>
							);
						})}
					</div>
				) : null}

				{totalPages > 1 ? (
					<div className="flex items-center justify-center gap-3 py-1">
						<Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => updateFilters({ page: currentPage - 1 })}>
							<ChevronLeft className="size-3.5" />
							ANTERIOR
						</Button>
						<span className="text-xs font-semibold tabular-nums text-muted-foreground">
							{currentPage} / {totalPages}
						</span>
						<Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => updateFilters({ page: currentPage + 1 })}>
							PRÓXIMA
							<ChevronRight className="size-3.5" />
						</Button>
					</div>
				) : null}
			</div>
		</div>
	);
}

function GroupChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			aria-pressed={active}
			className={cn(
				"h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-bold transition-colors",
				active ? "bg-foreground text-background" : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
			)}
			onClick={onClick}
		>
			{label}
		</button>
	);
}

// ============================================================================
// Estágio: montagem (variantes + adicionais)
// ============================================================================

function BuilderStage({
	product,
	initialVariantId,
	onBack,
	onConfirm,
}: {
	product: TBuilderProduct;
	initialVariantId: string | null;
	onBack: () => void;
	onConfirm: (item: TBuiltOrderItem) => void;
}) {
	const builder = useProductBuilder({ product, initialVariantId });

	function handleConfirm() {
		const item = builder.buildItem();
		if (!item) {
			if (builder.blockReason) toast.error(builder.blockReason);
			return;
		}
		onConfirm(item);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4">
				<button
					type="button"
					onClick={onBack}
					className="flex h-10 w-fit items-center gap-1.5 rounded-lg pr-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-primary"
				>
					<ChevronLeft className="size-4 text-muted-foreground" />
					<span className="text-xs font-medium text-muted-foreground">Catálogo</span>
					<span className="truncate text-sm font-bold tracking-tight">{product.nome}</span>
				</button>

				<ProductBuilderForm product={product} builder={builder} showFooter={false} />
			</div>

			<div className="flex flex-col gap-1.5 border-t border-border bg-card px-4 pt-3 pb-4">
				{builder.blockReason ? <p className="text-center text-xs font-medium text-destructive">{builder.blockReason}</p> : null}
				<div className="flex items-center gap-2">
					<div className="flex h-12 shrink-0 items-center rounded-xl border border-border bg-background px-1.5">
						<ProductBuilderStepper
							value={builder.quantity}
							size="sm"
							onDecrement={() => builder.setQuantity(Math.max(1, builder.quantity - 1))}
							onIncrement={() => builder.setQuantity(builder.quantity + 1)}
							decrementDisabled={builder.quantity <= 1}
						/>
					</div>
					<Button
						size="lg"
						className="h-12 flex-1 rounded-xl text-sm font-bold disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
						disabled={!builder.canConfirm}
						onClick={handleConfirm}
					>
						Adicionar · {formatToMoney(builder.finalPrice)}
					</Button>
				</div>
			</div>
		</div>
	);
}
