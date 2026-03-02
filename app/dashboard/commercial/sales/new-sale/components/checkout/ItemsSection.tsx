import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";

import { formatToMoney } from "@/lib/formatting";
import type { TCartItem } from "@/state-hooks/use-sale-state";

type ItemsSectionProps = {
	saleState: TUseSaleState;
};

export default function ItemsSection({ saleState }: ItemsSectionProps) {
	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<ShoppingCart className="w-4 h-4 text-primary" />
					<h3 className="font-bold text-xs tracking-wide">ITENS</h3>
				</div>
				{saleState.state.itens.length > 0 ? (
					<Button type="button" variant="ghost" size="sm" className="gap-1 text-destructive" onClick={saleState.clearCart}>
						<Trash2 className="w-3 h-3" /> LIMPAR
					</Button>
				) : null}
			</div>
			<ScrollArea className="max-h-[200px]">
				<div className="flex flex-col gap-2 pr-3">
					{saleState.state.itens.map((item) => (
						<CartItemRow key={item.tempId} item={item} onUpdateQuantity={saleState.updateItemQuantity} onRemove={saleState.removeItem} />
					))}
					{saleState.state.itens.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum item no carrinho.</p> : null}
				</div>
			</ScrollArea>
		</div>
	);
}

type CartItemRowProps = {
	item: TCartItem;
	onUpdateQuantity: (tempId: string, quantidade: number) => void;
	onRemove: (tempId: string) => void;
};

function CartItemRow({ item, onUpdateQuantity, onRemove }: CartItemRowProps) {
	return (
		<div className="flex flex-col gap-2 p-3 rounded-xl border bg-card">
			{/* Item Header */}
			<div className="flex items-start justify-between gap-2">
				<div className="flex-1 min-w-0">
					<h4 className="font-bold text-sm leading-tight line-clamp-2">{item.nome}</h4>
					<p className="text-xs text-muted-foreground">{item.codigo}</p>
				</div>
				<Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onRemove(item.tempId)}>
					<Trash2 className="w-4 h-4" />
				</Button>
			</div>

			{/* Modifiers */}
			{item.modificadores.length > 0 && (
				<div className="flex flex-col gap-1 pl-2 border-l-2 border-primary/30">
					{item.modificadores.map((mod, idx) => (
						<div key={`${mod.opcaoId}-${idx}`} className="flex items-center justify-between text-xs">
							<span className="text-muted-foreground">
								{mod.quantidade > 1 && `${mod.quantidade}x `}
								{mod.nome}
							</span>
							{mod.valorUnitario !== 0 && <span className="font-medium">+{formatToMoney(mod.valorTotal)}</span>}
						</div>
					))}
				</div>
			)}

			{/* Quantity and Price */}
			<div className="flex items-center justify-between">
				{/* Quantity Stepper */}
				<div className="flex items-center gap-2">
					<Button
						size="icon"
						variant="outline"
						className="h-7 w-7 rounded-lg"
						onClick={() => onUpdateQuantity(item.tempId, item.quantidade - 1)}
						disabled={item.quantidade <= 1}
					>
						<Minus className="w-3 h-3" />
					</Button>
					<span className="w-8 text-center font-bold text-sm">{item.quantidade}</span>
					<Button size="icon" variant="outline" className="h-7 w-7 rounded-lg" onClick={() => onUpdateQuantity(item.tempId, item.quantidade + 1)}>
						<Plus className="w-3 h-3" />
					</Button>
				</div>

				{/* Line Total */}
				<div className="text-right">
					<p className="font-black text-primary">{formatToMoney(item.valorTotalLiquido)}</p>
					{item.valorDesconto > 0 && <p className="text-xs text-muted-foreground line-through">{formatToMoney(item.valorTotalBruto)}</p>}
				</div>
			</div>
		</div>
	);
}
