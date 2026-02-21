"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatToMoney } from "@/lib/formatting";
import { useAutoScrollOnFocus } from "@/lib/hooks/use-auto-scroll-on-focus";
import { cn } from "@/lib/utils";
import { AlertTriangle, BadgePercent, CreditCard, ShoppingCart } from "lucide-react";
import { getLimitDescription } from "../../_shared/helpers/redemption-limit";
import type { TRedemptionLimit } from "../../_shared/types";

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
			<div className="flex flex-col md:flex-row gap-6 short:gap-3">
				{/* Left Block - Cashback Usage */}
				<div className="flex-1 bg-card rounded-3xl short:rounded-xl p-6 short:p-4 border-2 border-brand/5 shadow-sm flex flex-col gap-6 short:gap-3">
					<div className="flex justify-between items-center">
						<div className="flex items-center gap-3 short:gap-1.5">
							<div className="p-2 short:p-1 bg-green-100 rounded-lg short:rounded text-green-600">
								<CreditCard className="w-5 h-5 short:w-3.5 short:h-3.5" />
							</div>
							<h3 className="font-black uppercase italic short:text-xs">Usar Cashback?</h3>
						</div>
						<div
							className={cn("inline-flex items-center rounded-full p-1 border border-brand/20 bg-background shadow-sm", available === 0 && "opacity-60")}
						>
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
						<div className="bg-brand/5 p-4 short:p-2 rounded-2xl short:rounded-lg border border-brand/10">
							<p className="text-[0.6rem] short:text-[0.6rem] font-bold text-muted-foreground uppercase">Seu Saldo</p>
							<p className="text-xl short:text-base font-black text-green-600">{formatToMoney(available)}</p>
						</div>
						<div className="bg-brand/5 p-4 short:p-2 rounded-2xl short:rounded-lg border border-brand/10">
							<p className="text-[0.6rem] short:text-[0.6rem] font-bold text-muted-foreground uppercase">Limite p/ esta compra</p>
							<p className="text-xl short:text-base font-black text-brand">{formatToMoney(maxAllowed)}</p>
						</div>
					</div>

					{limitDescription && (
						<p className="text-[0.65rem] short:text-[0.6rem] font-medium text-muted-foreground text-center italic">{limitDescription}</p>
					)}

					{applied && (
						<div className="space-y-2 short:space-y-0.5 mt-auto pt-2 animate-in zoom-in">
							<Label className="font-bold text-xs short:text-[0.65rem] text-muted-foreground uppercase tracking-widest text-center block">
								Valor a Resgatar
							</Label>
							<Input
								type="number"
								max={maxAllowed}
								value={amount}
								onChange={(e) => onAmountChange(Number(e.target.value))}
								className="h-14 short:h-11 text-2xl short:text-xl font-black text-center rounded-2xl short:rounded-lg border-2 short:border border-green-200 bg-green-50/30"
								onFocus={handleScrollOnFocus}
							/>
						</div>
					)}
				</div>

				{/* Right Block - Checkout Summary */}
				<div className="flex-1 bg-brand rounded-3xl short:rounded-xl p-6 short:p-4 text-brand-foreground shadow-2xl relative overflow-hidden flex flex-col">
					<div className="relative z-10 flex flex-col h-full">
						<div className="flex items-center gap-3 short:gap-1.5">
							<div className="p-2 short:p-1 bg-white/20 rounded-lg short:rounded text-white">
								<ShoppingCart className="w-5 h-5 short:w-3.5 short:h-3.5" />
							</div>
							<h3 className="font-black uppercase italic short:text-xs text-white">Resumo da Venda</h3>
						</div>

						<div className="flex flex-col gap-4 short:gap-2 mt-auto pt-6 short:pt-3">
							<div className="flex justify-between items-center opacity-80">
								<span className="text-sm short:text-[0.7rem] font-bold uppercase tracking-widest">Subtotal</span>
								<span className="font-bold text-lg short:text-sm">{formatToMoney(saleValue)}</span>
							</div>
							{applied && (
								<div className="flex justify-between items-center text-white">
									<span className="text-sm short:text-[0.7rem] font-black uppercase tracking-widest">Desconto Cashback</span>
									<span className="font-black text-lg short:text-sm">- {formatToMoney(amount)}</span>
								</div>
							)}
						</div>

						<div className="h-px bg-background/20 my-4 short:my-2" />

						<div className="flex flex-col gap-1 short:gap-0">
							<span className="text-sm short:text-[0.7rem] font-bold uppercase tracking-widest opacity-80">Total a Pagar</span>
							<span className="text-5xl lg:text-5xl md:text-4xl short:text-3xl font-black text-brand-foreground tracking-tighter">
								{formatToMoney(finalValue)}
							</span>
						</div>
					</div>
					<BadgePercent className="absolute -right-8 -bottom-8 w-48 h-48 short:w-24 short:h-24 text-white/5 rotate-12" />
				</div>
			</div>

			{isAttemptingToUseMoreCashbackThanAllowed && (
				<div className="w-full flex items-center justify-center animate-in slide-in-from-top-2 fade-in">
					<div className="w-fit self-center flex items-center justify-center px-4 py-2 short:px-2 short:py-1 bg-red-100 border border-red-200 text-red-600 rounded-2xl short:rounded-lg gap-2 short:gap-1 shadow-sm">
						<AlertTriangle className="w-5 h-5 short:w-3.5 short:h-3.5" />
						<p className="text-xs short:text-[0.65rem] font-medium text-center italic">
							O valor a resgatar não pode ser maior que o limite de {formatToMoney(maxAllowed)}.
						</p>
					</div>
				</div>
			)}
		</form>
	);
}
