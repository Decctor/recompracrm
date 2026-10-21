import { Button } from "@/components/ui/button";
import { formatToMoney } from "@/lib/formatting";
import { formatItemQuantity } from "@/lib/pos/scale-barcode";
import type { TCartItem } from "@/state-hooks/use-sale-state";
import { Minus, Plus, Trash2 } from "lucide-react";

type CartItemRowProps = {
	item: TCartItem;
	onUpdateQuantity: (tempId: string, quantidade: number) => void;
	onRemove: (tempId: string) => void;
};

export default function CartItemRow({ item, onUpdateQuantity, onRemove }: CartItemRowProps) {
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
				<div className="flex flex-col gap-1 pl-2 border-l-2 border-border/30">
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
				{/* Pesagem (etiqueta de balança): a quantidade vem da etiqueta, sem stepper de unidade. */}
				{!Number.isInteger(item.quantidade) ? (
					<span className="text-sm font-bold tabular-nums">
						{formatItemQuantity(item.quantidade)}{" "}
						<span className="text-xs font-normal text-muted-foreground">× {formatToMoney(item.valorUnitarioFinal)}</span>
					</span>
				) : (
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
				)}

				{/* Line Total */}
				<div className="text-right">
					<p className="font-black text-foreground">{formatToMoney(item.valorTotalLiquido)}</p>
					{item.valorDesconto > 0 && <p className="text-xs text-muted-foreground line-through">{formatToMoney(item.valorTotalBruto)}</p>}
				</div>
			</div>
		</div>
	);
}
