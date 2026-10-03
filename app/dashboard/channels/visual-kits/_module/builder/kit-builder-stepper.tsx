"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useKitBuilder } from "./kit-builder-context";
import { KIT_STAGE_IDS, KIT_STAGES, type TKitStageId } from "./stages";

/**
 * Etapas do construtor. Sem rascunho salvo só se volta (fluxo linear); com o kit já criado, todas as
 * etapas ficam livres — os dados já existem e salvam sozinhos.
 */
export default function KitBuilderStepper() {
	const { kitId, stage, setStage, state } = useKitBuilder();
	const currentIndex = KIT_STAGE_IDS.indexOf(stage);
	const canNavigateFreely = !!kitId && state.pecas.length > 0;

	function handleClick(target: TKitStageId, index: number) {
		if (index <= currentIndex || canNavigateFreely) setStage(target);
	}

	return (
		<nav aria-label="Progresso do kit" className="w-full">
			<ol className="flex w-full items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
				{KIT_STAGE_IDS.map((stageId, index) => {
					const meta = KIT_STAGES[stageId];
					const Icon = meta.icone;
					const isActive = stageId === stage;
					const isComplete = index < currentIndex;
					const isClickable = index <= currentIndex || canNavigateFreely;
					return (
						<li key={stageId} className="flex min-w-[120px] flex-1 items-center">
							<button
								type="button"
								onClick={() => handleClick(stageId, index)}
								disabled={!isClickable}
								className={cn(
									"flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
									isActive && "bg-brand/10",
									!isActive && isClickable && "hover:bg-brand/5",
									!isClickable && "cursor-not-allowed opacity-60",
								)}
							>
								<span
									className={cn(
										"flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
										isActive && "border-brand bg-brand text-brand-foreground",
										isComplete && "border-brand bg-brand/20 text-brand",
										!isActive && !isComplete && "border-brand/20 text-brand/80",
									)}
								>
									{isComplete ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
								</span>
								<span className="flex min-w-0 flex-col">
									<span className={cn("truncate text-[10px] font-semibold uppercase tracking-wide", isActive ? "text-foreground" : "text-muted-foreground")}>
										Etapa {index + 1}
									</span>
									<span className={cn("truncate text-xs font-medium", isActive ? "text-foreground" : "text-foreground/70")}>{meta.label}</span>
								</span>
							</button>
							{index < KIT_STAGE_IDS.length - 1 ? (
								<span aria-hidden className={cn("h-px w-3 shrink-0", isComplete ? "bg-primary/40" : "bg-primary/15")} />
							) : null}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
