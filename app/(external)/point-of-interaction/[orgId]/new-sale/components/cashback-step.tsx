"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatToMoney } from "@/lib/formatting";
import { useAutoScrollOnFocus } from "@/lib/hooks/use-auto-scroll-on-focus";
import { cn } from "@/lib/utils";
import { getLimitDescription } from "../../_shared/helpers/redemption-limit";
import type { TRedemptionLimit } from "../../_shared/types";
import { AlertTriangle, BadgePercent, CreditCard } from "lucide-react";

type CashbackStepProps = {
	available: number;
	maxAllowed: number;
	applied: boolean;
	amount: number;
	isAttemptingToUseMoreCashbackThanAllowed: boolean;
	onToggle: (applied: boolean) => void;
	onAmountChange: (amount: number) => void;
	saleValue: number;
	finalValue: number;
	redemptionLimit: TRedemptionLimit;
	onSubmit: () => void;
};

export function CashbackStep({
	available,
	maxAllowed,
	applied,
	amount,
	isAttemptingToUseMoreCashbackThanAllowed,
	onToggle,
	onAmountChange,
	saleValue,
	finalValue,
	redemptionLimit,
	onSubmit,
}: CashbackStepProps) {
	const handleScrollOnFocus = useAutoScrollOnFocus(300);
	const limitDescription = getLimitDescription(redemptionLimit);

	return (
		<form
			className="space-y-6 short:space-y-2 animate-in fade-in slide-in-from-bottom-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			<div className="bg-brand/5 rounded-3xl short:rounded-xl p-6 short:p-2.5 border-2 short:border border-dashed border-brand/20">
				<div className="flex justify-between items-center mb-4 short:mb-2">
					<div className="flex items-center gap-3 short:gap-1.5">
						<div className="p-2 short:p-1 bg-green-100 rounded-lg short:rounded text-green-600">
							<CreditCard className="w-5 h-5 short:w-3.5 short:h-3.5" />
						</div>
						<h3 className="font-black uppercase italic short:text-xs">Usar Cashback?</h3>
					</div>
					<div className={cn("inline-flex items-center rounded-full p-1 border border-brand/20 bg-white/80 shadow-sm", available === 0 && "opacity-60")}>
						<button
							type="button"
							onClick={() => onToggle(true)}
							disabled={available === 0}
							aria-pressed={applied}
							className={cn(
								"h-8 short:h-7 px-4 short:px-2.5 rounded-full text-xs short:text-[0.7rem] font-black uppercase tracking-wide transition-all",
								applied ? "bg-brand text-brand-foreground shadow-sm" : "text-brand hover:bg-brand/10",
								available === 0 && "cursor-not-allowed hover:bg-transparent",
							)}
						>
							Sim
						</button>
						<button
							type="button"
							onClick={() => onToggle(false)}
							disabled={available === 0}
							aria-pressed={!applied}
							className={cn(
								"h-8 short:h-7 px-4 short:px-2.5 rounded-full text-xs short:text-[0.7rem] font-black uppercase tracking-wide transition-all",
								!applied ? "bg-brand text-brand-foreground shadow-sm" : "text-brand hover:bg-brand/10",
								available === 0 && "cursor-not-allowed hover:bg-transparent",
							)}
						>
							Não
						</button>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-4 short:gap-1.5">
					<div className="bg-white p-4 short:p-2 rounded-2xl short:rounded-lg shadow-sm border border-brand/20">
						<p className="text-[0.6rem] short:text-[0.6rem] font-bold text-muted-foreground uppercase">Seu Saldo</p>
						<p className="text-xl short:text-base font-black text-green-600">{formatToMoney(available)}</p>
					</div>
					<div className="bg-white p-4 short:p-2 rounded-2xl short:rounded-lg shadow-sm border border-brand/20">
						<p className="text-[0.6rem] short:text-[0.6rem] font-bold text-muted-foreground uppercase">Limite p/ esta compra</p>
						<p className="text-xl short:text-base font-black text-brand">{formatToMoney(maxAllowed)}</p>
					</div>
				</div>
				{limitDescription && (
					<p className="text-[0.65rem] short:text-[0.6rem] font-medium text-muted-foreground text-center mt-2 short:mt-1 italic">
						{limitDescription}
					</p>
				)}
			</div>

			{applied && (
				<div className="space-y-2 short:space-y-0.5 max-w-xs mx-auto text-center animate-in zoom-in">
					<Label className="font-bold text-xs short:text-[0.65rem] text-muted-foreground uppercase tracking-widest">Valor a Resgatar</Label>
					<Input
						type="number"
						max={maxAllowed}
						value={amount}
						onChange={(e) => onAmountChange(Number(e.target.value))}
						className="h-16 short:h-11 text-3xl short:text-2xl font-black text-center rounded-2xl short:rounded-lg border-2 short:border border-green-200 bg-green-50/30"
						onFocus={handleScrollOnFocus}
					/>
				</div>
			)}

			<div className="bg-brand rounded-3xl short:rounded-xl p-8 short:p-3 text-brand-foreground shadow-2xl relative overflow-hidden">
				<div className="relative z-10 flex flex-col gap-4 short:gap-1">
					<div className="flex justify-between items-center opacity-60">
						<span className="text-sm short:text-[0.7rem] font-bold uppercase tracking-widest">Subtotal</span>
						<span className="font-bold short:text-xs">{formatToMoney(saleValue)}</span>
					</div>
					{applied && (
						<div className="flex justify-between items-center text-green-400">
							<span className="text-sm short:text-[0.7rem] font-bold uppercase tracking-widest">Desconto Cashback</span>
							<span className="font-bold short:text-xs">- {formatToMoney(amount)}</span>
						</div>
					)}
					<div className="h-px bg-background my-2 short:my-0.5" />
					<div className="flex justify-between items-end">
						<span className="text-lg short:text-sm font-black uppercase italic">Total a Pagar</span>
						<span className="text-4xl short:text-xl font-black text-brand-foreground">{formatToMoney(finalValue)}</span>
					</div>
				</div>
				<BadgePercent className="absolute -right-4 -bottom-4 w-32 h-32 short:w-16 short:h-16 text-white/5 rotate-12" />
			</div>
			{isAttemptingToUseMoreCashbackThanAllowed && (
				<div className="w-full flex items-center justify-center">
					<div className="w-fit self-center flex items-center justify-center px-2 py-1 short:px-1.5 short:py-0.5 bg-red-200 text-red-600 rounded-2xl short:rounded-lg gap-1.5 short:gap-1">
						<AlertTriangle className="w-4 h-4 short:w-3 short:h-3" />
						<p className="text-[0.65rem] short:text-[0.6rem] font-medium text-center italic">
							O valor do cashback não pode ser maior que o valor máximo permitido.
						</p>
					</div>
				</div>
			)}
		</form>
	);
}
