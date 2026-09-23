"use client";

import { formatCashbackValue, formatToMoney } from "@/lib/formatting";
import type { TPoiPrizeLine } from "@/lib/point-of-interaction/prize-lines";
import { sumPoiPrizeSaleValue, sumPoiPrizeValue } from "@/lib/point-of-interaction/prize-lines";
import { MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE } from "@/lib/sales/sale-reward-snapshot";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Gift, LayoutGrid, List, ShoppingCart } from "lucide-react";
import Image from "next/image";
import React from "react";
import type { TPrize } from "../../_shared/types";
import { PrizeCard } from "./prize-card";

const FALLBACK_GROUP = "Outros";
const SHOW_TOGGLE_THRESHOLD = 4;
// Tolerância de ponto flutuante ao comparar o valor da recompensa com o saldo restante.
const BALANCE_EPSILON = 0.0001;

type PrizeSelectionStepProps = {
	programAllowsAccumulationViaPOI: boolean;
	prizes: TPrize[];
	/** Linhas já na cesta (uma por recompensa distinta, com quantidade). */
	selectedLines: TPoiPrizeLine[];
	availableBalance: number;
	terminology: TCashbackProgramTerminologyEnum;
	onAddPrize: (prize: TPrize) => void;
	onSetQuantity: (prizeId: string, quantity: number) => void;
	onContinue: () => void;
	onContinueWithoutPrize: () => void;
};

export function PrizeSelectionStep({
	programAllowsAccumulationViaPOI,
	prizes,
	selectedLines,
	availableBalance,
	terminology,
	onAddPrize,
	onSetQuantity,
	onContinue,
	onContinueWithoutPrize,
}: PrizeSelectionStepProps) {
	const [viewMode, setViewMode] = React.useState<"categories" | "list">("list");
	const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);

	const categories = React.useMemo(() => {
		const groupSet = new Set<string>();
		for (const prize of prizes) {
			groupSet.add(prize.produto?.grupo ?? FALLBACK_GROUP);
		}
		return Array.from(groupSet).sort();
	}, [prizes]);

	const groupedPrizes = React.useMemo(() => {
		const groups: Record<string, TPrize[]> = {};
		for (const prize of prizes) {
			const group = prize.produto?.grupo ?? FALLBACK_GROUP;
			if (!groups[group]) groups[group] = [];
			groups[group].push(prize);
		}
		for (const group of Object.keys(groups)) {
			groups[group].sort((a, b) => a.valor - b.valor);
		}
		return groups;
	}, [prizes]);

	const sortedPrizes = React.useMemo(() => {
		return [...prizes].sort((a, b) => a.valor - b.valor);
	}, [prizes]);

	const quantityByPrizeId = React.useMemo(() => {
		const map = new Map<string, number>();
		for (const line of selectedLines) map.set(line.prizeId, line.quantity);
		return map;
	}, [selectedLines]);

	// A elegibilidade de "mais uma" é sempre contra o saldo RESTANTE (saldo − cesta), nunca o saldo cheio.
	const totalDebit = sumPoiPrizeValue(selectedLines);
	const totalCommercialValue = sumPoiPrizeSaleValue(selectedLines);
	const remainingBalance = availableBalance - totalDebit;
	const selectedUnits = selectedLines.reduce((sum, line) => sum + line.quantity, 0);
	const hasSelection = selectedUnits > 0;

	const showToggle = prizes.length > SHOW_TOGGLE_THRESHOLD || categories.length > 1;

	const handleViewModeChange = (mode: "categories" | "list") => {
		setViewMode(mode);
		setSelectedCategory(null);
	};

	const renderPrizeCard = (prize: TPrize) => {
		const selectedQuantity = quantityByPrizeId.get(prize.id) ?? 0;
		return (
			<PrizeCard
				key={prize.id}
				prize={prize}
				terminology={terminology}
				selectedQuantity={selectedQuantity}
				isDisabled={prize.valor > remainingBalance + BALANCE_EPSILON}
				maxQuantity={MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE}
				onIncrement={() => onAddPrize(prize)}
				onDecrement={() => onSetQuantity(prize.id, selectedQuantity - 1)}
			/>
		);
	};

	return (
		<div className="space-y-6 short:space-y-2 animate-in fade-in slide-in-from-bottom-4">
			{programAllowsAccumulationViaPOI ? (
				<div className="w-full flex items-center flex-col justify-center gap-1.5">
					<Button
						type="button"
						variant="none"
						size="fit"
						onClick={onContinueWithoutPrize}
						className="group bg-brand-secondary text-brand-secondary-foreground flex flex-col w-full max-w-sm mx-auto rounded-2xl short:rounded-xl font-bold px-4 py-3 short:px-3 short:py-2.5"
					>
						<div className="flex items-center justify-center gap-3">
							<div className="p-2 short:p-1.5 bg-brand-secondary-foreground text-brand-secondary rounded-xl">
								<ShoppingCart className="w-4 h-4 shrink-0" />
							</div>
							<span className="text-[0.55rem] sm:text-[0.65rem] lg:text-xs text-center leading-tight">Clique para apenas pontuar</span>
						</div>
					</Button>
				</div>
			) : null}
			<div className="text-center space-y-2 short:space-y-0.5">
				<h2 className="text-xl short:text-lg font-extrabold tracking-tight">Escolha as recompensas</h2>
				<p className="text-muted-foreground short:text-xs">Toque para adicionar. A mesma recompensa pode ser resgatada mais de uma vez.</p>
				<div className="flex items-center justify-center gap-x-4 gap-y-1 flex-wrap text-sm short:text-xs">
					<p className="text-muted-foreground">
						Saldo disponível: <span className="font-bold">{formatCashbackValue(availableBalance, terminology)}</span>
					</p>
					<p className="text-muted-foreground">
						Saldo restante:{" "}
						<span className={cn("font-black", remainingBalance > BALANCE_EPSILON ? "text-green-600" : "text-muted-foreground")}>
							{formatCashbackValue(Math.max(0, remainingBalance), terminology)}
						</span>
					</p>
				</div>
				{showToggle && (
					<div className="flex items-center justify-center gap-1 pt-1">
						<Button
							type="button"
							variant={viewMode === "list" ? "default" : "ghost"}
							size="fit"
							className="flex items-center gap-2 rounded-lg p-2"
							onClick={() => handleViewModeChange("list")}
						>
							<List className="w-4 h-4" />
							LISTAGEM
						</Button>
						<Button
							type="button"
							variant={viewMode === "categories" ? "default" : "ghost"}
							size="fit"
							className="flex items-center gap-2 rounded-lg p-2"
							onClick={() => handleViewModeChange("categories")}
						>
							<LayoutGrid className="w-4 h-4" />
							POR CATEGORIA
						</Button>
					</div>
				)}
			</div>

			{showToggle && viewMode === "categories" ? (
				selectedCategory === null ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 short:gap-2">
						{categories.map((category) => {
							const categoryPrizes = groupedPrizes[category];
							const coverImage = categoryPrizes.find((p) => p.imagemCapaUrl)?.imagemCapaUrl ?? null;
							const itemCount = categoryPrizes.length;
							const selectedInCategory = categoryPrizes.reduce((sum, prize) => sum + (quantityByPrizeId.get(prize.id) ?? 0), 0);
							return (
								<button
									key={category}
									type="button"
									onClick={() => setSelectedCategory(category)}
									className={cn(
										"flex flex-col rounded-2xl short:rounded-xl border overflow-hidden transition-all text-left hover:border-brand hover:shadow-sm cursor-pointer bg-card",
										selectedInCategory > 0 ? "border-brand" : "border-brand/20",
									)}
								>
									<div className="relative w-full aspect-[16/9] bg-muted">
										{coverImage ? (
											<Image src={coverImage} alt={category} fill className="object-cover" />
										) : (
											<div className="flex h-full w-full items-center justify-center bg-brand/10 text-brand">
												<Gift className="w-10 h-10 short:w-6 short:h-6" />
											</div>
										)}
									</div>
									<div className="p-4 short:p-2 flex items-center justify-between gap-2">
										<h3 className="font-bold text-sm short:text-xs tracking-tight">{category}</h3>
										<div className="flex items-center gap-1.5">
											{selectedInCategory > 0 && (
												<span className="text-[0.65rem] short:text-[0.6rem] font-bold bg-brand text-brand-foreground rounded-full px-2 py-0.5">
													{selectedInCategory} na cesta
												</span>
											)}
											<span className="text-[0.65rem] short:text-[0.6rem] font-bold bg-brand/10 text-brand rounded-full px-2 py-0.5">
												{itemCount} {itemCount === 1 ? "item" : "itens"}
											</span>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				) : (
					<div className="space-y-4 short:space-y-2 animate-in fade-in slide-in-from-right-4">
						<button
							type="button"
							onClick={() => setSelectedCategory(null)}
							className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
						>
							<ArrowLeft className="w-4 h-4" />
							<span className="uppercase tracking-tight">{selectedCategory}</span>
						</button>
						<div className="flex flex-col gap-2 short:gap-1.5">{groupedPrizes[selectedCategory].map(renderPrizeCard)}</div>
					</div>
				)
			) : (
				<div className="flex flex-col gap-2 short:gap-1.5">{sortedPrizes.map(renderPrizeCard)}</div>
			)}

			{/* Rodapé fixo da cesta: o totem pode ter uma lista longa e o CONTINUAR precisa estar sempre à mão. */}
			<div className="sticky bottom-0 z-10 -mx-2 px-2 pt-2 pb-1 bg-gradient-to-t from-card via-card to-transparent">
				<div className="flex items-center justify-between gap-3 short:gap-2 rounded-2xl short:rounded-xl border border-brand/20 bg-card shadow-md p-3 short:p-2">
					<div className="flex flex-col min-w-0">
						<span className="text-[0.65rem] short:text-[0.6rem] font-black uppercase tracking-widest text-muted-foreground">
							{hasSelection ? `${selectedUnits} ${selectedUnits === 1 ? "unidade selecionada" : "unidades selecionadas"}` : "Nenhuma recompensa selecionada"}
						</span>
						<span className="font-black text-lg short:text-base text-brand leading-tight">{formatCashbackValue(totalDebit, terminology)}</span>
						{hasSelection && (
							<span className="text-[0.65rem] short:text-[0.6rem] text-muted-foreground">Valor comercial: {formatToMoney(totalCommercialValue)}</span>
						)}
					</div>
					<Button
						type="button"
						size="lg"
						disabled={!hasSelection}
						onClick={onContinue}
						className="rounded-2xl short:rounded-lg h-12 short:h-11 px-6 short:px-4 text-base short:text-sm font-bold shadow-sm shrink-0"
					>
						CONTINUAR
						<ArrowRight className="ml-2 w-5 h-5 short:w-4 short:h-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}
