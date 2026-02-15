"use client";

import { cn } from "@/lib/utils";
import type { TStepDefinition } from "../types";

type StepProgressHeaderProps = {
	steps: readonly TStepDefinition[];
	currentStep: number;
};

export function StepProgressHeader({ steps, currentStep }: StepProgressHeaderProps) {
	return (
		<div className="flex border-b">
			{steps.map((step) => (
				<div
					key={step.id}
					className={cn(
						"flex-1 flex flex-col lg:flex-row items-center justify-center gap-2 short:gap-0.5 py-4 short:py-1.5 transition-all border-b-4 short:border-b-2",
						currentStep === step.id ? "border-brand text-brand bg-brand/5" : "border-transparent text-muted-foreground",
					)}
				>
					<step.icon className="w-4 h-4 short:w-3 short:h-3" />
					<span className="text-[0.6rem] lg:text-xs short:text-[0.6rem] font-black tracking-widest">{step.label}</span>
				</div>
			))}
		</div>
	);
}
