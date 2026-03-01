import { Separator } from "@/components/ui/separator";
import { formatToMoney } from "@/lib/formatting";
import type { TUseCheckoutState } from "@/state-hooks/use-checkout-state";
import { Check, CreditCard, MapPin, Package, User } from "lucide-react";

type ConfirmationStepProps = {
	sale: {
		idExterno: string;
		valorTotal: number;
		cliente: { id: string; nome: string; telefone: string } | null;
		itens: Array<{
			id: string;
			quantidade: number;
			valorVendaTotalLiquido: number;
			produto: { descricao: string } | null;
			produtoVariante: { nome: string } | null;
		}>;
	};
	checkoutState: TUseCheckoutState;
};

const DELIVERY_MODE_LABELS: Record<string, string> = {
	PRESENCIAL: "Presencial",
	RETIRADA: "Retirada",
	ENTREGA: "Entrega",
	COMANDA: "Comanda",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
	DINHEIRO: "Dinheiro",
	PIX: "PIX",
	CARTAO_CREDITO: "Cartão de Crédito",
	CARTAO_DEBITO: "Cartão de Débito",
	BOLETO: "Boleto",
	TRANSFERENCIA: "Transferência",
	CASHBACK: "Cashback",
	VALE: "Vale",
	OUTRO: "Outro",
};

export default function ConfirmationStep({ sale, checkoutState }: ConfirmationStepProps) {
	return (
		<div className="flex flex-col gap-6">
			<div className="text-center">
				<h2 className="text-lg font-black">Confirmar Venda</h2>
				<p className="text-sm text-muted-foreground">Revise os detalhes abaixo antes de confirmar.</p>
			</div>

			{/* Client */}
			<div className="flex items-center gap-3 p-4 rounded-xl border">
				<User className="w-5 h-5 text-primary" />
				<div>
					<p className="text-xs text-muted-foreground uppercase tracking-wide">Cliente</p>
					<p className="font-bold">{sale.cliente?.nome ?? "Não identificado"}</p>
				</div>
			</div>

			{/* Items Summary */}
			<div className="flex items-start gap-3 p-4 rounded-xl border">
				<Package className="w-5 h-5 text-primary mt-0.5" />
				<div className="flex-1">
					<p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
						Itens ({sale.itens.length})
					</p>
					{sale.itens.map((item) => (
						<div key={item.id} className="flex justify-between text-sm py-1">
							<span>
								{item.quantidade}x{" "}
								{item.produtoVariante
									? `${item.produto?.descricao} - ${item.produtoVariante.nome}`
									: item.produto?.descricao}
							</span>
							<span className="font-bold">{formatToMoney(item.valorVendaTotalLiquido)}</span>
						</div>
					))}
				</div>
			</div>

			{/* Delivery */}
			<div className="flex items-center gap-3 p-4 rounded-xl border">
				<MapPin className="w-5 h-5 text-primary" />
				<div>
					<p className="text-xs text-muted-foreground uppercase tracking-wide">Entrega</p>
					<p className="font-bold">{DELIVERY_MODE_LABELS[checkoutState.state.entregaModalidade]}</p>
					{checkoutState.state.comandaNumero && (
						<p className="text-sm text-muted-foreground">Comanda: {checkoutState.state.comandaNumero}</p>
					)}
				</div>
			</div>

			{/* Payments */}
			<div className="flex items-start gap-3 p-4 rounded-xl border">
				<CreditCard className="w-5 h-5 text-primary mt-0.5" />
				<div className="flex-1">
					<p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Pagamentos</p>
					{checkoutState.state.pagamentos.map((p) => (
						<div key={p.id} className="flex justify-between text-sm py-1">
							<span>
								{PAYMENT_METHOD_LABELS[p.metodo] ?? p.metodo}
								{p.totalParcelas && p.totalParcelas > 1 ? ` (${p.totalParcelas}x)` : ""}
							</span>
							<span className="font-bold">{formatToMoney(p.valor)}</span>
						</div>
					))}
				</div>
			</div>

			{/* Final Total */}
			<div className="flex flex-col gap-2 p-6 rounded-xl bg-green-50 dark:bg-green-950/20 border-2 border-green-200 dark:border-green-800">
				<div className="flex justify-between text-sm">
					<span className="text-muted-foreground">Subtotal dos itens</span>
					<span>{formatToMoney(sale.valorTotal)}</span>
				</div>
				{checkoutState.state.descontoGeral > 0 && (
					<div className="flex justify-between text-sm">
						<span className="text-muted-foreground">Desconto</span>
						<span className="text-green-600">-{formatToMoney(checkoutState.state.descontoGeral)}</span>
					</div>
				)}
				{checkoutState.state.acrescimoGeral > 0 && (
					<div className="flex justify-between text-sm">
						<span className="text-muted-foreground">Acréscimo</span>
						<span className="text-orange-600">+{formatToMoney(checkoutState.state.acrescimoGeral)}</span>
					</div>
				)}
				<Separator />
				<div className="flex justify-between items-center">
					<span className="font-black text-lg uppercase tracking-wide">Total Final</span>
					<span className="text-3xl font-black text-green-600">{formatToMoney(checkoutState.valorFinal)}</span>
				</div>
				{checkoutState.troco > 0 && (
					<div className="flex justify-between text-sm mt-1">
						<span className="text-muted-foreground">Troco</span>
						<span className="font-bold">{formatToMoney(checkoutState.troco)}</span>
					</div>
				)}
				{checkoutState.pagamentoCompleto && (
					<div className="flex items-center justify-center gap-2 mt-2 text-green-600">
						<Check className="w-4 h-4" />
						<span className="text-sm font-bold">Pagamento completo</span>
					</div>
				)}
			</div>

			{checkoutState.state.observacoes && (
				<div className="p-4 rounded-xl border">
					<p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Observações</p>
					<p className="text-sm">{checkoutState.state.observacoes}</p>
				</div>
			)}
		</div>
	);
}
