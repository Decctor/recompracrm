import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import { Minus, Package, Plus, ShoppingCart, StickyNote, Trash2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { formatToMoney } from "@/lib/formatting";
import type { TCartItem } from "@/state-hooks/use-sale-state";

type ItemsSectionProps = {
	saleState: TUseSaleState;
};

export default function ItemsSection({ saleState }: ItemsSectionProps) {
	const itemCount = saleState.state.itens.length;

	return (
		<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<ShoppingCart className="w-4 h-4 text-foreground" />
					<h3 className="font-bold text-xs tracking-wide">ITENS</h3>
					{itemCount > 0 ? (
						<span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.65rem] font-bold text-primary-foreground tabular-nums">
							{itemCount}
						</span>
					) : null}
				</div>
				{itemCount > 0 ? (
					<Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-destructive hover:text-destructive" onClick={saleState.clearCart}>
						<Trash2 className="w-3 h-3" /> LIMPAR
					</Button>
				) : null}
			</div>
			{/* Sem scroller interno: o checkout inteiro já rola (coluna no desktop, Sheet no mobile).
			    Um segundo scroller aqui aninhava rolagens e, sem altura definida, vazava o conteúdo
			    por cima da seção de entrega. */}
			<div className="flex flex-col gap-2">
				{saleState.state.itens.map((item) => (
					<CartItemRow
						key={item.tempId}
						item={item}
						onUpdateQuantity={saleState.updateItemQuantity}
						onUpdateObservacoes={saleState.updateItemObservacoes}
						onRemove={saleState.removeItem}
					/>
				))}
				{itemCount === 0 ? (
					<div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border/70 py-6 text-center">
						<ShoppingCart className="h-5 w-5 text-muted-foreground/50" />
						<p className="text-xs font-medium text-muted-foreground">Nenhum item no carrinho.</p>
					</div>
				) : null}
			</div>
		</div>
	);
}

type CartItemRowProps = {
	item: TCartItem;
	onUpdateQuantity: (tempId: string, quantidade: number) => void;
	onUpdateObservacoes: (tempId: string, observacoes: string) => void;
	onRemove: (tempId: string) => void;
};

function CartItemRow({ item, onUpdateQuantity, onUpdateObservacoes, onRemove }: CartItemRowProps) {
	const hasDiscount = item.valorDesconto > 0;
	// Recompensa resgatada: quantidade fixa e sem remoção pelo carrinho. O débito de saldo já está
	// no ledger — desfazê-lo exige remover a recompensa no resumo (venda em edição: cancelar).
	const isReward = !!item.recompensaId;
	// O campo fica escondido até ser pedido para não alongar cada linha do carrinho, mas abre sozinho
	// quando o item já veio com observação (venda hidratada para edição).
	const [mostrandoObservacao, setMostrandoObservacao] = useState(!!item.observacoes);

	return (
		<div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-2.5">
			{/* Cabeçalho: miniatura + identidade + remover */}
			<div className="flex items-start gap-2.5">
				<div className="relative h-11 w-11 min-h-11 min-w-11 overflow-hidden rounded-lg bg-secondary/40">
					{item.imagemUrl ? (
						<Image src={item.imagemUrl} alt={item.nome} fill sizes="44px" className="object-cover" />
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<Package className="h-4 w-4 text-muted-foreground/40" />
						</div>
					)}
				</div>

				<div className="min-w-0 flex-1">
					<h4 className="line-clamp-2 text-sm font-bold leading-tight tracking-tight">{item.nome}</h4>
					<p className="mt-0.5 truncate text-[0.65rem] font-medium text-muted-foreground">{item.codigo}</p>
					{isReward ? <span className="text-[0.65rem] font-bold uppercase text-amber-600">Recompensa resgatada</span> : null}
				</div>

				<Button
					size="icon"
					variant="ghost"
					className={`h-7 w-7 shrink-0 hover:bg-primary/10 hover:text-primary ${item.observacoes ? "text-primary" : "text-muted-foreground"}`}
					onClick={() => setMostrandoObservacao((prev) => !prev)}
					aria-label={item.observacoes ? "Editar observação do item" : "Adicionar observação ao item"}
				>
					<StickyNote className="w-3.5 h-3.5" />
				</Button>

				{isReward ? null : (
					<Button
						size="icon"
						variant="ghost"
						className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
						onClick={() => onRemove(item.tempId)}
						aria-label="Remover item"
					>
						<Trash2 className="w-3.5 h-3.5" />
					</Button>
				)}
			</div>

			{/* Observação do item — segue para a cozinha e para o cupom impresso */}
			{mostrandoObservacao ? (
				<div className="ml-[3.25rem]">
					<Input
						value={item.observacoes ?? ""}
						onChange={(event) => onUpdateObservacoes(item.tempId, event.target.value)}
						placeholder="Ex.: sem cebola, ponto mal passado"
						maxLength={500}
						className="h-8 text-xs"
					/>
				</div>
			) : null}

			{/* Modificadores — bloco indentado com fundo, sem faixa lateral */}
			{item.modificadores.length > 0 ? (
				<div className="ml-[3.25rem] flex flex-col gap-1 rounded-lg bg-muted/60 px-2.5 py-1.5">
					{item.modificadores.map((mod, idx) => (
						<div key={`${mod.opcaoId}-${idx}`} className="flex items-center justify-between gap-2 text-[0.7rem]">
							<span className="min-w-0 truncate text-muted-foreground">
								{mod.quantidade > 1 ? `${mod.quantidade}x ` : null}
								{mod.nome}
							</span>
							{mod.valorUnitario !== 0 ? <span className="shrink-0 font-semibold tabular-nums">+{formatToMoney(mod.valorTotal)}</span> : null}
						</div>
					))}
				</div>
			) : null}

			{/* Quantidade + total */}
			<div className="flex items-center justify-between">
				{/* Stepper coeso: um único pill com divisórias internas */}
				{isReward ? (
					<span className="text-sm font-bold tabular-nums">1x</span>
				) : (
					<div className="inline-flex items-center rounded-lg border border-border">
						<button
							type="button"
							onClick={() => onUpdateQuantity(item.tempId, item.quantidade - 1)}
							disabled={item.quantidade <= 1}
							aria-label="Diminuir quantidade"
							className="flex h-7 w-7 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
						>
							<Minus className="w-3 h-3" />
						</button>
						<span className="w-8 border-x border-border text-center text-sm font-bold tabular-nums leading-7">{item.quantidade}</span>
						<button
							type="button"
							onClick={() => onUpdateQuantity(item.tempId, item.quantidade + 1)}
							aria-label="Aumentar quantidade"
							className="flex h-7 w-7 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							<Plus className="w-3 h-3" />
						</button>
					</div>
				)}

				<div className="text-right">
					<p className={`font-black tabular-nums ${isReward ? "text-amber-600" : "text-foreground"}`}>
						{isReward ? "GRÁTIS" : formatToMoney(item.valorTotalLiquido)}
					</p>
					{hasDiscount ? <p className="text-xs tabular-nums text-muted-foreground line-through">{formatToMoney(item.valorTotalBruto)}</p> : null}
				</div>
			</div>
		</div>
	);
}
