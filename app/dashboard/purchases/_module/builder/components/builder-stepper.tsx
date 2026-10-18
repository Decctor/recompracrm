"use client";

import { cn } from "@/lib/utils";
import { Check, CircleAlert, Sparkles } from "lucide-react";
import { BUILDER_STAGES, STAGE_ORDER, type TBuilderStageId } from "../helpers/stages";
import { useBuilder } from "./builder-provider";
import { TONE_CLASSES, type TTone } from "./builder-ui";
import { useBuilderSummary } from "./use-builder-summary";

type TStageNote = { tone: TTone; icon: typeof Check; text: string } | null;

/**
 * Horizontal stepper. Free navigation once the origin is decided: the badges say where something
 * is still pending, so the operator can jump straight there.
 */
export default function BuilderStepper() {
	const { currentStage, setCurrentStage, origin, readStatus } = useBuilder();
	const summary = useBuilderSummary();
	const currentIdx = STAGE_ORDER.indexOf(currentStage);
	const originDecided = origin === "manual" || (origin === "document" && readStatus === "done");

	function getNote(stageId: TBuilderStageId, idx: number): TStageNote {
		if (stageId === "items" && summary.pendingLines.length > 0) return { tone: "warn", icon: CircleAlert, text: String(summary.pendingLines.length) };
		if (stageId === "finance" && summary.fromDocument && (!summary.transactionsBalanced || !summary.totalsMatch))
			return { tone: "warn", icon: CircleAlert, text: "!" };
		if (summary.fromDocument && idx > currentIdx && (stageId === "supplier" || stageId === "finance"))
			return { tone: "info", icon: Sparkles, text: "" };
		return null;
	}

	return (
		<nav aria-label="Progresso da compra" className="w-full">
			<ol className="flex w-full items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
				{STAGE_ORDER.map((stageId, idx) => {
					const stage = BUILDER_STAGES[stageId];
					const Icon = stage.icon;
					const isActive = stageId === currentStage;
					const note = getNote(stageId, idx);
					const isComplete = idx < currentIdx && note?.tone !== "warn";
					const isClickable = idx <= currentIdx || originDecided;

					return (
						<li key={stageId} className="flex min-w-[150px] flex-1 items-center">
							<button
								type="button"
								onClick={() => isClickable && setCurrentStage(stageId)}
								disabled={!isClickable}
								className={cn(
									"group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
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
										!isActive && !isComplete && "border-brand/25 text-brand/80",
									)}
								>
									{isComplete ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
								</span>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Etapa {idx + 1}</span>
									<span className={cn("truncate text-xs font-medium", isActive ? "text-foreground" : "text-foreground/70")}>{stage.label}</span>
								</span>
								{note ? (
									<span className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold", TONE_CLASSES[note.tone])}>
										<note.icon className="h-2.5 w-2.5" />
										{note.text}
									</span>
								) : null}
							</button>
							{idx < STAGE_ORDER.length - 1 ? <span aria-hidden className="h-px w-3 shrink-0 bg-primary/15" /> : null}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
