import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export const NEW_TRANSACTION_STEPS = [
	{ id: 1, label: "Cliente" },
	{ id: 2, label: "Operação" },
	{ id: 3, label: "Detalhes" },
	{ id: 4, label: "Conferir" },
] as const;
export type TNewTransactionStep = (typeof NEW_TRANSACTION_STEPS)[number]["id"];

type NewTransactionStepsProps = {
	current: TNewTransactionStep;
	/** Volta para uma etapa já concluída. Etapas à frente não são clicáveis. */
	onGoTo: (step: TNewTransactionStep) => void;
};
export function NewTransactionSteps({ current, onGoTo }: NewTransactionStepsProps) {
	const currentStep = NEW_TRANSACTION_STEPS.find((step) => step.id === current);
	const nextStep = NEW_TRANSACTION_STEPS.find((step) => step.id === current + 1);
	return (
		<nav aria-label="Etapas da transação" className="w-full">
			{/* Celular: quatro rótulos não cabem; vira "Etapa X de 4" + barra segmentada. */}
			<div className="flex flex-col gap-1.5 sm:hidden">
				<div className="flex items-center justify-between gap-2 text-xs">
					<span className="font-semibold">
						Etapa {current} de {NEW_TRANSACTION_STEPS.length} · {currentStep?.label}
					</span>
					{nextStep ? <span className="text-muted-foreground">Próxima: {nextStep.label.toLowerCase()}</span> : null}
				</div>
				<div className="grid grid-cols-4 gap-1">
					{NEW_TRANSACTION_STEPS.map((step) => (
						<span key={step.id} className={cn("h-1 rounded-full", step.id < current ? "bg-primary" : step.id === current ? "bg-brand" : "bg-muted")} />
					))}
				</div>
			</div>

			<ol className="hidden grid-cols-4 gap-2 sm:grid">
				{NEW_TRANSACTION_STEPS.map((step) => {
					const isDone = step.id < current;
					const isCurrent = step.id === current;
					return (
						<li key={step.id} className="flex min-w-0 items-center gap-2" aria-current={isCurrent ? "step" : undefined}>
							<button
								type="button"
								disabled={!isDone}
								onClick={() => onGoTo(step.id)}
								className={cn(
									"flex min-w-0 items-center gap-2 rounded-full text-[0.8rem] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
									isDone && "cursor-pointer hover:underline",
								)}
							>
								<span
									className={cn(
										"flex size-5.5 min-w-5.5 items-center justify-center rounded-full text-xs font-bold",
										isDone && "bg-primary text-primary-foreground",
										isCurrent && "bg-brand text-brand-foreground",
										!isDone && !isCurrent && "border border-border text-muted-foreground",
									)}
								>
									{isDone ? <Check className="size-3" strokeWidth={3} /> : step.id}
								</span>
								<span className={cn("truncate", isCurrent ? "font-semibold" : isDone ? "text-foreground/80" : "text-muted-foreground")}>{step.label}</span>
							</button>
							{step.id < NEW_TRANSACTION_STEPS.length ? <span className={cn("h-px flex-1", isDone ? "bg-primary" : "bg-border")} /> : null}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
