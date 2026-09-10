import { AlertTriangle } from "lucide-react";

type SessionFiscalPendingAlertProps = {
	quantidade: number;
	description: string;
};

/** Notas não autorizadas no turno — o operador (ou quem confere) precisa ver antes de qualquer número. */
export function SessionFiscalPendingAlert({ quantidade, description }: SessionFiscalPendingAlertProps) {
	if (quantidade <= 0) return null;
	return (
		<div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-surface p-3">
			<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-surface-foreground" aria-hidden />
			<div className="flex flex-col gap-0.5">
				<span className="font-bold text-xs tracking-wide">
					{quantidade > 1 ? `${quantidade} DOCUMENTOS FISCAIS PENDENTES` : `${quantidade} DOCUMENTO FISCAL PENDENTE`}
				</span>
				<span className="text-[11px] text-foreground/75">{description}</span>
			</div>
		</div>
	);
}
