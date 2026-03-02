import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";

type ActionsSectionProps = {
	saleState: TUseSaleState;
	onCreateDraft: () => void;
	onFinalizeSale: () => void;
	isCreatingDraft?: boolean;
	isFinalizingSale?: boolean;
};

export default function ActionsSection({ saleState, onCreateDraft, onFinalizeSale, isCreatingDraft, isFinalizingSale }: ActionsSectionProps) {
	return (
		<div className="grid grid-cols-1 gap-2">
			<Button
				variant="ghost"
				className={cn("w-full", !saleState.isReadyForDraft && "opacity-50")}
				onClick={onCreateDraft}
				disabled={!saleState.isReadyForDraft || isCreatingDraft || isFinalizingSale}
			>
				{isCreatingDraft ? "CRIANDO ORÇAMENTO..." : "CRIAR COMO ORÇAMENTO"}
			</Button>
			<Button
				className={cn("w-full", !saleState.isReadyForFinalize && "opacity-50")}
				onClick={onFinalizeSale}
				disabled={!saleState.isReadyForFinalize || isCreatingDraft || isFinalizingSale}
			>
				{isFinalizingSale ? "FINALIZANDO VENDA..." : "FINALIZAR VENDA"}
			</Button>
		</div>
	);
}
