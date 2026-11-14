"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { formatQuantity } from "../helpers/format";
import { BUILDER_STAGES, STAGE_ORDER, type TBuilderStageId } from "../helpers/stages";
import { useBuilder } from "./builder-provider";

/** Três etapas lado a lado; o subtítulo resume o que já foi escolhido em cada uma. */
export default function BuilderStepper() {
	const { stage, goToStage, isStageLocked, selection, recipe, plan, manualInputsCount, manualOutputsCount } = useBuilder();
	const currentIdx = STAGE_ORDER.indexOf(stage);

	function getSubLabel(stageId: TBuilderStageId, placeholder: string) {
		if (stageId === "recipe") {
			if (selection?.kind === "manual") return "Produção manual";
			if (selection?.kind === "recipe") return recipe?.titulo ?? selection.preview?.titulo ?? "Carregando…";
			return placeholder;
		}
		if (stageId === "quantities") {
			if (selection?.kind === "manual") return `${manualInputsCount} entradas · ${manualOutputsCount} saídas`;
			if (plan && !plan.missingOutput) {
				const saldo = plan.escala.quantidadeSaldo;
				return `${formatQuantity(plan.escala.quantidadeSaida, plan.unit)}${saldo > 0 ? ` · saldo ${formatQuantity(saldo, plan.unit)}` : ""}`;
			}
			return placeholder;
		}
		return placeholder;
	}

	return (
		<nav aria-label="Etapas da produção" className="w-full lg:ml-auto lg:w-auto lg:min-w-[480px] lg:max-w-[680px] lg:flex-1">
			<ol className="grid grid-cols-3 gap-1.5">
				{BUILDER_STAGES.map((item, idx) => {
					const isActive = item.id === stage;
					const isDone = idx < currentIdx;
					const locked = isStageLocked(item.id);
					return (
						<li key={item.id} className="min-w-0">
							<button
								type="button"
								onClick={() => goToStage(item.id)}
								disabled={locked}
								aria-current={isActive ? "step" : undefined}
								className={cn(
									"flex min-h-14 w-full items-center gap-2.5 rounded-[14px] border px-3 py-2 text-left transition-colors",
									isActive ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/40",
									locked && "cursor-not-allowed opacity-50 hover:bg-background",
								)}
							>
								<span
									className={cn(
										"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.8rem] font-bold",
										isActive && "bg-primary text-primary-foreground",
										!isActive && isDone && "bg-brand text-brand-foreground",
										!isActive && !isDone && "bg-muted text-muted-foreground",
									)}
								>
									{isDone && !isActive ? <Check className="h-3.5 w-3.5" /> : idx + 1}
								</span>
								<span className="flex min-w-0 flex-col gap-px">
									<span className={cn("truncate text-[0.65rem] font-bold uppercase tracking-wider", isActive ? "text-primary" : "text-muted-foreground")}>
										{item.label}
									</span>
									<span className="truncate text-[0.8rem] font-semibold">{getSubLabel(item.id, item.placeholder)}</span>
								</span>
							</button>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
