import { cn } from "@/lib/utils";

type ProductStockChipProps = {
	quantity: number;
	className?: string;
};

/**
 * Saldo do produto na lista e na grade do PDV, com um rótulo só ("Esgotado") para os dois modos.
 *
 * Só dois estados têm cor, e as duas vêm dos pares suaves da paleta (DESIGN.md §2): esgotado em
 * `destructive`, saldo baixo em `warning`. Saldo normal é texto mudo, porque "está tudo bem" não é
 * informação que precise de cor. No celular, só o esgotado aparece: é o único saldo que muda a
 * decisão de quem está no balcão com o cliente esperando.
 */
export default function ProductStockChip({ quantity, className }: ProductStockChipProps) {
	if (quantity <= 0) {
		return (
			<span
				className={cn(
					"inline-flex shrink-0 items-center rounded-full bg-destructive-surface px-1.5 py-0.5 text-micro text-destructive-surface-foreground",
					className,
				)}
			>
				Esgotado
			</span>
		);
	}
	if (quantity <= 10) {
		return (
			<span
				className={cn(
					"hidden shrink-0 items-center rounded-full bg-warning-surface px-1.5 py-0.5 text-micro text-warning-surface-foreground sm:inline-flex",
					className,
				)}
			>
				{quantity} un.
			</span>
		);
	}
	return <span className={cn("hidden shrink-0 text-micro text-muted-foreground sm:inline", className)}>{quantity} un.</span>;
}
