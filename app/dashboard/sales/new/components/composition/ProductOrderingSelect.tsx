"use client";

import { SelectGroup, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { POS_PRODUCT_ORDERING_LABELS, POSProductOrderingEnum, type TPOSProductOrderingEnum } from "@/schemas/enums";
import { ArrowDownWideNarrow } from "lucide-react";

type ProductOrderingSelectProps = {
	value: TPOSProductOrderingEnum;
	onChange: (ordering: TPOSProductOrderingEnum) => void;
	disabled?: boolean;
};

/**
 * Ordenação da grade do PDV. Substitui a faixa de "mais pedidos": o que a loja mais gira já vem na
 * frente da própria grade, e o operador troca o critério quando o atendimento pede outro.
 */
export default function ProductOrderingSelect({ value, onChange, disabled }: ProductOrderingSelectProps) {
	return (
		<Select
			items={[...POSProductOrderingEnum.options.map((option) => ({ value: option, label: POS_PRODUCT_ORDERING_LABELS[option] }))]}
			value={value}
			onValueChange={(selected) => {
				if (selected === null) return;
				onChange(selected as TPOSProductOrderingEnum);
			}}
			disabled={disabled}
		>
			<SelectTrigger
				aria-label="Ordenar produtos"
				title="Ordenar produtos"
				className="h-11 shrink-0 rounded-xl border-border bg-card px-3 text-xs font-semibold shadow-2xs max-sm:w-11 sm:h-9 max-sm:justify-center max-sm:px-0 max-sm:[&>svg:last-child]:hidden max-sm:[&>[data-slot=select-value]]:hidden!"
			>
				<ArrowDownWideNarrow className="h-4 w-4 text-muted-foreground" />
				{/* No celular só o ícone (valor e chevron somem pelo `max-sm` do trigger): o critério
				    ativo continua marcado na lista ao abrir. */}
				<SelectValue />
			</SelectTrigger>
			<SelectContent align="end">
				<SelectGroup>
					{POSProductOrderingEnum.options.map((option) => (
						<SelectItem key={option} value={option} className="text-xs font-semibold">
							{POS_PRODUCT_ORDERING_LABELS[option]}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
