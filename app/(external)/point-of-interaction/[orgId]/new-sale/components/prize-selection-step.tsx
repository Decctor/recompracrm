"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Gift, LayoutGrid, List } from "lucide-react";
import Image from "next/image";
import React from "react";
import type { TPrize } from "../../_shared/types";
import { PrizeCard } from "./prize-card";

const FALLBACK_GROUP = "Outros";
const SHOW_TOGGLE_THRESHOLD = 4;

type PrizeSelectionStepProps = {
	prizes: TPrize[];
	availableBalance: number;
	onSelectPrize: (prize: TPrize) => void;
};

export function PrizeSelectionStep({ prizes, availableBalance, onSelectPrize }: PrizeSelectionStepProps) {
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

	const showToggle = prizes.length > SHOW_TOGGLE_THRESHOLD || categories.length > 1;

	const handleViewModeChange = (mode: "categories" | "list") => {
		setViewMode(mode);
		setSelectedCategory(null);
	};

	return (
		<div className="space-y-6 short:space-y-2 animate-in fade-in slide-in-from-bottom-4">
			<div className="text-center space-y-2 short:space-y-0.5">
				<h2 className="text-xl short:text-lg font-black uppercase tracking-tight">Escolha a recompensa</h2>
				<p className="text-muted-foreground short:text-xs">
					Saldo disponível: <span className="font-black text-green-600">{availableBalance} créditos</span>
				</p>
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
							return (
								<button
									key={category}
									type="button"
									onClick={() => setSelectedCategory(category)}
									className="flex flex-col rounded-2xl short:rounded-xl border-2 border-brand/20 overflow-hidden transition-all text-left hover:border-brand hover:shadow-lg cursor-pointer bg-card"
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
										<h3 className="font-black text-sm short:text-xs uppercase tracking-tight">{category}</h3>
										<span className="text-[0.65rem] short:text-[0.6rem] font-bold bg-brand/10 text-brand rounded-full px-2 py-0.5">
											{itemCount} {itemCount === 1 ? "item" : "itens"}
										</span>
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
						<div className="flex flex-col gap-2 short:gap-1.5">
							{groupedPrizes[selectedCategory].map((prize) => (
								<PrizeCard key={prize.id} prize={prize} isDisabled={availableBalance < prize.valor} onSelect={() => onSelectPrize(prize)} />
							))}
						</div>
					</div>
				)
			) : (
				<div className="flex flex-col gap-2 short:gap-1.5">
					{sortedPrizes.map((prize) => (
						<PrizeCard key={prize.id} prize={prize} isDisabled={availableBalance < prize.valor} onSelect={() => onSelectPrize(prize)} />
					))}
				</div>
			)}
		</div>
	);
}
