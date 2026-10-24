"use client";

import { cn } from "@/lib/utils";
import { type ReactNode, useState } from "react";
import { PhaseBadge, Stage } from "./primitives";

type TScoring = "integracao" | "poi";

const OPTIONS: { id: TScoring; label: string }[] = [
	{ id: "integracao", label: "Com integração" },
	{ id: "poi", label: "Pelo Ponto de Interação" },
];

export function ScoringSwitch({ panels }: { panels: Record<TScoring, ReactNode> }) {
	const [scoring, setScoring] = useState<TScoring>("integracao");

	return (
		<>
			<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<PhaseBadge>1</PhaseBadge>
					<h3 className="text-[24px] font-semibold tracking-[-0.02em]">Pontuar</h3>
				</div>
				<div className="inline-flex flex-wrap gap-0.5 rounded-full bg-[#f2f4f4] p-1" role="tablist" aria-label="Como a venda é pontuada">
					{OPTIONS.map((option) => {
						const on = option.id === scoring;
						return (
							<button
								key={option.id}
								type="button"
								role="tab"
								aria-selected={on}
								aria-controls="pontuar-painel"
								onClick={() => setScoring(option.id)}
								className={cn(
									"h-10 cursor-pointer rounded-full border-0 px-[18px] text-[14px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-200",
									on
										? "bg-white text-[#0e1214] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_2px_8px_-2px_rgba(16,24,40,0.1)]"
										: "bg-transparent text-[#5b6a70] hover:text-[#0e1214]",
								)}
							>
								{option.label}
							</button>
						);
					})}
				</div>
			</div>
			<div id="pontuar-painel" role="tabpanel">
				<Stage>{panels[scoring]}</Stage>
			</div>
		</>
	);
}
