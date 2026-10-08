import { POS_PRODUCT_KIND_LABELS, type TPOSProductKind } from "@/lib/pos/product-display";
import { cn } from "@/lib/utils";
import { PackagePlus } from "lucide-react";

type ProductKindHintProps = {
	kind: TPOSProductKind;
	className?: string;
};

/**
 * Sinal de que o produto tem variantes ou adicionais (o toque abre o builder em vez de adicionar).
 *
 * É metadado, não ação nem estado, então não leva cor de marca: numa gelateria quase todo produto
 * tem adicional, e um selo saturado em três de cada quatro linhas vira ruído. No celular fica só o
 * ícone (a largura da linha é o que falta), com o texto no `title` e para leitores de tela; a
 * partir de `sm` o texto aparece ao lado.
 */
export default function ProductKindHint({ kind, className }: ProductKindHintProps) {
	if (kind === "SIMPLES") return null;
	const label = POS_PRODUCT_KIND_LABELS[kind];
	return (
		<span
			title={label}
			className={cn(
				"inline-flex shrink-0 items-center gap-1 text-micro text-muted-foreground sm:rounded-full sm:border sm:border-border sm:px-1.5 sm:py-0.5",
				className,
			)}
		>
			<PackagePlus aria-hidden className="size-3.5 sm:size-3" />
			<span className="sr-only sm:not-sr-only">{label}</span>
		</span>
	);
}
