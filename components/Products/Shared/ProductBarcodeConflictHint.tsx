"use client";

import { useProductBarcodeUsage, type TProductBarcodeUsage } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import { TriangleAlert } from "lucide-react";

// Aviso (não bloqueio) de código de barras repetido na organização. O PDV resolve a duplicidade
// pedindo ao operador que escolha o item a cada leitura; avisar aqui evita que isso vire rotina.

type ProductBarcodeConflictHintProps = {
	code: string | null | undefined;
	excludeProductId?: string | null;
	excludeVariantId?: string | null;
	/** Ícone com tooltip, para caber numa célula da planilha de variantes. */
	compact?: boolean;
	className?: string;
};

function describeUsage(usage: TProductBarcodeUsage) {
	const name = usage.varianteNome ? `${usage.produtoNome} - ${usage.varianteNome}` : usage.produtoNome;
	return usage.ativo === false ? `${name} (inativo)` : name;
}

export function formatBarcodeConflictMessage(usages: TProductBarcodeUsage[]) {
	const names = usages.slice(0, 3).map(describeUsage);
	const rest = usages.length - names.length;
	return `Código de barras já usado em: ${names.join(", ")}${rest > 0 ? ` e mais ${rest}` : ""}. No PDV, a leitura vai pedir para escolher entre eles.`;
}

export default function ProductBarcodeConflictHint({ code, excludeProductId, excludeVariantId, compact = false, className }: ProductBarcodeConflictHintProps) {
	const { data: usages } = useProductBarcodeUsage({ code, excludeProductId, excludeVariantId });
	if (!code?.trim() || !usages || usages.length === 0) return null;
	const message = formatBarcodeConflictMessage(usages);

	if (compact) {
		return (
			<span className={cn("inline-flex shrink-0 items-center text-warning-surface-foreground", className)} title={message} role="img" aria-label={message}>
				<TriangleAlert className="size-3.5" />
			</span>
		);
	}
	return (
		<p className={cn("flex items-start gap-1 text-[0.6rem] tracking-tight text-warning-surface-foreground", className)}>
			<TriangleAlert className="mt-px size-3 shrink-0" />
			<span>{message}</span>
		</p>
	);
}
