import { formatToMoney } from "@/lib/formatting";
import type { TPaymentTerminalPendency } from "@/lib/sales-sessions/payment-terminal-pendencies";
import { cn } from "@/lib/utils";
import { AlertTriangle, Smartphone } from "lucide-react";

type SessionTerminalPendingAlertProps = {
	pendencias: TPaymentTerminalPendency[];
};

const KIND_LABELS: Record<TPaymentTerminalPendency["tipo"], string> = {
	EM_ANDAMENTO: "aguardando a maquininha",
	INCERTA: "resultado incerto — não cobrar de novo",
	NAO_APROVADA_PENDENTE: "não aprovada, pagamento pendente",
};

/**
 * Cobranças na maquininha sem desfecho no turno. Em andamento bloqueia o fechamento (o resultado
 * chega em minutos); incerta e não aprovada só avisam, porque resolver pode levar mais que o turno.
 */
export function SessionTerminalPendingAlert({ pendencias }: SessionTerminalPendingAlertProps) {
	if (pendencias.length === 0) return null;
	const blocking = pendencias.filter((pendency) => pendency.bloqueiaFechamento).length;
	return (
		<div className={cn("flex items-start gap-2 rounded-xl border p-3", blocking > 0 ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning-surface")}>
			{blocking > 0 ? (
				<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
			) : (
				<Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-warning-surface-foreground" aria-hidden />
			)}
			<div className="flex min-w-0 flex-col gap-1">
				<span className="font-bold text-xs tracking-wide">
					{pendencias.length > 1 ? `${pendencias.length} COBRANÇAS NA MAQUININHA SEM DESFECHO` : "1 COBRANÇA NA MAQUININHA SEM DESFECHO"}
				</span>
				<span className="text-[11px] text-foreground/75">
					{blocking > 0
						? "O caixa só fecha depois que o terminal aprovar ou recusar, ou que a cobrança seja cancelada no PDV. O valor já consta no esperado do método."
						: "O valor consta no esperado do método, mas ainda não foi recebido. Resolva no PDV (trocar o pagamento ou cancelar a venda) ou com o suporte."}
				</span>
				<ul className="mt-1 flex flex-col gap-0.5 text-[11px]">
					{pendencias.map((pendency) => (
						<li key={pendency.tentativaId} className="flex items-center justify-between gap-2">
							<span className="truncate">
								{pendency.clienteNome ?? "Consumidor"} · {pendency.dispositivoNome} · {KIND_LABELS[pendency.tipo]}
							</span>
							<span className="shrink-0 font-semibold tabular-nums">{formatToMoney(pendency.valor)}</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
