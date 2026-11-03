import { cn } from "@/lib/utils";
import { Loader2, Weight } from "lucide-react";

type ProductWeighButtonProps = {
	productName: string;
	isWeighing: boolean;
	onWeigh: () => void;
	className?: string;
};

/**
 * Pesar na balança do caixa: o produto já está no prato, o toque lê o peso estável e lança a linha.
 * Azul cheio porque é a ação do card para quem vende por peso; 36px para o dedo no balcão.
 */
export default function ProductWeighButton({ productName, isWeighing, onWeigh, className }: ProductWeighButtonProps) {
	return (
		<button
			type="button"
			onClick={onWeigh}
			disabled={isWeighing}
			aria-busy={isWeighing}
			aria-label={isWeighing ? `Pesando ${productName}` : `Pesar ${productName} na balança`}
			title="Pesar na balança"
			className={cn(
				"flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md",
				"transition-[background-color,transform] duration-150 hover:bg-primary/90 motion-safe:active:scale-95",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
				"disabled:cursor-wait disabled:opacity-90",
				className,
			)}
		>
			{isWeighing ? <Loader2 className="size-4 animate-spin" /> : <Weight className="size-4" />}
		</button>
	);
}
