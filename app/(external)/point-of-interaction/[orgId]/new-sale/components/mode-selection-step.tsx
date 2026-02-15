"use client";

import { BadgePercent, Gift } from "lucide-react";
import React from "react";

type ModeSelectionStepProps = {
	onSelectMode: (mode: "discount" | "prize") => void;
};

export const ModeSelectionStep = React.memo(function ModeSelectionStep({ onSelectMode }: ModeSelectionStepProps) {
	return (
		<div className="space-y-8 short:space-y-3 animate-in fade-in slide-in-from-bottom-4">
			<div className="text-center space-y-2 short:space-y-0.5">
				<h2 className="text-xl short:text-lg font-black uppercase tracking-tight">O que deseja fazer?</h2>
				<p className="text-muted-foreground short:text-xs">Escolha entre usar desconto ou resgatar uma recompensa.</p>
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 short:gap-2 max-w-2xl mx-auto">
				<button
					type="button"
					onClick={() => onSelectMode("discount")}
					className="group flex flex-col items-center gap-4 short:gap-2 p-8 short:p-4 bg-brand/5 border-2 border-brand/20 rounded-3xl short:rounded-xl hover:border-brand hover:bg-brand/10 transition-all cursor-pointer"
				>
					<div className="p-4 short:p-2 bg-brand/10 rounded-2xl short:rounded-lg text-brand group-hover:bg-brand group-hover:text-brand-foreground transition-all">
						<BadgePercent className="w-10 h-10 short:w-6 short:h-6" />
					</div>
					<div className="text-center">
						<h3 className="font-black text-lg short:text-sm uppercase tracking-tight">PONTUAR E OBTER DESCONTOS</h3>
						<p className="text-xs short:text-[0.7rem] text-muted-foreground mt-1">Registre a compra e utilize o saldo como desconto</p>
					</div>
				</button>
				<button
					type="button"
					onClick={() => onSelectMode("prize")}
					className="group flex flex-col items-center gap-4 short:gap-2 p-8 short:p-4 bg-amber-50 border-2 border-amber-200 rounded-3xl short:rounded-xl hover:border-amber-400 hover:bg-amber-100 transition-all cursor-pointer"
				>
					<div className="p-4 short:p-2 bg-amber-100 rounded-2xl short:rounded-lg text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-all">
						<Gift className="w-10 h-10 short:w-6 short:h-6" />
					</div>
					<div className="text-center">
						<h3 className="font-black text-lg short:text-sm uppercase tracking-tight">PONTUAR E RESGATAR RECOMPENSA</h3>
						<p className="text-xs short:text-[0.7rem] text-muted-foreground mt-1">Use seu saldo para resgatar uma recompensa disponível</p>
					</div>
				</button>
			</div>
		</div>
	);
});
