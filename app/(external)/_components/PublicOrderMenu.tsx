"use client";

import type { TCreatePublicTabOrderRequestInput, TCreatePublicTabOrderRequestOutput } from "@/app/api/public/tab-order-requests/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { CheckCheck, ChevronLeft, ChevronRight, Minus, Plus, Search, Send, ShoppingBasket, X } from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { usePublicOrderingDeviceKey } from "./use-public-ordering-device-key";

// ============================================================================
// Cardapio publico do QR (v1: produto/variante/quantidade), no mesmo padrao do
// TabOrderComposer: catalogo → revisao morfando no mesmo container. Os precos
// exibidos sao informativos — o payload envia apenas referencias + quantidade e
// a precificacao autoritativa acontece na aprovacao do operador.
// ============================================================================

export type TPublicMenuProduct = {
	id: string;
	nome: string;
	grupo: string;
	descricao: string | null;
	precoVenda: number | null;
	imagemCapaUrl: string | null;
	variantes: { id: string; nome: string; precoVenda: number }[];
};

type TPublicCartItem = {
	cartKey: string;
	produtoId: string;
	produtoVarianteId: string | null;
	nome: string;
	imagemUrl: string | null;
	precoUnitario: number;
	quantidade: number;
};

type TPublicCartEntry = Omit<TPublicCartItem, "quantidade">;

async function submitOrderRequest(input: TCreatePublicTabOrderRequestInput) {
	const { data } = await axios.post<TCreatePublicTabOrderRequestOutput>("/api/public/tab-order-requests", input);
	return data;
}

type PublicOrderMenuProps = {
	token: string;
	context: "PONTO" | "TAB";
	products: TPublicMenuProduct[];
	deviceKey?: string | null;
	linkedTabCode?: string | null;
	onSubmitted?: () => void;
};

export function PublicOrderMenu({ token, context, products, deviceKey: providedDeviceKey, linkedTabCode, onSubmitted }: PublicOrderMenuProps) {
	const localDeviceKey = usePublicOrderingDeviceKey();
	const deviceKey = providedDeviceKey ?? localDeviceKey;
	const [stage, setStage] = useState<"catalog" | "review">("catalog");
	const directionRef = useRef<"forward" | "back">("forward");
	const [search, setSearch] = useState("");
	const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
	const [cart, setCart] = useState<TPublicCartItem[]>([]);
	const [notes, setNotes] = useState("");
	const [tabCode, setTabCode] = useState("");
	// Status devolvido pela rota: no modo DIRETO o pedido ja saiu para a cozinha; nos demais
	// (ou quando o DIRETO caiu para o inbox) o cliente precisa saber que e espera, nao conclusao.
	const [submitted, setSubmitted] = useState<TCreatePublicTabOrderRequestOutput["data"]["status"] | null>(null);
	// Uma intencao de pedido = uma chave; retries reutilizam a mesma.
	const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

	function goTo(next: "catalog" | "review", direction: "forward" | "back") {
		directionRef.current = direction;
		setStage(next);
	}

	const { mutate, isPending } = useMutation({
		mutationKey: ["public-tab-order-request", idempotencyKey],
		mutationFn: submitOrderRequest,
		onSuccess: (data) => {
			toast.success(data.message);
			setSubmitted(data.data.status);
			setCart([]);
			setNotes("");
			setIdempotencyKey(crypto.randomUUID());
			goTo("catalog", "back");
			onSubmitted?.();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const cartTotal = cart.reduce((sum, item) => sum + item.precoUnitario * item.quantidade, 0);
	const cartCount = cart.reduce((sum, item) => sum + item.quantidade, 0);

	function changeQuantity(entry: TPublicCartEntry, delta: number) {
		setCart((prev) => {
			const existing = prev.find((item) => item.cartKey === entry.cartKey);
			if (!existing && delta > 0) return [...prev, { ...entry, quantidade: delta }];
			if (!existing) return prev;
			const quantidade = existing.quantidade + delta;
			if (quantidade <= 0) return prev.filter((item) => item.cartKey !== entry.cartKey);
			return prev.map((item) => (item.cartKey === entry.cartKey ? { ...item, quantidade } : item));
		});
	}

	function getQuantity(cartKey: string) {
		return cart.find((item) => item.cartKey === cartKey)?.quantidade ?? 0;
	}

	function handleSubmit() {
		if (cart.length === 0 || !deviceKey) return;
		mutate({
			token,
			context,
			idempotencyKey,
			deviceKey,
			notes: notes || null,
			tabCode: context === "PONTO" && !linkedTabCode ? tabCode.trim() || null : null,
			items: cart.map((item) => ({
				produtoId: item.produtoId,
				produtoVarianteId: item.produtoVarianteId,
				nome: item.nome,
				quantidade: item.quantidade,
			})),
		});
	}

	if (submitted) {
		const launched = submitted === "CONCLUIDA" || submitted === "APROVADA";
		return (
			<div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-10 text-center animate-in fade-in-0 zoom-in-95 duration-300">
				<div className="flex size-14 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
					<CheckCheck className="size-7" />
				</div>
				<p className="text-base font-black">{launched ? "Pedido na cozinha!" : "Pedido enviado!"}</p>
				<p className="max-w-xs text-xs text-muted-foreground">
					{launched ? "Seu pedido já foi lançado na conta e está em preparo." : "Sua solicitação foi enviada para aprovação do atendente."}
				</p>
				<Button size="sm" variant="secondary" onClick={() => setSubmitted(null)}>
					FAZER OUTRO PEDIDO
				</Button>
			</div>
		);
	}

	return (
		<div className="flex min-w-0 flex-col">
			<div
				key={stage}
				className={cn(
					"flex min-w-0 flex-col gap-3 animate-in fade-in-0 duration-200",
					directionRef.current === "forward" ? "slide-in-from-right-2" : "slide-in-from-left-2",
				)}
			>
				{stage === "catalog" ? (
					<CatalogStage
						products={products}
						search={search}
						setSearch={setSearch}
						selectedGroup={selectedGroup}
						setSelectedGroup={setSelectedGroup}
						getQuantity={getQuantity}
						changeQuantity={changeQuantity}
						cartCount={cartCount}
						cartTotal={cartTotal}
						onReview={() => goTo("review", "forward")}
					/>
				) : (
					<ReviewStage
						cart={cart}
						cartTotal={cartTotal}
						notes={notes}
						setNotes={setNotes}
						tabCode={tabCode}
						setTabCode={setTabCode}
						showTabCode={context === "PONTO" && !linkedTabCode}
						deviceKeyReady={Boolean(deviceKey)}
						isPending={isPending}
						onBack={() => goTo("catalog", "back")}
						onChangeQuantity={changeQuantity}
						onSubmit={handleSubmit}
					/>
				)}
			</div>
		</div>
	);
}

// ============================================================================
// Estágio: catálogo
// ============================================================================

type CatalogStageProps = {
	products: TPublicMenuProduct[];
	search: string;
	setSearch: (value: string) => void;
	selectedGroup: string | null;
	setSelectedGroup: (value: string | null) => void;
	getQuantity: (cartKey: string) => number;
	changeQuantity: (entry: TPublicCartEntry, delta: number) => void;
	cartCount: number;
	cartTotal: number;
	onReview: () => void;
};

function CatalogStage({
	products,
	search,
	setSearch,
	selectedGroup,
	setSelectedGroup,
	getQuantity,
	changeQuantity,
	cartCount,
	cartTotal,
	onReview,
}: CatalogStageProps) {
	const groups = useMemo(() => {
		const set = new Set<string>();
		for (const product of products) set.add(product.grupo || "Outros");
		return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
	}, [products]);

	const sections = useMemo(() => {
		const term = search.trim().toLowerCase();
		const byGroup = new Map<string, TPublicMenuProduct[]>();
		for (const product of products) {
			const group = product.grupo || "Outros";
			if (selectedGroup && group !== selectedGroup) continue;
			if (term && !product.nome.toLowerCase().includes(term)) continue;
			const list = byGroup.get(group) ?? [];
			list.push(product);
			byGroup.set(group, list);
		}
		return [...byGroup.entries()]
			.sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
			.map(([group, groupProducts]) => ({
				group,
				products: [...groupProducts].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
			}));
	}, [products, search, selectedGroup]);

	const isFiltering = Boolean(search.trim() || selectedGroup);

	return (
		<>
			{/* Busca + grupos fixos: continuam à mão com a lista longa */}
			<div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 bg-background/95 px-4 py-2 backdrop-blur-sm">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						placeholder="Pesquisar no cardápio..."
						onChange={(event) => setSearch(event.target.value)}
						className="h-11 rounded-xl border-border bg-background pl-9 pr-9 shadow-sm"
					/>
					{search ? (
						<button
							type="button"
							aria-label="Limpar busca"
							className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
							onClick={() => setSearch("")}
						>
							<X className="size-4" />
						</button>
					) : null}
				</div>

				{groups.length > 1 ? (
					<div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
						<GroupChip label="Todos" active={!selectedGroup} onClick={() => setSelectedGroup(null)} />
						{groups.map((group) => (
							<GroupChip
								key={group}
								label={group}
								active={selectedGroup === group}
								onClick={() => setSelectedGroup(selectedGroup === group ? null : group)}
							/>
						))}
					</div>
				) : null}
			</div>

			{sections.map((section) => (
				<section key={section.group} className="flex flex-col gap-2">
					<div className="flex w-fit items-center rounded bg-brand px-2 py-1 text-brand-foreground">
						<h2 className="text-xs font-medium uppercase tracking-wide">{section.group}</h2>
					</div>
					{section.products.map((product) =>
						product.variantes.length > 0 ? (
							<VariantProductCard key={product.id} product={product} getQuantity={getQuantity} changeQuantity={changeQuantity} />
						) : (
							<SimpleProductRow key={product.id} product={product} getQuantity={getQuantity} changeQuantity={changeQuantity} />
						),
					)}
				</section>
			))}

			{sections.length === 0 ? (
				<div className="flex flex-col items-center gap-2 py-10 text-center">
					<Search className="size-6 text-muted-foreground" />
					<p className="text-sm font-semibold">Nenhum item encontrado.</p>
					{isFiltering ? (
						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								setSearch("");
								setSelectedGroup(null);
							}}
						>
							LIMPAR FILTROS
						</Button>
					) : null}
				</div>
			) : null}

			{/* Barra do carrinho — zona do polegar */}
			{cartCount > 0 ? (
				<div className="sticky bottom-4 z-20 pt-1">
					<button
						type="button"
						className="flex h-12 w-full items-center justify-between rounded-2xl bg-primary px-4 text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-[0.99]"
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
		</>
	);
}

function SimpleProductRow({
	product,
	getQuantity,
	changeQuantity,
}: {
	product: TPublicMenuProduct;
	getQuantity: (cartKey: string) => number;
	changeQuantity: (entry: TPublicCartEntry, delta: number) => void;
}) {
	const entry: TPublicCartEntry = {
		cartKey: `${product.id}:`,
		produtoId: product.id,
		produtoVarianteId: null,
		nome: product.nome,
		imagemUrl: product.imagemCapaUrl,
		precoUnitario: product.precoVenda ?? 0,
	};

	return (
		<div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
			<ProductThumb src={product.imagemCapaUrl} name={product.nome} className="size-14 rounded-lg" sizes="56px" />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate text-sm font-semibold tracking-tight">{product.nome}</span>
				{product.descricao ? <span className="line-clamp-1 text-xs text-muted-foreground">{product.descricao}</span> : null}
				<span className="text-xs font-black tabular-nums text-primary">{formatToMoney(product.precoVenda ?? 0)}</span>
			</div>
			<QuantityControl
				name={product.nome}
				quantity={getQuantity(entry.cartKey)}
				onAdd={() => changeQuantity(entry, 1)}
				onRemove={() => changeQuantity(entry, -1)}
			/>
		</div>
	);
}

function VariantProductCard({
	product,
	getQuantity,
	changeQuantity,
}: {
	product: TPublicMenuProduct;
	getQuantity: (cartKey: string) => number;
	changeQuantity: (entry: TPublicCartEntry, delta: number) => void;
}) {
	const lowestPrice = Math.min(...product.variantes.map((variant) => variant.precoVenda));

	return (
		<div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
			<div className="flex items-center gap-3 p-2.5">
				<ProductThumb src={product.imagemCapaUrl} name={product.nome} className="size-14 rounded-lg" sizes="56px" />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="truncate text-sm font-semibold tracking-tight">{product.nome}</span>
					{product.descricao ? <span className="line-clamp-1 text-xs text-muted-foreground">{product.descricao}</span> : null}
					<span className="text-xs font-black tabular-nums text-primary">a partir de {formatToMoney(lowestPrice)}</span>
				</div>
			</div>
			<div className="flex flex-col divide-y divide-border/60 border-t border-border/60">
				{product.variantes.map((variant) => {
					const entry: TPublicCartEntry = {
						cartKey: `${product.id}:${variant.id}`,
						produtoId: product.id,
						produtoVarianteId: variant.id,
						nome: `${product.nome} — ${variant.nome}`,
						imagemUrl: product.imagemCapaUrl,
						precoUnitario: variant.precoVenda,
					};
					return (
						<div key={variant.id} className="flex items-center justify-between gap-2 py-2 pl-3 pr-2.5">
							<div className="flex min-w-0 flex-col">
								<span className="truncate text-sm font-medium tracking-tight">{variant.nome}</span>
								<span className="text-xs font-bold tabular-nums text-muted-foreground">{formatToMoney(variant.precoVenda)}</span>
							</div>
							<QuantityControl
								name={entry.nome}
								quantity={getQuantity(entry.cartKey)}
								onAdd={() => changeQuantity(entry, 1)}
								onRemove={() => changeQuantity(entry, -1)}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ============================================================================
// Estágio: revisão e envio
// ============================================================================

type ReviewStageProps = {
	cart: TPublicCartItem[];
	cartTotal: number;
	notes: string;
	setNotes: (value: string) => void;
	tabCode: string;
	setTabCode: (value: string) => void;
	showTabCode: boolean;
	deviceKeyReady: boolean;
	isPending: boolean;
	onBack: () => void;
	onChangeQuantity: (entry: TPublicCartEntry, delta: number) => void;
	onSubmit: () => void;
};

function ReviewStage({
	cart,
	cartTotal,
	notes,
	setNotes,
	tabCode,
	setTabCode,
	showTabCode,
	deviceKeyReady,
	isPending,
	onBack,
	onChangeQuantity,
	onSubmit,
}: ReviewStageProps) {
	return (
		<>
			<button
				type="button"
				onClick={onBack}
				className="flex h-11 w-fit items-center gap-1.5 rounded-lg pr-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-primary"
			>
				<ChevronLeft className="size-4 text-muted-foreground" />
				<span className="text-xs font-medium text-muted-foreground">Cardápio</span>
				<span className="truncate text-sm font-bold tracking-tight">Revisar pedido</span>
			</button>

			{cart.length === 0 ? (
				<div className="flex flex-col items-center gap-2 py-10 text-center">
					<ShoppingBasket className="size-6 text-muted-foreground" />
					<p className="text-sm font-semibold">O pedido ficou vazio.</p>
					<Button size="sm" variant="outline" onClick={onBack}>
						VOLTAR AO CARDÁPIO
					</Button>
				</div>
			) : (
				<>
					<div className="flex flex-col rounded-xl border border-border bg-card px-3">
						{cart.map((item) => (
							<div key={item.cartKey} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
								<ProductThumb src={item.imagemUrl} name={item.nome} className="size-11 rounded-lg" sizes="44px" />
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="text-sm font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">{item.nome}</span>
									<span className="text-xs font-bold tabular-nums">{formatToMoney(item.precoUnitario * item.quantidade)}</span>
								</div>
								<QuantityControl
									name={item.nome}
									quantity={item.quantidade}
									onAdd={() => onChangeQuantity(item, 1)}
									onRemove={() => onChangeQuantity(item, -1)}
								/>
							</div>
						))}
					</div>

					<label className="flex flex-col gap-1.5">
						<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Observações do pedido</span>
						<Input value={notes} placeholder='Ex: "sem cebola"' onChange={(event) => setNotes(event.target.value)} className="h-11 rounded-xl" />
					</label>

					{showTabCode ? (
						<label className="flex flex-col gap-1.5">
							<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Número da sua comanda (opcional)</span>
							<Input value={tabCode} maxLength={100} placeholder="Ex: 24" onChange={(event) => setTabCode(event.target.value)} className="h-11 rounded-xl" />
							<span className="text-[0.68rem] text-muted-foreground">Ajuda o atendente a direcionar seu primeiro pedido.</span>
						</label>
					) : null}

					<p className="text-center text-[0.68rem] text-muted-foreground">Os valores são informativos — a solicitação será confirmada pelo atendente.</p>

					<div className="sticky bottom-4 z-20 pt-1">
						<Button
							size="lg"
							className="h-12 w-full rounded-2xl text-sm font-extrabold shadow-lg shadow-primary/30"
							disabled={isPending || !deviceKeyReady}
							onClick={onSubmit}
						>
							<Send className="size-4" />
							{isPending ? "ENVIANDO..." : deviceKeyReady ? `ENVIAR PEDIDO · ${formatToMoney(cartTotal)}` : "PREPARANDO..."}
						</Button>
					</div>
				</>
			)}
		</>
	);
}

// ============================================================================
// Blocos compartilhados
// ============================================================================

function GroupChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			aria-pressed={active}
			className={cn(
				"h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-bold transition-colors",
				active ? "bg-brand text-brand-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
			)}
			onClick={onClick}
		>
			{label}
		</button>
	);
}

function QuantityControl({ name, quantity, onAdd, onRemove }: { name: string; quantity: number; onAdd: () => void; onRemove: () => void }) {
	if (quantity === 0) {
		return (
			<Button size="icon" variant="outline" className="size-9 shrink-0 rounded-lg" aria-label={`Adicionar ${name}`} onClick={onAdd}>
				<Plus className="size-4" />
			</Button>
		);
	}
	return (
		<div className="flex shrink-0 items-center gap-1.5">
			<Button size="icon" variant="outline" className="size-9 rounded-lg" aria-label={`Remover 1 ${name}`} onClick={onRemove}>
				<Minus className="size-3.5" />
			</Button>
			<span className="w-5 text-center text-sm font-black tabular-nums">{quantity}</span>
			<Button size="icon" className="size-9 rounded-lg" aria-label={`Adicionar 1 ${name}`} onClick={onAdd}>
				<Plus className="size-3.5" />
			</Button>
		</div>
	);
}

function ProductThumb({ src, name, className, sizes }: { src: string | null; name: string; className?: string; sizes: string }) {
	return (
		<span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden bg-secondary/60", className)}>
			{src ? (
				<Image src={src} alt="" fill sizes={sizes} className="object-cover" />
			) : (
				<span aria-hidden className="text-sm font-black uppercase text-muted-foreground/70">
					{name.trim().charAt(0)}
				</span>
			)}
		</span>
	);
}
