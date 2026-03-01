import TextInput from "@/components/Inputs/TextInput";
import { Separator } from "@/components/ui/separator";
import { formatToMoney } from "@/lib/formatting";
import type { TUseCheckoutState } from "@/state-hooks/use-checkout-state";
import { Package, User } from "lucide-react";

type ReviewStepProps = {
	sale: {
		idExterno: string;
		valorTotal: number;
		descontosTotal: number | null;
		cliente: { id: string; nome: string; telefone: string } | null;
		itens: Array<{
			id: string;
			quantidade: number;
			valorVendaUnitario: number;
			valorVendaTotalLiquido: number;
			valorTotalDesconto: number;
			produto: { id: string; descricao: string; codigo: string; imagemCapaUrl: string | null } | null;
			produtoVariante: { id: string; nome: string; codigo: string; imagemCapaUrl: string | null } | null;
			adicionais: Array<{ id: string; nome: string; quantidade: number; valorTotal: number }>;
		}>;
	};
	checkoutState: TUseCheckoutState;
};

export default function ReviewStep({ sale, checkoutState }: ReviewStepProps) {
	return (
		<div className="flex flex-col gap-6">
			{/* Client Info */}
			<div className="flex flex-col gap-3 p-4 rounded-xl border">
				<div className="flex items-center gap-2">
					<User className="w-4 h-4 text-primary" />
					<h3 className="font-bold text-sm uppercase tracking-wide">Cliente</h3>
				</div>
				{sale.cliente ? (
					<div className="flex items-center gap-3">
						<div>
							<p className="font-bold">{sale.cliente.nome}</p>
							<p className="text-sm text-muted-foreground">{sale.cliente.telefone}</p>
						</div>
					</div>
				) : (
					<p className="text-sm text-muted-foreground">Nenhum cliente vinculado.</p>
				)}
			</div>

			{/* Items */}
			<div className="flex flex-col gap-3 p-4 rounded-xl border">
				<div className="flex items-center gap-2">
					<Package className="w-4 h-4 text-primary" />
					<h3 className="font-bold text-sm uppercase tracking-wide">Itens ({sale.itens.length})</h3>
				</div>

				<div className="flex flex-col gap-2">
					{sale.itens.map((item) => (
						<div key={item.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
							<div className="flex-1">
								<p className="font-medium text-sm">
									{item.produtoVariante
										? `${item.produto?.descricao} - ${item.produtoVariante.nome}`
										: item.produto?.descricao}
								</p>
								{item.adicionais.length > 0 && (
									<p className="text-xs text-muted-foreground">
										+ {item.adicionais.map((a) => a.nome).join(", ")}
									</p>
								)}
								<p className="text-xs text-muted-foreground">
									{item.quantidade}x {formatToMoney(item.valorVendaUnitario)}
								</p>
							</div>
							<p className="font-bold text-sm">{formatToMoney(item.valorVendaTotalLiquido)}</p>
						</div>
					))}
				</div>
			</div>

			{/* Order-Level Adjustments */}
			<div className="flex flex-col gap-3 p-4 rounded-xl border">
				<h3 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">Ajustes do Pedido</h3>

				<div className="grid grid-cols-2 gap-4">
					<TextInput
						label="Desconto Geral (R$)"
						placeholder="0,00"
						value={checkoutState.state.descontoGeral.toString()}
						handleChange={(value) => checkoutState.setDescontoGeral(Number(value) || 0)}
					/>
					<TextInput
						label="Acréscimo (R$)"
						placeholder="0,00"
						value={checkoutState.state.acrescimoGeral.toString()}
						handleChange={(value) => checkoutState.setAcrescimoGeral(Number(value) || 0)}
					/>
				</div>

				<TextInput
					label="Observações"
					placeholder="Observações sobre o pedido..."
					value={checkoutState.state.observacoes}
					handleChange={(value) => checkoutState.setObservacoes(value)}
				/>
			</div>

			{/* Totals */}
			<div className="flex flex-col gap-2 p-4 rounded-xl bg-secondary/50 border">
				<div className="flex justify-between text-sm">
					<span className="text-muted-foreground">Subtotal</span>
					<span className="font-bold">{formatToMoney(sale.valorTotal)}</span>
				</div>
				{checkoutState.state.descontoGeral > 0 && (
					<div className="flex justify-between text-sm">
						<span className="text-muted-foreground">Desconto</span>
						<span className="font-bold text-green-600">-{formatToMoney(checkoutState.state.descontoGeral)}</span>
					</div>
				)}
				{checkoutState.state.acrescimoGeral > 0 && (
					<div className="flex justify-between text-sm">
						<span className="text-muted-foreground">Acréscimo</span>
						<span className="font-bold text-orange-600">+{formatToMoney(checkoutState.state.acrescimoGeral)}</span>
					</div>
				)}
				<Separator />
				<div className="flex justify-between">
					<span className="font-black uppercase tracking-wide">Total</span>
					<span className="text-2xl font-black text-primary">{formatToMoney(checkoutState.valorFinal)}</span>
				</div>
			</div>
		</div>
	);
}
