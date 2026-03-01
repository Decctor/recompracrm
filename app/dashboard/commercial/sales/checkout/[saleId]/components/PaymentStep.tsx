import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import type { TUseCheckoutState } from "@/state-hooks/use-checkout-state";
import { Banknote, CreditCard, Plus, QrCode, Trash2, Wallet } from "lucide-react";
import { useState } from "react";

type PaymentStepProps = {
	sale: {
		valorTotal: number;
	};
	checkoutState: TUseCheckoutState;
};

const PAYMENT_METHODS: { value: TPaymentMethodEnum; label: string; icon: typeof Banknote }[] = [
	{ value: "DINHEIRO", label: "Dinheiro", icon: Banknote },
	{ value: "PIX", label: "PIX", icon: QrCode },
	{ value: "CARTAO_CREDITO", label: "Crédito", icon: CreditCard },
	{ value: "CARTAO_DEBITO", label: "Débito", icon: CreditCard },
	{ value: "TRANSFERENCIA", label: "Transferência", icon: Wallet },
	{ value: "OUTRO", label: "Outro", icon: Wallet },
];

export default function PaymentStep({ sale, checkoutState }: PaymentStepProps) {
	const [selectedMethod, setSelectedMethod] = useState<TPaymentMethodEnum>("DINHEIRO");
	const [paymentAmount, setPaymentAmount] = useState("");
	const [installments, setInstallments] = useState(1);

	const handleAddPayment = () => {
		const valor = Number(paymentAmount);
		if (!valor || valor <= 0) return;

		checkoutState.addPagamento({
			metodo: selectedMethod,
			valor,
			parcela: selectedMethod === "CARTAO_CREDITO" && installments > 1 ? 1 : undefined,
			totalParcelas: selectedMethod === "CARTAO_CREDITO" && installments > 1 ? installments : undefined,
		});

		setPaymentAmount("");
		setInstallments(1);
	};

	const handlePayFullAmount = () => {
		if (checkoutState.valorRestante <= 0) return;

		checkoutState.addPagamento({
			metodo: selectedMethod,
			valor: checkoutState.valorRestante,
			parcela: selectedMethod === "CARTAO_CREDITO" && installments > 1 ? 1 : undefined,
			totalParcelas: selectedMethod === "CARTAO_CREDITO" && installments > 1 ? installments : undefined,
		});

		setPaymentAmount("");
		setInstallments(1);
	};

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h2 className="text-lg font-black">Pagamento</h2>
				<p className="text-sm text-muted-foreground">Adicione uma ou mais formas de pagamento.</p>
			</div>

			{/* Payment Method Selector */}
			<div className="flex flex-wrap gap-2">
				{PAYMENT_METHODS.map((method) => {
					const isSelected = selectedMethod === method.value;
					const Icon = method.icon;

					return (
						<Button
							key={method.value}
							variant="outline"
							size="sm"
							className={cn(
								"gap-2 rounded-lg",
								isSelected && "border-primary bg-primary/5 ring-1 ring-primary",
							)}
							onClick={() => setSelectedMethod(method.value)}
						>
							<Icon className="w-4 h-4" />
							{method.label}
						</Button>
					);
				})}
			</div>

			{/* Payment Amount Input */}
			<div className="flex flex-col gap-3 p-4 rounded-xl border">
				<div className="flex items-end gap-3">
					<div className="flex-1">
						<TextInput
							label={`Valor em ${PAYMENT_METHODS.find((m) => m.value === selectedMethod)?.label}`}
							placeholder="0,00"
							value={paymentAmount}
							handleChange={setPaymentAmount}
						/>
					</div>

					{selectedMethod === "CARTAO_CREDITO" && (
						<div className="w-24">
							<TextInput
								label="Parcelas"
								placeholder="1"
								value={installments.toString()}
								handleChange={(value) => setInstallments(Math.max(1, Number(value) || 1))}
							/>
						</div>
					)}
				</div>

				<div className="flex gap-2">
					<Button variant="outline" size="sm" className="gap-1" onClick={handleAddPayment} disabled={!paymentAmount || Number(paymentAmount) <= 0}>
						<Plus className="w-3 h-3" />
						Adicionar
					</Button>
					{checkoutState.valorRestante > 0 && (
						<Button variant="default" size="sm" onClick={handlePayFullAmount}>
							Pagar Restante ({formatToMoney(checkoutState.valorRestante)})
						</Button>
					)}
				</div>
			</div>

			{/* Payment Splits List */}
			{checkoutState.state.pagamentos.length > 0 && (
				<div className="flex flex-col gap-2 p-4 rounded-xl border">
					<h3 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">Pagamentos Registrados</h3>

					{checkoutState.state.pagamentos.map((pagamento) => (
						<div key={pagamento.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
							<div>
								<p className="font-medium text-sm">
									{PAYMENT_METHODS.find((m) => m.value === pagamento.metodo)?.label ?? pagamento.metodo}
								</p>
								{pagamento.totalParcelas && pagamento.totalParcelas > 1 && (
									<p className="text-xs text-muted-foreground">{pagamento.totalParcelas}x</p>
								)}
							</div>
							<div className="flex items-center gap-2">
								<span className="font-bold">{formatToMoney(pagamento.valor)}</span>
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7 text-destructive hover:text-destructive"
									onClick={() => checkoutState.removePagamento(pagamento.id)}
								>
									<Trash2 className="w-3 h-3" />
								</Button>
							</div>
						</div>
					))}
				</div>
			)}

			{/* Payment Summary */}
			<div className="flex flex-col gap-2 p-4 rounded-xl bg-secondary/50 border">
				<div className="flex justify-between text-sm">
					<span className="text-muted-foreground">Valor da Venda</span>
					<span className="font-bold">{formatToMoney(checkoutState.valorFinal)}</span>
				</div>
				<div className="flex justify-between text-sm">
					<span className="text-muted-foreground">Total Pago</span>
					<span className="font-bold">{formatToMoney(checkoutState.totalPagamentos)}</span>
				</div>
				<Separator />
				{checkoutState.valorRestante > 0 ? (
					<div className="flex justify-between">
						<span className="font-black text-red-600">Falta</span>
						<span className="text-xl font-black text-red-600">{formatToMoney(checkoutState.valorRestante)}</span>
					</div>
				) : checkoutState.troco > 0 ? (
					<div className="flex justify-between">
						<span className="font-black text-green-600">Troco</span>
						<span className="text-xl font-black text-green-600">{formatToMoney(checkoutState.troco)}</span>
					</div>
				) : (
					<div className="flex justify-between">
						<span className="font-black text-green-600">Pagamento Completo</span>
						<span className="text-green-600 font-bold">OK</span>
					</div>
				)}
			</div>
		</div>
	);
}
