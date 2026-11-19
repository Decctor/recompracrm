"use client";

import { formatCashbackValue } from "@/lib/formatting";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { ArrowRight, Gift } from "lucide-react";
import { OperatorConfirmationInput } from "../../_shared/components/operator-confirmation-input";

type FreeFormRewardConfirmationStepProps = {
	clientName: string;
	descricao: string;
	valor: number;
	availableBalance: number;
	terminology: TCashbackProgramTerminologyEnum;
	operatorIdentifier: string;
	onOperatorIdentifierChange: (identifier: string) => void;
	onSubmit: () => void;
};

/**
 * Confirmação da recompensa avulsa no totem: o operador confere o que sai e quanto é debitado, e
 * autoriza com a senha. Não há valor de venda a confirmar — a recompensa avulsa não gera venda.
 */
export function FreeFormRewardConfirmationStep({
	clientName,
	descricao,
	valor,
	availableBalance,
	terminology,
	operatorIdentifier,
	onOperatorIdentifierChange,
	onSubmit,
}: FreeFormRewardConfirmationStepProps) {
	const balanceAfter = availableBalance - valor;
	return (
		<form
			className="space-y-8 short:space-y-2 animate-in fade-in slide-in-from-bottom-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			<div className="text-center space-y-2 short:space-y-0.5">
				<h2 className="text-xl short:text-lg font-extrabold tracking-tight">Confirmar resgate</h2>
				<p className="text-muted-foreground short:text-xs">Confira a recompensa e o valor, e digite a senha do operador.</p>
			</div>

			<div className="bg-brand-secondary/5 border border-brand-secondary/20 rounded-2xl short:rounded-xl p-4 short:p-2 flex items-center gap-4 short:gap-2">
				<div className="flex w-16 h-16 short:w-10 short:h-10 min-w-16 short:min-w-10 items-center justify-center rounded-xl short:rounded-lg bg-brand-secondary text-brand-secondary-foreground">
					<Gift className="w-6 h-6 short:w-4 short:h-4" />
				</div>
				<div className="flex-1 min-w-0">
					<span className="text-[0.65rem] short:text-[0.6rem] font-black uppercase tracking-widest text-muted-foreground">Recompensa avulsa</span>
					<h3 className="font-bold text-sm short:text-xs tracking-tight break-words">{descricao}</h3>
					<p className="font-black text-lg short:text-base text-brand-secondary">{formatCashbackValue(valor, terminology)}</p>
				</div>
			</div>

			<div className="bg-brand/5 rounded-3xl short:rounded-xl p-6 short:p-2.5 space-y-3 short:space-y-1.5 border border-brand/20">
				<div className="flex justify-between gap-3">
					<span className="text-muted-foreground font-bold text-xs short:text-[0.7rem] uppercase">Cliente</span>
					<span className="font-black text-brand short:text-xs text-right">{clientName}</span>
				</div>
				<div className="flex justify-between">
					<span className="text-muted-foreground font-bold text-xs short:text-[0.7rem] uppercase">Total resgatado</span>
					<span className="font-black text-brand-secondary short:text-xs">{formatCashbackValue(valor, terminology)}</span>
				</div>
				<div className="flex justify-between items-center">
					<span className="text-muted-foreground font-bold text-xs short:text-[0.7rem] uppercase">Saldo</span>
					<div className="flex items-center gap-2 short:gap-1">
						<span className="font-bold text-sm short:text-xs text-muted-foreground">{formatCashbackValue(availableBalance, terminology)}</span>
						<ArrowRight className="w-3 h-3 text-muted-foreground" />
						<span className="font-black text-sm short:text-xs text-brand">{formatCashbackValue(Math.max(0, balanceAfter), terminology)}</span>
					</div>
				</div>
			</div>

			<OperatorConfirmationInput value={operatorIdentifier} onChange={onOperatorIdentifierChange} useVirtualKeyboard />
		</form>
	);
}
