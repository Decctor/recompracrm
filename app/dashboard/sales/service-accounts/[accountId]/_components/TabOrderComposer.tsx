"use client";
import type { TCreateTabOrderInput } from "@/app/api/tabs/orders/route";
import TextInput from "@/components/Inputs/TextInput";
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
import { createTabOrder } from "@/lib/mutations/tabs";
import { usePOSGroups, usePOSProducts, usePOSTopProducts } from "@/lib/queries/pos";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Flame, Minus, Plus, Search, SendHorizonal, ShoppingBasket, SlidersHorizontal, X } from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// ============================================================================
// Compositor de pedido da conta: catálogo → montagem → revisão, morfando no
// mesmo container (mesmo padrão do AddFilter dos filtros interativos — a lista
// vira o editor no lugar, com header de volta). O id do tabOrder é gerado no
// client e mantido em retries: duplo toque reenvia o mesmo id e não duplica.
// ============================================================================

type TCartItem = TCreateTabOrderInput["itens"][number] & { cartKey: string };

type TComposerStage = { kind: "catalog" } | { kind: "builder"; product: TBuilderProduct } | { kind: "review" };

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
	/** Etiqueta da conta (ex.: "Mesa 4") — contexto no header do mobile, onde o header da página fica oculto. */
	contextLabel: string;
	/** Chamado após lançar com sucesso (refresh + fechamento no mobile). */
	onLaunched: () => void;
	/** Botão de volta do mobile (oculto no desktop, onde o painel fica lado a lado). */
	onExit: () => void;
	className?: string;
};

export function TabOrderComposer({ tabId, contextLabel, onLaunched, onExit, className }: TabOrderComposerProps) {
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

	function handleLaunch() {
		if (cart.length === 0) return;
		launchOrder({
			tabId,
			tabOrderId,
			observacoes: observacoes || null,
			itens: cart.map(({ cartKey: _cartKey, ...item }) => item),
		});
	}

	const stageKey = stage.kind === "builder" ? `builder-${stage.product.id}` : stage.kind;

	return (
		<div className={cn("flex min-w-0 flex-col", className)}>
			<div
				key={stageKey}
				className={cn(
					"flex min-w-0 flex-1 flex-col animate-in fade-in-0 duration-200",
					directionRef.current === "forward" ? "slide-in-from-right-2" : "slide-in-from-left-2",
				)}
			>
				{stage.kind === "catalog" ? (
					<CatalogStage
						contextLabel={contextLabel}
						onExit={onExit}
						cartCount={cartCount}
						cartTotal={cartTotal}
						cartQtyByProduct={cartQtyByProduct}
						simpleCart={cart}
						onProductTap={handleProductTap}
						onChangeSimpleQuantity={changeQuantity}
						onReview={() => goTo({ kind: "review" }, "forward")}
					/>
				) : null}

				{stage.kind === "builder" ? (
					<BuilderStage
						product={stage.product}
						onBack={() => goTo({ kind: "catalog" }, "back")}
						onConfirm={(item) => {
							addItem(item);
							goTo({ kind: "catalog" }, "back");
						}}
					/>
				) : null}

				{stage.kind === "review" ? (
					<ReviewStage
						cart={cart}
						cartTotal={cartTotal}
						observacoes={observacoes}
						setObservacoes={setObservacoes}
						launchPending={launchPending}
						onBack={() => goTo({ kind: "catalog" }, "back")}
						onChangeQuantity={changeQuantity}
						onLaunch={handleLaunch}
					/>
				) : null}
			</div>
		</div>
	);
}

// ============================================================================
// Header de volta compartilhado (padrão AddFilter: contexto à esquerda, morph
// de volta com um toque)
// ============================================================================

function StageBackHeader({ label, context, onBack, className }: { label: string; context?: string; onBack: () => void; className?: string }) {
	return (
		<button
			type="button"
			onClick={onBack}
			className={cn(
				"flex h-11 w-fit items-center gap-1.5 rounded-lg pr-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-primary",
				className,
			)}
		>
			<ChevronLeft className="size-4 text-muted-foreground" />
			{context ? <span className="text-xs font-medium text-muted-foreground">{context}</span> : null}
			<span className="truncate text-sm font-bold tracking-tight">{label}</span>
		</button>
	);
}

// ============================================================================
// Estágio: catálogo
// ============================================================================

type CatalogStageProps = {
	contextLabel: string;
	onExit: () => void;
	cartCount: number;
	cartTotal: number;
	cartQtyByProduct: Map<string, number>;
	simpleCart: TCartItem[];
	onProductTap: (product: TBuilderProduct) => void;
	onChangeSimpleQuantity: (cartKey: string, delta: number) => void;
	onReview: () => void;
};

function CatalogStage({
	contextLabel,
	onExit,
	cartCount,
	cartTotal,
	cartQtyByProduct,
	simpleCart,
	onProductTap,
	onChangeSimpleQuantity,
	onReview,
}: CatalogStageProps) {
	// Canal COMANDA: o pedido da mesa exibe e cobra o preço do canal, venha do QR ou do operador.
	const { data: productsResult, filters, updateFilters, isLoading } = usePOSProducts({ initialFilters: { channel: "COMANDA" } });
	const { data: groupsResult } = usePOSGroups({ channel: "COMANDA" });
	const { data: topProductsResult } = usePOSTopProducts({ channel: "COMANDA" });

	const groups = groupsResult?.groups ?? [];
	const products = productsResult?.products ?? [];
	const totalPages = productsResult?.totalPages ?? 1;
	const currentPage = productsResult?.currentPage ?? 1;
	const showTopStrip = !filters.search && !filters.group && currentPage === 1 && (topProductsResult?.products?.length ?? 0) > 0;

	// Linha de item simples já no carrinho (sem variante/modificador) — vira stepper inline.
	function simpleCartItemFor(productId: string) {
		return simpleCart.find((item) => item.cartKey === `${productId}::`);
	}

	return (
		<div className="flex min-w-0 flex-col gap-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1">
					<Button size="icon" variant="ghost" className="size-9 lg:hidden" aria-label="Voltar para a conta" onClick={onExit}>
						<ChevronLeft className="size-5" />
					</Button>
					<h2 className="truncate text-sm font-extrabold uppercase tracking-[0.08em]">
						Lançar pedido
						<span className="ml-1.5 font-semibold normal-case tracking-normal text-muted-foreground lg:hidden">· {contextLabel}</span>
					</h2>
				</div>
				{cartCount > 0 ? (
					<span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-primary">
						{cartCount} {cartCount === 1 ? "item" : "itens"}
					</span>
				) : null}
			</div>

			{/* Busca fixa: continua à mão com a lista longa */}
			<div className="sticky top-2 z-10">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={filters.search ?? ""}
						placeholder="Buscar produto ou código..."
						onChange={(event) => updateFilters({ search: event.target.value })}
						className="h-11 rounded-xl border-border bg-background pl-9 pr-9 shadow-sm"
					/>
					{filters.search ? (
						<button
							type="button"
							aria-label="Limpar busca"
							className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
							onClick={() => updateFilters({ search: "" })}
						>
							<X className="size-4" />
						</button>
					) : null}
				</div>
			</div>

			{/* Grupos */}
			{groups.length > 0 ? (
				<div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
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

			{/* Mais pedidos — acesso rápido aos itens corriqueiros */}
			{showTopStrip ? (
				<div className="flex flex-col gap-1.5">
					<span className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
						<Flame className="size-3" />
						Mais pedidos
					</span>
					<div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
						{(topProductsResult?.products ?? []).map((product) => (
							<button
								key={product.id}
								type="button"
								className="flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-xl p-1 text-center transition-colors hover:bg-secondary/60 active:bg-secondary"
								onClick={() => onProductTap(product)}
							>
								<ProductThumb
									src={product.imagemCapaUrl}
									name={product.nome}
									className="size-14 rounded-xl"
									sizes="56px"
									badgeCount={cartQtyByProduct.get(product.id)}
								/>
								<span className="line-clamp-2 w-full text-[10px] font-semibold leading-tight">{product.nome}</span>
							</button>
						))}
					</div>
				</div>
			) : null}

			{/* Lista de produtos */}
			<div className="flex min-w-0 flex-col">
				{isLoading && products.length === 0 ? (
					<div className="flex flex-col gap-2 py-1">
						{Array.from({ length: 6 }).map((_, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: lista estática de skeletons
							<div key={index} className="flex items-center gap-3 px-1 py-1.5">
								<Skeleton className="size-11 rounded-lg" />
								<div className="flex flex-1 flex-col gap-1.5">
									<Skeleton className="h-3.5 w-2/3" />
									<Skeleton className="h-3 w-16" />
								</div>
							</div>
						))}
					</div>
				) : null}

				{!isLoading && products.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-10 text-center">
						<Search className="size-6 text-muted-foreground" />
						<p className="text-sm font-semibold">Nenhum produto encontrado{filters.search ? ` para "${filters.search}"` : ""}.</p>
						{filters.search || filters.group ? (
							<Button size="sm" variant="outline" onClick={() => updateFilters({ search: "", group: null })}>
								LIMPAR FILTROS
							</Button>
						) : (
							<p className="max-w-xs text-xs text-muted-foreground">Cadastre produtos ativos para lançá-los nos pedidos da conta.</p>
						)}
					</div>
				) : null}

				{products.map((product) => {
					const complex = isComplexProduct(product);
					const simpleItem = complex ? undefined : simpleCartItemFor(product.id);
					const productCartQty = cartQtyByProduct.get(product.id) ?? 0;
					const priceLabel =
						complex && product.variantes.length > 0 && product.precoVenda == null
							? `a partir de ${formatToMoney(product.variantes[0].precoVenda)}`
							: formatToMoney(product.precoVenda ?? product.variantes[0]?.precoVenda ?? 0);

					return (
						<div key={product.id} className="flex items-center gap-3 border-b border-border/60 py-2 last:border-b-0">
							<button
								type="button"
								className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-colors active:bg-secondary/50"
								onClick={() => onProductTap(product)}
							>
								<ProductThumb
									src={product.imagemCapaUrl}
									name={product.nome}
									className="size-11 rounded-lg"
									sizes="44px"
									badgeCount={complex ? productCartQty : undefined}
								/>
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="truncate text-sm font-semibold tracking-tight">{product.nome}</span>
									<span className="text-xs font-bold tabular-nums text-muted-foreground">
										{priceLabel}
										{complex ? <span className="ml-1.5 font-medium text-primary">· personalizável</span> : null}
									</span>
								</div>
							</button>

							{complex ? (
								<Button
									size="icon"
									variant="outline"
									className="size-9 shrink-0 rounded-lg"
									aria-label={`Montar ${product.nome}`}
									onClick={() => onProductTap(product)}
								>
									<SlidersHorizontal className="size-4" />
								</Button>
							) : simpleItem ? (
								<div className="flex shrink-0 items-center gap-1.5">
									<Button
										size="icon"
										variant="outline"
										className="size-9 rounded-lg"
										aria-label={`Remover 1 ${product.nome}`}
										onClick={() => onChangeSimpleQuantity(simpleItem.cartKey, -1)}
									>
										<Minus className="size-3.5" />
									</Button>
									<span className="w-5 text-center text-sm font-black tabular-nums">{simpleItem.quantidade}</span>
									<Button
										size="icon"
										className="size-9 rounded-lg"
										aria-label={`Adicionar 1 ${product.nome}`}
										onClick={() => onChangeSimpleQuantity(simpleItem.cartKey, 1)}
									>
										<Plus className="size-3.5" />
									</Button>
								</div>
							) : (
								<Button
									size="icon"
									variant="outline"
									className="size-9 shrink-0 rounded-lg"
									aria-label={`Adicionar ${product.nome}`}
									onClick={() => onProductTap(product)}
								>
									<Plus className="size-4" />
								</Button>
							)}
						</div>
					);
				})}

				{totalPages > 1 ? (
					<div className="flex items-center justify-center gap-3 py-3">
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

			{/* Barra do carrinho — zona do polegar */}
			{cartCount > 0 ? (
				<div className="sticky bottom-4 z-20 pt-1">
					<button
						type="button"
						className="flex h-12 w-full items-center justify-between rounded-2xl bg-primary px-4 text-primary-foreground shadow-[0_10px_22px_-6px_rgba(36,84,156,0.38),0_3px_6px_rgba(36,84,156,0.22)] transition-transform active:scale-[0.99]"
						onClick={onReview}
					>
						<span className="flex items-center gap-2 text-sm font-bold">
							<ShoppingBasket className="size-4" />
							{cartCount} {cartCount === 1 ? "item" : "itens"} · {formatToMoney(cartTotal)}
						</span>
						<span className="flex items-center gap-0.5 text-sm font-extrabold">
							REVISAR
							<ChevronRight className="size-4" />
						</span>
					</button>
				</div>
			) : null}
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
				active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
			)}
			onClick={onClick}
		>
			{label}
		</button>
	);
}

function ProductThumb({
	src,
	name,
	className,
	sizes,
	badgeCount,
}: {
	src: string | null;
	name: string;
	className?: string;
	sizes: string;
	badgeCount?: number;
}) {
	return (
		<span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden bg-secondary/60", className)}>
			{src ? (
				<Image src={src} alt="" fill sizes={sizes} className="object-cover" />
			) : (
				<span aria-hidden className="text-sm font-black uppercase text-muted-foreground/70">
					{name.trim().charAt(0)}
				</span>
			)}
			{badgeCount ? (
				<span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black tabular-nums text-primary-foreground">
					{badgeCount}
				</span>
			) : null}
		</span>
	);
}

// ============================================================================
// Estágio: montagem (variantes + adicionais)
// ============================================================================

function BuilderStage({ product, onBack, onConfirm }: { product: TBuilderProduct; onBack: () => void; onConfirm: (item: TBuiltOrderItem) => void }) {
	const builder = useProductBuilder({ product });

	function handleConfirm() {
		const item = builder.buildItem();
		if (!item) {
			if (builder.blockReason) toast.error(builder.blockReason);
			return;
		}
		onConfirm(item);
	}

	return (
		<div className="flex min-w-0 flex-col gap-4">
			<StageBackHeader context="Catálogo" label={product.nome} onBack={onBack} />

			<ProductBuilderForm product={product} builder={builder} showFooter={false} />

			{/* Quantidade + confirmação na zona do polegar (padrão iFood/PDV) */}
			<div className="sticky bottom-4 z-20 flex flex-col gap-1.5 pt-1">
				{builder.blockReason ? (
					<p className="rounded-xl border border-border bg-background px-3 py-1.5 text-center text-xs font-medium text-destructive shadow-sm">
						{builder.blockReason}
					</p>
				) : null}
				<div className="flex items-center gap-2">
					<div className="flex h-12 shrink-0 items-center rounded-2xl border border-border bg-background px-1.5 shadow-sm">
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
						className="h-12 flex-1 rounded-2xl text-sm font-extrabold shadow-[0_10px_22px_-6px_rgba(36,84,156,0.38),0_3px_6px_rgba(36,84,156,0.22)] disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
						disabled={!builder.canConfirm}
						onClick={handleConfirm}
					>
						ADICIONAR · {formatToMoney(builder.finalPrice)}
					</Button>
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// Estágio: revisão e envio
// ============================================================================

type ReviewStageProps = {
	cart: TCartItem[];
	cartTotal: number;
	observacoes: string;
	setObservacoes: (value: string) => void;
	launchPending: boolean;
	onBack: () => void;
	onChangeQuantity: (cartKey: string, delta: number) => void;
	onLaunch: () => void;
};

function ReviewStage({ cart, cartTotal, observacoes, setObservacoes, launchPending, onBack, onChangeQuantity, onLaunch }: ReviewStageProps) {
	return (
		<div className="flex min-w-0 flex-col gap-4">
			<StageBackHeader context="Catálogo" label="Revisar pedido" onBack={onBack} />

			{cart.length === 0 ? (
				<div className="flex flex-col items-center gap-2 py-10 text-center">
					<ShoppingBasket className="size-6 text-muted-foreground" />
					<p className="text-sm font-semibold">O pedido ficou vazio.</p>
					<Button size="sm" variant="outline" onClick={onBack}>
						VOLTAR AO CATÁLOGO
					</Button>
				</div>
			) : (
				<>
					<div className="flex flex-col">
						{cart.map((item) => (
							<div key={item.cartKey} className="flex items-start gap-3 border-b border-border/60 py-2.5 last:border-b-0">
								<ProductThumb src={item.imagemUrl ?? null} name={item.nome} className="size-11 rounded-lg" sizes="44px" />
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="text-sm font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">{item.nome}</span>
									{item.modificadores.length > 0 ? (
										<span className="text-xs text-muted-foreground">
											{item.modificadores.map((modifier) => `${modifier.quantidade}x ${modifier.nome}`).join(" · ")}
										</span>
									) : null}
									{item.observacoes ? <span className="text-xs italic text-muted-foreground [overflow-wrap:anywhere]">{item.observacoes}</span> : null}
									<span className="text-xs font-bold tabular-nums">{formatToMoney(item.valorTotalLiquido)}</span>
								</div>
								<ProductBuilderStepper
									value={item.quantidade}
									size="sm"
									className="shrink-0 pt-0.5"
									onDecrement={() => onChangeQuantity(item.cartKey, -1)}
									onIncrement={() => onChangeQuantity(item.cartKey, 1)}
								/>
							</div>
						))}
					</div>

					<TextInput
						label="OBSERVAÇÕES DO PEDIDO"
						value={observacoes}
						placeholder='Ex: "sem cebola", nome da pessoa da rodada'
						handleChange={setObservacoes}
					/>

					<div className="sticky bottom-4 z-20 pt-1">
						<Button
							size="lg"
							className="h-12 w-full rounded-2xl text-sm font-extrabold shadow-[0_10px_22px_-6px_rgba(36,84,156,0.38),0_3px_6px_rgba(36,84,156,0.22)]"
							disabled={launchPending}
							onClick={onLaunch}
						>
							<SendHorizonal className="size-4" />
							{launchPending ? "ENVIANDO..." : `ENVIAR PEDIDO · ${formatToMoney(cartTotal)}`}
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
