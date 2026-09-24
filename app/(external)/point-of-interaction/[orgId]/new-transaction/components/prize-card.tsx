"use client";

import { formatCashbackValue, formatToMoney } from "@/lib/formatting";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { cn } from "@/lib/utils";
import type { TPrize } from "../../_shared/types";
import { Gift, Minus, Plus } from "lucide-react";
import Image from "next/image";
import React from "react";

type PrizeCardProps = {
	prize: TPrize;
	terminology: TCashbackProgramTerminologyEnum;
	/** Unidades desta recompensa já na cesta (0 = não selecionada). */
	selectedQuantity: number;
	/** O saldo restante não cobre mais uma unidade. Numa carta já selecionada só trava o "+". */
	isDisabled: boolean;
	/** Teto de unidades por linha (o servidor recusa acima disso). */
	maxQuantity: number;
	onIncrement: () => void;
	onDecrement: () => void;
};

// Cartas tocadas em tela de totem: alvos de toque de no mínimo 44px (h-11 / size-11).
export const PrizeCard = React.memo(function PrizeCard({
	prize,
	terminology,
	selectedQuantity,
	isDisabled,
	maxQuantity,
	onIncrement,
	onDecrement,
}: PrizeCardProps) {
	const isSelected = selectedQuantity > 0;
	const canIncrement = !isDisabled && selectedQuantity < maxQuantity;
	const isUnavailable = isDisabled && !isSelected;

	return (
		<div
			className={cn(
				"flex items-center gap-3 short:gap-2 rounded-2xl short:rounded-xl border overflow-hidden transition-all p-2 short:p-1.5",
				isUnavailable
					? "opacity-50 border-muted bg-muted/30"
					: isSelected
						? "border-brand ring-2 ring-brand/30 bg-brand/5 shadow-sm"
						: "border-brand/20 hover:border-brand hover:shadow-sm bg-card",
			)}
		>
			<button
				type="button"
				onClick={() => canIncrement && onIncrement()}
				disabled={!canIncrement}
				aria-label={isSelected ? `Adicionar mais uma unidade de ${prize.titulo}` : `Selecionar ${prize.titulo}`}
				className={cn(
					"flex flex-1 min-w-0 min-h-11 items-center gap-3 short:gap-2 text-left rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
					canIncrement ? "cursor-pointer" : "cursor-not-allowed",
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
					<h3 className="font-bold text-sm short:text-xs tracking-tight truncate">{prize.titulo}</h3>
					{prize.descricao && <p className="text-xs short:text-[0.65rem] text-muted-foreground line-clamp-1">{prize.descricao}</p>}
					<p className="text-[0.65rem] short:text-[0.6rem] text-muted-foreground">Valor comercial: {formatToMoney(prize.valorVenda)}</p>
					<div className="flex items-center gap-2 mt-0.5 flex-wrap">
						<span className="font-black text-base short:text-sm text-brand">{formatCashbackValue(prize.valor, terminology)}</span>
						{isUnavailable && <span className="text-[0.6rem] font-bold text-red-500 uppercase">Saldo insuficiente</span>}
						{isSelected && !canIncrement && (
							<span className="text-[0.6rem] font-bold text-muted-foreground uppercase">
								{selectedQuantity >= maxQuantity ? "Quantidade máxima" : "Saldo insuficiente para mais uma"}
							</span>
						)}
					</div>
				</div>
			</button>

			{isSelected ? (
				<div className="flex items-center gap-1 short:gap-0.5 shrink-0 rounded-xl bg-brand text-brand-foreground p-1 short:p-0.5">
					<button
						type="button"
						onClick={onDecrement}
						aria-label={`Remover uma unidade de ${prize.titulo}`}
						className="flex size-11 short:size-9 items-center justify-center rounded-lg hover:bg-brand-foreground/15 active:bg-brand-foreground/25 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-foreground/60"
					>
						<Minus className="w-5 h-5 short:w-4 short:h-4" />
					</button>
					<span className="min-w-8 text-center font-black text-lg short:text-base tabular-nums" aria-live="polite">
						{selectedQuantity}
					</span>
					<button
						type="button"
						onClick={onIncrement}
						disabled={!canIncrement}
						aria-label={`Adicionar uma unidade de ${prize.titulo}`}
						className="flex size-11 short:size-9 items-center justify-center rounded-lg hover:bg-brand-foreground/15 active:bg-brand-foreground/25 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-foreground/60 disabled:opacity-40 disabled:cursor-not-allowed"
					>
						<Plus className="w-5 h-5 short:w-4 short:h-4" />
					</button>
				</div>
			) : (
				<div
					aria-hidden="true"
					className={cn(
						"flex size-11 short:size-9 shrink-0 items-center justify-center rounded-xl",
						isUnavailable ? "bg-muted text-muted-foreground" : "bg-brand/10 text-brand",
					)}
				>
					<Plus className="w-5 h-5 short:w-4 short:h-4" />
				</div>
			)}
		</div>
	);
});
