"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatToMoney } from "@/lib/formatting";
import { getShopCartSubtotal } from "@/lib/shop/cart";
import { resolveShopDeliveryFee } from "@/lib/shop/config";
import type { TShopPaymentMethod } from "@/schemas/shop";
import { Banknote, CreditCard, QrCode } from "lucide-react";
import { useMemo, useState } from "react";
import { useShop } from "../ShopProvider";

const PAYMENT_METHODS: Array<{ value: TShopPaymentMethod; label: string; description: string; icon: typeof Banknote }> = [
	{ value: "DINHEIRO", label: "Dinheiro", description: "Pague em espécie no recebimento.", icon: Banknote },
	{ value: "PIX", label: "PIX", description: "A loja fornecerá a chave no atendimento.", icon: QrCode },
	{ value: "CARTAO_DEBITO", label: "Cartão de débito", description: "Pagamento na maquininha.", icon: CreditCard },
	{ value: "CARTAO_CREDITO", label: "Cartão de crédito", description: "Pagamento na maquininha.", icon: CreditCard },
];

function parseMoneyInput(value: string) {
	const parsed = Number.parseFloat(value.replace(/[^\d.,]/g, "").replace(",", "."));
	return Number.isNaN(parsed) ? null : parsed;
}

export default function PaymentStep({ onNext }: { onNext: () => void }) {
	const { catalog, orderState } = useShop();
	const { payment, delivery, cart, cashback, coupon } = orderState.state;
	const acceptedMethods = new Set(catalog.shopSettings.configuracoes.pagamento.metodosAceitos);
	const methods = PAYMENT_METHODS.filter((method) => acceptedMethods.has(method.value));

	const [trocoText, setTrocoText] = useState(payment.trocoPara !== null ? payment.trocoPara.toFixed(2).replace(".", ",") : "");

	const orderTotal = useMemo(() => {
		const subtotal = getShopCartSubtotal(cart.items, catalog.products, coupon.resgate?.brinde);
		const taxaEntrega = resolveShopDeliveryFee({
			configuracoes: catalog.shopSettings.configuracoes,
			modalidade: delivery.modalidade,
			subtotalItens: subtotal,
		});
		return Math.max(0, subtotal - (coupon.resgate?.valorDesconto ?? 0) - cashback.resgateSolicitado) + taxaEntrega;
	}, [cart.items, catalog.products, coupon.resgate, cashback.resgateSolicitado, catalog.shopSettings.configuracoes, delivery.modalidade]);

	const trocoTooLow = payment.precisaTroco && payment.trocoPara !== null && payment.trocoPara < orderTotal;

	const handleTrocoChange = (value: string) => {
		setTrocoText(value);
		orderState.updatePayment({ trocoPara: parseMoneyInput(value) });
	};

	const handleNext = () => {
		if (!acceptedMethods.has(payment.metodo)) return;
		onNext();
	};

	if (orderTotal <= 0)
		return (
			<div className="flex flex-col gap-4">
				<h2 className="text-lg font-black">Nenhum pagamento necessário</h2>
				<p className="text-sm text-muted-foreground">O benefício cobre o valor deste pedido. Continue para revisar e confirmar.</p>
				<Button type="button" onClick={onNext}>
					CONTINUAR
				</Button>
			</div>
		);

	return (
		<div className="flex flex-col gap-5">
			<div>
				<h2 className="text-lg font-black">Como você prefere pagar?</h2>
				<p className="text-sm text-muted-foreground">O pagamento será realizado na {delivery.modalidade === "RETIRADA" ? "retirada" : "entrega"}.</p>
			</div>

			<div className="grid gap-2">
				{methods.map((method) => {
					const Icon = method.icon;
					const selected = payment.metodo === method.value;
					return (
						<button
							key={method.value}
							type="button"
							onClick={() => orderState.updatePayment({ metodo: method.value, precisaTroco: method.value === "DINHEIRO" && payment.precisaTroco })}
							className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors ${
								selected ? "border-brand bg-brand/5" : "border-border hover:border-brand/40"
							}`}
						>
							<span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-brand text-brand-foreground" : "bg-muted"}`}>
								<Icon className="size-5" />
							</span>
							<span className="min-w-0">
								<span className="block text-sm font-bold">{method.label}</span>
								<span className="block text-xs text-muted-foreground">{method.description}</span>
							</span>
						</button>
					);
				})}
			</div>

			{payment.metodo === "DINHEIRO" ? (
				<div className="flex flex-col gap-3 rounded-2xl border bg-muted/30 p-4">
					<div className="flex items-center justify-between gap-3">
						<div>
							<Label htmlFor="shop-payment-needs-change" className="font-bold">
								Precisa de troco?
							</Label>
							<p className="text-xs text-muted-foreground">Informe o valor da nota para a loja se preparar.</p>
						</div>
						<Switch
							id="shop-payment-needs-change"
							checked={payment.precisaTroco}
							onCheckedChange={(precisaTroco) => orderState.updatePayment({ precisaTroco, trocoPara: precisaTroco ? payment.trocoPara : null })}
						/>
					</div>
					{payment.precisaTroco ? (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="shop-payment-change-for" className="sr-only">
								Troco para quanto?
							</Label>
							<Input
								id="shop-payment-change-for"
								type="text"
								inputMode="decimal"
								placeholder="Troco para quanto? Ex.: 100"
								value={trocoText}
								onChange={(event) => handleTrocoChange(event.target.value)}
								aria-invalid={trocoTooLow || undefined}
							/>
							{trocoTooLow ? (
								<p className="text-xs font-medium text-destructive">O valor informado é menor que o total do pedido ({formatToMoney(orderTotal)}).</p>
							) : null}
						</div>
					) : null}
				</div>
			) : null}

			<div className="space-y-2">
				<Label htmlFor="shop-payment-notes" className="font-bold">
					Observações
				</Label>
				<Textarea
					id="shop-payment-notes"
					placeholder="Ex.: levar maquininha com aproximação, chamar na portaria..."
					value={payment.observacoes}
					onChange={(event) => orderState.updatePayment({ observacoes: event.target.value })}
				/>
			</div>

			<div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t bg-background px-4 py-3 lg:-mx-6 lg:px-6">
				<Button variant="brand" className="h-12 w-full rounded-xl font-bold" onClick={handleNext} disabled={!acceptedMethods.has(payment.metodo)}>
					CONTINUAR
				</Button>
			</div>
		</div>
	);
}
