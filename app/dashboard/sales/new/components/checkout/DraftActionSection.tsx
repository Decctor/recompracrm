import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";

// Ação secundária demovida de propósito: com a mesma largura/altura do CTA primário, o operador
// criava orçamentos por engano no balcão. Fica fora do dock, no fim do scroll, para que o CTA de
// finalizar não tenha vizinho de toque.
type DraftActionSectionProps = {
	saleState: TUseSaleState;
	onCreateDraft: () => void;
	isCreatingDraft?: boolean;
	isFinalizingSale?: boolean;
};

export default function DraftActionSection({ saleState, onCreateDraft, isCreatingDraft, isFinalizingSale }: DraftActionSectionProps) {
	return (
		<div className="flex justify-center">
			<Button
				variant="ghost"
				size="sm"
				className={cn("px-4 text-muted-foreground", !saleState.isReadyForDraft && "opacity-50")}
				onClick={onCreateDraft}
				disabled={!saleState.isReadyForDraft || isCreatingDraft || isFinalizingSale}
			>
				{isCreatingDraft ? "CRIANDO ORÇAMENTO..." : "CRIAR COMO ORÇAMENTO"}
			</Button>
		</div>
	);
}
