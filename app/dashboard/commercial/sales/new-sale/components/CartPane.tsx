import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatToMoney, formatToPhone } from "@/lib/formatting";
import { useClientByLookup } from "@/lib/queries/clients";
import { cn } from "@/lib/utils";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import { Check, ShoppingCart, Trash2, User, X } from "lucide-react";
import { useEffect } from "react";
import CartItemRow from "./CartItemRow";

type CartPaneProps = {
	organizationId: string;
	saleState: TUseSaleState;
	onCheckout: () => void;
	isCheckoutLoading?: boolean;
};

export default function CartPane({ organizationId, saleState, onCheckout, isCheckoutLoading }: CartPaneProps) {
	const {
		params,
		updateParams,
		data: client,
	} = useClientByLookup({
		initialParams: {
			orgId: organizationId,
			phone: "",
			clientId: saleState.state.cliente?.id,
		},
	});

	// Update sale state when client is found
	useEffect(() => {
		if (client) {
			saleState.setCliente({
				id: client.id,
				nome: client.nome,
				telefone: client.telefone,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [client]);

	const hasItems = saleState.state.itens.length > 0;

	return (
		<div className="flex flex-col h-full gap-4">
			{/* Header */}
			<div className="flex items-center gap-2">
				<div className="p-2 bg-primary/10 rounded-lg">
					<ShoppingCart className="w-5 h-5 text-primary" />
				</div>
				<div>
					<h2 className="font-black text-lg">Carrinho</h2>
					<p className="text-xs text-muted-foreground">
						{saleState.itemCount} {saleState.itemCount === 1 ? "item" : "itens"}
					</p>
				</div>
			</div>

			{/* Client Selection */}
			<div className="flex flex-col gap-3 p-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5">
				<div className="flex items-center gap-2">
					<User className="w-4 h-4 text-primary" />
					<h3 className="font-bold text-sm uppercase tracking-wide">Cliente</h3>
					<span className="text-red-500 text-xs">*</span>
				</div>

				{!saleState.state.cliente ? (
					<div className="flex flex-col gap-2">
						<TextInput
							label=""
							placeholder="(00) 00000-0000"
							value={formatToPhone(params.phone)}
							handleChange={(value) => updateParams({ phone: value })}
						/>
						{params.phone && !client && <p className="text-xs text-muted-foreground text-center">Digite o telefone completo para buscar</p>}
					</div>
				) : (
					<div className="flex items-center justify-between gap-2 bg-green-50 dark:bg-green-950/30 border-2 border-green-200 dark:border-green-800 rounded-lg p-3">
						<div className="flex items-center gap-2 flex-1 min-w-0">
							<Check className="w-4 h-4 text-green-600 flex-shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="font-bold text-sm truncate">{saleState.state.cliente.nome}</p>
								<p className="text-xs text-muted-foreground">{formatToPhone(saleState.state.cliente.telefone)}</p>
							</div>
						</div>
						<Button
							size="icon"
							variant="ghost"
							className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
							onClick={() => {
								saleState.clearCliente();
								updateParams({ phone: "", clientId: undefined });
							}}
						>
							<X className="w-4 h-4" />
						</Button>
					</div>
				)}
			</div>

			{/* Cart Items */}
			<div className="flex-1 min-h-0 flex flex-col gap-2">
				<h3 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">Itens</h3>
				{hasItems ? (
					<ScrollArea className="flex-1">
						<div className="flex flex-col gap-2 pr-4">
							{saleState.state.itens.map((item) => (
								<CartItemRow key={item.tempId} item={item} onUpdateQuantity={saleState.updateItemQuantity} onRemove={saleState.removeItem} />
							))}
						</div>
					</ScrollArea>
				) : (
					<div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed rounded-xl">
						<ShoppingCart className="w-12 h-12 text-muted-foreground/30 mb-2" />
						<p className="text-sm text-muted-foreground">Nenhum item no carrinho</p>
					</div>
				)}

				{/* Clear Cart Button */}
				{hasItems && (
					<Button variant="ghost" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={saleState.clearCart}>
						<Trash2 className="w-4 h-4" />
						Limpar Carrinho
					</Button>
				)}
			</div>

			{/* Totals */}
			<div className="flex flex-col gap-3 p-4 rounded-xl bg-secondary/50 border">
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Subtotal</span>
					<span className="font-bold">{formatToMoney(saleState.subtotal)}</span>
				</div>

				{saleState.totalDesconto > 0 && (
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">Desconto</span>
						<span className="font-bold text-green-600">-{formatToMoney(saleState.totalDesconto)}</span>
					</div>
				)}

				<Separator />

				<div className="flex items-center justify-between">
					<span className="font-black uppercase tracking-wide">Total</span>
					<span className="text-2xl font-black text-primary">{formatToMoney(saleState.total)}</span>
				</div>
			</div>

			{/* Checkout Button */}
			<Button
				size="lg"
				className={cn("w-full h-14 text-lg font-black rounded-xl shadow-lg", !saleState.isReadyForCheckout && "opacity-50 cursor-not-allowed")}
				onClick={onCheckout}
				disabled={!saleState.isReadyForCheckout || isCheckoutLoading}
			>
				{isCheckoutLoading ? "CRIANDO RASCUNHO..." : saleState.isReadyForCheckout ? "FINALIZAR VENDA" : "ADICIONE ITENS E SELECIONE O CLIENTE"}
			</Button>
		</div>
	);
}
