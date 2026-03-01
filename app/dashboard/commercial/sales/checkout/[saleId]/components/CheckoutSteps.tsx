import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

type CheckoutStepsProps = {
	currentStep: number;
	stepLabels: string[];
};

export default function CheckoutSteps({ currentStep, stepLabels }: CheckoutStepsProps) {
	return (
		<div className="flex items-center justify-center gap-2">
			{stepLabels.map((label, index) => {
				const stepNumber = index + 1;
				const isActive = stepNumber === currentStep;
				const isCompleted = stepNumber < currentStep;

				return (
					<div key={label} className="flex items-center gap-2">
						{index > 0 && <div className={cn("w-8 h-0.5", isCompleted ? "bg-primary" : "bg-border")} />}

						<div className="flex items-center gap-2">
							<div
								className={cn(
									"w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
									isActive && "bg-primary text-primary-foreground",
									isCompleted && "bg-primary text-primary-foreground",
									!isActive && !isCompleted && "bg-secondary text-muted-foreground",
								)}
							>
								{isCompleted ? <Check className="w-4 h-4" /> : stepNumber}
							</div>
							<span
								className={cn(
									"text-sm font-medium hidden sm:block",
									isActive && "text-foreground",
									!isActive && "text-muted-foreground",
								)}
							>
								{label}
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
