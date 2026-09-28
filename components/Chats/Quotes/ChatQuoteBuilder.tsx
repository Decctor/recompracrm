"use client";

import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { createQuote } from "@/lib/mutations/sales";
import { usePOSProducts } from "@/lib/queries/pos";
import { getClientOpenQuotesQueryKey } from "@/lib/queries/sales";
import { cn } from "@/lib/utils";
import { appRoutes } from "@/lib/navigation/routes";
import { useInternalQuoteState } from "@/state-hooks/use-internal-quote-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, Minus, Package, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Construtor de orçamento do hub.
 *
 * O que ele deliberadamente NÃO tem: desconto, cupom, cashback, recompensa, entrega, pagamento e
 * vendedor. Cada um exige autorização, caixa aberto ou endereço e vive no checkout — o orçamento é o
 * artefato de pré-negociação que o atendente manda pelo WhatsApp em um minuto.
 *
 * A elegibilidade dos itens espelha `resolveSaleItems`, que é a autoridade: produto sem preço de
 * venda e produto com escolhas adicionais são recusados. Desabilitar aqui evita que o operador monte
 * uma lista inteira para descobrir o bloqueio no envio.
 */

type TPOSProduct = TGetPOSProductsOutput["data"]["products"][number];
type TPOSVariant = TPOSProduct["variantes"][number];

type ChatQuoteBuilderProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	clientId: string;
	chatId: string;
	clientName: string;
	/** Ausente quando a conversa não aceita mensagem agora (sem posse ou fora da janela de 24h). */
	onInsertInConversation?: (quote: { orcamentoId: string; valorTotal: number; itens: TCreatedQuoteItem[] }) => void;
};

type TCreatedQuoteItem = { nome: string; variacao: string | null; quantidade: number; preco: number; total: number };
type TCreatedQuote = { orcamentoId: string; valorTotal: number; itens: TCreatedQuoteItem[] };

/**
 * Espelha a checagem de `resolveSaleItems`: referência de adicional com `produtoVarianteId` nulo
 * bloqueia o produto inteiro (inclusive suas variações); referência escopada bloqueia só a variação.
 */
function hasProductWideAddOns(product: TPOSProduct) {
	return product.addOnsReferencias.some((reference) => reference.produtoVarianteId === null);
}

function resolveEligibility({ preco, blocked }: { preco: number | null; blocked: boolean }) {
	if (blocked) return { eligible: false as const, reason: "Precisa de escolhas adicionais" };
	if (preco == null) return { eligible: false as const, reason: "Sem preço de venda" };
	return { eligible: true as const, reason: null };
}

function ProductThumbnail({ src, name }: { src: string | null; name: string }) {
	return (
		<Avatar className="size-8 shrink-0 rounded-md border border-border bg-muted">
			<AvatarImage src={src ?? undefined} alt={name} className="object-cover" />
			<AvatarFallback className="rounded-md">
				<Package className="size-3.5 text-muted-foreground" />
			</AvatarFallback>
		</Avatar>
	);
}

function CatalogRow({
	nome,
	codigo,
	imagemUrl,
	preco,
	blocked,
	indented,
	onAdd,
}: {
	nome: string;
	codigo: string;
	imagemUrl: string | null;
	preco: number | null;
	blocked: boolean;
	indented?: boolean;
	onAdd: () => void;
}) {
	const { eligible, reason } = resolveEligibility({ preco, blocked });

	return (
		<div className={cn("flex items-center gap-2 px-2.5 py-2", indented && "pl-8")}>
			<ProductThumbnail src={imagemUrl} name={nome} />
			<div className="min-w-0 flex-1">
				<p className="truncate text-xs font-semibold">{nome}</p>
				<p className="truncate text-[10px] text-muted-foreground">
					{eligible ? (
						<>
							{codigo} · <span className="tabular-nums">{formatToMoney(preco ?? 0)}</span>
						</>
					) : (
						reason
					)}
				</p>
			</div>
			<Button
				variant="ghost"
				size="icon-sm"
				className="shrink-0"
				disabled={!eligible}
				onClick={onAdd}
				aria-label={eligible ? `Adicionar ${nome} ao orçamento` : `${nome}: ${reason}`}
			>
				<Plus className="size-3.5" />
			</Button>
		</div>
	);
}

function CatalogProduct({
	product,
	onAddProduct,
	onAddVariant,
}: {
	product: TPOSProduct;
	onAddProduct: (product: TPOSProduct) => void;
	onAddVariant: (product: TPOSProduct, variant: TPOSVariant) => void;
}) {
	const productWideAddOns = hasProductWideAddOns(product);
	const hasVariants = product.variantes.length > 0;

	// Variações expandem na própria lista: um modal dentro de um sheet é uma camada a mais para
	// escolher entre duas linhas.
	if (hasVariants) {
		return (
			<div className="flex flex-col">
				<div className="flex items-center gap-2 bg-muted/40 px-2.5 py-1.5">
					<ProductThumbnail src={product.imagemCapaUrl} name={product.nome} />
					<div className="min-w-0 flex-1">
						<p className="truncate text-xs font-semibold">{product.nome}</p>
						<p className="text-[10px] text-muted-foreground">
							{product.variantes.length} {product.variantes.length === 1 ? "variação" : "variações"}
						</p>
					</div>
				</div>
				{product.variantes.map((variant) => (
					<CatalogRow
						key={variant.id}
						nome={variant.nome}
						codigo={variant.codigo || product.codigo}
						imagemUrl={variant.imagemCapaUrl || product.imagemCapaUrl}
						preco={variant.precoVenda ?? product.precoVenda}
						blocked={productWideAddOns || variant.addOnsReferencias.length > 0}
						indented
						onAdd={() => onAddVariant(product, variant)}
					/>
				))}
			</div>
		);
	}

	return (
		<CatalogRow
			nome={product.nome}
			codigo={product.codigo}
			imagemUrl={product.imagemCapaUrl}
			preco={product.precoVenda}
			blocked={productWideAddOns}
			onAdd={() => onAddProduct(product)}
		/>
	);
}

export function ChatQuoteBuilder({ open, onOpenChange, clientId, chatId, clientName, onInsertInConversation }: ChatQuoteBuilderProps) {
	const queryClient = useQueryClient();
	const isMobile = useIsMobile();
	const [search, setSearch] = useState("");
	const [createdQuote, setCreatedQuote] = useState<TCreatedQuote | null>(null);
	const quoteState = useInternalQuoteState();

	const { data: catalog, isPending: isCatalogPending, isError: isCatalogError, error: catalogError, updateFilters } = usePOSProducts();

	const { mutate: create, isPending: isCreating } = useMutation({
		mutationKey: ["create-quote", clientId],
		mutationFn: createQuote,
		onSuccess: (response) => {
			toast.success(response.message);
			setCreatedQuote(response.data);
			void queryClient.invalidateQueries({ queryKey: getClientOpenQuotesQueryKey(clientId) });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function handleSearchChange(value: string) {
		setSearch(value);
		updateFilters({ search: value ? [value] : [], page: 1 });
	}

	function handleClose(nextOpen: boolean) {
		onOpenChange(nextOpen);
		if (nextOpen) return;
		// Fechar encerra o rascunho: reabrir com uma lista antiga já enviada é pior que recomeçar.
		setCreatedQuote(null);
		setSearch("");
		quoteState.resetState();
	}

	return (
		<Sheet open={open} onOpenChange={handleClose}>
			{/* Gaveta lateral no desktop, folha inferior no mobile — as duas variantes do próprio Sheet,
			    em vez de forçar a lateral a virar inferior com overrides de posicionamento.
			    `sm:max-w-*` é necessário para vencer o teto de `max-w-sm` da variante `right`. */}
			<SheetContent
				side={isMobile ? "bottom" : "right"}
				className={cn(
					"flex flex-col gap-0 p-0",
					isMobile ? "h-[92dvh] rounded-t-2xl" : "w-[min(30rem,95vw)] sm:max-w-[min(30rem,95vw)]",
				)}
			>
				<SheetHeader className="shrink-0 border-b border-border p-4 text-left">
					<SheetTitle className="text-base font-black uppercase tracking-[0.02em]">Novo orçamento</SheetTitle>
					<SheetDescription className="text-xs">
						{createdQuote
							? "Orçamento registrado. Ele não reserva estoque."
							: `Para ${clientName}. Descontos, entrega e pagamento são definidos no checkout.`}
					</SheetDescription>
				</SheetHeader>

				{createdQuote ? (
					<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
						<div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 text-center">
							<div className="flex size-10 items-center justify-center rounded-full bg-success/15">
								<Check className="size-5 text-success" />
							</div>
							<p className="text-sm font-bold">Orçamento criado</p>
							<p className="text-2xl font-extrabold tabular-nums">{formatToMoney(createdQuote.valorTotal)}</p>
							<p className="text-[11px] text-muted-foreground">
								{createdQuote.itens.length} {createdQuote.itens.length === 1 ? "item" : "itens"} · não reserva estoque
							</p>
						</div>

						<div className="flex flex-col gap-2">
							{onInsertInConversation && (
								<Button
									onClick={() => {
										onInsertInConversation(createdQuote);
										handleClose(false);
									}}
								>
									Inserir na conversa
								</Button>
							)}
							<Button asChild variant="outline">
								<a href={appRoutes.sales.checkout(createdQuote.orcamentoId)} target="_blank" rel="noopener noreferrer">
									<ShoppingBag className="size-4" />
									Abrir checkout
									<ExternalLink className="size-3 opacity-60" />
									<span className="sr-only">abre em nova aba</span>
								</a>
							</Button>
							<Button
								variant="ghost"
								onClick={() => {
									setCreatedQuote(null);
									quoteState.resetState();
								}}
							>
								Montar outro
							</Button>
						</div>
					</div>
				) : (
					<>
						<div className="min-h-0 flex-1 overflow-y-auto p-4">
							<div className="flex flex-col gap-4">
								<div>
									<div className="relative">
										<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											value={search}
											onChange={(event) => handleSearchChange(event.target.value)}
											placeholder="Buscar produto por nome ou código..."
											className="pl-9"
											// eslint-disable-next-line jsx-a11y/no-autofocus
											autoFocus
										/>
									</div>

									<div className="mt-2">
										{isCatalogError ? (
											<p className="py-4 text-center text-xs text-destructive">{getErrorMessage(catalogError)}</p>
										) : isCatalogPending ? (
											<div className="flex flex-col gap-2 py-2">
												<Skeleton className="h-11 w-full" />
												<Skeleton className="h-11 w-full" />
												<Skeleton className="h-11 w-full" />
											</div>
										) : catalog && catalog.products.length > 0 ? (
											<div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
												{catalog.products.map((product) => (
													<CatalogProduct
														key={product.id}
														product={product}
														onAddProduct={(item) =>
															quoteState.addItem({
																produtoId: item.id,
																produtoVarianteId: null,
																nome: item.nome,
																variacao: null,
																codigo: item.codigo,
																imagemUrl: item.imagemCapaUrl,
																preco: item.precoVenda ?? 0,
															})
														}
														onAddVariant={(item, variant) =>
															quoteState.addItem({
																produtoId: item.id,
																produtoVarianteId: variant.id,
																nome: item.nome,
																variacao: variant.nome,
																codigo: variant.codigo || item.codigo,
																imagemUrl: variant.imagemCapaUrl || item.imagemCapaUrl,
																preco: variant.precoVenda ?? item.precoVenda ?? 0,
															})
														}
													/>
												))}
											</div>
										) : (
											<p className="py-4 text-center text-xs text-muted-foreground">
												{search ? `Nenhum produto para "${search}".` : "Nenhum produto ativo no catálogo."}
											</p>
										)}
									</div>
								</div>

								<div className="border-t border-border pt-3">
									<h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Itens do orçamento</h3>
									{quoteState.state.itens.length === 0 ? (
										<p className="py-4 text-center text-xs text-muted-foreground">Busque um produto para começar o orçamento.</p>
									) : (
										<ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
											{quoteState.state.itens.map((item) => (
												<li key={item.tempId} className="flex items-center gap-2 px-2.5 py-2">
													<div className="min-w-0 flex-1">
														<p className="truncate text-xs font-semibold">{item.nome}</p>
														<p className="truncate text-[10px] text-muted-foreground">
															{item.variacao ? `${item.variacao} · ` : ""}
															<span className="tabular-nums">{formatToMoney(item.preco)}</span> un.
														</p>
													</div>
													<div className="flex shrink-0 items-center gap-0.5">
														<Button
															variant="ghost"
															size="icon-sm"
															onClick={() => quoteState.updateItemQuantity(item.tempId, item.quantidade - 1)}
															aria-label={`Diminuir quantidade de ${item.nome}`}
														>
															<Minus className="size-3" />
														</Button>
														<span className="w-7 text-center text-xs font-bold tabular-nums">{item.quantidade}</span>
														<Button
															variant="ghost"
															size="icon-sm"
															onClick={() => quoteState.updateItemQuantity(item.tempId, item.quantidade + 1)}
															aria-label={`Aumentar quantidade de ${item.nome}`}
														>
															<Plus className="size-3" />
														</Button>
													</div>
													<span className="w-20 shrink-0 text-right text-xs font-bold tabular-nums">
														{formatToMoney(item.preco * item.quantidade)}
													</span>
													<Button
														variant="ghost"
														size="icon-sm"
														className="shrink-0 text-muted-foreground hover:text-destructive"
														onClick={() => quoteState.removeItem(item.tempId)}
														aria-label={`Remover ${item.nome} do orçamento`}
													>
														<Trash2 className="size-3" />
													</Button>
												</li>
											))}
										</ul>
									)}
									{quoteState.isAtItemLimit && (
										<p className="mt-1.5 text-[11px] text-muted-foreground">Limite de 50 itens por orçamento atingido.</p>
									)}
								</div>

								<div className="border-t border-border pt-3">
									<label
										htmlFor="quote-observacoes"
										className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground"
									>
										Observações
									</label>
									<Textarea
										id="quote-observacoes"
										value={quoteState.state.observacoes}
										onChange={(event) => quoteState.updateObservacoes(event.target.value.slice(0, 500))}
										placeholder="Prazo combinado, condição negociada, referência do pedido..."
										rows={2}
									/>
								</div>
							</div>
						</div>

						<div className="shrink-0 border-t border-border p-4">
							<div aria-live="polite" className="mb-3 flex items-baseline justify-between gap-2">
								<span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Total</span>
								<span className="text-xl font-extrabold tabular-nums">{formatToMoney(quoteState.valorTotal)}</span>
							</div>
							<Button
								className="w-full"
								disabled={!quoteState.isReadyForQuote || isCreating}
								onClick={() =>
									create({
										clientId,
										chatId,
										items: quoteState.catalogReferences,
										observations: quoteState.state.observacoes.trim() || null,
									})
								}
							>
								{isCreating ? <Loader2 className="size-4 animate-spin" /> : null}
								{isCreating ? "CRIANDO..." : "CRIAR ORÇAMENTO"}
							</Button>
							<p className="mt-2 text-center text-[11px] text-muted-foreground">O orçamento não reserva estoque nem confirma a venda.</p>
						</div>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
