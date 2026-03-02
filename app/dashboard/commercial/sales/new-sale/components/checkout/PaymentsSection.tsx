import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import { SalePaymentMethodsOptions } from "@/utils/select-options";
import { Check, Plus, Wallet, X } from "lucide-react";

type PaymentsSectionProps = {
	saleState: TUseSaleState;
};

type PaymentCardProps = {
	saleState: TUseSaleState;
	payment: TUseSaleState["state"]["pagamentos"][number];
};

function PaymentCard({ saleState, payment }: PaymentCardProps) {
	const selectedMethod = SalePaymentMethodsOptions.find((method) => method.value === payment.metodo);

	return (
		<div className="rounded-lg border px-2 py-2 flex items-center gap-1.5 justify-between">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="sm" className="gap-1 uppercase">
						{selectedMethod?.icon ?? <Wallet className="w-4 h-4" />}
						{selectedMethod?.label ?? payment.metodo}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuLabel>MÉTODO</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{SalePaymentMethodsOptions.map((method) => (
						<DropdownMenuItem key={method.value} onClick={() => saleState.updatePagamento(payment.id, { metodo: method.value })}>
							<div className="flex items-center gap-2 w-full justify-between">
								<div className="flex items-center gap-2">
									{method.icon}
									{method.label}
								</div>
								{method.value === payment.metodo ? <Check className="w-4 h-4" /> : null}
							</div>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			<div className="flex items-center gap-1.5">
				<Input
					type="number"
					className="w-24 max-w-full text-xs"
					value={payment.valor}
					onChange={(event) => saleState.updatePagamento(payment.id, { valor: Number(event.target.value) || 0 })}
				/>
				<Button type="button" variant="ghost-destructive" size="icon" className="h-8 w-8" onClick={() => saleState.removePagamento(payment.id)}>
					<X className="w-3 h-3" />
				</Button>
			</div>
		</div>
	);
}

export default function PaymentsSection({ saleState }: PaymentsSectionProps) {
	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs">
			<div className="flex items-center gap-1.5 justify-between">
				<div className="flex items-center gap-1.5">
					<Wallet className="w-4 h-4 text-primary" />
					<h3 className="font-bold text-xs tracking-wide">PAGAMENTO</h3>
				</div>
				<Button
					type="button"
					size="fit"
					className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
					variant="ghost-brand"
					onClick={() => saleState.addPagamento()}
				>
					<Plus className="w-4 h-4" /> ADICIONAR
				</Button>
			</div>

			{saleState.state.pagamentos.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum pagamento adicionado.</p> : null}
			{saleState.state.pagamentos.map((payment) => (
				<PaymentCard key={payment.id} saleState={saleState} payment={payment} />
			))}
		</div>
	);
}
