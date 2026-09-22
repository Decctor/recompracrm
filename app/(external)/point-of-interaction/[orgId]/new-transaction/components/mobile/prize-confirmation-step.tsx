"use client";

import { Button } from "@/components/ui/button";
import { formatCashbackValue, formatToMoney } from "@/lib/formatting";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import type { TSelectedPrize } from "../../../_shared/types";
import { Gift, ShieldCheck } from "lucide-react";
import Image from "next/image";

type MobilePrizeConfirmationStepProps = {
	clientName: string;
	/** Cesta do resgate: uma entrada por recompensa distinta, com quantidade. */
	selectedPrizes: TSelectedPrize[];
	availableBalance: number;
	terminology: TCashbackProgramTerminologyEnum;
	isSubmitting: boolean;
	onSubmit: () => void;
};

export function MobilePrizeConfirmationStep({
	clientName,
	selectedPrizes,
	availableBalance,
	terminology,
	isSubmitting,
	onSubmit,
}: MobilePrizeConfirmationStepProps) {
	const totalDebit = selectedPrizes.reduce((sum, { prize, quantity }) => sum + prize.valor * quantity, 0);
	const commercialValue = selectedPrizes.reduce((sum, { prize, quantity }) => sum + prize.valorVenda * quantity, 0);
	const totalUnits = selectedPrizes.reduce((sum, { quantity }) => sum + quantity, 0);
	const balanceAfter = availableBalance - totalDebit;
	const finalValue = Math.max(0, commercialValue - totalDebit);
	return (
		<div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
			<div className="space-y-2 text-center">
				<p className="text-xs font-bold uppercase tracking-[0.25em] text-brand/70">Aprovação do operador</p>
				<h2 className="text-2xl font-black tracking-tight">Confira o resgate antes de enviar</h2>
				<p className="text-sm text-muted-foreground">O operador confirma este resgate direto no painel da loja.</p>
			</div>

			{/* Uma linha por recompensa; a mesma recompensa repetida aparece como ×N */}
			{selectedPrizes.length > 0 ? (
				<div className="rounded-3xl border border-brand-secondary/20 bg-brand-secondary/5 divide-y divide-brand-secondary/15">
					{selectedPrizes.map(({ prize, quantity }) => (
						<div key={prize.id} className="flex items-center gap-4 p-4">
							<div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-brand-secondary">
								{prize.imagemCapaUrl ? (
									<Image src={prize.imagemCapaUrl} alt={prize.titulo} fill className="object-cover" />
								) : (
									<div className="flex h-full w-full items-center justify-center text-brand-secondary-foreground">
										<Gift className="h-6 w-6" />
									</div>
								)}
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-base font-bold tracking-tight">
									{prize.titulo}
									{quantity > 1 && <span className="ml-2 font-black text-brand-secondary">×{quantity}</span>}
								</p>
								<p className="text-lg font-black text-brand-secondary">
									{formatCashbackValue(prize.valor * quantity, terminology)}
									{quantity > 1 && (
										<span className="ml-2 text-xs font-bold text-muted-foreground">
											({quantity} × {formatCashbackValue(prize.valor, terminology)})
										</span>
									)}
								</p>
								<p className="text-xs text-muted-foreground">Valor comercial: {formatToMoney(prize.valorVenda * quantity)}</p>
							</div>
						</div>
					))}
				</div>
			) : null}

			<div className="rounded-3xl border border-brand/15 bg-card p-5 shadow-sm space-y-4">
				<div className="flex items-center justify-between gap-3 rounded-2xl bg-brand/5 px-4 py-3">
					<span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Cliente</span>
					<span className="text-sm font-black text-brand text-right">{clientName}</span>
				</div>
				<div className="flex items-center justify-between gap-3 rounded-2xl bg-brand/5 px-4 py-3">
					<span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recompensas</span>
					<span className="text-sm font-black">
						{totalUnits} {totalUnits === 1 ? "unidade" : "unidades"}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3 rounded-2xl bg-brand/5 px-4 py-3">
					<span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total resgatado</span>
					<span className="text-sm font-black text-brand-secondary">{formatCashbackValue(totalDebit, terminology)}</span>
				</div>
				<div className="flex items-center justify-between gap-3 rounded-2xl bg-brand/5 px-4 py-3">
					<span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Saldo atual</span>
					<span className="text-sm font-black">{formatCashbackValue(availableBalance, terminology)}</span>
				</div>
				<div className="flex items-center justify-between gap-3 rounded-2xl bg-brand/5 px-4 py-3">
					<span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Saldo após resgate</span>
					<span className="text-sm font-black">{formatCashbackValue(Math.max(0, balanceAfter), terminology)}</span>
				</div>
				<div className="flex items-center justify-between gap-3 rounded-2xl bg-brand/5 px-4 py-3">
					<span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Valor dos produtos</span>
					<span className="text-sm font-black">{formatToMoney(commercialValue)}</span>
				</div>
				<div className="flex items-center justify-between gap-3 rounded-2xl bg-brand/5 px-4 py-3">
					<span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Valor final</span>
					<span className="text-sm font-black text-brand">{formatToMoney(finalValue)}</span>
				</div>
				<div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
					<ShieldCheck className="mt-0.5 h-4 w-4 text-brand" />
					<p>Assim que o operador aprovar, o resgate aparece concluído nesta tela.</p>
				</div>
			</div>

			<Button onClick={onSubmit} size="lg" disabled={isSubmitting || selectedPrizes.length === 0} className="h-12 w-full rounded-2xl text-sm font-bold">
				{isSubmitting ? "Enviando..." : "Enviar para aprovação"}
			</Button>
		</div>
	);
}
