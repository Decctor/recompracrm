"use client";

import { Input } from "@/components/ui/input";
import { VirtualKeyboard } from "@/components/ui/virtual-keyboard";
import { formatCashbackValue, getCashbackUnitLabel } from "@/lib/formatting";
import { useAutoScrollOnFocus } from "@/lib/hooks/use-auto-scroll-on-focus";
import { FREE_FORM_REWARD_DESCRIPTION_MAX_LENGTH } from "@/lib/point-of-interaction/free-form-reward";
import { cn } from "@/lib/utils";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { Gift } from "lucide-react";

// Tolerância de ponto flutuante ao comparar o débito com o saldo.
const BALANCE_EPSILON = 0.0001;

type FreeFormRewardStepProps = {
	mode: "kiosk" | "mobile";
	terminology: TCashbackProgramTerminologyEnum;
	availableBalance: number;
	descricao: string;
	valor: number | null;
	onChange: (changes: { descricao?: string; valor?: number | null }) => void;
	onSubmit: () => void;
};

/**
 * Recompensa avulsa: o prêmio não está no catálogo, então quem atende descreve o que o cliente leva.
 * No totem, o valor a debitar é digitado aqui e o operador o confirma com a senha no passo seguinte.
 * No celular do cliente só existe a descrição: quem define o débito é o operador, na aprovação.
 */
export function FreeFormRewardStep({ mode, terminology, availableBalance, descricao, valor, onChange, onSubmit }: FreeFormRewardStepProps) {
	const handleScrollOnFocus = useAutoScrollOnFocus(300);
	const isKiosk = mode === "kiosk";
	const isPoints = terminology === "PONTOS";
	const unitLabel = getCashbackUnitLabel(terminology);
	const debit = valor ?? 0;
	const remainingBalance = availableBalance - debit;
	const exceedsBalance = remainingBalance < -BALANCE_EPSILON;

	return (
		<form
			className="space-y-8 short:space-y-2 animate-in fade-in slide-in-from-bottom-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			<div className="text-center space-y-2 short:space-y-0.5">
				<div className="mx-auto w-fit p-3 short:p-1.5 rounded-2xl short:rounded-lg bg-brand-secondary text-brand-secondary-foreground">
					<Gift className="w-6 h-6 short:w-4 short:h-4" />
				</div>
				<h2 className="text-xl short:text-lg font-extrabold tracking-tight">{isKiosk ? "Qual é a recompensa?" : "O que você quer resgatar?"}</h2>
				<p className="text-muted-foreground short:text-xs">
					{isKiosk
						? `Descreva o que o cliente vai levar e quantos ${unitLabel} debitar do saldo.`
						: `Descreva a recompensa. O operador confirma quantos ${unitLabel} serão debitados.`}
				</p>
				<p className="text-sm short:text-xs text-muted-foreground">
					Saldo disponível: <span className="font-bold">{formatCashbackValue(availableBalance, terminology)}</span>
				</p>
			</div>

			<div className="max-w-md mx-auto w-full flex flex-col gap-4 short:gap-2">
				<div className="flex flex-col gap-1.5">
					<span className="text-[0.7rem] short:text-[0.6rem] font-black uppercase tracking-widest text-muted-foreground">Recompensa</span>
					{isKiosk ? (
						<VirtualKeyboard
							type="text"
							label="Recompensa"
							description="Descreva o que o cliente vai levar."
							placeholder="Ex: Kit churrasco"
							value={descricao}
							onChange={(value) => onChange({ descricao: value })}
							maxLength={FREE_FORM_REWARD_DESCRIPTION_MAX_LENGTH}
							confirmLabel="Confirmar recompensa"
							triggerClassName="h-14 short:h-11 justify-start text-left px-4 rounded-2xl short:rounded-lg border border-brand/20 hover:border-brand text-base font-bold"
						/>
					) : (
						<Input
							type="text"
							enterKeyHint="go"
							autoComplete="off"
							placeholder="Ex: Kit churrasco"
							maxLength={FREE_FORM_REWARD_DESCRIPTION_MAX_LENGTH}
							value={descricao}
							onChange={(e) => onChange({ descricao: e.target.value })}
							onFocus={handleScrollOnFocus}
							className="h-14 rounded-2xl border border-brand/20 focus:border-brand px-4 text-base font-bold"
						/>
					)}
				</div>

				{isKiosk ? (
					<div className="flex flex-col gap-1.5">
						<span className="text-[0.7rem] short:text-[0.6rem] font-black uppercase tracking-widest text-muted-foreground">Valor a debitar</span>
						<VirtualKeyboard
							type="currency"
							label={`Valor a debitar em ${unitLabel}`}
							description={`Saldo disponível: ${formatCashbackValue(availableBalance, terminology)}.`}
							value={debit}
							onChange={(value) => onChange({ valor: value > 0 ? value : null })}
							fractionDigits={isPoints ? 0 : 2}
							formatValue={(value) => formatCashbackValue(value, terminology)}
							allowClear
							confirmLabel="Usar valor"
							placeholder={formatCashbackValue(0, terminology)}
							triggerClassName={cn(
								"h-16 short:h-14 text-3xl short:text-2xl font-extrabold rounded-2xl short:rounded-xl border hover:border-brand",
								exceedsBalance ? "border-red-400 bg-red-50/40" : "border-brand/20",
							)}
						/>
						<p className={cn("text-sm short:text-xs text-center", exceedsBalance ? "font-bold text-red-600" : "text-muted-foreground")}>
							{exceedsBalance
								? "O saldo do cliente não cobre esse valor."
								: `Saldo após o resgate: ${formatCashbackValue(Math.max(0, remainingBalance), terminology)}`}
						</p>
					</div>
				) : null}
			</div>
		</form>
	);
}
