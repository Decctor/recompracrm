"use client";

import { formatToMoney } from "@/lib/formatting";
import { OperatorConfirmationInput } from "../../_shared/components/operator-confirmation-input";

type ConfirmationStepProps = {
	clientName: string;
	finalValue: number;
	operatorIdentifier: string;
	onOperatorIdentifierChange: (identifier: string) => void;
	onSubmit: () => void;
};

export function ConfirmationStep({ clientName, finalValue, operatorIdentifier, onOperatorIdentifierChange, onSubmit }: ConfirmationStepProps) {
	return (
		<form
			className="space-y-8 short:space-y-2 animate-in fade-in slide-in-from-bottom-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			<div className="text-center space-y-2 short:space-y-0.5">
				<h2 className="text-xl short:text-lg font-black uppercase tracking-tight">Finalizar Operação</h2>
				<p className="text-muted-foreground short:text-xs">Confira os dados e digite o usuário do operador.</p>
			</div>

			<div className="bg-brand/5 rounded-3xl short:rounded-xl p-6 short:p-2.5 space-y-3 short:space-y-1.5 border border-brand/20">
				<div className="flex justify-between">
					<span className="text-muted-foreground font-bold text-xs short:text-[0.7rem] uppercase">Cliente</span>
					<span className="font-black text-brand short:text-xs">{clientName}</span>
				</div>
				<div className="flex justify-between">
					<span className="text-muted-foreground font-bold text-xs short:text-[0.7rem] uppercase">Valor Final</span>
					<span className="font-black text-brand text-xl short:text-base">{formatToMoney(finalValue)}</span>
				</div>
			</div>

			<OperatorConfirmationInput value={operatorIdentifier} onChange={onOperatorIdentifierChange} />
		</form>
	);
}
