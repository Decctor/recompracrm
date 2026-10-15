import { formatToMoney } from "@/lib/formatting";
import { ReceiptText } from "lucide-react";

type TPublicTabStatementOrder = {
	id: string;
	numero: number;
	status: string;
	itens: { id: string; quantidade: number; quantidadeCancelada: number; valorVendaTotalLiquido: number; metadados: unknown }[];
};

type PublicTabStatementProps = {
	status: string;
	pedidos: TPublicTabStatementOrder[];
	consumoParcial: number;
	/** Recebimentos parciais ja feitos (sem nomes de pagador: e o extrato de todo mundo da mesa). */
	valorPago?: number;
};

/** Extrato publico de uma conta aberta (QR da conta e QR da comanda fixa). */
export function PublicTabStatement({ status, pedidos, consumoParcial, valorPago = 0 }: PublicTabStatementProps) {
	const isOpen = status === "ABERTA";
	const activeOrders = pedidos.filter((order) => order.status !== "CANCELADO");
	const restante = Math.max(0, Math.round((consumoParcial - valorPago) * 100) / 100);

	return (
		<section className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3">
			<div className="flex items-center justify-between">
				<span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
					<ReceiptText className="h-3.5 w-3.5" />
					Extrato da conta
				</span>
				<span
					className={
						isOpen
							? "rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-950 dark:text-green-300"
							: "rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
					}
				>
					{isOpen ? "ABERTA" : status}
				</span>
			</div>

			{activeOrders.length === 0 ? <p className="py-2 text-center text-xs text-muted-foreground">Nenhum pedido lançado ainda.</p> : null}
			{activeOrders.map((order) => (
				<div key={order.id} className="flex flex-col gap-0.5 border-t border-border/50 pt-2">
					<span className="text-xs font-bold">Pedido {order.numero}</span>
					{order.itens
						.filter((item) => item.quantidadeCancelada < item.quantidade)
						.map((item) => {
							const metadata = (item.metadados ?? {}) as { nome?: string };
							return (
								<div key={item.id} className="flex items-center justify-between text-xs">
									<span>
										{item.quantidade}x {metadata.nome ?? "Item"}
									</span>
									<span className="font-medium">{formatToMoney(item.valorVendaTotalLiquido)}</span>
								</div>
							);
						})}
				</div>
			))}

			<div className="flex items-center justify-between border-t border-border pt-2">
				<span className="text-sm font-bold uppercase">Total parcial</span>
				<span className="text-base font-bold">{formatToMoney(consumoParcial)}</span>
			</div>
			{valorPago > 0 ? (
				<>
					<div className="flex items-center justify-between text-xs">
						<span className="font-semibold text-muted-foreground">Já pago</span>
						<span className="font-semibold tabular-nums">−{formatToMoney(valorPago)}</span>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-sm font-bold uppercase">Restante</span>
						<span className="text-base font-bold tabular-nums">{formatToMoney(restante)}</span>
					</div>
				</>
			) : null}
			<p className="text-[0.65rem] text-muted-foreground">O pagamento acontece no fechamento da conta com o atendente.</p>
		</section>
	);
}
