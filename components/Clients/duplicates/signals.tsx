"use client";

import { Chip } from "@/components/ui/chip";
import type { TClientDuplicateSignalTypeEnum } from "@/schemas/enums";
import { cn } from "@/lib/utils";
import { CreditCardIcon, InstagramIcon, type LucideIcon, MailIcon, PhoneIcon, TriangleAlertIcon } from "lucide-react";

type TDuplicateSignal = {
	/** Texto completo, usado onde há espaço para o valor ao lado. */
	label: string;
	/** Texto curto, usado nas listas densas. */
	short: string;
	icon: LucideIcon;
};

const DUPLICATE_SIGNALS: Record<TClientDuplicateSignalTypeEnum, TDuplicateSignal> = {
	TELEFONE: { label: "Mesmo telefone", short: "Telefone", icon: PhoneIcon },
	EMAIL: { label: "Mesmo e-mail", short: "E-mail", icon: MailIcon },
	CPF_CNPJ: { label: "Mesmo CPF/CNPJ", short: "CPF/CNPJ", icon: CreditCardIcon },
	INSTAGRAM_USERNAME: { label: "Mesmo @ do Instagram", short: "Instagram", icon: InstagramIcon },
	NOME_SEMELHANTE: { label: "Nome semelhante", short: "Nome semelhante", icon: TriangleAlertIcon },
};

/**
 * Ordem de valor do sinal para o varejo: CPF/CNPJ quase nunca é coincidência,
 * telefone raramente, e-mail com frequência (famílias e lojas compartilham) e
 * Instagram é o mais fraco. Tudo que ordena ou agrupa sinais usa esta lista.
 */
export const DUPLICATE_SIGNAL_ORDER: TClientDuplicateSignalTypeEnum[] = ["CPF_CNPJ", "TELEFONE", "EMAIL", "INSTAGRAM_USERNAME", "NOME_SEMELHANTE"];

export function duplicateSignalPriority(tipo: string): number {
	const index = DUPLICATE_SIGNAL_ORDER.indexOf(tipo as TClientDuplicateSignalTypeEnum);
	return index === -1 ? DUPLICATE_SIGNAL_ORDER.length : index;
}

/** Ordena os motivos do par do sinal mais forte para o mais fraco. */
export function sortDuplicateReasons<T extends { tipo: string }>(reasons: T[]): T[] {
	return [...reasons].sort((a, b) => duplicateSignalPriority(a.tipo) - duplicateSignalPriority(b.tipo));
}

export function resolveDuplicateSignal(tipo: string): TDuplicateSignal {
	return DUPLICATE_SIGNALS[tipo as TClientDuplicateSignalTypeEnum] ?? { label: tipo, short: tipo, icon: TriangleAlertIcon };
}

/**
 * Wash âmbar do sinal de duplicidade. Uma duplicidade pede atenção sem ser erro,
 * então usa a marca (ouro comercial) em vez do destrutivo — e o mesmo tom no pill,
 * na fila e no diálogo, para que o sinal seja reconhecível de relance.
 */
export const DUPLICATE_SIGNAL_CLASS = "border-brand/35 bg-brand/15 text-foreground";

type DuplicateSignalChipProps = {
	tipo: string;
	/** Valor que casou entre os dois cadastros. */
	valor?: string;
	/** `short` prefixa o valor com o rótulo curto; `full` usa a frase completa. */
	labelStyle?: "full" | "short";
	size?: "xs" | "sm";
	className?: string;
};

export function DuplicateSignalChip({ tipo, valor, labelStyle = "full", size = "sm", className }: DuplicateSignalChipProps) {
	const signal = resolveDuplicateSignal(tipo);
	const SignalIcon = signal.icon;
	const prefix = labelStyle === "short" ? signal.short : signal.label;
	return (
		<Chip.Root size={size} shape="pill" className={cn(DUPLICATE_SIGNAL_CLASS, className)}>
			<Chip.Icon>
				<SignalIcon />
			</Chip.Icon>
			<Chip.Label weight="semibold">{valor ? `${prefix}: ${valor}` : signal.short}</Chip.Label>
		</Chip.Root>
	);
}
