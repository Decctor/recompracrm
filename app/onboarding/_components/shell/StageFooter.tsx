import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

type StageFooterProps = {
	canGoBack: boolean;
	onBack: () => void;
	/** Rótulo da ação secundária. Null = etapa não adiável. */
	deferLabel: string | null;
	onDefer?: () => void;
	/**
	 * Rótulo da ação principal. Null = a ação principal está dentro da etapa (ex.: "Conectar com a
	 * Meta"), e o rodapé oferece só voltar e adiar, sem um "continuar" competindo com ela.
	 */
	continueLabel?: string | null;
	onContinue: () => void;
	isLoading: boolean;
};

export function StageFooter({ canGoBack, onBack, deferLabel, onDefer, continueLabel = "Continuar", onContinue, isLoading }: StageFooterProps) {
	return (
		<div className="sticky bottom-0 -mx-6 mt-auto grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-t border-border bg-background px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:mx-0 lg:grid-cols-[auto_1fr_auto] lg:px-0 lg:pt-6">
			<Button type="button" variant="ghost" onClick={onBack} disabled={!canGoBack || isLoading} className="order-1 min-h-11 gap-1.5">
				<ArrowLeft className="size-4" />
				Voltar
			</Button>
			{continueLabel === null ? (
				<span className="hidden lg:order-2 lg:block" />
			) : deferLabel && onDefer ? (
				<Button
					type="button"
					variant="link"
					onClick={onDefer}
					disabled={isLoading}
					className="order-3 col-span-2 min-h-11 justify-self-center lg:order-2 lg:col-span-1 lg:justify-self-end"
				>
					{deferLabel}
				</Button>
			) : (
				<span className="hidden lg:order-2 lg:block" />
			)}
			{continueLabel === null ? (
				deferLabel && onDefer ? (
					<Button
						type="button"
						variant="outline"
						onClick={onDefer}
						disabled={isLoading}
						className="order-2 h-auto min-h-11 max-w-full justify-self-end py-2 whitespace-normal lg:order-3"
					>
						{isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
						{deferLabel}
					</Button>
				) : null
			) : (
				<Button
					type="button"
					size="lg"
					onClick={onContinue}
					disabled={isLoading}
					className="order-2 h-auto min-h-11 max-w-full gap-1.5 justify-self-end py-2 whitespace-normal lg:order-3"
				>
					{isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
					{continueLabel}
					{!isLoading ? <ArrowRight className="size-4" /> : null}
				</Button>
			)}
		</div>
	);
}
