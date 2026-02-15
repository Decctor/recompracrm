"use client";

import { cn } from "@/lib/utils";
import type { TPrize } from "../../_shared/types";
import { Gift } from "lucide-react";
import Image from "next/image";
import React from "react";

type PrizeCardProps = {
	prize: TPrize;
	isDisabled: boolean;
	onSelect: () => void;
};

export const PrizeCard = React.memo(function PrizeCard({ prize, isDisabled, onSelect }: PrizeCardProps) {
	return (
		<button
			type="button"
			onClick={() => !isDisabled && onSelect()}
			disabled={isDisabled}
			className={cn(
				"flex items-center gap-3 short:gap-2 rounded-2xl short:rounded-xl border-2 overflow-hidden transition-all text-left p-2 short:p-1.5",
				isDisabled
					? "opacity-50 cursor-not-allowed border-muted bg-muted/30"
					: "border-brand/20 hover:border-brand hover:shadow-lg cursor-pointer bg-card",
			)}
		>
			<div className="relative w-16 h-16 short:w-12 short:h-12 min-w-16 short:min-w-12 rounded-xl short:rounded-lg overflow-hidden bg-muted shrink-0">
				{prize.imagemCapaUrl ? (
					<Image src={prize.imagemCapaUrl} alt={prize.titulo} fill className="object-cover" />
				) : (
					<div className="flex h-full w-full items-center justify-center bg-brand/10 text-brand">
						<Gift className="w-6 h-6 short:w-4 short:h-4" />
					</div>
				)}
			</div>
			<div className="flex-1 min-w-0 flex flex-col gap-0.5">
				<h3 className="font-black text-sm short:text-xs uppercase tracking-tight truncate">{prize.titulo}</h3>
				{prize.descricao && <p className="text-xs short:text-[0.65rem] text-muted-foreground line-clamp-1">{prize.descricao}</p>}
				<div className="flex items-center gap-2 mt-0.5">
					<span className="font-black text-base short:text-sm text-brand">{prize.valor} créditos</span>
					{isDisabled && <span className="text-[0.6rem] font-bold text-red-500 uppercase">Saldo insuficiente</span>}
				</div>
			</div>
		</button>
	);
});
