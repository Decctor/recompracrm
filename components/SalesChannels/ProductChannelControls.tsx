"use client";

import type { TProductChannelAvailabilityChoice } from "@/lib/products/product-registry-state";
import { cn } from "@/lib/utils";

/**
 * Controles de um nó da matriz canal × (produto | variante), compartilhados pela seção de preços
 * do produto já cadastrado e pelo bloco de canais do cadastro: o override precisa se comportar
 * igual nas duas telas, senão o que a criação mostra a edição desmente depois.
 */

// Pílula que cicla herdar → disponível → indisponível → herdar. `inheritedVisible` é o que "herdar"
// significa neste nó: o modo do canal no nível do produto, o próprio produto no nível da variante.
export function AvailabilityCycleButton({
	choice,
	inheritedVisible,
	variantLevel = false,
	onCycle,
}: {
	choice: TProductChannelAvailabilityChoice;
	inheritedVisible: boolean;
	variantLevel?: boolean;
	onCycle: () => void;
}) {
	const label =
		choice === true
			? "DISPONÍVEL"
			: choice === false
				? "INDISPONÍVEL"
				: variantLevel
					? "HERDAR DO PRODUTO"
					: `HERDAR (${inheritedVisible ? "VISÍVEL" : "OCULTO"})`;
	return (
		<button
			type="button"
			onClick={onCycle}
			className={cn(
				"rounded-full px-2.5 py-1 text-[0.6rem] font-semibold tracking-wide transition-colors",
				choice === true && "bg-emerald-500/15 text-emerald-600",
				choice === false && "bg-red-500/15 text-red-600",
				choice === null && "bg-primary/10 text-primary/70",
			)}
		>
			{label}
		</button>
	);
}

export function cycleAvailabilityChoice(current: TProductChannelAvailabilityChoice): TProductChannelAvailabilityChoice {
	// herdar → disponível → indisponível → herdar
	return current === null ? true : current === true ? false : null;
}

// Campo de preço do canal: vazio = herda o preço base (mostrado no placeholder, já refletindo o
// rascunho aberto na tela — o usuário vê o efeito antes de aplicar).
export function ChannelPriceInput({
	value,
	basePrice,
	onChange,
}: {
	value: number | null;
	basePrice: number | null;
	onChange: (value: number | null) => void;
}) {
	return (
		<input
			type="number"
			min={0}
			step="0.01"
			inputMode="decimal"
			value={value ?? ""}
			placeholder={basePrice != null ? `R$ ${basePrice.toFixed(2)}` : "R$ —"}
			onChange={(event) => {
				const raw = event.target.value;
				onChange(raw === "" ? null : Math.max(0, Number(raw)));
			}}
			className="w-24 rounded-md border border-border bg-transparent px-2 py-1 text-right text-[0.65rem] tabular-nums outline-none placeholder:text-primary/40 focus:border-primary/40"
		/>
	);
}
